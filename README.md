# BBTSL Bot

Discord bot for the BBTSL Blade Ball value list.

## What It Does

- Shows item cards, search results, top items, updates, favorites, status, and team entries.
- Supports slash commands and `bbtsl-` text commands.
- Uses website roles for staff access.
- Sends signed requests to the BBTSL API.
- Refreshes displayed team profile data once per hour.

## Requirements

- Node.js 22 or newer.
- Discord application and bot token.
- Message Content Intent for text commands.
- BBTSL API client secret from the website Worker.

## Local Setup

```bash
npm ci
cp .env.example .env
npm run commands:register:global
npm start
```

Use `.env.example` for local values. Do not commit real secrets.

## Railway

Railway uses `railway.json` and starts the bot with:

```bash
npm run railway:start
```

Use `railway.env.example` as the Railway Variables template.

## Checks

```bash
npm run check
npm test
npm audit --audit-level=high
```

## Access

BBTSL website roles are the source of truth. Discord server roles do not grant BBTSL permissions.

## License

All rights reserved. See `LICENSE`.
