import { Match } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";

interface BracketViewerProps {
  matches: Match[];
  onMatchClick?: (match: Match) => void;
  isCreator: boolean;
}

export function BracketViewer({
  matches,
  onMatchClick,
  isCreator,
}: BracketViewerProps) {
  const rounds = matches.reduce((acc, match) => {
    if (!acc[match.round]) acc[match.round] = [];
    acc[match.round][match.position] = match;
    return acc;
  }, {} as Record<number, Match[]>);

  return (
    <div className="flex gap-8 p-4 overflow-x-auto">
      {Object.entries(rounds).map(([round, matches]) => (
        <div key={round} className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-center">
            Round {parseInt(round) + 1}
          </h3>
          <div className="flex flex-col gap-8">
            {matches.map((match) => (
              <Card
                key={match.id}
                className={`w-48 ${
                  isCreator && !match.winner ? "cursor-pointer" : ""
                }`}
                onClick={() => isCreator && onMatchClick?.(match)}
              >
                <CardContent className="p-4">
                  <div
                    className={`mb-2 p-2 rounded ${
                      match.winner === match.player1
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {match.player1 || "TBD"}
                  </div>
                  <div
                    className={`p-2 rounded ${
                      match.winner === match.player2
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {match.player2 || "TBD"}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
