import test from "node:test";
import assert from "node:assert/strict";
import { BbtslApiClient } from "../src/api/client.js";
import { botMentionPanel, helpPanel, itemNotFoundPanel, itemPanel, searchPanel, searchingPanel, searchSuggestionPanel } from "../src/components/panels.js";
import { findItem, ItemLookupError, shouldUseSearchingPanel } from "../src/items/lookup.js";
import { actorHasCapability, PUBLIC_COMMANDS, requiredCapability } from "../src/security/policy.js";
import { parseTextCommand } from "../src/text/parser.js";
import { buildCanonicalRequest, buildPrivateApiHeaders, buildServiceSignedHeaders, canonicalizeSignedHeaders, deriveDailyKey, sha256Hex } from "../src/api/signing.js";
import { publicCommands } from "../src/commands/definitions.js";

const FOOTER = "[BBTSL](https://bbtsl.lol) - Powered by [PVEstrap](https://pvestrap.com)";

function serializedPanel(panel) {
  return JSON.stringify(panel);
}

function panelText(panel) {
  return panel.components[0].components
    .flatMap((component) => component.components || [component])
    .filter((component) => component.type === 10)
    .map((component) => component.content)
    .join("\n");
}

test("reset is not a bot capability", () => {
  const actor = { permissions: ["team:view:self", "sword:update", "audit:revert"] };
  assert.equal(actorHasCapability(actor, "sword:update"), true);
  assert.equal(actorHasCapability(actor, "data:reset"), false);
});

test("text parser reads bbtsl commands", () => {
  assert.deepEqual(parseTextCommand("bbtsl-item #ABC123"), { name: "item", args: { _: ["#ABC123"] } });
  assert.deepEqual(parseTextCommand("bbtsl-item Moonflower Katana with Finisher"), { name: "item", args: { _: ["Moonflower", "Katana", "with", "Finisher"] } });
  assert.deepEqual(parseTextCommand("bbtsl-search category=\"Top Spenders\" dragon blade"), { name: "search", args: { _: ["dragon", "blade"], category: "Top Spenders" } });
  assert.deepEqual(parseTextCommand("bbtsl-favorite add #ABC123"), { name: "favorite", args: { _: ["add", "#ABC123"] } });
  assert.equal(parseTextCommand("hello"), null);
});

test("public commands include favorite", () => {
  const favorite = publicCommands.find((command) => command.name === "favorite");
  assert.ok(favorite);
  assert.equal(favorite.options.some((option) => option.name === "action"), true);
  assert.equal(PUBLIC_COMMANDS.has("favorite"), true);
  assert.equal(requiredCapability("favorite"), null);
});

test("private v1 headers include the derived daily key", async () => {
  const clientId = "bbtsl-discord-bot";
  const baseSecret = "unit-test-secret";
  const date = "2026-07-27";
  const headers = await buildPrivateApiHeaders({ clientId, baseSecret, date });
  assert.equal(headers.get("x-bbtsl-api-client"), clientId);
  assert.equal(headers.get("x-bbtsl-api-date"), date);
  assert.equal(headers.get("authorization"), `Bearer ${await deriveDailyKey(baseSecret, clientId, date)}`);
});

test("publicGet authenticates private v1 reads", async () => {
  let capturedUrl = "";
  let capturedHeaders = new Headers();
  const client = new BbtslApiClient({
    publicApiUrl: "https://bbtsl.lol/api/v1",
    botApiUrl: "https://bbtsl.lol/api/bot/v1",
    apiClientId: "bbtsl-discord-bot",
    apiBaseSecret: "unit-test-secret"
  }, async (url, init) => {
    capturedUrl = url;
    capturedHeaders = new Headers(init.headers);
    return Response.json({ data: [] });
  });
  await client.publicGet("/swords", { search: "dragon", limit: 1 });
  assert.equal(capturedUrl, "https://bbtsl.lol/api/v1/swords?search=dragon&limit=1");
  assert.equal(capturedHeaders.get("x-bbtsl-api-client"), "bbtsl-discord-bot");
  assert.equal(capturedHeaders.get("x-bbtsl-api-date")?.length, 10);
  assert.match(capturedHeaders.get("authorization") || "", /^Bearer [a-f0-9]{32}$/);
});

test("team sync uses service signing without a staff actor header", async () => {
  const headers = await buildServiceSignedHeaders({
    method: "GET",
    url: "https://bbtsl.lol/api/bot/v1/team/sync",
    clientId: "bbtsl-discord-bot",
    baseSecret: "unit-test-secret"
  });
  assert.equal(headers.get("x-bbtsl-actor-discord-id"), null);
  assert.equal(headers.get("x-bbtsl-api-client"), "bbtsl-discord-bot");
  assert.match(headers.get("x-bbtsl-request-signature") || "", /^[a-f0-9]{64}$/);
});

test("item panel uses website value accent and refined media layout", () => {
  const panel = itemPanel({
    cardId: "#ABC123",
    name: "Frostshard Blade",
    category: "LTM",
    value: 3100000,
    demand: "Medium",
    trend: "Stable",
    count: 2,
    updatedAt: "2026-07-14",
    description: "Encased in the chill of the storm's breath, this sword radiates a cold so pure it crystallizes the air.",
    media: {
      card: { medium: "/media/card%2Fmedium%2Ffrostshard--medium.webp", original: "/media/card%2Ffull%2Ffrostshard--original.webp" },
      detail: { medium: "/media/vfx%2Fmedium%2Ffrostshard-detail--medium.webp", original: "/media/vfx%2Ffull%2Ffrostshard-detail--original.webp" },
      slash: { medium: "/media/slash%2Fmedium%2Ffrostshard-slash--medium.webp" },
      finisher: { medium: "/media/finisher%2Fmedium%2Ffrostshard-finisher--medium.webp", original: "/media/finisher%2Ffull%2Ffrostshard-finisher--original.webp" }
    },
    flags: { ownersChoice: false }
  }, { websiteUrl: "https://bbtsl.lol", valueRange: { minValue: 0, maxValue: 3100000 } });
  assert.equal(panel.components[0].accent_color, 0xf4cf5c);
  const components = panel.components[0].components;
  const serialized = serializedPanel(panel);
  assert.match(serialized, /card%2Ffull%2Ffrostshard--original\.webp/);
  assert.match(serialized, /vfx%2Ffull%2Ffrostshard-detail--original\.webp/);
  assert.match(serialized, /finisher%2Ffull%2Ffrostshard-finisher--original\.webp/);
  assert.doesNotMatch(serialized, /vfx%2Fmedium%2F/);
  assert.match(serialized, /# VFX PREVIEW • SLASH PREVIEW/);
  const combinedHeadingIndex = components.findIndex((component) => component.type === 10 && component.content.includes("VFX PREVIEW • SLASH PREVIEW"));
  assert.ok(combinedHeadingIndex > 0);
  assert.equal(components[combinedHeadingIndex + 1].type, 12);
  assert.equal(components[combinedHeadingIndex + 1].items.length, 2);
  assert.ok(components.some((component) => component.type === 10 && component.content.includes("# FINISHER PREVIEW")));
  assert.match(serialized, /# <:token:1531270254389362759> 3,100,000/);
  assert.doesNotMatch(serialized, /<:token:1274933328012644412>/);
  assert.doesNotMatch(serialized, /<:TradeToken:1347674355592724540>/);
  assert.doesNotMatch(serialized, /Open on BBTSL/);
  assert.doesNotMatch(serialized, /SFX Preview/);
  assert.equal(serialized.match(/\[#ABC123\]/g)?.length, 1);
  assert.match(serialized, /\*\*DEMAND\*\* - \*\*TREND\*\* - \*\*COUNT\*\*/);
  assert.match(serialized, /Medium - Stable - 2/);
  const footerIndex = components.findIndex((component) => component.type === 10 && component.content.includes("UPDATED JUL 14, 2026"));
  assert.ok(footerIndex > 0);
  assert.equal(components[footerIndex - 1].type, 12);
  assert.ok(components[footerIndex].content.includes("UPDATED JUL 14, 2026 • [#ABC123]"));
  assert.doesNotMatch(serialized, /Powered by \[PVEstrap\]/);
});

test("owner's choice value renders without a token or spacer", () => {
  const item = {
    cardId: "#OWN123",
    name: "Owner Blade",
    category: "LTM",
    value: 0,
    demand: "N/A",
    trend: "Stable",
    count: 1,
    updatedAt: "2026-07-14",
    description: "Owner choice item.",
    media: {},
    flags: { ownersChoice: true }
  };
  const itemSerialized = serializedPanel(itemPanel(item, { websiteUrl: "https://bbtsl.lol", valueRange: { minValue: 0, maxValue: 100 } }));
  const searchSerialized = serializedPanel(searchPanel([item], {}, { websiteUrl: "https://bbtsl.lol" }));
  assert.match(itemSerialized, /# Owner's Choice/);
  assert.match(searchSerialized, /Owner's Choice/);
  assert.doesNotMatch(searchSerialized, /ㅤ Owner's Choice/);
  assert.doesNotMatch(searchSerialized, /ㅤㅤㅤㅤ ㅤ Owner's Choice/);
  assert.doesNotMatch(itemSerialized, /<:token:1531270254389362759> Owner's Choice/);
  assert.doesNotMatch(searchSerialized, /<:token:1531270254389362759> Owner's Choice/);
});

test("search panel puts ID at the bottom and removes value gap", () => {
  const panel = searchPanel([{ name: "Frog with Finisher", cardId: "#LTDE1R", value: 500000, demand: "Medium", trend: "Stable", count: 52, category: "Other Swords", media: {} }], { title: "Search: frog" }, { websiteUrl: "https://bbtsl.lol" });
  const content = panelText(panel);
  const nameIndex = content.indexOf("Frog with Finisher");
  const valueIndex = content.indexOf("<:token:1531270254389362759> 500,000 - Medium demand - Stable - Count 52");
  const idIndex = content.indexOf("[#LTDE1R](https://bbtsl.lol/?item=LTDE1R)");
  assert.ok(nameIndex >= 0);
  assert.ok(valueIndex > nameIndex);
  assert.ok(idIndex > valueIndex);
  assert.doesNotMatch(content, /ㅤㅤㅤㅤ <:token:1531270254389362759> 500,000/);
  assert.doesNotMatch(serializedPanel(panel), /Powered by \[PVEstrap\]/);
});

test("item panel keeps separate vfx and slash rows without finisher media", () => {
  const panel = itemPanel({
    cardId: "#DEF456",
    name: "Plain Blade",
    category: "Ranked",
    value: 10,
    demand: "Low",
    trend: "Stable",
    count: 20,
    updatedAt: "2026-07-14",
    description: "Plain.",
    media: {
      detail: { original: "/media/vfx%2Ffull%2Fplain-detail.webp" },
      slash: { original: "/media/slash%2Ffull%2Fplain-slash.webp" }
    },
    flags: { ownersChoice: false }
  }, { websiteUrl: "https://bbtsl.lol", valueRange: { minValue: 10, maxValue: 100 } });
  const components = panel.components[0].components;
  const serialized = serializedPanel(panel);
  assert.match(serialized, /# VFX PREVIEW/);
  assert.match(serialized, /# SLASH PREVIEW/);
  assert.doesNotMatch(serialized, /VFX PREVIEW\/SLASH PREVIEW/);
  const footer = components.find((component) => component.type === 10 && component.content.includes("UPDATED JUL 14, 2026"));
  assert.ok(footer.content.includes("UPDATED JUL 14, 2026 • [#DEF456]"));
  assert.ok(!footer.content.includes("ㅤ"));
});

test("item panel renders N/A for missing stats", () => {
  const panel = itemPanel({
    cardId: "#NAA123",
    name: "No Data Blade",
    category: "Other Swords",
    value: 0,
    demand: "",
    trend: null,
    count: undefined,
    updatedAt: "2026-07-14",
    description: "No stats.",
    media: {},
    flags: { ownersChoice: false }
  }, { websiteUrl: "https://bbtsl.lol", valueRange: { minValue: 0, maxValue: 100 } });
  const serialized = serializedPanel(panel);
  assert.match(serialized, /N\/A/);
  assert.doesNotMatch(serialized, /Unknown/);
});

test("loading and suggestion panels render interaction controls", () => {
  const loading = serializedPanel(searchingPanel("Ruby Cutter", { ephemeral: false }));
  const suggestion = serializedPanel(searchSuggestionPanel("frotsshard", { name: "Frostshard Blade" }, { yesCustomId: "bbtsl:suggest:yes:abcdef123456", noCustomId: "bbtsl:suggest:no:abcdef123456", ephemeral: false }));
  assert.match(loading, /<a:loading:1531277805122355311>/);
  assert.match(loading, /Searching\.\.\./);
  assert.match(suggestion, /Did you mean Frostshard Blade/);
  assert.match(suggestion, /"label":"Yes","style":3/);
  assert.match(suggestion, /"label":"No","style":4/);
});

test("help panel uses concise command help", () => {
  const panel = helpPanel({ role: "Developer", permissions: ["sword:update", "media:update", "audit:view", "team:manage"] });
  assert.equal(panel.components[0].accent_color, 0xfe883e);
  const serialized = serializedPanel(panel);
  assert.match(serialized, /BBTSL Help/);
  assert.match(serialized, /bbtsl-edit/);
  assert.match(serialized, /Example: `bbtsl-edit #ABC123 value=55000 demand=Medium`/);
  assert.match(serialized, /bbtsl-team-edit/);
  assert.match(serialized, /bbtsl-item <item name>/);
  assert.doesNotMatch(serialized, /Moonflower Katana with Finisher/);
  assert.ok(serialized.includes(FOOTER));
  assert.doesNotMatch(serialized, /cleanest interface/);
  assert.doesNotMatch(serialized, /Message Content Intent/);
  assert.doesNotMatch(serialized, /permission-checked/);
  assert.doesNotMatch(serialized, /written to the BBTSL audit log/);
  assert.doesNotMatch(serialized, /\u2014/);
});

test("mention panel links the site and optional server invite", () => {
  const local = serializedPanel(botMentionPanel({ includeInvite: false }));
  const remote = serializedPanel(botMentionPanel({ includeInvite: true }));
  assert.match(local, /Blade Ball item values, demand, trends, counts, and media previews/);
  assert.match(local, /Use `\/help` for commands/);
  assert.match(local, /\[BBTSL\.LOL\]\(https:\/\/bbtsl\.lol\)/);
  assert.doesNotMatch(local, /discord\.gg\/xSwJNqPSSR/);
  assert.match(remote, /discord\.gg\/xSwJNqPSSR/);
  assert.ok(remote.includes(FOOTER));
});

test("not-found panel names the missing item query without a global footer", () => {
  const byName = serializedPanel(itemNotFoundPanel("Moonflower Katana with Finisher"));
  const byId = serializedPanel(itemNotFoundPanel("#0zz64s"));
  assert.match(byName, /Could not find item named \\"Moonflower Katana with Finisher\\"\./);
  assert.match(byId, /Could not find item ID #0ZZ64S\./);
  assert.doesNotMatch(byName, /Powered by \[PVEstrap\]/);
});

test("item lookup retries multi-word names with trailing media text", async () => {
  const calls = [];
  const context = {
    api: {
      async publicGet(path, params) {
        calls.push({ path, params });
        if (params?.search === "Moonflower Katana") {
          return { data: [{ name: "Moonflower Katana", cardId: "#MOON12", value: 55000 }] };
        }
        return { data: [] };
      }
    }
  };
  const item = await findItem(context, "Moonflower Katana with Finisher");
  assert.equal(item.name, "Moonflower Katana");
  assert.deepEqual(calls.map((call) => call.params?.search), ["Moonflower Katana with Finisher", "Moonflower Katana"]);
});

test("slow lookup detection only targets multi-word names", () => {
  assert.equal(shouldUseSearchingPanel("Ruby Cutter"), true);
  assert.equal(shouldUseSearchingPanel("#ABC123"), false);
  assert.equal(shouldUseSearchingPanel("Ruby"), false);
});

test("item lookup throws a typed miss", async () => {
  const context = { api: { async publicGet() { return { data: [] }; } } };
  await assert.rejects(() => findItem(context, "missing blade"), ItemLookupError);
});

test("signed request changes when media slot changes", async () => {
  const firstHeaders = new Headers({ "x-bbtsl-media-variant": "card-image" });
  const secondHeaders = new Headers({ "x-bbtsl-media-variant": "slash-audio" });
  const firstHeaderHash = await sha256Hex(canonicalizeSignedHeaders(firstHeaders));
  const secondHeaderHash = await sha256Hex(canonicalizeSignedHeaders(secondHeaders));
  const parts = {
    method: "POST",
    url: "https://bbtsl.lol/api/bot/v1/media/stage?b=2&a=1",
    clientId: "bbtsl-discord-bot",
    date: "2026-07-27",
    actorDiscordId: "123456789012345678",
    timestamp: "1790000000",
    nonce: "nonce-123456789012",
    bodyHash: "a".repeat(64)
  };
  assert.notEqual(
    buildCanonicalRequest({ ...parts, headerHash: firstHeaderHash }),
    buildCanonicalRequest({ ...parts, headerHash: secondHeaderHash })
  );
  assert.match(buildCanonicalRequest({ ...parts, headerHash: firstHeaderHash }), /\/api\/bot\/v1\/media\/stage\?a=1&b=2/);
});
