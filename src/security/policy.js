export const PUBLIC_COMMANDS = new Set(["item", "search", "compare", "top", "updated", "team", "favorite", "status", "help"]);
export const LOGIN_REFRESH_MESSAGE = "To perform this staff action, refresh your website login by signing in on bbtsl.lol again. Staff actions unlock for 7 days after login.";

export const STAFF_COMMANDS = new Map([
  ["profile", "team:view:self"],
  ["edit", "sword:update"],
  ["media", "media:update"],
  ["create", "sword:create"],
  ["delete", "sword:delete"],
  ["export", "data:export"],
  ["audit", "audit:view"],
  ["revert", "audit:revert"],
  ["team-user", "team:manage"],
  ["team-list", "team:manage"],
  ["team-add", "team:manage"],
  ["team-edit", "team:manage"]
]);

export function isStaffCommand(name) {
  return STAFF_COMMANDS.has(String(name || ""));
}

export function requiredCapability(name) {
  return STAFF_COMMANDS.get(String(name || "")) || null;
}

export function actorHasCapability(actor, capability) {
  if (!actor || !capability || capability === "data:reset") return false;
  return Array.isArray(actor.permissions) && actor.permissions.includes(capability);
}

export function staffLoginIsFresh(actor) {
  return actor?.staffLoginFresh === true;
}

export async function getActorOrNull(api, discordUserId) {
  try {
    const response = await api.actor(discordUserId);
    return response?.data || null;
  } catch {
    return null;
  }
}

export async function mayUseStaffCommand(api, discordUserId, commandName) {
  const capability = requiredCapability(commandName);
  if (!capability) return { allowed: false, actor: null, reason: "unknown" };
  const actor = await getActorOrNull(api, discordUserId);
  if (!actorHasCapability(actor, capability)) return { allowed: false, actor, reason: "permission" };
  if (commandName !== "profile" && !staffLoginIsFresh(actor)) return { allowed: false, actor, reason: "login_refresh", message: LOGIN_REFRESH_MESSAGE };
  return { allowed: true, actor };
}

export function staffChannelAllowed(config, message) {
  if (!message.guildId) return true;
  if (config.staffGuildId && message.guildId !== config.staffGuildId) return false;
  if (!config.staffChannelIds.length) return false;
  return config.staffChannelIds.includes(message.channelId);
}
