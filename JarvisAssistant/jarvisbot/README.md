# JARVIS — Tony Stark's Personal AI Assistant

## Overview

JARVIS is a practical command-centre prototype: one command is parsed into an intent, placed in a visible sequential queue, confirmed when it can cause an external side effect, executed through server routes, and reflected in a live preview.

## Architecture

- `src/`: React/Vite command centre and preview UI.
- `server/index.js`: Express API, parser-facing action routes, local reminder persistence, and integration adapters.
- Integrations never report success when credentials are missing. Calendar and Drive use a server-only Google access token; Telegram uses a server-only bot token and contact map.

## Technology Stack

React, Vite, Express, Multer, Google REST APIs, Telegram Bot API, and local JSON persistence for reminders/history.

## Local Development

```bash
npm install
copy .env.example .env
npm run dev
```

The Vite UI runs on port 5173 and proxies `/api` to Express on port 8787.

## Environment Variables

`PORT`, `MISTRAL_API_KEY`, `MISTRAL_MODEL`, `GOOGLE_ACCESS_TOKEN`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CONTACTS_JSON`. Never commit `.env` or tokens.

When `MISTRAL_API_KEY` is present, JARVIS sends the command to Mistral's server-side `/v1/chat/completions` endpoint and asks for structured JSON action steps. Without it, the deterministic local parser remains active. The Mistral key is never sent to the browser.

## Command Examples

- `Schedule a meeting with Bruce tomorrow at 5 PM`
- `Remind me to check the reactor at 8 PM`
- `Find the reactor design report in Drive`
- `Send Bruce a Telegram message saying the experiment is postponed`
- `Schedule the Stark team meeting tomorrow at 6 PM, remind me, and send Bruce a message`

## Queue and Doomsday Protocol

The parser creates ordered action steps. The confirmation dialog is shown for Calendar and Telegram actions, and confirmed steps execute one at a time. Each step updates the queue and the relevant preview. A failed step is reported as an error and does not claim success.

## Integrations

Reminders work locally immediately. Calendar event creation/listing and Drive search call Google REST endpoints when `GOOGLE_ACCESS_TOKEN` is configured. Telegram sends through the Bot API when `TELEGRAM_BOT_TOKEN` and a recipient chat ID mapping are configured. Drive upload has the multipart endpoint and an explicit setup error until a Google OAuth upload adapter is configured.

## Known Limitations

This starter uses a server access token rather than a full browser OAuth consent flow. Configure OAuth token refresh and Drive multipart upload before production use. The command parser is deterministic and local; an LLM can be added behind the same server-side intent interface.
