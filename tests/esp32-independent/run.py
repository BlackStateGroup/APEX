#!/usr/bin/env python3
"""Host-only actual-source probes + mutation controls. No SDK or startup runs."""
from pathlib import Path
import subprocess, tempfile, shutil, hashlib, os
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'verification/esp32-reviewed-independent'
FLAGS=['-std=c11','-Wall','-Wextra','-Werror','-Wno-unused-function','-Wno-misleading-indentation','-DESP_PLATFORM','-Itests/esp32-independent/fakes','-Ifirmware/core','-Ifirmware/esp32s3/main']
SOURCE='firmware/esp32s3-reviewed/main/ble_accessory.c'
def buildrun(root,name,extra=()):
    binary=root/'probe-bin'
    c=subprocess.run(['gcc',*FLAGS,*extra,'tests/esp32-independent/probes.c','firmware/core/apex.c','-o',str(binary)],cwd=root,text=True,capture_output=True,timeout=30)
    if c.returncode: raise RuntimeError(c.stderr)
    env=dict(os.environ)
    if name == "asan": env["ASAN_OPTIONS"]="detect_leaks=0" # LSan unavailable under execution ptrace; see retained failure.
    r=subprocess.run([str(binary)],cwd=root,text=True,capture_output=True,timeout=30,env=env)
    (OUT/(name+'.log')).write_text(r.stdout+r.stderr)
    binary.unlink()
    return r
mutants={
 'missing-staging-self-pointer':('staged.device.stream.context = &staged.device;','/* removed */'),
 'missing-committed-self-pointer':('peer.stream.context = &peer;','/* removed */'),
 'ignore-overflow':('if (staged.overflow) return BLE_ATT_ERR_INSUFFICIENT_RES;','/* removed */'),
 'repeat-enable-ready':('event->subscribe.cur_notify && !subscribed','event->subscribe.cur_notify'),
 'missing-fence-latch':('fenced = true; subscribed = false;','fenced = false; subscribed = false;'),
 'ignore-schedule-failure':('if (ble_npl_callout_reset(&tx_timer, ble_npl_time_ms_to_ticks32(5))) fence();','(void)ble_npl_callout_reset(&tx_timer, ble_npl_time_ms_to_ticks32(5));'),
 'unbounded-retry':('++retries >= 10','++retries >= 11'),
 'wrong-wrap-slot':('(first + count++) % 4','(count++) % 4'),
}
OUT.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='apex-reviewed-independent-') as d:
    p=Path(d)
    for path in ['tests/esp32-independent','firmware/core','firmware/esp32s3/main','firmware/esp32s3-reviewed/main']:
        shutil.copytree(ROOT/path,p/path)
    source=(p/SOURCE).read_text()
    for name,extra in [('normal',()),('ubsan',('-fsanitize=undefined','-fno-sanitize-recover=all')),('asan',('-fsanitize=address','-fno-omit-frame-pointer'))]:
        r=buildrun(p,name,extra);assert r.returncode==0,(name,r.stderr)
    lines=['Actual source SHA256: '+hashlib.sha256(source.encode()).hexdigest()]
    for name,(old,new) in mutants.items():
        assert source.count(old)==1,(name,source.count(old))
        (p/SOURCE).write_text(source.replace(old,new))
        r=buildrun(p,'mutant-'+name)
        assert r.returncode!=0,'SURVIVED '+name
        lines.append(name+': killed (exit '+str(r.returncode)+') '+r.stderr.strip())
    (OUT/'mutations.log').write_text('\n'.join(lines)+'\n')
print('PASS: normal + UBSan + ASan, 8 probe groups each; all 8 intentional actual-source mutants killed')
