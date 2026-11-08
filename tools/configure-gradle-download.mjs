import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Expo regenerates this file during prebuild. Configure the wrapper bootstrap,
// not Gradle's daemon HTTP settings (the daemon does not exist at this point).
export const GRADLE_DOWNLOAD_TIMEOUT_MS = 60_000;

export function configureGradleDownload(properties) {
  const keys = new Set();
  for (const line of properties.split(/\r?\n/)) {
    if (/^\s*(?:[#!]|$)/.test(line)) continue;
    // Deliberately support only the generated template's simple properties form.
    // Reject escaped keys, continuations and duplicates rather than risk a later
    // Java-properties assignment overriding the setting we just changed.
    const entry = /^([A-Za-z][A-Za-z0-9]*)=(.*)$/.exec(line);
    if (!entry || /\\+$/.test(entry[2]) || keys.has(entry[1])) {
      throw new Error('Unexpected or duplicate Gradle wrapper property; review the generated template');
    }
    keys.add(entry[1]);
  }
  const timeout = /^networkTimeout=(\d+)\r?$/m.exec(properties);
  if (!keys.has('networkTimeout') || !timeout || !['10000', '60000'].includes(timeout[1])) {
    throw new Error('Expected Gradle wrapper networkTimeout=10000 or already configured 60000');
  }
  return properties.replace(/^networkTimeout=\d+(\r?)$/m, `networkTimeout=${GRADLE_DOWNLOAD_TIMEOUT_MS}$1`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error('Usage: node tools/configure-gradle-download.mjs <gradle-wrapper.properties>');
  const path = resolve(process.argv[2]);
  const before = await readFile(path, 'utf8');
  const after = configureGradleDownload(before);
  if (after !== before) await writeFile(path, after, 'utf8');
  console.log(`Gradle wrapper connect/read timeout: ${GRADLE_DOWNLOAD_TIMEOUT_MS}ms (no retry added)`);
}
