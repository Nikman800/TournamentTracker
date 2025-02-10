import { pgTable, text, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  virtualCurrency: integer("virtual_currency").notNull().default(1000),
});

export const brackets = pgTable("brackets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  creatorId: integer("creator_id").notNull(),
  isPublic: boolean("is_public").notNull().default(true),
  accessCode: text("access_code"),
  structure: jsonb("structure").notNull(), // Array of matches
  status: text("status").notNull().default("pending"), // pending, active, completed
  winningBetId: integer("winning_bet_id"),
});

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  bracketId: integer("bracket_id").notNull(),
  round: integer("round").notNull(),
  position: integer("position").notNull(),
  player1: text("player1"),
  player2: text("player2"),
  winner: text("winner"),
});

export const bets = pgTable("bets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  bracketId: integer("bracket_id").notNull(),
  amount: integer("amount").notNull(),
  selectedWinner: text("selected_winner").notNull(),
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
});

export const insertMatchSchema = createInsertSchema(matches);
export const insertBetSchema = createInsertSchema(bets);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Bracket = typeof brackets.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Bet = typeof bets.$inferSelect;
