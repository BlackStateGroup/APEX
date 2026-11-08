import { WebAxpApplication } from '../experimental/web-axp-application.ts';
import { WebAxpManager } from '../experimental/web-axp.ts';
import type { WebAxpHost } from '../experimental/web-axp.ts';
let application: WebAxpApplication | null = null;
/** Property reads only. No getDevices, availability, permissions or GATT calls. */
export function browserAxpSupport(): string | null {
  if (typeof window === 'undefined' || !window.isSecureContext) return 'A secure browser context is required.';
  if (!(navigator as unknown as WebAxpHost).bluetooth) return 'Web Bluetooth is unavailable. Standard Safari/iOS is unsupported.';
  return null;
}
export function browserAxpForeground(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible';
}
/** Lazy module singleton: neither render nor construction acquires browser resources. */
export function getBrowserAxpApplication(): WebAxpApplication {
  if (!application) application = new WebAxpApplication(new WebAxpManager({
    get secureContext() { return typeof window !== 'undefined' && window.isSecureContext; },
    get bluetooth() { return typeof navigator === 'undefined' ? undefined : (navigator as unknown as WebAxpHost).bluetooth; },
  }));
  return application;
}
export function observeBrowserAxpLifecycle(application: WebAxpApplication, refresh: () => void): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};
  const visibility = () => { if (!browserAxpForeground()) application.suspend(); refresh(); };
  const hide = () => { application.suspend(); refresh(); };
  const show = () => refresh();
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
  return () => {
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show);
  };
}
