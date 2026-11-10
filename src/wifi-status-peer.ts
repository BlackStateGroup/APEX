import { isWifiSecurityMode, wifiSecurityFinding } from './wifi-security-report.ts';
import type { WifiSecurityMode } from './wifi-security-report.ts';

export const WIFI_PEER_MAX_BYTES = 512;
const REQUEST_TIMEOUT_MS = 5000;

export class WifiStatusError extends Error {}

type StatusRequest = (url: string, options: {
  method: 'GET'; redirect: 'error'; credentials: 'omit'; signal: AbortSignal;
  headers: Record<string, string>;
}) => Promise<Pick<Response, 'status' | 'url' | 'redirected' | 'headers' | 'body'>>;

export type WifiPeerStatus = {
  uptimeSeconds: number | null;
  security: WifiSecurityMode;
  finding: string;
};

function statusEndpoint(address: string): string {
  const match = /^https:\/\/([a-z0-9.-]+)(?::([1-9][0-9]{0,4}))?\/?$/i.exec(address.trim());
  const host = match?.[1]?.toLowerCase();
  const port = match?.[2];
  const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (!host || host.length > 253 || (port && Number(port) > 65535)) {
    throw new WifiStatusError('Enter an HTTPS host with an optional port.');
  }
  const labels = host.split('.');
  const lastLabel = labels.at(-1)!;
  // Reject alternate IPv4 spellings that platform URL parsers can rewrite.
  const validHost = /^(?:[0-9]+|0x[0-9a-f]*)$/.test(lastLabel)
    ? labels.length === 4 && labels.every(part => /^(?:0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255)
    : labels.length >= 2 && labels.every(part => label.test(part));
  if (!validHost) throw new WifiStatusError('Enter a fully qualified DNS name or an IPv4 address.');
  return 'https://' + host + (port && port !== '443' ? ':' + port : '') + '/v1/status';
}

export async function readWifiPeerStatus(address: string, pairingToken: string, request: StatusRequest,
  signal: AbortSignal): Promise<WifiPeerStatus> {
  const endpoint = statusEndpoint(address);
  const token = pairingToken.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(token)) throw new WifiStatusError('Enter the companion’s 64-character pairing token.');
  if (signal.aborted) throw new WifiStatusError('Status check cancelled.');

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, REQUEST_TIMEOUT_MS);
  try {
    const response = await request(endpoint, {
      method: 'GET', redirect: 'error', credentials: 'omit', signal: controller.signal,
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token, 'Cache-Control': 'no-store' },
    }).catch(() => { throw new WifiStatusError('Could not reach the companion over trusted HTTPS.'); });
    if (controller.signal.aborted || response.redirected || response.url !== endpoint) {
      throw new WifiStatusError('The status check did not complete at the specified address.');
    }
    if (response.status === 401) throw new WifiStatusError('The companion rejected the pairing token.');
    const length = response.headers.get('content-length') ?? '';
    const size = Number(length);
    if (response.status !== 200 || response.headers.get('content-type') !== 'application/json' ||
        !/^[1-9][0-9]{0,2}$/.test(length) || size > WIFI_PEER_MAX_BYTES) {
      throw new WifiStatusError('The companion returned an invalid status response.');
    }
    const body = response.body;
    if (!body) throw new WifiStatusError('The companion response has no status body.');
    const bytes = new Uint8Array(size);
    const reader = body.getReader();
    let offset = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (controller.signal.aborted) throw new WifiStatusError('Status check cancelled.');
        if (part.done) break;
        if (offset + part.value.length > size) throw new WifiStatusError('Invalid status response length.');
        bytes.set(part.value, offset);
        offset += part.value.length;
      }
    } finally {
      reader.releaseLock();
    }
    if (offset !== size) throw new WifiStatusError('Invalid status response length.');
    return parseWifiPeerStatus(String.fromCharCode(...bytes));
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
    controller.abort();
  }
}

function parseWifiPeerStatus(input: string): WifiPeerStatus {
  const report: unknown = JSON.parse(input);
  if (!report || typeof report !== 'object' || Array.isArray(report) || Object.keys(report).length !== 3 ||
      !('version' in report) || report.version !== 1 || !('security' in report) ||
      !isWifiSecurityMode(report.security) || !('uptimeSeconds' in report)) {
    throw new WifiStatusError('Invalid status response fields.');
  }
  const { security, uptimeSeconds } = report;
  if (uptimeSeconds !== null && (typeof uptimeSeconds !== 'number' || !Number.isInteger(uptimeSeconds) ||
      uptimeSeconds < 0 || uptimeSeconds > 0xffff_ffff)) {
    throw new WifiStatusError('Invalid uptime in status response.');
  }
  return { uptimeSeconds, security, finding: wifiSecurityFinding(security) };
}
