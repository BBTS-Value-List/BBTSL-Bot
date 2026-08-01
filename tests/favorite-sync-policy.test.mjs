import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const FAVORITE_SYNC_FILES = [
  "src/api/client.js",
  "src/commands/handlers.js",
  "src/text/router.js",
  "src/index.js"
];

test("bot favorites are command-driven and do not background poll", async () => {
  const source = (await Promise.all(FAVORITE_SYNC_FILES.map((path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")))).join("\n");

  assert.doesNotMatch(source, /setInterval\s*\(/);
  assert.doesNotMatch(source, /setTimeout\s*\([^,]+favorites?/i);
  assert.match(source, /setFavorite|favorites\(/);
});
