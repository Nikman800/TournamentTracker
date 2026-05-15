import { describe, test, expect, beforeEach } from "vitest";
import request from "supertest";
import { generateSingleElim } from "../../shared/bracketGenerators";
import { createTestApp } from "./helpers";

function makeStructure() {
  return JSON.stringify(generateSingleElim(["Alice", "Bob"]));
}

describe("Bracket filtering", () => {
  let app: any;

  beforeEach(() => {
    ({ app } = createTestApp());
  });

  test("public bracket is visible to all authenticated users", async () => {
    const adminAgent = request.agent(app);
    const otherAgent = request.agent(app);
    const suffix = Date.now();

    await adminAgent.post("/api/register").send({ username: `admin_${suffix}`, password: "pass" });
    await otherAgent.post("/api/register").send({ username: `other_${suffix}`, password: "pass" });

    await adminAgent.post("/api/brackets").send({
      name: "Public Bracket",
      isPublic: true,
      structure: makeStructure(),
      bracketFormat: "single_elimination",
    }).expect(201);

    const res = await otherAgent.get("/api/brackets").expect(200);
    expect(res.body.some((b: any) => b.name === "Public Bracket")).toBe(true);
  });

  test("private bracket is NOT visible to non-joined, non-creator user", async () => {
    const adminAgent = request.agent(app);
    const otherAgent = request.agent(app);
    const suffix = Date.now();

    await adminAgent.post("/api/register").send({ username: `admin2_${suffix}`, password: "pass" });
    await otherAgent.post("/api/register").send({ username: `other2_${suffix}`, password: "pass" });

    await adminAgent.post("/api/brackets").send({
      name: "Private Bracket",
      isPublic: false,
      accessCode: "secret",
      structure: makeStructure(),
      bracketFormat: "single_elimination",
    }).expect(201);

    const res = await otherAgent.get("/api/brackets").expect(200);
    expect(res.body.some((b: any) => b.name === "Private Bracket")).toBe(false);
  });

  test("private bracket is visible to its creator", async () => {
    const adminAgent = request.agent(app);
    const suffix = Date.now();

    await adminAgent.post("/api/register").send({ username: `admin3_${suffix}`, password: "pass" });

    const createRes = await adminAgent.post("/api/brackets").send({
      name: "Creator Bracket",
      isPublic: false,
      accessCode: "secret",
      structure: makeStructure(),
      bracketFormat: "single_elimination",
    }).expect(201);

    const res = await adminAgent.get("/api/brackets").expect(200);
    expect(res.body.some((b: any) => b.id === createRes.body.id)).toBe(true);
  });

  test("after joining with correct access code, private bracket appears in list", async () => {
    const adminAgent = request.agent(app);
    const joinerAgent = request.agent(app);
    const suffix = Date.now();

    await adminAgent.post("/api/register").send({ username: `admin4_${suffix}`, password: "pass" });
    await joinerAgent.post("/api/register").send({ username: `joiner_${suffix}`, password: "pass" });

    const createRes = await adminAgent.post("/api/brackets").send({
      name: "Joinable Bracket",
      isPublic: false,
      accessCode: "joinme",
      structure: makeStructure(),
      bracketFormat: "single_elimination",
    }).expect(201);
    const bracketId = createRes.body.id;

    // Before joining — not visible
    const before = await joinerAgent.get("/api/brackets").expect(200);
    expect(before.body.some((b: any) => b.id === bracketId)).toBe(false);

    // Join
    await joinerAgent.post(`/api/brackets/${bracketId}/join`).send({ accessCode: "joinme" }).expect(200);

    // After joining — visible
    const after = await joinerAgent.get("/api/brackets").expect(200);
    expect(after.body.some((b: any) => b.id === bracketId)).toBe(true);
  });
});

describe("Spectator access control for betting", () => {
  let app: any;

  beforeEach(() => {
    ({ app } = createTestApp());
  });

  test("non-joined user betting on private bracket returns 403", async () => {
    const adminAgent = request.agent(app);
    const outsiderAgent = request.agent(app);
    const suffix = Date.now();

    await adminAgent.post("/api/register").send({ username: `admin5_${suffix}`, password: "pass" });
    await outsiderAgent.post("/api/register").send({ username: `outsider_${suffix}`, password: "pass" });

    const createRes = await adminAgent.post("/api/brackets").send({
      name: "Private Bet Bracket",
      isPublic: false,
      accessCode: "nope",
      structure: makeStructure(),
      bracketFormat: "single_elimination",
    }).expect(201);
    const bracketId = createRes.body.id;

    // Start tournament
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({ status: "waiting" });
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({ status: "active" });

    // Outsider tries to bet
    await outsiderAgent.post(`/api/brackets/${bracketId}/bets`).send({
      amount: 50,
      selectedWinner: "Alice",
    }).expect(403);
  });

  test("joined user can place bet on private bracket", async () => {
    const adminAgent = request.agent(app);
    const joinerAgent = request.agent(app);
    const suffix = Date.now();

    await adminAgent.post("/api/register").send({ username: `admin6_${suffix}`, password: "pass" });
    await joinerAgent.post("/api/register").send({ username: `joiner2_${suffix}`, password: "pass" });

    const createRes = await adminAgent.post("/api/brackets").send({
      name: "Private Bet Bracket 2",
      isPublic: false,
      accessCode: "yes",
      structure: makeStructure(),
      bracketFormat: "single_elimination",
    }).expect(201);
    const bracketId = createRes.body.id;

    // Joiner joins
    await joinerAgent.post(`/api/brackets/${bracketId}/join`).send({ accessCode: "yes" }).expect(200);

    // Start tournament
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({ status: "waiting" });
    await adminAgent.patch(`/api/brackets/${bracketId}`).send({ status: "active" });

    // Joiner bets
    await joinerAgent.post(`/api/brackets/${bracketId}/bets`).send({
      amount: 50,
      selectedWinner: "Alice",
    }).expect(201);
  });
});

describe("Server-side participant limit validation", () => {
  let app: any;

  beforeEach(() => {
    ({ app } = createTestApp());
  });

  test("round robin with 17 participants (over limit) returns 400", async () => {
    const agent = request.agent(app);
    await agent.post("/api/register").send({ username: `admin_limit_${Date.now()}`, password: "pass" });

    const { generateRoundRobin } = await import("../../shared/bracketGenerators");
    const participants = Array.from({ length: 17 }, (_, i) => `Player${i + 1}`);
    const structure = generateRoundRobin(participants);

    await agent.post("/api/brackets").send({
      name: "Over Limit Bracket",
      isPublic: true,
      structure: JSON.stringify(structure),
      bracketFormat: "round_robin",
    }).expect(400);
  });

  test("single elimination with 1 participant (under limit) returns 400", async () => {
    const agent = request.agent(app);
    await agent.post("/api/register").send({ username: `admin_limit2_${Date.now()}`, password: "pass" });

    const structure = [{ matchNumber: 1, round: 0, position: 0, player1: "Solo", player2: null, winner: null, bracketSection: "main" }];

    await agent.post("/api/brackets").send({
      name: "Under Limit Bracket",
      isPublic: true,
      structure: JSON.stringify(structure),
      bracketFormat: "single_elimination",
    }).expect(400);
  });
});
