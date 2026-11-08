/** Validate untrusted JSON before materializing it, without rewriting its bytes.
 * Duplicate decoded member names are ambiguous even when their values agree.
 * Bounds count UTF-16 code units and simultaneously open objects/arrays.
 */
export function parseBoundedJson(document: string, maxCharacters: number, maxDepth: number): unknown {
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 0 ||
      !Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > 64) throw new Error('Invalid JSON limits');
  if (typeof document !== 'string' || document.length > maxCharacters) throw new Error('JSON character limit');
  let offset = 0;
  const number = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  function whitespace() {
    while (document[offset] === ' ' || document[offset] === '\t' || document[offset] === '\r' || document[offset] === '\n') offset++;
  }
  function invalid(): never { throw new SyntaxError('Invalid JSON document'); }
  function string(): string {
    if (document[offset] !== '"') return invalid();
    const start = offset++;
    while (offset < document.length) {
      const character = document[offset++];
      if (character === '\\') offset++;
      else if (character === '"') {
        // Native string decoding validates escapes/control characters and resolves
        // escaped aliases (including surrogate pairs) before key comparison.
        return JSON.parse(document.slice(start, offset)) as string;
      }
    }
    return invalid();
  }
  function value(depth: number): void {
    whitespace();
    const character = document[offset];
    if (character === '{' || character === '[') {
      if (depth >= maxDepth) throw new Error('JSON depth limit');
      const isObject = character === '{';
      const close = isObject ? '}' : ']';
      const keys = new Set<string>();
      offset++; whitespace();
      if (document[offset] === close) { offset++; return; }
      while (true) {
        if (isObject) {
          const key = string();
          if (keys.has(key)) throw new Error('Duplicate JSON document key');
          keys.add(key);
          whitespace();
          if (document[offset++] !== ':') invalid();
        }
        value(depth + 1); whitespace();
        if (document[offset] === close) { offset++; return; }
        if (document[offset++] !== ',') invalid();
        whitespace();
      }
    }
    if (character === '"') { string(); return; }
    for (const literal of ['true', 'false', 'null']) {
      if (document.startsWith(literal, offset)) { offset += literal.length; return; }
    }
    number.lastIndex = offset;
    if (!number.exec(document)) invalid();
    offset = number.lastIndex;
  }
  value(0); whitespace();
  if (offset !== document.length) invalid();
  return JSON.parse(document) as unknown;
}
