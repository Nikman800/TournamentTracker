import { describe, test, expect, beforeEach } from "vitest";
import request from "supertest";
import { generateRoundRobin } from "../../../shared/bracketGenerators";
import { createTestApp } from "../helpers";

describe("Round robin lifecycle", () => {
  let app: any;
  beforeEach(() => { ({ app } = createTestApp()); });

  test("4-participant round robin: standings updated correctly and champion determined", async () => {
    const adminAgent = request.agent(app);
    const suffix = Date.now();

    await adminAgent.post("/api/register").send({ username: `admin_rr_${suffix}`, password: "pass" });

    const participants = ["Alice", "Bob", "Charlie", "Dave"];
    const structure = generateRoundRobin(participants);

    const createRes = await adminAgent.post("/api/brackets").send({
      name: `RR Test ${suffix}`,
      isPublic: true,
      structure: JSON.stringify(structure),
      bracketFormat: "round_robin",
    }).expect(201);
    const bracketId = createRes.body.id;

    // Open and start
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({ status: "waiting" });
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({ status: "active" });

    // Get current structure
    const bracketRes = await adminAgent.get(`/api/brackets/${bracketId}`);
    const currentStructure = JSON.parse(bracketRes.body.structure);

    // Advance all 6 matches — Alice always wins
    let latestStructure = [...currentStructure];
    for (const match of currentStructure) {
      if (!match.player1 || !match.player2) continue;
      latestStructure = latestStructure.map((m: any) =>
        m.matchNumber === match.matchNumber
          ? { ...m, winner: match.player1 }
          : m
      );
      await adminAgent.patch(`/api/brackets/${bracketId}`).send({
        structure: JSON.stringify(latestStructure),
      }).expect(200);
    }

    // Check standings
    const standingsRes = await adminAgent.get(`/api/brackets/${bracketId}/standings`).expect(200);
    const standings = standingsRes.body;

    // Alice should have 3 wins (played against Bob, Charlie, Dave)
    const aliceStanding = standings.find((s: any) => s.participant === "Alice");
    expect(aliceStanding).toBeDefined();
    expect(aliceStanding.wins).toBe(3);
    expect(aliceStanding.points).toBe(3);

    // Total points should equal total matches (6)
    const totalPoints = standings.reduce((sum: number, s: any) => sum + s.points, 0);
    expect(totalPoints).toBe(6);

    // Bracket should be completed
    const finalBracket = await adminAgent.get(`/api/brackets/${bracketId}`);
    expect(finalBracket.body.status).toBe("completed");
  });
});
