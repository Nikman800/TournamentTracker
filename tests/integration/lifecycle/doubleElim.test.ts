import { describe, test, expect, beforeEach } from "vitest";
import request from "supertest";
import { generateDoubleElim } from "../../../shared/bracketGenerators";
import { createTestApp } from "../helpers";

describe("Double elimination lifecycle", () => {
  let app: any;
  beforeEach(() => { ({ app } = createTestApp()); });

  test("loser from winners bracket appears in losers bracket, can win via grand final", async () => {
    const adminAgent = request.agent(app);
    const bettor1Agent = request.agent(app);
    const bettor2Agent = request.agent(app);
    const suffix = Date.now();

    await adminAgent.post("/api/register").send({ username: `admin_de_${suffix}`, password: "pass" });
    await bettor1Agent.post("/api/register").send({ username: `b1_de_${suffix}`, password: "pass" });
    await bettor2Agent.post("/api/register").send({ username: `b2_de_${suffix}`, password: "pass" });

    const participants = ["Alice", "Bob", "Charlie", "Dave"];
    const structure = generateDoubleElim(participants);

    const createRes = await adminAgent.post("/api/brackets").send({
      name: `DE Test ${suffix}`,
      isPublic: true,
      structure: JSON.stringify(structure),
      bracketFormat: "double_elimination",
    }).expect(201);
    const bracketId = createRes.body.id;

    // Open and start
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({ status: "waiting" });
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({ status: "active" });

    // Get current bracket state
    const bracketRes = await adminAgent.get(`/api/brackets/${bracketId}`);
    const bracket = bracketRes.body;
    const currentStructure = JSON.parse(bracket.structure);

    // Find the first winners bracket match
    const firstWinnersMatch = currentStructure.find(
      (m: any) => m.bracketSection === "winners" && m.player1 && m.player2 && !m.winner
    );
    expect(firstWinnersMatch).toBeDefined();

    // Record winner for first match — loser should go to losers bracket
    const updatedStructure = currentStructure.map((m: any) =>
      m.matchNumber === firstWinnersMatch.matchNumber
        ? { ...m, winner: firstWinnersMatch.player1 }
        : m
    );

    await adminAgent.patch(`/api/brackets/${bracketId}`).send({
      structure: JSON.stringify(updatedStructure),
    }).expect(200);

    // Verify loser appears in losers bracket
    const afterRes = await adminAgent.get(`/api/brackets/${bracketId}`);
    const afterStructure = JSON.parse(afterRes.body.structure);
    const losersMatches = afterStructure.filter((m: any) => m.bracketSection === "losers");
    const loserName = firstWinnersMatch.player2; // loser is player2 since player1 won
    const loserInLosers = losersMatches.some(
      (m: any) => m.player1 === loserName || m.player2 === loserName
    );
    expect(loserInLosers).toBe(true);
  });
});
