import * as Crypto from 'expo-crypto';
/** Expo byte-buffer digest, not digestStringAsync. Local only. */
export async function hciDigest(bytes: Uint8Array): Promise<string> {
 const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes));
 return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
