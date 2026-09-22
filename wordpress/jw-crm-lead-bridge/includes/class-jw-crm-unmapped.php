<?php
/**
 * Records forms that fired without a mapping.
 *
 * Without this the plugin is silent about forms nobody listed, which is the
 * failure mode that loses leads: a form added after the mapping was written
 * looks exactly like a form that is working.
 *
 * Counts only, never field values — an unmapped form is by definition one
 * nobody has agreed to store, so keeping its submitted data here would put
 * personal data somewhere no one is looking after it.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class JW_CRM_Unmapped
{
    private const OPTION = 'jw_crm_unmapped_forms';

    private const RETAIN_DAYS = 30;

    /** Guards the option against unbounded growth if a site has many forms. */
    private const MAX_FORMS = 50;

    public static function record(int $formId, string $formTitle): void
    {
        $seen = get_option(self::OPTION, []);

        if (!is_array($seen)) {
            $seen = [];
        }

        $now = time();
        $key = (string) $formId;

        $seen[$key] = [
            'title' => $formTitle,
            'count' => (int) ($seen[$key]['count'] ?? 0) + 1,
            'first' => (int) ($seen[$key]['first'] ?? $now),
            'last'  => $now,
        ];

        update_option(self::OPTION, self::prune($seen), false);
    }

    /**
     * @return array<string, array{title: string, count: int, first: int, last: int}>
     */
    public static function all(): array
    {
        $seen = get_option(self::OPTION, []);

        return is_array($seen) ? self::prune($seen) : [];
    }

    public static function forget(int $formId): void
    {
        $seen = self::all();
        unset($seen[(string) $formId]);

        update_option(self::OPTION, $seen, false);
    }

    public static function clear(): void
    {
        delete_option(self::OPTION);
    }

    /**
     * @param array<string, mixed> $seen
     * @return array<string, array{title: string, count: int, first: int, last: int}>
     */
    private static function prune(array $seen): array
    {
        $cutoff = time() - (self::RETAIN_DAYS * DAY_IN_SECONDS);
        $kept = [];

        foreach ($seen as $key => $row) {
            if (!is_array($row) || (int) ($row['last'] ?? 0) < $cutoff) {
                continue;
            }

            $kept[(string) $key] = [
                'title' => (string) ($row['title'] ?? ''),
                'count' => (int) ($row['count'] ?? 0),
                'first' => (int) ($row['first'] ?? 0),
                'last'  => (int) ($row['last'] ?? 0),
            ];
        }

        uasort($kept, static fn(array $a, array $b): int => $b['last'] <=> $a['last']);

        return array_slice($kept, 0, self::MAX_FORMS, true);
    }
}
