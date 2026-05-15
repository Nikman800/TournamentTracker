import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { Plus, Trophy, CoinsIcon } from "lucide-react";
import type { Bracket } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
  round_robin: "Round Robin",
  group_stage: "Group Stage",
};

function JoinBracketForm() {
  const [bracketId, setBracketId] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const { toast } = useToast();

  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/brackets/${bracketId}/join`, { accessCode });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to join bracket");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brackets"] });
      setBracketId("");
      setAccessCode("");
      setError("");
      toast({ title: "Joined bracket!", description: "The bracket now appears in your list." });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  return (
    <div className="mb-6 p-4 border rounded-lg">
      <h3 className="font-semibold mb-3">Join a Private Bracket</h3>
      <div className="flex gap-2 items-end flex-wrap">
        <div>
          <label className="text-sm text-muted-foreground block mb-1">Bracket ID</label>
          <Input
            type="number"
            placeholder="ID"
            value={bracketId}
            onChange={(e) => setBracketId(e.target.value)}
            className="w-24"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-1">Access Code</label>
          <Input
            type="text"
            placeholder="Access code"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            className="w-40"
          />
        </div>
        <Button
          onClick={() => joinMutation.mutate()}
          disabled={!bracketId || !accessCode || joinMutation.isPending}
        >
          Join
        </Button>
      </div>
      {error && <p className="text-sm text-destructive mt-2">{error}</p>}
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: brackets } = useQuery<Bracket[]>({
    queryKey: ["/api/brackets"],
  });

  const claimBonusMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/claim-daily-bonus");
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/user"], user);
      toast({
        title: "Daily Bonus Claimed!",
        description: "You received 100 credits.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't claim bonus",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!brackets) return null;

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">Tournament Brackets</h1>
          <div className="flex items-center gap-4">
            <p className="text-muted-foreground">
              Welcome back, {user?.username}! You have {user?.virtualCurrency}{" "}
              credits.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => claimBonusMutation.mutate()}
              disabled={claimBonusMutation.isPending}
            >
              <CoinsIcon className="mr-2 h-4 w-4" />
              Claim Daily Bonus
            </Button>
          </div>
        </div>
        <Button asChild>
          <Link href="/brackets/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Bracket
          </Link>
        </Button>
      </div>

      <JoinBracketForm />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {brackets.map((bracket) => (
          <Link key={bracket.id} href={`/brackets/${bracket.id}`}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer bg-gamba-card border-2 border-gamba-navy rounded-gamba shadow-gamba">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  {bracket.name}
                </CardTitle>
                <CardDescription>
                  Created by {bracket.creatorId === user?.id ? "you" : "others"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  Status:{" "}
                  <span className="capitalize font-medium">{bracket.status}</span>
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {FORMAT_LABELS[bracket.bracketFormat ?? "single_elimination"] ?? bracket.bracketFormat}
                </p>
                {!bracket.isPublic && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Private bracket
                    {bracket.useIndependentCredits &&
                      ` • ${bracket.startingCredits} starting credits`}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}