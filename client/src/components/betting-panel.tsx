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
import type { Bracket } from "@shared/schema";

interface BettingPanelProps {
  bracket: Bracket;
  userCurrency: number;
}

export function BettingPanel({ bracket, userCurrency }: BettingPanelProps) {
  const [amount, setAmount] = useState("");
  const [selected, setSelected] = useState("");
  const { toast } = useToast();

  const placeBetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/brackets/${bracket.id}/bets`, {
        amount: parseInt(amount),
        selectedWinner: selected,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
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

  if (bracket.status !== "active") {
    return (
      <div className="p-4 bg-muted rounded-lg">
        <p className="text-center text-muted-foreground">
          Betting is not available at this time
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg space-y-4">
      <h3 className="font-semibold">Place Your Bet</h3>
      <p className="text-sm text-muted-foreground">
        Available credits: {userCurrency}
      </p>

      <div className="space-y-2">
        <Input
          type="number"
          placeholder="Bet amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={1}
          max={userCurrency}
        />

        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger>
            <SelectValue placeholder="Select winner" />
          </SelectTrigger>
          <SelectContent>
            {JSON.parse(bracket.structure as string).map(
              (match: any) =>
                match.player1 && (
                  <SelectItem key={match.player1} value={match.player1}>
                    {match.player1}
                  </SelectItem>
                ),
            )}
            {JSON.parse(bracket.structure as string).map(
              (match: any) =>
                match.player2 && (
                  <SelectItem key={match.player2} value={match.player2}>
                    {match.player2}
                  </SelectItem>
                ),
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
    </div>
  );
}
