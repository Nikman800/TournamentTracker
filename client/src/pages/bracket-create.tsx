import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  generateSingleElim,
  generateDoubleElim,
  generateRoundRobin,
  generateGroupStage,
} from "@shared/bracketGenerators";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { z } from "zod";
import { useState } from "react";
import { X } from "lucide-react";

const FORMAT_LIMITS: Record<string, { min: number; max: number }> = {
  single_elimination: { min: 2, max: 64 },
  double_elimination: { min: 4, max: 32 },
  round_robin: { min: 3, max: 16 },
  group_stage: { min: 4, max: 32 },
};

const createBracketSchema = z.object({
  name: z.string().min(1, "Tournament name is required"),
  players: z.string().min(1, "Enter at least one player name"),
  isPublic: z.boolean(),
  accessCode: z.string().optional(),
  startingCredits: z.number().min(1).optional(),
  useIndependentCredits: z.boolean().optional(),
  adminCanBet: z.boolean().optional(),
  bracketFormat: z.enum(["single_elimination", "double_elimination", "round_robin", "group_stage"]).default("single_elimination"),
  numGroups: z.number().min(2).max(8).default(2),
  advanceCount: z.number().min(1).max(2).default(1),
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
      bracketFormat: "single_elimination",
      numGroups: 2,
      advanceCount: 1,
    },
  });

  const bracketFormat = form.watch("bracketFormat");

  const createBracketMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const players =
        participants.length > 0
          ? participants
          : data.players.split(",").map((p) => p.trim()).filter(Boolean);

      let structure;
      if (data.bracketFormat === "double_elimination") {
        structure = generateDoubleElim(players);
      } else if (data.bracketFormat === "round_robin") {
        structure = generateRoundRobin(players);
      } else if (data.bracketFormat === "group_stage") {
        structure = generateGroupStage(players, data.numGroups, data.advanceCount);
      } else {
        structure = generateSingleElim(players);
      }

      const bracketData: Record<string, unknown> = {
        name: data.name,
        isPublic: data.isPublic,
        structure: JSON.stringify(structure),
        bracketFormat: data.bracketFormat,
        status: "pending",
        ...(data.bracketFormat === "group_stage"
          ? { numGroups: data.numGroups, advanceCount: data.advanceCount }
          : {}),
        ...(!data.isPublic
          ? {
              accessCode: data.accessCode,
              startingCredits: data.useIndependentCredits ? data.startingCredits : null,
              useIndependentCredits: data.useIndependentCredits,
              adminCanBet: data.useIndependentCredits ? data.adminCanBet : false,
            }
          : {}),
      };

      const res = await apiRequest("POST", "/api/brackets", bracketData);
      const bracket = await res.json();
      return bracket;
    },
    onSuccess: async (bracket) => {
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

    const limits = FORMAT_LIMITS[data.bracketFormat];
    if (participants.length < limits.min || participants.length > limits.max) {
      form.setError("players", {
        type: "manual",
        message: `${data.bracketFormat.replace(/_/g, " ")} requires between ${limits.min} and ${limits.max} participants. You have ${participants.length}.`,
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
      <Card className="max-w-2xl mx-auto bg-gamba-card border-2 border-gamba-navy rounded-gamba shadow-gamba">
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

              {/* Format selector */}
              <FormField
                control={form.control}
                name="bracketFormat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bracket Format</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a format" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="single_elimination">Single Elimination</SelectItem>
                        <SelectItem value="double_elimination">Double Elimination</SelectItem>
                        <SelectItem value="round_robin">Round Robin</SelectItem>
                        <SelectItem value="group_stage">Group Stage</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {bracketFormat === "single_elimination" && "2–64 participants"}
                      {bracketFormat === "double_elimination" && "4–32 participants"}
                      {bracketFormat === "round_robin" && "3–16 participants"}
                      {bracketFormat === "group_stage" && "4–32 participants"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Group stage options */}
              {bracketFormat === "group_stage" && (
                <>
                  <FormField
                    control={form.control}
                    name="numGroups"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Number of Groups</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(Number(v))}
                          defaultValue={String(field.value)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="advanceCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Participants Advancing per Group</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(Number(v))}
                          defaultValue={String(field.value)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1">1</SelectItem>
                            <SelectItem value="2">2</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

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
                            placeholder={
                              participants.length === 0
                                ? "Enter participant name and press Enter"
                                : ""
                            }
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
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
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
                        <FormDescription>Required for private tournaments</FormDescription>
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
                            Participants will start with a fixed amount of credits specific to this
                            tournament
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
                className="w-full bg-gamba-navy text-white border-2 border-gamba-navy shadow-gamba hover:translate-x-px hover:translate-y-px hover:shadow-none"
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
