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
import { z } from "zod";

const createBracketSchema = z.object({
  name: z.string().min(1, "Tournament name is required"),
  players: z.string().min(1, "Enter at least one player name"),
  isPublic: z.boolean(),
  accessCode: z.string().optional(),
  startingCredits: z.number().min(1).optional(),
  useIndependentCredits: z.boolean().optional(),
});

type FormData = z.infer<typeof createBracketSchema>;

export default function BracketCreate() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const form = useForm<FormData>({
    resolver: zodResolver(createBracketSchema),
    defaultValues: {
      name: "",
      isPublic: true,
      accessCode: "",
      players: "",
      startingCredits: 1000,
      useIndependentCredits: false,
    },
  });

  const createBracketMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Convert players string to array and generate bracket structure
      const players = data.players.split(",").map((p) => p.trim()).filter(Boolean);
      const structure = generateBracketStructure(players);

      // Only include necessary fields based on whether it's public or private
      const bracketData = {
        name: data.name,
        isPublic: data.isPublic,
        structure: JSON.stringify(structure),
        status: "pending", // Explicitly set initial status
        ...(data.isPublic ? {} : {
          accessCode: data.accessCode,
          startingCredits: data.useIndependentCredits ? data.startingCredits : null,
          useIndependentCredits: data.useIndependentCredits,
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

      // Prefetch and cache the new bracket data
      await queryClient.prefetchQuery({
        queryKey: [`/api/brackets/${bracket.id}`],
        queryFn: async () => {
          const res = await apiRequest("GET", `/api/brackets/${bracket.id}`);
          return res.json();
        },
      });

      // Update the brackets list in the cache
      queryClient.invalidateQueries({ queryKey: ["/api/brackets"] });

      toast({
        title: "Tournament bracket created!",
        description: "You can now start managing your tournament.",
      });

      // Navigate to the new bracket page
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
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6"
            >
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
                    <FormLabel>Players</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter player names, separated by commas"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Enter player names separated by commas (e.g., "Player 1, Player 2, Player 3")
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
                            Players will start with a fixed amount of credits specific to this tournament
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
  // Ensure number of players is a power of 2 by adding byes
  const totalPlayers = Math.pow(2, Math.ceil(Math.log2(players.length)));
  const filledPlayers = [
    ...players,
    ...Array(totalPlayers - players.length).fill("BYE"),
  ];

  const matches = [];
  let round = 0;
  let position = 0;

  // Generate first round matches
  for (let i = 0; i < filledPlayers.length; i += 2) {
    matches.push({
      round,
      position: position++,
      player1: filledPlayers[i],
      player2: filledPlayers[i + 1],
      winner: filledPlayers[i + 1] === "BYE" ? filledPlayers[i] : null,
    });
  }

  // Generate subsequent empty matches
  const totalRounds = Math.log2(totalPlayers);
  for (let r = 1; r < totalRounds; r++) {
    position = 0;
    const matchesInRound = totalPlayers / Math.pow(2, r + 1);
    for (let m = 0; m < matchesInRound; m++) {
      matches.push({
        round: r,
        position: position++,
        player1: null,
        player2: null,
        winner: null,
      });
    }
  }

  return matches;
}