#!/usr/bin/env python3
"""Read-only validation of the APEX vision pack; no installs/network/device use."""
from pathlib import Path
import hashlib,json,re,sys
D=Path(__file__).resolve().parent;ROOT=D.parent.parent
errors=[];counts={}
def check(ok,msg):
 if not ok:errors.append(msg)
def read(rel):return json.loads((D/rel).read_text())
def sha(b):return hashlib.sha256(b).hexdigest()
archive=read('conversations/recovered-messages.json');latest=read('conversations/current-direction.json');sources=read('sources/recovery-inventory.json');req=read('requirements.json')
messages=[m for c in archive['conversations'] for m in c['messages']]
check(len(archive['conversations'])==4,'Expected four recovered conversations')
check(len(messages)==52,'Expected 52 unique recovered historical messages')
check(len({m['message_id'] for m in messages})==52,'Duplicate historical message identity')
check(sum(m['content_omitted'] for m in messages)==8,'Expected eight unavailable historical bodies')
check(len(latest['messages'])==4,'Expected four current verbatim instructions')
check(all(m['message_id'] is None and m['url'] is None and m['created_at'] is None for m in latest['messages']),'Current unknown metadata must not be invented')
texts={m['message_id']:m['text'] for m in messages};texts.update({m['local_reference']:m['text'] for m in latest['messages']})
for q in read('conversations/text-digests.json')['records']:check(sha(texts[q['messageId']].encode())==q['sha256Utf8'],'Quote digest mismatch: '+q['messageId'])
for m in messages:
 if m['content_omitted']:check(m['text']=='','Unavailable body was invented')
 else:
  ends=0
  for seg in m['recovered_segments']:
   check(seg['start_offset']==ends,'Noncontiguous recovered segments');ends=seg['end_offset']
  check(ends==len(m['text']),'Recovered text length/segments differ')
check(len(req['requirements'])==29,'Expected 29 requirements')
for r in req['requirements']:
 check(r['sourceReference'] in texts,'Unknown requirement source: '+r['id'])
 check((D/r['artifact'].split('#')[0]).exists(),'Missing requirement artifact: '+r['id'])
check(len(sources['repositories'])==31,'Expected 31 source roots')
check(sum(len(x['archiveParts']) for x in sources['repositories'])==32,'Expected 32 archive parts')
check(sum(len(x['rootGitlinks']) for x in sources['repositories'])==63,'Expected 63 absent nested links')
check(sum(x['trackedEntries'] for x in sources['repositories'])==164492,'Source tracked-entry total mismatch')
check(sum(a['bytes'] for x in sources['repositories'] for a in x['archiveParts'])==1986961997,'Archive bytes total mismatch')
imports={x['id']:x for x in json.loads((ROOT/'research/source-imports.json').read_text())['copies']}
for r in sources['repositories']:
 c=imports[r['id']];check(r['commit']==c['commit']==r['expectedCommit'],'Pin mismatch: '+r['id'])
 check(r['commitMatches'] and r['worktreeClean'],'Recovery status mismatch: '+r['id'])
 check(all(not g['materialized'] for g in r['rootGitlinks']),'Unexpected dependency closure')
 parts={a['filename']:a for a in c['backups']}
 for a in r['archiveParts']:
  p=parts[a['file']];check(a['sha256']==p['sha256'] and a['bytes']==p['bytes'],'Archive receipt mismatch: '+r['id'])
# Historical transcript bodies contain their own original links, which are not silently repaired.
historical={'origin.md','implementation.md','capabilities.md','site.md'};local_links=0
for p in D.rglob('*.md'):
 if p.parent.name=='conversations' and p.name in historical:continue
 for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)',p.read_text()):
  if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:',target) or target.startswith('#'):continue
  dest=(p.parent/target.split('#')[0]).resolve();local_links+=1
  check(dest.is_relative_to(ROOT) and dest.exists(),f'Broken local link {p.relative_to(D)} -> {target}')
manifest=read('content-manifest.json');listed={x['path'] for x in manifest['files']}
actual={p.relative_to(D).as_posix() for p in D.rglob('*') if p.is_file() and p.name not in {'content-manifest.json','VALIDATION.md'} and '__pycache__' not in p.parts}
check(listed==actual,'Manifest file set differs')
for x in manifest['files']:
 p=D/x['path'];check(p.exists() and p.stat().st_size==x['bytes'] and sha(p.read_bytes())==x['sha256'],'Manifest mismatch: '+x['path'])
for p in D.rglob('*.json'):
 try:json.loads(p.read_text())
 except Exception as e:errors.append(f'Invalid JSON: {p.name}: {e}')
counts={'historicalConversations':4,'historicalMessages':len(messages),'unavailableBodies':8,'currentInstructions':len(latest['messages']),'requirements':len(req['requirements']),'sourceRoots':31,'archiveParts':32,'absentNestedGitlinks':63,'localLinksChecked':local_links,'manifestFiles':len(listed)}
print(json.dumps({'status':'passed' if not errors else 'failed','counts':counts,'errors':errors,'scope':'Documentation integrity only; no runtime/native/device test claim'},indent=2));sys.exit(bool(errors))
