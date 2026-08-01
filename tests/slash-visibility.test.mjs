import test from "node:test";
import assert from "node:assert/strict";
import { MessageFlags } from "discord.js";
import { readFile } from "node:fs/promises";

import { handleChatInput } from "../src/commands/handlers.js";

const TEST_USER_ID = "123456789012345678";
const TEST_ITEM = {
  cardId: "#ABC123",
  name: "Frog",
  category: "Other Swords",
  value: 250000,
  demand: "Medium",
  trend: "Falling",
  count: null,
  updatedAt: "2026-07-14",
  description: "Test item.",
  media: {},
  flags: { ownersChoice: false }
};

function makeInteraction(commandName, values = {}) {
  const replies = [];
  return {
    commandName,
    user: { id: TEST_USER_ID },
    options: {
      get(name) {
        return Object.prototype.hasOwnProperty.call(values, name) ? { value: values[name] } : null;
      }
    },
    async reply(payload) {
      replies.push(payload);
      return payload;
    },
    async editReply(payload) {
      replies.push(payload);
      return payload;
    },
    get lastReply() {
      return replies.at(-1);
    }
  };
}

function makeContext(actor = null) {
  return {
    websiteUrl: "https://bbtsl.lol",
    api: {
      async actor() {
        return actor ? { data: actor } : { data: null };
      },
      async publicGet(path, params = {}) {
        if (path === "/health") return { ok: true };
        if (path === "/team") return { data: [{ displayName: "Kronos", role: "Owner" }] };
        if (path.startsWith("/swords/")) return { data: TEST_ITEM };
        if (path === "/swords") return { data: [TEST_ITEM], meta: params };
        return { data: [] };
      },
      async favorites() {
        return { favorites: [TEST_ITEM.cardId] };
      },
      async setFavorite() {
        return { ok: true, favorites: [TEST_ITEM.cardId] };
      }
    }
  };
}

function isEphemeral(payload) {
  return Boolean(Number(payload?.flags || 0) & MessageFlags.Ephemeral);
}

async function runCommand(name, values = {}, actor = null) {
  const interaction = makeInteraction(name, values);
  await handleChatInput(interaction, makeContext(actor));
  return interaction.lastReply;
}

test("public slash command replies are visible by default", async () => {
  for (const [name, values] of [
    ["status", {}],
    ["team", {}],
    ["top", {}],
    ["updated", {}],
    ["item", { item: TEST_ITEM.cardId }],
    ["search", { query: "frog" }],
    ["compare", { first: TEST_ITEM.cardId, second: TEST_ITEM.cardId }]
  ]) {
    const payload = await runCommand(name, values);
    assert.equal(isEphemeral(payload), false, `/${name} should be visible`);
  }
});

test("favorite slash actions stay private", async () => {
  for (const action of ["list", "add", "remove"]) {
    const payload = await runCommand("favorite", { action, item: TEST_ITEM.cardId });
    assert.equal(isEphemeral(payload), true, `/favorite ${action} should be ephemeral`);
  }
});

test("help is public for regular users and private for elevated team users", async () => {
  const publicHelp = await runCommand("help");
  const teamHelp = await runCommand("help", {}, { role: "Editor", permissions: ["team:view:self", "sword:update"] });

  assert.equal(isEphemeral(publicHelp), false);
  assert.equal(isEphemeral(teamHelp), true);
});

test("slash visibility no longer depends on removed visibility options", async () => {
  const source = await readFile(new URL("../src/commands/handlers.js", import.meta.url), "utf8");

  assert.doesNotMatch(source, /option\(interaction,\s*["']visibility["']\)/);
  assert.match(source, /const ephemeral = false;/);
  assert.match(source, /const ephemeral = true;/);
});
