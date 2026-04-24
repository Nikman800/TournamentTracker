# Requirements Document

## Introduction

This document covers the completion of the TournamentTracker web app — rebranded as **GambaGame** — a full-stack TypeScript application for creating tournament brackets with virtual-currency betting. The app has a working auth system, bracket lifecycle, match progression, and betting UI, but several core features are broken or missing: bet payouts never fire, the results leaderboard is incorrect, the `/api/users` endpoint is absent, the home page shows all brackets without privacy filtering, there is no join-with-access-code UI, Postgres persistence is unwired, the bracket viewer lacks visual connectors, and there are no automated tests. Additionally, the app currently only supports single-elimination brackets; this spec adds double elimination, round robin, and group stage as selectable tournament formats. This spec covers fixing all of these gaps, adding new bracket formats, applying the GambaGame visual theme, and adding a comprehensive automated test suite.

## Glossary

- **System**: The TournamentTracker Express + React application, rebranded as GambaGame.
- **Bracket**: A tournament instance with a name, participant list, status, match structure, and a selected format (single elimination, double elimination, round robin, or group stage).
- **BracketFormat**: The tournament format — one of `single_elimination`, `double_elimination`, `round_robin`, or `group_stage`.
- **Match**: A single head-to-head contest between two participants within a Bracket, identified by a globally unique `matchNumber`.
- **Winners Bracket**: In double elimination, the bracket side where undefeated participants compete.
- **Losers Bracket**: In double elimination, the bracket side where participants who have lost once compete for a second chance.
- **Grand Final**: In double elimination, the concluding match between the Winners Bracket champion and the Losers Bracket champion.
- **Group**: In group stage, a pool of participants who each play every other participant in that pool once.
- **Group Stage**: A round-robin phase where participants are divided into Groups; top finishers from each Group advance to a knockout stage.
- **Standing**: In round robin or group stage, a participant's record expressed as wins, losses, and points.
- **Bet**: A wager placed by a User on a specific Match outcome, deducting credits at placement time.
- **Payout**: The credit amount returned to a User after a Match concludes and their Bet was correct.
- **Pot**: The total credits wagered by all Users on a single Match.
- **Winner_Share**: The proportion of the Pot distributed to Users who bet on the correct outcome, proportional to their individual wager.
- **BracketBalance**: A per-user, per-bracket credit balance used when `useIndependentCredits` is enabled.
- **GlobalBalance**: The `virtualCurrency` field on the User record, used when `useIndependentCredits` is disabled.
- **Admin**: The User who created a Bracket (identified by `creatorId`).
- **Participant**: A named player string within a Bracket's match structure (not a User account).
- **Spectator**: A logged-in User who has not joined a private Bracket.
- **Storage**: The persistence layer (`MemStorage` or future `DbStorage`).
- **DbStorage**: A Drizzle + Postgres implementation of the Storage interface.
- **Polling**: Periodic client-side HTTP requests to refresh bracket state.
- **Round-trip**: Parsing a value then serializing it (or vice versa) and recovering the original.
- **Round Index**: Rounds are stored internally as zero-based integers (`0`, `1`, `2`…). The UI always displays these as "Round 1", "Round 2", "Round 3"… The zero-based index is an implementation detail never shown to users.

---

## Requirements

### Requirement 1: Bet Payout on Match Completion

**User Story:** As a bettor, I want to receive credits when my bet wins, so that the virtual currency system is meaningful and rewarding.

#### Acceptance Criteria

1. WHEN the Admin records a winner for a Match, THE System SHALL calculate a Payout for each Bet on that Match whose `selectedWinner` equals the recorded winner.
2. WHEN calculating Payouts, THE System SHALL distribute the full Pot proportionally: each winning Bet receives `floor(betAmount / totalWinningBets * Pot)` credits.
3. WHEN a Bet wins and the Bracket uses independent credits, THE System SHALL credit the Payout to the BracketBalance of the betting User.
4. WHEN a Bet wins and the Bracket does not use independent credits, THE System SHALL credit the Payout to the GlobalBalance of the betting User.
5. WHEN all Bets on a Match are on the losing side, THE System SHALL retain the Pot (no payout issued).
6. WHEN a Match has no Bets, THE System SHALL complete the Match without issuing any Payout.
7. FOR ALL Matches with at least one winning Bet, the sum of all Payouts SHALL be less than or equal to the Pot for that Match (no credits created from nothing).
8. FOR ALL Matches with at least one winning Bet, the sum of all Payouts SHALL be greater than zero (winning bettors always receive something).

---

### Requirement 2: `/api/users` Endpoint

**User Story:** As the results page, I need to look up usernames by user ID, so that the leaderboard can display human-readable names instead of raw IDs.

#### Acceptance Criteria

1. THE System SHALL expose a `GET /api/users` endpoint that returns an array of all User objects.
2. WHEN a request is made to `GET /api/users` without an authenticated session, THE System SHALL return HTTP 401.
3. WHEN a request is made to `GET /api/users` with an authenticated session, THE System SHALL return HTTP 200 with a JSON array of User objects.
4. THE System SHALL omit the `password` field from every User object returned by `GET /api/users`.

---

### Requirement 3: Correct Results Leaderboard

**User Story:** As a tournament participant, I want to see an accurate leaderboard after the tournament ends, so that I know who profited the most from their betting.

#### Acceptance Criteria

1. WHEN the results page loads for a completed Bracket, THE System SHALL compute each bettor's net profit as the sum of all Payouts received minus the sum of all Bets placed, across all Matches in that Bracket.
2. WHEN displaying the leaderboard, THE System SHALL sort bettors by net profit descending.
3. WHEN a User placed Bets but received no Payouts, THE System SHALL display that User's profit as a negative number equal to the total amount wagered.
4. WHEN no Users placed Bets in the Bracket, THE System SHALL display an empty leaderboard with a "No bets placed" message.
5. THE System SHALL display each bettor's username (not user ID) in the leaderboard.

---

### Requirement 4: Home Page Bracket Filtering and Join Flow

**User Story:** As a logged-in user, I want the home page to show only brackets I can access, and I want to be able to join a private bracket by entering an access code, so that private tournaments remain private.

#### Acceptance Criteria

1. WHEN the home page loads, THE System SHALL display all public Brackets to the authenticated User.
2. WHEN the home page loads, THE System SHALL display private Brackets only if the authenticated User is the Admin or has previously joined that Bracket.
3. THE System SHALL provide a UI control on the home page that allows a User to enter a Bracket ID and access code to join a private Bracket.
4. WHEN a User submits a valid access code for a private Bracket, THE System SHALL call `POST /api/brackets/:id/join` and display the Bracket in the home page list.
5. WHEN a User submits an invalid access code, THE System SHALL display an error message without navigating away.
6. THE System SHALL track which Users have joined each Bracket so that the home page filter in criterion 2 can be applied.

---

### Requirement 5: Spectator / Participant Access Control

**User Story:** As a private bracket admin, I want only joined users to see the betting panel, so that uninvited users cannot interact with my tournament.

#### Acceptance Criteria

1. WHEN an authenticated User who has not joined a private Bracket navigates to that Bracket's page, THE System SHALL display the Bracket structure in read-only mode without the betting panel.
2. WHEN an authenticated User who has joined a private Bracket navigates to that Bracket's page, THE System SHALL display the full betting panel.
3. WHEN a public Bracket is active, THE System SHALL display the betting panel to all authenticated Users.
4. IF a User attempts to place a Bet on a private Bracket they have not joined, THEN THE System SHALL return HTTP 403.

---

### Requirement 6: Postgres Persistence via DbStorage

**User Story:** As a host, I want tournament data to survive server restarts, so that I can run a central instance without losing all data.

#### Acceptance Criteria

1. THE System SHALL implement a `DbStorage` class that satisfies the same interface as `MemStorage` using Drizzle ORM and Postgres.
2. WHEN `DATABASE_URL` is set in the environment, THE System SHALL use `DbStorage` as the active Storage implementation.
3. WHEN `DATABASE_URL` is not set, THE System SHALL fall back to `MemStorage` so local development without Postgres continues to work.
4. WHEN the server restarts with `DATABASE_URL` set, THE System SHALL serve the same Brackets, Bets, and Users that existed before the restart.
5. THE System SHALL use `connect-pg-simple` (already in dependencies) for session persistence when `DbStorage` is active.

---

### Requirement 7: Bracket Viewer Visual Connectors

**User Story:** As a viewer, I want to see lines connecting matches across rounds in the bracket display, so that I can visually follow how winners advance.

#### Acceptance Criteria

1. THE System SHALL render a visual connector between each Match card and the Match card in the next round that its winner feeds into.
2. WHEN a Match has a winner, THE System SHALL render the connector from that Match in a visually distinct style (e.g., highlighted color) compared to connectors for undecided matches.
3. THE System SHALL render connectors without overlapping Match card content.
4. THE System SHALL render connectors correctly for brackets with bye recipients (where first-round winners feed into second-round slots pre-filled with bye recipients).

---

### Requirement 8: Bracket State Polling

**User Story:** As a spectator or bettor, I want the bracket page to update automatically without requiring a manual page refresh, so that I can follow the tournament in near-real-time.

#### Acceptance Criteria

1. WHILE a Bracket is in `active` status, THE System SHALL re-fetch the Bracket state from the server at a fixed interval of no more than 5 seconds.
2. WHILE a Bracket is in `active` status, THE System SHALL re-fetch the current Bets at the same interval.
3. WHEN a Bracket transitions to `completed` status, THE System SHALL stop polling and display the final state.
4. WHEN the browser tab is hidden, THE System SHALL pause polling and resume when the tab becomes visible again.

---

### Requirement 9: Automated Test Suite — Full Tournament Lifecycle

**User Story:** As a developer, I want automated tests that simulate multiple users going through a complete tournament, so that I can verify the full bracket flow without manual testing.

#### Acceptance Criteria

1. THE Test_Suite SHALL include an end-to-end test that creates a Bracket, advances every Match to completion, and asserts the correct champion is recorded.
2. THE Test_Suite SHALL simulate at least two non-admin Users placing Bets on each Match before the Admin records a winner.
3. THE Test_Suite SHALL assert that winning bettors receive a Payout greater than zero after each Match completes.
4. THE Test_Suite SHALL assert that losing bettors do not receive a Payout after each Match completes.
5. THE Test_Suite SHALL assert that the sum of all Payouts for a Match does not exceed the Pot for that Match.
6. THE Test_Suite SHALL cover single elimination brackets with bye recipients (odd number of participants) to verify correct winner advancement.
7. THE Test_Suite SHALL cover single elimination brackets without byes (power-of-two participant counts) to verify standard advancement.
8. THE Test_Suite SHALL include an end-to-end test for a double elimination bracket, verifying that a participant who loses in the Winners Bracket appears in the Losers Bracket and can still win the tournament via the Grand Final.
9. THE Test_Suite SHALL include an end-to-end test for a round robin bracket, verifying that all matches are generated, standings are updated correctly after each match, and the correct champion is determined.
10. THE Test_Suite SHALL include an end-to-end test for a group stage bracket, verifying group match generation, correct advancement of top finishers into the knockout stage, and correct champion determination.

---

### Requirement 10: Property-Based Tests — Bracket Structure and Payout Math

**User Story:** As a developer, I want property-based tests for bracket generation and payout calculations, so that edge cases with arbitrary participant counts and bet amounts are automatically explored.

#### Acceptance Criteria

1. FOR ALL participant counts between 2 and 64, the single elimination bracket structure generated by `generateBracketStructure` SHALL contain exactly `participantCount - 1` total Matches (including TBD slots for later rounds).
2. FOR ALL participant counts between 2 and 64, every Participant name SHALL appear in exactly one Match in the first round (round index 0) or as a bye recipient pre-filled in the second round (round index 1); no Participant name SHALL appear more than once across the generated structure.
3. FOR ALL valid Pots and winning Bet arrays, the sum of computed Payouts SHALL be less than or equal to the Pot.
4. FOR ALL valid Pots and winning Bet arrays with at least one winning Bet, each individual Payout SHALL be greater than zero.
5. FOR ALL bracket structures serialized to JSON and deserialized back, the round-trip SHALL produce a structurally equivalent array of Matches (same `matchNumber`, `round`, `position`, `player1`, `player2`, `winner` values).

---

### Requirement 11: Tournament Format Selection

**User Story:** As a tournament creator, I want to choose between single elimination, double elimination, round robin, and group stage when creating a bracket, so that I can run different styles of tournaments.

#### Acceptance Criteria

1. WHEN creating a Bracket, THE System SHALL present a format selector with four options: Single Elimination, Double Elimination, Round Robin, and Group Stage.
2. THE System SHALL store the selected BracketFormat on the Bracket record.
3. WHEN no format is selected, THE System SHALL default to Single Elimination to preserve backward compatibility.
4. THE System SHALL generate the correct match structure for the selected format when the Bracket is created.
5. THE System SHALL display the format name on the Bracket page and home page card.
6. THE System SHALL enforce the following participant limits per format and reject bracket creation if the count is outside the allowed range:
   - Single Elimination: minimum 2, maximum 64
   - Double Elimination: minimum 4, maximum 32
   - Round Robin: minimum 3, maximum 16
   - Group Stage: minimum 4, maximum 32
7. WHEN a creator enters a participant count outside the allowed range for the selected format, THE System SHALL display an inline validation error describing the valid range before the form can be submitted.

---

### Requirement 12: Double Elimination Format

**User Story:** As a tournament creator, I want a double elimination format so that participants get a second chance after their first loss before being eliminated.

#### Acceptance Criteria

1. WHEN a Bracket uses double elimination, THE System SHALL generate a Winners Bracket and a Losers Bracket from the participant list.
2. WHEN a participant loses a match in the Winners Bracket, THE System SHALL move them to the corresponding position in the Losers Bracket.
3. WHEN a participant loses a match in the Losers Bracket, THE System SHALL eliminate them from the tournament.
4. WHEN the Winners Bracket is complete, THE System SHALL create a Grand Final match between the Winners Bracket champion and the Losers Bracket champion.
5. WHEN the Grand Final is played, THE System SHALL record the Grand Final winner as the tournament champion.
6. THE System SHALL display the Winners Bracket, Losers Bracket, and Grand Final as distinct sections in the bracket viewer.
7. THE System SHALL support betting on all matches in both brackets and the Grand Final.
8. FOR ALL double elimination brackets with N participants, the total number of matches SHALL be between `2N - 2` and `2N - 1` (the Grand Final may require a bracket reset if the Losers champion wins).

---

### Requirement 13: Round Robin Format

**User Story:** As a tournament creator, I want a round robin format so that every participant plays every other participant exactly once.

#### Acceptance Criteria

1. WHEN a Bracket uses round robin, THE System SHALL generate one Match for every unique pair of participants.
2. FOR N participants, the total number of Matches SHALL equal `N * (N - 1) / 2`.
3. THE System SHALL sequence Matches into rounds such that no participant appears more than once per round.
4. WHEN a Match is completed, THE System SHALL update the standings table with the winner receiving 1 point and the loser receiving 0 points.
5. THE System SHALL display a standings table alongside the match list showing each participant's wins, losses, and total points.
6. WHEN all Matches are complete, THE System SHALL determine the champion as the participant with the most points; ties SHALL be broken by head-to-head result between tied participants.
7. THE System SHALL support betting on every Match in the round robin.

---

### Requirement 14: Group Stage Format

**User Story:** As a tournament creator, I want a group stage format so that participants are divided into groups for a round-robin phase, with top finishers advancing to a knockout stage.

#### Acceptance Criteria

1. WHEN creating a group stage Bracket, THE System SHALL allow the Admin to specify the number of groups (between 2 and 8).
2. THE System SHALL distribute participants as evenly as possible across the specified number of groups.
3. WITHIN each group, THE System SHALL generate a round-robin schedule (every participant plays every other participant in the same group once).
4. WHEN the Admin configures the Bracket, THE System SHALL allow specifying how many participants advance from each group (1 or 2).
5. WHEN all group stage Matches are complete, THE System SHALL automatically seed the advancing participants into a single-elimination knockout bracket based on group standings.
6. THE System SHALL display group standings (wins, losses, points) for each group during and after the group stage.
7. THE System SHALL display the knockout bracket once the group stage is complete.
8. THE System SHALL support betting on all group stage Matches and all knockout stage Matches.

---

### Requirement 15: Property-Based Tests — Additional Bracket Formats

**User Story:** As a developer, I want property-based tests for double elimination, round robin, and group stage structure generation, so that correctness is verified across arbitrary participant counts.

#### Acceptance Criteria

1. FOR ALL participant counts between 4 and 32, a double elimination bracket SHALL contain between `2N - 2` and `2N - 1` total matches.
2. FOR ALL participant counts between 3 and 16, a round robin bracket SHALL contain exactly `N * (N - 1) / 2` matches, and each participant SHALL appear in exactly `N - 1` matches.
3. FOR ALL group stage configurations (2–8 groups, 4–32 participants), every participant SHALL appear in exactly `groupSize - 1` group stage matches, where `groupSize` is the size of their assigned group.
4. FOR ALL round robin standings computed from a complete set of match results, the sum of all participant points SHALL equal the total number of matches played.
5. FOR ALL double elimination brackets, no participant SHALL appear in the Losers Bracket without having first lost a match in the Winners Bracket.

---

### Requirement 16: GambaGame Visual Theme

**User Story:** As a user, I want the app to have a cohesive retro arcade visual style, so that the experience feels fun and distinct rather than like a generic web app.

#### Acceptance Criteria

1. THE System SHALL display the app name "GambaGame" using the Silkscreen font (loaded from Google Fonts) in the navigation header.
2. THE System SHALL apply a sky blue background (`#4FC3F7`) as the global page background color.
3. THE System SHALL render all card and panel components with a white or light blue-white (`#E8F7FF`) fill, a 2–3px solid dark navy (`#1A1A4E`) border, and no border radius greater than 2px.
4. THE System SHALL apply a hard offset drop shadow (`3px 3px 0px #1A1A4E`) to all interactive card and button components instead of soft box shadows.
5. THE System SHALL use dark navy (`#1A1A4E`) as the primary text and border color throughout the app.
6. THE System SHALL use bright yellow (`#FFE600`) as the accent color for active match indicators, current phase labels, and selected/highlighted states.
7. THE System SHALL use bright green (`#00C853`) for winner indicators and success states, and red-orange (`#FF4444`) for destructive actions and error states.
8. THE System SHALL apply the Silkscreen font to all page headings (h1–h3); body text and labels MAY use a system sans-serif or monospace fallback.
9. THE System SHALL apply the theme consistently across all pages: auth, home, bracket creation, bracket view, and results.
