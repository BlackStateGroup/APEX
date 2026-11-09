import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { analyzeEvidenceGraph, MAX_EVIDENCE_GRAPH_CHARACTERS } from '../packages/core/evidence-graph.ts';

/** One explicitly selected local regular file. No network, execution, scanning or mutation. */
function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !args[0] || args[0].startsWith('--')) throw new Error('Usage: node tools/validate-evidence-graph.ts <document.json>');
  // Nonblocking open allows rejecting a FIFO before waiting for an external writer.
  const fd = openSync(args[0], constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    if (!fstatSync(fd).isFile()) throw new Error('Select a regular evidence graph file');
    // Bound bytes before decoding. Four bytes per code unit conservatively admits valid UTF-8.
    const maximum = MAX_EVIDENCE_GRAPH_CHARACTERS * 4;
    if (fstatSync(fd).size > maximum) throw new Error('Evidence graph file byte limit');
    const bytes = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length > maximum) throw new Error('Evidence graph file byte limit');
    const document = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
    process.stdout.write(`${JSON.stringify(analyzeEvidenceGraph(document), null, 2)}\n`);
  } finally { closeSync(fd); }
}
try { main(); }
catch (error) { process.stderr.write(`Evidence graph rejected: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
