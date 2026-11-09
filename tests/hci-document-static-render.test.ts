/**
 * Actual repository TSX rendered by React DOM server, with only RN primitives mocked. Static rendering does NOT execute effects,
 * events or native callbacks. This is not browser or phone acceptance coverage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire, registerHooks } from 'node:module';
import React from 'react';
const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server') as { renderToStaticMarkup(element: React.ReactElement): string };

import { hciDigest } from '../src/platform/hci-digest.ts';
import { HciWorkbenchController as Controller, HCI_EXAMPLE } from '../src/hci-workbench.ts';
import { HciDocumentController } from '../src/hci-document-workbench.ts';
import type { HciDocumentState } from '../src/hci-document-workbench.ts';
import type { HciDocumentViewProps } from '../src/HciDocumentWorkbench.tsx';
const componentUrl = new URL('../src/HciDocumentWorkbench.tsx', import.meta.url).href;
const reopenUrl = new URL('../src/HciEvidenceReopen.tsx', import.meta.url).href;
const urls = [reopenUrl, componentUrl, new URL('../src/HciWorkbench.tsx', import.meta.url).href];
// Deliberately narrow host projection, not RN layout, event or accessibility emulation.
const primitives = {
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: any) => React.createElement('div', null, children),
  Text: ({ children, accessibilityLabel, accessibilityLiveRegion, selectable }: any) => React.createElement('span', { 'aria-label': accessibilityLabel, 'aria-live': accessibilityLiveRegion, 'data-selectable': selectable ? 'true' : undefined }, children),
  TextInput: ({ value, accessibilityLabel }: any) => React.createElement('textarea', { defaultValue: value, 'aria-label': accessibilityLabel }),
  Pressable: ({ children, disabled, accessibilityLabel, accessibilityState }: any) => React.createElement('button', { disabled, 'aria-label': accessibilityLabel, 'aria-expanded': accessibilityState?.expanded }, children),
};
(globalThis as any).__apexHciStaticRender = primitives;
// TypeScript 7 provides a local CLI rather than the old transpileModule API.
// Emit to a disposable directory; load only the allowlisted TSX output.
// This is transpilation, not a replacement for the separate full typecheck.
const output = mkdtempSync(join(tmpdir(), 'apex-static-render-'));
try {
  execFileSync(process.execPath, [fileURLToPath(new URL('bin/tsc', import.meta.resolve('typescript/package.json'))),
    '--ignoreConfig', '--noCheck', '--jsx', 'react', '--target', 'es2022', '--module', 'esnext',
    '--outDir', output, '--rootDir', '.', 'src/HciDocumentWorkbench.tsx', 'src/HciEvidenceReopen.tsx'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', npm_config_offline: 'true',
      npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' },
    stdio: 'pipe',
  });
} catch (error) { rmSync(output, { recursive: true, force: true }); throw error; }
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (urls.includes(context.parentURL!) && specifier === 'react-native') {
      const source = 'export const { StyleSheet, View, Text, TextInput, Pressable } = globalThis.__apexHciStaticRender;';
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    if (urls.includes(context.parentURL!) && specifier === './platform/hci-digest') return next('./platform/hci-digest.ts', context);
    if (urls.includes(context.parentURL!) && specifier === './platform/hci-input') return next('./platform/hci-input.tsx', context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/src/platform/hci-input.tsx')) return {format:'module',source:readFileSync(join(output,'src/platform/hci-input.js'),'utf8'),shortCircuit:true};
    if (!urls.includes(url)) return next(url, context);
    const filename = new URL(url).pathname.split('/').at(-1)!.replace(/\.tsx$/, '.js');
    return { format: 'module', source: readFileSync(join(output, 'src', filename), 'utf8'), shortCircuit: true };
  },
});
let Owner: React.ComponentType<{ active: boolean }>;
let Projection: React.ComponentType<HciDocumentViewProps>;
let Disclosure: typeof import('../src/HciDocumentWorkbench.tsx').ExactDocumentDisclosureView;
let ReopenProjection: typeof import('../src/HciEvidenceReopen.tsx').HciEvidenceReopenView;
try { ({ HciEvidenceReopenView: ReopenProjection } = await import('../src/HciEvidenceReopen.tsx')); ({ HciDocumentWorkbench: Owner, HciDocumentWorkbenchView: Projection, ExactDocumentDisclosureView: Disclosure } = await import('../src/HciDocumentWorkbench.tsx')); }
finally { hooks.deregister(); rmSync(output, { recursive: true, force: true }); delete (globalThis as any).__apexHciStaticRender; }
function render(state: HciDocumentState) {
  const noAction = () => assert.fail('Static projection must not act');
  return renderToStaticMarkup(React.createElement(Projection, { state, edit: noAction, clear: noAction, verify: noAction, page: noAction }));
}

async function prepared() { const c=new Controller(true,hciDigest);c.example(c.lease);await c.inspect(c.lease);c.select(0,c.lease,c.state);await c.prepareDocument(c.lease,c.state);return c.state.preparedDocument!; }
function disabled(markup: string,label: string){const match=[...markup.matchAll(/<button\b([^>]*)>/g)].find(m=>m[1]!.includes(`aria-label="${label}"`));assert.ok(match,label);return match[1]!.includes('disabled=""');}
test('actual document TSX: no implicit work, exact inert text and required cautions',async()=>{
 assert.equal(renderToStaticMarkup(React.createElement(Owner,{active:false})), '');
 const d=new HciDocumentController(true,hciDigest), exact=' \n'+await prepared()+'\t';d.receive({id:1,document:exact});const markup=render(d.state);
 assert.doesNotMatch(markup,/Verified derivative binary|Legacy report 0/);
 for(const phrase of ['4096 UTF-16','whole-edit rejection','no trim','clipboard write','selectable for manual','multiple advertisers','sensitive vendor','UNVERIFIED','fenced, not cancelled']) assert.ok(markup.includes(phrase),phrase);
 assert.equal(disabled(markup,'Verify/reopen HCI document'),false);
 assert.ok(markup.includes(' \n{&quot;schemaVersion'));
 await d.verify(d.lease,d.state);const verified=render(d.state);
 for(const phrase of ['Verified derivative binary','NOT JSON','Original-source','derivative-relative','exact declared label','synthetic-fixture','AD framing status','Service interpretation','BTHome parse statuses']) assert.ok(verified.toLowerCase().includes(phrase.toLowerCase()),phrase);
 assert.ok(verified.length<14000);
 d.edit('x'.repeat(4097),d.lease,d.state);const rejected=render(d.state);assert.equal(disabled(rejected,'Verify/reopen HCI document'),true);assert.doesNotMatch(rejected,/Verified derivative binary|Legacy report 0/);
});
test('actual document TSX: imported labels are exact inert text, never links or nested AD objects',async()=>{
 const obj=JSON.parse(await prepared());obj.context.label='https://example.invalid/<PRIVATE>&';const exact=JSON.stringify(obj);const d=new HciDocumentController(true,hciDigest);d.receive({id:1,document:exact});await d.verify(d.lease,d.state);const markup=render(d.state);
 assert.match(markup,/https:\/\/example.invalid\/&lt;PRIVATE&gt;&amp;/);assert.doesNotMatch(markup,/<a\b|href=|<PRIVATE>|"advertising"/);
 d.deactivate();assert.doesNotMatch(render(d.state),/Verified derivative binary|Legacy report 0/);
});

test('actual saved HCI TSX hides unverified document and renders verified exact snapshot read-only', async()=>{
 const d=new HciDocumentController(true,hciDigest);d.receive({id:1,document:await prepared()});
 const props={pending:false,message:'UNVERIFIED',reopen:()=>{},page:()=>{}};
 const unopened=renderToStaticMarkup(React.createElement(ReopenProjection,{...props,state:d.state}));
 assert.doesNotMatch(unopened,/textarea|Derivative SHA|Legacy report|schemaVersion/);
 assert.match(unopened,/declared save time/);
 await d.verify(d.lease,d.state);
 const opened=renderToStaticMarkup(React.createElement(ReopenProjection,{...props,state:d.state}));
 assert.match(opened,/Read-only exact saved snapshot/);assert.match(opened,/derivative-relative/);
 assert.doesNotMatch(opened,/textarea|Save exact verified HCI document|Clear HCI document|Verify\/reopen HCI document/);
 const noAction=()=>{};
 const save=renderToStaticMarkup(React.createElement(Projection,{state:d.state,save:noAction,edit:noAction,clear:noAction,verify:noAction,page:noAction}));
 assert.equal(disabled(save,'Save exact verified HCI document'),false);
});

// Inspect real TSX element keys and substitute only the presentation disclosure's
// explicit expanded projection. This is static/source coverage, not mounted React.
function editableTree(state: HciDocumentState, expanded = false) {
 const noAction = () => assert.fail('Disclosure must not call a controller action');
 const tree = (Projection as (props: HciDocumentViewProps) => React.ReactElement)({ state, edit: noAction, clear: noAction, verify: noAction, page: noAction, save: noAction, stage: noAction });
 const previews: React.ReactElement<any>[] = [];
 function visit(node: React.ReactNode): React.ReactNode {
  if (Array.isArray(node)) return React.Children.map(node, visit);
  if (!React.isValidElement<{children?: React.ReactNode; draft?: string}>(node)) return node;
  if (typeof node.type === 'function' && node.type.name === 'ExactDocumentDisclosure') {
   previews.push(node);
   return expanded ? React.createElement(Disclosure, { draft: node.props.draft!, expanded: true, toggle: noAction, key: node.key }) : node;
  }
  return React.cloneElement(node, {}, visit(node.props.children));
 }
 const result = visit(tree);
 assert.ok(React.isValidElement(result));
 return { markup: renderToStaticMarkup(result), previews };
}
function before(markup: string, first: string, second: string) {
 const a=markup.indexOf(first),b=markup.indexOf(second);assert.ok(a>=0 && b>a, `${first} must precede ${second}`);
}
test('editable actions and both live statuses precede initially collapsed exact JSON; all caveats stay visible',()=>{
 const c=new HciDocumentController(true,hciDigest);c.receive({id:1,document:'  {"inert":"<script>"} \n'});
 const state={...c.state,saveMessage:'SAVE_STATUS',message:'VERIFY_STATUS'};
 const {markup}=editableTree(state);
 assert.match(markup,/aria-label="Show exact HCI document JSON" aria-expanded="false"/);
 assert.doesNotMatch(markup,/aria-label="Exact HCI document JSON"/);
 assert.equal((markup.match(/&lt;script&gt;/g)??[]).length,1); // raw editor remains exact
 before(markup,'Original-source references are UNVERIFIED','<textarea');
 for(const phrase of ['4096 UTF-16','whole-edit rejection','Rejected edits retain','sensitive vendor','Neither digest establishes authentication','zero drops does not prove no loss','Saving uses the exact verified snapshot; editing or leaving does not cancel a dispatched save.']) before(markup,phrase,'<textarea');
 const order=['retained UTF-16 code units.','aria-label="Verify/reopen HCI document"','aria-label="Clear HCI document"','aria-label="Save exact verified HCI document"','SAVE_STATUS','VERIFY_STATUS','aria-label="Show exact HCI document JSON"'];
 for(let i=1;i<order.length;i++)before(markup,order[i-1]!,order[i]!);
 assert.equal((markup.match(/aria-live="polite"/g)??[]).length,2);
});
test('expanded actual TSX preserves exact whitespace and hostile strings as selectable inert text after actions/status',()=>{
 const c=new HciDocumentController(true,hciDigest), exact=' \n\t{"url":"https://example.invalid/?x=<script>&y=\"","x":"</span><img onerror=bad>"}\r\n ';
 c.receive({id:1,document:exact});const observed=c.state;
 const {markup}=editableTree({...observed,saveMessage:'SAVE_STATUS',message:'VERIFY_STATUS'},true);
 assert.match(markup,/aria-label="Hide exact HCI document JSON" aria-expanded="true"/);
 const escaped=renderToStaticMarkup(React.createElement('span',null,exact)).slice(6,-7);
 assert.ok(markup.includes('aria-label="Exact HCI document JSON" data-selectable="true">'+escaped+'</span>'));
 assert.doesNotMatch(markup,/<script|<img|<a\b|href=/);
 before(markup,'SAVE_STATUS','aria-label="Exact HCI document JSON"');before(markup,'VERIFY_STATUS','aria-label="Exact HCI document JSON"');
 assert.strictEqual(c.state,observed);
});
test('save availability and messages remain default-visible across pending, rejected, saving, saved and failed states',async()=>{
 const c=new HciDocumentController(true,hciDigest);c.receive({id:1,document:await prepared()});await c.verify(c.lease,c.state);
 for(const [changes,blocked] of [[{},false],[{pending:true},true],[{rejectedEdit:true},true],[{saving:true},true],[{savedDocument:c.state.draft},true],[{saveMessage:'Local save failed; no successful save was confirmed.'},false]] as const){
  const state={...c.state,...changes};const {markup}=editableTree(state);
  assert.equal(disabled(markup,'Save exact verified HCI document'),blocked);
  if(state.saveMessage)before(markup,state.saveMessage,'Show exact HCI document JSON');
  assert.match(markup,/Saving uses the exact verified snapshot/);assert.doesNotMatch(markup,/aria-label="Exact HCI document JSON"/);
 }
});
test('disclosure keys track exact replacement and Clear; activation resets only the presentation subtree',()=>{
 const c=new HciDocumentController(true,hciDigest);
 const preview=()=>editableTree(c.state).previews[0]!;
 c.receive({id:1,document:' A '});const a=preview();assert.equal(a.key,' A ');
 c.edit(' B ',c.lease,c.state);const b=preview();assert.equal(b.key,' B ');assert.notEqual(a.key,b.key);
 c.clear(c.lease,c.state);assert.equal(preview().key,'');
 c.receive({id:2,document:' A '});assert.equal(preview().key,a.key);
 const lease=c.lease;c.deactivate();c.activate();assert.notEqual(c.lease,lease);
 const source=readFileSync(new URL('../src/HciDocumentWorkbench.tsx',import.meta.url),'utf8');
 assert.match(source,/if \(!active\) return null;\s*return <HciDocumentWorkbenchView key=\{lease\}/);
 assert.match(source,/<ExactDocumentDisclosure key=\{state.draft\} draft=\{state.draft\}/);
 const local=source.slice(source.indexOf('function ExactDocumentDisclosure('),source.indexOf('export interface HciDocumentViewProps'));
 assert.match(local,/useState\(false\)/);assert.match(local,/toggle=\{\(\) => setExpanded\(value => !value\)\}/);
 assert.doesNotMatch(local,/controller|useLayoutEffect|\b(?:edit|clear|verify|save|stage|page)\s*\(|JSON\.|trim\(|fetch|storage/i);
 // No props capable of changing controller data reach the keyed state owner.
 assert.deepEqual(Object.keys(a.props),['draft']);
});
test('readonly verified projection has no disclosure, staging, edit or save controls',async()=>{
 const c=new HciDocumentController(true,hciDigest);c.receive({id:1,document:await prepared()});await c.verify(c.lease,c.state);
 const noAction=()=>assert.fail('read-only must not act');
 const markup=renderToStaticMarkup(React.createElement(Projection,{state:c.state,readonly:true,stage:noAction,save:noAction,edit:noAction,clear:noAction,verify:noAction,page:noAction}));
 assert.match(markup,/aria-label="Exact HCI document JSON" data-selectable="true"/);
 assert.doesNotMatch(markup,/Show exact|Hide exact|Stage report|Save exact verified|Clear HCI|Verify\/reopen HCI|textarea/);
});

// Independent review additions: invoke only the pure disclosure projection's
// Pressable callback. This is deliberately not a mounted hook/state test.
test('independent disclosure projection toggles only its supplied callback and preserves exact draft',()=>{
 const draft=' \r\n<script>https://example.invalid/?a=&b=1</script>\t';
 for(const expanded of [false,true]) {
  let toggles=0;
  const tree=Disclosure({draft,expanded,toggle:()=>{toggles++;}});
  const children=React.Children.toArray(tree.props.children) as React.ReactElement<any>[];
  const button=children[0]!;
  assert.equal(button.props.accessibilityRole,'button');
  assert.deepEqual(button.props.accessibilityState,{expanded});
  assert.equal(button.props.accessibilityLabel,`${expanded?'Hide':'Show'} exact HCI document JSON`);
  assert.equal(toggles,0);button.props.onPress();assert.equal(toggles,1);
  assert.equal(children.length,expanded?2:1);
  if(expanded) {assert.equal(children[1]!.props.children,draft);assert.equal(children[1]!.props.selectable,true);}
 }
});
test('independent draft disclosure key follows accepted whitespace changes but not rejected edits or status changes',()=>{
 const c=new HciDocumentController(true,hciDigest);
 const key=()=>editableTree(c.state).previews[0]!.key;
 c.receive({id:1,document:'A'});assert.equal(key(),'A');
 c.edit(' A\n',c.lease,c.state);assert.equal(key(),' A\n');
 c.edit('X'.repeat(4097),c.lease,c.state);assert.equal(key(),' A\n');assert.equal(c.state.rejectedEdit,true);
 assert.equal(editableTree({...c.state,message:'new verification status',saveMessage:'new save status',saving:true}).previews[0]!.key,' A\n');
 c.clear(c.lease,c.state);assert.equal(key(),'');assert.equal(c.state.rejectedEdit,false);
 c.receive({id:2,document:'replacement'});assert.equal(key(),'replacement');
 const lease=c.lease;c.deactivate();assert.equal(c.state.draft,'replacement');assert.equal(c.state.value,null);
 c.activate();assert.notEqual(c.lease,lease);assert.equal(key(),'replacement');
});
