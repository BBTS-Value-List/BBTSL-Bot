import test from "node:test";
import assert from "node:assert/strict";
import { startTeamProfileSync, syncTeamProfiles } from "../src/team-sync.js";

test("team profile sync refreshes Discord profiles and sends profile fields", async () => {
  const calls = [];
  const client = {
    users: {
      async fetch(discordUserId, options) {
        calls.push({ discordUserId, options });
        return {
          username: `user_${discordUserId}`,
          globalName: `Display ${discordUserId}`,
          avatar: `avatar_${discordUserId}`
        };
      }
    }
  };
  const synced = [];
  const context = {
    config: {},
    logger: loggerStub(),
    api: {
      async teamSyncTargets() {
        return { data: { users: [{ discordUserId: "222222222222222222" }, { discordUserId: "bad" }] } };
      },
      async syncTeamProfiles(users) {
        synced.push({ users });
        return { data: { checked: 1, updated: 1, skipped: 0 } };
      }
    }
  };

  const result = await syncTeamProfiles(client, context);

  assert.deepEqual(calls, [{ discordUserId: "222222222222222222", options: { force: true } }]);
  assert.deepEqual(synced, [{
    users: [{
      discordUserId: "222222222222222222",
      username: "user_222222222222222222",
      globalName: "Display 222222222222222222",
      avatarHash: "avatar_222222222222222222"
    }]
  }]);
  assert.deepEqual(result, { checked: 1, updated: 1, skipped: 0, sent: 1 });
});

test("team profile sync skips website writes when no Discord profile is fetched", async () => {
  const context = {
    config: {},
    logger: loggerStub(),
    api: {
      async teamSyncTargets() {
        return { data: { users: [{ discordUserId: "222222222222222222" }] } };
      },
      async syncTeamProfiles() {
        throw new Error("should not write");
      }
    }
  };
  const client = {
    users: {
      async fetch() {
        throw new Error("missing");
      }
    }
  };

  const result = await syncTeamProfiles(client, context);

  assert.deepEqual(result, { checked: 1, updated: 0, skipped: 1, sent: 0 });
});

test("team profile scheduler starts an immediate run and interval", () => {
  let scheduled = false;
  let cleared = false;
  const stop = startTeamProfileSync({ users: { fetch: async () => null } }, {
    config: {},
    logger: loggerStub(),
    api: {
      async teamSyncTargets() {
        return { data: { users: [] } };
      }
    }
  }, {
    setInterval() {
      scheduled = true;
      return { unref() {} };
    },
    clearInterval() {
      cleared = true;
    }
  });

  assert.equal(scheduled, true);
  assert.equal(typeof stop, "function");
  stop();
  assert.equal(cleared, true);
});

function loggerStub() {
  return {
    info() {},
    warn() {}
  };
}
