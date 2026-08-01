# Railway

This bot runs as a Railway background service.

## Setup

1. Create a Railway service from this repository.
2. Select `main`.
3. Keep it as a background service.
4. Paste `railway.env.example` into Railway Variables.
5. Fill the blank values.
6. Deploy.

## Start Command

```bash
npm run railway:start
```

This checks required variables, registers public slash commands, then starts the bot.

## Required Values

- `DISCORD_TOKEN`
- `DISCORD_APPLICATION_ID`
- `BBTSL_API_CLIENT_ID`
- `BBTSL_API_BASE_SECRET`

## Optional Values

- `DISCORD_GUILD_ID`
- `BBTSL_PUBLIC_API_URL`
- `BBTSL_BOT_API_URL`
- `BBTSL_STAFF_GUILD_ID`
- `BBTSL_STAFF_CHANNEL_IDS`
- `BBTSL_AUDIT_CHANNEL_IDS`
- `LOG_LEVEL`
- `COMPONENT_SESSION_TTL_SECONDS`

Keep Railway replicas at `1`.
