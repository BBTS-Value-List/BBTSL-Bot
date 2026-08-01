export function utcDateString(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export async function buildPrivateApiHeaders({ clientId, baseSecret, date = utcDateString(), extraHeaders = {} }) {
  const dailyKey = await deriveDailyKey(baseSecret, clientId, date);
  const headers = new Headers(extraHeaders);
  headers.set("authorization", `Bearer ${dailyKey}`);
  headers.set("x-bbtsl-api-client", clientId);
  headers.set("x-bbtsl-api-date", date);
  return headers;
}

export async function buildSignedHeaders({ method, url, body = new Uint8Array(), actorDiscordId, clientId, baseSecret, extraHeaders = {} }) {
  return buildBotSignedHeaders({ method, url, body, actorDiscordId, clientId, baseSecret, extraHeaders, includeActorHeader: true });
}

export async function buildServiceSignedHeaders({ method, url, body = new Uint8Array(), clientId, baseSecret, extraHeaders = {} }) {
  return buildBotSignedHeaders({ method, url, body, actorDiscordId: `service:${clientId}`, clientId, baseSecret, extraHeaders, includeActorHeader: false });
}

async function buildBotSignedHeaders({ method, url, body = new Uint8Array(), actorDiscordId, clientId, baseSecret, extraHeaders = {}, includeActorHeader }) {
  const date = utcDateString();
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyBytes = body instanceof Uint8Array ? body : new TextEncoder().encode(String(body || ""));
  const bodyHash = await sha256Hex(bodyBytes);
  const signingKey = await deriveSigningKey(baseSecret, clientId, date);
  const headers = await buildPrivateApiHeaders({ clientId, baseSecret, date, extraHeaders });
  if (includeActorHeader) headers.set("x-bbtsl-actor-discord-id", String(actorDiscordId));
  headers.set("x-bbtsl-request-timestamp", timestamp);
  headers.set("x-bbtsl-request-nonce", nonce);
  headers.set("x-bbtsl-content-sha256", bodyHash);
  const headerHash = await sha256Hex(canonicalizeSignedHeaders(headers));
  const canonical = buildCanonicalRequest({ method, url, clientId, date, actorDiscordId, timestamp, nonce, headerHash, bodyHash });
  headers.set("x-bbtsl-request-signature", await hmacHex(signingKey, canonical));
  return headers;
}

export async function deriveDailyKey(baseSecret, clientId, date) {
  return (await hmacHex(baseSecret, `bbtsl-v1:${clientId}:${date}`)).slice(0, 32);
}

export async function deriveSigningKey(baseSecret, clientId, date) {
  return hmacHex(baseSecret, `bbtsl-bot-signing:${clientId}:${date}`);
}

export function buildCanonicalRequest({ method, url, clientId, date, actorDiscordId, timestamp, nonce, headerHash, bodyHash }) {
  return [
    "bbtsl-bot-v1",
    String(clientId || ""),
    String(date || ""),
    String(method || "GET").toUpperCase(),
    canonicalizePath(url),
    String(actorDiscordId || ""),
    String(timestamp || ""),
    String(nonce || ""),
    String(headerHash || "").toLowerCase(),
    String(bodyHash || "").toLowerCase()
  ].join("\n");
}

export function canonicalizePath(value) {
  const url = value instanceof URL ? new URL(value.toString()) : new URL(String(value || "/"), "https://bbtsl.invalid");
  const pairs = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  const query = new URLSearchParams();
  for (const [key, item] of pairs) query.append(key, item);
  const serialized = query.toString();
  return `${url.pathname}${serialized ? `?${serialized}` : ""}`;
}

export function canonicalizeSignedHeaders(headersInput) {
  const headers = headersInput instanceof Headers ? headersInput : new Headers(headersInput || {});
  return ["content-type", "x-bbtsl-idempotency-key", "x-bbtsl-media-variant", "x-bbtsl-reauth-challenge", "x-bbtsl-sword-name"]
    .map((name) => `${name}:${normalizeHeader(headers.get(name) || "")}`)
    .join("\n");
}

function normalizeHeader(value) {
  return String(value || "").trim().replace(/[ \t]+/g, " ");
}

export async function sha256Hex(value) {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(String(value ?? ""));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((part) => part.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return [...signature].map((part) => part.toString(16).padStart(2, "0")).join("");
}
