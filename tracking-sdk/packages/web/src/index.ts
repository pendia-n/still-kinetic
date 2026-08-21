import { BatchSender } from './transport/batchSender';
import { attachPressTracker } from './trackers/pressTracker';
import { attachScrollTracker } from './trackers/scrollTracker';
import { attachTypeTracker } from './trackers/typeTracker';
import { attachStayTracker } from './trackers/stayTracker';
import { CardBind } from './billing/CardBind';
import type { StillKineticConfig, SpendingCapInput, CardBindResult, Metric, AccessDecision } from './core/types';

export type { StillKineticConfig, SpendingCapInput, CardBindResult, Metric, TrackEvent, AccessDecision, AccessStatus } from './core/types';
export { ALL_METRICS } from './core/types';

/** Server-enforced config fetched on init. */
interface ServerConfig {
  appId: string;
  allowedMetrics: string[];
  subscriptionStatus: 'active' | 'inactive' | 'past_due';
  tier: 'basic' | 'full';
}

/**
 * StillKinetic web SDK.
 *
 * const sk = new StillKinetic({
 *   appId: 'app_123',
 *   apiKey: 'pk_app_...',
 *   apiBaseUrl: 'https://api.yourplatform.com',
 *   stripePublishableKey: 'pk_live_...',
 *   endUserId: currentUser.id,
 *   trackedMetrics: ['stay_duration', 'scroll_length'],
 * });
 * await sk.init();  // fetches server config
 * sk.start();
 */
export class StillKinetic {
  private sender: BatchSender;
  private detachFns: Array<() => void> = [];
  private started = false;
  private serverConfig: ServerConfig | null = null;
  private _subscriptionActive = false;
  private visitId: string | null = null;

  constructor(private config: StillKineticConfig) {
    this.sender = new BatchSender(config);
  }

  private getPageId = () => {
    const page = this.config.pageId ?? (typeof window !== 'undefined' ? window.location.pathname : 'unknown');
    return `${page}::visit:${this.visitId ?? this.config.visitId ?? 'default'}`;
  };

  /**
   * Fetch server config (allowed metrics + subscription status).
   * Must be called before start(). Returns true if subscription is active.
   * If subscription is inactive, tracking will silently no-op.
   */
  async init(): Promise<boolean> {
    try {
      const baseUrl = this.config.apiBaseUrl.replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/api/apps/config?apiKey=${encodeURIComponent(this.config.apiKey)}`);
      if (!res.ok) {
        console.warn('[StillKinetic] Failed to fetch server config, using client-side config only');
        this._subscriptionActive = false;
        return false;
      }
      this.serverConfig = await res.json();
      this._subscriptionActive = this.serverConfig?.subscriptionStatus === 'active';
      return this._subscriptionActive;
    } catch {
      console.warn('[StillKinetic] Network error fetching server config');
      this._subscriptionActive = false;
      return false;
    }
  }

  /** Whether subscription is currently active (from last init() call). */
  get subscriptionActive(): boolean {
    return this._subscriptionActive;
  }

  /** Server-enforced allowed metrics (from last init() call). */
  get allowedMetrics(): string[] {
    return this.serverConfig?.allowedMetrics ?? [];
  }

  /** Begin tracking the subset of metrics that the server allows. */
  start(): void {
    if (this.started) return;
    this.visitId = this.config.visitId ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

    // If server config was fetched, intersect client config with server-allowed
    const allowed = new Set<string>(this.serverConfig?.allowedMetrics ?? this.config.trackedMetrics);
    const clientMetrics = this.config.trackedMetrics.filter(m => allowed.has(m));

    // If subscription inactive, don't attach any trackers (silent no-op)
    if (!this._subscriptionActive) {
      // Still start the sender so setupBilling() can work, but no trackers attached
      this.sender.start();
      this.started = true;
      return;
    }

    this.started = true;
    this.sender.start();

    const metrics = new Set(clientMetrics);

    if (metrics.has('press_count')) {
      this.detachFns.push(attachPressTracker(this.config, this.sender, this.getPageId));
    }
    if (metrics.has('scroll_length') || metrics.has('scroll_speed')) {
      this.detachFns.push(
        attachScrollTracker(this.config, this.sender, this.getPageId, clientMetrics as Metric[])
      );
    }
    if (metrics.has('type_speed')) {
      this.detachFns.push(attachTypeTracker(this.config, this.sender, this.getPageId));
    }
    if (metrics.has('stay_duration')) {
      this.detachFns.push(attachStayTracker(this.config, this.sender, this.getPageId));
    }
  }

  /** Stop all tracking and flush any buffered events. */
  stop(): void {
    this.detachFns.forEach((fn) => fn());
    this.detachFns = [];
    this.sender.stop();
    this.started = false;
    this.visitId = null;
  }

  /** Check whether the developer should allow this end user to continue. */
  async getAccessStatus(metric?: Metric): Promise<AccessDecision> {
    const baseUrl = this.config.apiBaseUrl.replace(/\/$/, '');
    const query = new URLSearchParams({ appId: this.config.appId, apiKey: this.config.apiKey, endUserId: this.config.endUserId });
    if (metric) query.set('metric', metric);
    const res = await fetch(`${baseUrl}/api/end-user/access?${query}`);
    if (!res.ok) throw new Error(`Access status request failed (${res.status})`);
    return await res.json() as AccessDecision;
  }

  /**
   * One-time UI flow: mounts a Stripe card element into the given container,
   * binds the end user's card, and sets their spending cap.
   */
  async setupBilling(containerSelector: string, cap: SpendingCapInput): Promise<CardBindResult> {
    const bind = new CardBind(this.config);
    await bind.mount(containerSelector);
    return bind.submit(cap);
  }
}

export default StillKinetic;
