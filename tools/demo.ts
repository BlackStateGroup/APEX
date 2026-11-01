import { DeviceSession } from '../packages/core/session.ts';
import { FirmwareProcessTransport } from './process-transport.ts';
import { text, utf8 } from '../packages/protocol/index.ts';

const session = new DeviceSession(new FirmwareProcessTransport());
try {
  await session.open();
  const reply = await session.request('system.ping', utf8('APEX C/TypeScript round trip'));
  console.log(JSON.stringify({ source: session.source, identity: session.info, capabilities: session.capabilities, reply: text(reply) }, null, 2));
} finally { await session.close(); }
