import { AXP_READY } from '../../packages/core/ble-transport.ts';
import { encode, FrameDecoder, Kind, utf8 } from '../../packages/protocol/index.ts';

export function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export const tick = () => new Promise<void>(resolve => setImmediate(resolve));
export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
type Listener = (event: any) => void;
/** Independent host-only model. No Web Bluetooth globals, hardware or permission APIs. */
export function makeReviewHost() {
  const calls: string[] = []; const writes: Uint8Array[] = [];
  const listeners = new Map<string, Set<Listener>>();
  const deviceListeners = new Map<string, Set<Listener>>();
  const gates: Record<string, (() => Promise<any>) | undefined> = {};
  const run = async (name: string, fallback: () => any) => { calls.push(name); return gates[name] ? gates[name]!() : fallback(); };
  let readyOnStart = true;
  const notify: any = {
    properties: { notify: true, indicate: false }, value: undefined,
    addEventListener(type: string, listener: Listener) { calls.push(`add:${type}`); if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(listener); },
    removeEventListener(type: string, listener: Listener) { calls.push(`remove:${type}`); listeners.get(type)?.delete(listener); },
    startNotifications() { return run('start', () => { if (readyOnStart) emit(AXP_READY); return notify; }); },
    stopNotifications() { return run('stop', () => notify); },
  };
  function emit(bytes: Uint8Array, offset = 0) {
    const buffer = new Uint8Array(bytes.length + offset + 3); buffer.set(bytes, offset);
    const value = new DataView(buffer.buffer, offset, bytes.length); notify.value = value;
    for (const listener of [...(listeners.get('characteristicvaluechanged') ?? [])]) listener({ target: notify });
    return buffer;
  }
  const decoder = new FrameDecoder(frame => {
    const payload = frame.opcode === 1 ? utf8('{"id":"independent","board":"mock","firmware":"1","protocol":1,"source":"accessory"}') :
      frame.opcode === 2 ? utf8('{"operations":["system.info","system.capabilities","system.ping"]}') : frame.payload;
    const reply = encode({ ...frame, kind: Kind.Response, payload });
    for (let offset = 0; offset < reply.length; offset += 20) emit(reply.slice(offset, offset + 20), 4);
  });
  const write: any = { properties: { write: true, writeWithoutResponse: false }, writeValueWithResponse(bytes: Uint8Array) {
    const copy = new Uint8Array(bytes); writes.push(copy); return run('write', () => { decoder.push(copy); });
  } };
  const service: any = { getCharacteristic(uuid: string) { return run(`char:${uuid}`, () => uuid.includes('0002-') ? write : notify); } };
  const server: any = { connected: false,
    connect() { return run('connect', () => { server.connected = true; return server; }); },
    disconnect() { calls.push('disconnect'); if (gates.disconnect) return gates.disconnect(); server.connected = false; },
    getPrimaryService(uuid: string) { return run(`service:${uuid}`, () => service); },
  };
  const device: any = { id: 'DO-NOT-EXPOSE-browser-id', name: 'Independent accessory', gatt: server,
    addEventListener(type: string, listener: Listener) { calls.push(`device-add:${type}`); if (!deviceListeners.has(type)) deviceListeners.set(type, new Set()); deviceListeners.get(type)!.add(listener); },
    removeEventListener(type: string, listener: Listener) { calls.push(`device-remove:${type}`); deviceListeners.get(type)?.delete(listener); },
  };
  const requests: unknown[] = [];
  const bluetooth = { requestDevice(options: unknown) { requests.push(options); return run('choose', () => device); } };
  return { calls, writes, gates, notify, write, service, server, device, bluetooth, requests, listeners, deviceListeners, emit,
    setReady(value: boolean) { readyOnStart = value; },
    drop() { server.connected = false; for (const listener of [...(deviceListeners.get('gattserverdisconnected') ?? [])]) listener({ target: device }); },
  };
}
