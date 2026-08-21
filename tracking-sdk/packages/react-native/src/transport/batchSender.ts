import { AppState, type AppStateStatus } from 'react-native';
import type { TrackEvent, StillKineticConfig, AccessDecision } from '../core/types';

export class BatchSender {
  private buffer: TrackEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly maxBufferSize = 200;
  private readonly endpoint: string;
  private appStateSub: { remove: () => void } | null = null;

  constructor(private config: StillKineticConfig) {
    this.endpoint = `${config.apiBaseUrl.replace(/\/$/, '')}/api/events`;
  }

  start(): void {
    const intervalMs = this.config.batchIntervalMs ?? 5000;
    this.timer = setInterval(() => this.flush(), intervalMs);

    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') this.flush();
    };
    this.appStateSub = AppState.addEventListener('change', handleAppStateChange);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.appStateSub?.remove();
    this.flush();
  }

  enqueue(event: TrackEvent): void {
    this.buffer.push(event);
    if (this.buffer.length >= this.maxBufferSize) this.flush();
  }

  private flush(): void {
    if (this.buffer.length === 0) return;
    const events = this.buffer;
    this.buffer = [];

    this.sendWithRetry(events, 3);
  }

  private sendWithRetry(events: TrackEvent[], retriesLeft: number): void {
    fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.config.apiKey,
      },
      body: JSON.stringify({ appId: this.config.appId, events }),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`usage submission failed: ${response.status}`);
      const body = await response.json().catch(() => ({})) as { access?: AccessDecision[] };
      for (const decision of body.access ?? []) this.config.onAccessDecision?.(decision);
    }).catch(() => {
      if (retriesLeft > 0) {
        const delay = Math.pow(2, 3 - retriesLeft) * 1000;
        setTimeout(() => this.sendWithRetry(events, retriesLeft - 1), delay);
      }
    });
  }
}
