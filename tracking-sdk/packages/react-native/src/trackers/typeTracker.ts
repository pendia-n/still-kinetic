import { useCallback, useRef } from 'react';
import type { BatchSender } from '../transport/batchSender';
import type { StillKineticConfig } from '../core/types';

/**
 * Hook that returns an onChangeText handler for React Native's TextInput.
 * Estimates typing speed (characters/minute) from a rolling window of
 * change-event timestamps. Falls back to onChangeText (cross-platform)
 * rather than onKeyPress, since onKeyPress support is inconsistent across
 * Android keyboards/IMEs.
 */
export function useTypeTracker(config: StillKineticConfig, sender: BatchSender, pageId: string) {
  const timestamps = useRef<number[]>([]);
  const lastLength = useRef(0);
  const windowMs = 10_000;

  const onChangeText = useCallback(
    (text: string) => {
      const now = Date.now();
      const lengthDelta = text.length - lastLength.current;
      lastLength.current = text.length;

      // Only count actual character-producing changes, ignore pure deletions
      // triggered by controlled-component resets etc.
      if (lengthDelta === 0) return;

      timestamps.current.push(now);
      while (timestamps.current.length > 0 && now - timestamps.current[0] > windowMs) {
        timestamps.current.shift();
      }
      if (timestamps.current.length < 2) return;

      const elapsedMinutes = (now - timestamps.current[0]) / 60_000;
      const charsPerMinute =
        elapsedMinutes > 0 ? timestamps.current.length / elapsedMinutes : 0;

      sender.enqueue({
        appId: config.appId,
        endUserId: config.endUserId,
        pageId,
        metric: 'type_speed',
        value: Math.round(charsPerMinute),
        timestamp: now,
      });
    },
    [config, sender, pageId]
  );

  return { onChangeText };
}
