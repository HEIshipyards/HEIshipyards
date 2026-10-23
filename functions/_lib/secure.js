// Cloudflare Pages Functions server-side helpers. Never put secrets in browser code.
const REPO = "HEIshipyards/HEIshipyards";
const BRANCH = "main";
const ALLOWED_IMAGE_HOSTS = new Set([
  "images.steamusercontent.com", "steamuserimages-a.akamaihd.net",
  "steamuserimages.akamaihd.net", "steamcommunity-a.akamaihd.net"
]);
export function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}
function decodeBase64Url(value) {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function textFromBase64(base64) {
  return new TextDecoder().decode(Uint8Array.from(atob(base64.replace(/\s/g, "")), c => c.charCodeAt(0)));
}
function bodyToBase64(data) {
  const bytes = new TextEncoder().encode(data);
  let raw = "";
  for (let i = 0; i < bytes.length; i += 8192)
    raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(raw);
}
export async function authorize(request, env) {
  if (!env.GITHUB_TOKEN || !env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD || !env.ADMIN_EMAIL)
    return respond({error: "Admin backend not configured. See ADMIN_SETUP.md."}, 503);
  const domain = String(env.CF_ACCESS_TEAM_DOMAIN).toLowerCase().replace(/^https:\/\//, "").replace(/\/$/, "");
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain)) return respond({error: "Invalid Access team domain."}, 503);
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return respond({error: "Cloudflare Access login required."}, 401);
  const parts = token.split(".");
  if (parts.length !== 3) return respond({error: "Invalid access token."}, 401);
  try {
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw Error("Unexpected signing algorithm");
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== "https://" + domain || !Array.isArray(claims.aud) ||
        !claims.aud.includes(env.CF_ACCESS_AUD) || !Number.isFinite(claims.exp) ||
        claims.exp <= now || (claims.nbf && claims.nbf > now + 60) ||
        String(claims.email || "").toLowerCase() !== String(env.ADMIN_EMAIL).toLowerCase())
      throw Error("Incorrect session claims");
    const certResponse = await fetch("https://" + domain + "/cdn-cgi/access/certs", {cf: {cacheTtl: 300}});
    if (!certResponse.ok) throw Error("Access verification unavailable");
    const certs = await certResponse.json();
    const jwk = (certs.keys || []).find(k => k.kid === header.kid && k.kty === "RSA");
    if (!jwk) throw Error("Unknown signing key");
    const key = await crypto.subtle.importKey("jwk", jwk,
      {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"}, false, ["verify"]);
    const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
    if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64Url(parts[2]), signed))
      throw Error("Invalid signature");
    return null;
  } catch (_) {
    return respond({error: "Cloudflare Access session could not be verified."}, 401);
  }
}
async function github(path, env, method = "GET", body = null) {
  const url = "https://api.github.com/repos/" + REPO + "/contents/" +
    path.split("/").map(encodeURIComponent).join("/") + (method === "GET" ? "?ref=" + BRANCH : "");
  const response = await fetch(url, {
    method,
    headers: {
      "Authorization": "Bearer " + env.GITHUB_TOKEN,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "HEI-Fleet-Manager",
      ...(body ? {"Content-Type": "application/json"} : {})
    },
    ...(body ? {body: JSON.stringify(body)} : {})
  });
  if (!response.ok) {
    if (response.status === 409 || response.status === 422)
      throw Object.assign(Error("GitHub rejected a conflicting update."), {status: 409});
    throw Object.assign(Error("GitHub API request failed (" + response.status + ")."), {status: 502});
  }
  return response.json();
}
export async function loadFleet(env) {
  const file = await github("data/workshop-v2.json", env);
  const items = JSON.parse(textFromBase64(file.content));
  if (!Array.isArray(items)) throw Object.assign(Error("Invalid fleet registry."), {status: 502});
  return {items, sha: file.sha};
}
export async function saveFleet(env, items, sha, title) {
  return github("data/workshop-v2.json", env, "PUT", {
    branch: BRANCH, sha, content: bodyToBase64(JSON.stringify(items, null, 2) + "\n"),
    message: "Fleet Manager: " + String(title).slice(0, 80)
  });
}
export async function saveImage(env, path, base64, title) {
  return github(path, env, "PUT", {
    branch: BRANCH, content: base64,
    message: "Fleet Manager: upload image for " + title
  });
}
export async function loadShipPages(env) {
  const file = await github("data/ship-pages.json", env);
  const items = JSON.parse(textFromBase64(file.content));
  if (!items || Array.isArray(items) || typeof items !== "object")
    throw Object.assign(Error("Invalid ship-page registry."), {status: 502});
  return {items, sha: file.sha};
}
export async function saveShipPages(env, items, sha, route) {
  return github("data/ship-pages.json", env, "PUT", {
    branch: BRANCH, sha,
    content: bodyToBase64(JSON.stringify(items, null, 2) + "\n"),
    message: "Fleet Manager: update specs and lore for " + String(route).slice(0, 80)
  });
}
export function validMediaUrl(value) {
  if (typeof value !== "string") return false;
  if (/^\/assets\/fleet\/\d{8,12}\/[0-9a-f]{32}\.(?:png|jpg|webp)$/.test(value)) return true;
  if (/^\/assets\/workshop\/\d{8,12}\/[0-9a-f]{20}\.(?:png|jpg|webp)$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_IMAGE_HOSTS.has(url.hostname) &&
      !url.username && !url.password && value.length < 2048;
  } catch (_) { return false; }
}
export function errorResult(error) {
  return respond({error: error && error.message ? error.message : "Unexpected server error."},
    error && error.status || 500);
}
