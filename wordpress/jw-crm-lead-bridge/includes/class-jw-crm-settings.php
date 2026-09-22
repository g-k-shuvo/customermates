<?php
/**
 * Settings screen: CRM base URL, signing secret, and the Fluent Forms form id to
 * CRM source slug mapping that decides which forms are forwarded at all.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class JW_CRM_Settings
{
    private const PAGE_SLUG = 'jw-crm-lead-bridge';
    private const NONCE = 'jw_crm_save_settings';

    public static function boot(): void
    {
        add_action('admin_menu', [self::class, 'register_page']);
        add_action('admin_post_jw_crm_save_settings', [self::class, 'handle_save']);
    }

    public static function register_page(): void
    {
        add_options_page(
            __('CRM Lead Bridge', 'jw-crm-lead-bridge'),
            __('CRM Lead Bridge', 'jw-crm-lead-bridge'),
            'manage_options',
            self::PAGE_SLUG,
            [self::class, 'render_page']
        );
    }

    public static function handle_save(): void
    {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('You do not have permission to change these settings.', 'jw-crm-lead-bridge'));
        }

        check_admin_referer(self::NONCE);

        update_option(JW_CRM_OPTION_BASE_URL, esc_url_raw(wp_unslash($_POST['base_url'] ?? '')));
        update_option(JW_CRM_OPTION_ADMIN_EMAIL, sanitize_email(wp_unslash($_POST['admin_email'] ?? '')));

        /**
         * An empty secret field leaves the stored secret alone, so that saving the
         * form mapping does not silently wipe the secret when the field renders blank.
         */
        $secret = trim((string) wp_unslash($_POST['signing_secret'] ?? ''));

        if ($secret !== '') {
            update_option(JW_CRM_OPTION_SECRET, $secret);
        }

        update_option(JW_CRM_OPTION_FORM_MAP, self::parse_form_map((string) wp_unslash($_POST['form_map'] ?? '')));

        wp_safe_redirect(add_query_arg('updated', 'true', admin_url('options-general.php?page=' . self::PAGE_SLUG)));

        exit;
    }

    /**
     * Accepts one "form id = slug" pair per line and drops anything malformed,
     * because a typo should skip one form rather than break every form.
     *
     * @return array<int, string>
     */
    public static function parse_form_map(string $raw): array
    {
        $map = [];

        foreach (preg_split('/\r\n|\r|\n/', $raw) ?: [] as $line) {
            $line = trim($line);

            if ($line === '' || !str_contains($line, '=')) {
                continue;
            }

            [$formId, $slug] = array_map('trim', explode('=', $line, 2));
            $slug = sanitize_title($slug);

            if (!ctype_digit($formId) || $slug === '') {
                continue;
            }

            $map[(int) $formId] = $slug;
        }

        return $map;
    }

    /** @param array<int, string> $map */
    private static function render_form_map(array $map): string
    {
        $lines = [];

        foreach ($map as $formId => $slug) {
            $lines[] = $formId . ' = ' . $slug;
        }

        return implode("\n", $lines);
    }

    public static function render_page(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }

        global $wpdb;

        $map = get_option(JW_CRM_OPTION_FORM_MAP, []);
        $hasSecret = (string) get_option(JW_CRM_OPTION_SECRET, '') !== '';
        $queued = (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . JW_CRM_Queue::table_name());
        ?>
        <div class="wrap">
            <h1><?php esc_html_e('CRM Lead Bridge', 'jw-crm-lead-bridge'); ?></h1>

            <?php if (isset($_GET['updated'])) : ?>
                <div class="notice notice-success is-dismissible">
                    <p><?php esc_html_e('Settings saved.', 'jw-crm-lead-bridge'); ?></p>
                </div>
            <?php endif; ?>

            <p>
                <?php
                printf(
                    /* translators: %d: the number of submissions waiting to be retried. */
                    esc_html__('Submissions waiting to be retried: %d', 'jw-crm-lead-bridge'),
                    $queued
                );
                ?>
            </p>

            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="jw_crm_save_settings" />
                <?php wp_nonce_field(self::NONCE); ?>

                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="jw_crm_base_url"><?php esc_html_e('CRM base URL', 'jw-crm-lead-bridge'); ?></label></th>
                        <td>
                            <input name="base_url" id="jw_crm_base_url" type="url" class="regular-text"
                                   value="<?php echo esc_attr((string) get_option(JW_CRM_OPTION_BASE_URL, '')); ?>" />
                            <p class="description"><?php esc_html_e('No trailing slash, for example https://crm.example.com', 'jw-crm-lead-bridge'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="jw_crm_secret"><?php esc_html_e('Signing secret', 'jw-crm-lead-bridge'); ?></label></th>
                        <td>
                            <input name="signing_secret" id="jw_crm_secret" type="password" class="regular-text"
                                   autocomplete="new-password" placeholder="<?php echo $hasSecret ? esc_attr__('Stored. Leave blank to keep it.', 'jw-crm-lead-bridge') : ''; ?>" />
                            <p class="description"><?php esc_html_e('Shown once by the CRM when the source is created or its secret is rotated.', 'jw-crm-lead-bridge'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="jw_crm_admin_email"><?php esc_html_e('Failure notifications', 'jw-crm-lead-bridge'); ?></label></th>
                        <td>
                            <input name="admin_email" id="jw_crm_admin_email" type="email" class="regular-text"
                                   value="<?php echo esc_attr((string) get_option(JW_CRM_OPTION_ADMIN_EMAIL, get_option('admin_email'))); ?>" />
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="jw_crm_form_map"><?php esc_html_e('Form mapping', 'jw-crm-lead-bridge'); ?></label></th>
                        <td>
                            <textarea name="form_map" id="jw_crm_form_map" rows="8" class="large-text code"><?php echo esc_textarea(self::render_form_map($map)); ?></textarea>
                            <p class="description"><?php esc_html_e('One per line: the Fluent Forms form id, an equals sign, then the CRM source slug. Forms that are not listed are ignored.', 'jw-crm-lead-bridge'); ?></p>
                        </td>
                    </tr>
                </table>

                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }
}
