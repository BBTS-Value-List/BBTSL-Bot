import { loadConfig } from "../src/config/env.js";

const REQUIRED = [
  "DISCORD_TOKEN",
  "DISCORD_APPLICATION_ID",
  "BBTSL_API_CLIENT_ID",
  "BBTSL_API_BASE_SECRET"
];

const RECOMMENDED = [
  "BBTSL_PUBLIC_API_URL",
  "BBTSL_BOT_API_URL",
  "RAILPACK_NODE_VERSION",
  "NODE_ENV",
  "LOG_LEVEL"
];

const missing = REQUIRED.filter((name) => !String(process.env[name] || "").trim());
if (missing.length) {
  console.error("Railway environment is missing required variables:");
  for (const name of missing) console.error(`- ${name}`);
  console.error("Copy railway.env.example into Railway Variables and fill the blank values.");
  process.exit(1);
}

try {
  const config = loadConfig(process.env);
  const warnings = RECOMMENDED.filter((name) => !String(process.env[name] || "").trim());
  if (warnings.length) {
    console.warn("Railway environment is missing recommended variables:");
    for (const name of warnings) console.warn(`- ${name}`);
  }
  console.log("Railway environment check passed.");
  console.log(`Public API: ${config.publicApiUrl}`);
  console.log(`Bot API: ${config.botApiUrl}`);
  console.log(`Client ID: ${config.apiClientId}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
