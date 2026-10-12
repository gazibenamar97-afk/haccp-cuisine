/**
 * M&T HACCP — Cloudflare Worker monitoring (staging)
 * This file is a deployable starting point, NOT yet connected to Google Monitoring.
 * No credentials are stored here. Private metrics remain closed until authentication
 * and Google access-token exchange are implemented and verified.
 */
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "access-control-allow-origin": "https://mt-haccp-test.pages.dev",
    "vary": "Origin"
  }
});
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    if (url.pathname === "/health") {
      return json({
        service: "mt-haccp-monitoring-api",
        status: "ok",
        projectConfigured: Boolean(env.FIREBASE_PROJECT_ID),
        metricsConnected: false
      });
    }
    if (url.pathname === "/api/metrics") {
      return json({
        error: "not_configured",
        message: "Authentification administrateur et connexion Google Cloud Monitoring non encore configurées. Aucune métrique simulée."
      }, 503);
    }
    return json({ error: "not_found" }, 404);
  }
};
