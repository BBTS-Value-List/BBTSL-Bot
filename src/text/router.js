import { auditPanel, helpPanel, itemNotFoundPanel, itemPanel, plainPanel, searchPanel, searchingPanel, searchSuggestionPanel, statusPanel } from "../components/panels.js";
import { registerSuggestionActions } from "../interactions/suggestions.js";
import { findItem, ItemLookupError, loadValueRange, searchItems, shouldUseSearchingPanel, suggestItem } from "../items/lookup.js";
import { getActorOrNull, isStaffCommand, LOGIN_REFRESH_MESSAGE, mayUseStaffCommand, staffChannelAllowed } from "../security/policy.js";
import { parseTextCommand } from "./parser.js";

const SLOT_TO_PAYLOAD_FIELD = { card: "img", detail: "detailMedia", slash: "slashMedia", audio: "slashAudio", sfx: "slashAudio", finisher: "finisherMedia" };
const SLOT_TO_VARIANT = { card: "card-image", detail: "detail", slash: "slash", audio: "slash-audio", sfx: "slash-audio", finisher: "finisher" };

export async function handleTextMessage(message, context) {
  if (message.author.bot) return;
  const parsed = parseTextCommand(message.content);
  if (!parsed) return;

  const actor = await getActorOrNull(context.api, message.author.id);
  if (isStaffCommand(parsed.name)) {
    if (!staffChannelAllowed(context.config, message)) return;
    const decision = await mayUseStaffCommand(context.api, message.author.id, parsed.name);
    if (!decision.allowed) {
      const body = decision.reason === "login_refresh"
        ? (decision.message || LOGIN_REFRESH_MESSAGE)
        : "Your BBTSL role cannot use that command.";
      return message.reply(plainPanel(decision.reason === "login_refresh" ? "Login refresh required" : "Access denied", body, { ephemeral: false }));
    }
    return handleStaffText(message, context, parsed, decision.actor);
  }

  if (parsed.name === "help") return message.reply(helpPanel(actor, { ephemeral: false }));
  if (parsed.name === "item") return textItem(message, context, parsed.args);
  if (parsed.name === "search") return textSearch(message, context, parsed.args);
  if (parsed.name === "favorite") return message.reply(await textFavorite(context, message.author.id, parsed.args));
  if (parsed.name === "status") return message.reply(await textStatus(context));
  if (parsed.name === "team") return message.reply(await textTeam(context));
}

async function handleStaffText(message, context, parsed, actor) {
  if (parsed.name === "profile") return message.reply(helpPanel(actor, { ephemeral: false }));
  if (parsed.name === "audit") return message.reply(await textAudit(context, parsed, actor));
  if (parsed.name === "export") return message.reply(await textExport(context, actor));
  if (parsed.name === "edit") return message.reply(await textEdit(context, parsed, actor));
  if (parsed.name === "create") return message.reply(await textCreate(context, parsed, actor));
  if (parsed.name === "delete") return message.reply(await textDelete(context, parsed, actor));
  if (parsed.name === "media") return message.reply(await textMedia(message, context, parsed, actor));
  if (parsed.name === "team-list" || parsed.name === "team-user") return message.reply(await textTeamManageList(context, actor));
  if (parsed.name === "team-add") return message.reply(await textTeamAdd(context, parsed, actor));
  if (parsed.name === "team-edit") return message.reply(await textTeamEdit(context, parsed, actor));
  if (parsed.name === "revert") return message.reply(await textRevert(context, parsed, actor));
  return message.reply(plainPanel("Staff action", "This staff command is not wired yet.", { ephemeral: false }));
}

async function textAudit(context, parsed, actor) {
  try {
    const response = await context.api.staffGet("/audit", actor.discordUserId, { cardId: parsed.args.item, actionType: parsed.args.action, source: parsed.args.source, search: parsed.args.search, limit: 10 });
    const logs = Array.isArray(response.logs) ? response.logs : Array.isArray(response.data) ? response.data : [];
    return auditPanel(logs, { ephemeral: false });
  } catch (error) {
    if (isAuditApiFailure(error)) return auditUnavailablePanel(error, { ephemeral: false });
    throw error;
  }
}

async function textExport(context, actor) {
  const response = await context.api.staffGet("/export", actor.discordUserId);
  const body = Buffer.from(JSON.stringify(response, null, 2), "utf8");
  return { files: [{ attachment: body, name: `bbtsl-export-${new Date().toISOString().slice(0, 10)}.json` }], allowedMentions: { parse: [] } };
}

async function textEdit(context, parsed, actor) {
  const query = parsed.args.item || parsed.args._[0] || "";
  const item = await loadBotSword(context, actor.discordUserId, query);
  const patch = {};
  if (parsed.args.value !== undefined) patch.v = parsed.args.value;
  if (parsed.args.demand !== undefined) patch.d = parsed.args.demand;
  if (parsed.args.trend !== undefined) patch.t = parsed.args.trend;
  if (parsed.args.count !== undefined) patch.ct = parsed.args.count;
  if (!Object.keys(patch).length) return plainPanel("Edit", "Set value=, demand=, trend=, or count=.", { ephemeral: false });
  const body = buildCommitPayload(item, patch, `bot-edit-${actor.discordUserId}-${Date.now()}`);
  const response = await context.api.staffJson("PUT", `/swords/${encodeURIComponent(item.cardId)}`, actor.discordUserId, body);
  return plainPanel("Item updated", `${response.sword?.n || item.name} was updated and audit logged.`, { ephemeral: false });
}

async function textCreate(context, parsed, actor) {
  const name = parsed.args.name || parsed.args._.join(" ");
  const category = parsed.args.category || parsed.args.cat || "Other Swords";
  const value = parsed.args.value || parsed.args.v;
  if (!name || value === undefined) return plainPanel("Create", "Use `bbtsl-create name=Frost Blade category=LTM value=55000`.", { ephemeral: false });
  const body = {
    idempotencyKey: `bot-create-${actor.discordUserId}-${Date.now()}`,
    expectedRevision: 0,
    n: name,
    c: category,
    v: Number(value),
    d: parsed.args.demand || "N/A",
    t: parsed.args.trend || "Stable",
    ct: normalizeNullableInteger(parsed.args.count),
    descr: parsed.args.descr || parsed.args.description || "",
    img: null,
    detailMedia: null,
    slashMedia: null,
    slashAudio: null,
    finisherMedia: null,
    oc: false
  };
  const response = await context.api.staffJson("POST", "/swords", actor.discordUserId, body);
  return plainPanel("Item created", `${response.sword?.n || body.n} was created as ${response.sword?.cardId || "a new card"}.`, { ephemeral: false });
}

async function textDelete(context, parsed, actor) {
  const query = parsed.args.item || parsed.args._.join(" ");
  const item = await loadBotSword(context, actor.discordUserId, query);
  await context.api.staffJson("DELETE", `/swords/${encodeURIComponent(item.cardId)}`, actor.discordUserId, { confirmation: "delete" });
  return plainPanel("Item deleted", `${item.name} ${item.cardId} was deleted and audit logged.`, { ephemeral: false });
}

async function textMedia(message, context, parsed, actor) {
  const query = parsed.args.item || parsed.args._[0] || "";
  const item = await loadBotSword(context, actor.discordUserId, query);
  const slot = String(parsed.args.slot || parsed.args.variant || parsed.args._[1] || "").toLowerCase();
  const payloadField = SLOT_TO_PAYLOAD_FIELD[slot];
  const variant = SLOT_TO_VARIANT[slot];
  if (!payloadField || !variant) return plainPanel("Media", "Use slot=card, detail, slash, audio, or finisher.", { ephemeral: false });
  const patch = {};
  if (parsed.args.remove === true || String(parsed.args.remove || "").toLowerCase() === "true") {
    patch[payloadField] = null;
  } else {
    const attachment = message.attachments?.first?.() || [...(message.attachments?.values?.() || [])][0];
    if (!attachment?.url) return plainPanel("Media", "Attach a media file or set remove=true.", { ephemeral: false });
    const staged = await stageAttachment(context, actor, item, variant, attachment);
    patch[payloadField] = { stagedMediaId: staged.stagedMediaId };
  }
  const body = buildCommitPayload(item, patch, `bot-media-${actor.discordUserId}-${Date.now()}`);
  await context.api.staffJson("PUT", `/swords/${encodeURIComponent(item.cardId)}`, actor.discordUserId, body);
  return plainPanel("Media updated", `${slot} media for ${item.name} was updated and audit logged.`, { ephemeral: false });
}

async function textTeamManageList(context, actor) {
  const response = await context.api.staffGet("/team/manage", actor.discordUserId);
  const rows = (response.team || response.data || []).map((user) => `**${user.displayName || user.globalName || user.discordUserId}** - ${user.role} - ${user.status || "active"}`).slice(0, 20).join("\n") || "No team users found.";
  return plainPanel("Team users", rows, { ephemeral: false });
}

async function textTeamAdd(context, parsed, actor) {
  const discordUserId = parsed.args.user || parsed.args.id || parsed.args.discord || parsed.args._[0];
  const role = parsed.args.role || parsed.args._[1];
  if (!discordUserId || !role) return plainPanel("Team add", "Use `bbtsl-team-add user=123456789012345678 role=Editor`.", { ephemeral: false });
  const response = await context.api.staffJson("POST", "/team/users", actor.discordUserId, {
    discordUserId,
    role,
    username: parsed.args.username || "",
    globalName: parsed.args.globalName || parsed.args.name || ""
  });
  return plainPanel("Team user added", `${response.user?.displayName || discordUserId} was added as ${response.user?.role || role}.`, { ephemeral: false });
}

async function textTeamEdit(context, parsed, actor) {
  const discordUserId = parsed.args.user || parsed.args.id || parsed.args.discord || parsed.args._[0];
  if (!discordUserId) return plainPanel("Team edit", "Use `bbtsl-team-edit user=123456789012345678 role=Maintainer status=active`.", { ephemeral: false });
  const response = await context.api.staffJson("PATCH", `/team/users/${discordUserId}`, actor.discordUserId, {
    role: parsed.args.role,
    status: parsed.args.status,
    username: parsed.args.username,
    globalName: parsed.args.globalName || parsed.args.name
  });
  return plainPanel("Team user updated", `${response.user?.displayName || discordUserId} was updated.`, { ephemeral: false });
}

async function textRevert(context, parsed, actor) {
  const logId = parsed.args.logId || parsed.args["log-id"] || parsed.args.auditId || parsed.args["audit-id"] || parsed.args.id || parsed.args._[0];
  if (!logId || !/^\d+$/.test(String(logId))) {
    return plainPanel("Revert", "Use `bbtsl-revert audit-id=12`. After verification, run `bbtsl-revert audit-id=12 challenge=<challenge id>`.", { ephemeral: false });
  }
  const challengeId = parsed.args.challenge || parsed.args.challengeId || parsed.args["challenge-id"] || parsed.args.reauth || parsed.args._[1];
  if (!challengeId) {
    const challenge = await context.api.createReauthChallenge(actor.discordUserId);
    const data = challenge.data || challenge;
    return plainPanel("Revert verification", `Open this Discord verification link:\n${data.authorizeUrl || "No verification URL returned."}\n\nAfter it says verification complete, run:\n\`bbtsl-revert audit-id=${logId} challenge=${data.id || "<challenge id>"}\``, { ephemeral: false });
  }
  await context.api.staffJson("POST", "/audit/revert", actor.discordUserId, {
    logId: Number(logId),
    confirmation: "I confirm the revert"
  }, { "x-bbtsl-reauth-challenge": String(challengeId) });
  return plainPanel("Audit reverted", `Audit log ${logId} was reverted and audit logged.`, { ephemeral: false });
}

async function textItem(message, context, args) {
  const query = args._.join(" ");
  if (shouldUseSearchingPanel(query)) {
    const pending = await message.reply(searchingPanel(query, { ephemeral: false }));
    return pending.edit(await buildTextItemPanel(context, query));
  }
  return message.reply(await buildTextItemPanel(context, query));
}

async function buildTextItemPanel(context, query) {
  try {
    const item = await findItem(context, query);
    const valueRange = await loadValueRange(context);
    return itemPanel(item, { ephemeral: false, websiteUrl: context.websiteUrl, valueRange });
  } catch (error) {
    if (error instanceof ItemLookupError) return itemNotFoundPanel(error.query || query, { ephemeral: false });
    throw error;
  }
}

async function textSearch(message, context, args) {
  const query = args._.join(" ") || args.search || "";
  if (query) {
    const pending = await message.reply(searchingPanel(query, { ephemeral: false }));
    return pending.edit(await buildTextSearchPanel(context, query, args, message.author.id));
  }
  return message.reply(await buildTextSearchPanel(context, query, args, message.author.id));
}

async function buildTextSearchPanel(context, query, args, userId) {
  const response = await searchItems(context, { search: query, category: args.category, demand: args.demand, trend: args.trend, sort: args.sort, limit: args.limit || 10 });
  if ((response.data || []).length) {
    return searchPanel(response.data || [], { ...(response.meta || {}), title: query ? `Search: ${query}` : "Search Results" }, { ephemeral: false, websiteUrl: context.websiteUrl });
  }

  const suggestion = await suggestItem(context, query);
  if (suggestion) {
    const ids = registerSuggestionActions(context, { query, suggestion, userId, ephemeral: false });
    return searchSuggestionPanel(query, suggestion, { ...ids, ephemeral: false });
  }

  return itemNotFoundPanel(query, { ephemeral: false });
}

async function textFavorite(context, discordUserId, args) {
  const action = String(args._[0] || args.action || "list").toLowerCase();
  try {
    if (action === "add" || action === "remove") {
      const itemQuery = args._.slice(1).join(" ") || args.item || "";
      if (!itemQuery) return plainPanel("Favorite", "Add an item after the action.", { ephemeral: false });
      const item = await findItem(context, itemQuery);
      await context.api.setFavorite(discordUserId, item.cardId, action === "add");
      return plainPanel("Favorite", `${item.name} was ${action === "add" ? "added to" : "removed from"} your favorites.`, { ephemeral: false });
    }
    const response = await context.api.favorites(discordUserId);
    const ids = Array.isArray(response.favorites) ? response.favorites.slice(0, 10) : [];
    const settled = await Promise.allSettled(ids.map((cardId) => context.api.publicGet(`/swords/${encodeURIComponent(cardId)}`)));
    const items = settled.filter((result) => result.status === "fulfilled").map((result) => result.value.data).filter(Boolean);
    return items.length ? searchPanel(items, { title: "Your Favorites" }, { ephemeral: false, websiteUrl: context.websiteUrl }) : plainPanel("Favorites", "No favorites saved.", { ephemeral: false });
  } catch (error) {
    if (error instanceof ItemLookupError) return itemNotFoundPanel(error.query, { ephemeral: false });
    if (error.status === 429) {
      return plainPanel("Favorite limit", `Try again in ${Math.max(1, Number(error.retryAfter || 0))} seconds.`, { ephemeral: false });
    }
    throw error;
  }
}

async function textStatus(context) {
  const start = Date.now();
  let ok = true;
  try {
    await context.api.publicGet("/health");
  } catch {
    ok = false;
  }
  return statusPanel({ ok, latencyMs: Date.now() - start }, { ephemeral: false });
}

async function textTeam(context) {
  const response = await context.api.publicGet("/team");
  const rows = (response.data || []).map((user) => `**${user.displayName}** - ${user.role}`).join("\n") || "No team members found.";
  return plainPanel("BBTSL Team", `Team page: [BBTSL.LOL/TEAM](https://bbtsl.lol/team)\n\n${rows}`, { ephemeral: false });
}

async function loadBotSword(context, actorDiscordId, query) {
  const item = await findItem(context, query);
  const response = await context.api.staffGet(`/swords/${encodeURIComponent(item.cardId)}`, actorDiscordId);
  return response.data || item;
}

function buildCommitPayload(item, patch, idempotencyKey) {
  return {
    idempotencyKey,
    expectedRevision: Number(item.revision || 1),
    n: patch.n ?? item.name,
    c: patch.c ?? item.category,
    v: Number(patch.v ?? item.value ?? 0),
    d: patch.d ?? item.demand ?? "N/A",
    t: patch.t ?? item.trend ?? "N/A",
    ct: patch.ct === undefined ? (item.count ?? null) : normalizeNullableInteger(patch.ct),
    descr: patch.descr ?? item.description ?? "",
    img: patch.img !== undefined ? patch.img : mediaReference(item.media?.card),
    detailMedia: patch.detailMedia !== undefined ? patch.detailMedia : mediaReference(item.media?.detail),
    slashMedia: patch.slashMedia !== undefined ? patch.slashMedia : mediaReference(item.media?.slash),
    slashAudio: patch.slashAudio !== undefined ? patch.slashAudio : mediaReference(item.media?.audio),
    finisherMedia: patch.finisherMedia !== undefined ? patch.finisherMedia : mediaReference(item.media?.finisher),
    oc: Boolean(item.flags?.ownersChoice)
  };
}

function mediaReference(media) {
  if (!media) return null;
  if (media.key) return { key: media.key };
  const value = media.original || media.medium || media.low || media.url || "";
  return value ? String(value) : null;
}

async function stageAttachment(context, actor, item, variant, attachment) {
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error("Could not download the Discord attachment.");
  const blob = await response.blob();
  const form = new FormData();
  form.append("original", blob, attachment.name || "media");
  return context.api.staffMedia("/media/stage", actor.discordUserId, form, {
    "x-bbtsl-media-variant": variant,
    "x-bbtsl-sword-name": item.name || "item",
    "x-bbtsl-idempotency-key": `bot-stage-${actor.discordUserId}-${Date.now()}`
  });
}

function auditUnavailablePanel(error, { ephemeral = false } = {}) {
  const details = describeAuditError(error);
  const body = details ? `Could not read audit logs.\n${details}` : "Could not read audit logs.";
  return plainPanel("Audit unavailable", body, { ephemeral });
}

function describeAuditError(error) {
  const parts = [];
  if (error?.status) parts.push(`Status: ${error.status}`);
  if (error?.message) parts.push(`Message: ${String(error.message).slice(0, 120)}`);
  if (error?.preview && !String(error.preview).startsWith("<!DOCTYPE")) parts.push(`Body: ${String(error.preview).slice(0, 120)}`);
  return parts.join("\n");
}

function isAuditApiFailure(error) {
  return Boolean(error?.status || error?.contentType || error?.preview);
}

function normalizeNullableInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number(value);
}
