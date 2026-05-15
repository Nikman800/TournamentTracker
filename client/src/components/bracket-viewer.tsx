import { Match, Standing } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";

// MatchNode shape (from bracketGenerators) — structure JSON has bracketSection at runtime
type MatchNode = Match & { bracketSection?: string; groupId?: number };

interface BracketViewerProps {
  matches: MatchNode[];
  onMatchClick?: (match: MatchNode) => void;
  isCreator: boolean;
  bracketFormat?: string;
  bracketId?: number;
}

// ─── Match Card ───────────────────────────────────────────────────────────────

function MatchCard({
  match,
  onMatchClick,
  isCreator,
}: {
  match: MatchNode;
  onMatchClick?: (match: MatchNode) => void;
  isCreator: boolean;
}) {
  return (
    <Card
      key={match.matchNumber}
      className={`w-48 bg-gamba-card border-2 border-gamba-navy rounded-gamba shadow-gamba ${
        isCreator && !match.winner && match.player1 && match.player2
          ? "cursor-pointer hover:shadow-none hover:translate-x-px hover:translate-y-px transition-all"
          : ""
      }`}
      onClick={() =>
        isCreator && match.player1 && match.player2 && onMatchClick?.(match)
      }
    >
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground mb-2 text-center">
          Match {match.matchNumber}
        </div>
        <div
          className={`mb-2 p-2 rounded ${
            match.winner === match.player1
              ? "bg-gamba-navy text-white font-semibold"
              : "bg-muted"
          }`}
        >
          {match.player1 || "TBD"}
        </div>
        <div className="text-center text-xs text-muted-foreground my-1">vs</div>
        <div
          className={`p-2 rounded ${
            match.winner === match.player2
              ? "bg-gamba-navy text-white font-semibold"
              : "bg-muted"
          }`}
        >
          {match.player2 || "TBD"}
        </div>
        {match.winner && (
          <div className="mt-2 text-xs text-center text-gamba-green font-bold">
            Winner: {match.winner}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Single Elim Viewer ───────────────────────────────────────────────────────

function SingleElimViewer({
  matches,
  onMatchClick,
  isCreator,
}: {
  matches: MatchNode[];
  onMatchClick?: (match: MatchNode) => void;
  isCreator: boolean;
}) {
  const rounds = matches.reduce((acc, match) => {
    if (!acc[match.round]) acc[match.round] = [];
    acc[match.round][match.position] = match;
    return acc;
  }, {} as Record<number, MatchNode[]>);

  const allRounds = Object.entries(rounds).sort(
    ([a], [b]) => parseInt(a) - parseInt(b)
  );

  return (
    <div className="flex gap-0 p-4 overflow-x-auto items-start">
      {allRounds.map(([round, roundMatches], index) => (
        <div key={round} className="flex items-stretch">
          {/* Round column */}
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-center">
              {parseInt(round) === 0
                ? "First Round"
                : parseInt(round) === allRounds.length - 1
                ? "Final"
                : `Round ${parseInt(round) + 1}`}
            </h3>
            <div className="flex flex-col gap-8">
              {roundMatches.map((match) => (
                <MatchCard
                  key={match.matchNumber}
                  match={match}
                  onMatchClick={onMatchClick}
                  isCreator={isCreator}
                />
              ))}
            </div>
          </div>
          {/* Connector column between rounds */}
          {index < allRounds.length - 1 && (
            <div className="flex flex-col justify-around mt-10" style={{ width: 32 }}>
              {roundMatches.map((match, mi) => (
                <div
                  key={mi}
                  className="flex items-center"
                  style={{ height: `${100 / roundMatches.length}%` }}
                >
                  <div
                    className="w-full h-0.5"
                    style={{
                      backgroundColor: match.winner
                        ? "var(--gamba-yellow, #FFE600)"
                        : "var(--gamba-navy, #1A1A4E)",
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Double Elim Viewer ───────────────────────────────────────────────────────

function DoubleElimViewer({
  matches,
  onMatchClick,
  isCreator,
}: {
  matches: MatchNode[];
  onMatchClick?: (match: MatchNode) => void;
  isCreator: boolean;
}) {
  const winnersMatches = matches.filter((m) => m.bracketSection === "winners");
  const losersMatches = matches.filter((m) => m.bracketSection === "losers");
  const grandFinalMatch = matches.find((m) => m.bracketSection === "grand_final");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-4 border-b pb-2">Winners Bracket</h2>
        <SingleElimViewer
          matches={winnersMatches}
          onMatchClick={onMatchClick}
          isCreator={isCreator}
        />
      </div>
      <div>
        <h2 className="text-xl font-bold mb-4 border-b pb-2">Losers Bracket</h2>
        {losersMatches.length > 0 ? (
          <SingleElimViewer
            matches={losersMatches}
            onMatchClick={onMatchClick}
            isCreator={isCreator}
          />
        ) : (
          <p className="text-muted-foreground text-sm p-4">No losers bracket matches yet.</p>
        )}
      </div>
      <div>
        <h2 className="text-xl font-bold mb-4 border-b pb-2">Grand Final</h2>
        {grandFinalMatch ? (
          <div className="p-4">
            <MatchCard
              match={grandFinalMatch}
              onMatchClick={onMatchClick}
              isCreator={isCreator}
            />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm p-4">Grand final not yet available.</p>
        )}
      </div>
    </div>
  );
}

// ─── Standings Table ──────────────────────────────────────────────────────────

function StandingsTable({ standings }: { standings: Standing[] }) {
  const sorted = [...standings].sort((a, b) => b.points - a.points);
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b">
          <th className="text-left p-2">Rank</th>
          <th className="text-left p-2">Participant</th>
          <th className="text-center p-2">W</th>
          <th className="text-center p-2">L</th>
          <th className="text-center p-2">Pts</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((s, i) => (
          <tr key={s.id} className="border-b hover:bg-muted/50">
            <td className="p-2">{i + 1}</td>
            <td className="p-2">{s.participant}</td>
            <td className="text-center p-2">{s.wins}</td>
            <td className="text-center p-2">{s.losses}</td>
            <td className="text-center p-2 font-semibold">{s.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Round Robin Viewer ───────────────────────────────────────────────────────

function RoundRobinViewer({
  matches,
  onMatchClick,
  isCreator,
  bracketId,
}: {
  matches: MatchNode[];
  onMatchClick?: (match: MatchNode) => void;
  isCreator: boolean;
  bracketId?: number;
}) {
  const { data: standings = [] } = useQuery<Standing[]>({
    queryKey: [`/api/brackets/${bracketId}/standings`],
    enabled: !!bracketId,
  });

  // Group matches by round
  const roundMap = new Map<number, MatchNode[]>();
  for (const m of matches) {
    if (!roundMap.has(m.round)) roundMap.set(m.round, []);
    roundMap.get(m.round)!.push(m);
  }
  const sortedRounds = Array.from(roundMap.entries()).sort(([a], [b]) => a - b);

  return (
    <div className="flex gap-8">
      {/* Left: match list */}
      <div className="flex-1 space-y-4">
        <h2 className="text-xl font-bold">Matches</h2>
        {sortedRounds.map(([round, roundMatches]) => (
          <div key={round}>
            <h3 className="font-semibold text-sm text-muted-foreground mb-2">
              Round {round + 1}
            </h3>
            <div className="space-y-2">
              {roundMatches.map((m) => (
                <div
                  key={m.matchNumber}
                  className={`flex items-center justify-between p-3 rounded border text-sm ${
                    isCreator && !m.winner && m.player1 && m.player2
                      ? "cursor-pointer hover:bg-muted"
                      : ""
                  }`}
                  onClick={() =>
                    isCreator && m.player1 && m.player2 && onMatchClick?.(m)
                  }
                >
                  <span
                    className={
                      m.winner === m.player1 ? "font-bold text-gamba-green" : ""
                    }
                  >
                    {m.player1 || "TBD"}
                  </span>
                  <span className="text-muted-foreground mx-2">vs</span>
                  <span
                    className={
                      m.winner === m.player2 ? "font-bold text-gamba-green" : ""
                    }
                  >
                    {m.player2 || "TBD"}
                  </span>
                  {m.winner && (
                    <span className="ml-4 text-xs text-gamba-green font-semibold">
                      → {m.winner}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Right: standings */}
      <div className="w-72">
        <h2 className="text-xl font-bold mb-4">Standings</h2>
        {standings.length > 0 ? (
          <StandingsTable standings={standings} />
        ) : (
          <p className="text-sm text-muted-foreground">No standings yet.</p>
        )}
      </div>
    </div>
  );
}

// ─── Group Stage Viewer ───────────────────────────────────────────────────────

function GroupStageViewer({
  matches,
  onMatchClick,
  isCreator,
  bracketId,
}: {
  matches: MatchNode[];
  onMatchClick?: (match: MatchNode) => void;
  isCreator: boolean;
  bracketId?: number;
}) {
  const { data: standings = [] } = useQuery<Standing[]>({
    queryKey: [`/api/brackets/${bracketId}/standings`],
    enabled: !!bracketId,
  });

  const groupMatches = matches.filter((m) => m.bracketSection === "group");
  const knockoutMatches = matches.filter((m) => m.bracketSection === "knockout");

  // Determine unique group IDs
  const groupIds = Array.from(
    new Set(groupMatches.map((m) => m.groupId ?? 0))
  ).sort((a, b) => a - b);

  const allGroupComplete =
    groupMatches.length > 0 && groupMatches.every((m) => m.winner);

  return (
    <div className="space-y-8">
      {/* Group panels */}
      <div className="grid md:grid-cols-2 gap-6">
        {groupIds.map((gId) => {
          const gMatches = groupMatches.filter((m) => (m.groupId ?? 0) === gId);
          const gStandings = standings.filter((s) => s.groupId === gId);

          return (
            <div key={gId} className="border rounded-lg p-4">
              <h3 className="font-bold text-lg mb-3">Group {gId + 1}</h3>
              <div className="space-y-2 mb-4">
                {gMatches.map((m) => (
                  <div
                    key={m.matchNumber}
                    className={`flex items-center justify-between p-2 rounded border text-sm ${
                      isCreator && !m.winner && m.player1 && m.player2
                        ? "cursor-pointer hover:bg-muted"
                        : ""
                    }`}
                    onClick={() =>
                      isCreator && m.player1 && m.player2 && onMatchClick?.(m)
                    }
                  >
                    <span
                      className={
                        m.winner === m.player1 ? "font-bold text-gamba-green" : ""
                      }
                    >
                      {m.player1 || "TBD"}
                    </span>
                    <span className="text-muted-foreground mx-2">vs</span>
                    <span
                      className={
                        m.winner === m.player2 ? "font-bold text-gamba-green" : ""
                      }
                    >
                      {m.player2 || "TBD"}
                    </span>
                    {m.winner && (
                      <span className="ml-2 text-xs text-gamba-green font-semibold">
                        → {m.winner}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {gStandings.length > 0 && (
                <StandingsTable standings={gStandings} />
              )}
            </div>
          );
        })}
      </div>

      {/* Knockout bracket */}
      {allGroupComplete && knockoutMatches.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4 border-b pb-2">Knockout Stage</h2>
          <SingleElimViewer
            matches={knockoutMatches}
            onMatchClick={onMatchClick}
            isCreator={isCreator}
          />
        </div>
      )}
    </div>
  );
}

// ─── BracketViewer (dispatcher) ───────────────────────────────────────────────

export function BracketViewer({
  matches,
  onMatchClick,
  isCreator,
  bracketFormat,
  bracketId,
}: BracketViewerProps) {
  if (bracketFormat === "double_elimination") {
    return (
      <DoubleElimViewer
        matches={matches}
        onMatchClick={onMatchClick}
        isCreator={isCreator}
      />
    );
  }
  if (bracketFormat === "round_robin") {
    return (
      <RoundRobinViewer
        matches={matches}
        onMatchClick={onMatchClick}
        isCreator={isCreator}
        bracketId={bracketId}
      />
    );
  }
  if (bracketFormat === "group_stage") {
    return (
      <GroupStageViewer
        matches={matches}
        onMatchClick={onMatchClick}
        isCreator={isCreator}
        bracketId={bracketId}
      />
    );
  }
  // Default: single elimination
  return (
    <SingleElimViewer
      matches={matches}
      onMatchClick={onMatchClick}
      isCreator={isCreator}
    />
  );
}
