import { auditPanel, helpPanel, itemNotFoundPanel, itemPanel, plainPanel, searchPanel, searchingPanel, searchSuggestionPanel, statusPanel } from "../components/panels.js";
import { registerSuggestionActions, resolveSuggestionAction } from "../interactions/suggestions.js";
import { findItem, ItemLookupError, loadValueRange, searchItems, shouldUseSearchingPanel, suggestItem } from "../items/lookup.js";
import { getActorOrNull, isStaffCommand, LOGIN_REFRESH_MESSAGE, mayUseStaffCommand, requiredCapability } from "../security/policy.js";

const TEAM_BASE_PERMISSION = "team:view:self";
const SLOT_TO_PAYLOAD_FIELD = { card: "img", detail: "detailMedia", slash: "slashMedia", audio: "slashAudio", finisher: "finisherMedia" };
const SLOT_TO_VARIANT = { card: "card-image", detail: "detail", slash: "slash", audio: "slash-audio", finisher: "finisher" };

export async function handleChatInput(interaction, context) {
  const name = interaction.commandName;
  let actor = await getActorOrNull(context.api, interaction.user.id);

  if (isStaffCommand(name)) {
    const decision = await mayUseStaffCommand(context.api, interaction.user.id, name);
    actor = decision.actor;
    if (!decision.allowed) {
      const body = decision.reason === "login_refresh"
        ? (decision.message || LOGIN_REFRESH_MESSAGE)
        : "Your BBTSL role cannot use that command.";
      return interaction.reply(plainPanel(decision.reason === "login_refresh" ? "Login refresh required" : "Access denied", body, { ephemeral: true }));
    }
  } else {
    const required = requiredCapability(name);
    if (required) return interaction.reply(plainPanel("Access denied", "Your BBTSL role cannot use that command.", { ephemeral: true }));
  }

  if (name === "help") return interaction.reply(helpPanel(actor, { ephemeral: shouldKeepHelpPrivate(actor) }));
  if (name === "profile") return interaction.reply(helpPanel(actor, { ephemeral: true }));
  if (name === "status") return interaction.reply(await buildStatus(context));
  if (name === "item") return handleItemInteraction(interaction, context);
  if (name === "search") return handleSearchInteraction(interaction, context);
  if (name === "top") return interaction.reply(await buildTop(interaction, context));
  if (name === "updated") return interaction.reply(await buildUpdated(interaction, context));
  if (name === "team") return interaction.reply(await buildTeam(context));
  if (name === "compare") return interaction.reply(await buildCompare(interaction, context));
  if (name === "favorite") return interaction.reply(await buildFavorite(interaction, context));

  if (name === "audit") return interaction.reply(await buildAudit(interaction, context, actor));
  if (name === "export") return interaction.reply(await buildExport(context, actor));
  if (name === "edit") return interaction.reply(await buildEdit(interaction, context, actor));
  if (name === "create") return interaction.reply(await buildCreate(interaction, context, actor));
  if (name === "delete") return interaction.reply(await buildDelete(interaction, context, actor));
  if (name === "media") return handleMediaInteraction(interaction, context, actor);
  if (name === "team-list" || name === "team-user") return interaction.reply(await buildTeamManageList(context, actor));
  if (name === "team-add") return interaction.reply(await buildTeamAdd(interaction, context, actor));
  if (name === "team-edit") return interaction.reply(await buildTeamEdit(interaction, context, actor));
  if (name === "revert") return interaction.reply(await buildRevertStart(interaction, context, actor));

  return interaction.reply(plainPanel("Not ready", "This command is not wired yet.", { ephemeral: true }));
}

export async function handleButtonInteraction(interaction, context) {
  const resolved = resolveSuggestionAction(context, interaction.customId);
  if (!resolved) return;
  if (resolved.expired) {
    return interaction.reply(plainPanel("Suggestion expired", "Run the search again.", { ephemeral: true }));
  }

  const { state } = resolved;
  if (state.userId && state.userId !== interaction.user.id) {
    return interaction.reply(plainPanel("Not yours", "Run your own search for this item.", { ephemeral: true }));
  }

  if (resolved.action === "no") {
    return interaction.update(itemNotFoundPanel(state.query, { ephemeral: state.ephemeral }));
  }

  try {
    const item = await findItem(context, state.cardId || state.suggestionName);
    const valueRange = await loadValueRange(context);
    return interaction.update(itemPanel(item, { ephemeral: state.ephemeral, websiteUrl: context.websiteUrl, valueRange }));
  } catch (error) {
    if (error instanceof ItemLookupError) return interaction.update(itemNotFoundPanel(state.query, { ephemeral: state.ephemeral }));
    throw error;
  }
}

async function handleItemInteraction(interaction, context) {
  const query = option(interaction, "item");
  const ephemeral = false;
  if (shouldUseSearchingPanel(query)) {
    await interaction.reply(searchingPanel(query, { ephemeral }));
    return interaction.editReply(await buildItemPayload(context, query, ephemeral));
  }
  return interaction.reply(await buildItemPayload(context, query, ephemeral));
}

async function buildItemPayload(context, query, ephemeral) {
  try {
    const item = await findItem(context, query);
    const valueRange = await loadValueRange(context);
    return itemPanel(item, { ephemeral, websiteUrl: context.websiteUrl, valueRange });
  } catch (error) {
    if (error instanceof ItemLookupError) return itemNotFoundPanel(error.query || query, { ephemeral });
    throw error;
  }
}

async function handleSearchInteraction(interaction, context) {
  const query = option(interaction, "query");
  const ephemeral = false;
  if (query) {
    await interaction.reply(searchingPanel(query, { ephemeral }));
    return interaction.editReply(await buildSearchPayload(context, query, {
      category: option(interaction, "category"),
      limit: 10,
      ephemeral,
      userId: interaction.user.id
    }));
  }
  return interaction.reply(await buildSearchPayload(context, query, { category: option(interaction, "category"), limit: 10, ephemeral, userId: interaction.user.id }));
}

async function buildSearchPayload(context, query, { category = "", demand = "", trend = "", sort = "", limit = 10, ephemeral = true, userId = "" } = {}) {
  const response = await searchItems(context, { search: query, category, demand, trend, sort, limit });
  if ((response.data || []).length) {
    return searchPanel(response.data || [], { ...(response.meta || {}), title: query ? `Search: ${query}` : "Search Results" }, { ephemeral, websiteUrl: context.websiteUrl });
  }

  const suggestion = await suggestItem(context, query);
  if (suggestion) {
    const ids = registerSuggestionActions(context, { query, suggestion, userId, ephemeral });
    return searchSuggestionPanel(query, suggestion, { ...ids, ephemeral });
  }

  return itemNotFoundPanel(query, { ephemeral });
}

async function buildTop(interaction, context) {
  const metric = option(interaction, "metric") || "value";
  const sort = { value: "value-desc", demand: "demand-desc", count: "count-desc", trend: "trend-rank" }[metric] || "value-desc";
  const response = await context.api.publicGet("/swords", { sort, category: option(interaction, "category"), limit: 10 });
  return searchPanel(response.data || [], { ...(response.meta || {}), title: `Top Items by ${metric}` }, { ephemeral: false, websiteUrl: context.websiteUrl });
}

async function buildUpdated(interaction, context) {
  const response = await context.api.publicGet("/swords", { sort: "updated-desc", category: option(interaction, "category"), limit: 10 });
  return searchPanel(response.data || [], { ...(response.meta || {}), title: "Recently Updated Items" }, { ephemeral: false, websiteUrl: context.websiteUrl });
}

async function buildTeam(context) {
  const response = await context.api.publicGet("/team");
  const rows = (response.data || []).map((user) => `**${user.displayName}** - ${user.role}`).join("\n") || "No team members found.";
  return plainPanel("BBTSL Team", `Team page: [BBTSL.LOL/TEAM](https://bbtsl.lol/team)\n\n${rows}`, { ephemeral: false });
}

async function buildCompare(interaction, context) {
  const ephemeral = false;
  const firstQuery = option(interaction, "first");
  const secondQuery = option(interaction, "second");
  try {
    const first = await findItem(context, firstQuery);
    const second = await findItem(context, secondQuery);
    const firstValue = first.flags?.ownersChoice ? "Owner's Choice" : Number(first.value).toLocaleString("en-US");
    const secondValue = second.flags?.ownersChoice ? "Owner's Choice" : Number(second.value).toLocaleString("en-US");
    return plainPanel("Item Compare", `**${first.name}** - ${first.cardId}\nValue: ${firstValue}\nDemand: ${first.demand || "N/A"}\n\n**${second.name}** - ${second.cardId}\nValue: ${secondValue}\nDemand: ${second.demand || "N/A"}`, { ephemeral });
  } catch (error) {
    if (error instanceof ItemLookupError) return itemNotFoundPanel(error.query, { ephemeral });
    throw error;
  }
}

async function buildFavorite(interaction, context) {
  const action = option(interaction, "action") || "list";
  const ephemeral = true;
  try {
    if (action === "add" || action === "remove") {
      const itemQuery = option(interaction, "item");
      if (!itemQuery) return plainPanel("Favorite", "Pick an item first.", { ephemeral: true });
      const item = await findItem(context, itemQuery);
      await context.api.setFavorite(interaction.user.id, item.cardId, action === "add");
      const verb = action === "add" ? "added to" : "removed from";
      return plainPanel("Favorite", `${item.name} was ${verb} your favorites.`, { ephemeral });
    }
    const items = await loadFavoriteItems(context, interaction.user.id);
    return items.length
      ? searchPanel(items, { title: "Your Favorites" }, { ephemeral, websiteUrl: context.websiteUrl })
      : plainPanel("Favorites", "No favorites saved.", { ephemeral });
  } catch (error) {
    if (error instanceof ItemLookupError) return itemNotFoundPanel(error.query, { ephemeral });
    if (error.status === 429) {
      const retryAfter = Math.max(1, Number(error.retryAfter || 0));
      return plainPanel("Favorite limit", `Try again in ${retryAfter} seconds.`, { ephemeral: true });
    }
    throw error;
  }
}

async function buildAudit(interaction, context, actor) {
  try {
    const response = await context.api.staffGet("/audit", actor.discordUserId, { cardId: option(interaction, "item"), source: option(interaction, "source"), limit: 10 });
    const logs = Array.isArray(response.logs) ? response.logs : Array.isArray(response.data) ? response.data : [];
    return auditPanel(logs, { ephemeral: true });
  } catch (error) {
    if (isAuditApiFailure(error)) return auditUnavailablePanel(error, { ephemeral: true });
    throw error;
  }
}

async function buildExport(context, actor) {
  const response = await context.api.staffGet("/export", actor.discordUserId);
  const body = Buffer.from(JSON.stringify(response, null, 2), "utf8");
  return { files: [{ attachment: body, name: `bbtsl-export-${new Date().toISOString().slice(0, 10)}.json` }], ephemeral: true };
}

async function buildEdit(interaction, context, actor) {
  const item = await loadBotSword(context, actor.discordUserId, option(interaction, "item"));
  const patch = {};
  for (const [source, target] of [["value", "v"], ["demand", "d"], ["trend", "t"], ["count", "ct"]]) {
    const value = option(interaction, source);
    if (value !== "") patch[target] = value;
  }
  if (!Object.keys(patch).length) return plainPanel("Edit", "Set at least one field: value, demand, trend, or count.", { ephemeral: true });
  const body = buildCommitPayload(item, patch, `bot-edit-${actor.discordUserId}-${Date.now()}`);
  const response = await context.api.staffJson("PUT", `/swords/${encodeURIComponent(item.cardId)}`, actor.discordUserId, body);
  return plainPanel("Item updated", `${response.sword?.n || item.name} was updated and audit logged.`, { ephemeral: true });
}

async function buildCreate(interaction, context, actor) {
  const body = {
    idempotencyKey: `bot-create-${actor.discordUserId}-${Date.now()}`,
    expectedRevision: 0,
    n: option(interaction, "name"),
    c: option(interaction, "category"),
    v: Number(option(interaction, "value")),
    d: "N/A",
    t: "Stable",
    ct: null,
    descr: "",
    img: null,
    detailMedia: null,
    slashMedia: null,
    slashAudio: null,
    finisherMedia: null,
    oc: false
  };
  const response = await context.api.staffJson("POST", "/swords", actor.discordUserId, body);
  return plainPanel("Item created", `${response.sword?.n || body.n} was created as ${response.sword?.cardId || "a new card"}.`, { ephemeral: true });
}

async function buildDelete(interaction, context, actor) {
  const item = await loadBotSword(context, actor.discordUserId, option(interaction, "item"));
  await context.api.staffJson("DELETE", `/swords/${encodeURIComponent(item.cardId)}`, actor.discordUserId, { confirmation: "delete" });
  return plainPanel("Item deleted", `${item.name} ${item.cardId} was deleted and audit logged.`, { ephemeral: true });
}

async function handleMediaInteraction(interaction, context, actor) {
  const item = await loadBotSword(context, actor.discordUserId, option(interaction, "item"));
  const slot = option(interaction, "slot");
  const payloadField = SLOT_TO_PAYLOAD_FIELD[slot];
  const variant = SLOT_TO_VARIANT[slot];
  if (!payloadField || !variant) return interaction.reply(plainPanel("Media", "Unknown media slot.", { ephemeral: true }));
  const remove = Boolean(option(interaction, "remove"));
  const attachment = attachmentOption(interaction, "file");
  await interaction.deferReply({ ephemeral: true });
  const patch = {};
  if (remove) {
    patch[payloadField] = null;
  } else {
    if (!attachment?.url) return interaction.editReply(plainPanel("Media", "Attach a media file or set remove:true.", { ephemeral: true }));
    const staged = await stageAttachment(context, actor, item, variant, attachment);
    patch[payloadField] = { stagedMediaId: staged.stagedMediaId };
  }
  const body = buildCommitPayload(item, patch, `bot-media-${actor.discordUserId}-${Date.now()}`);
  await context.api.staffJson("PUT", `/swords/${encodeURIComponent(item.cardId)}`, actor.discordUserId, body);
  return interaction.editReply(plainPanel("Media updated", `${slot} media for ${item.name} was ${remove ? "removed" : "updated"}.`, { ephemeral: true }));
}

async function buildTeamManageList(context, actor) {
  const response = await context.api.staffGet("/team/manage", actor.discordUserId);
  const rows = (response.team || response.data || []).map((user) => `**${user.displayName || user.globalName || user.discordUserId}** - ${user.role} - ${user.status || "active"}`).slice(0, 20).join("\n") || "No team users found.";
  return plainPanel("Team users", rows, { ephemeral: true });
}

async function buildTeamAdd(interaction, context, actor) {
  const discordUserId = option(interaction, "user");
  const role = option(interaction, "role");
  const response = await context.api.staffJson("POST", "/team/users", actor.discordUserId, {
    discordUserId,
    role,
    username: option(interaction, "username"),
    globalName: option(interaction, "global-name")
  });
  return plainPanel("Team user added", `${response.user?.displayName || discordUserId} was added as ${response.user?.role || role}.`, { ephemeral: true });
}

async function buildTeamEdit(interaction, context, actor) {
  const discordUserId = option(interaction, "user");
  const body = {};
  for (const [optionName, bodyName] of [["role", "role"], ["status", "status"], ["username", "username"], ["global-name", "globalName"]]) {
    const value = option(interaction, optionName);
    if (value !== "") body[bodyName] = value;
  }
  if (!Object.keys(body).length) return plainPanel("Team edit", "Set role, status, username, or global-name.", { ephemeral: true });
  const response = await context.api.staffJson("PATCH", `/team/users/${discordUserId}`, actor.discordUserId, body);
  return plainPanel("Team user updated", `${response.user?.displayName || discordUserId} was updated.`, { ephemeral: true });
}

async function buildRevertStart(interaction, context, actor) {
  const logId = option(interaction, "audit-id");
  if (!logId) return plainPanel("Revert", "Audit ID is required.", { ephemeral: true });
  const challenge = await context.api.createReauthChallenge(actor.discordUserId);
  const data = challenge.data || challenge;
  return plainPanel("Revert verification", `Open this Discord verification link:\n${data.authorizeUrl || "No verification URL returned."}\n\nAfter it says verification complete, run:\n\`bbtsl-revert audit-id=${logId} challenge=${data.id || "<challenge id>"}\``, { ephemeral: true });
}

async function buildStatus(context) {
  const start = Date.now();
  let ok = true;
  try {
    await context.api.publicGet("/health");
  } catch {
    ok = false;
  }
  return statusPanel({ ok, latencyMs: Date.now() - start }, { ephemeral: false });
}

async function loadFavoriteItems(context, discordUserId) {
  const response = await context.api.favorites(discordUserId);
  const favoriteIds = Array.isArray(response.favorites) ? response.favorites.slice(0, 10) : [];
  const settled = await Promise.allSettled(favoriteIds.map((cardId) => context.api.publicGet(`/swords/${encodeURIComponent(cardId)}`)));
  return settled.filter((result) => result.status === "fulfilled").map((result) => result.value.data).filter(Boolean);
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

function shouldKeepHelpPrivate(actor) {
  const permissions = Array.isArray(actor?.permissions) ? actor.permissions : [];
  return permissions.some((permission) => permission && permission !== TEAM_BASE_PERMISSION);
}

function auditUnavailablePanel(error, { ephemeral = true } = {}) {
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

function option(interaction, name) {
  const resolved = interaction.options.get(name);
  if (!resolved) return "";
  return resolved.value ?? "";
}

function attachmentOption(interaction, name) {
  if (typeof interaction.options.getAttachment === "function") return interaction.options.getAttachment(name);
  return interaction.options.get(name)?.attachment || null;
}

function normalizeNullableInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number(value);
}
