import { parseBoundedJson } from './bounded-json.ts';

/** Local, data-only research links. No transport, provider, storage or execution authority. */
export const MAX_EVIDENCE_GRAPH_CHARACTERS = 262144;
export const MAX_EVIDENCE_GRAPH_NODES = 256;
export const MAX_EVIDENCE_GRAPH_REFERENCES = 1024;
export const EVIDENCE_GRAPH_CAVEAT = 'Links, labels, origins, experiment assignments and confidence are declarations. They do not authenticate a device, verify artifact bytes, establish independent samples or prove physical truth. Confidence is uncalibrated and is never increased by graph connectivity.';

type Origin = 'synthetic-fixture' | 'user-supplied' | 'native-capture';
type Relation = 'supports' | 'contradicts' | 'inconclusive';
type Subset = 'discovery' | 'held-out' | 'unspecified';
export interface GraphDevice {
  readonly id: string;
  readonly label: string;
  readonly scope: string;
}
export interface GraphExperiment {
  readonly id: string;
  readonly question: string;
  readonly method: string;
  readonly deviceIds: readonly string[];
}
export interface GraphRecording {
  readonly id: string;
  readonly label: string;
  readonly experimentId: string;
  readonly deviceId: string;
  readonly artifact: { readonly sha256: string; readonly byteLength: number; readonly format: string };
  readonly origin: Origin;
}
export interface GraphHypothesis {
  readonly id: string;
  readonly statement: string;
  readonly deviceIds: readonly string[];
  readonly experimentIds: readonly string[];
  readonly confidence: {
    readonly value: number | null;
    readonly source: 'operator-declared' | 'model-declared';
    readonly rationale: string;
  };
  readonly evidence: readonly {
    readonly recordingId: string;
    readonly relation: Relation;
    readonly subset: Subset;
  }[];
}
export interface EvidenceGraph {
  readonly schemaVersion: 1;
  readonly devices: readonly GraphDevice[];
  readonly experiments: readonly GraphExperiment[];
  readonly recordings: readonly GraphRecording[];
  readonly hypotheses: readonly GraphHypothesis[];
}
export interface EvidenceGraphEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: 'includes-device' | 'recorded-in' | 'attributed-to' | 'about-device' | 'tested-in' | Relation;
  readonly subset: Subset | null;
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) {
    throw new Error('Invalid evidence graph schema');
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum = 1024): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('Invalid evidence graph text');
  }
  return value;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(value)) throw new Error('Invalid evidence graph ID');
  return value;
}
function values<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error('Invalid evidence graph declaration');
  return value as T;
}
function list(value: unknown, max: number, min = 0): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error('Evidence graph count limit');
  return value;
}
function refs(value: unknown, min = 1): readonly string[] {
  const result = list(value, 32, min).map(id);
  if (new Set(result).size !== result.length) throw new Error('Duplicate evidence graph reference');
  return Object.freeze(result);
}
function frozen<T extends object>(value: T): Readonly<T> { return Object.freeze(value); }

/** Strict JSON ingress: duplicates, unknown fields and dangling/ill-typed links reject atomically. */
export function parseEvidenceGraph(document: string): EvidenceGraph {
  const input = object(parseBoundedJson(document, MAX_EVIDENCE_GRAPH_CHARACTERS, 5),
    ['schemaVersion', 'devices', 'experiments', 'recordings', 'hypotheses']);
  if (input.schemaVersion !== 1) throw new Error('Unsupported evidence graph version');
  const rawDevices = list(input.devices, MAX_EVIDENCE_GRAPH_NODES);
  const rawExperiments = list(input.experiments, MAX_EVIDENCE_GRAPH_NODES);
  const rawRecordings = list(input.recordings, MAX_EVIDENCE_GRAPH_NODES);
  const rawHypotheses = list(input.hypotheses, MAX_EVIDENCE_GRAPH_NODES);
  if (rawDevices.length + rawExperiments.length + rawRecordings.length + rawHypotheses.length > MAX_EVIDENCE_GRAPH_NODES) {
    throw new Error('Evidence graph total node limit');
  }
  const devices = rawDevices.map(value => {
    const row = object(value, ['id', 'label', 'scope']);
    return frozen({ id: id(row.id), label: text(row.label, 256), scope: text(row.scope) });
  });
  const experiments = rawExperiments.map(value => {
    const row = object(value, ['id', 'question', 'method', 'deviceIds']);
    return frozen({ id: id(row.id), question: text(row.question), method: text(row.method, 2048), deviceIds: refs(row.deviceIds) });
  });
  const recordings = rawRecordings.map(value => {
    const row = object(value, ['id', 'label', 'experimentId', 'deviceId', 'artifact', 'origin']);
    const artifact = object(row.artifact, ['sha256', 'byteLength', 'format']);
    if (typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
        typeof artifact.byteLength !== 'number' || !Number.isSafeInteger(artifact.byteLength) ||
        Object.is(artifact.byteLength, -0) || artifact.byteLength < 0 || artifact.byteLength > 1073741824) {
      throw new Error('Invalid declared recording artifact');
    }
    return frozen({ id: id(row.id), label: text(row.label, 256), experimentId: id(row.experimentId), deviceId: id(row.deviceId),
      artifact: frozen({ sha256: artifact.sha256, byteLength: artifact.byteLength, format: text(artifact.format, 80) }),
      origin: values(row.origin, ['synthetic-fixture', 'user-supplied', 'native-capture'] as const) });
  });
  const hypotheses = rawHypotheses.map(value => {
    const row = object(value, ['id', 'statement', 'deviceIds', 'experimentIds', 'confidence', 'evidence']);
    const confidence = object(row.confidence, ['value', 'source', 'rationale']);
    if (confidence.value !== null && (typeof confidence.value !== 'number' || !Number.isFinite(confidence.value) ||
        Object.is(confidence.value, -0) || confidence.value < 0 || confidence.value > 1)) throw new Error('Invalid declared confidence');
    const evidence = list(row.evidence, 64).map(value => {
      const entry = object(value, ['recordingId', 'relation', 'subset']);
      return frozen({ recordingId: id(entry.recordingId), relation: values(entry.relation, ['supports', 'contradicts', 'inconclusive'] as const),
        subset: values(entry.subset, ['discovery', 'held-out', 'unspecified'] as const) });
    });
    if (new Set(evidence.map(entry => entry.recordingId)).size !== evidence.length) throw new Error('Duplicate hypothesis recording reference');
    return frozen({ id: id(row.id), statement: text(row.statement, 2048), deviceIds: refs(row.deviceIds), experimentIds: refs(row.experimentIds),
      confidence: frozen({ value: confidence.value, source: values(confidence.source, ['operator-declared', 'model-declared'] as const),
        rationale: text(confidence.rationale, 2048) }), evidence: frozen(evidence) });
  });
  const nodeIds = [...devices, ...experiments, ...recordings, ...hypotheses].map(node => node.id);
  if (new Set(nodeIds).size !== nodeIds.length) throw new Error('Duplicate evidence graph node ID');
  const byDevice = new Map(devices.map(node => [node.id, node]));
  const byExperiment = new Map(experiments.map(node => [node.id, node]));
  const byRecording = new Map(recordings.map(node => [node.id, node]));
  let references = 0;
  for (const experiment of experiments) {
    references += experiment.deviceIds.length;
    if (experiment.deviceIds.some(device => !byDevice.has(device))) throw new Error('Unknown experiment device');
  }
  for (const recording of recordings) {
    references += 2;
    if (!byExperiment.get(recording.experimentId)?.deviceIds.includes(recording.deviceId)) throw new Error('Recording device outside experiment scope');
  }
  const lengths = new Map<string, number>();
  for (const recording of recordings) {
    const previous = lengths.get(recording.artifact.sha256);
    if (previous !== undefined && previous !== recording.artifact.byteLength) throw new Error('Conflicting lengths for declared artifact digest');
    lengths.set(recording.artifact.sha256, recording.artifact.byteLength);
  }
  for (const hypothesis of hypotheses) {
    references += hypothesis.deviceIds.length + hypothesis.experimentIds.length + hypothesis.evidence.length;
    if (hypothesis.deviceIds.some(device => !byDevice.has(device)) ||
        hypothesis.experimentIds.some(experiment => !byExperiment.has(experiment))) throw new Error('Unknown hypothesis scope reference');
    if (hypothesis.deviceIds.some(device => !hypothesis.experimentIds.some(experiment => byExperiment.get(experiment)!.deviceIds.includes(device))) ||
        hypothesis.experimentIds.some(experiment => !byExperiment.get(experiment)!.deviceIds.some(device => hypothesis.deviceIds.includes(device)))) {
      throw new Error('Hypothesis device and experiment scopes do not intersect');
    }
    for (const evidence of hypothesis.evidence) {
      const recording = byRecording.get(evidence.recordingId);
      if (!recording || !hypothesis.experimentIds.includes(recording.experimentId) || !hypothesis.deviceIds.includes(recording.deviceId)) {
        throw new Error('Hypothesis recording outside declared scope');
      }
    }
  }
  if (references > MAX_EVIDENCE_GRAPH_REFERENCES) throw new Error('Evidence graph total reference limit');
  return frozen({ schemaVersion: 1 as const, devices: frozen(devices), experiments: frozen(experiments), recordings: frozen(recordings), hypotheses: frozen(hypotheses) });
}

/** Report rebuilt only from the strict document. No caller-supplied graph can bypass ingress. */
export function analyzeEvidenceGraph(document: string) {
  const graph = parseEvidenceGraph(document);
  const edges: EvidenceGraphEdge[] = [];
  const edge = (from: string, to: string, relation: EvidenceGraphEdge['relation'], subset: Subset | null = null) => {
    edges.push(frozen({ from, to, relation, subset }));
  };
  for (const experiment of graph.experiments) for (const device of experiment.deviceIds) edge(experiment.id, device, 'includes-device');
  for (const recording of graph.recordings) {
    edge(recording.id, recording.experimentId, 'recorded-in');
    edge(recording.id, recording.deviceId, 'attributed-to');
  }
  const recordings = new Map(graph.recordings.map(node => [node.id, node]));
  const hypotheses = graph.hypotheses.map(hypothesis => {
    for (const device of hypothesis.deviceIds) edge(hypothesis.id, device, 'about-device');
    for (const experiment of hypothesis.experimentIds) edge(hypothesis.id, experiment, 'tested-in');
    const distinct = new Map<string, { ids: string[]; relations: Set<Relation>; subsets: Set<Subset>; origins: Set<Origin> }>();
    for (const evidence of hypothesis.evidence) {
      edge(evidence.recordingId, hypothesis.id, evidence.relation, evidence.subset);
      const recording = recordings.get(evidence.recordingId)!;
      const artifact = distinct.get(recording.artifact.sha256) ?? { ids: [], relations: new Set(), subsets: new Set(), origins: new Set() };
      artifact.ids.push(recording.id); artifact.relations.add(evidence.relation); artifact.subsets.add(evidence.subset); artifact.origins.add(recording.origin);
      distinct.set(recording.artifact.sha256, artifact);
    }
    const artifacts = [...distinct].map(([sha256, item]) => frozen({ sha256, recordingIds: frozen(item.ids),
      relations: frozen([...item.relations]), subsets: frozen([...item.subsets]), origins: frozen([...item.origins]) }));
    const supporting = artifacts.filter(item => item.relations.includes('supports')).length;
    const contradicting = artifacts.filter(item => item.relations.includes('contradicts')).length;
    const inconclusive = artifacts.filter(item => item.relations.includes('inconclusive')).length;
    const overlap = artifacts.filter(item => item.subsets.includes('discovery') && item.subsets.includes('held-out')).map(item => item.sha256);
    const conflicts = artifacts.filter(item => item.relations.length > 1).map(item => item.sha256);
    const mixedOrigins = artifacts.filter(item => item.origins.length > 1).map(item => item.sha256);
    const warnings: string[] = [];
    if (!artifacts.length) warnings.push('No linked recording evidence.');
    if (overlap.length) warnings.push('The same declared content appears in discovery and held-out evidence; the split is not independent.');
    if (conflicts.length) warnings.push('The same declared content has multiple evidence interpretations.');
    if (mixedOrigins.length) warnings.push('The same declared content has conflicting origin labels.');
    if (artifacts.some(item => item.recordingIds.length > 1)) warnings.push('Repeated content is grouped by declared digest, not counted as independent support.');
    if (contradicting) warnings.push('Contradicting evidence remains visible; declared confidence is not recalculated.');
    return frozen({ id: hypothesis.id, status: 'hypothesis' as const, declaredConfidence: hypothesis.confidence,
      confidenceCalibration: 'not-established' as const, evidenceState: supporting && contradicting ? 'mixed' : supporting ? 'support-linked' : contradicting ? 'contradiction-linked' : inconclusive ? 'inconclusive-only' : 'no-evidence',
      recordingReferences: hypothesis.evidence.length, distinctDeclaredArtifacts: artifacts.length,
      supportingArtifacts: supporting, contradictingArtifacts: contradicting, inconclusiveArtifacts: inconclusive,
      discoveryHeldOutOverlap: frozen(overlap), conflictingInterpretations: frozen(conflicts), conflictingOrigins: frozen(mixedOrigins),
      artifacts: frozen(artifacts), warnings: frozen(warnings) });
  });
  return frozen({ schemaVersion: 1 as const, analysis: 'declared-evidence-graph' as const, graph, edges: frozen(edges), hypotheses: frozen(hypotheses),
    identityStatus: 'not-authenticated' as const, artifactIntegrity: 'not-verified' as const,
    sampleIndependence: 'not-established' as const, caveat: EVIDENCE_GRAPH_CAVEAT });
}
