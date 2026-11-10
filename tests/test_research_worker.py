import importlib.util
import json
import os
from pathlib import Path
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('research_worker', ROOT / 'tools/research_worker.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.target = self.root / 'owned.elf'
        self.target.write_bytes(b'\x7fELF' + b'\0' * 64)
        self.worker = w.Worker(self.root / 'state', [self.target], engine=self.success)

    def tearDown(self):
        if self.worker:
            self.worker.close()
        self.temp.cleanup()

    def request(self, **change):
        return {'requestId': str(uuid4()), 'targetSha256': w.digest(self.target.read_bytes()), 'operation': 'elf-notes', 'symbol': None, **change}

    def success(self, *_):
        return {'reaVersion': '6.8.0', 'provider': 'rea-elf-notes/1', 'kind': 'elf-notes', 'output': 'synthetic test output', 'outputSha256': w.digest(b'synthetic test output'), 'targetExecuted': False}

    def restart(self):
        self.worker.close()
        self.worker = w.Worker(self.root / 'state', [self.target], engine=self.success)

    def test_durable_idempotency_conflict_and_result(self):
        request = self.request()
        job = self.worker.submit(request)
        self.assertEqual(self.worker.submit(request), job)
        with self.assertRaisesRegex(w.Rejected, 'idempotency-conflict'):
            self.worker.submit({**request, 'operation': 'ghidra-function', 'symbol': 'apex_crc16'})
        self.restart()
        self.assertEqual(self.worker.get(job['id'])['state'], 'queued')
        self.assertTrue(self.worker.run_one())
        result = self.worker.result(job['id'])
        self.restart()
        self.assertEqual(self.worker.result(job['id']), result)
        self.assertEqual(len(self.worker.jobs()), 1)

    def test_one_live_owner(self):
        with self.assertRaisesRegex(w.Rejected, 'worker-already-running'):
            w.Worker(self.root / 'state', [self.target])

    def test_queued_cancellation_never_executes(self):
        job = self.worker.submit(self.request())
        self.assertEqual(self.worker.cancel(job['id'])['state'], 'cancelled')
        self.assertFalse(self.worker.run_one())
        with self.assertRaisesRegex(w.Rejected, 'result-unavailable'):
            self.worker.result(job['id'])

    def test_cancellation_wins_uncommitted_completion(self):
        job = self.worker.submit(self.request())
        entered, release = threading.Event(), threading.Event()
        def engine(*_):
            entered.set()
            self.assertTrue(release.wait(3))
            return self.success()
        self.worker.engine = engine
        thread = threading.Thread(target=self.worker.run_one)
        thread.start()
        self.assertTrue(entered.wait(3))
        self.assertEqual(self.worker.cancel(job['id'])['state'], 'cancelling')
        self.worker.submit(self.request())
        self.assertFalse(self.worker.run_one())
        release.set()
        thread.join(3)
        self.assertEqual(self.worker.get(job['id'])['state'], 'cancelled')
        with self.assertRaises(w.Rejected):
            self.worker.result(job['id'])

    def test_restart_fences_uncertain_jobs_and_does_not_replay(self):
        job = self.worker.submit(self.request())
        queued = self.worker.submit(self.request())
        self.worker.db.execute("UPDATE jobs SET state='running' WHERE id=?", (job['id'],))
        self.restart()
        self.assertEqual(self.worker.get(job['id'])['state'], 'interrupted')
        self.assertTrue(self.worker.blocked())
        self.assertFalse(self.worker.run_one())
        with self.assertRaisesRegex(w.Rejected, 'worker-cleanup-unverified'):
            self.worker.submit(self.request())
        self.assertEqual(self.worker.cancel(queued['id'])['state'], 'cancelled')
        self.assertEqual(self.worker.cancel(job['id'])['state'], 'interrupted')

    def test_abrupt_process_exit_preserves_acceptance_and_fences_running_job(self):
        state = self.root / 'crash-state'
        req = self.request()
        code = '''import importlib.util,json,os,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('worker',sys.argv[1]); m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
w=m.Worker(Path(sys.argv[2]),[Path(sys.argv[3])]);j=w.submit(json.loads(sys.argv[4]))
w.db.execute("UPDATE jobs SET state='running' WHERE id=?",(j['id'],))
os._exit(23)
'''
        run = subprocess.run([sys.executable, '-c', code, str(ROOT / 'tools/research_worker.py'), str(state), str(self.target), w.encode(req)], timeout=10)
        self.assertEqual(run.returncode, 23)
        restored = w.Worker(state, [self.target], engine=self.success)
        try:
            self.assertEqual(restored.get(req['requestId'])['state'], 'interrupted')
            self.assertTrue(restored.blocked())
        finally:
            restored.close()

    def test_cleanup_uncertainty_cannot_be_labelled_cancelled(self):
        job = self.worker.submit(self.request())
        def engine(*_):
            self.worker.cancel(job['id'])
            raise w.Rejected('process-cleanup-unverified')
        self.worker.engine = engine
        self.worker.run_one()
        self.assertEqual(self.worker.get(job['id'])['state'], 'cleanup-unknown')
        self.assertTrue(self.worker.blocked())

    def test_unavailable_process_probe_fences_dispatch(self):
        job = self.worker.submit(self.request())
        real = w.os.killpg
        def unavailable(pid, sig):
            if sig == 0:
                raise PermissionError('Process visibility denied')
            return real(pid, sig)
        def engine(*_):
            with patch.object(w.os, 'killpg', unavailable):
                w.run_process([sys.executable, '-c', 'print("done")'], lambda: False, 3, dict(os.environ))
            return self.success()
        self.worker.engine = engine
        self.worker.run_one()
        self.assertEqual(self.worker.get(job['id'])['state'], 'cleanup-unknown')
        self.assertTrue(self.worker.blocked())

    def test_invalid_requests_unknown_targets_and_capacity(self):
        for request in [self.request(path='/etc/passwd'), self.request(symbol='anything'), self.request(operation='shell'), self.request(operation='ghidra-function', symbol='main'), self.request(targetSha256='0' * 64)]:
            with self.assertRaises(w.Rejected):
                self.worker.submit(request)
        for _ in range(16):
            self.worker.submit(self.request())
        with self.assertRaisesRegex(w.Rejected, 'queue-capacity'):
            self.worker.submit(self.request())
        with self.assertRaisesRegex(w.Rejected, 'duplicate-json-key'):
            w.decode('{"operation":"elf-notes","operation":"shell"}')

    def test_dispatch_failure_pauses_new_work(self):
        def broken():
            raise OSError('Simulated persistence failure')
        self.worker.run_one = broken
        self.worker.start()
        self.worker.thread.join(2)
        self.assertTrue(self.worker.blocked())
        with self.assertRaisesRegex(w.Rejected, 'worker-cleanup-unverified'):
            self.worker.submit(self.request())
        with self.assertRaisesRegex(w.Rejected, 'dispatcher-already-started'):
            self.worker.start()

    def test_bad_engine_result_and_storage_tamper_rejected(self):
        job = self.worker.submit(self.request())
        self.worker.engine = lambda *_: {**self.success(), 'targetExecuted': True}
        self.worker.run_one()
        self.assertEqual(self.worker.get(job['id'])['state'], 'failed')
        job = self.worker.submit(self.request())
        self.worker.engine = self.success
        self.worker.run_one()
        result = self.worker.result(job['id'])
        result['output'] += 'tamper'
        self.worker.db.execute('UPDATE jobs SET result=? WHERE id=?', (w.encode(result), job['id']))
        with self.assertRaisesRegex(w.Rejected, 'stored-result-integrity'):
            self.worker.result(job['id'])

    def test_target_changes_are_not_substituted(self):
        job = self.worker.submit(self.request())
        self.target.write_bytes(b'\x7fELF' + b'x' * 64)
        self.worker.engine = self.worker.execute
        self.worker.run_one()
        self.assertEqual(self.worker.get(job['id'])['error'], 'target-changed')

    def test_symlinks_and_non_regular_files_rejected(self):
        alias = self.root / 'alias.elf'
        alias.symlink_to(self.target)
        with self.assertRaises(OSError):
            w.bounded_file(alias)
        fifo = self.root / 'pipe'
        os.mkfifo(fifo)
        with self.assertRaises(w.Rejected):
            w.bounded_file(fifo)

    def test_real_process_bounds_and_cancellation(self):
        self.assertEqual(w.run_process([sys.executable, '-c', 'print("ok")'], lambda: False, 3, dict(os.environ)).strip(), 'ok')
        with self.assertRaisesRegex(w.Rejected, 'engine-output-limit'):
            w.run_process([sys.executable, '-c', 'print("x"*200000)'], lambda: False, 3, dict(os.environ))
        with self.assertRaisesRegex(w.Rejected, 'engine-timeout'):
            w.run_process([sys.executable, '-c', 'import time; time.sleep(20)'], lambda: False, .1, dict(os.environ))
        with self.assertRaisesRegex(w.Rejected, 'cancelled'):
            w.run_process([sys.executable, '-c', 'import time; time.sleep(20)'], lambda: True, 3, dict(os.environ))

    @unittest.skipUnless(os.environ.get('APEX_WORKER_REAL_REA') == '1', 'explicit real REA integration mode')
    def test_actual_rea_over_owned_elf(self):
        self.worker.close()
        self.worker = None
        subprocess.run(['gcc', '-std=c11', '-O2', '-I', str(ROOT / 'firmware/core'), str(ROOT / 'firmware/core/apex.c'), str(ROOT / 'firmware/host/main.c'), '-o', str(self.target)], check=True)
        self.worker = w.Worker(self.root / 'real-state', [self.target])
        job = self.worker.submit(self.request())
        self.worker.run_one()
        self.assertEqual(self.worker.get(job['id'])['state'], 'succeeded', self.worker.get(job['id']))
        result = self.worker.result(job['id'])
        self.assertEqual(result['provider'], 'rea-elf-notes/1')
        self.assertEqual(json.loads(result['output'])['subject']['digest']['sha256'], w.digest(self.target.read_bytes()))
        retained = self.worker.directory / job['id']
        self.assertFalse((retained / 'input.elf').exists())
        process = json.loads((retained / 'process.json').read_text())
        self.assertTrue(process['processGroupAbsent'])
        self.assertEqual(process['stdoutSha256'], w.digest((retained / 'stdout.txt').read_bytes()))
        # Exercise the real TypeScript client, TLS server, durable dispatcher and REA together.
        cert, key = self.root / 'real-cert.pem', self.root / 'real-key.pem'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(key), '-out', str(cert), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        token = 'z' * 43
        server = w.ResearchServer(('127.0.0.1', 0), self.worker, token)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert, key)
        server.socket = context.wrap_socket(server.socket, server_side=True, do_handshake_on_connect=False)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.worker.start()
        code = '''import {ResearchClient} from './src/research-client.ts';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout} from 'node:timers/promises';
const c=new ResearchClient(process.argv[1],process.env.APEX_RESEARCH_TOKEN,async b=>createHash('sha256').update(b).digest('hex'));
let j=await c.submit({requestId:randomUUID(),targetSha256:process.argv[2],operation:'elf-notes',symbol:null});
for(let n=0;n<200&&['queued','running'].includes(j.state);n++){await setTimeout(100);j=(await c.jobs()).find(x=>x.id===j.id);}
if(j.state!=='succeeded')throw new Error(JSON.stringify(j));
const r=await c.result(j);c.disconnect();console.log(JSON.stringify({provider:r.provider,targetExecuted:r.targetExecuted,target:r.target.sha256}));
'''
        try:
            environment = {**os.environ, 'NODE_EXTRA_CA_CERTS': str(cert), 'APEX_RESEARCH_TOKEN': token}
            checked = subprocess.run(['node', '--input-type=module', '-e', code, 'https://localhost:' + str(server.server_port), w.digest(self.target.read_bytes())], cwd=ROOT, env=environment, text=True, capture_output=True, timeout=35)
            self.assertEqual(checked.returncode, 0, checked.stderr)
            self.assertEqual(json.loads(checked.stdout)['target'], w.digest(self.target.read_bytes()))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(2)
        if os.environ.get('APEX_WORKER_GHIDRA') == '1':
            job = self.worker.submit(self.request(operation='ghidra-function', symbol='apex_crc16'))
            for _ in range(1900):
                if self.worker.get(job['id'])['state'] in w.TERMINAL:
                    break
                time.sleep(.1)
            self.assertEqual(self.worker.get(job['id'])['state'], 'succeeded', self.worker.get(job['id']))
            self.assertRegex(self.worker.result(job['id'])['output'], r'0x1021\b|\b4129\b')

    def test_real_https_auth_origin_submit_and_cancel(self):
        cert, key = self.root / 'cert.pem', self.root / 'key.pem'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(key), '-out', str(cert), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        token = 'x' * 43
        server = w.ResearchServer(('127.0.0.1', 0), self.worker, token, origin='https://app.example')
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert, key)
        server.socket = context.wrap_socket(server.socket, server_side=True, do_handshake_on_connect=False)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = 'https://localhost:' + str(server.server_port)
        trusted = ssl.create_default_context(cafile=cert)
        def call(path, body=None, auth=token, origin=None):
            headers = {'Authorization': 'Bearer ' + auth}
            if origin:
                headers['Origin'] = origin
            if body is not None:
                headers['Content-Type'] = 'application/json'
            req = Request(base + path, data=w.encode(body).encode() if body is not None else None, headers=headers)
            with urlopen(req, context=trusted, timeout=5) as response:
                return json.load(response)
        try:
            with self.assertRaises(URLError):
                urlopen(base + '/v1/catalogue', timeout=5)
            with self.assertRaises(HTTPError) as invalid:
                call('/v1/catalogue', auth='bad')
            self.assertEqual(invalid.exception.code, 401)
            with self.assertRaises(HTTPError) as origin:
                call('/v1/catalogue', origin='https://evil.example')
            self.assertEqual(origin.exception.code, 403)
            self.assertEqual(call('/v1/catalogue')['targets'][0]['sha256'], w.digest(self.target.read_bytes()))
            req = self.request()
            submitted = call('/v1/jobs', req)
            self.assertEqual(call('/v1/jobs', req), submitted)
            self.assertEqual(call('/v1/jobs/' + submitted['id'] + '/cancel', {})['state'], 'cancelled')
            self.assertEqual(call('/v1/jobs')['jobs'][0]['state'], 'cancelled')
        finally:
            server.shutdown()
            server.server_close()
            thread.join(2)


if __name__ == '__main__':
    unittest.main()
