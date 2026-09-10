import {
  ALL_METRICS,
  type ApiOnlyConfig,
  type Metric,
  type ServerConfig,
  type SubmittedUsageEvent,
  type TrackResult,
  type UsageEvent,
  type AccessDecision,
} from './types';

export type {
  ApiOnlyConfig,
  Metric,
  ServerConfig,
  SubmittedUsageEvent,
  TrackResult,
  UsageEvent,
  AccessDecision,
  AccessStatus,
} from './types';
export { ALL_METRICS } from './types';

export class StillKineticApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'StillKineticApiError';
  }
}

/**
 * Headless usage client for APIs, servers, CLI tools, and MCP servers.
 * It never collects card details and never calls Stripe directly. The end user
 * must first bind a card and cap through a UI SDK. Accepted events are evaluated
 * asynchronously by the StillKinetic management threshold engine.
 */
export class StillKineticApi {
  private serverConfig: ServerConfig | null = null;
  private request: typeof globalThis.fetch;
  private baseUrl: string;

  constructor(private config: ApiOnlyConfig) {
    if (!config.appId || !config.apiKey || !config.apiBaseUrl) {
      throw new StillKineticApiError('appId, apiKey, and apiBaseUrl are required.');
    }
    const request = config.fetch ?? globalThis.fetch;
    if (!request) {
      throw new StillKineticApiError('No fetch implementation is available. Use Node 18+ or pass config.fetch.');
    }
    this.request = request.bind(globalThis);
    this.baseUrl = config.apiBaseUrl.replace(/\/$/, '');
  }

  async init(): Promise<ServerConfig> {
    const response = await this.request(
      `${this.baseUrl}/api/apps/config?apiKey=${encodeURIComponent(this.config.apiKey)}`,
    );
    if (!response.ok) throw await this.toError(response, 'Could not load app configuration.');
    const data = await response.json() as ServerConfig;
    this.serverConfig = data;
    return data;
  }

  get subscriptionActive(): boolean {
    return this.serverConfig?.subscriptionStatus === 'active';
  }

  get allowedMetrics(): Metric[] {
    return this.serverConfig?.allowedMetrics ?? [];
  }

  async track(event: UsageEvent): Promise<TrackResult> {
    return this.trackBatch([event]);
  }

  async trackBatch(events: UsageEvent[]): Promise<TrackResult> {
    if (events.length === 0) {
      throw new StillKineticApiError('At least one usage event is required.');
    }
    if (events.length > 200) {
      throw new StillKineticApiError('A batch may contain at most 200 events.');
    }
    if (this.serverConfig && this.serverConfig.subscriptionStatus !== 'active') {
      throw new StillKineticApiError('The app subscription is not active.', 402);
    }

    const normalized = events.map((event) => this.normalizeEvent(event));
    const response = await this.request(`${this.baseUrl}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.config.apiKey,
      },
      body: JSON.stringify({
        appId: this.config.appId,
        apiKey: this.config.apiKey,
        events: normalized,
      }),
    });
    if (!response.ok) throw await this.toError(response, `Usage submission failed (${response.status}).`);

    const result = await response.json().catch(() => ({})) as { access?: AccessDecision[] };
    for (const decision of result.access ?? []) this.config.onAccessDecision?.(decision);
    return {
      ok: true,
      submitted: normalized.length,
      chargeStatus: 'not_returned_by_ingestion_api',
      access: result.access,
    };
  }

  async getAccessStatus(metric?: Metric, endUserId = this.config.endUserId): Promise<AccessDecision> {
    if (!endUserId) throw new StillKineticApiError('endUserId is required for access checks.');
    const query = new URLSearchParams({ appId: this.config.appId, apiKey: this.config.apiKey, endUserId });
    if (metric) query.set('metric', metric);
    const response = await this.request(`${this.baseUrl}/api/end-user/access?${query}`);
    if (!response.ok) throw await this.toError(response, `Access status request failed (${response.status}).`);
    return await response.json() as AccessDecision;
  }

  private normalizeEvent(event: UsageEvent): SubmittedUsageEvent {
    const endUserId = event.endUserId ?? this.config.endUserId;
    const page = event.pageId ?? this.config.pageId ?? '_default';
    const pageId = event.visitId ? `${page}::visit:${event.visitId}` : page;
    if (!endUserId) throw new StillKineticApiError('endUserId is required for every usage event.');
    if (!ALL_METRICS.includes(event.metric)) {
      throw new StillKineticApiError(`Unsupported metric: ${String(event.metric)}.`);
    }
    if (this.serverConfig && !this.serverConfig.allowedMetrics.includes(event.metric)) {
      throw new StillKineticApiError(`Metric ${event.metric} is not enabled for this app.`, 403);
    }
    if (!Number.isFinite(event.value) || event.value < 0) {
      throw new StillKineticApiError('Usage event value must be a finite non-negative number.');
    }

    return {
      eventId: event.eventId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      appId: this.config.appId,
      endUserId,
      pageId,
      metric: event.metric,
      value: event.value,
      timestamp: event.timestamp ?? Date.now(),
    };
  }

  private async toError(response: Response, fallback: string): Promise<StillKineticApiError> {
    try {
      const data = await response.json() as { error?: string };
      return new StillKineticApiError(data.error || fallback, response.status);
    } catch {
      return new StillKineticApiError(fallback, response.status);
    }
  }
}

export default StillKineticApi;
