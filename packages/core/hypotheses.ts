/** A data-only seam for optional AI providers. No hardware/transport reference crosses it. */
export interface ObservationSummary {
  id: string;
  kind: 'ir-pulses' | 'can-frames' | 'signal-metadata';
  inputSha256: string;
  summary: string;
}
export interface AnalysisProvider {
  id: string;
  location: 'local' | 'remote';
  suggest(observations: readonly ObservationSummary[], signal: AbortSignal): Promise<string>;
}
export interface Hypothesis {
  protocol: 'NEC' | 'CAN' | 'unknown';
  confidence: number;
  rationale: string;
  observationIds: string[];
  status: 'hypothesis';
}
export interface AnalysisSuggestion {
  provider: string;
  summary: string;
  hypotheses: Hypothesis[];
  status: 'unverified';
}

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || Object.keys(value).some(k => !keys.includes(k))) {
    throw new Error('Invalid analysis schema');
  }
  return value as Record<string, unknown>;
}
function boundedText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

export function validateSuggestion(json: string, observations: readonly ObservationSummary[], providerId: string): AnalysisSuggestion {
  if (typeof json !== 'string' || json.length > 16384) throw new Error('Analysis response exceeds limit');
  const output = record(JSON.parse(json), ['summary', 'hypotheses']);
  if (!boundedText(output.summary, 2048) || !Array.isArray(output.hypotheses) || output.hypotheses.length > 8) {
    throw new Error('Invalid analysis response bounds');
  }
  const known = new Set(observations.map(x => x.id));
  const hypotheses = output.hypotheses.map(value => {
    const candidate = record(value, ['protocol', 'confidence', 'rationale', 'observationIds']);
    if (!['NEC', 'CAN', 'unknown'].includes(String(candidate.protocol)) ||
        typeof candidate.confidence !== 'number' || !Number.isFinite(candidate.confidence) ||
        candidate.confidence < 0 || candidate.confidence > 1 || !boundedText(candidate.rationale, 2048) ||
        !Array.isArray(candidate.observationIds) || candidate.observationIds.length < 1 || candidate.observationIds.length > 16 ||
        new Set(candidate.observationIds).size !== candidate.observationIds.length ||
        candidate.observationIds.some(id => typeof id !== 'string' || !known.has(id))) {
      throw new Error('Invalid hypothesis or invented evidence reference');
    }
    return {
      protocol: candidate.protocol as Hypothesis['protocol'], confidence: candidate.confidence,
      rationale: candidate.rationale, observationIds: [...candidate.observationIds] as string[], status: 'hypothesis' as const,
    };
  });
  return { provider: providerId, summary: output.summary, hypotheses, status: 'unverified' };
}

export async function suggestProtocols(provider: AnalysisProvider, observations: readonly ObservationSummary[], options: { allowRemoteDataExport?: boolean; timeoutMs?: number } = {}): Promise<AnalysisSuggestion> {
  if (!/^[\w.:-]{1,80}$/.test(provider.id) || !['local', 'remote'].includes(provider.location)) throw new Error('Invalid analysis provider');
  if (provider.location === 'remote' && options.allowRemoteDataExport !== true) throw new Error('Explicit data-export selection required');
  const timeoutMs = options.timeoutMs ?? 10000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error('Invalid analysis timeout');
  if (!Array.isArray(observations) || observations.length < 1 || observations.length > 64) throw new Error('Observation count exceeds bounds');
  const ids = new Set<string>(); let characters = 0;
  const selected = observations.map(value => {
    const observation = record(value, ['id', 'kind', 'inputSha256', 'summary']);
    if (typeof observation.id !== 'string' || !/^[\w.:-]{1,80}$/.test(observation.id) || ids.has(observation.id) ||
        !['ir-pulses', 'can-frames', 'signal-metadata'].includes(String(observation.kind)) ||
        typeof observation.inputSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(observation.inputSha256) || !boundedText(observation.summary, 1024)) {
      throw new Error('Invalid observation summary');
    }
    ids.add(observation.id); characters += observation.summary.length;
    return Object.freeze({ id: observation.id, kind: observation.kind as ObservationSummary['kind'], inputSha256: observation.inputSha256, summary: observation.summary });
  });
  if (characters > 32768) throw new Error('Observation summaries exceed size limit');
  // Providers return bounded structured data, never code, commands or execution authority.
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('Analysis provider timed out')); }, timeoutMs);
  });
  try {
    const response = await Promise.race([provider.suggest(Object.freeze(selected), controller.signal), timedOut]);
    return validateSuggestion(response, selected, provider.id);
  } finally { clearTimeout(timer); }
}
