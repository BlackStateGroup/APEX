"""Independent read-only provenance audit against retained connector responses."""
import hashlib,json,pathlib,stat,subprocess,sys
root=pathlib.Path(__file__).resolve().parents[2]
raw=pathlib.Path(sys.argv[1])
def response(name):
    result=json.loads((raw/name).read_text())
    assert not result.get('isError')
    return result['structuredContent']['content']
def oid(kind,data):
    return hashlib.sha1(kind.encode()+b' '+str(len(data)).encode()+b'\0'+data).hexdigest()
commit=json.loads(response('commit.json')); tree=json.loads(response('tree.json'))
assert commit['sha']=='e51750ec0b34b280399877d67e1036058874c373'
assert tree['truncated'] is False
entries={e['path']:e for e in tree['tree']}
# Reconstruct every directory, including root, so the six files are anchored to
# the root tree from the retained commit response rather than manifest alone.
for directory in ['']+[p for p,e in entries.items() if e['type']=='tree']:
    children=[(p.rsplit('/',1)[-1],e) for p,e in entries.items() if p.rpartition('/')[0]==directory]
    data=b''.join((e['mode'].lstrip('0')+' '+name).encode()+b'\0'+bytes.fromhex(e['sha']) for name,e in sorted(children,key=lambda x:x[0]+('/' if x[1]['type']=='tree' else '')))
    expected=entries[directory]['sha'] if directory else commit['tree']['sha']
    assert oid('tree',data)==expected,directory
manifest=json.loads((root/'docs/ESP32S3_RESTORATION_MANIFEST.json').read_text())
expected={p for p,e in entries.items() if p.startswith('firmware/esp32s3/') and e['type']=='blob'}
assert {i['path'] for i in manifest['files']}==expected and len(expected)==6
for i in manifest['files']:
    p=i['path']; e=entries[p]; path=root/p; data=path.read_bytes()
    assert path.is_file() and not path.is_symlink()
    assert stat.S_IMODE(path.stat().st_mode)==0o644
    assert data==response(e['sha']+'.json').encode('utf-8')
    assert len(data)==e['size']==i['bytes']
    assert oid('blob',data)==e['sha']==i['git_blob_sha1']
    assert hashlib.sha256(data).hexdigest()==i['sha256']
    assert i['mode']==e['mode']=='100644'
    assert i['commit']==commit['sha']
    assert i['source_url']==f"https://github.com/BlackStateGroup/APEX/blob/{commit['sha']}/{p}"
    assert subprocess.run(['git','cat-file','-e',manifest['restoration_base_commit']+':'+p],cwd=root,stderr=subprocess.DEVNULL).returncode!=0
    index=subprocess.check_output(['git','ls-files','--stage',p],cwd=root,text=True).split()
    assert index[:2]==['100644',e['sha']]
assert sum(i['bytes'] for i in manifest['files'])==8454
print('PASS: all retained recursive-tree objects reconstruct to commit root; six files match raw blob responses, manifest, Git index, size, SHA-1/SHA-256, regular-file modes, URLs, and absent base destinations.')
print('Trust limit: retained connector responses, unsigned commit; no fresh network authentication or target execution.')
