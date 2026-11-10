import { requireOptionalNativeModule } from 'expo-modules-core';
export interface ApexTrustNative {
  isSupported(): boolean;
  randomChallenge(): number[];
  monotonicMilliseconds(): number;
  verifyEd25519(key: number[], message: number[], signature: number[]): Promise<boolean>;
}
export const nativeTrust = requireOptionalNativeModule<ApexTrustNative>('ApexTrust');
