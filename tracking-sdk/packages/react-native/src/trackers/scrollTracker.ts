import { useCallback, useRef } from 'react';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import type { BatchSender } from '../transport/batchSender';
import type { StillKineticConfig, Metric } from '../core/types';

/**
 * Hook that returns an onScroll handler for React Native's ScrollView /
 * FlatList. Computes scroll_length (delta px) and scroll_speed (px/ms)
 * from consecutive contentOffset.y readings. Both metrics send deltas
 * so the backend can accumulate across screen transitions.
 */
export function useScrollTracker(
  config: StillKineticConfig,
  sender: BatchSender,
  pageId: string,
  enabledMetrics: Metric[]
) {
  const lastY = useRef<number | null>(null);
  const lastTimestamp = useRef<number>(Date.now());

  const wantsLength = enabledMetrics.includes('scroll_length');
  const wantsSpeed = enabledMetrics.includes('scroll_speed');

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!wantsLength && !wantsSpeed) return;

      const currentY = e.nativeEvent.contentOffset.y;
      const now = Date.now();

      if (lastY.current === null) {
        lastY.current = currentY;
        lastTimestamp.current = now;
        return;
      }

      const deltaY = Math.abs(currentY - lastY.current);
      const deltaT = Math.max(now - lastTimestamp.current, 1);

      if (deltaY > 0) {
        if (wantsLength) {
          sender.enqueue({
            appId: config.appId,
            endUserId: config.endUserId,
            pageId,
            metric: 'scroll_length',
            value: deltaY,
            timestamp: now,
          });
        }
        if (wantsSpeed) {
          sender.enqueue({
            appId: config.appId,
            endUserId: config.endUserId,
            pageId,
            metric: 'scroll_speed',
            value: deltaY / deltaT,
            timestamp: now,
          });
        }
      }

      lastY.current = currentY;
      lastTimestamp.current = now;
    },
    [config, sender, pageId, wantsLength, wantsSpeed]
  );

  return { onScroll };
}
