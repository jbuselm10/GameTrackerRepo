/**

 * Copy this file to js/config.js and paste your Sentry browser DSN.
 * Create a project at https://sentry.io (JavaScript → Browser).
 *
 * Leave sentryDsn as "" to disable Sentry in the browser.
 *
 * Verify (when DSN is set): open any page, run in console:
 *   throw new Error("Sentry test")
 * The issue should appear in Sentry within ~30 seconds.
 */
window.GAME_TRACKER_CONFIG = {
  sentryDsn: "",
};
