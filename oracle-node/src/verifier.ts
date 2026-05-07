export interface AttentionSignals {
  visibility?: number;
  tabFocused?: boolean;
  mouseActive?: boolean;
  scrolled?: boolean;
  pointerVelocityVariance?: number;
  mediaProgress?: number;
  idleState?: "active" | "idle" | string;
  clickRhythmVariance?: number;
}

/**
 * Reproduces the spec scoring rubric server-side. The four "new" signals
 * (pointerVelocityVariance, mediaProgress, idleState, clickRhythmVariance)
 * are not yet emitted by the SDK — they default to 0 here, capping the max
 * achievable score at 60 until an SDK v2 ships them.
 */
export function scoreSignals(signals: AttentionSignals): number {
  let score = 0;

  if ((signals.visibility ?? 0) >= 0.5) score += 25;
  if (signals.tabFocused) score += 20;
  if (signals.mouseActive) score += 10;
  if (signals.scrolled) score += 5;

  if ((signals.pointerVelocityVariance ?? 0) > 0.3) score += 15;
  if ((signals.mediaProgress ?? 0) > 0.8) score += 15;
  if (signals.idleState === "active") score += 5;
  if ((signals.clickRhythmVariance ?? 0) > 0.2) score += 5;

  return Math.min(100, Math.max(0, score));
}
