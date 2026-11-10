import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { readWifiPeerStatus, WIFI_PEER_MAX_BYTES } from '../src/wifi-status-peer.ts';

const token = '27'.repeat(32);
const body = '{"version":1,"uptimeSeconds":22,"security":"wpa3"}';
const address = 'https://peer.example.net:8443';
const endpoint = address + '/v1/status';
const exec = promisify(execFile);

function response(text: string, length = text.length) {
  const message = new Response(text, { headers: { 'content-type': 'application/json', 'content-length': String(length) } });
  return { url: endpoint, status: message.status, redirected: false, headers: message.headers, body: message.body };
}

test('only requests the exact HTTPS status route with redirects and cookies disabled', async () => {
  const signal = new AbortController().signal;
  const status = await readWifiPeerStatus(address + '/', token, async (url, init) => {
    assert.equal(url, endpoint);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.headers.Authorization, 'Bearer ' + token);
    return response(body);
  }, signal);
  assert.equal(status.uptimeSeconds, 22);
  assert.equal(status.security, 'wpa3');
  let calls = 0;
  const noRequest = async () => { calls++; return response(body); };
  for (const invalid of ['http://peer.example.net', 'https://other@peer.example.net', address + '/other',
    address + '?other=1', 'https://127.1:8443', 'https://127.00.0.1:8443']) {
    await assert.rejects(readWifiPeerStatus(invalid, token, noRequest, signal), /HTTPS|IPv4/);
  }
  await assert.rejects(readWifiPeerStatus(address, 'invalid', noRequest, signal), /pairing token/);
  assert.equal(calls, 0);
});

test('rejects stale and out-of-contract replies before displaying status', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(readWifiPeerStatus(address, token, async () => ({ ...response(body), redirected: true }), signal), /specified address/);
  await assert.rejects(readWifiPeerStatus(address, token, async () => response(body, WIFI_PEER_MAX_BYTES + 1), signal), /invalid status/);
  await assert.rejects(readWifiPeerStatus(address, token, async () => response(body, body.length - 1), signal), /length/);
  await assert.rejects(readWifiPeerStatus(address, token, async () => response(body, body.length + 1), signal), /length/);
  await assert.rejects(readWifiPeerStatus(address, token, async () => response(body.replace('22', '-1')), signal), /uptime/);
  await assert.rejects(readWifiPeerStatus(address, token, async () => response(body.replace('}', ',"extra":true}')), signal), /fields/);
  const cancelled = new AbortController();
  await assert.rejects(readWifiPeerStatus(address, token, async (_url, init) => {
    cancelled.abort();
    assert.ok(init.signal.aborted);
    return response(body);
  }, cancelled.signal), /did not complete/);
});

test('the TypeScript client reads a real TLS response from the Linux companion', { skip: process.platform !== 'linux' }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'apex-wifi-peer-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cert = join(dir, 'cert.pem');
  const key = join(dir, 'key.pem');
  const credential = join(dir, 'token');
  await writeFile(credential, token + '\n', { mode: 0o600 });
  await exec('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2',
    '-subj', '/CN=APEX loopback test', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', key, '-out', cert]);

  const script = fileURLToPath(new URL('../tools/wifi-status-peer.py', import.meta.url));
  const peer = spawn('python3', [script, '--port', '0', '--cert', cert, '--key', key,
    '--token-file', credential, '--openwrt-encryption', 'sae-mixed'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(peer, 'close');
  const lines = createInterface({ input: peer.stdout });
  t.after(async () => { lines.close(); peer.kill(); await exited; });
  const [line] = await once(lines, 'line', { signal: AbortSignal.timeout(5000) });
  const port = /^APEX status peer listening on port (\d+)$/.exec(line)?.[1];
  assert.ok(port, 'The companion must publish its bound loopback port');

  // A child process loads the temporary trust anchor at startup. Certificate verification stays enabled.
  const client = new URL('../src/wifi-status-peer.ts', import.meta.url).href;
  const run = `import assert from 'node:assert/strict';
    import { readWifiPeerStatus } from ${JSON.stringify(client)};
    const origin = 'https://127.0.0.1:' + process.argv[1];
    const token = '27'.repeat(32);
    const signal = AbortSignal.timeout(5000);
    const status = await readWifiPeerStatus(origin, token, fetch, signal);
    assert.ok(Number.isInteger(status.uptimeSeconds) && status.uptimeSeconds >= 0);
    assert.equal(status.security, 'transition');
    await assert.rejects(readWifiPeerStatus(origin, '72'.repeat(32), fetch, signal), /rejected the pairing token/);
    const authorization = { Authorization: 'Bearer ' + token };
    const wrongPath = await fetch(origin + '/other', { headers: authorization, signal });
    assert.equal(wrongPath.status, 404);
    const write = await fetch(origin + '/v1/status', { method: 'POST', headers: authorization, signal });
    assert.equal(write.status, 501);`;
  await exec(process.execPath, ['--input-type=module', '-e', run, port], {
    env: { ...process.env, NODE_EXTRA_CA_CERTS: cert }, timeout: 10000,
  });
});
