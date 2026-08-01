import { ApplicationCommandOptionType } from "discord.js";

const GUILD_INSTALL = 0;
const USER_INSTALL = 1;
const GUILD_CONTEXT = 0;
const BOT_DM_CONTEXT = 1;
const PRIVATE_CHANNEL_CONTEXT = 2;

const publicCommandScope = {
  integration_types: [GUILD_INSTALL, USER_INSTALL],
  contexts: [GUILD_CONTEXT, BOT_DM_CONTEXT, PRIVATE_CHANNEL_CONTEXT]
};

const itemOption = { name: "item", description: "Item name or card ID.", type: ApplicationCommandOptionType.String, required: true, autocomplete: true };
const categoryOption = { name: "category", description: "Item category.", type: ApplicationCommandOptionType.String, required: false, choices: ["LTM", "Ranked", "Top Spenders", "Other Swords", "Explosions", "Emotes"].map((value) => ({ name: value, value })) };

export const publicCommands = [
  publicCommand({ name: "item", description: "Show one item.", options: [itemOption] }),
  publicCommand({ name: "search", description: "Find items by name, ID, demand, trend, or category.", options: [{ name: "query", description: "Name, card ID, demand, trend, or category.", type: ApplicationCommandOptionType.String, required: true }, categoryOption] }),
  publicCommand({ name: "compare", description: "Compare two items.", options: [{ ...itemOption, name: "first" }, { ...itemOption, name: "second" }] }),
  publicCommand({ name: "top", description: "Show ranked items.", options: [{ name: "metric", description: "Rank by value, demand, count, or trend.", type: ApplicationCommandOptionType.String, required: false, choices: ["value", "demand", "count", "trend"].map((value) => ({ name: value, value })) }, categoryOption] }),
  publicCommand({ name: "updated", description: "Show recently updated items.", options: [categoryOption] }),
  publicCommand({ name: "team", description: "Show the public team list.", options: [] }),
  publicCommand({ name: "favorite", description: "List, add, or remove favorites.", options: [{ name: "action", description: "Favorite action.", type: ApplicationCommandOptionType.String, required: true, choices: ["list", "add", "remove"].map((value) => ({ name: value, value })) }, { name: "item", description: "Item name or card ID for add/remove.", type: ApplicationCommandOptionType.String, required: false, autocomplete: true }] }),
  publicCommand({ name: "status", description: "Check the bot and API.", options: [] }),
  publicCommand({ name: "help", description: "Show bot commands.", options: [] })
];

export const staffCommands = [
  { name: "profile", description: "Show your team access.", options: [] },
  { name: "edit", description: "Edit an item.", options: [itemOption, { name: "value", description: "New value.", type: ApplicationCommandOptionType.Integer, required: false }, { name: "demand", description: "New demand.", type: ApplicationCommandOptionType.String, required: false }, { name: "trend", description: "New trend.", type: ApplicationCommandOptionType.String, required: false }, { name: "count", description: "New count.", type: ApplicationCommandOptionType.Integer, required: false }] },
  { name: "media", description: "Change item media.", options: [itemOption, { name: "slot", description: "Media slot.", type: ApplicationCommandOptionType.String, required: true, choices: ["card", "detail", "slash", "audio", "finisher"].map((value) => ({ name: value, value })) }, { name: "file", description: "Media attachment.", type: ApplicationCommandOptionType.Attachment, required: false }, { name: "remove", description: "Remove the media slot.", type: ApplicationCommandOptionType.Boolean, required: false }] },
  { name: "create", description: "Create an item.", options: [{ name: "name", description: "Item name.", type: ApplicationCommandOptionType.String, required: true }, { ...categoryOption, required: true }, { name: "value", description: "Item value.", type: ApplicationCommandOptionType.Integer, required: true }] },
  { name: "delete", description: "Delete an item.", options: [itemOption] },
  { name: "export", description: "Export data.", options: [] },
  { name: "audit", description: "Read audit logs.", options: [{ name: "item", description: "Filter by card ID.", type: ApplicationCommandOptionType.String, required: false }, { name: "source", description: "Filter by source.", type: ApplicationCommandOptionType.String, required: false }] },
  { name: "revert", description: "Revert an audit entry.", options: [{ name: "audit-id", description: "Audit record ID.", type: ApplicationCommandOptionType.Integer, required: true }] },
  { name: "team-user", description: "List team users.", options: [] }
];

export const allCommands = [...publicCommands, ...staffCommands];

function publicCommand(command) {
  return { ...publicCommandScope, ...command };
}
