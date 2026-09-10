import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { BatchSender } from '../transport/batchSender';
import type { StillKineticConfig } from '../core/types';

/**
 * Hook that tracks active foreground time spent on the screen it's mounted
 * in. Accumulation pauses automatically when the app backgrounds. Reports
 * elapsed ms per 5s interval (not cumulative total) so the backend can
 * accumulate across screen unmounts/remounts.
 *
 * If using React Navigation, wrap this in a useFocusEffect in the host app
 * so the timer starts/stops with screen focus rather than mount/unmount —
 * see README for the pattern.
 */
export function useStayTracker(config: StillKineticConfig, sender: BatchSender, pageId: string, enabled = true) {
  const activeMsRef = useRef(0);
  const segmentStart = useRef<number | null>(AppState.currentState === 'active' ? Date.now() : null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const closeSegment = () => {
      if (segmentStart.current !== null) {
        activeMsRef.current += Date.now() - segmentStart.current;
        segmentStart.current = null;
      }
    };
    const openSegment = () => {
      if (segmentStart.current === null && AppState.currentState === 'active') segmentStart.current = Date.now();
    };

    const report = () => {
      closeSegment();
      const elapsed = activeMsRef.current;
      activeMsRef.current = 0;
      if (elapsed > 0) {
        sender.enqueue({
          appId: config.appId,
          endUserId: config.endUserId,
          pageId,
          metric: 'stay_duration',
          value: elapsed,
          timestamp: Date.now(),
        });
      }
      openSegment();
    };

    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') openSegment();
      else closeSegment();
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    intervalRef.current = setInterval(report, 5000);

    return () => {
      closeSegment();
      const remaining = activeMsRef.current;
      if (remaining > 0) {
        sender.enqueue({
          appId: config.appId,
          endUserId: config.endUserId,
          pageId,
          metric: 'stay_duration',
          value: remaining,
          timestamp: Date.now(),
        });
      }
      sub.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [config, sender, pageId, enabled]);
}
