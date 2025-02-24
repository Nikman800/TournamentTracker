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
  DialogDescription,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function BracketPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  // Update the getCurrentMatch function to find the first unresolved match in the current round
  function getCurrentMatch(bracket: Bracket): Match | null {
    const structure = JSON.parse(bracket.structure as string) as Match[];
    return structure.find(
      (match) => match.round === bracket.currentRound && !match.winner
    ) || null;
  }

  const { data: bracket, isLoading: bracketLoading } = useQuery<Bracket>({
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

  const { data: bets, isLoading: betsLoading } = useQuery<Bet[]>({
    queryKey: [`/api/brackets/${id}/bets`],
    enabled: !!id && !!bracket && bracket.status === "active",
    staleTime: 0,
  });

  const updateMatchMutation = useMutation({
    mutationFn: async (winner: string) => {
      if (!bracket || !selectedMatch) return;
      console.log(`Updating match winner to ${winner}`);
      const structure = JSON.parse(bracket.structure as string) as Match[];
      const updatedStructure = structure.map((match) =>
        match.round === bracket.currentRound && match.position === selectedMatch.position
          ? { ...match, winner }
          : match
      );

      const res = await apiRequest("PATCH", `/api/brackets/${id}`, {
        structure: JSON.stringify(updatedStructure),
      });
      const updatedBracket = await res.json();
      console.log("Match updated, new bracket state:", updatedBracket);
      return updatedBracket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/brackets/${id}`] });
      setSelectedMatch(null);
      toast({
        title: "Winner Updated",
        description: "The match winner has been recorded.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Update Winner",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      console.log(`Updating bracket ${id} status to:`, status);
      const res = await apiRequest("PATCH", `/api/brackets/${id}`, { status });
      const updatedBracket = await res.json();
      console.log("Bracket updated:", updatedBracket);
      return updatedBracket;
    },
    onSuccess: (updatedBracket) => {
      console.log("Status update successful:", updatedBracket);
      queryClient.invalidateQueries({ queryKey: [`/api/brackets/${id}`] });
      toast({
        title: "Tournament Status Updated",
        description: `Tournament is now ${updatedBracket.status}`,
      });
    },
    onError: (error: Error) => {
      console.error("Status update failed:", error);
      toast({
        title: "Failed to Update Status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updatePhaseMutation = useMutation({
    mutationFn: async (phase: string) => {
      console.log(`Updating bracket ${id} phase to:`, phase);
      const res = await apiRequest("PATCH", `/api/brackets/${id}`, { phase });
      const updatedBracket = await res.json();
      console.log("Phase updated:", updatedBracket);
      return updatedBracket;
    },
    onSuccess: (updatedBracket) => {
      console.log("Phase update successful:", updatedBracket);
      queryClient.invalidateQueries({ queryKey: [`/api/brackets/${id}`] });
      toast({
        title: "Phase Updated",
        description: `Now in ${updatedBracket.phase} phase${updatedBracket.phase === "betting" ? ` • Round ${(updatedBracket.currentRound || 0) + 1}` : ""}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Update Phase",
        description: error.message,
        variant: "destructive",
      });
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
            {bracket.status === "active" && (
              <>
                {" "}
                • Round {bracket.currentRound + 1} • {bracket.phase} phase
              </>
            )}
          </p>
        </div>
        {isCreator && bracket.status === "pending" && (
          <Button
            onClick={() => updateStatusMutation.mutate("waiting")}
            disabled={updateStatusMutation.isPending}
          >
            {updateStatusMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Open Bracket
          </Button>
        )}
        {isCreator && bracket.status === "waiting" && (
          <Button
            onClick={() => updateStatusMutation.mutate("active")}
            disabled={updateStatusMutation.isPending}
          >
            {updateStatusMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Start Tournament
          </Button>
        )}
        {/* Update the phase transition button section */}
        {isCreator && bracket.status === "active" && (
          <div className="space-x-2">
            {bracket.phase === "betting" ? (
              <Button
                onClick={() => updatePhaseMutation.mutate("game")}
                disabled={updatePhaseMutation.isPending}
              >
                End Betting Phase
              </Button>
            ) : (
              <Button
                onClick={() => updatePhaseMutation.mutate("betting")}
                disabled={updatePhaseMutation.isPending}
              >
                Start Next Round
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Update the current round display */}
      {bracket.status === "active" && (
        <div className="mb-8 p-4 border rounded-lg">
          <h2 className="text-lg font-semibold mb-4">
            Round {bracket.currentRound + 1} - Current Match
          </h2>
          {(() => {
            const currentMatch = getCurrentMatch(bracket);
            if (!currentMatch) {
              return (
                <p className="text-center text-muted-foreground">
                  All matches in this round are complete
                </p>
              );
            }
            return (
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex-1 text-center">
                  <span
                    className={
                      currentMatch.winner === currentMatch.player1
                        ? "text-primary font-bold"
                        : ""
                    }
                  >
                    {currentMatch.player1}
                  </span>
                </div>
                <div className="mx-4 font-bold">vs</div>
                <div className="flex-1 text-center">
                  <span
                    className={
                      currentMatch.winner === currentMatch.player2
                        ? "text-primary font-bold"
                        : ""
                    }
                  >
                    {currentMatch.player2}
                  </span>
                </div>
                {isCreator &&
                  bracket.phase === "game" &&
                  !currentMatch.winner && (
                    <div className="ml-4">
                      <Button onClick={() => setSelectedMatch(currentMatch)}>
                        Select Winner
                      </Button>
                    </div>
                  )}
              </div>
            );
          })()}
        </div>
      )}

      <div className="grid md:grid-cols-[1fr,300px] gap-8">
        <BracketViewer
          matches={JSON.parse(bracket.structure as string)}
          onMatchClick={
            bracket.status === "active" &&
            bracket.phase === "game" &&
            isCreator
              ? (match) => {
                  const currentMatch = getCurrentMatch(bracket);
                  if (
                    currentMatch &&
                    match.round === currentMatch.round &&
                    match.position === currentMatch.position
                  ) {
                    setSelectedMatch(match);
                  }
                }
              : undefined
          }
          isCreator={isCreator}
        />

        <div className="space-y-8">
          {bracket.status === "waiting" ? (
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-4">Waiting Room</h3>
              <p className="text-sm text-muted-foreground">
                Waiting for the tournament to begin...
              </p>
            </div>
          ) : bracket.status === "active" ? (
            <>
              {bracket.phase === "betting" && (
                <BettingPanel
                  bracket={bracket}
                  userCurrency={user?.virtualCurrency!}
                />
              )}
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
            </>
          ) : (
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-4">Tournament Status</h3>
              <p className="text-sm text-muted-foreground">
                {bracket.status === "pending"
                  ? "Waiting for the admin to open the bracket..."
                  : "Tournament has ended"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Add dialog for winner selection */}
      <Dialog open={!!selectedMatch} onOpenChange={() => setSelectedMatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Winner</DialogTitle>
            <DialogDescription>
              Choose the winner for this match:
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            onValueChange={(value) => updateMatchMutation.mutate(value)}
            defaultValue={selectedMatch?.winner || undefined}
          >
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value={selectedMatch?.player1 || ""} id="player1" />
                <Label htmlFor="player1">{selectedMatch?.player1}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value={selectedMatch?.player2 || ""} id="player2" />
                <Label htmlFor="player2">{selectedMatch?.player2}</Label>
              </div>
            </div>
          </RadioGroup>
        </DialogContent>
      </Dialog>
    </div>
  );
}