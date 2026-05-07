import type { AttentionSignals } from './types';

/**
 * Coefficient of variation: stddev / mean. Bounded for real-world samples,
 * unitless, robust against scale. Bot-like inputs (linear, evenly-spaced)
 * produce CV near 0; human inputs cluster around 0.3–1.5. The aggregator's
 * verifier uses the threshold > 0.3 to award the variance-related points.
 */
function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const sq = values
    .map((v) => (v - mean) ** 2)
    .reduce((a, b) => a + b, 0);
  const stddev = Math.sqrt(sq / values.length);
  return stddev / mean;
}

// Window sizes per spec.
const VELOCITY_WINDOW = 20;
const CLICK_WINDOW = 10;

// Browser-vendor type shim — IdleDetector is a Chromium-only API and not in
// lib.dom.d.ts as of TS 5.6.
interface IdleDetectorLike extends EventTarget {
  userState: 'active' | 'idle';
  start(opts: { threshold: number; signal?: AbortSignal }): Promise<void>;
}
interface IdleDetectorCtor {
  new (): IdleDetectorLike;
  requestPermission(): Promise<'granted' | 'denied' | 'default'>;
}

export class AttentionCollector {
  private element: Element;
  private lastMouseMove: number = Date.now();
  private lastScroll: number = Date.now();
  private observer: IntersectionObserver;
  private visibilityRatio: number = 0;
  private onMouseMove: () => void;
  private onScroll: () => void;

  // New signal state
  private velocities: number[] = [];
  private clickTimestamps: number[] = [];
  private idleState: 'active' | 'idle' = 'active';
  private idleAbort: AbortController | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private onMouseMoveVel: (e: MouseEvent) => void;
  private onMouseDown: () => void;

  constructor(elementId: string, videoElementId?: string) {
    const el = document.getElementById(elementId);
    if (!el) throw new Error(`VISTA: element not found: ${elementId}`);
    this.element = el;

    this.observer = new IntersectionObserver(
      (entries) => {
        this.visibilityRatio = entries[0]?.intersectionRatio ?? 0;
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1.0] }
    );
    this.observer.observe(this.element);

    this.onMouseMove = () => {
      this.lastMouseMove = Date.now();
    };
    this.onScroll = () => {
      this.lastScroll = Date.now();
    };

    this.onMouseMoveVel = (e: MouseEvent) => {
      const v = Math.sqrt(e.movementX ** 2 + e.movementY ** 2);
      this.velocities.push(v);
      if (this.velocities.length > VELOCITY_WINDOW) this.velocities.shift();
    };
    this.onMouseDown = () => {
      this.clickTimestamps.push(Date.now());
      if (this.clickTimestamps.length > CLICK_WINDOW) this.clickTimestamps.shift();
    };

    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('scroll', this.onScroll, { passive: true });
    document.addEventListener('mousemove', this.onMouseMoveVel);
    document.addEventListener('mousedown', this.onMouseDown);

    // Resolve <video> for mediaProgress: explicit id wins, otherwise first
    // video found inside the attached zone.
    if (videoElementId) {
      const v = document.getElementById(videoElementId);
      if (v instanceof HTMLVideoElement) this.videoElement = v;
    }
    if (!this.videoElement) {
      const v = el.querySelector('video');
      if (v instanceof HTMLVideoElement) this.videoElement = v;
    }

    void this.tryStartIdleDetector();
  }

  private async tryStartIdleDetector(): Promise<void> {
    const ctor = (globalThis as unknown as { IdleDetector?: IdleDetectorCtor })
      .IdleDetector;
    if (!ctor) return;
    try {
      const perm = await ctor.requestPermission();
      if (perm !== 'granted') return;
      const detector = new ctor();
      detector.addEventListener('change', () => {
        this.idleState = detector.userState;
      });
      this.idleAbort = new AbortController();
      await detector.start({ threshold: 60_000, signal: this.idleAbort.signal });
    } catch {
      // Permission denied or feature unsupported — leave idleState as 'active'.
    }
  }

  collect(): AttentionSignals {
    let mediaProgress = 0;
    if (this.videoElement) {
      const dur = this.videoElement.duration;
      const cur = this.videoElement.currentTime;
      if (Number.isFinite(dur) && dur > 0 && Number.isFinite(cur)) {
        mediaProgress = Math.min(1, Math.max(0, cur / dur));
      }
    }

    const intervals = this.clickTimestamps
      .slice(1)
      .map((t, i) => t - this.clickTimestamps[i]);

    return {
      visibility: this.visibilityRatio,
      tabFocused: document.visibilityState === 'visible',
      mouseActive: Date.now() - this.lastMouseMove < 3000,
      scrolled: Date.now() - this.lastScroll < 2000,
      pointerVelocityVariance: coefficientOfVariation(this.velocities),
      mediaProgress,
      idleState: this.idleState,
      clickRhythmVariance: coefficientOfVariation(intervals),
    };
  }

  /**
   * Local-only score (0..1) used for the SDK's optimistic UI counter. The
   * authoritative score is computed server-side by oracle-node out of 100.
   */
  calculateScore(signals: AttentionSignals): number {
    let score = 0;
    if (signals.visibility >= 0.5) score += 0.30;
    if (signals.tabFocused) score += 0.20;
    if (signals.mouseActive) score += 0.10;
    if (signals.scrolled) score += 0.05;
    if (signals.pointerVelocityVariance > 0.3) score += 0.15;
    if (signals.mediaProgress > 0.8) score += 0.15;
    if (signals.idleState === 'active') score += 0.05;
    if (signals.clickRhythmVariance > 0.2) score += 0.05;
    return Math.min(1, score);
  }

  destroy(): void {
    this.observer.disconnect();
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('scroll', this.onScroll);
    document.removeEventListener('mousemove', this.onMouseMoveVel);
    document.removeEventListener('mousedown', this.onMouseDown);
    this.idleAbort?.abort();
    this.idleAbort = null;
    this.videoElement = null;
  }
}
