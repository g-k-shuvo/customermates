<?php
/**
 * Removes the plugin's options and retry table.
 *
 * Runs only on delete, not on deactivate, so switching the plugin off for an
 * afternoon does not discard a queue of undelivered submissions.
 */

declare(strict_types=1);

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

global $wpdb;

foreach (['jw_crm_base_url', 'jw_crm_signing_secret', 'jw_crm_form_map', 'jw_crm_admin_email'] as $option) {
    delete_option($option);
}

$wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'jw_crm_retry_queue');

$timestamp = wp_next_scheduled('jw_crm_drain_retry_queue');

if ($timestamp) {
    wp_unschedule_event($timestamp, 'jw_crm_drain_retry_queue');
}
