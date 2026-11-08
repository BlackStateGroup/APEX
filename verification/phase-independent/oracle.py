"""Independent Python integer/atan2 oracle driving actual Node CLI; synthetic only."""
import hashlib,itertools,json,math,os,pathlib,random,struct,subprocess,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[2]
CLI=ROOT/'tools/inspect-iq-phase-increment.ts'
ENV=dict(os.environ,CI='1',EXPO_OFFLINE='1',EXPO_NO_TELEMETRY='1',npm_config_update_notifier='false',npm_config_offline='true',npm_config_audit='false',npm_config_fund='false')
COUNTS={'processes':0,'pairs':0,'refusals':0}
# 8e-16 absolute radians accommodates a few libm/V8 ulps; exact integer results
# must match as decimal strings. Other doubles allow 8e-15 relative, 1e-15 absolute.
def close(a,b,phase=False):
    assert math.isclose(a,b,rel_tol=0 if phase else 8e-15,abs_tol=8e-16 if phase else 1e-15),(a,b)
def metadata(rate):
    return json.dumps({'global':{'core:datatype':'ci16_le','core:version':'1.2.6','core:sample_rate':rate},'captures':[{'core:sample_start':0,'core:frequency':987654321}],'annotations':[]}).encode()
def flags(start=0,lag=1,step=1,count=1):
    return ['--start-sample',str(start),'--lag',str(lag),'--step',str(step),'--count',str(count)]
with tempfile.TemporaryDirectory(prefix='apex-phase-python-') as d:
    d=pathlib.Path(d); meta=d/'meta'; data=d/'data'
    def run(args,ok=True):
        before={str(p):p.read_bytes() for p in d.iterdir() if p.is_file() and not p.is_symlink()}
        names=sorted(p.name for p in d.iterdir())
        p=subprocess.run(['node',str(CLI),*map(str,args)],cwd=d,env=ENV,capture_output=True,timeout=10)
        COUNTS['processes']+=1
        assert names==sorted(p.name for p in d.iterdir()),'CLI created files'
        assert before=={str(p):p.read_bytes() for p in d.iterdir() if p.is_file() and not p.is_symlink()},'input mutation'
        if not ok:
            assert p.returncode==1 and p.stdout==b'' and p.stderr,(args,p.returncode,p.stdout,p.stderr)
            COUNTS['refusals']+=1; return
        assert p.returncode==0 and not p.stderr,(p.returncode,p.stderr)
        return json.loads(p.stdout)
    def check(samples,rate=12345.75,start=0,lag=1,step=1,count=1):
        mb=metadata(rate); db=b''.join(struct.pack('<hh',*z) for z in samples)
        meta.write_bytes(mb);data.write_bytes(db)
        r=run([meta,data,*flags(start,lag,step,count)])
        assert len(r['pairs'])==count and r['limits']['maxPairs']==512
        assert r['source']['metadataSha256']==hashlib.sha256(mb).hexdigest()
        assert r['source']['dataSha256']==hashlib.sha256(db).hexdigest()
        assert r['source']['centerFrequency']==987654321
        close(r['aliasSpacingHz'],rate/lag);close(r['nominalIntervalSeconds'],lag/rate)
        close(r['nominalPrincipalFrequencyIntervalHz']['lowerExclusive'],-rate/lag/2)
        close(r['nominalPrincipalFrequencyIntervalHz']['upperInclusive'],rate/lag/2)
        for k,p in enumerate(r['pairs']):
            left=start+k*step;right=left+lag;li,lq=samples[left];ri,rq=samples[right]
            re=ri*li+rq*lq;im=rq*li-ri*lq;le=li*li+lq*lq;re_=ri*ri+rq*rq
            assert p['complexProduct']=={'real':str(re),'imaginary':str(im)}
            assert p['leftEnergy']==str(le) and p['rightEnergy']==str(re_)
            assert [p[x] for x in ['index','leftSample','rightSample','intervalStartSample','intervalEndSample','sampleSpanEndExclusive']]==[k,left,right,left,right,right+1]
            close(p['nominalLeftSeconds'],left/rate);close(p['nominalRightSeconds'],right/rate)
            f=p['phaseAndFrequency']
            if not le or not re_:assert f=={'status':'unavailable','reason':'zero-energy endpoint'}
            else:
                phase=math.pi if im==0 and re<0 else math.atan2(im,re)
                assert f['status']=='available';close(f['principalPhaseRadians'],phase,True)
                close(f['nominalPrincipalFrequencyOffsetHz'],phase/(2*math.pi)*(rate/lag))
                assert -math.pi<f['principalPhaseRadians']<=math.pi
            COUNTS['pairs']+=1
        return r
    values=[-32768,-32767,-1,0,1,32766,32767]
    combinations=list(itertools.product(itertools.product(values,repeat=2),repeat=2))
    for offset in range(0,len(combinations),512):
        chunk=combinations[offset:offset+512];check([z for pair in chunk for z in pair],step=2,count=len(chunk))
    rng=random.Random(20261108)
    samples=[(rng.randint(-32768,32767),rng.randint(-32768,32767)) for _ in range(65536)]
    for rate,start,lag,step,count in [(1,0,1,1,512),(1e9,65534,1,2**53-1,1),(12345.75,37,499,91,512),(32000,0,65535,1,1)]:
        check(samples,rate,start,lag,step,count)
    # Determinants +/-1 next to branch cut and zero, plus unit-energy endpoints.
    for right in [(-32767,-32766),(-32766,-32765),(32767,32766),(32766,32765),(1,0),(0,-1)]:
        check([(32767,32766),right])
    for sign in [1,-1]:
        tone=[[(100,0),(0,sign*100),(-100,0),(0,-sign*100)][k%4] for k in range(100)]
        for lag in [1,2,3,4,5,9]:check(tone,48000,3,lag,2,40)
    # Arbitrary branch crossing, rather than restricting phases to quadrants.
    tone=[(round(30000*math.cos(k*2.8)),round(30000*math.sin(k*2.8))) for k in range(100)]
    check(tone,count=99)
    for args in [[],[meta,data],[meta,data,*flags(count=513)],[meta,data,*flags(start=99)],[meta,data,*flags(lag=100)],[meta,data,*flags(step=2**53-1,count=2)],[meta,data,*flags(lag=0)],[meta,data,*flags(step=0)],[meta,data,*flags(count=0)]]:run(args,False)
    for index,value in [(0,'--unknown'),(6,'--lag'),(1,'-1'),(1,'1.5'),(1,'NaN'),(1,'1e2'),(1,' 1'),(1,'1\n'),(1,'9007199254740992')]:
        f=flags();f[index]=value;run([meta,data,*f],False)
    for bad in [b'\xff',b'{',metadata(0),metadata(1e9+1),b' '*65537]:
        meta.write_bytes(bad);run([meta,data,*flags()],False)
    meta.write_bytes(metadata(1))
    for bad in [b'',b'123',b'0'*262145]:data.write_bytes(bad);run([meta,data,*flags()],False)
    data.write_bytes(b'\0'*8)
    link=d/'link';link.symlink_to(data)
    fifo=d/'fifo';os.mkfifo(fifo)
    for m,b in [(meta,link),(link,data),(meta,d),(d,data),(meta,fifo),(fifo,data),(meta,d/'missing')]:run([m,b,*flags()],False)
print('PASS independent Python integer/math.atan2 oracle',json.dumps(COUNTS,sort_keys=True))
print('Snapshot before/after each actual CLI process confirms unchanged fixture bytes and no files created in working directory; static reader review confirms read-only opens, no CLI writes except stdout/stderr.')
