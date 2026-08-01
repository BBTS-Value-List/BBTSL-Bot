import { randomUUID } from "node:crypto";

const SUGGESTION_TTL_MS = 5 * 60 * 1000;

export function registerSuggestionActions(context, { query, suggestion, userId = "", ephemeral = false }) {
  if (!context.suggestionActions) context.suggestionActions = new Map();
  pruneSuggestionActions(context);
  const key = randomUUID().replace(/-/g, "").slice(0, 12);
  context.suggestionActions.set(key, {
    query,
    userId,
    ephemeral,
    cardId: suggestion.cardId,
    suggestionName: suggestion.name,
    expiresAt: Date.now() + SUGGESTION_TTL_MS
  });
  return {
    yesCustomId: `bbtsl:suggest:yes:${key}`,
    noCustomId: `bbtsl:suggest:no:${key}`
  };
}

export function resolveSuggestionAction(context, customId) {
  const parsed = parseSuggestionCustomId(customId);
  if (!parsed) return null;

  const state = context.suggestionActions?.get(parsed.key);
  if (!state || state.expiresAt < Date.now()) {
    if (state) context.suggestionActions.delete(parsed.key);
    return { ...parsed, expired: true, state: null };
  }

  context.suggestionActions.delete(parsed.key);
  return { ...parsed, expired: false, state };
}

function pruneSuggestionActions(context) {
  const now = Date.now();
  for (const [key, state] of context.suggestionActions.entries()) {
    if (state.expiresAt < now) context.suggestionActions.delete(key);
  }
}

function parseSuggestionCustomId(customId) {
  const match = String(customId || "").match(/^bbtsl:suggest:(yes|no):([a-f0-9]{12})$/i);
  return match ? { action: match[1], key: match[2] } : null;
}
