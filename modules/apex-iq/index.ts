import { requireOptionalNativeModule } from 'expo-modules-core';

export interface ApexIqCapabilities {
  readonly available: boolean;
  readonly contractVersion: 1;
  readonly backend: 'cpp';
  readonly cancellation: 'between-frames';
  readonly mobileRust: false;
}
export interface ApexIqNativeModule {
  capabilities(): ApexIqCapabilities;
  openSession(): number;
  /** Must succeed synchronously before execute is enqueued. One job process-wide. */
  reserve(session: number, request: number): void;
  execute(request: Uint8Array): Promise<Uint8Array>;
  /** Requests cancellation. Completion, not this return, acknowledges native drain. */
  cancel(session: number, request: number): void;
  closeSession(session: number): void;
}

/** Absent on iOS, web, Expo Go, and binaries built without this local module. */
export const nativeIq = requireOptionalNativeModule<ApexIqNativeModule>('ApexIq');
