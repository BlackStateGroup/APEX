import type { WebAxpApplication } from '../experimental/web-axp-application.ts';
export function browserAxpSupport(): string | null { return 'Browser AXP is available only in supported secure web browsers.'; }
export function browserAxpForeground(): boolean { return false; }
export function getBrowserAxpApplication(): WebAxpApplication | null { return null; }
export function observeBrowserAxpLifecycle(_application: WebAxpApplication, _refresh: () => void): () => void { return () => {}; }
