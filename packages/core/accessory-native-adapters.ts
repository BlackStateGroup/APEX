import type { AccessoryTrustAdapters } from './accessory-trust.ts';
/** Structural boundary kept free of React Native so the actual adapter is testable. */
export interface NativeTrustProvider {
  isSupported(): boolean;
  randomChallenge(): number[];
  monotonicMilliseconds(): number;
  verifyEd25519(key: number[], message: number[], signature: number[]): Promise<boolean>;
}
export function nativeAccessoryTrustAdapters(provider: NativeTrustProvider): AccessoryTrustAdapters {
  if (provider.isSupported() !== true) throw new Error('Native Ed25519 verification unavailable');
  return {
    randomBytes(length) {
      if (length !== 32) throw new Error('Only 32-byte challenges are supported');
      const values = provider.randomChallenge();
      if (!Array.isArray(values) || values.length !== 32 || Array.from(values).some(v => !Number.isInteger(v) || v < 0 || v > 255)) throw new Error('Invalid native random bytes');
      return Uint8Array.from(values);
    },
    now: () => provider.monotonicMilliseconds(),
    verifyEd25519: (key, message, signature) => provider.verifyEd25519(Array.from(key), Array.from(message), Array.from(signature)),
  };
}
