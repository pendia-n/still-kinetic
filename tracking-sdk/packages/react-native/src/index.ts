import { useMemo, useRef, useState, useEffect } from 'react';
import { BatchSender } from './transport/batchSender';
import { usePressTracker } from './trackers/pressTracker';
import { useScrollTracker } from './trackers/scrollTracker';
import { useTypeTracker } from './trackers/typeTracker';
import { useStayTracker } from './trackers/stayTracker';
import type { StillKineticConfig, Metric } from './core/types';

export type { StillKineticConfig, SpendingCapInput, CardBindResult, Metric, TrackEvent } from './core/types';
export { ALL_METRICS } from './core/types';
export { CardBindScreen } from './billing/CardBindScreen';

interface ServerConfig {
  appId: string;
  allowedMetrics: string[];
  subscriptionStatus: 'active' | 'inactive' | 'past_due';
  tier: 'basic' | 'full';
}

/**
 * Primary hook for React Native screens. Fetches server config on mount,
 * only returns handlers for metrics the subscription allows.
 *
 * Usage:
 * const { onScroll, onChangeText, onPressIn } = useStillKinetic(config, 'HomeScreen');
 *
 * <ScrollView onScroll={onScroll} scrollEventThrottle={16}>
 *   <TextInput onChangeText={onChangeText} />
 *   <Pressable onPressIn={onPressIn} />
 * </ScrollView>
 */
export function useStillKinetic(config: StillKineticConfig, pageId: string) {
  const senderRef = useRef<BatchSender | null>(null);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch server config on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const baseUrl = config.apiBaseUrl.replace(/\/$/, '');
        const res = await fetch(`${baseUrl}/api/apps/config?apiKey=${encodeURIComponent(config.apiKey)}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setServerConfig(data);
        }
      } catch {
        // Network error — fall back to client config
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [config.apiBaseUrl, config.apiKey]);

  // Determine effective metrics: server wins
  const effectiveMetrics = useMemo<Metric[]>(() => {
    if (serverConfig?.allowedMetrics) {
      return config.trackedMetrics.filter(
        m => serverConfig.allowedMetrics.includes(m)
      ) as Metric[];
    }
    return config.trackedMetrics;
  }, [config.trackedMetrics, serverConfig]);

  // Subscription active check
  const subscriptionActive = serverConfig ? serverConfig.subscriptionStatus === 'active' : false;
  const trackingEnabled = !serverConfig || subscriptionActive;

  // Initialize sender
  if (senderRef.current === null) {
    senderRef.current = new BatchSender(config);
    senderRef.current.start();
  }
  const sender = senderRef.current;

  // Only wire up trackers if tracking is enabled
  const { onPressIn } = usePressTracker(config, sender, pageId);
  const { onScroll } = useScrollTracker(config, sender, pageId, effectiveMetrics);
  const { onChangeText } = useTypeTracker(config, sender, pageId);
  useStayTracker(config, sender, pageId);

  // Return handlers only for allowed + enabled metrics
  return useMemo(
    () => ({
      onPressIn: trackingEnabled && effectiveMetrics.includes('press_count') ? onPressIn : undefined,
      onScroll: trackingEnabled && (effectiveMetrics.includes('scroll_length') || effectiveMetrics.includes('scroll_speed')) ? onScroll : undefined,
      onChangeText: trackingEnabled && effectiveMetrics.includes('type_speed') ? onChangeText : undefined,
    }),
    [effectiveMetrics, trackingEnabled, onPressIn, onScroll, onChangeText]
  );
}
