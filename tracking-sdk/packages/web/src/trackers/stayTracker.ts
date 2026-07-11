import type { BatchSender } from '../transport/batchSender';
import type { StillKineticConfig } from '../core/types';

/**
 * Tracks active (foreground, visible) time spent on the current page.
 * Pauses accumulation when the tab is hidden or the window loses focus,
 * so background tabs don't rack up billable stay duration.
 *
 * Sends elapsed ms per 5s report interval (not cumulative total) so the
 * backend can accumulate correctly across page reloads.
 */
export function attachStayTracker(
  config: StillKineticConfig,
  sender: BatchSender,
  getPageId: () => string
): () => void {
  let activeMsSinceLastReport = 0;
  let segmentStart: number | null = document.visibilityState === 'visible' ? Date.now() : null;
  let reportHandle: ReturnType<typeof setInterval> | null = null;

  const closeSegment = () => {
    if (segmentStart !== null) {
      activeMsSinceLastReport += Date.now() - segmentStart;
      segmentStart = null;
    }
  };

  const openSegment = () => {
    if (segmentStart === null) segmentStart = Date.now();
  };

  const report = () => {
    closeSegment(); // finalize current segment
    const elapsed = activeMsSinceLastReport;
    activeMsSinceLastReport = 0; // reset for next interval
    if (elapsed > 0) {
      sender.enqueue({
        appId: config.appId,
        endUserId: config.endUserId,
        pageId: getPageId(),
        metric: 'stay_duration',
        value: elapsed,
        timestamp: Date.now(),
      });
    }
    openSegment(); // restart segment after reporting
  };

  const visibilityHandler = () => {
    if (document.visibilityState === 'visible') openSegment();
    else closeSegment();
  };

  document.addEventListener('visibilitychange', visibilityHandler);
  window.addEventListener('blur', closeSegment);
  window.addEventListener('focus', openSegment);

  reportHandle = setInterval(report, 5000);

  return () => {
    closeSegment();
    const remaining = activeMsSinceLastReport;
    if (remaining > 0) {
      sender.enqueue({
        appId: config.appId,
        endUserId: config.endUserId,
        pageId: getPageId(),
        metric: 'stay_duration',
        value: remaining,
        timestamp: Date.now(),
      });
    }
    document.removeEventListener('visibilitychange', visibilityHandler);
    window.removeEventListener('blur', closeSegment);
    window.removeEventListener('focus', openSegment);
    if (reportHandle) clearInterval(reportHandle);
  };
}
