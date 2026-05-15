# Implementation Plan: GambaGame Tournament Tracker Completion

## Overview

Implementation proceeds in dependency order: shared foundations first (schema, IStorage, generators, payout engine), then server-side bug fixes (payouts, `/api/users`, leaderboard data, bracket filtering), then new features (new formats, UI improvements, theme), and finally the full test suite. Each task builds directly on the previous ones with no orphaned code.

## Tasks

- [x] 1. Add test dependencies and configure vitest
  - Add `vitest`, `supertest`, `@types/supertest`, and `fast-check` to `devDependencies` in `package.json`
  - Add `"test": "vitest run"` script to `package.json`
  - Create `vitest.config.ts` at the workspace root that points to the `tests/` directory and sets the environment to `node`
  - _Requirements: 9, 10, 15_

- [x] 2. Extend `shared/schema.ts` with new tables and columns
  - Add `bracketFormat`, `numGroups`, `advanceCount` columns to the `brackets` table
  - Add `bracketMembers` table (`id`, `userId`, `bracketId`)
  - Add `standings` table (`id`, `bracketId`, `participant`, `wins`, `losses`, `points`, `groupId`)
  - Update `insertBracketSchema` to include the three new bracket columns
  - Export `Standing`, `BracketMember`, `InsertStanding`, `InsertBracketMember` types
  - _Requirements: 6.1, 11.2, 13.4, 14.1_

- [x] 3. Define `IStorage` interface and refactor `MemStorage`
  - Add `IStorage` interface to `server/storage.ts` with all methods from the design (including `listUsers`, `joinBracket`, `hasJoinedBracket`, `getBracketMembers`, `upsertStanding`, `getStandings`)
  - Implement all new methods on `MemStorage` (in-memory maps for members and standings)
  - Export `storage` as `IStorage` type so routes remain storage-agnostic
  - _Requirements: 6.1, 6.3, 2.1, 4.6_

- [x] 4. Create `shared/payoutEngine.ts`
  - Implement `computePayouts(pot, bets, winner)` pure function using the floor-proportional algorithm from the design
  - Return empty array when no winning bets exist (house keeps pot)
  - Export `PayoutResult` interface
  - _Requirements: 1.1, 1.2, 1.5, 1.6_

  - [x]* 4.1 Write unit tests for `computePayouts`
    - Test: all bets on loser → empty payout array
    - Test: single winning bet → receives full pot (floored)
    - Test: two equal winning bets → each receives half pot
    - Test: zero bets → empty array
    - _Requirements: 1.5, 1.6_

  - [x]* 4.2 Write property test for payout sum ≤ pot (Property 1)
    - **Property 1: Payout sum never exceeds the pot**
    - **Validates: Requirements 1.7, 10.3**

  - [x]* 4.3 Write property test for each winning payout > 0 (Property 2)
    - **Property 2: Each winning bettor receives a positive payout**
    - **Validates: Requirements 1.8, 10.4**

- [x] 5. Create `shared/bracketGenerators.ts` — single elimination
  - Define `MatchNode` interface and `BracketFormat` type as specified in the design
  - Extract `generateBracketStructure` from `client/src/pages/bracket-create.tsx` into `generateSingleElim(participants: string[]): MatchNode[]`
  - All matches get `bracketSection: "main"`
  - Update `bracket-create.tsx` to import and call `generateSingleElim` instead of the local function
  - _Requirements: 10.1, 10.2, 11.3, 11.4_

  - [x]* 5.1 Write unit tests for `generateSingleElim`
    - Test: 2 participants → 1 match, no byes
    - Test: 3 participants → 2 matches, 1 bye in round 1
    - Test: 4 participants → 3 matches, standard bracket
    - Test: 8 participants → 7 matches, 3 rounds
    - _Requirements: 10.1, 10.2_

  - [x]* 5.2 Write property test for single elim match count (Property 3)
    - **Property 3: Single elimination match count invariant — exactly N-1 matches for N participants (2 ≤ N ≤ 64)**
    - **Validates: Requirements 10.1**

  - [x]* 5.3 Write property test for single elim participant uniqueness (Property 4)
    - **Property 4: Single elimination participant uniqueness — each participant appears exactly once in round 0 or as a bye recipient in round 1**
    - **Validates: Requirements 10.2**

- [x] 6. Add `generateDoubleElim` to `shared/bracketGenerators.ts`
  - Implement winners bracket as a standard single-elim structure with `bracketSection: "winners"`
  - Generate losers bracket slots (all null/TBD) with `bracketSection: "losers"` and correct round/position mapping
  - Generate grand final match with `bracketSection: "grand_final"`
  - Number matches: winners first, then losers, then grand final
  - Export `getLoserDestination(matchNumber, totalWinnersRounds)` helper for server-side loser routing
  - _Requirements: 12.1, 12.4, 12.5, 12.6_

  - [x]* 6.1 Write unit tests for `generateDoubleElim`
    - Test: 4 participants → winners bracket (3 matches) + losers bracket + grand final
    - Test: loser from winners round 0 appears in correct losers bracket slot after match update
    - _Requirements: 12.1, 12.2, 12.3_

  - [x]* 6.2 Write property test for double elim match count bounds (Property 5)
    - **Property 5: Double elimination match count bounds — between 2N-2 and 2N-1 matches for N participants (4 ≤ N ≤ 32)**
    - **Validates: Requirements 12.8, 15.1**

  - [x]* 6.3 Write property test for double elim losers bracket integrity (Property 6)
    - **Property 6: Double elimination losers bracket integrity — all losers bracket slots are null in the initial generated structure**
    - **Validates: Requirements 15.5**

- [x] 7. Add `generateRoundRobin` to `shared/bracketGenerators.ts`
  - Implement the circle method scheduler (fix participant[0], rotate the rest across N-1 rounds)
  - If N is odd, add a "bye" placeholder and remove matches involving it
  - All matches get `bracketSection: "main"`, zero-based `round` and `position`
  - _Requirements: 13.1, 13.2, 13.3_

  - [x]* 7.1 Write unit tests for `generateRoundRobin`
    - Test: 3 participants → 3 matches across 3 rounds (1 match per round)
    - Test: 4 participants → 6 matches, no participant appears twice in same round
    - _Requirements: 13.1, 13.2, 13.3_

  - [x]* 7.2 Write property test for round robin match count and coverage (Property 7)
    - **Property 7: Round robin match count and participant coverage — exactly N*(N-1)/2 matches, each participant in exactly N-1 matches (3 ≤ N ≤ 16)**
    - **Validates: Requirements 13.1, 13.2, 15.2**

  - [x]* 7.3 Write property test for round robin scheduling (Property 8)
    - **Property 8: Round robin scheduling — no participant appears more than once within any single round**
    - **Validates: Requirements 13.3**

- [x] 8. Add `generateGroupStage` to `shared/bracketGenerators.ts`
  - Distribute participants into `numGroups` groups as evenly as possible (larger groups first)
  - For each group, generate a round-robin schedule with `bracketSection: "group"` and `groupId` set
  - Generate an empty single-elimination knockout bracket sized for `numGroups * advanceCount` with `bracketSection: "knockout"` and all players null
  - _Requirements: 14.1, 14.2, 14.3, 14.5_

  - [x]* 8.1 Write unit tests for `generateGroupStage`
    - Test: 4 participants, 2 groups, 1 advance → 2 group matches + 1 knockout match
    - Test: 8 participants, 2 groups, 2 advance → 12 group matches + 3 knockout matches
    - _Requirements: 14.2, 14.3, 14.5_

  - [x]* 8.2 Write property test for group stage participant coverage (Property 10)
    - **Property 10: Group stage participant coverage — every participant appears in exactly groupSize-1 group stage matches**
    - **Validates: Requirements 15.3**

- [x] 9. Checkpoint — Ensure all generator and payout engine tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Wire payout engine into `PATCH /api/brackets/:id` in `server/routes.ts`
  - Import `computePayouts` from `shared/payoutEngine.ts`
  - After updating the bracket structure, diff old vs new structure to detect newly-won matches
  - For each newly-won match: fetch bets for that `matchNumber`, compute pot, call `computePayouts`, apply each payout to bracket balance or global currency based on `useIndependentCredits`
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x]* 10.1 Write integration test for payout trigger on match completion
    - Register admin + 2 bettors, create bracket, start tournament, place bets, record winner
    - Assert winning bettor balances increased by correct payout amounts
    - Assert losing bettor balance unchanged after match
    - Assert sum of payouts ≤ pot
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 9.3, 9.4, 9.5_

- [x] 11. Add `GET /api/users` endpoint to `server/routes.ts`
  - Implement `storage.listUsers()` on `MemStorage` (iterate users map, return array)
  - Add route: requires authentication (401 if not), calls `storage.listUsers()`, omits `password` field from each user
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x]* 11.1 Write integration tests for `GET /api/users`
    - Test: unauthenticated request → 401
    - Test: authenticated request → 200 with array of users, no `password` field on any object
    - _Requirements: 2.2, 2.3, 2.4_

  - [ ]* 11.2 Write property test for password omission (Property 12)
    - **Property 12: Password omission from user list — GET /api/users response contains no object with a `password` field**
    - **Validates: Requirements 2.4**

- [x] 12. Fix home page bracket filtering in `GET /api/brackets`
  - Update `MemStorage` to track bracket membership via `joinBracket` / `hasJoinedBracket` (already added in task 3)
  - Update `GET /api/brackets` route to filter: return bracket if `isPublic`, or `creatorId === req.user.id`, or `hasJoinedBracket(userId, bracketId)`
  - Update `POST /api/brackets/:id/join` to call `storage.joinBracket(userId, bracketId)` so membership is persisted
  - _Requirements: 4.1, 4.2, 4.6_

  - [x]* 12.1 Write integration tests for bracket filtering
    - Test: public bracket visible to all authenticated users
    - Test: private bracket visible only to creator and joined users
    - Test: joining with correct access code makes bracket appear in list
    - _Requirements: 4.1, 4.2, 4.4_

- [x] 13. Add spectator access control for private bracket betting
  - In `POST /api/brackets/:id/bets`: if bracket is private and user is not creator and has not joined → return 403
  - _Requirements: 5.4_

  - [x]* 13.1 Write integration test for spectator bet rejection
    - Test: non-joined user attempting to bet on private bracket → 403
    - Test: joined user can place bet on private bracket
    - _Requirements: 5.4_

- [x] 14. Fix results leaderboard computation in `client/src/pages/bracket-results.tsx`
  - Replace the current incorrect profit calculation with: net profit = sum of payouts received − sum of bets placed, across all matches in the bracket
  - Fetch bets from `/api/brackets/:id/bets` and users from `/api/users`; compute per-user profit client-side
  - Sort bettors by net profit descending; show negative profit for users who lost all bets
  - Display "No bets placed" when leaderboard is empty
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 15. Implement `DbStorage` in `server/storage.ts`
  - Create `DbStorage` class implementing `IStorage` using Drizzle ORM and the Postgres client
  - Implement all methods (users, brackets, bracket balances, bracket members, bets, standings)
  - Use `connect-pg-simple` for `sessionStore` when `DbStorage` is active
  - At the bottom of `storage.ts`, export `storage`: use `DbStorage` if `DATABASE_URL` is set, otherwise `MemStorage`
  - Uses `pg.Pool` + `drizzle-orm/node-postgres` (not `@neondatabase/serverless`) for compatibility with standard Postgres installations
  - `import 'dotenv/config'` must be the **first** import in `server/index.ts` — ESM evaluates imports top-to-bottom, so placing it after route imports causes storage to initialise before DATABASE_URL is loaded
  - Database: native PostgreSQL 17 Windows service (`postgresql-x64-17`, auto-starts with Windows); user `tt`, password `changeme`, db `tournament_tracker`
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x]* 15.1 Write integration tests for DbStorage fallback behavior
    - Test: when `DATABASE_URL` is not set, `storage` is an instance of `MemStorage`
    - _Requirements: 6.3_

- [x] 16. Checkpoint — Ensure all bug-fix and persistence tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Add format selection to bracket creation form (`client/src/pages/bracket-create.tsx`)
  - Add a `FormatSelector` component (radio group or select) with four options: Single Elimination, Double Elimination, Round Robin, Group Stage
  - Show `GroupStageOptions` (numGroups 2–8, advanceCount 1–2) conditionally when Group Stage is selected
  - Add client-side validation: check participant count against per-format limits (single: 2–64, double: 4–32, round robin: 3–16, group stage: 4–32); show inline `FormMessage` if out of range
  - Pass `bracketFormat`, `numGroups`, `advanceCount` in the POST body; call the correct generator based on format
  - Update `insertBracketSchema` usage to include the new fields
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.6, 11.7_

- [x] 18. Add server-side participant limit validation to `POST /api/brackets`
  - After parsing the request body, validate participant count (derived from structure length) against the format's allowed range
  - Return HTTP 400 with a descriptive message if out of range
  - _Requirements: 11.6_

  - [x]* 18.1 Write property test for participant limit enforcement (Property 13)
    - **Property 13: Participant limit enforcement — bracket creation with out-of-range participant count returns HTTP 400**
    - **Validates: Requirements 11.6**

- [x] 19. Add format display to bracket page and home page cards
  - Display the format name (e.g., "Double Elimination") on the bracket page header and on each bracket card on the home page
  - _Requirements: 11.5_

- [x] 20. Implement `DoubleElimViewer` and update `BracketViewer` dispatcher
  - Refactor `BracketViewer` to dispatch to format-specific viewers based on `bracket.bracketFormat`
  - Implement `DoubleElimViewer`: render Winners Bracket section, Losers Bracket section, and Grand Final match card as distinct labeled sections
  - Wire loser routing in `server/storage.ts` `updateBracket`: when a winners bracket match gets a winner, write the loser into the correct losers bracket slot using `getLoserDestination`
  - _Requirements: 12.2, 12.3, 12.6, 12.7_

  - [x]* 20.1 Write lifecycle integration test for double elimination (Requirement 9.8)
    - Register admin + 2 bettors, create double-elim bracket with 4 participants
    - Advance all winners bracket matches; verify a first-round loser appears in losers bracket
    - Complete losers bracket and grand final; assert correct champion
    - _Requirements: 9.8, 12.2, 12.3, 12.4, 12.5_

- [x] 21. Implement `RoundRobinViewer` and standings update logic
  - Implement `RoundRobinViewer`: left panel with match list grouped by round, right panel with `StandingsTable`
  - Implement `StandingsTable` component (columns: Rank, Participant, W, L, Pts; sorted by points desc)
  - In `PATCH /api/brackets/:id`, when a round robin match gets a winner, call `storage.upsertStanding` to increment winner's wins/points and loser's losses
  - Add `GET /api/brackets/:id/standings` route that returns `storage.getStandings(bracketId)`
  - When all round robin matches are complete, determine champion (most points; head-to-head tiebreaker) and update bracket status
  - _Requirements: 13.4, 13.5, 13.6, 13.7_

  - [x]* 21.1 Write lifecycle integration test for round robin (Requirement 9.9)
    - Create round robin bracket with 4 participants; advance all matches
    - Assert standings updated correctly after each match
    - Assert correct champion determined at end
    - _Requirements: 9.9, 13.4, 13.5, 13.6_

  - [x]* 21.2 Write property test for round robin standings points conservation (Property 9)
    - **Property 9: Round robin standings points conservation — sum of all participant points equals total matches played**
    - **Validates: Requirements 15.4**

- [x] 22. Implement `GroupStageViewer` and group stage advancement logic
  - Implement `GroupStageViewer`: one `GroupPanel` per group (mini match list + `StandingsTable` filtered by `groupId`), plus a `KnockoutBracket` section (using `SingleElimViewer`) shown after group stage completes
  - In `PATCH /api/brackets/:id`, when all group stage matches are complete, seed advancing participants into knockout bracket slots based on group standings and update the structure
  - _Requirements: 14.4, 14.5, 14.6, 14.7, 14.8_

  - [x]* 22.1 Write lifecycle integration test for group stage (Requirement 9.10)
    - Create group stage bracket with 8 participants, 2 groups, 1 advance
    - Complete all group matches; assert correct participants seeded into knockout bracket
    - Complete knockout bracket; assert correct champion
    - _Requirements: 9.10, 14.5, 14.6, 14.7_

- [-] 23. Add bracket viewer SVG connectors for single elimination
  - In `SingleElimViewer`, add a `ConnectorSVG` overlay positioned absolutely over the bracket grid
  - Use `useRef` + `getBoundingClientRect` to measure match card positions after layout
  - Draw SVG paths connecting each match card's right edge to the target match in the next round (elbow connector: horizontal → vertical → horizontal)
  - Apply `stroke: var(--gamba-yellow)` for matches with a winner, `stroke: var(--gamba-navy)` for undecided matches
  - Handle bye recipients correctly (round 0 winner feeds into round 1 player2 slot)
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [-] 24. Add bracket state polling to `bracket-page.tsx`
  - Add `refetchInterval: bracket?.status === "active" ? 5000 : false` to the bracket query
  - Add the same `refetchInterval` to the bets query
  - Set `refetchIntervalInBackground: false` on both queries so polling pauses when the tab is hidden
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [-] 25. Add `JoinBracketForm` to `client/src/pages/home-page.tsx`
  - Add an inline form with Bracket ID (number input) and Access Code (text input) fields and a "Join Private Bracket" submit button
  - On success: invalidate `/api/brackets` query so the joined bracket appears in the list
  - On error: display inline error message below the form (not a toast)
  - _Requirements: 4.3, 4.4, 4.5_

- [-] 26. Add spectator access control to `BracketPage` frontend
  - Fetch membership status (or derive from bracket data) to determine if the current user is eligible to bet
  - Show `BettingPanel` only to: the creator (if `adminCanBet`), joined users (private bracket), or all authenticated users (public bracket)
  - Show bracket structure in read-only mode without betting panel for non-joined users on private brackets
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 27. Apply GambaGame visual theme
  - Add Google Fonts import for Silkscreen to `client/src/index.css`; set CSS variables (`--gamba-bg`, `--gamba-navy`, `--gamba-card-bg`, `--gamba-yellow`, `--gamba-green`, `--gamba-red`, `--gamba-shadow`, `--gamba-border`, `--gamba-radius`)
  - Set `body` background to `var(--gamba-bg)` and `h1`–`h3` to use `font-family: 'Silkscreen'`
  - Extend `tailwind.config.ts` with `gamba` color palette, `font-silkscreen`, `shadow-gamba`, and `rounded-gamba`
  - Update `Navigation` component to display "GambaGame" in Silkscreen font with `bg-gamba-navy text-white` styling
  - Apply card theme (`bg-gamba-card border-2 border-gamba-navy rounded-gamba shadow-gamba`) to all Card components across auth, home, bracket creation, bracket view, and results pages
  - Apply button theme (primary: `bg-gamba-navy`, destructive: `bg-gamba-red`, active match indicator: `border-gamba-yellow`)
  - Apply winner highlight (`text-gamba-green font-bold`) in bracket viewers
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9_

- [x] 28. Write full lifecycle integration tests for single elimination (Requirements 9.1–9.7)
  - [x] 28.1 Single elim lifecycle — power-of-two participants, no byes
    - Register admin + 2 bettors; create 4-participant single-elim bracket
    - Advance all matches with bets placed before each; assert correct champion, payouts, and leaderboard order
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7_

  - [x] 28.2 Single elim lifecycle — odd participant count with byes
    - Create 3-participant bracket; verify bye recipient advances correctly; assert correct champion
    - _Requirements: 9.6_

- [x] 29. Write property test for bracket structure JSON round-trip (Property 11)
  - [x]* 29.1 Write property test for JSON round-trip (Property 11)
    - **Property 11: Bracket structure JSON round-trip — serialize then deserialize any MatchNode[] and recover identical values**
    - **Validates: Requirements 10.5**

- [x] 30. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (Properties 1–13 from the design)
- Unit tests validate specific examples and edge cases
- Integration tests use `MemStorage` — no database required to run the test suite
- `DbStorage` (task 15) can be implemented and tested independently once `IStorage` is in place
