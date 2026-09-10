import type { TrackEvent, StillKineticConfig, AccessDecision } from '../core/types';

/**
 * Buffers events in memory and flushes them to the platform ingestion API
 * on a fixed interval, on page unload (via sendBeacon), and when the buffer
 * grows past a safety cap.
 */
export class BatchSender {
  private buffer: TrackEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly maxBufferSize = 200;
  private readonly endpoint: string;

  constructor(private config: StillKineticConfig) {
    this.endpoint = `${config.apiBaseUrl.replace(/\/$/, '')}/api/events`;
  }

  start(): void {
    const intervalMs = this.config.batchIntervalMs ?? 5000;
    this.timer = setInterval(() => this.flush(), intervalMs);

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush(true));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.flush(true);
      });
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.flush(true);
  }

  enqueue(event: TrackEvent): void {
    this.buffer.push({
      ...event,
      eventId: event.eventId ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    });
    if (this.buffer.length >= this.maxBufferSize) this.flush();
  }

  private flush(useBeacon = false): void {
    if (this.buffer.length === 0) return;
    const payload = JSON.stringify({
      appId: this.config.appId,
      events: this.buffer,
    });
    const events = this.buffer;
    this.buffer = [];

    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(`${this.endpoint}?apiKey=${encodeURIComponent(this.config.apiKey)}`, blob);
      return;
    }

    this.sendWithRetry(payload, events, 3);
  }

  private sendWithRetry(payload: string, events: TrackEvent[], retriesLeft: number): void {
    fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.config.apiKey,
      },
      body: payload,
      keepalive: true,
    }).then(async (response) => {
      if (!response.ok) throw new Error(`usage submission failed: ${response.status}`);
      const body = await response.json().catch(() => ({})) as { access?: AccessDecision[] };
      for (const decision of body.access ?? []) this.config.onAccessDecision?.(decision);
    }).catch(() => {
      if (retriesLeft > 0) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, 3 - retriesLeft) * 1000;
        setTimeout(() => this.sendWithRetry(payload, events, retriesLeft - 1), delay);
      }
      // After exhausting retries, events are silently dropped
      // (tracking must never throw or block the host app).
    });
  }
}
