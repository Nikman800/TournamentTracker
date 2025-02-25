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

  private async processWinningBets(bracketId: number, currentRound: number, winner: string) {
    const bets = await this.getBracketBets(bracketId);
    const matchBets = bets.filter(bet => bet.round === currentRound);

    if (matchBets.length > 0) {
      const totalPool = matchBets.reduce((sum, bet) => sum + bet.amount, 0);
      const winningBets = matchBets.filter(bet => bet.selectedWinner === winner);
      const winningPool = winningBets.reduce((sum, bet) => sum + bet.amount, 0);

      for (const bet of winningBets) {
        const winningAmount = Math.floor((bet.amount / winningPool) * totalPool);
        const bracket = await this.getBracket(bracketId);
        if (bracket?.useIndependentCredits) {
          await this.updateBracketBalance(bet.userId, bracketId, winningAmount);
        } else {
          await this.updateUserCurrency(bet.userId, winningAmount);
        }
      }
    }
  }

  async updateBracket(id: number, updates: Partial<Bracket>): Promise<Bracket> {
    const bracket = await this.getBracket(id);
    if (!bracket) throw new Error("Bracket not found");

    // Handle winner selection without affecting round or phase
    if (updates.structure && !updates.phase) {
      const structure = JSON.parse(updates.structure as string) as Match[];
      const currentRound = bracket.currentRound || 0;
      const previousStructure = JSON.parse(bracket.structure as string) as Match[];

      // Process winners and payout bets
      for (const match of structure) {
        if (match.round === currentRound) {
          const previousMatch = previousStructure.find(
            m => m.round === match.round && m.position === match.position
          );

          if (match.winner && !previousMatch?.winner) {
            await this.processWinningBets(bracket.id, currentRound, match.winner);
          }
        }
      }
    }

    // Handle phase transition from game to betting
    if (bracket.phase === "game" && updates.phase === "betting") {
      const structure = JSON.parse(bracket.structure as string) as Match[];
      const currentRound = bracket.currentRound || 0;

      // Get current round matches
      const currentRoundMatches = structure.filter(m => m.round === currentRound);

      // Verify all matches in current round have winners
      const allMatchesComplete = currentRoundMatches.every(m => m.winner);

      if (allMatchesComplete) {
        // Update next round matches with winners
        for (let i = 0; i < currentRoundMatches.length; i += 2) {
          const match1 = currentRoundMatches[i];
          const match2 = currentRoundMatches[i + 1];

          if (match1?.winner && match2?.winner) {
            const nextRoundMatch = structure.find(
              m => m.round === currentRound + 1 && m.position === Math.floor(i/2)
            );
            if (nextRoundMatch) {
              nextRoundMatch.player1 = match1.winner;
              nextRoundMatch.player2 = match2.winner;
            }
          }
        }

        // Only increment round when transitioning to betting phase
        updates.currentRound = currentRound + 1;
        updates.structure = JSON.stringify(structure);
      }
    }

    // Update bracket with changes
    const updated = { ...bracket, ...updates };
    this.brackets.set(id, updated);

    // Return balance info for private brackets
    if (updated.useIndependentCredits) {
      const balance = await this.getBracketBalance(updated.creatorId, updated.id);
      return { ...updated, userBracketBalance: balance };
    }

    return updated;
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

    const user = { 
      ...insertUser, 
      id, 
      virtualCurrency: 1000,
      lastDailyBonus: yesterday
    };
    this.users.set(id, user);
    return user;
  }

  async createBracket(bracket: Omit<Bracket, "id">): Promise<Bracket> {
    const id = this.currentId.brackets++;
    const newBracket = { ...bracket, id };

    if (!newBracket.name || !newBracket.structure || typeof newBracket.isPublic !== 'boolean') {
      throw new Error("Missing required bracket fields");
    }

    this.brackets.set(id, newBracket);

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
    return this.brackets.get(id);
  }

  async listBrackets(): Promise<Bracket[]> {
    return Array.from(this.brackets.values());
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
}

export const storage = new MemStorage();