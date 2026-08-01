import "dotenv/config";

const DEFAULT_PUBLIC_API = "https://bbtsl.lol/api/v1";
const DEFAULT_BOT_API = "https://bbtsl.lol/api/bot/v1";

export function loadConfig(source = process.env) {
  const config = {
    discordToken: required(source, "DISCORD_TOKEN"),
    applicationId: required(source, "DISCORD_APPLICATION_ID"),
    guildId: optional(source, "DISCORD_GUILD_ID"),
    publicApiUrl: normalizeUrl(source.BBTSL_PUBLIC_API_URL || DEFAULT_PUBLIC_API, "BBTSL_PUBLIC_API_URL"),
    botApiUrl: normalizeUrl(source.BBTSL_BOT_API_URL || DEFAULT_BOT_API, "BBTSL_BOT_API_URL"),
    apiClientId: required(source, "BBTSL_API_CLIENT_ID"),
    apiBaseSecret: required(source, "BBTSL_API_BASE_SECRET"),
    staffGuildId: optional(source, "BBTSL_STAFF_GUILD_ID"),
    staffChannelIds: csv(source.BBTSL_STAFF_CHANNEL_IDS),
    auditChannelIds: csv(source.BBTSL_AUDIT_CHANNEL_IDS),
    logLevel: source.LOG_LEVEL || "info",
    componentSessionTtlSeconds: boundedInt(source.COMPONENT_SESSION_TTL_SECONDS || "900", 60, 3600, "COMPONENT_SESSION_TTL_SECONDS"),
    nodeEnv: source.NODE_ENV || "production"
  };
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(config.apiClientId)) {
    throw new Error("BBTSL_API_CLIENT_ID is invalid.");
  }
  return Object.freeze(config);
}

function required(source, name) {
  const value = String(source[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optional(source, name) {
  return String(source[name] || "").trim();
}

function csv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizeUrl(value, name) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS.`);
  return url.toString().replace(/\/+$/, "");
}

function boundedInt(value, min, max, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error(`${name} is invalid.`);
  return number;
}
