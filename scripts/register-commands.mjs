import "dotenv/config";
import { REST, Routes } from "discord.js";
import { publicCommands } from "../src/commands/definitions.js";
import { loadConfig } from "../src/config/env.js";

const scope = process.argv[2] || "guild";
const config = loadConfig();
const rest = new REST({ version: "10" }).setToken(config.discordToken);

if (scope === "auto") {
  await registerGlobalPublic(config, rest);
  if (config.guildId) await clearGuildStaff(config, rest);
} else if (scope === "global") {
  await registerGlobalPublic(config, rest);
} else if (scope === "guild") {
  await clearGuildStaff(config, rest);
} else if (scope === "all") {
  await registerGlobalPublic(config, rest);
  if (config.guildId) await clearGuildStaff(config, rest);
} else {
  throw new Error("Use 'auto', 'all', 'guild', or 'global'.");
}

async function registerGlobalPublic(config, rest) {
  await rest.put(Routes.applicationCommands(config.applicationId), { body: publicCommands });
  console.log(`Registered ${publicCommands.length} global public commands.`);
}

async function clearGuildStaff(config, rest) {
  if (!config.guildId) throw new Error("DISCORD_GUILD_ID is required to clear guild staff command registration.");
  await rest.put(Routes.applicationGuildCommands(config.applicationId, config.guildId), { body: [] });
  console.log(`Cleared guild slash commands in ${config.guildId}. Staff actions remain text/API-only.`);
}
