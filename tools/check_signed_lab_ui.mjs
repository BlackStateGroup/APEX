#!/usr/bin/env node
// Real exported UI in a browser; this checks refusal without native providers.
// It is not evidence of phone transport, native signing or physical pairing.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
const root = resolve('build/signed-lab-web');
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const file = path === root ? resolve(root, 'index.html') : path;
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch(process.env.APEX_CHROMIUM ? {executablePath:process.env.APEX_CHROMIUM} : {});
  const page = await browser.newPage({viewport:{width:390,height:844}, deviceScaleFactor:1});
  const errors=[]; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.getByText('APEX / SIGNED-READ LAB', {exact:true}).waitFor();
  for (const name of ['Enable signed-read laboratory','Confirm key and read grants','Refresh attached USB devices','Read system.info','Read system.capabilities','Read system.ping']) {
    assert.equal(await page.getByRole('button', {name,exact:true}).isDisabled(), true, name);
  }
  assert.equal(await page.getByRole('textbox', {name:'Provisioned public key',exact:true}).isEditable(), false);
  assert.deepEqual(errors, []);
  await mkdir('build/lab-ui', {recursive:true});
  await page.screenshot({path:'build/lab-ui/unsupported-mobile.png',fullPage:true});
  console.log('Exported lab UI: mobile layout rendered, native-unavailable pairing/read controls refused, zero page errors.');
} finally { await browser?.close(); server.close(); }
