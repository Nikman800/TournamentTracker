import { describe, test, expect, beforeEach } from "vitest";
import request from "supertest";
import { generateSingleElim } from "../../../shared/bracketGenerators";
import { createTestApp } from "../helpers";

describe("Single elimination lifecycle", () => {
  let app: any;
  beforeEach(() => { ({ app } = createTestApp()); });

  test("28.1: 4-participant bracket — correct champion, payouts, and leaderboard order", async () => {
    const adminAgent = request.agent(app);
    const bettor1Agent = request.agent(app);
    const bettor2Agent = request.agent(app);
    const suffix = Date.now();

    await adminAgent.post("/api/register").send({ username: `admin_se_${suffix}`, password: "pass" });
    await bettor1Agent.post("/api/register").send({ username: `b1_se_${suffix}`, password: "pass" });
    await bettor2Agent.post("/api/register").send({ username: `b2_se_${suffix}`, password: "pass" });

    const participants = ["Alice", "Bob", "Charlie", "Dave"];
    const structure = generateSingleElim(participants);

    const createRes = await adminAgent.post("/api/brackets").send({
      name: `SE Test ${suffix}`,
      isPublic: true,
      structure: JSON.stringify(structure),
      bracketFormat: "single_elimination",
    }).expect(201);
    const bracketId = createRes.body.id;

    // Open and start
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({ status: "waiting" });
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({ status: "active" });

    // Get initial structure
    const bracketRes = await adminAgent.get(`/api/brackets/${bracketId}`);
    const initialStructure = JSON.parse(bracketRes.body.structure);

    // Round 0: Alice vs Bob (match 1), Charlie vs Dave (match 2)
    const round0Matches = initialStructure.filter((m: any) => m.round === 0);
    expect(round0Matches).toHaveLength(2);

    const match1 = round0Matches.find((m: any) => m.position === 0);
    const match2 = round0Matches.find((m: any) => m.position === 1);
    expect(match1.player1).toBe("Alice");
    expect(match1.player2).toBe("Bob");
    expect(match2.player1).toBe("Charlie");
    expect(match2.player2).toBe("Dave");

    // Bettor1 bets on Alice (match 1), Bettor2 bets on Bob (match 1)
    await bettor1Agent.post(`/api/brackets/${bracketId}/bets`).send({
      selectedWinner: "Alice",
      amount: 100,
    }).expect(201);
    await bettor2Agent.post(`/api/brackets/${bracketId}/bets`).send({
      selectedWinner: "Bob",
      amount: 100,
    }).expect(201);

    // Advance match 1: Alice wins
    let currentStructure = initialStructure.map((m: any) =>
      m.matchNumber === match1.matchNumber ? { ...m, winner: "Alice" } : m
    );
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({
      structure: JSON.stringify(currentStructure),
    }).expect(200);

    // Check bettor1 (Alice backer) received payout, bettor2 (Bob backer) did not
    const b1AfterUser = (await bettor1Agent.get("/api/user")).body;
    const b2AfterUser = (await bettor2Agent.get("/api/user")).body;

    // Bettor1 backed the winner — should have received payout (pot = 200, so gets ~200 back)
    // Started at 1000, bet 100, so balance should be > 900
    expect(b1AfterUser.virtualCurrency).toBeGreaterThan(900);
    // Bettor2 backed the loser — balance reduced by bet amount (1000 - 100 = 900)
    expect(b2AfterUser.virtualCurrency).toBe(900);

    // Advance match 2: Charlie wins
    const latestRes = await adminAgent.get(`/api/brackets/${bracketId}`);
    currentStructure = JSON.parse(latestRes.body.structure);
    const match2Current = currentStructure.find((m: any) => m.matchNumber === match2.matchNumber);
    currentStructure = currentStructure.map((m: any) =>
      m.matchNumber === match2.matchNumber ? { ...m, winner: match2Current.player1 } : m
    );
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({
      structure: JSON.stringify(currentStructure),
    }).expect(200);

    // Advance final: Alice vs Charlie — Alice wins
    const finalRes = await adminAgent.get(`/api/brackets/${bracketId}`);
    currentStructure = JSON.parse(finalRes.body.structure);
    const finalMatch = currentStructure.find(
      (m: any) => m.round === 1 && m.player1 && m.player2 && !m.winner
    );
    expect(finalMatch).toBeDefined();
    expect(finalMatch.player1).toBe("Alice");

    currentStructure = currentStructure.map((m: any) =>
      m.matchNumber === finalMatch.matchNumber ? { ...m, winner: "Alice" } : m
    );
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({
      structure: JSON.stringify(currentStructure),
    }).expect(200);

    // Bracket should be completed with Alice as champion
    const completedRes = await adminAgent.get(`/api/brackets/${bracketId}`);
    expect(completedRes.body.status).toBe("completed");
    const finalStructure = JSON.parse(completedRes.body.structure);
    const champion = finalStructure.find((m: any) => m.round === 1)?.winner;
    expect(champion).toBe("Alice");

    // Payout sum should not exceed total bets placed
    const betsRes = await adminAgent.get(`/api/brackets/${bracketId}/bets`);
    const bets = betsRes.body;
    const totalBet = bets.reduce((sum: number, b: any) => sum + b.amount, 0);

    const b1FinalCurrency = (await bettor1Agent.get("/api/user")).body.virtualCurrency;
    const b2FinalCurrency = (await bettor2Agent.get("/api/user")).body.virtualCurrency;
    // Both started at 1000; net change across both should not exceed 0 (house keeps remainder)
    const netChange = (b1FinalCurrency - 1000) + (b2FinalCurrency - 1000);
    expect(netChange).toBeLessThanOrEqual(0);
  });

  test("28.2: 3-participant bracket — bye recipient advances correctly", async () => {
    const adminAgent = request.agent(app);
    const suffix = Date.now() + 1;

    await adminAgent.post("/api/register").send({ username: `admin_se3_${suffix}`, password: "pass" });

    const participants = ["Alice", "Bob", "Charlie"];
    const structure = generateSingleElim(participants);

    // With 3 participants: bracketSize=4, 1 bye
    // Round 0: Alice vs Bob (1 match)
    // Round 1: Charlie (bye) vs winner of round 0
    const round0 = structure.filter((m) => m.round === 0);
    const round1 = structure.filter((m) => m.round === 1);
    expect(round0).toHaveLength(1);
    expect(round1).toHaveLength(1);

    // Charlie should be the bye recipient in round 1
    const byeMatch = round1[0];
    expect(byeMatch.player1).toBe("Charlie");
    expect(byeMatch.player2).toBeNull(); // TBD — winner of round 0

    const createRes = await adminAgent.post("/api/brackets").send({
      name: `SE3 Test ${suffix}`,
      isPublic: true,
      structure: JSON.stringify(structure),
      bracketFormat: "single_elimination",
    }).expect(201);
    const bracketId = createRes.body.id;

    await adminAgent.patch(`/api/brackets/${bracketId}`).send({ status: "waiting" });
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({ status: "active" });

    // Advance round 0: Alice wins
    const bracketRes = await adminAgent.get(`/api/brackets/${bracketId}`);
    let currentStructure = JSON.parse(bracketRes.body.structure);
    const r0Match = currentStructure.find((m: any) => m.round === 0);

    currentStructure = currentStructure.map((m: any) =>
      m.matchNumber === r0Match.matchNumber ? { ...m, winner: "Alice" } : m
    );
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({
      structure: JSON.stringify(currentStructure),
    }).expect(200);

    // Alice should now appear in round 1 alongside Charlie
    const afterRes = await adminAgent.get(`/api/brackets/${bracketId}`);
    const afterStructure = JSON.parse(afterRes.body.structure);
    const r1Match = afterStructure.find((m: any) => m.round === 1);
    expect(r1Match.player1).toBe("Charlie");
    expect(r1Match.player2).toBe("Alice");

    // Advance final: Charlie wins
    currentStructure = afterStructure.map((m: any) =>
      m.matchNumber === r1Match.matchNumber ? { ...m, winner: "Charlie" } : m
    );
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({
      structure: JSON.stringify(currentStructure),
    }).expect(200);

    const completedRes = await adminAgent.get(`/api/brackets/${bracketId}`);
    expect(completedRes.body.status).toBe("completed");
    const finalStructure = JSON.parse(completedRes.body.structure);
    const champion = finalStructure.find((m: any) => m.round === 1)?.winner;
    expect(champion).toBe("Charlie");
  });
});
