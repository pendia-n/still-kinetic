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

export const ALL_METRICS: Metric[] = [
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
];

export interface TrackEvent {
  /** Stable client-generated identifier for server-side idempotency. */
  eventId?: string;
  appId: string;
  endUserId: string;
  pageId: string;
  metric: Metric;
  value: number;
  timestamp: number;
}

export interface StillKineticConfig {
  appId: string;
  apiKey: string;
  apiBaseUrl: string;
  stripePublishableKey: string;
  endUserId: string;
  trackedMetrics: Metric[];
  batchIntervalMs?: number;
  visitId?: string;
  onAccessDecision?: (decision: AccessDecision) => void;
}

export type AccessStatus = 'allowed' | 'cap_reached' | 'payment_required' | 'subscription_inactive' | 'connect_required';
export interface AccessDecision {
  allowed: boolean;
  status: AccessStatus;
  message: string;
  remainingCents: number | null;
  capCents: number | null;
  period: 'weekly' | 'monthly' | null;
  spentCents: number;
}

export interface SpendingCapInput {
  amountCents: number;
  period: 'weekly' | 'monthly';
}

export interface CardBindResult {
  success: boolean;
  error?: string;
}
