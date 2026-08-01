import { buildPrivateApiHeaders, buildServiceSignedHeaders, buildSignedHeaders } from "./signing.js";

export class BbtslApiClient {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetch = fetchImpl;
  }

  async publicGet(path, params = {}) {
    const url = this.#url(this.config.publicApiUrl, path, params);
    const headers = await buildPrivateApiHeaders({ clientId: this.config.apiClientId, baseSecret: this.config.apiBaseSecret });
    return this.#request(url, { method: "GET", headers });
  }

  async staffGet(path, actorDiscordId, params = {}) {
    const url = this.#url(this.config.botApiUrl, path, params);
    const headers = await buildSignedHeaders({ method: "GET", url, actorDiscordId, clientId: this.config.apiClientId, baseSecret: this.config.apiBaseSecret });
    return this.#request(url, { method: "GET", headers });
  }

  async staffJson(method, path, actorDiscordId, body, extraHeaders = {}) {
    const url = this.#url(this.config.botApiUrl, path);
    const bytes = new TextEncoder().encode(JSON.stringify(body || {}));
    const headers = await buildSignedHeaders({ method, url, body: bytes, actorDiscordId, clientId: this.config.apiClientId, baseSecret: this.config.apiBaseSecret, extraHeaders: { "content-type": "application/json", ...extraHeaders } });
    return this.#request(url, { method, headers, body: bytes });
  }

  async staffMedia(path, actorDiscordId, form, headersInput = {}) {
    const url = this.#url(this.config.botApiUrl, path);
    const multipart = await formToMultipart(form);
    const headers = await buildSignedHeaders({ method: "POST", url, body: multipart.bytes, actorDiscordId, clientId: this.config.apiClientId, baseSecret: this.config.apiBaseSecret, extraHeaders: { ...headersInput, "content-type": multipart.contentType } });
    return this.#request(url, { method: "POST", headers, body: multipart.bytes });
  }

  async actor(discordUserId) {
    return this.staffGet(`/actor/${discordUserId}`, discordUserId);
  }

  async favorites(discordUserId) {
    return this.staffGet(`/favorites/${discordUserId}`, discordUserId);
  }

  async setFavorite(discordUserId, cardId, enabled) {
    const normalized = normalizeCardId(cardId);
    const method = enabled ? "PUT" : "DELETE";
    const url = this.#url(this.config.botApiUrl, `/favorites/${discordUserId}/${encodeURIComponent(normalized)}`);
    const headers = await buildSignedHeaders({ method, url, actorDiscordId: discordUserId, clientId: this.config.apiClientId, baseSecret: this.config.apiBaseSecret });
    return this.#request(url, { method, headers });
  }

  async createReauthChallenge(actorDiscordId) {
    return this.staffJson("POST", "/reauth/challenges", actorDiscordId, {});
  }

  async teamSyncTargets() {
    const url = this.#url(this.config.botApiUrl, "/team/sync");
    const headers = await buildServiceSignedHeaders({ method: "GET", url, clientId: this.config.apiClientId, baseSecret: this.config.apiBaseSecret });
    return this.#request(url, { method: "GET", headers });
  }

  async syncTeamProfiles(users) {
    const url = this.#url(this.config.botApiUrl, "/team/sync");
    const bytes = new TextEncoder().encode(JSON.stringify({ users }));
    const headers = await buildServiceSignedHeaders({ method: "POST", url, body: bytes, clientId: this.config.apiClientId, baseSecret: this.config.apiBaseSecret, extraHeaders: { "content-type": "application/json" } });
    return this.#request(url, { method: "POST", headers, body: bytes });
  }

  async #request(url, init) {
    const response = await this.fetch(url, { ...init, headers: init.headers || {}, redirect: "manual" });
    const text = await response.text();
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const isJson = contentType.includes("application/json");
    let body = null;
    if (text && isJson) {
      try {
        body = JSON.parse(text);
      } catch {
        throw apiError(`BBTSL API returned invalid JSON from ${new URL(url).pathname}.`, response, text);
      }
    }
    if (!response.ok) {
      const message = body?.error || `BBTSL API returned ${response.status} from ${new URL(url).pathname}.`;
      throw apiError(message, response, text, body);
    }
    if (text && !isJson) {
      throw apiError(`BBTSL API returned non-JSON content from ${new URL(url).pathname}.`, response, text);
    }
    return body;
  }

  #url(base, path, params = {}) {
    const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    return url.toString();
  }
}

function normalizeCardId(value) {
  const text = String(value || "").trim().toUpperCase();
  const normalized = text.startsWith("#") ? text : `#${text}`;
  if (!/^#[A-Z0-9]{6}$/.test(normalized)) throw new Error("Card ID is invalid.");
  return normalized;
}

function apiError(message, response, text, body = null) {
  const error = new Error(message);
  error.status = response.status;
  error.retryAfter = Math.max(0, Number(response.headers.get("retry-after") || 0));
  error.contentType = response.headers.get("content-type") || "";
  error.body = body;
  error.preview = String(text || "").slice(0, 160);
  return error;
}

async function formToMultipart(form) {
  const request = new Request("https://bbtsl.invalid", { method: "POST", body: form });
  return {
    bytes: new Uint8Array(await request.arrayBuffer()),
    contentType: request.headers.get("content-type") || "multipart/form-data"
  };
}
