# TournamentTracker

A full-stack TypeScript web app for **creating tournament brackets** and running **virtual-currency betting** as a bracket progresses match-by-match.

This project is built as a portfolio-ready demo of a modern TS stack: a React + Vite frontend, an Express API, session-based authentication, and a clean shared schema layer.

## What it does

- **Accounts + sessions**
  - Register / login / logout with `passport-local`
  - Passwords are hashed using Node’s `scrypt`
  - Session cookies via `express-session`
- **Tournament brackets**
  - Create brackets with a custom structure (rounds/matches/players)
  - Public brackets or **private brackets protected by an access code**
  - Join a bracket and view it in a bracket UI
- **Betting + game flow**
  - Virtual currency system (default starting balance, plus a daily bonus)
  - Place bets on the currently active match
  - “Betting” → “Game” phases as matches are played and winners advance
  - Optional **independent bracket credits** (private bracket balance separate from global credits)

## Why it’s interesting (engineering highlights)

- **Single-language full stack (TypeScript)**: shared types and validation live in `shared/schema.ts`.
- **Schema-first validation**: request bodies are validated with Zod via Drizzle’s schema helpers.
- **Session-based auth**: realistic login flow (cookies + server sessions), not just client-side mock auth.
- **Match progression logic**: bracket structure is updated as winners advance to the next round.

## Tech stack

- **Frontend**: React, Vite, Tailwind CSS, shadcn/ui (Radix UI)
- **Backend**: Express, Passport (local strategy), express-session, WebSockets (`ws`)
- **Data model**: Drizzle schema + Zod validation (`shared/schema.ts`)

## Project structure

- `client/`: React UI (pages, components, hooks)
- `server/`: Express API, auth setup, dev/prod serving
- `shared/`: types + schemas shared between client and server

## Persistence note (important)

Right now the runtime storage layer is **in-memory** (`server/storage.ts`). That makes local setup very easy, but it also means:

- data resets on server restart
- it’s intended as a demo / foundation

There is already a **Postgres + Drizzle config** (`drizzle.config.ts`) and schema ready for a future persistence upgrade.

## Running locally

See `RUNNING.md` for a step-by-step guide (Windows/PowerShell friendly).

