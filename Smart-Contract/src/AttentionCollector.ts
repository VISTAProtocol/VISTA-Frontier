import type { AttentionSignals } from './types';

export class AttentionCollector {
  private element: Element;
  private lastMouseMove: number = Date.now();
  private lastScroll: number = Date.now();
  private observer: IntersectionObserver;
  private visibilityRatio: number = 0;
  private onMouseMove: () => void;
  private onScroll: () => void;

  constructor(elementId: string) {
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

    this.onMouseMove = () => { this.lastMouseMove = Date.now(); };
    this.onScroll = () => { this.lastScroll = Date.now(); };

    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('scroll', this.onScroll, { passive: true });
  }

  collect(): AttentionSignals {
    return {
      visibility: this.visibilityRatio,
      tabFocused: document.visibilityState === 'visible',
      mouseActive: Date.now() - this.lastMouseMove < 3000,
      scrolled: Date.now() - this.lastScroll < 2000,
    };
  }

  calculateScore(signals: AttentionSignals): number {
    let score = 0;
    if (signals.visibility >= 0.5) score += 0.60;
    if (signals.tabFocused)        score += 0.20;
    if (signals.mouseActive)       score += 0.10;
    if (signals.scrolled)          score += 0.10;
    return score;
  }

  destroy(): void {
    this.observer.disconnect();
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('scroll', this.onScroll);
  }
}
