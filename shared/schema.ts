import { pgTable, text, serial, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  virtualCurrency: integer("virtual_currency").notNull().default(1000),
  lastDailyBonus: timestamp("last_daily_bonus"),
});

export const brackets = pgTable("brackets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  creatorId: integer("creator_id").notNull(),
  isPublic: boolean("is_public").notNull().default(true),
  accessCode: text("access_code"),
  structure: jsonb("structure").notNull(), // Array of matches
  status: text("status").notNull().default("pending"), // pending, waiting, active, completed
  phase: text("phase").default("betting"), // betting, game
  currentRound: integer("current_round").default(0),
  winningBetId: integer("winning_bet_id"),
  startingCredits: integer("starting_credits"), // Optional starting credits for private brackets
  useIndependentCredits: boolean("use_independent_credits").default(false),
  adminCanBet: boolean("admin_can_bet").default(false),
});

export const bracketBalances = pgTable("bracket_balances", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  bracketId: integer("bracket_id").notNull(),
  balance: integer("balance").notNull(),
});

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  bracketId: integer("bracket_id").notNull(),
  round: integer("round").notNull(),
  position: integer("position").notNull(),
  player1: text("player1"),
  player2: text("player2"),
  winner: text("winner"),
  matchNumber: integer("match_number"),
});

export const bets = pgTable("bets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  bracketId: integer("bracket_id").notNull(),
  amount: integer("amount").notNull(),
  selectedWinner: text("selected_winner").notNull(),
  round: integer("round").notNull(), // Track which round the bet was placed in
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertBracketSchema = createInsertSchema(brackets).pick({
  name: true,
  isPublic: true,
  accessCode: true,
  structure: true,
  startingCredits: true,
  useIndependentCredits: true,
  adminCanBet: true,
});

export const insertBracketBalanceSchema = createInsertSchema(bracketBalances);
export const insertMatchSchema = createInsertSchema(matches);
export const insertBetSchema = createInsertSchema(bets);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Bracket = typeof brackets.$inferSelect;
export type BracketBalance = typeof bracketBalances.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Bet = typeof bets.$inferSelect;