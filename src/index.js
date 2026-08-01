import pino from "pino";
import { ActivityType, Client, Events, GatewayIntentBits, Partials, PresenceUpdateStatus } from "discord.js";
import { BbtslApiClient } from "./api/client.js";
import { loadConfig } from "./config/env.js";
import { handleButtonInteraction, handleChatInput } from "./commands/handlers.js";
import { botMentionPanel, plainPanel } from "./components/panels.js";
import { startTeamProfileSync } from "./team-sync.js";
import { handleTextMessage } from "./text/router.js";

const HOME_GUILD_ID = "1277950296815042656";

const config = loadConfig();
const logger = pino({ level: config.logLevel });
const api = new BbtslApiClient(config);
const websiteUrl = new URL(config.publicApiUrl).origin;
const context = { api, config, logger, websiteUrl };

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, () => {
  client.user.setPresence({
    status: PresenceUpdateStatus.Idle,
    activities: [{ type: ActivityType.Watching, name: "values on https://bbtsl.lol" }]
  });
  logger.info({ user: client.user?.tag }, "BBTSL bot online");
  startTeamProfileSync(client, context);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isAutocomplete()) return handleAutocomplete(interaction, context);
    if (interaction.isButton()) return handleButtonInteraction(interaction, context);
    if (interaction.isChatInputCommand()) await handleChatInput(interaction, context);
  } catch (error) {
    logger.error({ err: error }, "interaction failed");
    if (interaction.isAutocomplete()) return interaction.respond([]).catch(() => {});
    const payload = plainPanel("Command failed", "Try again.", { ephemeral: true });
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
});

client.on("messageCreate", async (message) => {
  try {
    if (isDirectBotMention(message, client.user?.id)) {
      return message.reply(botMentionPanel({ includeInvite: message.guildId !== HOME_GUILD_ID, ephemeral: false }));
    }
    await handleTextMessage(message, context);
  } catch (error) {
    logger.warn({ err: error }, "text command failed");
  }
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function handleAutocomplete(interaction, context) {
  const focused = interaction.options.getFocused(true);
  if (!["item", "first", "second"].includes(focused.name)) {
    return interaction.respond([]);
  }
  const query = String(focused.value || "").trim();
  if (!query) return interaction.respond([]);
  const response = await context.api.publicGet("/swords", { search: query, limit: 25 }).catch(() => ({ data: [] }));
  const choices = (response.data || []).slice(0, 25).map((item) => ({
    name: `${String(item.name || "Item").slice(0, 70)} - ${String(item.cardId || "").slice(0, 20)}`.slice(0, 100),
    value: String(item.cardId || item.name || "").slice(0, 100)
  })).filter((choice) => choice.value);
  return interaction.respond(choices);
}

function isDirectBotMention(message, botUserId) {
  if (!botUserId || message.author.bot) return false;
  if (message.mentions.everyone) return false;
  if (message.mentions.roles?.size) return false;
  return message.mentions.users.size === 1 && message.mentions.users.has(botUserId);
}

async function shutdown(signal) {
  logger.info({ signal }, "shutting down");
  client.destroy();
  process.exit(0);
}

await client.login(config.discordToken);
