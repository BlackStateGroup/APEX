import * as Crypto from 'expo-crypto';
import type { IqByteHasher } from '../../packages/core/iq-offline.ts';
/** Exact byte digest via existing Expo Crypto. Source/mock validation is not native runtime acceptance. */
export const iqByteHasher: IqByteHasher = Object.freeze({
 async digest(algorithm: 'SHA-256' | 'SHA-512', bytes: Uint8Array): Promise<string> {
  if (algorithm !== 'SHA-256' && algorithm !== 'SHA-512') throw new Error('Unsupported IQ digest algorithm');
  const digest = await Crypto.digest(algorithm === 'SHA-256' ? Crypto.CryptoDigestAlgorithm.SHA256 : Crypto.CryptoDigestAlgorithm.SHA512,new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 }
});
