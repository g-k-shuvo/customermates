<?php
/**
 * Retry queue for submissions the CRM did not accept on the first attempt.
 *
 * Its own table rather than the options table, because a burst of failures during
 * an outage would otherwise bloat an autoloaded option on every page load.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class JW_CRM_Queue
{
    private const TABLE = 'jw_crm_retry_queue';

    /** Minutes to wait before attempt n, indexed from attempt 1. */
    private const BACKOFF_MINUTES = [5, 15, 60, 240, 720, 1440];

    public static function table_name(): string
    {
        global $wpdb;

        return $wpdb->prefix . self::TABLE;
    }

    public static function activate(): void
    {
        global $wpdb;

        $table = self::table_name();
        $charset = $wpdb->get_charset_collate();

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        dbDelta(
            "CREATE TABLE {$table} (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                slug VARCHAR(128) NOT NULL,
                external_id VARCHAR(128) NOT NULL,
                payload LONGTEXT NOT NULL,
                secret VARCHAR(128) NOT NULL DEFAULT '',
                attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
                next_attempt_at DATETIME NOT NULL,
                last_error TEXT NULL,
                created_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY slug_external (slug, external_id),
                KEY next_attempt_at (next_attempt_at)
            ) {$charset};"
        );

        if (!wp_next_scheduled(JW_CRM_RETRY_HOOK)) {
            wp_schedule_event(time() + 300, 'jw_crm_five_minutes', JW_CRM_RETRY_HOOK);
        }
    }

    public static function deactivate(): void
    {
        $timestamp = wp_next_scheduled(JW_CRM_RETRY_HOOK);

        if ($timestamp) {
            wp_unschedule_event($timestamp, JW_CRM_RETRY_HOOK);
        }
    }

    public static function boot(): void
    {
        add_action('plugins_loaded', [self::class, 'maybe_upgrade'], 5);

        add_filter('cron_schedules', static function (array $schedules): array {
            $schedules['jw_crm_five_minutes'] = [
                'interval' => 300,
                'display'  => __('Every five minutes (JW CRM)', 'jw-crm-lead-bridge'),
            ];

            return $schedules;
        });

        add_action(JW_CRM_RETRY_HOOK, [self::class, 'drain']);
    }

    /**
     * dbDelta only runs on activation, so a plugin updated in place would keep a
     * table without the columns a newer version writes. Re-running it when the
     * stored version differs adds them; dbDelta is a no-op when nothing changed.
     */
    public static function maybe_upgrade(): void
    {
        if (get_option(JW_CRM_OPTION_DB_VERSION) === JW_CRM_VERSION) {
            return;
        }

        self::activate();
        update_option(JW_CRM_OPTION_DB_VERSION, JW_CRM_VERSION, false);
    }

    public static function enqueue(string $slug, string $externalId, string $payload, string $secret = ''): void
    {
        global $wpdb;

        $now = current_time('mysql', true);

        /**
         * REPLACE rather than INSERT: the unique key is (slug, external_id), so a second
         * failure for the same submission resets its schedule instead of erroring.
         */
        $wpdb->query(
            $wpdb->prepare(
                'REPLACE INTO ' . self::table_name() .
                ' (slug, external_id, payload, secret, attempts, next_attempt_at, created_at)' .
                ' VALUES (%s, %s, %s, %s, %d, %s, %s)',
                $slug,
                $externalId,
                $payload,
                $secret,
                0,
                self::schedule_for(1),
                $now
            )
        );
    }

    public static function drain(): void
    {
        global $wpdb;

        $table = self::table_name();
        $now = current_time('mysql', true);

        $rows = $wpdb->get_results(
            $wpdb->prepare("SELECT * FROM {$table} WHERE next_attempt_at <= %s ORDER BY next_attempt_at ASC LIMIT 25", $now)
        );

        foreach ($rows as $row) {
            $result = JW_CRM_Client::deliver((string) $row->slug, (string) $row->payload, (string) ($row->secret ?? ''));
            $attempts = (int) $row->attempts + 1;

            if ($result['delivered']) {
                $wpdb->delete($table, ['id' => (int) $row->id], ['%d']);

                continue;
            }

            if ($result['permanent'] || $attempts >= JW_CRM_MAX_ATTEMPTS) {
                self::log_permanent_failure((string) $row->slug, (string) $row->external_id, $result['reason']);
                $wpdb->delete($table, ['id' => (int) $row->id], ['%d']);

                continue;
            }

            $wpdb->update(
                $table,
                [
                    'attempts'        => $attempts,
                    'next_attempt_at' => self::schedule_for($attempts + 1),
                    'last_error'      => $result['reason'],
                ],
                ['id' => (int) $row->id],
                ['%d', '%s', '%s'],
                ['%d']
            );
        }
    }

    public static function log_permanent_failure(string $slug, string $externalId, string $reason): void
    {
        $recipient = (string) get_option(JW_CRM_OPTION_ADMIN_EMAIL, get_option('admin_email'));

        if ($recipient === '') {
            return;
        }

        wp_mail(
            $recipient,
            sprintf(
                /* translators: %s: the CRM web form source slug. */
                __('A form submission could not be delivered to the CRM (%s)', 'jw-crm-lead-bridge'),
                $slug
            ),
            sprintf(
                /* translators: 1: submission id, 2: source slug, 3: the reason delivery failed. */
                __("Submission %1\$s for source %2\$s was not delivered.\n\nReason: %3\$s\n\nThe entry is still in Fluent Forms and can be replayed once the cause is fixed.", 'jw-crm-lead-bridge'),
                $externalId,
                $slug,
                $reason
            )
        );
    }

    private static function schedule_for(int $attempt): string
    {
        $index = max(0, min($attempt - 1, count(self::BACKOFF_MINUTES) - 1));

        return gmdate('Y-m-d H:i:s', time() + (self::BACKOFF_MINUTES[$index] * 60));
    }
}
