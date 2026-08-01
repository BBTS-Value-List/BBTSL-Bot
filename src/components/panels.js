import { actionRow, button, container, mediaGallery, section, separator, text, thumbnail, v2 } from "./v2.js";

const INTERACTION_COLOR = 0xfe883e;
const TRADE_TOKEN = "<:token:1531270254389362759>";
const LOADING_EMOJI = "<a:loading:1531277805122355311>";
const VALUE_BAR_STOPS = ["#4a5a78", "#5573c9", "#7d5fd9", "#a34fd0", "#d94f9e", "#e8636b", "#e88a4f", "#efab4a", "#f4cf5c"];
const FOOTER_TEXT = "[BBTSL](https://bbtsl.lol) - Powered by [PVEstrap](https://pvestrap.com)";
const LIST_ITEM_LIMIT = 10;

const PUBLIC_COMMAND_LINES = [
  "`/item item:<name or #ID>` - Item card with value, stats, media, and previews.",
  "`/search query:<text>` - Find items by name, ID, demand, trend, or category.",
  "`/compare first:<item> second:<item>` - Compare two item values.",
  "`/top metric:<value|demand|count|trend>` - Ranked item list.",
  "`/updated` - Recently updated items.",
  "`/favorite list|add|remove` - Saved favorites.",
  "`/team`, `/status`, `/help` - Team list, service status, and this page."
];

const TEXT_COMMAND_LINES = [
  "`bbtsl-item #ABC123` - Open an item card.",
  "`bbtsl-item <item name>` - Open an item by name.",
  "`bbtsl-search dragon blade` - Search items.",
  "`bbtsl-favorite add #ABC123` - Save an item.",
  "`bbtsl-favorite remove #ABC123` - Remove a saved item."
];

const STAFF_COMMANDS = [
  { name: "bbtsl-profile", permission: null, description: "Show your team role.", example: "bbtsl-profile" },
  { name: "bbtsl-edit", permission: "sword:update", description: "Change value, demand, trend, or count.", example: "bbtsl-edit #ABC123 value=55000 demand=Medium" },
  { name: "bbtsl-media", permission: "media:update", description: "Stage, replace, or remove item media.", example: "bbtsl-media #ABC123 slot=slash" },
  { name: "bbtsl-create", permission: "sword:create", description: "Create a new item.", example: "bbtsl-create name=Frost Blade category=LTM value=55000" },
  { name: "bbtsl-delete", permission: "sword:delete", description: "Delete an item.", example: "bbtsl-delete #ABC123" },
  { name: "bbtsl-export", permission: "data:export", description: "Download the current dataset as JSON.", example: "bbtsl-export" },
  { name: "bbtsl-audit", permission: "audit:view", description: "Search recent audit entries.", example: "bbtsl-audit item=#ABC123" },
  { name: "bbtsl-revert", permission: "audit:revert", description: "Start a revert from an audit entry.", example: "bbtsl-revert audit-id=123" },
  { name: "bbtsl-team-list", permission: "team:manage", description: "List team users.", example: "bbtsl-team-list" },
  { name: "bbtsl-team-add", permission: "team:manage", description: "Add a team user.", example: "bbtsl-team-add user=123456789012345678 role=Editor" },
  { name: "bbtsl-team-edit", permission: "team:manage", description: "Change a team user's role or status.", example: "bbtsl-team-edit user=123456789012345678 role=Maintainer" }
];

export function itemPanel(item, { ephemeral = false, websiteUrl = "https://bbtsl.lol", valueRange = null } = {}) {
  const cardId = String(item.cardId || "").toUpperCase();
  const itemUrl = itemUrlFor(websiteUrl, cardId);
  const category = item.category || "Unknown";
  const accentColor = getValueAccent(item.value, valueRange);
  const value = formatTokenValue(item);
  const updated = formatDate(item.updatedAt);
  const cardUrl = fullMediaUrl(item.media?.card, websiteUrl);
  const detailUrl = fullMediaUrl(item.media?.detail, websiteUrl);
  const slashUrl = fullMediaUrl(item.media?.slash, websiteUrl);
  const finisherUrl = fullMediaUrl(item.media?.finisher, websiteUrl);
  const combinedPreviewItems = [
    detailUrl ? { url: detailUrl, description: "VFX Preview" } : null,
    slashUrl ? { url: slashUrl, description: "Slash Preview" } : null
  ].filter(Boolean);
  const combinePreviewLine = Boolean(finisherUrl && combinedPreviewItems.length);

  const children = [
    text(`# **${escapeMd(item.name || "Unknown Item")}**   ${categoryLabel(category)}`)
  ];

  if (cardUrl) {
    children.push(mediaGallery([{ url: cardUrl, description: "Item Preview" }]));
  }

  children.push(text(buildStatsLine(item)));
  children.push(text(`# ${value}`));

  if (item.description) {
    children.push(separator());
    children.push(text(formatDescription(item.description)));
  }

  if (combinePreviewLine) {
    children.push(separator(2));
    children.push(text("# VFX PREVIEW • SLASH PREVIEW"));
    children.push(mediaGallery(combinedPreviewItems));
  } else {
    if (detailUrl) {
      children.push(separator(2));
      children.push(text("# VFX PREVIEW"));
      children.push(mediaGallery([{ url: detailUrl, description: "VFX Preview" }]));
    }

    if (slashUrl) {
      children.push(text("# SLASH PREVIEW"));
      children.push(mediaGallery([{ url: slashUrl, description: "Slash Preview" }]));
    }
  }

  if (finisherUrl) {
    children.push(text("# FINISHER PREVIEW"));
    children.push(mediaGallery([{ url: finisherUrl, description: "Finisher Preview" }]));
  }

  children.push(text(`${updated ? `UPDATED ${updated}` : "UPDATED UNKNOWN"}${cardId ? ` • [${cardId}](${itemUrl})` : ""}`));

  return v2([container(children, accentColor)], ephemeral);
}

export function searchPanel(items, meta = {}, { ephemeral = true, websiteUrl = "https://bbtsl.lol" } = {}) {
  const title = meta.title || "BBTSL Items";
  const visibleItems = items.slice(0, LIST_ITEM_LIMIT);
  const hasMore = Boolean(meta.hasMore || items.length > visibleItems.length);
  const parts = [text(`# ${title}\n${items.length ? "Use `/item` with an ID to open a full card." : "No matching items."}`)];

  for (const item of visibleItems) {
    const cardId = String(item.cardId || "").toUpperCase();
    const itemUrl = itemUrlFor(websiteUrl, cardId);
    const cardUrl = fullMediaUrl(item.media?.card, websiteUrl);
    const idLine = cardId ? `[${cardId}](${itemUrl})` : itemUrl;
    const line = [
      `## **${escapeMd(item.name || "Unknown Item")}** ${categoryLabel(item.category || "Unknown")}`,
      `${formatTokenValue(item)} - ${formatMetric(item.demand)} demand - ${trendLabel(item.trend)} - Count ${formatMetric(item.count)}`,
      idLine
    ].join("\n");
    parts.push(cardUrl ? section([text(line)], thumbnail(cardUrl, item.name || "Item Preview")) : text(line));
  }

  if (hasMore) {
    parts.push(text("Use a more specific search to narrow the list."));
  }
  return v2([container(parts, INTERACTION_COLOR)], ephemeral);
}

export function searchingPanel(query = "", { ephemeral = true } = {}) {
  const parts = [
    text(`# ${LOADING_EMOJI} Searching...`)
  ];
  const cleanQuery = String(query || "").trim();
  if (cleanQuery) parts.push(text(`Query: ${escapeMd(cleanQuery)}`));
  return v2([container(parts, INTERACTION_COLOR)], ephemeral);
}

export function searchSuggestionPanel(query, item, { yesCustomId, noCustomId, ephemeral = true } = {}) {
  const name = item?.name || "that item";
  const parts = [
    text(`# Did you mean ${escapeMd(name)}?`),
    separator(),
    text(`No item matched \"${escapeMd(query || "that search")}\".`),
    actionRow([
      button(yesCustomId, "Yes", 3),
      button(noCustomId, "No", 4)
    ])
  ];
  return v2([container(parts, INTERACTION_COLOR)], ephemeral);
}

export function helpPanel(actor = null, { ephemeral = true } = {}) {
  const parts = [
    text("# BBTSL Help"),
    separator(),
    text(`## Public commands\n${PUBLIC_COMMAND_LINES.join("\n")}`),
    text(`## Text examples\n${TEXT_COMMAND_LINES.join("\n")}`)
  ];

  if (actor) {
    const staff = commandsForActor(actor);
    parts.push(separator());
    parts.push(text(`## Team\nRole: ${escapeMd(actor.role || "Unknown")}`));
    parts.push(text(`## Staff commands\n${staff.length ? staff.map(formatStaffCommand).join("\n") : "No staff commands for this role."}`));
  } else {
    parts.push(separator());
    parts.push(text("## Staff commands\nSign in on BBTSL to show commands for your role."));
  }

  addFooter(parts);
  return v2([container(parts, INTERACTION_COLOR)], ephemeral);
}

export function botMentionPanel({ includeInvite = false, ephemeral = false } = {}) {
  const lines = [
    "BBTSL tracks Blade Ball item values, demand, trends, counts, and media previews.",
    "Use `/help` for commands, or try `/item` and `/search`.",
    "Website: [BBTSL.LOL](https://bbtsl.lol)"
  ];
  if (includeInvite) {
    lines.push("Server: [Join the BBTSL Discord](https://discord.gg/xSwJNqPSSR)");
  }
  return plainPanel("BBTSL", lines.join("\n"), { ephemeral });
}

export function itemNotFoundPanel(query, { ephemeral = true } = {}) {
  const raw = String(query || "").trim();
  const label = isCardIdLike(raw) ? `item ID ${normalizeCardId(raw).toUpperCase()}` : `item named \"${raw || "that"}\"`;
  return plainPanel("Item not found", `Could not find ${label}.`, { ephemeral, footer: false });
}

export function statusPanel(status, { ephemeral = true } = {}) {
  const parts = [
    text("# BBTSL Status"),
    separator(),
    text(`API: ${status.ok ? "Online" : "Unavailable"}\nLatency: ${formatNumber(status.latencyMs)} ms\nBot uptime: ${formatDuration(process.uptime())}`)
  ];
  addFooter(parts);
  return v2([container(parts, INTERACTION_COLOR)], ephemeral);
}

export function auditPanel(logs, { ephemeral = true } = {}) {
  const parts = [text("# BBTSL Audit")];
  if (!logs.length) {
    parts.push(text("No audit records found."));
  } else {
    for (const log of logs.slice(0, 10)) {
      parts.push(separator());
      parts.push(text(`## #${log.id} - ${escapeMd(log.actionType || "audit")}\nTarget: ${escapeMd(log.entityPublicId || "collection")}\nSource: ${escapeMd(log.source || "website")}\nCreated: ${escapeMd(log.createdAt || "Unknown")}\n${escapeMd(log.summary || "No summary.")}`));
    }
  }
  addFooter(parts);
  return v2([container(parts, INTERACTION_COLOR)], ephemeral);
}

export function plainPanel(title, body, { ephemeral = true, footer = true } = {}) {
  const parts = [
    text(`# ${escapeMd(title)}`),
    separator(),
    text(String(body || ""))
  ];
  if (footer) addFooter(parts);
  return v2([container(parts, INTERACTION_COLOR)], ephemeral);
}

function addFooter(parts) {
  parts.push(separator());
  parts.push(text(FOOTER_TEXT));
}

function buildStatsLine(item) {
  return [
    "**DEMAND** - **TREND** - **COUNT**",
    `${formatMetric(item.demand)} - ${trendLabel(item.trend)} - ${formatMetric(item.count)}`
  ].join("\n");
}

function formatStaffCommand(command) {
  return `\`${command.name}\` - ${command.description}\nExample: \`${command.example}\``;
}

function formatDescription(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim().slice(0, 850);
  if (!normalized) return "No description.";
  const chunks = wrapText(normalized, 56).slice(0, 5);
  return chunks.map((line) => `**${escapeMd(line)}**`).join("\n");
}

function wrapText(value, width) {
  const out = [];
  let line = "";
  for (const word of String(value || "").split(/\s+/)) {
    if (!word) continue;
    if (`${line} ${word}`.trim().length > width && line) {
      out.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) out.push(line);
  return out;
}

function commandsForActor(actor) {
  const permissions = new Set(actor.permissions || []);
  return STAFF_COMMANDS.filter((command) => !command.permission || permissions.has(command.permission));
}

function fullMediaUrl(media, base) {
  if (!media) return "";
  const value = typeof media === "string"
    ? media
    : (media.original || media.full || media.url || media.medium || media.low || "");
  return forceFullQuality(absolutize(value, base));
}

function forceFullQuality(value) {
  if (!value) return "";
  return String(value)
    .replace(/%2Fmedium%2F/gi, "%2Ffull%2F")
    .replace(/\/medium\//gi, "/full/")
    .replace(/--medium(?=\.[a-z0-9]+(?:[?#]|$))/i, "--original");
}

function absolutize(value, base) {
  if (!value) return "";
  try {
    return new URL(value, base).toString();
  } catch {
    return "";
  }
}

function itemUrlFor(websiteUrl, cardId) {
  const id = String(cardId || "").replace(/^#/, "");
  return `${String(websiteUrl || "https://bbtsl.lol").replace(/\/+$/, "")}/?item=${encodeURIComponent(id)}`;
}

function formatTokenValue(item) {
  const value = formatValue(item);
  const token = value === "Owner's Choice" ? "" : `${TRADE_TOKEN} `;
  return `${token}${value}`;
}

function formatValue(item) {
  if (item.flags?.ownersChoice) return "Owner's Choice";
  if (item.value === null || item.value === undefined || item.value === "") return "N/A";
  return formatNumber(item.value);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatMetric(value) {
  if (value === null || value === undefined) return "N/A";
  const textValue = String(value).trim();
  return textValue ? escapeMd(textValue) : "N/A";
}

function getValueAccent(value, valueRange) {
  const numericValue = Number(value || 0);
  const minValue = Number(valueRange?.minValue);
  const maxValue = Number(valueRange?.maxValue);
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return hexColorToNumber(VALUE_BAR_STOPS[0]);
  }
  const range = maxValue - minValue;
  const position = range <= 0 ? 0 : (numericValue - minValue) / range;
  const index = Math.min(VALUE_BAR_STOPS.length - 1, Math.max(0, Math.floor(position * (VALUE_BAR_STOPS.length - 1))));
  return hexColorToNumber(VALUE_BAR_STOPS[index]);
}

function hexColorToNumber(value) {
  return Number.parseInt(String(value || "#4a5a78").replace(/^#/, ""), 16);
}

function formatDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return raw.toUpperCase();
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).toUpperCase();
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

function categoryLabel(value) {
  return `\`[${String(value || "Unknown").toUpperCase()}]\``;
}

function trendLabel(value) {
  const textValue = String(value ?? "").trim() || "N/A";
  if (textValue === "Rising") return "↗ Rising";
  if (textValue === "Falling") return "↘ Falling";
  if (textValue === "Stable") return "Stable";
  if (textValue === "Manipulated") return "⚠ Manipulated";
  return escapeMd(textValue);
}

function normalizeCardId(value) {
  const textValue = String(value || "").trim();
  return textValue.startsWith("#") ? textValue : `#${textValue}`;
}

function isCardIdLike(value) {
  return /^#?[A-Za-z0-9]{6}$/.test(String(value || "").trim());
}

function escapeMd(value) {
  return String(value || "").replace(/([*_`~|])/g, "\\$1");
}
