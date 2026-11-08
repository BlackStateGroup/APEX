import * as Crypto from 'expo-crypto';
export const bundleDigest = (text: string): Promise<string> => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
