# Design Document: GambaGame Tournament Tracker Completion

## Overview

GambaGame is a full-stack TypeScript web application for creating and managing tournament brackets with virtual-currency betting. This design covers the completion of the app across six major areas:

1. **Bug fixes** — bet payouts, results leaderboard, `/api/users` endpoint, home page filtering
2. **Persistence** — `DbStorage` (Drizzle + Postgres) behind an `IStorage` interface, with `MemStorage` fallback
3. **New tournament formats** — double elimination, round robin, group stage
4. **UI improvements** — bracket viewer connectors, polling, join flow, spectator access control
5. **Visual theme** — GambaGame retro arcade style (Silkscreen font, sky blue, navy, yellow)
6. **Test suite** — vitest + supertest lifecycle tests, fast-check property-based tests

The existing codebase uses React + Vite on the frontend, Express on the backend, Drizzle ORM with a shared schema, Passport LocalStrategy auth, and shadcn/ui components. All new work extends this foundation without replacing it.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React + Vite)                                     │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Pages    │  │ Components   │  │ Hooks / QueryClient  │  │
│  │ HomePage │  │ BracketViewer│  │ useQuery (5s poll)   │  │
│  │ BracketPg│  │ StandingsTable│ │ useMutation          │  │
│  │ Results  │  │ ConnectorSVG │  │ useAuth              │  │
│  │ Create   │  │ BettingPanel │  └──────────────────────┘  │
│  └──────────┘  └──────────────┘                            │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (REST + JSON)
┌────────────────────────▼────────────────────────────────────┐
│  Express Server                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ routes.ts  (auth guard, bracket CRUD, bets, payouts) │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                         │                                   │
│  ┌──────────────────────▼───────────────────────────────┐  │
│  │ IStorage interface                                   │  │
│  │   ┌─────────────┐        ┌──────────────────────┐   │  │
│  │   │ MemStorage  │        │ DbStorage            │   │  │
│  │   │ (in-memory) │        │ (Drizzle + Postgres) │   │  │
│  │   └─────────────┘        └──────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Bracket Generators                                   │  │
│  │  generateSingleElim  generateDoubleElim              │  │
│  │  generateRoundRobin  generateGroupStage              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Payout Engine  (computePayouts)                      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  Postgres (optional — DATABASE_URL env var)                 │
│  users, brackets, bracket_balances, bracket_members,        │
│  bets, standings                                            │
└─────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

- **IStorage interface**: Both `MemStorage` and `DbStorage` implement a shared `IStorage` interface. The active implementation is selected at startup based on `DATABASE_URL`. This keeps all route logic storage-agnostic.
- **Dotenv import order**: `import 'dotenv/config'` must be the first import in `server/index.ts`. ESM static imports are evaluated top-to-bottom, so placing dotenv after other imports causes `storage.ts` to evaluate `process.env.DATABASE_URL` before the `.env` file is loaded, silently falling back to `MemStorage`.
- **Bracket structure as JSON**: The `brackets.structure` column stores a JSON-stringified `MatchNode[]`. All four formats serialize to this same shape, with a `bracketSection` field distinguishing winners/losers/group/knockout segments.
- **Polling over WebSockets**: The frontend uses TanStack Query's `refetchInterval` (5 seconds) while the bracket is active. No WebSocket infrastructure is needed.
- **Bracket generators as pure functions**: All four format generators live in `shared/bracketGenerators.ts` as pure functions that take a participant list and return a `MatchNode[]`. This makes them trivially testable.
- **Payout engine as a pure function**: `computePayouts(pot, bets)` lives in `shared/payoutEngine.ts`. It is called server-side when a match winner is recorded.

---

## Components and Interfaces

### IStorage Interface

```typescript
// server/storage.ts
export interface IStorage {
  sessionStore: session.Store;

  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  listUsers(): Promise<User[]>;
  claimDailyBonus(userId: number): Promise<User>;
  updateUserCurrency(userId: number, amount: number): Promise<User>;

  // Brackets
  createBracket(bracket: Omit<Bracket, "id">): Promise<Bracket>;
  getBracket(id: number): Promise<Bracket | undefined>;
  listBrackets(): Promise<Bracket[]>;
  updateBracket(id: number, updates: Partial<Bracket>): Promise<Bracket>;

  // Bracket membership (join tracking)
  joinBracket(userId: number, bracketId: number): Promise<void>;
  hasJoinedBracket(userId: number, bracketId: number): Promise<boolean>;
  getBracketMembers(bracketId: number): Promise<number[]>;

  // Bracket balances
  getBracketBalance(userId: number, bracketId: number): Promise<number>;
  createBracketBalance(balance: Omit<BracketBalance, "id">): Promise<BracketBalance>;
  updateBracketBalance(userId: number, bracketId: number, amount: number): Promise<BracketBalance>;

  // Bets
  createBet(bet: Omit<Bet, "id">): Promise<Bet>;
  getBracketBets(bracketId: number): Promise<Bet[]>;

  // Standings (round robin / group stage)
  upsertStanding(standing: Omit<Standing, "id">): Promise<Standing>;
  getStandings(bracketId: number): Promise<Standing[]>;
}
```

### Bracket Generator Interface

```typescript
// shared/bracketGenerators.ts
export type BracketFormat = "single_elimination" | "double_elimination" | "round_robin" | "group_stage";

export interface MatchNode {
  matchNumber: number;
  round: number;
  position: number;
  player1: string | null;
  player2: string | null;
  winner: string | null;
  bracketSection: "winners" | "losers" | "grand_final" | "group" | "knockout" | "main";
  groupId?: number;       // group stage only
}

export function generateSingleElim(participants: string[]): MatchNode[];
export function generateDoubleElim(participants: string[]): MatchNode[];
export function generateRoundRobin(participants: string[]): MatchNode[];
export function generateGroupStage(participants: string[], numGroups: number, advanceCount: number): MatchNode[];
```

### Payout Engine Interface

```typescript
// shared/payoutEngine.ts
export interface PayoutResult {
  userId: number;
  amount: number;
}

export function computePayouts(
  pot: number,
  bets: Array<{ userId: number; amount: number; selectedWinner: string }>,
  winner: string
): PayoutResult[];
```

### Frontend Component Tree

```
App
├── Navigation (GambaGame branding, Silkscreen font)
├── HomePage
│   ├── BracketCard[] (filtered by access)
│   └── JoinBracketForm (ID + access code input)
├── BracketCreate
│   ├── FormatSelector (4 options with participant limits)
│   ├── ParticipantInput (existing tag input)
│   └── GroupStageOptions (numGroups, advanceCount — conditional)
├── BracketPage
│   ├── BracketViewer (dispatches to format-specific viewer)
│   │   ├── SingleElimViewer
│   │   │   └── ConnectorSVG (SVG overlay for match connectors)
│   │   ├── DoubleElimViewer
│   │   │   ├── WinnersBracket + ConnectorSVG
│   │   │   ├── LosersBracket + ConnectorSVG
│   │   │   └── GrandFinalMatch
│   │   ├── RoundRobinViewer
│   │   │   ├── MatchList
│   │   │   └── StandingsTable
│   │   └── GroupStageViewer
│   │       ├── GroupPanel[] (each with MatchList + StandingsTable)
│   │       └── KnockoutBracket (SingleElimViewer, shown after group stage)
│   └── BettingPanel (shown only to eligible users)
└── BracketResults
    ├── ChampionCard
    ├── Leaderboard (net profit, sorted descending)
    └── FinalBracketViewer (read-only)
```

---

## Data Models

### Schema Changes (`shared/schema.ts`)

#### `brackets` table — new columns

```typescript
export const brackets = pgTable("brackets", {
  // ... existing columns ...
  bracketFormat: text("bracket_format").notNull().default("single_elimination"),
  numGroups: integer("num_groups"),          // group stage only
  advanceCount: integer("advance_count"),    // group stage only
});
```

#### `bracket_members` table — new table

Tracks which users have joined each bracket (for private bracket access control and home page filtering).

```typescript
export const bracketMembers = pgTable("bracket_members", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  bracketId: integer("bracket_id").notNull(),
});
```

#### `standings` table — new table

Stores per-participant standings for round robin and group stage formats.

```typescript
export const standings = pgTable("standings", {
  id: serial("id").primaryKey(),
  bracketId: integer("bracket_id").notNull(),
  participant: text("participant").notNull(),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  points: integer("points").notNull().default(0),
  groupId: integer("group_id"),   // null for round robin, set for group stage
});
```

#### Updated Zod schemas

```typescript
export const insertBracketSchema = createInsertSchema(brackets).pick({
  name: true,
  isPublic: true,
  accessCode: true,
  structure: true,
  startingCredits: true,
  useIndependentCredits: true,
  adminCanBet: true,
  bracketFormat: true,
  numGroups: true,
  advanceCount: true,
});

export type Standing = typeof standings.$inferSelect;
export type BracketMember = typeof bracketMembers.$inferSelect;
```

### MatchNode Shape (stored in `brackets.structure` as JSON)

The existing `Match` type from the `matches` table is not used for bracket structure storage — the structure is stored as a JSON blob in `brackets.structure`. The `MatchNode` type (defined in `shared/bracketGenerators.ts`) is the canonical in-memory representation:

```typescript
interface MatchNode {
  matchNumber: number;       // globally unique within bracket, 1-based
  round: number;             // 0-based round index
  position: number;          // 0-based position within round
  player1: string | null;    // null = TBD
  player2: string | null;    // null = TBD
  winner: string | null;
  bracketSection: "main" | "winners" | "losers" | "grand_final" | "group" | "knockout";
  groupId?: number;          // group stage only
}
```

### Participant Limits (enforced at API and UI level)

| Format | Min | Max |
|---|---|---|
| single_elimination | 2 | 64 |
| double_elimination | 4 | 32 |
| round_robin | 3 | 16 |
| group_stage | 4 | 32 |

---

## Bracket Format Generators

### Single Elimination (`generateSingleElim`)

The existing logic in `bracket-create.tsx` is extracted into `shared/bracketGenerators.ts` as a pure function. The algorithm:

1. Round up participant count to next power of 2 → `bracketSize`
2. Compute `numByes = bracketSize - participantCount`
3. `playersInRound0 = participantCount - numByes` (always even)
4. Generate round 0 matches for competing players
5. Generate round 1 matches: bye recipients in `player1` slots, round 0 winners fill `player2` slots
6. Generate subsequent rounds with all-null players (TBD)
7. All matches get `bracketSection: "main"`

Total matches: `participantCount - 1` (invariant).

### Double Elimination (`generateDoubleElim`)

Double elimination requires two parallel bracket trees plus a grand final.

**Winners Bracket**: Standard single elimination structure for all participants. `bracketSection: "winners"`.

**Losers Bracket**: Generated in parallel. After each winners bracket round R, losers from round R drop into the losers bracket at a corresponding losers round. The losers bracket has approximately `2*(log2(N) - 1)` rounds. `bracketSection: "losers"`.

**Grand Final**: One match between winners bracket champion and losers bracket champion. `bracketSection: "grand_final"`. (A bracket reset match is optional and not included in this implementation — the grand final is a single match.)

**Match numbering**: Winners bracket matches are numbered first (1 to W), then losers bracket (W+1 to W+L), then grand final (W+L+1).

**Loser routing**: When a winners bracket match completes, the loser's name is written into the appropriate losers bracket slot. This routing is computed by `getLoserDestination(winnersBracketMatchNumber, totalWinnersRounds)` — a pure function that maps winners bracket positions to losers bracket positions.

Total matches: between `2N - 2` and `2N - 1`.

### Round Robin (`generateRoundRobin`)

Uses the [circle method](https://en.wikipedia.org/wiki/Round-robin_tournament#Circle_method) for scheduling:

1. If N is odd, add a "bye" placeholder participant to make N even
2. Fix participant[0], rotate the rest across N-1 rounds
3. Each round generates N/2 matches
4. Remove any match involving the "bye" placeholder
5. All matches get `bracketSection: "main"`, `round` = round index (0-based), `position` = match index within round

Total matches: `N * (N-1) / 2` (invariant).

### Group Stage (`generateGroupStage`)

1. Distribute participants into `numGroups` groups as evenly as possible (larger groups first if uneven)
2. For each group, generate a round-robin schedule using the circle method
3. Group matches get `bracketSection: "group"`, `groupId` = group index
4. Generate an empty single-elimination knockout bracket sized for `numGroups * advanceCount` participants
5. Knockout matches get `bracketSection: "knockout"`, all players null (TBD until group stage completes)
6. When all group matches complete, the server populates knockout bracket slots from group standings

---

## Payout Calculation Logic

### `computePayouts` (pure function, `shared/payoutEngine.ts`)

```
Input:
  pot: number                    — total credits wagered on this match
  bets: { userId, amount, selectedWinner }[]
  winner: string                 — the recorded match winner

Algorithm:
  winningBets = bets.filter(b => b.selectedWinner === winner)
  if winningBets.length === 0: return []   // house keeps pot

  totalWinningAmount = sum(winningBets.map(b => b.amount))
  payouts = winningBets.map(b => ({
    userId: b.userId,
    amount: Math.floor(b.amount / totalWinningAmount * pot)
  }))

  return payouts
```

**Invariants**:
- `sum(payouts) <= pot` (floor rounding ensures this)
- Each payout > 0 when `winningBets.length > 0` (since each winning bet amount > 0 and pot > 0)

### Server-side payout trigger

In `routes.ts`, when `PATCH /api/brackets/:id` receives a structure update that introduces a new winner on a match:

1. Detect newly-won matches by diffing old vs new structure
2. For each newly-won match, call `computePayouts(pot, matchBets, winner)`
3. Apply each payout to the appropriate balance (bracket or global)
4. This replaces the current no-op behavior

---

## API Routes

### New Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/users` | required | Returns all users (password omitted) |
| POST | `/api/brackets/:id/join` | required | Join a bracket (existing, needs membership tracking fix) |

### Modified Routes

| Method | Path | Change |
|---|---|---|
| GET | `/api/brackets` | Filter by access: public OR (private AND (creator OR member)) |
| PATCH | `/api/brackets/:id` | Trigger payout engine when match winner recorded |
| POST | `/api/brackets` | Accept `bracketFormat`, `numGroups`, `advanceCount` |
| POST | `/api/brackets/:id/bets` | Return 403 if private bracket and user not a member |

### Route Details

**`GET /api/users`**
```
- Requires authentication (401 if not)
- Returns: User[] with password field omitted
- Implementation: storage.listUsers() → map to omit password
```

**`GET /api/brackets` (updated)**
```
- Requires authentication
- Returns brackets where:
    bracket.isPublic === true
    OR bracket.creatorId === req.user.id
    OR storage.hasJoinedBracket(req.user.id, bracket.id) === true
```

**`PATCH /api/brackets/:id` (updated — payout trigger)**
```
- After updating structure, diff old vs new to find newly-won matches
- For each newly-won match:
    matchBets = (await storage.getBracketBets(bracketId))
                  .filter(b => b.matchNumber === match.matchNumber)
    pot = sum(matchBets.map(b => b.amount))
    payouts = computePayouts(pot, matchBets, match.winner)
    for each payout:
      if bracket.useIndependentCredits:
        storage.updateBracketBalance(payout.userId, bracketId, +payout.amount)
      else:
        storage.updateUserCurrency(payout.userId, +payout.amount)
```

**`POST /api/brackets/:id/bets` (updated — access control)**
```
- If bracket.isPublic === false:
    if NOT (req.user.id === bracket.creatorId OR hasJoinedBracket):
      return 403
```

---

## Frontend Component Architecture

### BracketViewer (dispatcher)

The existing `BracketViewer` component becomes a dispatcher that renders the appropriate format-specific viewer based on `bracket.bracketFormat`:

```typescript
function BracketViewer({ bracket, onMatchClick, isCreator, isEligibleBettor }) {
  const matches = JSON.parse(bracket.structure);
  switch (bracket.bracketFormat) {
    case "double_elimination": return <DoubleElimViewer ... />;
    case "round_robin":        return <RoundRobinViewer ... />;
    case "group_stage":        return <GroupStageViewer ... />;
    default:                   return <SingleElimViewer ... />;
  }
}
```

### SingleElimViewer + ConnectorSVG

The single elim viewer renders rounds as columns. Connectors are drawn as an SVG overlay positioned absolutely over the bracket grid.

**Connector algorithm**:
- After layout, each match card has a known DOM rect (via `useRef` + `getBoundingClientRect`)
- For each match M in round R, find the target match T in round R+1 that M feeds into
- Draw an SVG path: horizontal line from right edge of M → midpoint → vertical line → horizontal line to left edge of T
- If M has a winner, apply `stroke: #FFE600` (yellow accent); otherwise `stroke: #1A1A4E` (navy)

```
Match card (R)  ──────┐
                      │  (vertical connector)
Match card (R)  ──────┤
                      └──── Target match (R+1)
```

### DoubleElimViewer

Renders three sections stacked vertically:
1. **Winners Bracket** — `SingleElimViewer` filtered to `bracketSection === "winners"`
2. **Losers Bracket** — `SingleElimViewer` filtered to `bracketSection === "losers"`
3. **Grand Final** — single `MatchCard` for `bracketSection === "grand_final"`

Each section has a labeled header.

### RoundRobinViewer

Two-panel layout:
- Left: match list grouped by round (collapsible per round)
- Right: `StandingsTable` showing participant, wins, losses, points

### GroupStageViewer

- Group panels (one per group): each shows a mini round-robin match list + group standings
- After all group matches complete: `KnockoutBracket` section appears below, using `SingleElimViewer`

### StandingsTable

```typescript
interface StandingsTableProps {
  standings: Standing[];
  groupId?: number;  // if provided, filter to this group
}
```

Columns: Rank, Participant, W, L, Pts. Sorted by points descending, head-to-head as tiebreaker.

### JoinBracketForm (home page)

A small inline form on the home page:
- Input: Bracket ID (number)
- Input: Access Code (text)
- Submit button: "Join Private Bracket"
- On success: invalidate `/api/brackets` query → bracket appears in list
- On error: inline error message below form

### Polling (bracket-page.tsx)

```typescript
const { data: bracket } = useQuery({
  queryKey: [`/api/brackets/${id}`],
  refetchInterval: bracket?.status === "active" ? 5000 : false,
  refetchIntervalInBackground: false,  // pauses when tab hidden
});

const { data: bets } = useQuery({
  queryKey: [`/api/brackets/${id}/bets`],
  refetchInterval: bracket?.status === "active" ? 5000 : false,
  refetchIntervalInBackground: false,
});
```

TanStack Query's `refetchIntervalInBackground: false` handles the tab-visibility pause automatically.

---

## GambaGame Visual Theme

### CSS Variables (`client/src/index.css`)

```css
@import url('https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap');

:root {
  --gamba-bg: #4FC3F7;
  --gamba-navy: #1A1A4E;
  --gamba-card-bg: #E8F7FF;
  --gamba-yellow: #FFE600;
  --gamba-green: #00C853;
  --gamba-red: #FF4444;
  --gamba-shadow: 3px 3px 0px #1A1A4E;
  --gamba-border: 2px solid #1A1A4E;
  --gamba-radius: 2px;
}

body {
  background-color: var(--gamba-bg);
  color: var(--gamba-navy);
  font-family: system-ui, monospace;
}

h1, h2, h3 {
  font-family: 'Silkscreen', cursive;
  color: var(--gamba-navy);
}
```

### Tailwind Config Extensions (`tailwind.config.ts`)

```typescript
theme: {
  extend: {
    colors: {
      gamba: {
        bg: "#4FC3F7",
        navy: "#1A1A4E",
        card: "#E8F7FF",
        yellow: "#FFE600",
        green: "#00C853",
        red: "#FF4444",
      }
    },
    fontFamily: {
      silkscreen: ["Silkscreen", "cursive"],
    },
    boxShadow: {
      gamba: "3px 3px 0px #1A1A4E",
    },
    borderRadius: {
      gamba: "2px",
    },
  }
}
```

### Component Theme Application

- **Cards**: `bg-gamba-card border-2 border-gamba-navy rounded-gamba shadow-gamba`
- **Buttons (primary)**: `bg-gamba-navy text-white border-2 border-gamba-navy shadow-gamba hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none`
- **Active match indicator**: `border-gamba-yellow bg-gamba-yellow/20`
- **Winner highlight**: `text-gamba-green font-bold`
- **Destructive actions**: `bg-gamba-red text-white`
- **Navigation**: `bg-gamba-navy text-white` with "GambaGame" in `font-silkscreen`

### Navigation Update

The `Navigation` component is updated to display "GambaGame" in Silkscreen font as the app name, replacing the current "Home" button text.

---

## Error Handling

### Server-side

- All route handlers wrap async operations in try/catch and return structured `{ message: string }` error responses
- Payout engine errors are logged but do not fail the match update (defensive: match winner is recorded even if payout calculation fails)
- `DbStorage` methods propagate Drizzle errors as-is; the route layer catches and returns 500

### Client-side

- All mutations use `onError` callbacks that display toast notifications
- The `JoinBracketForm` shows inline error text (not a toast) to keep the user on the page
- Polling errors are silently retried by TanStack Query (default retry behavior)
- Format validation errors are shown inline via react-hook-form `FormMessage` before submission

### Participant Limit Validation

Validated at two layers:
1. **Client**: `react-hook-form` with a custom validator that checks participant count against the selected format's limits. Error shown inline before form submission.
2. **Server**: `POST /api/brackets` validates participant count from the structure length against the format limits. Returns 400 with a descriptive message if out of range.

---

## Testing Strategy

### Test Stack

- **vitest** — test runner (already in devDependencies via Vite ecosystem; add explicitly)
- **supertest** — HTTP integration tests against the Express app
- **fast-check** — property-based testing library
- **@testing-library/react** — component tests (optional, for UI unit tests)

Add to `package.json` devDependencies:
```json
"vitest": "^1.x",
"supertest": "^7.x",
"@types/supertest": "^6.x",
"fast-check": "^3.x"
```

Test script: `"test": "vitest run"` (single-pass, no watch mode).

### Test File Structure

```
tests/
├── unit/
│   ├── payoutEngine.test.ts       — unit + PBT for payout math
│   ├── bracketGenerators.test.ts  — unit + PBT for all four generators
│   └── standings.test.ts          — unit tests for standings computation
├── integration/
│   ├── auth.test.ts               — register, login, logout
│   ├── brackets.test.ts           — CRUD, access control, filtering
│   ├── bets.test.ts               — place bet, payout trigger
│   ├── users.test.ts              — GET /api/users endpoint
│   └── lifecycle/
│       ├── singleElim.test.ts     — full tournament lifecycle (single elim)
│       ├── doubleElim.test.ts     — full tournament lifecycle (double elim)
│       ├── roundRobin.test.ts     — full tournament lifecycle (round robin)
│       └── groupStage.test.ts     — full tournament lifecycle (group stage)
└── pbt/
    ├── bracketStructure.pbt.ts    — fast-check properties for bracket invariants
    └── payoutMath.pbt.ts          — fast-check properties for payout invariants
```

### Integration Test Approach

Integration tests use the Express app with `MemStorage` (no database required). Each test file:
1. Creates a fresh `MemStorage` instance
2. Registers test users via `POST /api/register`
3. Authenticates via `POST /api/login` (captures session cookie)
4. Exercises the feature under test
5. Asserts response shapes and side effects

Multi-user simulation (Requirement 9): Tests create 2+ non-admin users, each places bets, then the admin records a winner. Assertions verify payout distribution.

### Property-Based Test Configuration

Each property test uses `fast-check` with a minimum of 100 runs:

```typescript
import fc from "fast-check";
import { test, expect } from "vitest";

test("Property N: description", () => {
  fc.assert(
    fc.property(/* arbitraries */, (input) => {
      // assertion
    }),
    { numRuns: 100 }
  );
});
// Tag: Feature: tournament-tracker-completion, Property N: <property text>
```

### Dual Testing Approach

- **Unit tests** cover specific examples, edge cases (all bets on loser, zero bets, odd participant counts), and error conditions
- **Property tests** cover universal invariants across the full input space
- **Integration tests** cover API contracts, auth guards, and full lifecycle flows
- Property tests and unit tests are complementary: unit tests catch concrete bugs, property tests verify general correctness across arbitrary inputs


---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

PBT is applicable here because the core logic — bracket structure generation and payout math — consists of pure functions with large input spaces where input variation reveals edge cases (odd participant counts, uneven groups, skewed bet distributions). The property-based testing library is **fast-check**, configured for a minimum of 100 iterations per property.

**Property Reflection**: After reviewing all testable criteria, the following consolidations were made:
- Requirements 1.7 and 1.3/1.4 (payout conservation) are unified into Property 1 (sum ≤ pot) and Property 2 (each payout > 0), which together subsume the individual per-bet assertions.
- Requirements 10.1 and 10.2 (single elim structure) are kept separate because they test different invariants (match count vs participant uniqueness).
- Requirements 13.1 and 13.2 (round robin match count) are identical — consolidated into Property 7.
- Requirements 15.1 and 12.8 (double elim match count) are identical — consolidated into Property 5.
- Requirements 15.2 and 13.1/13.2 (round robin) are consolidated into Property 7.

---

### Property 1: Payout sum never exceeds the pot

*For any* match pot (positive integer) and any array of bets with at least one winning bet, the sum of all computed payouts SHALL be less than or equal to the pot.

**Validates: Requirements 1.7, 10.3**

---

### Property 2: Each winning bettor receives a positive payout

*For any* match pot (positive integer) and any non-empty array of winning bets (each with amount > 0), every individual payout computed by `computePayouts` SHALL be greater than zero.

**Validates: Requirements 1.8, 10.4**

---

### Property 3: Single elimination match count invariant

*For any* participant count N between 2 and 64, the bracket structure generated by `generateSingleElim` SHALL contain exactly `N - 1` total matches.

**Validates: Requirements 10.1**

---

### Property 4: Single elimination participant uniqueness

*For any* list of N participants (2 ≤ N ≤ 64), every participant name SHALL appear in exactly one match in round 0 (as player1 or player2) or as a pre-filled player in round 1 (bye recipient); no participant name SHALL appear more than once across the entire generated structure.

**Validates: Requirements 10.2**

---

### Property 5: Double elimination match count bounds

*For any* participant count N between 4 and 32, the bracket structure generated by `generateDoubleElim` SHALL contain between `2*N - 2` and `2*N - 1` total matches.

**Validates: Requirements 12.8, 15.1**

---

### Property 6: Double elimination losers bracket integrity

*For any* double elimination bracket structure, no participant SHALL appear in any losers bracket match (`bracketSection === "losers"`) in the initial generated structure — losers bracket slots are all null (TBD) until winners bracket matches are played.

**Validates: Requirements 15.5**

---

### Property 7: Round robin match count and participant coverage

*For any* participant count N between 3 and 16, the bracket structure generated by `generateRoundRobin` SHALL contain exactly `N * (N - 1) / 2` matches, and each participant SHALL appear in exactly `N - 1` matches across the full structure.

**Validates: Requirements 13.1, 13.2, 15.2**

---

### Property 8: Round robin scheduling — no participant appears twice in a round

*For any* participant count N between 3 and 16, in the bracket structure generated by `generateRoundRobin`, no participant SHALL appear more than once within any single round (same `round` index).

**Validates: Requirements 13.3**

---

### Property 9: Round robin standings points conservation

*For any* complete set of round robin match results (all matches have a winner), the sum of all participant points in the computed standings SHALL equal the total number of matches played.

**Validates: Requirements 15.4**

---

### Property 10: Group stage participant coverage

*For any* group stage configuration (2–8 groups, 4–32 participants), every participant SHALL appear in exactly `groupSize - 1` group stage matches, where `groupSize` is the number of participants in their assigned group.

**Validates: Requirements 15.3**

---

### Property 11: Bracket structure JSON round-trip

*For any* valid `MatchNode[]` array (generated by any of the four format generators), serializing to JSON and deserializing back SHALL produce a structurally equivalent array with identical `matchNumber`, `round`, `position`, `player1`, `player2`, `winner`, and `bracketSection` values for every element.

**Validates: Requirements 10.5**

---

### Property 12: Password omission from user list

*For any* set of registered users, the response from `GET /api/users` SHALL contain no object with a `password` field.

**Validates: Requirements 2.4**

---

### Property 13: Participant limit enforcement

*For any* bracket creation request where the participant count is outside the valid range for the selected format, the server SHALL reject the request with HTTP 400.

**Validates: Requirements 11.6**

