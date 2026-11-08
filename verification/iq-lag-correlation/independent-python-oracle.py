"""Independent exact-integer oracle for the read-only APEX lag CLI.
Uses Python integers and literal ci16_le fixture bytes, not implementation helpers.
Only creates/removes its own temporary synthetic files. No hardware/network access.
"""
import hashlib, json, math, pathlib, struct, subprocess, sys, tempfile
root=pathlib.Path(sys.argv[1]).resolve()
cli=root/'tools/inspect-iq-lag-correlation.ts'
meta={'global':{'core:datatype':'ci16_le','core:version':'1.2.6','core:sample_rate':1024,'core:description':'Independent synthetic lag oracle; no RF acquisition'},'captures':[{'core:sample_start':0,'core:frequency':1000000}],'annotations':[]}
metadata=json.dumps(meta,separators=(',',':')).encode()
cases=[
 ('all-int16',[(i-32768,((i*40503+7919)%65536)-32768) for i in range(65536)],(0,1024,1024,1024,63)),
 ('zero',[(0,0)]*64,(0,16,1,1,32)),
 ('quarter-turn',[(10,0),(0,10),(-10,0),(0,-10)]*32,(3,16,1,1,32)),
 ('extrema',[(-32768,-32768),(32767,32767),(-32768,32767),(32767,-32768)]*32,(0,32,1,1,64)),
 ('constant',[(77,-29)]*128,(8,32,1,1,64)),
]
for seed in range(8):
 pairs=[(((i*i*211+seed*7919)%65536)-32768,((i*65521+seed*104729)%65536)-32768) for i in range(512)]
 cases.append((f'mixed-{seed}',pairs,(seed,37+seed,1+seed,3+seed,32)))
rows=0
with tempfile.TemporaryDirectory(prefix='apex-lag-independent-') as temp:
 base=pathlib.Path(temp); mp=base/'samples.sigmf-meta';dp=base/'samples.sigmf-data';mp.write_bytes(metadata)
 for name,pairs,options in cases:
  data=b''.join(struct.pack('<hh',*pair) for pair in pairs);dp.write_bytes(data)
  start,n,first,step,count=options
  flags=['--start-sample',str(start),'--window-samples',str(n),'--first-lag',str(first),'--lag-step',str(step),'--lag-count',str(count)]
  proc=subprocess.run(['node',str(cli),str(mp),str(dp),*flags],cwd=root,text=True,capture_output=True,check=True)
  report=json.loads(proc.stdout)
  assert len(report['lags'])==count,(name,'row count')
  assert report['source']['metadataSha256']==hashlib.sha256(metadata).hexdigest()
  assert report['source']['dataSha256']==hashlib.sha256(data).hexdigest()
  assert report['source']['supplierClaim']==meta
  assert report['source']['context']['origin']=='external-file'
  assert report['comparedCells']==n*count
  for index,row in enumerate(report['lags']):
   lag=first+index*step;left=pairs[start:start+n];right=pairs[start+lag:start+lag+n]
   real=sum(a*c+b*d for (a,b),(c,d) in zip(left,right))
   imaginary=sum(a*d-b*c for (a,b),(c,d) in zip(left,right))
   le=sum(a*a+b*b for a,b in left);re=sum(a*a+b*b for a,b in right)
   numerator=real*real+imaginary*imaginary;denominator=le*re
   assert row['complexSum']=={'real':str(real),'imaginary':str(imaginary)},(name,index,'complex orientation')
   assert row['leftEnergy']==str(le) and row['rightEnergy']==str(re)
   norm=row['normalizedSquaredMagnitude'];assert norm['numerator']==str(numerator) and norm['denominator']==str(denominator)
   assert norm['status']==('available' if denominator else 'unavailable')
   assert numerator<=denominator,(name,index,'Cauchy bound')
   assert row['overlappingSampleCount']==max(0,n-lag)
   assert row['lagSamples']==lag and row['nominalLagSeconds']==lag/1024
   assert row['leftStartSample']==start and row['leftEndSampleExclusive']==start+n
   assert row['rightStartSample']==start+lag and row['rightEndSampleExclusive']==start+lag+n
   rows+=1
print(json.dumps({'cases':len(cases),'exactLagRows':rows,'allSignedInt16ValuesInComparedSamples':True,'complexOrientationEnergyRationalCauchyGeometryTimesHashes':'PASS','fixtureOnly':True},indent=2))
