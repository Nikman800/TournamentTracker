import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { insertBracketSchema, insertBetSchema } from "@shared/schema";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Daily Bonus
  app.post("/api/claim-daily-bonus", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const user = await storage.claimDailyBonus(req.user.id);
      res.json(user);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(400).json({ message });
    }
  });

  // Brackets
  app.post("/api/brackets", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const parsed = insertBracketSchema.safeParse(req.body);
    if (!parsed.success) {
      console.log("Invalid bracket data:", parsed.error);
      return res.status(400).json(parsed.error);
    }

    const bracket = await storage.createBracket({
      ...parsed.data,
      creatorId: req.user.id,
      status: "pending",
      phase: null,
      currentRound: null,
      winningBetId: null,
      isPublic: parsed.data.isPublic ?? true,
      startingCredits: parsed.data.startingCredits ?? null,
      useIndependentCredits: parsed.data.useIndependentCredits ?? null,
    });

    console.log("Created bracket with full details:", JSON.stringify(bracket, null, 2));
    res.status(201).json(bracket);
  });

  app.get("/api/brackets", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const brackets = await storage.listBrackets();
    res.json(brackets);
  });

  app.get("/api/brackets/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const bracketId = parseInt(req.params.id);
    console.log(`Attempting to retrieve bracket ${bracketId}`);

    if (isNaN(bracketId)) {
      console.log("Invalid bracket ID:", req.params.id);
      return res.status(400).json({ message: "Invalid bracket ID" });
    }

    const bracket = await storage.getBracket(bracketId);
    console.log("Retrieved bracket:", JSON.stringify(bracket, null, 2));

    if (!bracket) {
      console.log(`Bracket ${bracketId} not found in storage`);
      return res.status(404).json({ message: "Bracket not found" });
    }

    // For brackets using independent credits, attach the user's balance
    if (bracket.useIndependentCredits) {
      const balance = await storage.getBracketBalance(req.user.id, bracket.id);
      console.log(`User ${req.user.id} bracket balance for ${bracket.id}:`, balance);
      return res.json({ ...bracket, userBracketBalance: balance });
    }

    res.json(bracket);
  });

  app.patch("/api/brackets/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const bracketId = parseInt(req.params.id);
    console.log(`Attempting to update bracket ${bracketId}`, req.body);

    const bracket = await storage.getBracket(bracketId);
    if (!bracket) {
      console.log(`Bracket ${bracketId} not found for update`);
      return res.status(404).json({ message: "Bracket not found" });
    }

    if (bracket.creatorId !== req.user.id) {
      console.log(`User ${req.user.id} attempted to update bracket ${bracketId} but is not the creator`);
      return res.status(403).json({ message: "Only the creator can update the bracket" });
    }

    // Validate status transition
    if (req.body.status) {
      const currentStatus = bracket.status;
      const newStatus = req.body.status;
      console.log(`Attempting status transition from ${currentStatus} to ${newStatus}`);

      const validTransitions = {
        pending: ["waiting"],
        waiting: ["active"],
        active: ["completed"],
      };

      if (!validTransitions[currentStatus]?.includes(newStatus)) {
        const error = `Invalid status transition from ${currentStatus} to ${newStatus}`;
        console.log(error);
        return res.status(400).json({ message: error });
      }

      // When transitioning to active, initialize phase and round
      if (newStatus === "active") {
        req.body.phase = "betting";
        req.body.currentRound = 0;
      }
    }

    // When transitioning from game to betting phase, increment round
    if (bracket.phase === "game" && req.body.phase === "betting") {
      console.log(`Transitioning from game to betting phase, incrementing round from ${bracket.currentRound}`);
      req.body.currentRound = (bracket.currentRound || 0) + 1;
    }

    const updated = await storage.updateBracket(bracket.id, req.body);
    console.log("Updated bracket:", JSON.stringify(updated, null, 2));
    res.json(updated);
  });

  app.post("/api/brackets/:id/join", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const bracket = await storage.getBracket(parseInt(req.params.id));
    if (!bracket) return res.status(404).json({ message: "Bracket not found" });

    // For private brackets, verify access code
    if (!bracket.isPublic && bracket.accessCode !== req.body.accessCode) {
      return res.status(403).json({ message: "Invalid access code" });
    }

    // If using independent credits, create initial balance for the user
    if (bracket.useIndependentCredits && bracket.startingCredits) {
      await storage.createBracketBalance({
        userId: req.user.id,
        bracketId: bracket.id,
        balance: bracket.startingCredits,
      });
    }

    res.sendStatus(200);
  });

  app.post("/api/brackets/:id/bets", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const parsed = insertBetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error);
    }

    const bracket = await storage.getBracket(parseInt(req.params.id));
    if (!bracket) return res.status(404).json({ message: "Bracket not found" });
    if (bracket.status !== "active") {
      return res.status(400).json({ message: "Bracket not active" });
    }

    // Check if this is the admin and if they're allowed to bet
    if (bracket.creatorId === req.user.id && !bracket.adminCanBet) {
      return res.status(403).json({ message: "Admin is not allowed to bet in this bracket" });
    }

    // Handle betting based on whether the bracket uses independent credits
    if (bracket.useIndependentCredits) {
      const balance = await storage.getBracketBalance(req.user.id, bracket.id);
      if (balance < parsed.data.amount) {
        return res.status(400).json({ message: "Insufficient bracket balance" });
      }
      await storage.updateBracketBalance(req.user.id, bracket.id, -parsed.data.amount);
    } else {
      if (req.user.virtualCurrency < parsed.data.amount) {
        return res.status(400).json({ message: "Insufficient funds" });
      }
      await storage.updateUserCurrency(req.user.id, -parsed.data.amount);
    }

    const bet = await storage.createBet({
      ...parsed.data,
      userId: req.user.id,
      bracketId: bracket.id,
    });

    res.status(201).json(bet);
  });

  app.get("/api/brackets/:id/bets", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const bets = await storage.getBracketBets(parseInt(req.params.id));
    res.json(bets);
  });

  const httpServer = createServer(app);
  return httpServer;
}