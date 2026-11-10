/** Independent source assertions, not mounted navigation acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANALYSIS_INSPECTORS, ANALYSIS_ROUTES } from '../src/analysis-navigation.ts';
import { HCI_COMPARISON_EXAMPLES } from '../src/hci-comparison-examples.ts';
import { readHciLegacyEventDocument } from '../packages/core/hci-offline.ts';
import { hash } from './hci-comparison-review-fixture.ts';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('independent source routing preserves all eleven old IDs and routes plus exactly one stable comparison mount',()=>{
 assert.equal(ANALYSIS_INSPECTORS.length,14);assert.equal(new Set(ANALYSIS_INSPECTORS.map(x=>x.id)).size,14);assert.deepEqual(ANALYSIS_INSPECTORS.filter(x=>x.id!=='hci-compare').map(x=>x.id),['recording','ble','ble-trials','ble-candidate','flipper','device-passport','ir','hci-document','hci','ndef','phone-ndef','static-nfc','iq']);
 assert.deepEqual(ANALYSIS_ROUTES,{'selected-hci-event':'hci-document','service-data':'ble','advertised-uuid':'ble','phone-capture':'phone-ndef','staged-ble':'ble-trials','staged-hci-report':'hci-compare'});
 const app=read('App.tsx');assert.equal((app.match(/<HciComparisonWorkbench\b/g)??[]).length,1);assert.match(app,/\n\s*<HciComparisonWorkbench active=\{tab === 'Analysis' && inspector === 'hci-compare'\} selectedSource=\{selectedHciComparison\}/);assert.match(app,/setSelectedHciComparison\(previous => nextAnalysisSource\(previous, source\)\); selectInspector\(ANALYSIS_ROUTES\['staged-hci-report'\]\)/);assert.doesNotMatch(app.slice(app.indexOf("{tab === 'Evidence'")),/onStage=|HciComparisonWorkbench/);
 const owner=read('src/HciComparisonWorkbench.tsx');assert.ok(owner.indexOf('controller.receive(selectedSource)')<owner.indexOf('if(!active) return null'));assert.match(read('src/HciDocumentWorkbench.tsx'),/!readonly && stage && state.reports.map/);
 for(const path of ['src/hci-comparison-workbench.ts','src/HciComparisonWorkbench.tsx'])assert.doesNotMatch(read(path),/\bfetch\s*\(|AsyncStorage|SecureStore|Clipboard|\.save\(|evidenceStore|expo-sqlite|react-native-ble-plx|react-native-nfc-manager/);
});
test('independent exact synthetic examples are supported declared fixtures without runtime digest generation',async()=>{
 const source=read('src/hci-comparison-examples.ts');assert.doesNotMatch(source,/\bawait\b|\bimport\b|createHash|readHciLegacyEventDocument|compareHciLegacyReportBytes/);assert.equal(HCI_COMPARISON_EXAMPLES.length,2);for(const exact of HCI_COMPARISON_EXAMPLES){assert.ok(exact.length<=4096);const reopened=await readHciLegacyEventDocument(exact,hash);assert.equal(reopened.value.context.provenance,'synthetic-fixture');}
});
