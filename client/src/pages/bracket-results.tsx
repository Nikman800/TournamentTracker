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
  startingBalance: number;
  finalBalance: number;
  profit: number;
  profitPercentage: number;
};

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

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users");
      return res.json();
    },
  });

  if (bracketLoading || betsLoading || usersLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!bracket) {
    return <div>Bracket not found</div>;
  }

  // Get the champion (winner of the final match)
  const structure = JSON.parse(bracket.structure as string) as Match[];
  const totalRounds = Math.max(...structure.map(m => m.round)) + 1;
  const finalMatch = structure.find(m => m.round === totalRounds - 1);
  const champion = finalMatch?.winner || "Unknown";

  // Calculate player statistics
  const playerStats: PlayerStats[] = [];
  
  if (users && bets) {
    // Get all users who placed bets - using Array.from instead of spread operator
    const bettingUserIds = Array.from(new Set(bets.map(bet => bet.userId)));
    
    bettingUserIds.forEach(userId => {
      const userObj = users.find(u => u.id === userId);
      if (!userObj) return;
      
      // Calculate starting and final balances
      const startingBalance = bracket.useIndependentCredits 
        ? bracket.startingCredits || 1000 
        : 1000; // Default starting balance
      
      // Sum of all winnings for this user
      const userBets = bets.filter(bet => bet.userId === userId);
      const winnings = userBets.reduce((total, bet) => {
        // If bet was on the winner, calculate winnings
        if (bet.selectedWinner === finalMatch?.winner) {
          // Simple calculation - could be more complex based on your betting system
          return total + (bet.amount * 2);
        }
        return total;
      }, 0);
      
      // Calculate final balance and profit
      const finalBalance = startingBalance + winnings;
      const profit = finalBalance - startingBalance;
      const profitPercentage = (profit / startingBalance) * 100;
      
      playerStats.push({
        userId,
        username: userObj.username,
        startingBalance,
        finalBalance,
        profit,
        profitPercentage
      });
    });
  }
  
  // Sort by profit percentage (highest first)
  playerStats.sort((a, b) => b.profitPercentage - a.profitPercentage);

  return (
    <div className="container mx-auto py-8 space-y-8">
      <h1 className="text-3xl font-bold">{bracket.name} - Results</h1>
      
      <div className="grid md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Trophy className="mr-2 h-6 w-6 text-yellow-500" />
              Champion
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-4xl font-bold mb-2">{champion}</div>
            <div className="text-muted-foreground">Tournament Winner</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead>Profit</TableHead>
                  <TableHead>ROI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {playerStats.map((player, index) => (
                  <TableRow key={player.userId}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{player.username}</TableCell>
                    <TableCell>{player.profit > 0 ? '+' : ''}{player.profit}</TableCell>
                    <TableCell>{player.profitPercentage.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
                {playerStats.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">No players placed bets</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      
      <Card>
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
