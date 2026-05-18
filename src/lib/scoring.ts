export type UomType = "higher_better" | "lower_better" | "binary" | "milestone";

/** Returns achievement % (0-150 capped) for a single goal at one check-in. */
export function computeScore(uomType: UomType, target: number, actual: number | null | undefined): number | null {
  if (actual === null || actual === undefined || isNaN(actual)) return null;
  if (target === 0 && uomType !== "binary") return null;
  switch (uomType) {
    case "higher_better":
      return Math.min(150, Math.max(0, (actual / target) * 100));
    case "lower_better":
      if (actual <= 0) return 150;
      return Math.min(150, Math.max(0, (target / actual) * 100));
    case "binary":
      return actual >= 1 ? 100 : 0;
    case "milestone":
      return Math.min(150, Math.max(0, (actual / target) * 100));
  }
}

/** Weighted overall score (0-100ish, can exceed 100 if overachievement). */
export function weightedTotal(
  goals: { weightage: number; uom_type: UomType; target: number }[],
  actuals: Record<string, number | null>,
  goalIdKey: (g: { weightage: number; uom_type: UomType; target: number }, idx: number) => string,
): number {
  let total = 0;
  goals.forEach((g, i) => {
    const a = actuals[goalIdKey(g, i)];
    const s = computeScore(g.uom_type, g.target, a);
    if (s != null) total += (s * g.weightage) / 100;
  });
  return Math.round(total * 10) / 10;
}

export const CURRENT_QUARTER_WINDOWS: Record<string, { quarter: string; label: string }> = {
  Q1: { quarter: "Q1", label: "Q1 — May" },
  Q2: { quarter: "Q2", label: "Q2 — July" },
  Q3: { quarter: "Q3", label: "Q3 — October" },
  Q4: { quarter: "Q4", label: "Q4 — January" },
  YEAR_END: { quarter: "YEAR_END", label: "Year-end — March/April" },
};

export function isQuarterOpen(quarter: string, now = new Date()): boolean {
  const m = now.getMonth() + 1; // 1-based month
  switch (quarter) {
    case "Q1": return m === 7; // July
    case "Q2": return m === 10; // October
    case "Q3": return m === 1; // January
    case "Q4": return m === 3 || m === 4; // March or April
    case "YEAR_END": return m === 3 || m === 4; // treat same as Q4 window
    default: return false;
  }
}

export function isGoalSettingOpen(now = new Date()): boolean {
  const m = now.getMonth() + 1;
  return m === 5; // May
}

export function getActiveQuarter(now = new Date()): string | null {
  const m = now.getMonth() + 1;
  if (m === 7) return "Q1"; // July
  if (m === 10) return "Q2"; // October
  if (m === 1) return "Q3"; // January
  if (m === 3 || m === 4) return "Q4"; // March/April
  return null;
}
