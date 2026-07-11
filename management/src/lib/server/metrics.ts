export const ALL_METRICS = [
  'press_count', 'scroll_length', 'scroll_speed', 'stay_duration', 'type_speed',
  'swipe_count', 'pinch_zoom_count', 'long_press_count', 'form_submit_count',
  'tab_switch_count', 'search_count', 'video_play_count', 'video_watch_duration',
  'file_download_count', 'share_count', 'mouse_distance',
] as const;

export type Metric = (typeof ALL_METRICS)[number];

export const CUMULATIVE_METRICS: Metric[] = [
  'press_count', 'scroll_length', 'stay_duration', 'swipe_count',
  'long_press_count', 'form_submit_count', 'tab_switch_count',
  'search_count', 'video_play_count', 'video_watch_duration',
  'file_download_count', 'share_count', 'mouse_distance',
];

export const INSTANTANEOUS_METRICS: Metric[] = [
  'scroll_speed', 'type_speed', 'pinch_zoom_count',
];

export const INSTANTANEOUS_TRIGGER_COOLDOWN_MS = 60_000;

export const TIER_CONFIG = {
  basic: {
    label: 'Basic',
    priceCentsPerWeek: 200,
    maxMetrics: 2,
  },
  full: {
    label: 'Full',
    priceCentsPerWeek: 1000,
    maxMetrics: ALL_METRICS.length,
  },
} as const;

export type TierName = keyof typeof TIER_CONFIG;

export function isValidMetric(value: string): value is Metric {
  return (ALL_METRICS as readonly string[]).includes(value);
}

export function parseAllowedMetrics(json: string): Metric[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter(isValidMetric) : [];
  } catch { return []; }
}

export function serializeAllowedMetrics(metrics: Metric[]): string {
  return JSON.stringify(metrics.filter(isValidMetric));
}

export function platformFeeFraction(): number {
  return 0.25;
}

export function periodLengthMs(period: 'weekly' | 'monthly'): number {
  return period === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
}
