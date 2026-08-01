import test from "node:test";
import assert from "node:assert/strict";

import { searchPanel } from "../src/components/panels.js";

const DISCORD_COMPONENT_LIMIT = 40;

function countComponents(value) {
  if (!value || typeof value !== "object") return 0;
  let count = typeof value.type === "number" ? 1 : 0;
  if (Array.isArray(value.components)) {
    count += value.components.reduce((total, component) => total + countComponents(component), 0);
  }
  if (value.accessory) {
    count += countComponents(value.accessory);
  }
  return count;
}

test("ten item list panels stay within Discord's total component limit", () => {
  const items = Array.from({ length: 10 }, (_, index) => ({
    name: `Item ${index + 1}`,
    cardId: `#ABC12${index}`.slice(0, 7),
    value: 100000 + index,
    demand: "Medium",
    trend: "Stable",
    count: index,
    category: "LTM",
    media: {
      card: { original: `/media/card/full/item-${index + 1}.webp` }
    },
    flags: { ownersChoice: false }
  }));
  const panel = searchPanel(items, { title: "Recently Updated Items", hasMore: true }, { ephemeral: false, websiteUrl: "https://bbtsl.lol" });
  const total = panel.components.reduce((sum, component) => sum + countComponents(component), 0);

  assert.ok(total <= DISCORD_COMPONENT_LIMIT, `expected at most ${DISCORD_COMPONENT_LIMIT} components, got ${total}`);
  assert.equal(panel.components[0].components.filter((component) => component.type === 14).length, 0);
});
