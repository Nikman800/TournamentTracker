import { describe, test, expect, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp } from "./helpers";
import { MemStorage, storage } from "../../server/storage";

describe("GET /api/users", () => {
  let app: any;

  beforeEach(() => {
    ({ app } = createTestApp());
  });

  test("unauthenticated request returns 401", async () => {
    await request(app).get("/api/users").expect(401);
  });

  test("authenticated request returns 200 with users array, no password field", async () => {
    const agent = request.agent(app);
    const suffix = Date.now();
    await agent.post("/api/register").send({ username: `user_${suffix}`, password: "pass" }).expect(201);

    const res = await agent.get("/api/users").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    for (const user of res.body) {
      expect(user).not.toHaveProperty("password");
      expect(user).toHaveProperty("id");
      expect(user).toHaveProperty("username");
    }
  });
});

describe("DbStorage fallback", () => {
  test("when DATABASE_URL is not set, storage is MemStorage", () => {
    // DATABASE_URL is not set in test environment
    expect(storage).toBeInstanceOf(MemStorage);
  });
});
