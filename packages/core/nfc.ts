export interface NfcStatus { available: boolean; enabled: boolean; platform: 'ios' | 'android' | 'web'; }
export interface NfcObservation {
  id: string | null;
  technologies: string[];
  records: { tnf: number; type: string; payloadLength: number }[];
  source: 'nfc';
  platform: NfcStatus['platform'];
  observedAt: string;
}
export interface NfcBackend {
  status(): Promise<NfcStatus>;
  begin(onTag: (raw: unknown) => void, onClosed: (error?: Error) => void): Promise<() => Promise<void>>;
}

/** Retain metadata only; no record payload or credential content is stored. */
export function normaliseNfcTag(raw: unknown, platform: NfcStatus['platform'], now = new Date()): NfcObservation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid NFC observation');
  const tag = raw as Record<string, unknown>;
  const id = typeof tag.id === 'string' && /^[a-f\d]{2,64}$/i.test(tag.id) ? tag.id.toLowerCase() : null;
  const technologies = Array.isArray(tag.techTypes) ? tag.techTypes.slice(0, 16).filter((x): x is string => typeof x === 'string' && x.length <= 128) :
    typeof tag.tech === 'string' && tag.tech.length <= 128 ? [tag.tech] : typeof tag.type === 'string' && tag.type.length <= 128 ? [tag.type] : [];
  if (tag.ndefMessage !== undefined && (!Array.isArray(tag.ndefMessage) || tag.ndefMessage.length > 64)) throw new Error('NDEF record count exceeds limit');
  const records = (Array.isArray(tag.ndefMessage) ? tag.ndefMessage : []).slice(0, 16).map(value => {
    if (!value || typeof value !== 'object') throw new Error('Invalid NDEF record');
    const record = value as Record<string, unknown>;
    if (!Number.isInteger(record.tnf) || Number(record.tnf) < 0 || Number(record.tnf) > 7 || !Array.isArray(record.payload) || record.payload.length > 1048576) throw new Error('Invalid NDEF metadata');
    let type = '';
    if (typeof record.type === 'string') type = record.type.slice(0, 64);
    else if (Array.isArray(record.type) && record.type.length <= 64 && record.type.every(x => Number.isInteger(x) && x >= 0 && x <= 255)) type = String.fromCharCode(...record.type);
    else throw new Error('Invalid NDEF type');
    return { tnf: Number(record.tnf), type, payloadLength: record.payload.length };
  });
  return { id, technologies, records, platform, source: 'nfc', observedAt: now.toISOString() };
}

export class NfcReader {
  private backend: NfcBackend;
  private cleanup: (() => Promise<void>) | null = null;
  private tail = Promise.resolve();
  private generation = 0;
  state: 'idle' | 'starting' | 'reading' | 'stopping' = 'idle';
  private callbacks: { onState?: (state: NfcReader['state']) => void; onTag: (tag: NfcObservation) => void; onError: (error: Error) => void };
  constructor(backend: NfcBackend, callbacks: NfcReader['callbacks']) { this.backend = backend; this.callbacks = callbacks; }
  private setState(state: NfcReader['state']) { this.state = state; this.callbacks.onState?.(state); }
  private enqueue(operation: () => Promise<void>): Promise<void> { const task = this.tail.then(operation); this.tail = task.catch(() => {}); return task; }
  start(): Promise<void> {
    if (this.state !== 'idle') return Promise.reject(new Error('NFC reader is already active'));
    const generation = ++this.generation; this.setState('starting');
    return this.enqueue(async () => {
      try {
        const status = await this.backend.status();
        if (generation !== this.generation) { this.setState('idle'); return; }
        if (!status.available) throw new Error('NFC is unavailable on this device or runtime');
        if (!status.enabled) throw new Error('Enable NFC in device settings');
        const stop = await this.backend.begin(raw => {
          if (generation !== this.generation) return;
          try { this.callbacks.onTag(normaliseNfcTag(raw, status.platform)); }
          catch (error) { this.callbacks.onError(error instanceof Error ? error : new Error(String(error))); }
        }, error => {
          if (generation !== this.generation) return;
          ++this.generation; this.cleanup = null; this.setState('idle');
          if (error) this.callbacks.onError(error);
        });
        if (generation !== this.generation) { await stop(); this.setState('idle'); return; }
        this.cleanup = stop; this.setState('reading');
      } catch (error) { this.setState('idle'); throw error; }
    });
  }
  stop(): Promise<void> {
    ++this.generation;
    return this.enqueue(async () => {
      const stop = this.cleanup; this.cleanup = null;
      if (stop) this.setState('stopping');
      try { await stop?.(); } finally { this.setState('idle'); }
    });
  }
}
