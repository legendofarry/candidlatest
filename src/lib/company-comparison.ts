export type SalaryEvidence =
  | {
      contributions: number;
      positions: number;
    }
  | null
  | undefined;

export function formatRatingScore(count: number, overall: number | null) {
  if (count <= 0) return "Not rated yet";
  if (overall === null || !Number.isFinite(overall)) return "Rating unavailable";
  return `${overall.toFixed(1)} / 5`;
}

export function describeRatingSample(count: number) {
  if (count <= 0) return "No member responses yet. This is missing information, not a zero score.";
  if (count < 5)
    return `Based on ${count} response${count === 1 ? "" : "s"}; very small sample, so treat it as an early signal.`;
  if (count < 20) return `Based on ${count} responses; sample is still limited.`;
  return `Based on ${count} member responses.`;
}

export function describeSalaryEvidence(evidence: SalaryEvidence, unavailable = false) {
  if (unavailable) {
    return {
      value: "Unavailable",
      detail: "Salary information could not be loaded. This is not the same as no reports.",
    };
  }
  if (!evidence || evidence.contributions <= 0) {
    return {
      value: "No reports yet",
      detail:
        "No salary submissions are recorded for this employer. Missing data is not a pay assessment.",
    };
  }
  return {
    value: `${evidence.contributions} report${evidence.contributions === 1 ? "" : "s"}`,
    detail: `Across ${evidence.positions} role title${evidence.positions === 1 ? "" : "s"}. Reports don’t capture experience level, gross/net status or pay period, so their pay figures aren’t like-for-like.`,
  };
}
