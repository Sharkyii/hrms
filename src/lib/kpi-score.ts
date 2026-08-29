// Target-vs-Achieved KPI scoring, for goals where the manager tracks a real number (e.g. "4
// collaborations/month", "95% campaigns on time") rather than a subjective 1-5 rating. Lives
// alongside computeKraScore (kra-score.ts) — a kraGoals row uses whichever mechanic it has data
// for: targetValue/achievedValue here, or a kraRatings row there.
export interface KpiGoal {
  id: number;
  weightPct: number;
  targetValue: number | null;
  achievedValue: number | null;
  targetUnit: "count" | "percent" | "currency_band" | null;
  bandPct: number | null;
  scoreOverride: number | null;
}

export interface KpiScoreRow {
  goalId: number;
  scorePct: number | null; // 0-100, null if not enough data to score yet
}

export interface KpiScoreResult {
  rows: KpiScoreRow[];
  overallScorePct: number | null; // weighted average across rows that have a score
  weightScoredPct: number; // % of total weight that has a score so far
}

// One KPI's score out of 100. count/percent: achieved/target, capped at 100 (overachieving doesn't
// inflate the average further — matches "___% (e.g., 95%)" style targets in the source rubric).
// currency_band: 100 inside the +/-band, degrading linearly to 0 at 2x the band's distance past it —
// so "Budget Adherence +/-5%" scores 100 at exactly on-budget, drops off for over- or under-spend.
function scoreOneGoal(goal: KpiGoal): number | null {
  if (goal.scoreOverride !== null && goal.scoreOverride !== undefined) return goal.scoreOverride;
  if (goal.targetValue === null || goal.targetValue === undefined) return null;
  if (goal.achievedValue === null || goal.achievedValue === undefined) return null;

  if (goal.targetUnit === "currency_band") {
    const band = goal.bandPct ?? 0;
    const deviationPct = goal.targetValue === 0 ? 0 : (Math.abs(goal.achievedValue - goal.targetValue) / goal.targetValue) * 100;
    if (deviationPct <= band) return 100;
    const overBy = deviationPct - band;
    const score = 100 - (overBy / Math.max(band, 1)) * 100;
    return Math.max(0, Math.round(score * 100) / 100);
  }

  if (goal.targetValue === 0) return goal.achievedValue >= 0 ? 100 : 0;
  const ratio = (goal.achievedValue / goal.targetValue) * 100;
  return Math.round(Math.min(ratio, 100) * 100) / 100;
}

export function computeKpiScore(goals: KpiGoal[]): KpiScoreResult {
  // Only goals with a targetValue are part of this Target/Achieved mechanic — a plain rating-style
  // goal (no target set) sits outside it and shouldn't dilute weightScoredPct's denominator.
  const kpiGoals = goals.filter((g) => g.targetValue !== null && g.targetValue !== undefined);
  const rows: KpiScoreRow[] = kpiGoals.map((g) => ({ goalId: g.id, scorePct: scoreOneGoal(g) }));

  const totalWeight = kpiGoals.reduce((sum, g) => sum + g.weightPct, 0);
  if (totalWeight === 0) return { rows, overallScorePct: null, weightScoredPct: 0 };

  let weightedSum = 0;
  let weightScored = 0;
  for (const g of kpiGoals) {
    const row = rows.find((r) => r.goalId === g.id);
    if (row?.scorePct === null || row?.scorePct === undefined) continue;
    weightedSum += row.scorePct * g.weightPct;
    weightScored += g.weightPct;
  }
  if (weightScored === 0) return { rows, overallScorePct: null, weightScoredPct: 0 };

  return {
    rows,
    overallScorePct: Math.round((weightedSum / weightScored) * 100) / 100,
    weightScoredPct: Math.round((weightScored / totalWeight) * 100),
  };
}
