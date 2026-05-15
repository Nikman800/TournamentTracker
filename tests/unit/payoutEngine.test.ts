import { describe, test, expect } from "vitest";
import { computePayouts } from "../../shared/payoutEngine";

describe("computePayouts", () => {
  test("all bets on loser → empty array returned", () => {
    const bets = [
      { userId: 1, amount: 100, selectedWinner: "Alice" },
      { userId: 2, amount: 200, selectedWinner: "Alice" },
    ];
    expect(computePayouts(300, bets, "Bob")).toEqual([]);
  });

  test("zero bets → empty array returned", () => {
    expect(computePayouts(500, [], "Alice")).toEqual([]);
  });

  test("single winning bet → receives full pot (Math.floor(1 * pot))", () => {
    const bets = [{ userId: 1, amount: 50, selectedWinner: "Alice" }];
    const result = computePayouts(500, bets, "Alice");
    expect(result).toEqual([{ userId: 1, amount: 500 }]);
  });

  test("two equal winning bets → each receives Math.floor(pot/2)", () => {
    const bets = [
      { userId: 1, amount: 100, selectedWinner: "Alice" },
      { userId: 2, amount: 100, selectedWinner: "Alice" },
    ];
    const result = computePayouts(400, bets, "Alice");
    expect(result).toEqual([
      { userId: 1, amount: 200 },
      { userId: 2, amount: 200 },
    ]);
  });

  test("two unequal winning bets (100 and 300, pot=400) → proportional payouts", () => {
    const bets = [
      { userId: 1, amount: 100, selectedWinner: "Alice" },
      { userId: 2, amount: 300, selectedWinner: "Alice" },
    ];
    const result = computePayouts(400, bets, "Alice");
    // userId 1: Math.floor(100/400 * 400) = 100
    // userId 2: Math.floor(300/400 * 400) = 300
    expect(result).toEqual([
      { userId: 1, amount: 100 },
      { userId: 2, amount: 300 },
    ]);
  });
});
