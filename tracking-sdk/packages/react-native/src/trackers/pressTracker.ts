import { useCallback } from 'react';
import type { BatchSender } from '../transport/batchSender';
import type { StillKineticConfig } from '../core/types';

/**
 * Hook that returns an onPressIn handler to attach to any Pressable /
 * TouchableOpacity in a tracked screen. Sends a delta (1) per press —
 * the backend accumulates.
 */
export function usePressTracker(config: StillKineticConfig, sender: BatchSender, pageId: string) {
  const onPressIn = useCallback(() => {
    sender.enqueue({
      appId: config.appId,
      endUserId: config.endUserId,
      pageId,
      metric: 'press_count',
      value: 1,
      timestamp: Date.now(),
    });
  }, [config, sender, pageId]);

  return { onPressIn };
}
