import StillKinetic, {
  type CardBindResult,
  type Metric,
  type SpendingCapInput,
  type StillKineticConfig,
  type TrackEvent,
} from '@stillkinetic/web-sdk';
import {
  DesktopBillingPanel,
  type DesktopBillingPanelOptions,
} from './billing/DesktopBillingPanel';

export type {
  CardBindResult,
  DesktopBillingPanelOptions,
  Metric,
  SpendingCapInput,
  StillKineticConfig,
  TrackEvent,
};
export { ALL_METRICS } from '@stillkinetic/web-sdk';
export { DesktopBillingPanel } from './billing/DesktopBillingPanel';

export type DesktopRuntime = 'electron' | 'tauri' | 'webview';

export function detectDesktopRuntime(): DesktopRuntime {
  if (typeof window === 'undefined') return 'webview';
  const desktopWindow = window as Window & {
    process?: { versions?: { electron?: string } };
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  if (desktopWindow.process?.versions?.electron || navigator.userAgent.includes('Electron')) return 'electron';
  if (desktopWindow.__TAURI__ || desktopWindow.__TAURI_INTERNALS__) return 'tauri';
  return 'webview';
}

/**
 * Desktop facade over the web tracker, with a framework-neutral Stripe
 * card-and-cap panel for Electron, Tauri, and other HTML WebViews.
 */
export class StillKineticDesktop {
  private client: StillKinetic;
  readonly runtime: DesktopRuntime;

  constructor(private config: StillKineticConfig) {
    this.client = new StillKinetic(config);
    this.runtime = detectDesktopRuntime();
  }

  init(): Promise<boolean> { return this.client.init(); }
  start(): void { this.client.start(); }
  stop(): void { this.client.stop(); }
  get subscriptionActive(): boolean { return this.client.subscriptionActive; }
  get allowedMetrics(): string[] { return this.client.allowedMetrics; }

  async mountBillingPanel(
    target: string | HTMLElement,
    options: DesktopBillingPanelOptions = {},
  ): Promise<DesktopBillingPanel> {
    const panel = new DesktopBillingPanel(this.config, options);
    await panel.mount(target);
    return panel;
  }
}

export default StillKineticDesktop;
