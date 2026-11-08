/** Local hashing only; no journal or network access. */
export async function bundleDigest(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
}
