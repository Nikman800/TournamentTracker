import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBracketSchema } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { z } from "zod";
import { useState } from "react";
import { X } from "lucide-react";

const createBracketSchema = z.object({
  name: z.string().min(1, "Tournament name is required"),
  players: z.string().min(1, "Enter at least one player name"),
  isPublic: z.boolean(),
  accessCode: z.string().optional(),
  startingCredits: z.number().min(1).optional(),
  useIndependentCredits: z.boolean().optional(),
  adminCanBet: z.boolean().optional(),
});

type FormData = z.infer<typeof createBracketSchema>;

export default function BracketCreate() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [participants, setParticipants] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");

  const form = useForm<FormData>({
    resolver: zodResolver(createBracketSchema),
    defaultValues: {
      name: "",
      isPublic: true,
      accessCode: "",
      players: "",
      startingCredits: 1000,
      useIndependentCredits: false,
      adminCanBet: false,
    },
  });

  const createBracketMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Use participants array if available, otherwise fall back to comma-separated string
      const players = participants.length > 0 
        ? participants 
        : data.players.split(",").map((p) => p.trim()).filter(Boolean);
      const structure = generateBracketStructure(players);

      const bracketData = {
        name: data.name,
        isPublic: data.isPublic,
        structure: JSON.stringify(structure),
        status: "pending", // Explicitly set initial status
        ...(data.isPublic ? {} : {
          accessCode: data.accessCode,
          startingCredits: data.useIndependentCredits ? data.startingCredits : null,
          useIndependentCredits: data.useIndependentCredits,
          adminCanBet: data.useIndependentCredits ? data.adminCanBet : false,
        }),
      };

      console.log("Creating bracket with data:", bracketData);
      const res = await apiRequest("POST", "/api/brackets", bracketData);
      const bracket = await res.json();
      console.log("Created bracket:", bracket);
      return bracket;
    },
    onSuccess: async (bracket) => {
      console.log("Successfully created bracket:", bracket);

      await queryClient.prefetchQuery({
        queryKey: [`/api/brackets/${bracket.id}`],
        queryFn: async () => {
          const res = await apiRequest("GET", `/api/brackets/${bracket.id}`);
          return res.json();
        },
      });

      queryClient.invalidateQueries({ queryKey: ["/api/brackets"] });

      toast({
        title: "Tournament bracket created!",
        description: "You can now start managing your tournament.",
      });

      setLocation(`/brackets/${bracket.id}`);
    },
    onError: (error: Error) => {
      console.error("Failed to create bracket:", error);
      toast({
        title: "Failed to create bracket",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: FormData) => {
    if (participants.length === 0) {
      form.setError("players", {
        type: "manual",
        message: "Enter at least one tournament participant",
      });
      return;
    }
    try {
      await createBracketMutation.mutateAsync(data);
    } catch (error) {
      console.error("Submission error:", error);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Create Tournament Bracket</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tournament Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter tournament name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="players"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tournament participants</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2 min-h-[2.5rem] p-2 border border-input rounded-md bg-background">
                          {participants.map((participant, index) => (
                            <Badge
                              key={index}
                              variant="secondary"
                              className="flex items-center gap-1 pr-1"
                            >
                              {participant}
                              <button
                                type="button"
                                onClick={() => {
                                  const newParticipants = participants.filter((_, i) => i !== index);
                                  setParticipants(newParticipants);
                                  field.onChange(newParticipants.join(", "));
                                }}
                                className="ml-1 rounded-full hover:bg-destructive/20 focus:outline-none focus:ring-2 focus:ring-ring"
                                aria-label={`Remove ${participant}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                          <Input
                            placeholder={participants.length === 0 ? "Enter participant name and press Enter" : ""}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && inputValue.trim()) {
                                e.preventDefault();
                                const trimmedValue = inputValue.trim();
                                if (!participants.includes(trimmedValue)) {
                                  const newParticipants = [...participants, trimmedValue];
                                  setParticipants(newParticipants);
                                  field.onChange(newParticipants.join(", "));
                                  setInputValue("");
                                } else {
                                  toast({
                                    title: "Duplicate participant",
                                    description: "This participant has already been added.",
                                    variant: "destructive",
                                  });
                                }
                              }
                            }}
                            className="flex-1 min-w-[200px] border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Enter participant names one at a time and press Enter to add them to the list
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isPublic"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Public Tournament</FormLabel>
                      <FormDescription>
                        Anyone can view and bet on public tournaments
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {!form.watch("isPublic") && (
                <>
                  <FormField
                    control={form.control}
                    name="accessCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Access Code</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="Enter access code for private tournament"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Required for private tournaments
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="useIndependentCredits"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>Use Independent Credits</FormLabel>
                          <FormDescription>
                            Participants will start with a fixed amount of credits specific to this tournament
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value || false}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {form.watch("useIndependentCredits") && (
                    <>
                      <FormField
                        control={form.control}
                        name="startingCredits"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Starting Credits</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="Enter starting credits amount"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormDescription>
                              Amount of credits each player starts with
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="adminCanBet"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel>Allow Admin Betting</FormLabel>
                              <FormDescription>
                                Enable the tournament creator to place bets using bracket credits
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value || false}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={createBracketMutation.isPending}
              >
                Create Tournament
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

function generateBracketStructure(players: string[]) {
  if (players.length === 0) return [];
  
  const numPlayers = players.length;
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(numPlayers)));
  const numByes = bracketSize - numPlayers;
  
  // Calculate: how many players compete in round 0 vs get byes
  // General logic works for any number of participants:
  // - Round up to next power of 2 to get bracket size
  // - Calculate byes needed (bracketSize - numPlayers)
  // - Players without byes compete in round 0
  // - Players with byes skip to round 1
  const playersCompetingInRound0 = numPlayers - numByes; // Must be even
  const firstRoundMatches = playersCompetingInRound0 / 2;
  
  const matches = [];
  let matchNumber = 1;
  
  // Round 0: Only players who compete (no byes)
  // Creates matches for pairs of competing players
  for (let i = 0; i < firstRoundMatches; i++) {
    matches.push({
      round: 0,
      position: i,
      player1: players[i * 2],
      player2: players[i * 2 + 1],
      winner: null,
      matchNumber: matchNumber++,
    });
  }
  
  // Round 1: Winners from round 0 matches + players with byes
  // Round 1 always has bracketSize / 4 matches (half the bracket size)
  const round1MatchCount = bracketSize / 4;
  
  // Get the bye recipients (players who skipped round 0)
  const byeRecipients = players.slice(playersCompetingInRound0);
  
  // Round 1 needs to pair:
  // 1. Winners from Round 0 matches with bye recipients
  // 2. Remaining bye recipients with each other
  // Total players in Round 1 = firstRoundMatches (winners) + numByes (bye recipients)
  
  let byeIndex = 0; // Track which bye recipient we're placing
  
  for (let i = 0; i < round1MatchCount; i++) {
    let player1 = null;
    let player2 = null;
    
    // First, pair Round 0 winners with bye recipients
    if (i < firstRoundMatches && byeIndex < byeRecipients.length) {
      // This match gets: bye recipient vs winner from Round 0 match at position i
      player1 = byeRecipients[byeIndex++];
      // player2 will be filled by winner from Round 0 match at position i
    } else if (byeIndex < byeRecipients.length) {
      // All Round 0 winners have been paired, now pair remaining bye recipients
      // Pair bye recipients with each other
      if (byeIndex < byeRecipients.length) {
        player1 = byeRecipients[byeIndex++];
      }
      if (byeIndex < byeRecipients.length) {
        player2 = byeRecipients[byeIndex++];
      }
    } else {
      // All bye recipients placed, remaining matches get two Round 0 winners
      // (This case shouldn't happen with proper bracket math, but handle it)
      // Both slots will be filled by Round 0 winners
    }
    
    matches.push({
      round: 1,
      position: i,
      player1: player1,
      player2: player2,
      winner: null,
      matchNumber: matchNumber++,
    });
  }
  
  // Subsequent rounds: standard elimination (each round halves the field)
  // Round 2: 2 winners from round 1 → 1 final match
  const totalRounds = Math.log2(bracketSize);
  for (let r = 2; r < totalRounds; r++) {
    const matchesInRound = bracketSize / Math.pow(2, r + 1);
    for (let m = 0; m < matchesInRound; m++) {
      matches.push({
        round: r,
        position: m,
        player1: null,
        player2: null,
        winner: null,
        matchNumber: matchNumber++,
      });
    }
  }

  return matches;
}