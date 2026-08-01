import test from "node:test";
import assert from "node:assert/strict";
import { publicCommands, staffCommands } from "../src/commands/definitions.js";

const GUILD_INSTALL = 0;
const USER_INSTALL = 1;
const GUILD_CONTEXT = 0;
const BOT_DM_CONTEXT = 1;
const PRIVATE_CHANNEL_CONTEXT = 2;

test("public commands support guild and user installs across Discord surfaces", () => {
  assert.ok(publicCommands.length > 0);
  for (const command of publicCommands) {
    assert.deepEqual(command.integration_types, [GUILD_INSTALL, USER_INSTALL]);
    assert.deepEqual(command.contexts, [GUILD_CONTEXT, BOT_DM_CONTEXT, PRIVATE_CHANNEL_CONTEXT]);
  }
});

test("public slash commands do not expose visibility options", () => {
  for (const command of publicCommands) {
    assert.equal((command.options || []).some((option) => option.name === "visibility"), false, `${command.name} should not expose visibility`);
  }
});

test("staff commands stay guild scoped through registration", () => {
  assert.ok(staffCommands.length > 0);
  for (const command of staffCommands) {
    assert.equal(command.integration_types, undefined);
    assert.equal(command.contexts, undefined);
  }
});
