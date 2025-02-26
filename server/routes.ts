import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { insertBracketSchema, insertBetSchema, type Match } from "@shared/schema";

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
      accessCode: parsed.data.accessCode ?? null,
      adminCanBet: parsed.data.adminCanBet ?? null,
    });

    res.status(201).json(bracket);
  });

  app.patch("/api/brackets/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const bracketId = parseInt(req.params.id);
    console.log(`Attempting to update bracket ${bracketId}`, req.body);

    const bracket = await storage.getBracket(bracketId);
    if (!bracket) {
      return res.status(404).json({ message: "Bracket not found" });
    }

    if (bracket.creatorId !== req.user.id) {
      return res.status(403).json({ message: "Only the creator can update the bracket" });
    }

    // Handle status transitions
    if (req.body.status === "active" && bracket.status === "waiting") {
      req.body.phase = "betting";
      req.body.currentRound = 0;
    }

    // Handle phase transitions
    if (bracket.phase === "game" && req.body.phase === "betting") {
      const structure = JSON.parse(bracket.structure as string);
      const currentRound = bracket.currentRound || 0;

      // Find next unplayed match in the current round first
      const nextMatch = structure.find(
        (match: Match) => match.round === currentRound && !match.winner
      );

      // Only increment round if all matches in current round are complete
      if (!nextMatch) {
        req.body.currentRound = currentRound + 1;
      }
    }

    const updated = await storage.updateBracket(bracket.id, req.body);
    console.log("Updated bracket:", JSON.stringify(updated, null, 2));

    // Return balance info if it's a private bracket
    if (updated.useIndependentCredits) {
      const balance = await storage.getBracketBalance(req.user.id, updated.id);
      return res.json({ ...updated, userBracketBalance: balance });
    }

    res.json(updated);
  });

  app.get("/api/brackets", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const brackets = await storage.listBrackets();
    res.json(brackets);
  });

  app.get("/api/brackets/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const bracketId = parseInt(req.params.id);
    const bracket = await storage.getBracket(bracketId);
    if (!bracket) return res.status(404).json({ message: "Bracket not found" });

    if (bracket.useIndependentCredits) {
      const balance = await storage.getBracketBalance(req.user.id, bracket.id);
      return res.json({ ...bracket, userBracketBalance: balance });
    }

    res.json(bracket);
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

    const bracketId = parseInt(req.params.id);
    const parsed = insertBetSchema.safeParse({
      ...req.body,
      userId: req.user.id,
      bracketId
    });

    if (!parsed.success) {
      return res.status(400).json(parsed.error);
    }

    const bracket = await storage.getBracket(bracketId);
    if (!bracket) return res.status(404).json({ message: "Bracket not found" });
    if (bracket.status !== "active") {
      return res.status(400).json({ message: "Bracket not active" });
    }

    if (bracket.creatorId === req.user.id && !bracket.adminCanBet) {
      return res.status(403).json({ message: "Admin is not allowed to bet in this bracket" });
    }

    const existingBets = await storage.getBracketBets(bracketId);
    if (existingBets.some(bet => bet.userId === req.user.id && bet.round === bracket.currentRound)) {
      return res.status(400).json({ message: "You have already placed a bet for this match" });
    }

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

    const bet = await storage.createBet(parsed.data);
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