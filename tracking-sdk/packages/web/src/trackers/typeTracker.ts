import type { BatchSender } from '../transport/batchSender';
import type { StillKineticConfig } from '../core/types';

/**
 * Tracks typing speed as characters-per-minute, computed from a rolling
 * window of keydown timestamps on any text-entry element on the page.
 * Only fires on actual character-producing keys (ignores modifiers, arrows,
 * etc.) to avoid noise.
 */
export function attachTypeTracker(
  config: StillKineticConfig,
  sender: BatchSender,
  getPageId: () => string
): () => void {
  const timestamps: number[] = [];
  const windowMs = 10_000;

  const isCharacterKey = (e: KeyboardEvent) =>
    e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter';

  const isTextEntryTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  };

  const handler = (e: KeyboardEvent) => {
    if (!isTextEntryTarget(e.target) || !isCharacterKey(e)) return;

    const now = Date.now();
    timestamps.push(now);
    while (timestamps.length > 0 && now - timestamps[0] > windowMs) {
      timestamps.shift();
    }
    if (timestamps.length < 2) return;

    const elapsedMinutes = (now - timestamps[0]) / 60_000;
    const charsPerMinute = elapsedMinutes > 0 ? timestamps.length / elapsedMinutes : 0;

    sender.enqueue({
      appId: config.appId,
      endUserId: config.endUserId,
      pageId: getPageId(),
      metric: 'type_speed',
      value: Math.round(charsPerMinute),
      timestamp: now,
    });
  };

  document.addEventListener('keydown', handler, { passive: true });
  return () => document.removeEventListener('keydown', handler);
}
