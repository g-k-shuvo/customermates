export const UNSUBSCRIBE_WINDOW_MS = 60_000;
export const UNSUBSCRIBE_MAX_PER_WINDOW = 30;

type Window = { start: number; count: number };

export class FixedWindowLimiter {
  private windows = new Map<string, Window>();

  constructor(
    private max = UNSUBSCRIBE_MAX_PER_WINDOW,
    private windowMs = UNSUBSCRIBE_WINDOW_MS,
    private now: () => number = () => Date.now(),
  ) {}

  allow(key: string): boolean {
    const now = this.now();
    const current = this.windows.get(key);

    if (!current || now - current.start >= this.windowMs) {
      if (this.windows.size > 10_000) this.windows.clear();
      this.windows.set(key, { start: now, count: 1 });
      return true;
    }

    current.count += 1;
    return current.count <= this.max;
  }
}

export const unsubscribeLimiter = new FixedWindowLimiter();
