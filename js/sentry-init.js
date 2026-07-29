(function () {
  const dsn = window.GAME_TRACKER_CONFIG?.sentryDsn?.trim?.() || "";
  if (!dsn || typeof Sentry === "undefined") {
    return;
  }

  const isLocal =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "";

  Sentry.init({
    dsn,
    environment: isLocal ? "development" : "production",
    tracesSampleRate: 0.1,
    debug: isLocal,
    integrations: [Sentry.replayIntegration()],
    replaysSessionSampleRate: 1.0,
    replaysOnErrorSampleRate: 1.0,
  });
})();
