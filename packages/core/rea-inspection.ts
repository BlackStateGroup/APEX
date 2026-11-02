export interface ReaElfInspection {
  engine: 'REA ELF note parser';
  evidenceId: string;
  artifact: { name: string; sha256: string; bytes: number; architecture: string; format: 'elf32' | 'elf64'; byteOrder: 'little' | 'big'; machine: number };
  coverage: 'complete' | 'partial';
  examinedEntries: number;
  buildIds: string[];
  noteRanges: { offset: number; bytes: number; kind: string }[];
  limitations: string[];
  provenance: 'Imported report; original artifact has not been verified on this device';
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a REA evidence object');
  return value as Record<string, unknown>;
};
function string(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\x00-\x1f]/.test(value)) throw new Error('Invalid REA text metadata');
  return value;
}
function integer(value: unknown, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max) throw new Error('Invalid REA numeric metadata');
  return Number(value);
}
function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f\d]{64}$/.test(value)) throw new Error('Invalid REA artifact digest');
  return value;
}
/** Import a bounded report as unverified data, never as an instruction or sensor attestation. */
export function parseReaElfEvidence(input: string): ReaElfInspection {
  if (input.length > 262144) throw new Error('REA evidence exceeds import limit');
  const raw = object(JSON.parse(input));
  const provider = object(raw.provider), subject = object(raw.subject), result = object(raw.normalized_result);
  if (raw.operation !== 'inspect_elf_notes' || raw.predicate_type !== 'rea.analysis' || provider.id !== 'rea-elf-notes' || provider.version !== '1' || subject.format !== 'elf') throw new Error('Unsupported REA inspection operation/provider');
  const evidenceId = string(raw.evidence_id, 80);
  if (!/^ev_[a-f\d]{64}$/.test(evidenceId)) throw new Error('Invalid REA evidence identifier');
  const artifact = object(result.artifact), digest = object(subject.digest);
  const hash = sha256(artifact.sha256);
  if (sha256(digest.sha256) !== hash) throw new Error('REA subject and artifact digests disagree');
  const bytes = integer(artifact.bytes, 67108864);
  if (bytes < 16 || !['elf32', 'elf64'].includes(String(result.format)) || !['little', 'big'].includes(String(result.byte_order))) throw new Error('Invalid ELF identity metadata');
  const coverage = object(result.coverage);
  if (!['complete', 'partial'].includes(String(coverage.status))) throw new Error('Unsupported REA coverage status');
  if (!Array.isArray(result.entries) || result.entries.length > 64) throw new Error('REA note count exceeds limit');
  const examinedEntries = integer(coverage.examined_entries, 64);
  if (examinedEntries !== result.entries.length) throw new Error('REA coverage count disagrees with observations');
  const buildIds = new Set<string>();
  const noteRanges = result.entries.map(value => {
    const entry = object(value), location = object(entry.location);
    const offset = integer(location.offset, bytes), length = integer(location.bytes, bytes);
    if (offset + length > bytes) throw new Error('REA note range exceeds artifact');
    if (entry.gnu !== null && entry.gnu !== undefined) {
      const id = object(entry.gnu).build_id_hex;
      if (id !== null && id !== undefined) {
        if (typeof id !== 'string' || !/^(?:[a-f\d]{2}){1,128}$/.test(id)) throw new Error('Invalid GNU build identifier');
        buildIds.add(id);
      }
    }
    return { offset, bytes: length, kind: string(entry.type_name, 64) };
  });
  if (buildIds.size > 8 || !Array.isArray(raw.limitations) || raw.limitations.length > 16) throw new Error('REA metadata exceeds limit');
  return {
    engine: 'REA ELF note parser', evidenceId,
    artifact: { name: string(subject.name, 128), sha256: hash, bytes, architecture: string(subject.architecture, 64), format: result.format as 'elf32' | 'elf64', byteOrder: result.byte_order as 'little' | 'big', machine: integer(result.machine, 65535) },
    coverage: coverage.status as 'complete' | 'partial', examinedEntries, buildIds: [...buildIds], noteRanges,
    limitations: ['ELF notes do not establish executable behaviour, protocol compatibility, authentication or credential access.', ...raw.limitations.map(value => string(value, 512))],
    provenance: 'Imported report; original artifact has not been verified on this device',
  };
}
