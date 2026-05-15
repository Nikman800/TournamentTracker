import { describe, test, expect } from "vitest";
import {
  generateSingleElim,
  generateDoubleElim,
  generateRoundRobin,
  generateGroupStage,
} from "../../shared/bracketGenerators";

// ─── generateSingleElim ───────────────────────────────────────────────────────

describe("generateSingleElim", () => {
  test("2 participants → 1 match total", () => {
    const matches = generateSingleElim(["A", "B"]);
    expect(matches).toHaveLength(1);
    expect(matches[0].round).toBe(0);
    expect(matches[0].player1).toBe("A");
    expect(matches[0].player2).toBe("B");
  });

  test("3 participants → 2 total matches (1 in round 0, 1 in round 1 with bye)", () => {
    const matches = generateSingleElim(["A", "B", "C"]);
    expect(matches).toHaveLength(2);
    const round0 = matches.filter((m) => m.round === 0);
    const round1 = matches.filter((m) => m.round === 1);
    expect(round0).toHaveLength(1);
    expect(round1).toHaveLength(1);
    // The bye recipient should be in round 1 player1
    expect(round1[0].player1).toBe("C");
  });

  test("4 participants → 3 total matches (2 in round 0, 1 in round 1)", () => {
    const matches = generateSingleElim(["A", "B", "C", "D"]);
    expect(matches).toHaveLength(3);
    const round0 = matches.filter((m) => m.round === 0);
    const round1 = matches.filter((m) => m.round === 1);
    expect(round0).toHaveLength(2);
    expect(round1).toHaveLength(1);
  });

  test("8 participants → 7 total matches (4 in round 0, 2 in round 1, 1 in round 2)", () => {
    const matches = generateSingleElim(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(matches).toHaveLength(7);
    expect(matches.filter((m) => m.round === 0)).toHaveLength(4);
    expect(matches.filter((m) => m.round === 1)).toHaveLength(2);
    expect(matches.filter((m) => m.round === 2)).toHaveLength(1);
  });

  test("all matches have bracketSection 'main'", () => {
    const matches = generateSingleElim(["A", "B", "C", "D"]);
    expect(matches.every((m) => m.bracketSection === "main")).toBe(true);
  });
});

// ─── generateDoubleElim ───────────────────────────────────────────────────────

describe("generateDoubleElim", () => {
  test("4 participants → winners (3) + losers (2) + grand final (1) = 6 total", () => {
    const matches = generateDoubleElim(["A", "B", "C", "D"]);
    expect(matches).toHaveLength(6);
    expect(matches.filter((m) => m.bracketSection === "winners")).toHaveLength(3);
    expect(matches.filter((m) => m.bracketSection === "losers")).toHaveLength(2);
    expect(matches.filter((m) => m.bracketSection === "grand_final")).toHaveLength(1);
  });

  test("all losers bracket matches have player1=null and player2=null initially", () => {
    const matches = generateDoubleElim(["A", "B", "C", "D"]);
    const losers = matches.filter((m) => m.bracketSection === "losers");
    expect(losers.every((m) => m.player1 === null && m.player2 === null)).toBe(true);
  });

  test("grand final match has bracketSection 'grand_final'", () => {
    const matches = generateDoubleElim(["A", "B", "C", "D"]);
    const gf = matches.find((m) => m.bracketSection === "grand_final");
    expect(gf).toBeDefined();
    expect(gf!.player1).toBeNull();
    expect(gf!.player2).toBeNull();
  });
});

// ─── generateRoundRobin ───────────────────────────────────────────────────────

describe("generateRoundRobin", () => {
  test("3 participants → 3 matches (1 per round, 3 rounds)", () => {
    const matches = generateRoundRobin(["A", "B", "C"]);
    expect(matches).toHaveLength(3);
    const rounds = new Set(matches.map((m) => m.round));
    expect(rounds.size).toBe(3);
    for (const r of rounds) {
      expect(matches.filter((m) => m.round === r)).toHaveLength(1);
    }
  });

  test("4 participants → 6 matches (2 per round, 3 rounds)", () => {
    const matches = generateRoundRobin(["A", "B", "C", "D"]);
    expect(matches).toHaveLength(6);
    const rounds = new Set(matches.map((m) => m.round));
    expect(rounds.size).toBe(3);
    for (const r of rounds) {
      expect(matches.filter((m) => m.round === r)).toHaveLength(2);
    }
  });

  test("4 participants — no participant appears twice in same round", () => {
    const matches = generateRoundRobin(["A", "B", "C", "D"]);
    const rounds = new Set(matches.map((m) => m.round));
    for (const r of rounds) {
      const roundMatches = matches.filter((m) => m.round === r);
      const players = roundMatches.flatMap((m) => [m.player1, m.player2]);
      const unique = new Set(players);
      expect(unique.size).toBe(players.length);
    }
  });
});

// ─── generateGroupStage ───────────────────────────────────────────────────────

describe("generateGroupStage", () => {
  test("4 participants, 2 groups, 1 advance → 2 group matches + 1 knockout match = 3 total", () => {
    const matches = generateGroupStage(["A", "B", "C", "D"], 2, 1);
    expect(matches).toHaveLength(3);
    expect(matches.filter((m) => m.bracketSection === "group")).toHaveLength(2);
    expect(matches.filter((m) => m.bracketSection === "knockout")).toHaveLength(1);
  });

  test("8 participants, 2 groups, 2 advance → 12 group matches + 3 knockout matches = 15 total", () => {
    const matches = generateGroupStage(
      ["A", "B", "C", "D", "E", "F", "G", "H"],
      2,
      2
    );
    // Each group has 4 players → 4*3/2 = 6 round-robin matches per group → 12 total
    expect(matches.filter((m) => m.bracketSection === "group")).toHaveLength(12);
    // 2 groups * 2 advance = 4 knockout participants → 3 knockout matches
    expect(matches.filter((m) => m.bracketSection === "knockout")).toHaveLength(3);
    expect(matches).toHaveLength(15);
  });
});
