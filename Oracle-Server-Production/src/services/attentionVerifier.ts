import type { SessionState, HeartbeatPayload } from '../types';

export function calculateScore(signals: HeartbeatPayload['signals']): number {
  let score = 0;
  if (signals.visibility >= 0.25) score += 0.70;
  if (signals.tabFocused)        score += 0.15;
  if (signals.mouseActive)       score += 0.10;
  if (signals.scrolled)          score += 0.05;
  return Math.min(score, 1.0);
}

function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
}

export function runBotDetection(session: SessionState, score: number, _timestamp: number): void {
  const scores = session.recentScores;
  const intervals = session.recentIntervals;

  if (scores.length >= 10 && calculateVariance(scores) < 0.001) {
    session.flagged = true;
  }

  if (scores.length >= 10 && scores.slice(-10).every(s => s > 0.95)) {
    session.flagged = true;
  }

  if (intervals.length >= 10 && calculateVariance(intervals) < 10) {
    session.flagged = true;
  }
}
