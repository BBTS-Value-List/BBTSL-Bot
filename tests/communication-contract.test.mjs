import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function file(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("slash audit handler accepts the website bot audit logs response shape", async () => {
  const source = await file("src/commands/handlers.js");
  assert.match(source, /Array\.isArray\(response\.logs\)/);
  assert.doesNotMatch(source, /auditPanel\(response\.data \|\| \[\]/);
});

test("text audit handler accepts the same audit response shape", async () => {
  const source = await file("src/text/router.js");
  assert.match(source, /Array\.isArray\(response\.logs\)/);
});

test("public slash registration does not publish staff commands", async () => {
  const registerScript = await file("scripts/register-commands.mjs");
  assert.match(registerScript, /import \{ publicCommands \}/);
  assert.doesNotMatch(registerScript, /import \{[^}]*staffCommands/);
  assert.doesNotMatch(registerScript, /import \{[^}]*allCommands/);
  assert.match(registerScript, /applicationGuildCommands\(config\.applicationId, config\.guildId\), \{ body: \[\] \}/);
});

test("legacy slash revert handler does not send staff back to the website flow", async () => {
  const source = await file("src/commands/handlers.js");
  assert.doesNotMatch(source, /use the website audit revert flow for now/i);
  assert.match(source, /bbtsl-revert audit-id=\$\{logId\} challenge=/);
});
