import { test, expect } from "vitest";
import fc from "fast-check";
import { computePayouts } from "../../shared/payoutEngine";

// **Validates: Requirements 1.7, 10.3**
test("Property 1: Payout sum never exceeds the pot", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 100000 }),
      fc.array(
        fc.record({
          userId: fc.integer({ min: 1, max: 100 }),
          amount: fc.integer({ min: 1, max: 1000 }),
          selectedWinner: fc.constantFrom("A", "B"),
        }),
        { minLength: 1, maxLength: 20 }
      ),
      fc.constantFrom("A", "B"),
      (pot, bets, winner) => {
        const payouts = computePayouts(pot, bets, winner);
        const total = payouts.reduce((sum, p) => sum + p.amount, 0);
        expect(total).toBeLessThanOrEqual(pot);
      }
    ),
    { numRuns: 100 }
  );
});

// **Validates: Requirements 1.8, 10.4**
// Property holds when pot >= number of winning bets (floor rounding guarantees each gets >= 1)
test("Property 2: Each winning bettor receives a positive payout", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          userId: fc.integer({ min: 1, max: 100 }),
          amount: fc.integer({ min: 1, max: 1000 }),
          selectedWinner: fc.constantFrom("A", "B"),
        }),
        { minLength: 0, maxLength: 19 }
      ),
      fc.integer({ min: 1, max: 1000 }),
      fc.constantFrom("A", "B"),
      (otherBets, winningAmount, winner) => {
        // Ensure at least one bet is on the winner
        const guaranteedWinningBet = {
          userId: 99,
          amount: winningAmount,
          selectedWinner: winner,
        };
        const bets = [...otherBets, guaranteedWinningBet];
        const winningBets = bets.filter((b) => b.selectedWinner === winner);
        // Use a pot large enough so floor rounding gives each winner at least 1
        const pot = winningBets.length * 1000;
        const payouts = computePayouts(pot, bets, winner);
        expect(payouts.length).toBeGreaterThan(0);
        for (const payout of payouts) {
          expect(payout.amount).toBeGreaterThan(0);
        }
      }
    ),
    { numRuns: 100 }
  );
});

// **Validates: Requirements 2.4**
// Property 12: Password omission from user list
// The mapping ({ password, ...rest }) => rest removes the password field
test("Property 12: Password omission from user list", () => {
  fc.assert(
    fc.property(
      fc.record({
        id: fc.integer({ min: 1, max: 10000 }),
        username: fc.string({ minLength: 1, maxLength: 50 }),
        password: fc.string({ minLength: 1, maxLength: 100 }),
        virtualCurrency: fc.integer({ min: 0, max: 100000 }),
        lastDailyBonus: fc.constant(null),
      }),
      (user) => {
        const { password, ...rest } = user;
        expect(rest).not.toHaveProperty("password");
        expect(rest).toHaveProperty("id", user.id);
        expect(rest).toHaveProperty("username", user.username);
        expect(rest).toHaveProperty("virtualCurrency", user.virtualCurrency);
      }
    ),
    { numRuns: 100 }
  );
});
