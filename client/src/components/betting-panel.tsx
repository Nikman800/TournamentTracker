import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Bracket, Match, Bet } from "@shared/schema";

interface BettingPanelProps {
  bracket: Bracket & { userBracketBalance?: number };
  userCurrency: number;
  currentBet?: Bet;
}

export function BettingPanel({ bracket, userCurrency, currentBet }: BettingPanelProps) {
  const [amount, setAmount] = useState(currentBet?.amount?.toString() || "");
  const [selected, setSelected] = useState(currentBet?.selectedWinner || "");
  const { toast } = useToast();

  const placeBetMutation = useMutation({
    mutationFn: async () => {
      if (currentBet) {
        throw new Error("You have already placed a bet for this match");
      }
      const betData = {
        amount: parseInt(amount),
        selectedWinner: selected,
        round: bracket.currentRound,
        bracketId: bracket.id // Explicitly include bracketId
      };
      console.log("Placing bet with data:", betData);
      const res = await apiRequest("POST", `/api/brackets/${bracket.id}/bets`, betData);
      return res.json();
    },
    onSuccess: () => {
      if (bracket.useIndependentCredits) {
        queryClient.invalidateQueries({ queryKey: [`/api/brackets/${bracket.id}`] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      }
      toast({
        title: "Bet placed successfully",
        description: `You bet ${amount} credits on ${selected}`,
      });
      setAmount("");
      setSelected("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to place bet",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (bracket.status !== "active" || bracket.phase !== "betting") {
    return (
      <div className="p-4 bg-muted rounded-lg">
        <p className="text-center text-muted-foreground">
          {bracket.status !== "active"
            ? "Betting is not available at this time"
            : "Betting phase has ended for this round"}
        </p>
      </div>
    );
  }

  const availableCredits = bracket.useIndependentCredits
    ? bracket.userBracketBalance ?? 0
    : userCurrency;

  // Get current matches for the round
  const structure = JSON.parse(bracket.structure as string) as Match[];
  const currentMatch = structure.find(
    (match) => match.round === bracket.currentRound && !match.winner
  );

  if (!currentMatch) {
    return (
      <div className="p-4 bg-muted rounded-lg">
        <p className="text-center text-muted-foreground">
          No active matches available for betting
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg space-y-4">
      <h3 className="font-semibold">
        {currentBet ? "Your Current Bet" : "Place Your Bet"}
      </h3>
      <p className="text-sm text-muted-foreground">
        Available credits: {availableCredits}
        {bracket.useIndependentCredits && " (bracket credits)"}
      </p>

      {currentBet && (
        <div className="p-4 bg-muted rounded-lg mb-4">
          <p>
            You bet {currentBet.amount} credits on {currentBet.selectedWinner}
          </p>
        </div>
      )}

      {!currentBet && (
        <div className="space-y-2">
          <Input
            type="number"
            placeholder="Bet amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={1}
            max={availableCredits}
          />

          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger>
              <SelectValue placeholder="Select winner" />
            </SelectTrigger>
            <SelectContent>
              {currentMatch.player1 && (
                <SelectItem value={currentMatch.player1}>
                  {currentMatch.player1}
                </SelectItem>
              )}
              {currentMatch.player2 && (
                <SelectItem value={currentMatch.player2}>
                  {currentMatch.player2}
                </SelectItem>
              )}
            </SelectContent>
          </Select>

          <Button
            className="w-full"
            disabled={!amount || !selected || placeBetMutation.isPending}
            onClick={() => placeBetMutation.mutate()}
          >
            Place Bet
          </Button>
        </div>
      )}
    </div>
  );
}