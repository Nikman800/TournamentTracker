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

  // Show all rounds from the start, even if empty
  const allRounds = Object.entries(rounds).sort(([a], [b]) => parseInt(a) - parseInt(b));

  return (
    <div className="flex gap-8 p-4 overflow-x-auto">
      {allRounds.map(([round, matches]) => (
        <div key={round} className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-center">
            {parseInt(round) === 0 ? "First Round" : 
             parseInt(round) === allRounds.length - 1 ? "Final" : 
             `Round ${parseInt(round) + 1}`}
          </h3>
          <div className="flex flex-col gap-8">
            {matches.map((match) => (
              <Card
                key={match.matchNumber}
                className={`w-48 ${
                  isCreator && !match.winner && match.player1 && match.player2 ? "cursor-pointer hover:shadow-md transition-shadow" : ""
                }`}
                onClick={() => isCreator && match.player1 && match.player2 && onMatchClick?.(match)}
              >
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground mb-2 text-center">
                    Match {match.matchNumber}
                  </div>
                  <div
                    className={`mb-2 p-2 rounded ${
                      match.winner === match.player1
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "bg-muted"
                    }`}
                  >
                    {match.player1 || "TBD"}
                  </div>
                  <div className="text-center text-xs text-muted-foreground my-1">vs</div>
                  <div
                    className={`p-2 rounded ${
                      match.winner === match.player2
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "bg-muted"
                    }`}
                  >
                    {match.player2 || "TBD"}
                  </div>
                  {match.winner && (
                    <div className="mt-2 text-xs text-center text-primary font-semibold">
                      Winner: {match.winner}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
