export interface PayoutResult {
  userId: number;
  amount: number;
}

export function computePayouts(
  pot: number,
  bets: Array<{ userId: number; amount: number; selectedWinner: string }>,
  winner: string
): PayoutResult[] {
  const winningBets = bets.filter((b) => b.selectedWinner === winner);

  if (winningBets.length === 0) {
    return [];
  }

  const totalWinningAmount = winningBets.reduce((sum, b) => sum + b.amount, 0);

  return winningBets.map((b) => ({
    userId: b.userId,
    amount: Math.floor((b.amount / totalWinningAmount) * pot),
  }));
}
