import { parseDevicePassport, evaluateDeclaredReadScope, READ_OPERATIONS } from './device-intelligence.ts';
import type { DevicePassport, ReadOperation, ScopeDeclaration } from './device-intelligence.ts';

export type LabState = 'disconnected' | 'connected' | 'viewer-authenticated';
export type LabEvent = 'connect' | 'authenticate-viewer' | 'disconnect';
export interface SyntheticRouterFixture {
  kind: 'apex.synthetic-router';
  fixtureId: string;
  sourceSha256: string;
  health: 'synthetic-ready' | 'synthetic-degraded';
  versionLabel: string;
}
export interface LabResponse {
  operation: ReadOperation;
  source: 'synthetic-emulation';
  authenticatedAs: 'synthetic-viewer';
  rootAccess: 'unknown';
  content: Readonly<Record<string, string>>;
}

const id = /^[\w.:-]{1,80}$/;
const sha = /^[a-f0-9]{64}$/;

export function transitionLabState(state: LabState, event: LabEvent): LabState {
  if (event === 'disconnect' && ['connected', 'viewer-authenticated', 'disconnected'].includes(state)) return 'disconnected';
  if (state === 'disconnected' && event === 'connect') return 'connected';
  if (state === 'connected' && event === 'authenticate-viewer') return 'viewer-authenticated';
  throw new Error('Synthetic router protocol: denied transition');
}

/**
 * Synthetic router with strict declared read scope. No network socket, credentials,
 * native device, process privilege or physical operation exists in this fixture.
 */
export class SyntheticRouterLab {
  private state: LabState = 'disconnected';
  private readonly passport: DevicePassport;
  private readonly fixture: SyntheticRouterFixture;
  private readonly scope: ScopeDeclaration;

  constructor(passport: DevicePassport, fixture: SyntheticRouterFixture, scope: ScopeDeclaration) {
    const p = parseDevicePassport(JSON.stringify(passport));
    if (!fixture || fixture.kind !== 'apex.synthetic-router' || typeof fixture.fixtureId !== 'string' ||
        !id.test(fixture.fixtureId) || !sha.test(fixture.sourceSha256) ||
        !['synthetic-ready', 'synthetic-degraded'].includes(fixture.health) ||
        typeof fixture.versionLabel !== 'string' || fixture.versionLabel.length < 1 ||
        fixture.versionLabel.length > 64 || /[\x00-\x1f]/.test(fixture.versionLabel)) {
      throw new Error('Invalid synthetic router fixture');
    }
    if (fixture.sourceSha256 !== p.source.sha256 || scope.fixtureId !== fixture.fixtureId) {
      throw new Error('Synthetic router target mismatch');
    }
    this.passport = p;
    this.fixture = Object.freeze({...fixture});
    this.scope = Object.freeze({...scope, approvedOperations:Object.freeze([...scope.approvedOperations])});
  }

  get connectionState(): LabState { return this.state; }
  event(event: LabEvent): LabState {
    this.state = transitionLabState(this.state, event);
    return this.state;
  }

  read(operation: ReadOperation, nowMs: number): LabResponse {
    if (!READ_OPERATIONS.includes(operation)) throw new Error('Unknown or mutation operation denied');
    if (this.state !== 'viewer-authenticated') throw new Error('Synthetic management authentication required');
    const decision = evaluateDeclaredReadScope(this.passport, this.scope, operation, nowMs);
    if (!decision.eligible) throw new Error('Synthetic router denied: ' + decision.reason);
    let content: Record<string, string>;
    switch (operation) {
      case 'system.info': content = {format:this.passport.source.format, digest:this.passport.source.sha256}; break;
      case 'system.health': content = {health:this.fixture.health}; break;
      case 'system.version': content = {version:this.fixture.versionLabel}; break;
    }
    return Object.freeze({
      operation, source:'synthetic-emulation', authenticatedAs:'synthetic-viewer',
      rootAccess:'unknown', content:Object.freeze(content),
    });
  }
}
