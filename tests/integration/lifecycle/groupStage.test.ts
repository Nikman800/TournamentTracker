import { describe, test, expect, beforeEach } from "vitest";
import request from "supertest";
import { generateGroupStage } from "../../../shared/bracketGenerators";
import { createTestApp } from "../helpers";

describe("Group stage lifecycle", () => {
  let app: any;
  beforeEach(() => { ({ app } = createTestApp()); });

  test("4 participants, 2 groups, 1 advance: correct participants seeded into knockout", async () => {
    const adminAgent = request.agent(app);
    const suffix = Date.now();

    await adminAgent.post("/api/register").send({ username: `admin_gs_${suffix}`, password: "pass" });

    // 4 participants, 2 groups of 2, 1 advances per group → 2 knockout participants
    const participants = ["Alice", "Bob", "Charlie", "Dave"];
    const structure = generateGroupStage(participants, 2, 1);

    const createRes = await adminAgent.post("/api/brackets").send({
      name: `GS Test ${suffix}`,
      isPublic: true,
      structure: JSON.stringify(structure),
      bracketFormat: "group_stage",
      numGroups: 2,
      advanceCount: 1,
    }).expect(201);
    const bracketId = createRes.body.id;

    // Open and start
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({ status: "waiting" });
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({ status: "active" });

    // Get current structure
    const bracketRes = await adminAgent.get(`/api/brackets/${bracketId}`);
    const currentStructure = JSON.parse(bracketRes.body.structure);

    // Find all group matches
    const groupMatches = currentStructure.filter((m: any) => m.bracketSection === "group");
    expect(groupMatches.length).toBeGreaterThan(0);

    // Complete all group matches — player1 always wins
    let latestStructure = [...currentStructure];
    for (const match of groupMatches) {
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

    // After all group matches, knockout bracket should be seeded
    const afterGroupRes = await adminAgent.get(`/api/brackets/${bracketId}`);
    const afterGroupStructure = JSON.parse(afterGroupRes.body.structure);
    const knockoutMatches = afterGroupStructure.filter((m: any) => m.bracketSection === "knockout");

    // At least one knockout match should have players seeded
    const seededKnockout = knockoutMatches.some(
      (m: any) => m.player1 !== null || m.player2 !== null
    );
    expect(seededKnockout).toBe(true);

    // The advancing participants should be the group winners (player1 of each group match)
    // Group 0: Alice vs Bob → Alice wins; Group 1: Charlie vs Dave → Charlie wins
    const allKnockoutPlayers = knockoutMatches.flatMap((m: any) => [m.player1, m.player2]).filter(Boolean);
    // Alice and Charlie should be in the knockout
    expect(allKnockoutPlayers).toContain("Alice");
    expect(allKnockoutPlayers).toContain("Charlie");

    // Complete the knockout match
    const knockoutMatch = knockoutMatches.find((m: any) => m.player1 && m.player2);
    if (knockoutMatch) {
      const finalStructure = afterGroupStructure.map((m: any) =>
        m.matchNumber === knockoutMatch.matchNumber
          ? { ...m, winner: knockoutMatch.player1 }
          : m
      );
      const finalRes = await adminAgent.patch(`/api/brackets/${bracketId}`).send({
        structure: JSON.stringify(finalStructure),
      }).expect(200);

      // Champion should be the knockout winner
      const finalStructureParsed = JSON.parse(finalRes.body.structure);
      const completedKnockout = finalStructureParsed.find(
        (m: any) => m.matchNumber === knockoutMatch.matchNumber
      );
      expect(completedKnockout.winner).toBe(knockoutMatch.player1);
    }
  });
});
