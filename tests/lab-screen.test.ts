import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { SignedReadLabController } from '../src/signed-read-lab-controller.ts';

test('actual pairing screen requires full comparison and grants, resets comparison on edits and revokes in background', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'apex-lab-screen-'));
  const states: any[] = []; let cursor = 0, mounted = false, cleanup: (() => void) | undefined;
  let lifecycle: (state: string) => void = () => {}; let connects = 0, writes = 0, closes = 0;
  const turn = () => new Promise<void>(r => setImmediate(r));
  try {
    execFileSync(process.execPath, [fileURLToPath(new URL('bin/tsc', import.meta.resolve('typescript/package.json'))),
      '--ignoreConfig', '--noCheck', '--noResolve', '--jsx', 'react', '--target', 'es2022', '--module', 'esnext',
      '--outDir', dir, 'src/SignedReadLabScreen.tsx'], { env: { ...process.env, GOMAXPROCS: '4' } });
    const code = readFileSync(join(dir, 'SignedReadLabScreen.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export function SignedReadLabScreen', 'function SignedReadLabScreen');
    const useState = (initial: any) => { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value: any) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; };
    const useEffect = (fn: () => (() => void)) => { if (!mounted) { mounted = true; cleanup = fn(); } };
    const dependencies = () => ({ adapters: { randomBytes: (n: number) => randomBytes(n), now: () => performance.now(), verifyEd25519: async () => false },
      usbUnavailable: null, listDevices: async () => [{ id: 1, vendorId: 2, productId: 3, name: 'Untrusted USB descriptor' }],
      createTransport: () => ({ source: 'usb' as const, connect: async () => { connects++; }, write: async () => { writes++; }, disconnect: async () => { closes++; }, onData: () => () => {}, onDisconnect: () => () => {} }) });
    const renderComponent = new Function('React', 'useEffect', 'useState', 'AppState', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View', 'SignedReadLabController', 'signedLabDependencies', code + ';return SignedReadLabScreen;')(
      React, useEffect, useState, { currentState: 'active', addEventListener: (_: string, fn: typeof lifecycle) => { lifecycle = fn; return { remove() {} }; } },
      'Pressable', 'ScrollView', 'Text', 'TextInput', 'View', SignedReadLabController, dependencies);
    function nodes(node: any): any[] { return !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)]; }
    function find(label: string) { cursor = 0; const node = nodes(renderComponent()).find(n => n.props?.accessibilityLabel === label); assert.ok(node, label); return node; }
    function press(label: string) { const node = find(label); assert.notEqual(node.props.disabled, true, label); node.props.onPress(); }
    function edit(label: string, value: string) { const node = find(label); assert.notEqual(node.props.editable, false); node.props.onChangeText(value); }
    assert.equal(find('Confirm key and read grants').props.disabled, true); assert.equal(connects, 0);
    press('Enable signed-read laboratory');
    const key = randomBytes(32).toString('hex'); edit('Provisioned public key', key); edit('Confirm full public key', key);
    press('I own or am authorised to use this lab accessory'); press('I independently compared the entire public key');
    assert.equal(find('Confirm key and read grants').props.disabled, true);
    press('system.ping'); assert.equal(find('Confirm key and read grants').props.disabled, false);
    edit('Provisioned public key', key + '0'); assert.equal(find('Confirm key and read grants').props.disabled, true);
    edit('Provisioned public key', key); assert.equal(find('I independently compared the entire public key').props.accessibilityState.checked, false);
    press('I independently compared the entire public key'); press('Confirm key and read grants');
    assert.equal(find('Provisioned public key').props.editable, false); assert.equal(connects, 0);
    press('Refresh attached USB devices'); await turn(); press('Connect lab USB 1'); await turn();
    assert.equal(connects, 1); assert.equal(writes, 0);
    assert.equal(find('Read system.info').props.disabled, true); assert.equal(find('Read system.ping').props.disabled, false);
    lifecycle('background'); await turn(); assert.equal(closes, 1);
    const controller = states[0] as SignedReadLabController; assert.equal(controller.snapshot().pairing, null);
    lifecycle('active'); assert.equal(find('Read system.ping').props.disabled, true);
    assert.equal(find('I independently compared the entire public key').props.accessibilityState.checked, false);
    assert.equal(controller.snapshot().enabled, false); assert.equal(writes, 0);
  } finally { cleanup?.(); rmSync(dir, { recursive: true, force: true }); }
});
