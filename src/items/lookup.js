export class ItemLookupError extends Error {
  constructor(query) {
    super("Item not found.");
    this.name = "ItemLookupError";
    this.code = "ITEM_NOT_FOUND";
    this.query = query;
  }
}

const TRAILING_MEDIA_WORDS = /\s+(?:with\s+)?(?:finisher|vfx|slash)(?:\s+preview)?$/i;
const FILLER_WORDS = new Set(["with"]);
const MEDIA_WORDS = new Set(["finisher", "vfx", "slash", "preview"]);
const CATALOG_TTL_MS = 5 * 60 * 1000;

export async function findItem(context, query) {
  const text = String(query || "").trim();
  if (!text) throw new ItemLookupError(text);

  if (isCardIdLike(text)) {
    const cardId = normalizeCardId(text);
    try {
      const response = await context.api.publicGet(`/swords/${encodeURIComponent(cardId)}`);
      if (response.data) return response.data;
    } catch {}
    throw new ItemLookupError(text);
  }

  const candidates = buildLookupCandidates(text);
  const seen = new Map();
  for (const candidate of candidates) {
    const response = await context.api.publicGet("/swords", { search: candidate, limit: 10 }).catch(() => ({ data: [] }));
    for (const item of response.data || []) addUniqueItem(seen, item);
    const match = pickBestMatch([...seen.values()], text);
    if (match) return match;
  }

  throw new ItemLookupError(text);
}

export async function searchItems(context, params = {}) {
  const query = String(params.search || "").trim();
  const limit = normalizeLimit(params.limit || 10);
  if (!query) return context.api.publicGet("/swords", { ...params, limit });

  const first = await context.api.publicGet("/swords", { ...params, search: query, limit });
  if (first.data?.length) return first;

  const seen = new Map();
  for (const candidate of buildLookupCandidates(query).slice(1)) {
    const response = await context.api.publicGet("/swords", { ...params, search: candidate, limit }).catch(() => ({ data: [] }));
    for (const item of response.data || []) addUniqueItem(seen, item);
  }

  const ranked = rankItems([...seen.values()], query).filter((entry) => entry.score > 0).map((entry) => entry.item).slice(0, limit);
  return { ...first, data: ranked, meta: { ...(first.meta || {}), fallbackSearch: true } };
}

export async function suggestItem(context, query) {
  const text = stripLookupNoise(query);
  if (!text) return null;
  const catalog = await loadItemCatalog(context);
  const ranked = rankSuggestions(catalog, text);
  const best = ranked[0];
  return best && best.score >= suggestionThreshold(text) ? best.item : null;
}

export function shouldUseSearchingPanel(query) {
  const text = String(query || "").trim();
  return Boolean(text && !isCardIdLike(text) && significantTokens(stripLookupNoise(text)).length > 1);
}

export async function loadValueRange(context) {
  if (!context.valueRangePromise) {
    context.valueRangePromise = (async () => {
      const [minimum, maximum] = await Promise.all([
        context.api.publicGet("/swords", { sort: "value-asc", limit: 1 }),
        context.api.publicGet("/swords", { sort: "value-desc", limit: 1 })
      ]);
      return {
        minValue: minimum.data?.[0]?.value ?? 0,
        maxValue: maximum.data?.[0]?.value ?? 0
      };
    })().catch(() => null);
  }
  return context.valueRangePromise;
}

async function loadItemCatalog(context) {
  const now = Date.now();
  if (!context.itemCatalogCache || context.itemCatalogCache.expiresAt < now) {
    context.itemCatalogCache = {
      expiresAt: now + CATALOG_TTL_MS,
      promise: fetchItemCatalog(context).catch(() => [])
    };
  }
  return context.itemCatalogCache.promise;
}

async function fetchItemCatalog(context) {
  const seen = new Map();
  const requests = [
    context.api.publicGet("/swords", { limit: 250, sort: "value-desc" }),
    context.api.publicGet("/swords", { limit: 250, sort: "updated-desc" }),
    context.api.publicGet("/swords", { limit: 250 })
  ];
  const results = await Promise.allSettled(requests);
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const item of result.value.data || []) addUniqueItem(seen, item);
  }
  return [...seen.values()];
}

function buildLookupCandidates(value) {
  const cleaned = value.replace(/["']/g, " ").replace(/\s+/g, " ").trim();
  const candidates = [cleaned];
  const strippedMediaSuffix = cleaned.replace(TRAILING_MEDIA_WORDS, "").trim();
  if (strippedMediaSuffix && strippedMediaSuffix !== cleaned) candidates.push(strippedMediaSuffix);
  const withoutFillers = strippedMediaSuffix.split(/\s+/).filter((part) => !FILLER_WORDS.has(part.toLowerCase())).join(" ").trim();
  if (withoutFillers && withoutFillers !== cleaned && withoutFillers !== strippedMediaSuffix) candidates.push(withoutFillers);
  for (const token of significantTokens(withoutFillers || strippedMediaSuffix || cleaned)) candidates.push(token);
  return [...new Set(candidates.filter(Boolean))].slice(0, 8);
}

function addUniqueItem(seen, item) {
  if (!item) return;
  const key = normalizeSearch(item.cardId || item.name || JSON.stringify(item));
  if (key && !seen.has(key)) seen.set(key, item);
}

function pickBestMatch(items, originalQuery) {
  const ranked = rankItems(items, originalQuery);
  const best = ranked[0];
  if (!best) return null;
  return best.score >= minimumLookupScore(originalQuery) ? best.item : null;
}

function rankItems(items, originalQuery) {
  if (!Array.isArray(items) || !items.length) return [];
  return items.map((item) => ({ item, score: scoreItem(item, originalQuery) }))
    .sort((left, right) => right.score - left.score);
}

function scoreItem(item, originalQuery) {
  const target = normalizeSearch(stripLookupNoise(originalQuery));
  const targetTokens = significantTokens(target);
  const name = normalizeSearch(item.name);
  const cardId = normalizeSearch(item.cardId);
  const requestedCardId = normalizeSearch(normalizeCardId(originalQuery));

  if (cardId && cardId === requestedCardId) return 10000;
  if (name && name === target) return 9000;
  if (name && target && name.includes(target)) return 8000;
  if (targetTokens.length && targetTokens.every((token) => name.split(" ").includes(token))) return 7000 + targetTokens.length;
  if (targetTokens.length && targetTokens.every((token) => name.includes(token))) return 6500 + targetTokens.length;
  const matchedTokens = targetTokens.filter((token) => name.includes(token)).length;
  if (targetTokens.length === 1 && matchedTokens === 1) return 4000;
  if (matchedTokens) return 1000 + matchedTokens;
  return 0;
}

function rankSuggestions(items, query) {
  const queryTokens = significantTokens(query);
  if (!queryTokens.length || !Array.isArray(items)) return [];
  return items.map((item) => ({ item, score: suggestionScore(item, queryTokens) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
}

function suggestionScore(item, queryTokens) {
  const nameTokens = significantTokens(item.name);
  if (!nameTokens.length) return 0;
  const similarities = queryTokens.map((queryToken) => Math.max(...nameTokens.map((nameToken) => tokenSimilarity(queryToken, nameToken))));
  const average = similarities.reduce((sum, value) => sum + value, 0) / similarities.length;
  const allClose = similarities.every((value) => value >= 0.72);
  const oneStrong = similarities.some((value) => value >= 0.78);
  if (!allClose && !oneStrong) return 0;
  const coverageBonus = allClose ? 200 : 0;
  return Math.round(average * 1000) + coverageBonus + Math.min(nameTokens.length, 5);
}

function tokenSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if ((left.length >= 3 && right.includes(left)) || (right.length >= 3 && left.includes(right))) return 0.9;
  const distance = levenshtein(left, right);
  return 1 - (distance / Math.max(left.length, right.length));
}

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let last = i - 1;
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const old = previous[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, last + cost);
      last = old;
    }
  }
  return previous[right.length];
}

function suggestionThreshold(query) {
  return significantTokens(query).length > 1 ? 820 : 760;
}

function minimumLookupScore(originalQuery) {
  const tokens = significantTokens(stripLookupNoise(originalQuery));
  return tokens.length > 1 ? 6500 : 4000;
}

function stripLookupNoise(value) {
  return String(value || "").replace(TRAILING_MEDIA_WORDS, "").split(/\s+/)
    .filter((part) => {
      const token = part.toLowerCase().replace(/[^a-z0-9]+/g, "");
      return token && !FILLER_WORDS.has(token) && !MEDIA_WORDS.has(token);
    })
    .join(" ")
    .trim();
}

function significantTokens(value) {
  return normalizeSearch(value).split(" ").filter((token) => token.length >= 2 && !FILLER_WORDS.has(token) && !MEDIA_WORDS.has(token));
}

function normalizeLimit(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, 25) : 10;
}

function normalizeSearch(value) {
  return String(value || "").toLowerCase().replace(/^#/, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function normalizeCardId(value) {
  const text = String(value || "").trim();
  return text.startsWith("#") ? text : `#${text}`;
}

function isCardIdLike(value) {
  return /^#?[A-Za-z0-9]{6}$/.test(String(value || "").trim());
}
