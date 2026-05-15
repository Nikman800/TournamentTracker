import { test, expect } from "vitest";
import fc from "fast-check";
import {
  generateSingleElim,
  generateDoubleElim,
  generateRoundRobin,
  generateGroupStage,
} from "../../shared/bracketGenerators";

// Helper: generate N unique participant names
function makeParticipants(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `Player${i + 1}`);
}

// **Validates: Requirements 10.1**
test("Property 3: Single elimination match count invariant", () => {
  fc.assert(
    fc.property(fc.integer({ min: 2, max: 64 }), (n) => {
      const participants = makeParticipants(n);
      const matches = generateSingleElim(participants);
      expect(matches).toHaveLength(n - 1);
    }),
    { numRuns: 100 }
  );
});

// **Validates: Requirements 10.2**
test("Property 4: Single elimination participant uniqueness", () => {
  fc.assert(
    fc.property(fc.integer({ min: 2, max: 64 }), (n) => {
      const participants = makeParticipants(n);
      const matches = generateSingleElim(participants);

      // Collect all participants that appear as player1 or player2 (non-null)
      const seen = new Map<string, number>();
      for (const m of matches) {
        if (m.player1 !== null) seen.set(m.player1, (seen.get(m.player1) ?? 0) + 1);
        if (m.player2 !== null) seen.set(m.player2, (seen.get(m.player2) ?? 0) + 1);
      }

      // Every participant should appear exactly once
      for (const p of participants) {
        expect(seen.get(p)).toBe(1);
      }
    }),
    { numRuns: 100 }
  );
});

// **Validates: Requirements 12.8, 15.1**
test("Property 5: Double elimination match count bounds", () => {
  fc.assert(
    fc.property(fc.integer({ min: 4, max: 32 }), (n) => {
      const participants = makeParticipants(n);
      const matches = generateDoubleElim(participants);
      expect(matches.length).toBeGreaterThanOrEqual(2 * n - 2);
      expect(matches.length).toBeLessThanOrEqual(2 * n - 1);
    }),
    { numRuns: 100 }
  );
});

// **Validates: Requirements 15.5**
test("Property 6: Double elimination losers bracket integrity", () => {
  fc.assert(
    fc.property(fc.integer({ min: 4, max: 32 }), (n) => {
      const participants = makeParticipants(n);
      const matches = generateDoubleElim(participants);
      const losers = matches.filter((m) => m.bracketSection === "losers");
      for (const m of losers) {
        expect(m.player1).toBeNull();
        expect(m.player2).toBeNull();
      }
    }),
    { numRuns: 100 }
  );
});

// **Validates: Requirements 13.1, 13.2, 15.2**
test("Property 7: Round robin match count and participant coverage", () => {
  fc.assert(
    fc.property(fc.integer({ min: 3, max: 16 }), (n) => {
      const participants = makeParticipants(n);
      const matches = generateRoundRobin(participants);

      // Total matches = N*(N-1)/2
      expect(matches).toHaveLength((n * (n - 1)) / 2);

      // Each participant appears in exactly N-1 matches
      const counts = new Map<string, number>();
      for (const m of matches) {
        if (m.player1) counts.set(m.player1, (counts.get(m.player1) ?? 0) + 1);
        if (m.player2) counts.set(m.player2, (counts.get(m.player2) ?? 0) + 1);
      }
      for (const p of participants) {
        expect(counts.get(p)).toBe(n - 1);
      }
    }),
    { numRuns: 100 }
  );
});

// **Validates: Requirements 13.3**
test("Property 8: Round robin scheduling — no participant appears twice in a round", () => {
  fc.assert(
    fc.property(fc.integer({ min: 3, max: 16 }), (n) => {
      const participants = makeParticipants(n);
      const matches = generateRoundRobin(participants);

      const roundMap = new Map<number, string[]>();
      for (const m of matches) {
        const players = roundMap.get(m.round) ?? [];
        if (m.player1) players.push(m.player1);
        if (m.player2) players.push(m.player2);
        roundMap.set(m.round, players);
      }

      for (const [, players] of roundMap) {
        const unique = new Set(players);
        expect(unique.size).toBe(players.length);
      }
    }),
    { numRuns: 100 }
  );
});

// **Validates: Requirements 15.3**
test("Property 10: Group stage participant coverage", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 2, max: 4 }),
      fc.integer({ min: 4, max: 16 }),
      (numGroups, totalParticipants) => {
        // Ensure at least 2 participants per group
        if (totalParticipants < numGroups * 2) return;

        const participants = makeParticipants(totalParticipants);
        const matches = generateGroupStage(participants, numGroups, 1);
        const groupMatches = matches.filter((m) => m.bracketSection === "group");

        // Compute group sizes
        const extra = totalParticipants % numGroups;
        const baseSize = Math.floor(totalParticipants / numGroups);

        // For each participant, count how many group matches they appear in
        const counts = new Map<string, number>();
        for (const m of groupMatches) {
          if (m.player1) counts.set(m.player1, (counts.get(m.player1) ?? 0) + 1);
          if (m.player2) counts.set(m.player2, (counts.get(m.player2) ?? 0) + 1);
        }

        // Determine each participant's group and expected match count
        let idx = 0;
        for (let g = 0; g < numGroups; g++) {
          const groupSize = baseSize + (g < extra ? 1 : 0);
          const expectedMatches = groupSize - 1;
          for (let i = 0; i < groupSize; i++) {
            const p = participants[idx++];
            expect(counts.get(p)).toBe(expectedMatches);
          }
        }
      }
    ),
    { numRuns: 100 }
  );
});

// **Validates: Requirements 15.4**
test("Property 9: Round robin standings points conservation", () => {
  fc.assert(
    fc.property(fc.integer({ min: 3, max: 8 }), (n) => {
      const participants = makeParticipants(n);
      const matches = generateRoundRobin(participants);

      // Simulate all matches with player1 always winning
      const standings = new Map<string, number>();
      for (const m of matches) {
        if (m.player1 && m.player2) {
          standings.set(m.player1, (standings.get(m.player1) ?? 0) + 1);
        }
      }

      const totalPoints = Array.from(standings.values()).reduce((sum, p) => sum + p, 0);
      expect(totalPoints).toBe(matches.length);
    }),
    { numRuns: 100 }
  );
});

// **Validates: Requirements 10.5**
test("Property 11: Bracket structure JSON round-trip", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.integer({ min: 2, max: 16 }).map((n) => generateSingleElim(makeParticipants(n))),
        fc.integer({ min: 4, max: 16 }).map((n) => generateDoubleElim(makeParticipants(n))),
        fc.integer({ min: 3, max: 8 }).map((n) => generateRoundRobin(makeParticipants(n))),
        fc.integer({ min: 4, max: 8 }).map((n) => generateGroupStage(makeParticipants(n), 2, 1))
      ),
      (matches) => {
        const serialized = JSON.stringify(matches);
        const deserialized = JSON.parse(serialized);
        expect(deserialized).toHaveLength(matches.length);
        for (let i = 0; i < matches.length; i++) {
          expect(deserialized[i].matchNumber).toBe(matches[i].matchNumber);
          expect(deserialized[i].round).toBe(matches[i].round);
          expect(deserialized[i].position).toBe(matches[i].position);
          expect(deserialized[i].player1).toBe(matches[i].player1);
          expect(deserialized[i].player2).toBe(matches[i].player2);
          expect(deserialized[i].winner).toBe(matches[i].winner);
          expect(deserialized[i].bracketSection).toBe(matches[i].bracketSection);
        }
      }
    ),
    { numRuns: 100 }
  );
});
