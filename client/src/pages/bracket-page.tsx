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

  function getCurrentMatch(bracket: Bracket): Match | null {
    if (!bracket.structure) return null;

    const structure = JSON.parse(bracket.structure as string) as Match[];
    const currentMatch = structure.find(
      (match) =>
        match.round === bracket.currentRound &&
        match.player1 &&
        match.player2 &&
        !match.winner
    );

    if (currentMatch) {
      const matchNumber = structure.filter(
        (m) => m.round === bracket.currentRound && m.position <= currentMatch.position
      ).length;
      currentMatch.matchNumber = matchNumber;
      return currentMatch;
    }
    return null;
  }

  function getLastCompletedMatch(bracket: Bracket): Match | null {
    if (!bracket.structure) return null;

    const structure = JSON.parse(bracket.structure as string) as Match[];
    const lastMatch = structure.find(
      (match) => match.round === bracket.currentRound && match.winner
    );

    if (lastMatch) {
      const matchNumber = structure.filter(
        (m) => m.round === bracket.currentRound && m.position <= lastMatch.position
      ).length;
      lastMatch.matchNumber = matchNumber;
      return lastMatch;
    }
    return null;
  }

  const updateMatchMutation = useMutation({
    mutationFn: async (winner: string) => {
      if (!bracket || !selectedMatch) return;
      const structure = JSON.parse(bracket.structure as string) as Match[];
      const updatedStructure = structure.map((match) =>
        match.round === bracket.currentRound && match.position === selectedMatch.position
          ? { ...match, winner }
          : match
      );

      const res = await apiRequest("PATCH", `/api/brackets/${id}`, {
        structure: JSON.stringify(updatedStructure),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/brackets/${id}`] });
      setSelectedMatch(null);
      toast({
        title: "Winner Selected",
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

  const updatePhaseMutation = useMutation({
    mutationFn: async (phase: string) => {
      const res = await apiRequest("PATCH", `/api/brackets/${id}`, { phase });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/brackets/${id}`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Update Phase",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: bracket, isLoading: bracketLoading } = useQuery<Bracket>({
    queryKey: [`/api/brackets/${id}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/brackets/${id}`);
      return res.json();
    },
    enabled: !!id,
    staleTime: 0,
  });

  const { data: bets } = useQuery<Bet[]>({
    queryKey: [`/api/brackets/${id}/bets`],
    enabled: !!id && !!bracket && bracket.status === "active",
    staleTime: 0,
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
          Bracket not found or you don't have access to it.
        </div>
      </div>
    );
  }

  const isCreator = bracket.creatorId === user?.id;
  const currentMatch = getCurrentMatch(bracket);
  const lastCompletedMatch = getLastCompletedMatch(bracket);
  const matchNumber = currentMatch?.matchNumber || lastCompletedMatch?.matchNumber;

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">{bracket.name}</h1>
          <p className="text-muted-foreground">
            Status: <span className="capitalize">{bracket.status}</span>
            {bracket.status === "active" && bracket.phase && (
              <>
                {" "}
                • Match {matchNumber} • {bracket.phase} phase
              </>
            )}
          </p>
        </div>

        {isCreator && bracket.status === "pending" && (
          <Button onClick={() => updateStatusMutation.mutate("waiting")}>
            Open Bracket
          </Button>
        )}
        {isCreator && bracket.status === "waiting" && (
          <Button onClick={() => updateStatusMutation.mutate("active")}>
            Start Tournament
          </Button>
        )}
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
              lastCompletedMatch && (
                <Button
                  onClick={() => updatePhaseMutation.mutate("betting")}
                  disabled={updatePhaseMutation.isPending}
                >
                  Start Next Match
                </Button>
              )
            )}
          </div>
        )}
      </div>

      {bracket.status === "active" && (
        <div className="mb-8 p-4 border rounded-lg">
          <h2 className="text-lg font-semibold mb-4">Match {matchNumber}</h2>
          {(() => {
            if (bracket.phase === "game" && lastCompletedMatch?.winner) {
              return (
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-lg font-semibold mb-2">Winner</p>
                  <p className="text-2xl text-primary">{lastCompletedMatch.winner}</p>
                </div>
              );
            }

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
                  if (
                    currentMatch &&
                    match.round === currentMatch.round &&
                    match.position === currentMatch.position &&
                    !match.winner
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
              {bracket.phase === "betting" && currentMatch && (
                <BettingPanel
                  bracket={bracket}
                  userCurrency={user?.virtualCurrency!}
                  currentBet={bets?.find(
                    (bet) =>
                      bet.userId === user?.id && bet.round === bracket.currentRound
                  )}
                />
              )}
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-4">Current Bets</h3>
                <div className="space-y-2">
                  {bets
                    ?.filter((bet) => bet.round === bracket.currentRound)
                    .map((bet) => (
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

      {/* Winner selection dialog */}
      <Dialog open={!!selectedMatch} onOpenChange={() => setSelectedMatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Winner</DialogTitle>
            <DialogDescription>Choose the winner for this match:</DialogDescription>
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