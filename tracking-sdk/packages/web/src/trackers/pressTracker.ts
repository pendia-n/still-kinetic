import type { BatchSender } from '../transport/batchSender';
import type { StillKineticConfig } from '../core/types';

/**
 * Counts discrete press/click interactions on the current page.
 * Emits a delta (1) on every press — the backend accumulates.
 * This survives page reloads because the backend adds deltas.
 */
export function attachPressTracker(
  config: StillKineticConfig,
  sender: BatchSender,
  getPageId: () => string
): () => void {
  const handler = () => {
    sender.enqueue({
      appId: config.appId,
      endUserId: config.endUserId,
      pageId: getPageId(),
      metric: 'press_count',
      value: 1,
      timestamp: Date.now(),
    });
  };

  document.addEventListener('pointerdown', handler, { passive: true });
  return () => document.removeEventListener('pointerdown', handler);
}
