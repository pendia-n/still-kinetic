import type { BatchSender } from '../transport/batchSender';
import type { StillKineticConfig, Metric } from '../core/types';

/**
 * Tracks two independent metrics from the same scroll stream:
 *  - scroll_length: absolute pixels scrolled per event (delta, not cumulative)
 *  - scroll_speed: instantaneous px/ms sampled on each scroll event (throttled)
 *
 * Both metrics send deltas / instantaneous values so the backend can
 * accumulate properly across page reloads.
 */
export function attachScrollTracker(
  config: StillKineticConfig,
  sender: BatchSender,
  getPageId: () => string,
  enabledMetrics: Metric[]
): () => void {
  const wantsLength = enabledMetrics.includes('scroll_length');
  const wantsSpeed = enabledMetrics.includes('scroll_speed');
  if (!wantsLength && !wantsSpeed) return () => {};

  let lastY = window.scrollY;
  let lastTimestamp = performance.now();
  let throttleHandle: number | null = null;

  const sample = () => {
    const currentY = window.scrollY;
    const now = performance.now();
    const deltaY = Math.abs(currentY - lastY);
    const deltaT = Math.max(now - lastTimestamp, 1);

    if (wantsLength && deltaY > 0) {
      sender.enqueue({
        appId: config.appId,
        endUserId: config.endUserId,
        pageId: getPageId(),
        metric: 'scroll_length',
        value: deltaY,
        timestamp: Date.now(),
      });
    }

    if (wantsSpeed && deltaY > 0) {
      const pxPerMs = deltaY / deltaT;
      sender.enqueue({
        appId: config.appId,
        endUserId: config.endUserId,
        pageId: getPageId(),
        metric: 'scroll_speed',
        value: pxPerMs,
        timestamp: Date.now(),
      });
    }

    lastY = currentY;
    lastTimestamp = now;
    throttleHandle = null;
  };

  const handler = () => {
    if (throttleHandle !== null) return;
    throttleHandle = window.requestAnimationFrame(sample);
  };

  window.addEventListener('scroll', handler, { passive: true });
  return () => window.removeEventListener('scroll', handler);
}
