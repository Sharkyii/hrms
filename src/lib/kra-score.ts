// Weighted rollup for one employee's KRA goals in a cycle. Per goal, uses whichever rating is
// most authoritative (final > manager > self); goals with no rating yet are simply excluded from
// the weighted average rather than counted as zero, so a half-rated cycle still shows a fair score.
export interface KraScoreResult {
  score: number | null; // weighted average out of 5, across whatever's been rated so far
  weightRatedPct: number; // % of the cycle's total weight that has any rating at all
  category: "high_performer" | "meets_expectations" | "needs_improvement" | null;
}

export function computeKraScore(
  goals: Array<{ id: number; weightPct: number }>,
  ratingsByGoalId: Map<number, { selfRating: number | null; managerRating: number | null; finalRating: number | null }>,
): KraScoreResult {
  const totalWeight = goals.reduce((sum, g) => sum + g.weightPct, 0);
  if (totalWeight === 0) return { score: null, weightRatedPct: 0, category: null };

  let weightedSum = 0;
  let weightRated = 0;
  for (const g of goals) {
    const r = ratingsByGoalId.get(g.id);
    const rating = r?.finalRating ?? r?.managerRating ?? r?.selfRating ?? null;
    if (rating === null || rating === undefined) continue;
    weightedSum += rating * g.weightPct;
    weightRated += g.weightPct;
  }
  if (weightRated === 0) return { score: null, weightRatedPct: 0, category: null };

  const score = Math.round((weightedSum / weightRated) * 100) / 100;
  const category = score >= 4 ? "high_performer" : score >= 3 ? "meets_expectations" : "needs_improvement";
  return { score, weightRatedPct: Math.round((weightRated / totalWeight) * 100), category };
}
