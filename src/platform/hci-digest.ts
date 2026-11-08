/** Hash exact decoded bytes, never the hex text. Local only. */
export async function hciDigest(bytes: Uint8Array): Promise<string> {
 const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
 return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
