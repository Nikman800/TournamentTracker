import { describe, test, expect, beforeEach } from "vitest";
import request from "supertest";
import { generateSingleElim } from "../../shared/bracketGenerators";
import { createTestApp } from "./helpers";

describe("Payout trigger on match completion", () => {
  let app: any;

  beforeEach(() => {
    ({ app } = createTestApp());
  });

  test("winning bettor receives payout, losing bettor does not", async () => {
    const adminAgent = request.agent(app);
    const bettor1Agent = request.agent(app);
    const bettor2Agent = request.agent(app);

    const suffix = Date.now();

    // Register users
    await adminAgent.post("/api/register").send({ username: `admin_${suffix}`, password: "pass" }).expect(201);
    await bettor1Agent.post("/api/register").send({ username: `bettor1_${suffix}`, password: "pass" }).expect(201);
    const b2Res = await bettor2Agent.post("/api/register").send({ username: `bettor2_${suffix}`, password: "pass" }).expect(201);
    const bettor2Id = b2Res.body.id;

    // Get bettor1 id
    const b1Res = await bettor1Agent.get("/api/user").expect(200);
    const bettor1Id = b1Res.body.id;

    // Admin creates a 2-participant bracket
    const structure = generateSingleElim(["Alice", "Bob"]);
    const createRes = await adminAgent.post("/api/brackets").send({
      name: `Test Bracket ${suffix}`,
      isPublic: true,
      structure: JSON.stringify(structure),
      bracketFormat: "single_elimination",
    }).expect(201);
    const bracketId = createRes.body.id;

    // Admin opens and starts tournament
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({ status: "waiting" }).expect(200);
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({ status: "active" }).expect(200);

    // Bettor1 bets 100 on Alice
    await bettor1Agent.post(`/api/brackets/${bracketId}/bets`).send({
      amount: 100,
      selectedWinner: "Alice",
    }).expect(201);

    // Bettor2 bets 200 on Bob
    await bettor2Agent.post(`/api/brackets/${bracketId}/bets`).send({
      amount: 200,
      selectedWinner: "Bob",
    }).expect(201);

    // Get balances before winner is recorded
    const b1Before = (await bettor1Agent.get("/api/user")).body.virtualCurrency;
    const b2Before = (await bettor2Agent.get("/api/user")).body.virtualCurrency;

    // Admin records Alice as winner
    const updatedStructure = structure.map((m) =>
      m.matchNumber === 1 ? { ...m, winner: "Alice" } : m
    );
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({
      structure: JSON.stringify(updatedStructure),
    }).expect(200);

    // Check balances after
    const b1After = (await bettor1Agent.get("/api/user")).body.virtualCurrency;
    const b2After = (await bettor2Agent.get("/api/user")).body.virtualCurrency;

    // Bettor1 (Alice) should have received a payout
    expect(b1After).toBeGreaterThan(b1Before);

    // Bettor2 (Bob) should not have received a payout
    expect(b2After).toBe(b2Before);

    // Payout to bettor1 should not exceed the pot (300)
    const payout = b1After - b1Before;
    expect(payout).toBeLessThanOrEqual(300);
    expect(payout).toBeGreaterThan(0);
  });
});
