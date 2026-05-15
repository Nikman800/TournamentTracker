# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Express + Vite HMR) on port 5000
npm run build     # Build client (Vite) + server (esbuild) into dist/
npm run start     # Run production build (Linux/macOS)
npm run check     # TypeScript type-check (both client and server)
npm run db:push   # Push Drizzle schema to Postgres (requires DATABASE_URL env var set in shell)
npm test          # Run vitest test suite (uses MemStorage — no database required)
```

On Windows, run production with:
```powershell
$env:NODE_ENV="production"; node dist/index.js
```

`db:push` does not auto-load `.env` — set the variable in your shell first:
```powershell
$env:DATABASE_URL="postgres://tt:changeme@localhost:5432/tournament_tracker"; npm run db:push
```

## Database

PostgreSQL 17 is installed as a Windows service (`postgresql-x64-17`) and starts automatically with Windows. No Docker or manual startup is needed for development.

- **Host**: `localhost:5432`
- **Database**: `tournament_tracker`
- **User / password**: `tt` / `changeme`
- **Superuser password**: `postgres` (for pgAdmin or `psql -U postgres`)
- **`DATABASE_URL`** is set in `.env` and loaded automatically by `import 'dotenv/config'` at the top of `server/index.ts`

The app uses `DbStorage` when `DATABASE_URL` is set, `MemStorage` otherwise. Tests always use `MemStorage`.

## Architecture

This is a single-language TypeScript full-stack app. The Express server (`server/index.ts`) handles both the API and serves the React SPA (via Vite in dev, static files in prod).

### Key path aliases
- `@` → `client/src`
- `@shared` → `shared`

### Layer overview

**`shared/schema.ts`** — The source of truth. Drizzle table definitions + Zod insert schemas + TypeScript types for `User`, `Bracket`, `Match`, `Bet`, `BracketBalance`, `Standing`, `BracketMember`. Both client and server import from here.

**`server/storage.ts`** — Defines `IStorage` interface. `MemStorage` is the in-memory implementation (Maps, resets on restart). `DbStorage` is the Drizzle + Postgres implementation using `pg.Pool` and `drizzle-orm/node-postgres`. The active instance is exported as `storage`: `DbStorage` when `DATABASE_URL` is set, `MemStorage` otherwise. The `updateBracket` method contains winner-advancement logic (propagating winners to next-round matches, handling bye recipients).

**IMPORTANT**: `import 'dotenv/config'` must be the **first** import in `server/index.ts`. All other imports (including `routes`, which transitively imports `storage`) are evaluated after dotenv runs, ensuring `DATABASE_URL` is available when `storage` is initialised at module load time.

**`server/auth.ts`** — Passport `LocalStrategy` with `scrypt` password hashing. Sessions stored in `MemoryStore` (MemStorage mode) or `connect-pg-simple` (DbStorage mode). Auth routes: `POST /api/register`, `POST /api/login`, `POST /api/logout`, `GET /api/user`.

**`server/routes.ts`** — All bracket and bet API routes. Match progression state (`currentRound`, `currentMatchNumber`) is updated here in the `PATCH /api/brackets/:id` handler during phase transitions. Winner advancement into the bracket tree is handled in `storage.updateBracket`.

**`shared/bracketGenerators.ts`** — Pure functions for generating bracket structures: `generateSingleElim`, `generateDoubleElim`, `generateRoundRobin`, `generateGroupStage`. Returns `MatchNode[]` serialized into `brackets.structure`.

**`shared/payoutEngine.ts`** — Pure function `computePayouts(pot, bets, winner)` for proportional payout calculation. Called server-side when a match winner is recorded.

**`client/src/hooks/use-auth.tsx`** — `AuthContext` + `useAuth()` hook. Wraps TanStack Query mutations for login/register/logout. All pages consuming auth state use this hook.

### Bracket lifecycle

Status flow: `pending` → `waiting` → `active` → `completed`

While `active`, the bracket alternates between two phases per match:
1. **betting** — users place bets on the upcoming match
2. **game** — admin picks winner; winner advances in `storage.updateBracket`

When the game phase ends and "Start Next Match" is clicked, `routes.ts` finds the next unplayed match (by `matchNumber`) and updates `currentRound`/`currentMatchNumber` before returning to the betting phase.

### Bracket structure

The `brackets.structure` column is a JSON-stringified `MatchNode[]`. Each node has `round`, `position`, `matchNumber`, `player1`, `player2`, `winner`, `bracketSection`, and optionally `groupId`. Match numbers are globally unique and sequential across rounds. Bye recipients are pre-filled in `player1` of round-1 matches; winners from round-0 go into `player2`.

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

### Tests

Tests live in `tests/` and use **vitest** + **supertest** + **fast-check**. They always run against `MemStorage` — no database connection needed. Run with `npm test`.
