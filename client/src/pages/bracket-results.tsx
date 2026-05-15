import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import type { Bracket, Match, Bet, User } from "@shared/schema";
import { Loader2, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BracketViewer } from "@/components/bracket-viewer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type PlayerStats = {
  userId: number;
  username: string;
  totalWagered: number;
  totalReceived: number;
  netProfit: number;
};

/** Mirrors the server-side payout engine: proportional distribution of the pot to winners */
function computeMatchPayouts(matchBets: Bet[], winner: string): Map<number, number> {
  const winningBets = matchBets.filter(b => b.selectedWinner === winner);
  if (winningBets.length === 0) return new Map();

  const pot = matchBets.reduce((sum, b) => sum + b.amount, 0);
  const totalWinningAmount = winningBets.reduce((sum, b) => sum + b.amount, 0);

  const payouts = new Map<number, number>();
  for (const bet of winningBets) {
    payouts.set(bet.userId, Math.floor((bet.amount / totalWinningAmount) * pot));
  }
  return payouts;
}

export default function BracketResultsPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const { data: bracket, isLoading: bracketLoading } = useQuery<Bracket>({
    queryKey: [`/api/brackets/${id}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/brackets/${id}`);
      return res.json();
    },
    enabled: !!id,
  });

  const { data: bets, isLoading: betsLoading } = useQuery<Bet[]>({
    queryKey: [`/api/brackets/${id}/bets`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/brackets/${id}/bets`);
      return res.json();
    },
    enabled: !!id,
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users");
      return res.json();
    },
    // Don't throw on error — gracefully degrade if users endpoint fails
    retry: false,
  });

  if (bracketLoading || betsLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!bracket) {
    return <div>Bracket not found</div>;
  }

  const structure = JSON.parse(bracket.structure as string) as Match[];
  const totalRounds = Math.max(...structure.map(m => m.round)) + 1;
  const finalMatch = structure.find(m => m.round === totalRounds - 1);
  const champion = finalMatch?.winner || "Unknown";

  // Build leaderboard using correct per-match payout computation
  const playerStats: PlayerStats[] = [];

  if (bets && bets.length > 0) {
    // Accumulate wagered and received amounts per user across all matches
    const wageredByUser = new Map<number, number>();
    const receivedByUser = new Map<number, number>();

    // Group bets by match (round + matchNumber)
    const matchKeys = Array.from(new Set(bets.map(b => `${b.round}:${b.matchNumber}`)));

    for (const key of matchKeys) {
      const [roundStr, matchNumStr] = key.split(":");
      const round = parseInt(roundStr, 10);
      const matchNumber = parseInt(matchNumStr, 10);

      const matchBets = bets.filter(b => b.round === round && b.matchNumber === matchNumber);

      // Find the corresponding match in the structure to get the winner
      const matchInStructure = structure.find(
        m => m.round === round && m.matchNumber === matchNumber
      );
      const winner = matchInStructure?.winner;

      // Accumulate wagers
      for (const bet of matchBets) {
        wageredByUser.set(bet.userId, (wageredByUser.get(bet.userId) ?? 0) + bet.amount);
      }

      // Accumulate payouts only for completed matches (winner known)
      if (winner) {
        const payouts = computeMatchPayouts(matchBets, winner);
        for (const [userId, payout] of payouts) {
          receivedByUser.set(userId, (receivedByUser.get(userId) ?? 0) + payout);
        }
      }
    }

    // Build stats for each bettor
    for (const [userId, totalWagered] of wageredByUser) {
      const totalReceived = receivedByUser.get(userId) ?? 0;
      const netProfit = totalReceived - totalWagered;

      const userObj = users?.find(u => u.id === userId);
      const username = userObj?.username ?? `User #${userId}`;

      playerStats.push({ userId, username, totalWagered, totalReceived, netProfit });
    }

    // Sort by net profit descending
    playerStats.sort((a, b) => b.netProfit - a.netProfit);
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <h1 className="text-3xl font-bold">{bracket.name} - Results</h1>

      <div className="grid md:grid-cols-2 gap-8">
        <Card className="bg-gamba-card border-2 border-gamba-navy rounded-gamba shadow-gamba">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Trophy className="mr-2 h-6 w-6 text-gamba-yellow" />
              Champion
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-4xl font-bold mb-2">{champion}</div>
            <div className="text-muted-foreground">Tournament Winner</div>
          </CardContent>
        </Card>

        <Card className="bg-gamba-card border-2 border-gamba-navy rounded-gamba shadow-gamba">
          <CardHeader>
            <CardTitle>Leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead>Wagered</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Net Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {playerStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No bets placed
                    </TableCell>
                  </TableRow>
                ) : (
                  playerStats.map((player, index) => (
                    <TableRow key={player.userId}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{player.username}</TableCell>
                      <TableCell>{player.totalWagered}</TableCell>
                      <TableCell>{player.totalReceived}</TableCell>
                      <TableCell className={player.netProfit >= 0 ? "text-gamba-green font-bold" : "text-gamba-red font-bold"}>
                        {player.netProfit >= 0 ? "+" : ""}{player.netProfit}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gamba-card border-2 border-gamba-navy rounded-gamba shadow-gamba">
        <CardHeader>
          <CardTitle>Final Bracket</CardTitle>
        </CardHeader>
        <CardContent>
          <BracketViewer
            matches={structure}
            isCreator={false}
          />
        </CardContent>
      </Card>
    </div>
  );
}
