# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Express + Vite HMR) on port 5000
npm run build     # Build client (Vite) + server (esbuild) into dist/
npm run start     # Run production build (Linux/macOS)
npm run check     # TypeScript type-check (both client and server)
npm run db:push   # Push Drizzle schema to Postgres (requires DATABASE_URL)
```

On Windows, run production with:
```powershell
$env:NODE_ENV="production"; node dist/index.js
```

There are no tests.

## Architecture

This is a single-language TypeScript full-stack app. The Express server (`server/index.ts`) handles both the API and serves the React SPA (via Vite in dev, static files in prod).

### Key path aliases
- `@` → `client/src`
- `@shared` → `shared`

### Layer overview

**`shared/schema.ts`** — The source of truth. Drizzle table definitions + Zod insert schemas + TypeScript types for `User`, `Bracket`, `Match`, `Bet`, `BracketBalance`. Both client and server import from here.

**`server/storage.ts`** — All persistence lives in `MemStorage`, a single in-memory class using `Map`s. Data resets on restart. A Drizzle/Postgres config exists (`drizzle.config.ts`) but is not wired up to the app — `storage.ts` would need to be replaced to add persistence. The `updateBracket` method contains the bracket winner-advancement logic (propagating winners to next-round matches, handling bye recipients).

**`server/auth.ts`** — Passport `LocalStrategy` with `scrypt` password hashing. Sessions stored in `MemoryStore` (from `memorystore`). Auth routes: `POST /api/register`, `POST /api/login`, `POST /api/logout`, `GET /api/user`.

**`server/routes.ts`** — All bracket and bet API routes. Match progression state (`currentRound`, `currentMatchNumber`) is updated here in the `PATCH /api/brackets/:id` handler during phase transitions. Winner advancement into the bracket tree is handled in `storage.updateBracket`.

**`client/src/hooks/use-auth.tsx`** — `AuthContext` + `useAuth()` hook. Wraps TanStack Query mutations for login/register/logout. All pages consuming auth state use this hook.

### Bracket lifecycle

Status flow: `pending` → `waiting` → `active` → `completed`

While `active`, the bracket alternates between two phases per match:
1. **betting** — users place bets on the upcoming match
2. **game** — admin picks winner; winner advances in `storage.updateBracket`

When the game phase ends and "Start Next Match" is clicked, `routes.ts` finds the next unplayed match (by `matchNumber`) and updates `currentRound`/`currentMatchNumber` before returning to the betting phase.

### Bracket structure

The `brackets.structure` column is a JSON-stringified `Match[]`. Each `Match` has `round`, `position`, `matchNumber`, `player1`, `player2`, `winner`. Match numbers are globally unique and sequential across rounds. Bye recipients are pre-filled in `player1` of round-1 matches; winners from round-0 go into `player2`.

### Frontend routing

Client uses `wouter`. Routes:
- `/` — home (list brackets)
- `/brackets/new` — create bracket
- `/brackets/:id` — bracket view + betting/game controls
- `/bracket/:id/results` — results page
- `/auth` — login/register

All routes except `/auth` and `/bracket/:id/results` require authentication via `ProtectedRoute` (`client/src/lib/protected-route.tsx`).

### Credits system

Users start with 1000 virtual currency, with a daily bonus of +100. Brackets can optionally use **independent bracket credits** (`useIndependentCredits: true`), tracked separately in `bracketBalances` and isolated from the global `virtualCurrency` balance.
