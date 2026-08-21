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
  appId: string;
  endUserId: string;
  pageId: string;
  metric: Metric;
  value: number;
  timestamp: number;
}

export interface StillKineticConfig {
  /** App ID issued by the platform dashboard */
  appId: string;
  /** Public API key issued by the platform dashboard (safe for client use) */
  apiKey: string;
  /** Base URL of the platform API, e.g. https://api.yourplatform.com */
  apiBaseUrl: string;
  /** Stripe publishable key (safe for client use) */
  stripePublishableKey: string;
  /** Stable identifier for the current end user (your own user id, or an anonymous id you generate/store) */
  endUserId: string;
  /** Which metrics this app has opted to track. Must be a subset of what the app's subscription tier allows; the backend re-validates and will silently drop disallowed metrics. */
  trackedMetrics: Metric[];
  /** How often to flush the local event buffer, in ms. Default 5000. */
  batchIntervalMs?: number;
  /** Identifier for the current page/screen. Defaults to location.pathname on web. */
  pageId?: string;
  /** Optional caller-controlled visit identifier. A new one is generated per start() by default. */
  visitId?: string;
  /** Called when ingestion reports that the end user must stop or increase their cap. */
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
