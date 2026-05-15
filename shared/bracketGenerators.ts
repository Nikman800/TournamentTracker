export type BracketFormat =
  | "single_elimination"
  | "double_elimination"
  | "round_robin"
  | "group_stage";

export interface MatchNode {
  matchNumber: number;
  round: number;
  position: number;
  player1: string | null;
  player2: string | null;
  winner: string | null;
  bracketSection: "main" | "winners" | "losers" | "grand_final" | "group" | "knockout";
  groupId?: number;
}

// ─── Single Elimination ───────────────────────────────────────────────────────

export function generateSingleElim(participants: string[]): MatchNode[] {
  if (participants.length === 0) return [];

  const numPlayers = participants.length;
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(numPlayers)));
  const numByes = bracketSize - numPlayers;

  const playersCompetingInRound0 = numPlayers - numByes; // always even
  const firstRoundMatches = playersCompetingInRound0 / 2;

  const matches: MatchNode[] = [];
  let matchNumber = 1;

  // Round 0: pairs of competing players
  for (let i = 0; i < firstRoundMatches; i++) {
    matches.push({
      matchNumber: matchNumber++,
      round: 0,
      position: i,
      player1: participants[i * 2],
      player2: participants[i * 2 + 1],
      winner: null,
      bracketSection: "main",
    });
  }

  // Round 1: bye recipients + winners from round 0
  const round1MatchCount = Math.floor(bracketSize / 4);
  const byeRecipients = participants.slice(playersCompetingInRound0);
  let byeIndex = 0;

  for (let i = 0; i < round1MatchCount; i++) {
    let player1: string | null = null;
    let player2: string | null = null;

    if (i < firstRoundMatches && byeIndex < byeRecipients.length) {
      player1 = byeRecipients[byeIndex++];
    } else if (byeIndex < byeRecipients.length) {
      player1 = byeRecipients[byeIndex++];
      if (byeIndex < byeRecipients.length) {
        player2 = byeRecipients[byeIndex++];
      }
    }

    matches.push({
      matchNumber: matchNumber++,
      round: 1,
      position: i,
      player1,
      player2,
      winner: null,
      bracketSection: "main",
    });
  }

  // Subsequent rounds: all TBD
  const totalRounds = Math.log2(bracketSize);
  for (let r = 2; r < totalRounds; r++) {
    const matchesInRound = bracketSize / Math.pow(2, r + 1);
    for (let m = 0; m < matchesInRound; m++) {
      matches.push({
        matchNumber: matchNumber++,
        round: r,
        position: m,
        player1: null,
        player2: null,
        winner: null,
        bracketSection: "main",
      });
    }
  }

  return matches;
}

// ─── Double Elimination ───────────────────────────────────────────────────────

/**
 * Maps a winners bracket match number to the losers bracket slot where the
 * loser should be placed.
 */
export function getLoserDestination(
  winnersBracketMatchNumber: number,
  totalWinnersMatches: number
): { round: number; position: number; slot: "player1" | "player2" } {
  // Simple sequential mapping: match 1 → losers round 0 position 0, etc.
  const idx = winnersBracketMatchNumber - 1;
  return {
    round: Math.floor(idx / 2),
    position: idx % 2,
    slot: "player1",
  };
}

export function generateDoubleElim(participants: string[]): MatchNode[] {
  if (participants.length === 0) return [];

  // Winners bracket: same as single elim but with bracketSection "winners"
  const winnersMatches = generateSingleElim(participants).map((m) => ({
    ...m,
    bracketSection: "winners" as const,
  }));

  const W = winnersMatches.length; // N - 1

  // Losers bracket: N - 2 matches, all TBD
  const L = Math.max(1, participants.length - 2);
  const losersMatches: MatchNode[] = [];

  for (let i = 0; i < L; i++) {
    losersMatches.push({
      matchNumber: W + i + 1,
      round: Math.floor(i / 2),
      position: i % 2,
      player1: null,
      player2: null,
      winner: null,
      bracketSection: "losers",
    });
  }

  // Grand final
  const grandFinal: MatchNode = {
    matchNumber: W + L + 1,
    round: 0,
    position: 0,
    player1: null,
    player2: null,
    winner: null,
    bracketSection: "grand_final",
  };

  return [...winnersMatches, ...losersMatches, grandFinal];
}

// ─── Round Robin ──────────────────────────────────────────────────────────────

export function generateRoundRobin(participants: string[]): MatchNode[] {
  if (participants.length < 2) return [];

  const BYE = "__BYE__";
  const list = participants.length % 2 === 0 ? [...participants] : [...participants, BYE];
  const n = list.length; // even
  const numRounds = n - 1;

  const matches: MatchNode[] = [];
  let matchNumber = 1;

  // Circle method: fix list[0], rotate the rest
  const rotation = list.slice(1);

  for (let r = 0; r < numRounds; r++) {
    const roundParticipants = [list[0], ...rotation];
    let position = 0;

    for (let i = 0; i < n / 2; i++) {
      const p1 = roundParticipants[i];
      const p2 = roundParticipants[n - 1 - i];

      if (p1 !== BYE && p2 !== BYE) {
        matches.push({
          matchNumber: matchNumber++,
          round: r,
          position: position++,
          player1: p1,
          player2: p2,
          winner: null,
          bracketSection: "main",
        });
      }
    }

    // Rotate: move last element to front of rotation
    rotation.unshift(rotation.pop()!);
  }

  return matches;
}

// ─── Group Stage ──────────────────────────────────────────────────────────────

export function generateGroupStage(
  participants: string[],
  numGroups: number,
  advanceCount: number
): MatchNode[] {
  if (participants.length === 0 || numGroups < 1) return [];

  // Distribute participants into groups as evenly as possible
  // First (participants.length % numGroups) groups get one extra participant
  const groups: string[][] = Array.from({ length: numGroups }, () => []);
  const extra = participants.length % numGroups;

  let idx = 0;
  for (let g = 0; g < numGroups; g++) {
    const size = Math.floor(participants.length / numGroups) + (g < extra ? 1 : 0);
    groups[g] = participants.slice(idx, idx + size);
    idx += size;
  }

  const allMatches: MatchNode[] = [];
  let matchNumber = 1;

  // Generate round-robin for each group
  for (let g = 0; g < numGroups; g++) {
    const groupMatches = generateRoundRobin(groups[g]);
    for (const m of groupMatches) {
      allMatches.push({
        ...m,
        matchNumber: matchNumber++,
        bracketSection: "group",
        groupId: g,
      });
    }
  }

  // Generate empty knockout bracket for numGroups * advanceCount participants
  const knockoutParticipants = numGroups * advanceCount;
  const knockoutMatches = generateSingleElim(
    Array.from({ length: knockoutParticipants }, (_, i) => `__KO_${i}__`)
  );

  for (const m of knockoutMatches) {
    allMatches.push({
      ...m,
      matchNumber: matchNumber++,
      player1: null,
      player2: null,
      bracketSection: "knockout",
    });
  }

  return allMatches;
}
