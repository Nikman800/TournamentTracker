import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { insertBracketSchema, insertBetSchema } from "@shared/schema";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

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
    
    res.status(201).json(bracket);
  });

  app.get("/api/brackets", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const brackets = await storage.listBrackets();
    res.json(brackets);
  });

  app.get("/api/brackets/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const bracket = await storage.getBracket(parseInt(req.params.id));
    if (!bracket) return res.sendStatus(404);
    res.json(bracket);
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

    if (req.user.virtualCurrency < parsed.data.amount) {
      return res.status(400).json({ message: "Insufficient funds" });
    }

    await storage.updateUserCurrency(req.user.id, -parsed.data.amount);
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
