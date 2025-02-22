import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { BracketViewer } from "@/components/bracket-viewer";
import { BettingPanel } from "@/components/betting-panel";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Bracket, Match, Bet } from "@shared/schema";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export default function BracketPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  console.log("Rendering BracketPage with id:", id);
  
  const { data: bracket, isLoading: bracketLoading, error } = useQuery<Bracket>({
    queryKey: [`/api/brackets/${id}`],
    queryFn: async () => {
      console.log("Fetching bracket data for id:", id);
      const res = await apiRequest("GET", `/api/brackets/${id}`);
      const data = await res.json();
      console.log("Received bracket data:", data);
      return data;
    },
    enabled: !!id,
    staleTime: 0,
    retry: 1,
  });

  console.log("Query state:", { isLoading: bracketLoading, error, bracket });

  const { data: bets, isLoading: betsLoading } = useQuery<Bet[]>({
    queryKey: [`/api/brackets/${id}/bets`],
    enabled: !!id && !!bracket,
    staleTime: 0,
  });

  const updateMatchMutation = useMutation({
    mutationFn: async (winner: string) => {
      if (!bracket || !selectedMatch) return;
      const structure = JSON.parse(bracket.structure as string) as Match[];
      const updatedStructure = structure.map((match) =>
        match.id === selectedMatch.id ? { ...match, winner } : match
      );

      await apiRequest("PATCH", `/api/brackets/${id}`, {
        structure: JSON.stringify(updatedStructure),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/brackets/${id}`] });
      setSelectedMatch(null);
    },
  });

  if (bracketLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!bracket) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-muted-foreground">
          Bracket not found or you don't have access to it. Please try refreshing the page.
        </div>
      </div>
    );
  }

  const isCreator = bracket.creatorId === user?.id;

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">{bracket.name}</h1>
          <p className="text-muted-foreground">
            Status: <span className="capitalize">{bracket.status}</span>
          </p>
        </div>
        {isCreator && bracket.status === "pending" && (
          <Button
            onClick={async () => {
              await apiRequest("PATCH", `/api/brackets/${id}`, {
                status: "active",
              });
              queryClient.invalidateQueries({ queryKey: [`/api/brackets/${id}`] });
            }}
          >
            Start Tournament
          </Button>
        )}
      </div>

      <div className="grid md:grid-cols-[1fr,300px] gap-8">
        <BracketViewer
          matches={JSON.parse(bracket.structure as string)}
          onMatchClick={setSelectedMatch}
          isCreator={isCreator}
        />

        <div className="space-y-8">
          <BettingPanel bracket={bracket} userCurrency={user?.virtualCurrency!} />

          <div className="p-4 border rounded-lg">
            <h3 className="font-semibold mb-4">Current Bets</h3>
            <div className="space-y-2">
              {bets?.map((bet) => (
                <div
                  key={bet.id}
                  className="flex justify-between text-sm p-2 bg-muted rounded"
                >
                  <span>{bet.selectedWinner}</span>
                  <span>{bet.amount} credits</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!selectedMatch} onOpenChange={() => setSelectedMatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Winner</DialogTitle>
          </DialogHeader>
          <RadioGroup
            onValueChange={(value) => updateMatchMutation.mutate(value)}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value={selectedMatch?.player1 || ""} />
              <Label>{selectedMatch?.player1}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value={selectedMatch?.player2 || ""} />
              <Label>{selectedMatch?.player2}</Label>
            </div>
          </RadioGroup>
        </DialogContent>
      </Dialog>
    </div>
  );
}