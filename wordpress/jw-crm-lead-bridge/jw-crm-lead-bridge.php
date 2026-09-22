<?php
/**
 * Plugin Name:       JW CRM Lead Bridge
 * Description:       Forwards Fluent Forms submissions to the CRM web form endpoint, signed and with retries.
 * Version:           1.1.0
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * License:           GPL-2.0-or-later
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

define('JW_CRM_VERSION', '1.1.0');
define('JW_CRM_PLUGIN_FILE', __FILE__);
define('JW_CRM_PLUGIN_DIR', plugin_dir_path(__FILE__));

define('JW_CRM_OPTION_BASE_URL', 'jw_crm_base_url');
define('JW_CRM_OPTION_SECRET', 'jw_crm_signing_secret');
define('JW_CRM_OPTION_FORM_MAP', 'jw_crm_form_map');
define('JW_CRM_OPTION_ADMIN_EMAIL', 'jw_crm_admin_email');
define('JW_CRM_OPTION_DB_VERSION', 'jw_crm_db_version');

define('JW_CRM_RETRY_HOOK', 'jw_crm_drain_retry_queue');
define('JW_CRM_MAX_ATTEMPTS', 6);
define('JW_CRM_REQUEST_TIMEOUT', 8);

require_once JW_CRM_PLUGIN_DIR . 'includes/class-jw-crm-queue.php';
require_once JW_CRM_PLUGIN_DIR . 'includes/class-jw-crm-client.php';
require_once JW_CRM_PLUGIN_DIR . 'includes/class-jw-crm-settings.php';
require_once JW_CRM_PLUGIN_DIR . 'includes/class-jw-crm-unmapped.php';

register_activation_hook(__FILE__, ['JW_CRM_Queue', 'activate']);
register_deactivation_hook(__FILE__, ['JW_CRM_Queue', 'deactivate']);

add_action('plugins_loaded', static function (): void {
    JW_CRM_Settings::boot();
    JW_CRM_Queue::boot();
});

/**
 * Fluent Forms fires this with ($submissionId, $formData, $form) at priority 10.
 * Priority 20 runs after Fluent Forms' own integrations have had their turn.
 */
add_action('fluentform/submission_inserted', static function ($submissionId, $formData, $form): void {
    $map = get_option(JW_CRM_OPTION_FORM_MAP, []);
    $formId = (int) $form->id;

    $entry = JW_CRM_Settings::map_entry($map, $formId);

    if ($entry === null) {
        JW_CRM_Unmapped::record($formId, (string) $form->title);

        return;
    }

    JW_CRM_Unmapped::forget($formId);

    $slug = $entry['slug'];
    $secret = $entry['secret'];

    $payload = wp_json_encode([
        'external_id'  => (string) $submissionId,
        'form_id'      => $formId,
        'form_title'   => (string) $form->title,
        'submitted_at' => gmdate('c'),
        'page_url'     => isset($_SERVER['HTTP_REFERER']) ? esc_url_raw(wp_unslash($_SERVER['HTTP_REFERER'])) : '',
        'fields'       => $formData,
    ]);

    if ($payload === false) {
        JW_CRM_Queue::log_permanent_failure($slug, (string) $submissionId, 'payload could not be encoded as JSON');

        return;
    }

    $result = JW_CRM_Client::deliver($slug, $payload, $secret);

    if ($result['delivered']) {
        return;
    }

    if ($result['permanent']) {
        JW_CRM_Queue::log_permanent_failure($slug, (string) $submissionId, $result['reason']);

        return;
    }

    JW_CRM_Queue::enqueue($slug, (string) $submissionId, $payload, $secret);
}, 20, 3);
