const TEAM_SYNC_INTERVAL_MS = 60 * 60 * 1000;

export function startTeamProfileSync(client, context, options = {}) {
  const intervalMs = options.intervalMs || TEAM_SYNC_INTERVAL_MS;
  const setTimer = options.setInterval || globalThis.setInterval;
  const clearTimer = options.clearInterval || globalThis.clearInterval;
  const run = () => syncTeamProfiles(client, context).catch((error) => {
    context.logger.warn({ err: error }, "team profile sync failed");
  });
  run();
  const timer = setTimer(run, intervalMs);
  if (typeof timer?.unref === "function") timer.unref();
  return () => clearTimer(timer);
}

export async function syncTeamProfiles(client, context) {
  const response = await context.api.teamSyncTargets();
  const users = Array.isArray(response?.data?.users) ? response.data.users : [];
  const profiles = [];
  let skipped = 0;
  for (const teamUser of users) {
    const discordUserId = String(teamUser?.discordUserId || "").trim();
    if (!/^\d{8,32}$/.test(discordUserId)) {
      skipped += 1;
      continue;
    }
    const user = await client.users.fetch(discordUserId, { force: true }).catch((error) => {
      context.logger.warn({ err: error, discordUserId }, "discord team user fetch failed");
      return null;
    });
    if (!user) {
      skipped += 1;
      continue;
    }
    profiles.push({
      discordUserId,
      username: String(user.username || "").trim(),
      globalName: String(user.globalName || "").trim(),
      avatarHash: String(user.avatar || "").trim()
    });
  }

  if (!profiles.length) {
    return { checked: users.length, updated: 0, skipped, sent: 0 };
  }
  const result = await context.api.syncTeamProfiles(profiles);
  const data = result?.data || {};
  context.logger.info({
    checked: data.checked ?? users.length,
    updated: data.updated ?? 0,
    skipped: data.skipped ?? skipped,
    sent: profiles.length
  }, "team profile sync completed");
  return { checked: data.checked ?? users.length, updated: data.updated ?? 0, skipped: data.skipped ?? skipped, sent: profiles.length };
}
