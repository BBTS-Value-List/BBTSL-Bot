import test from "node:test";
import assert from "node:assert/strict";
import { findItem, searchItems, suggestItem } from "../src/items/lookup.js";

function fakeContext() {
  const calls = [];
  const itemsBySearch = new Map([
    ["Ruby Cutter", []],
    ["ruby", [
      { name: "Ruby Cutter", cardId: "#RUBY01", value: 55000 },
      { name: "Ruby Blade", cardId: "#RUBY02", value: 20000 }
    ]],
    ["cutter", [
      { name: "Ruby Cutter", cardId: "#RUBY01", value: 55000 },
      { name: "Cutter Axe", cardId: "#CUTR02", value: 10000 }
    ]]
  ]);
  return {
    calls,
    api: {
      async publicGet(path, params = {}) {
        calls.push({ path, params });
        if (!params.search && params.limit === 250) {
          return { data: [
            { name: "Frostshard Blade", cardId: "#FROST1", value: 3100000 },
            { name: "Ruby Cutter", cardId: "#RUBY01", value: 55000 }
          ] };
        }
        return { data: itemsBySearch.get(params.search) || [] };
      }
    }
  };
}

test("findItem falls back from a multi-word phrase to token searches", async () => {
  const context = fakeContext();
  const item = await findItem(context, "Ruby Cutter");
  assert.equal(item.name, "Ruby Cutter");
  assert.deepEqual(context.calls.map((call) => call.params.search), ["Ruby Cutter", "ruby"]);
});

test("searchItems falls back from a multi-word phrase to token searches", async () => {
  const context = fakeContext();
  const response = await searchItems(context, { search: "Ruby Cutter", limit: 10 });
  assert.equal(response.data[0].name, "Ruby Cutter");
  assert.equal(response.meta.fallbackSearch, true);
  assert.deepEqual(context.calls.map((call) => call.params.search), ["Ruby Cutter", "ruby", "cutter"]);
});

test("suggestItem finds a close spelling match from the cached catalog", async () => {
  const context = fakeContext();
  const suggestion = await suggestItem(context, "frotsshard");
  assert.equal(suggestion.name, "Frostshard Blade");
});
