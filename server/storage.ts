import { User, InsertUser, Bracket, Match, Bet, BracketBalance } from "@shared/schema";
import createMemoryStore from "memorystore";
import session from "express-session";

const MemoryStore = createMemoryStore(session);

export class MemStorage {
  private users: Map<number, User>;
  private brackets: Map<number, Bracket>;
  private matches: Map<number, Match>;
  private bets: Map<number, Bet>;
  private bracketBalances: Map<number, BracketBalance>;
  sessionStore: session.Store;
  currentId: { [key: string]: number };

  constructor() {
    this.users = new Map();
    this.brackets = new Map();
    this.matches = new Map();
    this.bets = new Map();
    this.bracketBalances = new Map();
    this.currentId = { users: 1, brackets: 1, matches: 1, bets: 1, bracketBalances: 1 };
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId.users++;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const user: User = { 
      ...insertUser, 
      id, 
      virtualCurrency: 1000,
      lastDailyBonus: yesterday
    };
    this.users.set(id, user);
    return user;
  }

  async claimDailyBonus(userId: number): Promise<User> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

    const now = new Date();
    const lastBonus = user.lastDailyBonus ? new Date(user.lastDailyBonus) : new Date(0);
    const timeDiff = now.getTime() - lastBonus.getTime();
    const dayDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

    if (dayDiff < 1) {
      throw new Error("Daily bonus already claimed");
    }

    const updated = { 
      ...user, 
      virtualCurrency: user.virtualCurrency + 100,
      lastDailyBonus: now 
    };
    this.users.set(userId, updated);
    return updated;
  }

  async createBracket(bracket: Omit<Bracket, "id">): Promise<Bracket> {
    const id = this.currentId.brackets++;
    const newBracket = { ...bracket, id };

    // Ensure all required fields are present
    if (!newBracket.name || !newBracket.structure || typeof newBracket.isPublic !== 'boolean') {
      throw new Error("Missing required bracket fields");
    }

    this.brackets.set(id, newBracket);

    // If using independent credits, create initial balances for the creator
    if (bracket.useIndependentCredits && bracket.startingCredits) {
      await this.createBracketBalance({
        userId: bracket.creatorId,
        bracketId: id,
        balance: bracket.startingCredits,
      });
    }

    return newBracket;
  }

  async getBracket(id: number): Promise<Bracket | undefined> {
    console.log("Storage state:", {
      bracketsSize: this.brackets.size,
      availableIds: Array.from(this.brackets.keys()),
      requestedId: id
    });
    
    const bracket = this.brackets.get(id);
    if (!bracket) {
      console.log(`Bracket ${id} not found. Available brackets:`, 
        Array.from(this.brackets.entries()).map(([id, b]) => ({
          id,
          name: b.name,
          creatorId: b.creatorId
        }))
      );
    }
    return bracket;
  }

  async listBrackets(): Promise<Bracket[]> {
    return Array.from(this.brackets.values());
  }

  async updateBracket(id: number, updates: Partial<Bracket>): Promise<Bracket> {
    const bracket = await this.getBracket(id);
    if (!bracket) throw new Error("Bracket not found");
    const updated = { ...bracket, ...updates };
    this.brackets.set(id, updated);
    return updated;
  }

  async getBracketBalance(userId: number, bracketId: number): Promise<number> {
    const balance = Array.from(this.bracketBalances.values()).find(
      (b) => b.userId === userId && b.bracketId === bracketId
    );
    return balance?.balance ?? 0;
  }

  async createBracketBalance(balance: Omit<BracketBalance, "id">): Promise<BracketBalance> {
    const id = this.currentId.bracketBalances++;
    const newBalance = { ...balance, id };
    this.bracketBalances.set(id, newBalance);
    return newBalance;
  }

  async updateBracketBalance(userId: number, bracketId: number, amount: number): Promise<BracketBalance> {
    const balance = Array.from(this.bracketBalances.values()).find(
      (b) => b.userId === userId && b.bracketId === bracketId
    );
    if (!balance) {
      return this.createBracketBalance({ userId, bracketId, balance: amount });
    }
    const updated = { ...balance, balance: balance.balance + amount };
    this.bracketBalances.set(balance.id, updated);
    return updated;
  }

  async createBet(bet: Omit<Bet, "id">): Promise<Bet> {
    const id = this.currentId.bets++;
    const newBet = { ...bet, id };
    this.bets.set(id, newBet);
    return newBet;
  }

  async getBracketBets(bracketId: number): Promise<Bet[]> {
    return Array.from(this.bets.values()).filter(
      (bet) => bet.bracketId === bracketId,
    );
  }

  async updateUserCurrency(userId: number, amount: number): Promise<User> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");
    const updated = { ...user, virtualCurrency: user.virtualCurrency + amount };
    this.users.set(userId, updated);
    return updated;
  }
}

export const storage = new MemStorage();