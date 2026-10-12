/**
 * M&T HACCP / Cloudflare Worker - staging only.
 * Google Monitoring access is NOT enabled until a secure workload identity is configured.
 * Firebase ID tokens are verified cryptographically; no client-provided role is trusted.
 */
const ALLOWED_ORIGIN = "https://mt-haccp-test.pages.dev";
const PROJECT = "mt-haccp";
const MONITORING_CREDENTIAL_PROJECT = "mt-hacqp";
const KEY_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
function respond(request, data, status = 200) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "vary": "Origin"
  };
  if (request.headers.get("Origin") === ALLOWED_ORIGIN) {
    headers["access-control-allow-origin"] = ALLOWED_ORIGIN;
  }
  return new Response(JSON.stringify(data), { status, headers });
}
function decodePart(part) {
  const s = part.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(s.padEnd(Math.ceil(s.length / 4) * 4, "=")), c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function verifyFirebaseToken(token, project) {
  if (!token || token.length > 8192) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = decodePart(parts[0]);
    payload = decodePart(parts[1]);
  } catch { return null; }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== "RS256" || typeof header.kid !== "string" ||
      payload.aud !== project || payload.iss !== "https://securetoken.google.com/" + project ||
      typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128 ||
      typeof payload.exp !== "number" || payload.exp <= now ||
      typeof payload.iat !== "number" || payload.iat > now ||
      typeof payload.auth_time !== "number" || payload.auth_time > now) return null;
  const res = await fetch(KEY_URL);
  if (!res.ok) throw new Error("firebase_keys_unavailable");
  const jwks = await res.json();
  const key = jwks.keys?.find(k => k.kid === header.kid && k.kty === "RSA" && (!k.use || k.use === "sig"));
  if (!key) return null;
  const cryptoKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signature = Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[2].length / 4) * 4, "=")), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, signature, new TextEncoder().encode(parts[0] + "." + parts[1]));
  return valid ? payload : null;
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function getMonitoringToken(env) {
  // Google service-account credentials must be stored only as a Cloudflare Secret.
  // No service-account JSON, private key or OAuth token is committed to GitHub.
  if (!env.GOOGLE_MONITORING_SERVICE_ACCOUNT_JSON) return null;
  let account;
  try { account = JSON.parse(env.GOOGLE_MONITORING_SERVICE_ACCOUNT_JSON); }
  catch { throw new Error("google_credentials_invalid"); }
  if (account.type !== "service_account" ||
      account.project_id !== MONITORING_CREDENTIAL_PROJECT ||
      typeof account.client_email !== "string" ||
      !account.client_email.endsWith("@"+MONITORING_CREDENTIAL_PROJECT+".iam.gserviceaccount.com") ||
      typeof account.private_key !== "string") throw new Error("google_credentials_invalid");
  const now = Math.floor(Date.now()/1000);
  const header = base64url(new TextEncoder().encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
  const claims = base64url(new TextEncoder().encode(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/monitoring.read",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now+3300
  })));
  const pkcs8 = account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
  const der = Uint8Array.from(atob(pkcs8),ch=>ch.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8",der,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(header+"."+claims));
  const assertion = header+"."+claims+"."+base64url(new Uint8Array(signature));
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({"grant_type":"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})
  });
  if (!tokenResponse.ok) throw new Error("google_oauth_failed");
  const token = await tokenResponse.json();
  if (typeof token.access_token !== "string") throw new Error("google_oauth_failed");
  return token.access_token;
}
async function fetchMetric(project, token, type, start, end) {
  const url = new URL("https://monitoring.googleapis.com/v3/projects/"+encodeURIComponent(project)+"/timeSeries");
  url.searchParams.set("filter",'metric.type = "'+type+'"');
  url.searchParams.set("interval.startTime",start);
  url.searchParams.set("interval.endTime",end);
  url.searchParams.set("view","FULL");
  url.searchParams.set("pageSize","1000");
  let sum = 0, count = 0, next = "";
  do {
    if (next) url.searchParams.set("pageToken",next);
    const response = await fetch(url.toString(),{headers:{Authorization:"Bearer "+token}});
    if (!response.ok) {
      if (response.status === 403) throw new Error("google_monitoring_permission_denied");
      throw new Error("google_monitoring_request_failed");
    }
    const data = await response.json();
    for (const series of data.timeSeries || []) {
      for (const point of series.points || []) {
        const value = Number(point.value?.int64Value);
        if (Number.isFinite(value)) {sum += value;count++;}
      }
    }
    next = data.nextPageToken || "";
  } while (next && count < 100000);
  return {value:count ? sum : null,points:count,metric:type};
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      if (request.headers.get("Origin") !== ALLOWED_ORIGIN) return respond(request, { error: "origin_forbidden" }, 403);
      const response = respond(request, {}, 200);
      response.headers.set("access-control-allow-methods", "GET, OPTIONS");
      response.headers.set("access-control-allow-headers", "Authorization");
      response.headers.set("access-control-max-age", "600");
      return response;
    }
    if (request.method !== "GET") return respond(request, { error: "method_not_allowed" }, 405);
    if (url.pathname === "/health") {
      return respond(request, { service: "mt-haccp-monitoring-api", status: "ok",
        projectConfigured: env.FIREBASE_PROJECT_ID === PROJECT || env.FIREBASE_PROJECT_ID === MONITORING_CREDENTIAL_PROJECT, metricsConnected: Boolean(env.GOOGLE_MONITORING_SERVICE_ACCOUNT_JSON) });
    }
    if (url.pathname !== "/api/metrics") return respond(request, { error: "not_found" }, 404);
    if (env.FIREBASE_PROJECT_ID !== PROJECT && env.FIREBASE_PROJECT_ID !== MONITORING_CREDENTIAL_PROJECT) return respond(request, { error: "project_not_configured" }, 503);
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return respond(request, { error: "authentication_required" }, 401);
    let user;
    try { user = await verifyFirebaseToken(authorization.slice(7), PROJECT); }
    catch { return respond(request, { error: "authentication_unavailable" }, 503); }
    if (!user) return respond(request, { error: "invalid_token" }, 401);
    // Match the real M&T HACCP admin profile (Firestore users/{uid}).
    let profileResponse;
    try {
      const profileUrl = "https://firestore.googleapis.com/v1/projects/" +
        encodeURIComponent(PROJECT) + "/databases/(default)/documents/users/" +
        encodeURIComponent(user.sub);
      profileResponse = await fetch(profileUrl, {
        headers: { Authorization: "Bearer " + authorization.slice(7) },
        redirect: "follow"
      });
    } catch (error) {
      const detail = error?.name === "TypeError" ? "fetch_type_error" :
        error?.name === "AbortError" ? "fetch_aborted" : "fetch_exception";
      console.error("Firestore profile fetch failed", error?.name, error?.message);
      return respond(request, { error: "profile_network_error", detail }, 503);
    }
    if (profileResponse.status === 401 || profileResponse.status === 403)
      return respond(request, { error: "profile_access_denied" }, 403);
    if (profileResponse.status === 404)
      return respond(request, { error: "profile_not_found" }, 403);
    if (!profileResponse.ok)
      return respond(request, { error: "profile_http_" + profileResponse.status }, 503);
    let profile;
    try { profile = await profileResponse.json(); }
    catch { return respond(request, { error: "profile_invalid" }, 503); }
    const fields = profile.fields || {};
    if (fields.role?.stringValue !== "admin" ||
        fields.site?.stringValue !== "main" ||
        fields.active?.booleanValue === false)
      return respond(request, { error: "admin_access_required" }, 403);
    if (!env.GOOGLE_MONITORING_SERVICE_ACCOUNT_JSON)
      return respond(request, {error:"metrics_not_connected",
        message:"Configurer le secret Cloudflare GOOGLE_MONITORING_SERVICE_ACCOUNT_JSON."},503);
    try {
      const token = await getMonitoringToken(env);
      const end = new Date(), start = new Date(end.getTime()-24*60*60*1000);
      const types = {
        reads:"firestore.googleapis.com/document/read_ops_count",
        writes:"firestore.googleapis.com/document/write_ops_count",
        deletes:"firestore.googleapis.com/document/delete_ops_count"
      };
      const results = await Promise.all(Object.entries(types).map(async ([name,type]) =>
        [name,await fetchMetric(PROJECT,token,type,start.toISOString(),end.toISOString())]));
      return respond(request,{
        source:"Google Cloud Monitoring",project:PROJECT,
        period:{start:start.toISOString(),end:end.toISOString()},
        metrics:Object.fromEntries(results),
        note:"Valeur null : aucun point disponible dans la période; ne signifie pas zéro."
      });
    } catch (error) {
      const safe = ["google_credentials_invalid","google_oauth_failed",
        "google_monitoring_permission_denied","google_monitoring_request_failed"].includes(error.message)
        ? error.message : "monitoring_unavailable";
      return respond(request,{error:safe},503);
    }
  }
};
