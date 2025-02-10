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
      res.status(400).json({ message: error.message });
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
      winningBetId: null,
    });

    // Return the full bracket object
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
    if (isNaN(bracketId)) {
      return res.status(400).json({ message: "Invalid bracket ID" });
    }

    const bracket = await storage.getBracket(bracketId);
    if (!bracket) {
      return res.status(404).json({ message: "Bracket not found" });
    }

    // If the bracket uses independent credits, include the user's bracket balance
    if (bracket.useIndependentCredits) {
      const balance = await storage.getBracketBalance(req.user.id, bracket.id);
      return res.json({ ...bracket, userBracketBalance: balance });
    }

    res.json(bracket);
  });

  app.post("/api/brackets/:id/join", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const bracket = await storage.getBracket(parseInt(req.params.id));
    if (!bracket) return res.sendStatus(404);

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

  app.patch("/api/brackets/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const bracket = await storage.getBracket(parseInt(req.params.id));
    if (!bracket) return res.sendStatus(404);
    if (bracket.creatorId !== req.user.id) return res.sendStatus(403);

    const updated = await storage.updateBracket(bracket.id, req.body);
    res.json(updated);
  });

  // Bets
  app.post("/api/brackets/:id/bets", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const parsed = insertBetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error);
    }

    const bracket = await storage.getBracket(parseInt(req.params.id));
    if (!bracket) return res.sendStatus(404);
    if (bracket.status !== "active") {
      return res.status(400).json({ message: "Bracket not active" });
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