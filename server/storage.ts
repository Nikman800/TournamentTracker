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

    // If there's a structure update, process winners and handle bets
    if (updates.structure) {
      const structure = JSON.parse(updates.structure as string) as Match[];
      const currentRound = bracket.currentRound || 0;

      // Check if any match in current round got a new winner
      const currentRoundMatches = structure.filter(m => m.round === currentRound);
      const previousStructure = JSON.parse(bracket.structure as string) as Match[];

      // Process any new or changed winners
      for (const match of structure) {
        const previousMatch = previousStructure.find(
          m => m.round === match.round && m.position === match.position
        );

        // If this match just got a winner or the winner changed
        if (match.winner && (!previousMatch?.winner || previousMatch.winner !== match.winner)) {
          console.log(`Match #${match.matchNumber} in round ${match.round}, position ${match.position} got winner: ${match.winner}`);
          
          // Find the next round match that should receive this winner
          let nextRoundPosition: number;
          let nextRoundSlot: string;
          
          // Determine if this is Round 0 → Round 1 transition with byes
          // When byes exist: Round 1 matches have bye recipients pre-filled in player1 slots
          // When no byes: Round 1 matches are empty (standard bracket tree applies)
          if (match.round === 0) {
            // Check if next round has any matches with players already filled (indicating byes)
            const nextRoundMatches = structure.filter(m => m.round === match.round + 1);
            const hasByes = nextRoundMatches.some(m => m.player1 || m.player2);
            
            if (hasByes) {
              // Byes exist: Use direct position mapping
              // Round 0 position 0 → Round 1 position 0 (bye recipient is player1, winner is player2)
              // Round 0 position 1 → Round 1 position 1 (bye recipient is player1, winner is player2)
              nextRoundPosition = match.position;
              nextRoundSlot = 'player2'; // Winners go to player2 slot (bye recipients in player1)
            } else {
              // No byes: Use standard bracket tree logic
              // Positions 0,1 → feed into next round position 0 (as player1 and player2)
              // Positions 2,3 → feed into next round position 1 (as player1 and player2)
              nextRoundPosition = Math.floor(match.position / 2);
              nextRoundSlot = match.position % 2 === 0 ? 'player1' : 'player2';
            }
          } else {
            // Standard bracket tree logic for rounds 1+:
            // Positions 0,1 → feed into next round position 0 (as player1 and player2)
            // Positions 2,3 → feed into next round position 1 (as player1 and player2)
            nextRoundPosition = Math.floor(match.position / 2);
            nextRoundSlot = match.position % 2 === 0 ? 'player1' : 'player2';
          }
          
          const nextRoundMatch = structure.find(
            m => m.round === match.round + 1 && 
                 m.position === nextRoundPosition
          );

          if (nextRoundMatch) {
            // Check if we're updating an existing winner (match result changed)
            const oldWinner = previousMatch?.winner;
            
            if (oldWinner) {
              // Replace the old winner with the new winner
              if (nextRoundMatch.player1 === oldWinner) {
                nextRoundMatch.player1 = match.winner;
              } else if (nextRoundMatch.player2 === oldWinner) {
                nextRoundMatch.player2 = match.winner;
              } else {
                // Old winner not found - place in correct slot
                if (nextRoundSlot === 'player1' && !nextRoundMatch.player1) {
                  nextRoundMatch.player1 = match.winner;
                } else if (nextRoundSlot === 'player2' && !nextRoundMatch.player2) {
                  nextRoundMatch.player2 = match.winner;
                } else {
                  // Slot occupied - use other slot as fallback
                  if (!nextRoundMatch.player1) {
                    nextRoundMatch.player1 = match.winner;
                  } else if (!nextRoundMatch.player2) {
                    nextRoundMatch.player2 = match.winner;
                  }
                }
              }
            } else {
              // First time setting winner - place in designated slot
              if (nextRoundSlot === 'player1') {
                if (!nextRoundMatch.player1) {
                  nextRoundMatch.player1 = match.winner;
                } else {
                  // Slot occupied by bye recipient, use player2 slot
                  nextRoundMatch.player2 = match.winner;
                }
              } else {
                if (!nextRoundMatch.player2) {
                  nextRoundMatch.player2 = match.winner;
                } else {
                  // Slot occupied, use player1 slot as fallback
                  nextRoundMatch.player1 = match.winner;
                }
              }
            }
            
            console.log(`Winner ${match.winner} advanced to Match #${nextRoundMatch.matchNumber} (Round ${nextRoundMatch.round}, Position ${nextRoundMatch.position}) as ${nextRoundSlot}: [${nextRoundMatch.player1 || 'TBD'} vs ${nextRoundMatch.player2 || 'TBD'}]`);
          } else {
            // Check if this is a final match - winners don't advance further
            const hasNextRound = structure.some(m => m.round === match.round + 1);
            if (!hasNextRound) {
              console.log(`Winner ${match.winner} is the tournament champion!`);
            } else {
              console.error(`Could not find next round match for round ${match.round} position ${match.position}`);
            }
          }
        }
      }

      // Match progression logic is now handled in routes.ts
      // This ensures currentMatchNumber and currentRound are set correctly before calling updateBracket

      updates.structure = JSON.stringify(structure);
    }

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