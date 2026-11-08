import hashlib,json,pathlib,subprocess
root=pathlib.Path('.')
base='386cdaf957d49078cf660fd936def0b6ebfa219a'
reviewed=subprocess.check_output(['git','rev-parse','e534801'],text=True).strip()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
counts={}
for manifest,prefix in [('evidence/app-plx-cancellation/source-hashes.json','.'),('evidence/app-plx-cancellation/artifacts.sha256.json','evidence/app-plx-cancellation')]:
    entries=json.loads(pathlib.Path(manifest).read_text())
    for p,h in entries.items(): assert sha(pathlib.Path(prefix)/p)==h,p
    counts[manifest]=len(entries)
old=subprocess.check_output(['git','show',base+':tests/plx-facade-c.test.ts'],text=True)
new=pathlib.Path('tests/plx-facade-c.test.ts').read_text()
assert old[old.index('function frames('):]==new[new.index('function frames('):]
for p in ['tests/plx-facade-host/loader.ts','tests/plx-facade-host/inputs.sha256.json','tests/browser-c-host/bridge.ts','tests/browser-c-host/bridge.c','tests/support/app-acquisition.ts','App.tsx','src/platform/bluetooth.native.ts','packages/core/ble-transport.ts','packages/core/session.ts','package.json','package-lock.json']:
    assert subprocess.check_output(['git','show',base+':'+p])==pathlib.Path(p).read_bytes(),p
assert not subprocess.check_output(['git','diff',base,reviewed,'--','verification/'])
traces=list(pathlib.Path('evidence/app-plx-cancellation/traces').glob('*.json'));assert len(traces)==13
for p in traces:
    trace=json.loads(p.read_text())['trace']
    exits=[e for e in trace if e['origin']=='fixture-process-exit'];assert len(exits)==1,p
    assert json.loads(exits[0]['value'])=={'code':0,'signal':None,'stderr':''},p
print(json.dumps({'reviewed':reviewed,'baseline':base,'verified_manifests':counts,'builder_clean_process_exits':len(traces),'original_test_bodies':'byte-identical from function frames onward','historical_verification':'byte-identical','loader_pins_runtime_and_bridge':'byte-identical'},indent=2))
