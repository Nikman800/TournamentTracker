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
import { Link } from "wouter";
import { Plus, Trophy, CoinsIcon } from "lucide-react";
import type { Bracket } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {brackets.map((bracket) => (
          <Link key={bracket.id} href={`/brackets/${bracket.id}`}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
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