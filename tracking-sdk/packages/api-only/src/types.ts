export type Metric =
  | 'press_count'
  | 'scroll_length'
  | 'scroll_speed'
  | 'type_speed'
  | 'stay_duration'
  | 'swipe_count'
  | 'pinch_zoom_count'
  | 'long_press_count'
  | 'form_submit_count'
  | 'tab_switch_count'
  | 'search_count'
  | 'video_play_count'
  | 'video_watch_duration'
  | 'file_download_count'
  | 'share_count'
  | 'mouse_distance';

export const ALL_METRICS: readonly Metric[] = [
  'press_count',
  'scroll_length',
  'scroll_speed',
  'type_speed',
  'stay_duration',
  'swipe_count',
  'pinch_zoom_count',
  'long_press_count',
  'form_submit_count',
  'tab_switch_count',
  'search_count',
  'video_play_count',
  'video_watch_duration',
  'file_download_count',
  'share_count',
  'mouse_distance',
] as const;

export interface ApiOnlyConfig {
  appId: string;
  apiKey: string;
  apiBaseUrl: string;
  /** Optional default identity used when a track call does not override it. */
  endUserId?: string;
  /** Optional default context used when a track call does not override it. */
  pageId?: string;
  /** Optional fetch implementation for runtimes without global fetch. */
  fetch?: typeof globalThis.fetch;
}

export interface UsageEvent {
  endUserId?: string;
  pageId?: string;
  metric: Metric;
  value: number;
  timestamp?: number;
}

export interface SubmittedUsageEvent {
  appId: string;
  endUserId: string;
  pageId: string;
  metric: Metric;
  value: number;
  timestamp: number;
}

export interface ServerConfig {
  appId: string;
  allowedMetrics: Metric[];
  subscriptionStatus: 'active' | 'inactive' | 'past_due';
  tier: 'basic' | 'full';
}

export interface TrackResult {
  ok: true;
  submitted: number;
  /** Event ingestion is accepted asynchronously; this does not mean a Stripe charge succeeded. */
  chargeStatus: 'not_returned_by_ingestion_api';
}
