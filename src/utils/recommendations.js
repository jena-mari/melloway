// Preserve all venue facts and the matrix index order; only fit scores change.
export function applyRecommendations(candidates, rankings, keepIds = []) {
  if (
    !Array.isArray(rankings) ||
    rankings.length !== candidates.length ||
    new Set(rankings.map((r) => r?.venueId)).size !== candidates.length ||
    rankings.some(
      (r) =>
        !r ||
        !candidates.some((v) => v.id === r.venueId) ||
        !Number.isFinite(r.fit) ||
        r.fit < 0 ||
        r.fit > 10 ||
        typeof r.exclude !== "boolean",
    )
  ) {
    throw new Error("Invalid recommendations");
  }
  const byId = new Map(rankings.map((r) => [r.venueId, r]));
  return candidates
    .filter((v) => !byId.get(v.id).exclude || keepIds.includes(v.id))
    .map((v) => ({
      ...v,
      score: v.scoreBreakdown
        ? v.score * 0.65 + byId.get(v.id).fit * 10 * 0.35 +
          // Retain the full local/filler policy when blending provider fit.
          0.35 * ((v.scoreBreakdown.localCuration || 0) +
            (v.scoreBreakdown.touristLandmark || 0) + (v.scoreBreakdown.unsolicitedFiller || 0))
        : byId.get(v.id).fit * 3,
      ...(byId.get(v.id).reason
        ? { recommendationReason: byId.get(v.id).reason }
        : {}),
    }));
}
