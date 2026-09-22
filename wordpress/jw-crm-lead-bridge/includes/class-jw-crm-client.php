<?php
/**
 * Signs a payload and POSTs it to the CRM web form endpoint.
 *
 * The signature format and the response codes are fixed by the CRM:
 * features/webform/ingest/webform-signature.ts and app/api/webforms/[slug]/route.ts.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class JW_CRM_Client
{
    public const SIGNATURE_HEADER = 'x-webform-signature';

    /**
     * Codes the CRM returns for a request that will never succeed on replay.
     * 401 is included because a bad secret is a configuration error, not a blip:
     * retrying it six times only delays the moment someone notices.
     */
    private const PERMANENT_CODES = [400, 401, 404];

    /**
     * @return array{delivered: bool, permanent: bool, code: int, reason: string}
     */
    public static function deliver(string $slug, string $payload, string $secret = ''): array
    {
        $base = rtrim((string) get_option(JW_CRM_OPTION_BASE_URL, ''), '/');

        if ($secret === '') {
            $secret = (string) get_option(JW_CRM_OPTION_SECRET, '');
        }

        if ($base === '' || $secret === '') {
            return self::result(false, true, 0, 'base url or signing secret is not configured');
        }

        $timestamp = time();
        $signature = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);

        $response = wp_remote_post($base . '/api/webforms/' . rawurlencode($slug), [
            'timeout' => JW_CRM_REQUEST_TIMEOUT,
            'headers' => [
                'Content-Type'          => 'application/json',
                self::SIGNATURE_HEADER  => "t={$timestamp},v0={$signature}",
            ],
            'body' => $payload,
        ]);

        if (is_wp_error($response)) {
            return self::result(false, false, 0, $response->get_error_message());
        }

        $code = (int) wp_remote_retrieve_response_code($response);

        /**
         * 202 accepted and 200 duplicate both mean the CRM holds the submission.
         * A duplicate is the expected answer when a retry lands after the first
         * attempt actually succeeded, so it must not be treated as a failure.
         */
        if ($code === 202 || $code === 200) {
            return self::result(true, false, $code, '');
        }

        if (in_array($code, self::PERMANENT_CODES, true)) {
            return self::result(false, true, $code, self::describe($code, $response));
        }

        return self::result(false, false, $code, self::describe($code, $response));
    }

    private static function describe(int $code, array $response): string
    {
        $body = trim((string) wp_remote_retrieve_body($response));

        return $code . ' ' . ($body === '' ? wp_remote_retrieve_response_message($response) : substr($body, 0, 300));
    }

    /**
     * @return array{delivered: bool, permanent: bool, code: int, reason: string}
     */
    private static function result(bool $delivered, bool $permanent, int $code, string $reason): array
    {
        return [
            'delivered' => $delivered,
            'permanent' => $permanent,
            'code'      => $code,
            'reason'    => $reason,
        ];
    }
}
