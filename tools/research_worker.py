#!/usr/bin/env python3
"""Single-operator HTTPS research queue. Registered local ELF inputs, never target execution."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import selectors
import signal
import sqlite3
import ssl
import subprocess
import threading
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
FUNCTIONS = {'apex_crc16', 'apex_encode', 'apex_stream_init', 'apex_stream_feed', 'apex_device_init', 'apex_device_feed'}
ID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}')
HASH = re.compile(r'[a-f0-9]{64}')
TERMINAL = {'succeeded', 'failed', 'cancelled', 'interrupted', 'cleanup-unknown'}


class Rejected(Exception):
    def __init__(self, code, status=400):
        super().__init__(code)
        self.code, self.status = code, status


def stamp():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def digest(value):
    return hashlib.sha256(value).hexdigest()


def encode(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=True)


def decode(document):
    def unique(pairs):
        output = {}
        for key, value in pairs:
            if key in output:
                raise Rejected('duplicate-json-key')
            output[key] = value
        return output
    try:
        return json.loads(document, object_pairs_hook=unique, parse_constant=lambda _: (_ for _ in ()).throw(Rejected('invalid-json')))
    except (ValueError, UnicodeError, RecursionError):
        raise Rejected('invalid-json') from None


def request(value):
    if not isinstance(value, dict) or set(value) != {'requestId', 'targetSha256', 'operation', 'symbol'}:
        raise Rejected('invalid-request')
    if not isinstance(value['requestId'], str) or not ID.fullmatch(value['requestId']) or not isinstance(value['targetSha256'], str) or not HASH.fullmatch(value['targetSha256']):
        raise Rejected('invalid-identity')
    op, symbol = value['operation'], value['symbol']
    if op not in ('elf-notes', 'ghidra-function') or (symbol is not None if op == 'elf-notes' else not isinstance(symbol, str) or symbol not in FUNCTIONS):
        raise Rejected('unsupported-operation')
    return {key: value[key] for key in ('requestId', 'targetSha256', 'operation', 'symbol')}


def bounded_file(path):
    import stat
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or not 16 <= before.st_size <= 4_194_304:
            raise Rejected('invalid-target')
        with os.fdopen(fd, 'rb', closefd=False) as handle:
            data = handle.read(before.st_size + 1)
        if len(data) != before.st_size or data[:4] != b'\x7fELF':
            raise Rejected('invalid-target')
        return data
    finally:
        os.close(fd)


class Worker:
    def __init__(self, directory, targets, *, engine=None, deadline=180):
        self.directory = Path(directory).absolute()
        # The directory is private operator-owned state, never a client-supplied path.
        if self.directory.is_symlink():
            raise Rejected('unsafe-state-directory')
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.directory.stat().st_mode & 0o077:
            raise Rejected('state-directory-must-be-private')
        self.lock = os.open(self.directory / 'worker.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(self.lock)
            raise Rejected('worker-already-running', 409) from None
        self.mutex = threading.RLock()
        self.stopping = threading.Event()
        self.wake = threading.Event()
        self.thread = None
        self.fault = None
        self.engine = engine or self.execute
        self.deadline = deadline
        self.targets = {}
        try:
            for target in targets:
                path = Path(target).absolute()
                data = bounded_file(path)
                label = path.name
                if not re.fullmatch(r'[A-Za-z0-9_.-]{1,80}', label):
                    raise Rejected('invalid-target-label')
                self.targets[digest(data)] = ({'sha256': digest(data), 'bytes': len(data), 'label': label}, path)
            if not 1 <= len(self.targets) <= 16:
                raise Rejected('target-count-limit')
            if (self.directory / 'jobs.sqlite').is_symlink():
                raise Rejected('unsafe-database')
            self.db = sqlite3.connect(self.directory / 'jobs.sqlite', check_same_thread=False, isolation_level=None)
            self.db.execute('PRAGMA journal_mode=WAL')
            self.db.execute('PRAGMA synchronous=FULL')
            self.db.execute('PRAGMA busy_timeout=5000')
            version = self.db.execute('PRAGMA user_version').fetchone()[0]
            if version not in (0, 1):
                raise Rejected('unsupported-job-store-version')
            self.db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, request TEXT NOT NULL, state TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL, error TEXT, result TEXT)')
            self.db.execute('PRAGMA user_version=1')
            # Never replay work whose process cleanup was lost across a crash.
            self.db.execute("UPDATE jobs SET state='interrupted', error='restart-cleanup-unverified', updated=? WHERE state IN ('running','cancelling')", (stamp(),))
        except BaseException:
            if hasattr(self, 'db'):
                self.db.close()
            os.close(self.lock)
            raise

    def _job(self, row):
        if not row:
            raise Rejected('job-not-found', 404)
        return {'id': row[0], 'request': decode(row[1]), 'state': row[2], 'createdAt': row[3], 'updatedAt': row[4], 'error': row[5]}

    def get(self, job_id):
        with self.mutex:
            return self._job(self.db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone())

    def jobs(self):
        with self.mutex:
            return [self._job(row) for row in self.db.execute('SELECT * FROM jobs ORDER BY created DESC, id LIMIT 100')]

    def blocked(self):
        with self.mutex:
            return self.fault is not None or self.db.execute("SELECT 1 FROM jobs WHERE state IN ('interrupted','cleanup-unknown') LIMIT 1").fetchone() is not None

    def submit(self, value):
        value = request(value)
        document = encode(value)
        with self.mutex:
            existing = self.db.execute('SELECT * FROM jobs WHERE id=?', (value['requestId'],)).fetchone()
            if existing:
                if existing[1] != document:
                    raise Rejected('idempotency-conflict', 409)
                return self._job(existing)
            if self.blocked():
                raise Rejected('worker-cleanup-unverified', 409)
            if value['targetSha256'] not in self.targets:
                raise Rejected('target-not-registered', 404)
            if self.db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0] >= 100 or self.db.execute("SELECT COUNT(*) FROM jobs WHERE state='queued'").fetchone()[0] >= 16:
                raise Rejected('queue-capacity', 429)
            at = stamp()
            self.db.execute('INSERT INTO jobs VALUES (?, ?, ?, ?, ?, NULL, NULL)', (value['requestId'], document, 'queued', at, at))
            self.wake.set()
            return self.get(value['requestId'])

    def cancel(self, job_id):
        with self.mutex:
            state = self.get(job_id)['state']
            if state not in TERMINAL:
                self.db.execute('UPDATE jobs SET state=?, updated=? WHERE id=?', ('cancelled' if state == 'queued' else 'cancelling', stamp(), job_id))
            self.wake.set()
            return self.get(job_id)

    def result(self, job_id):
        with self.mutex:
            job = self.get(job_id)
            if job['state'] != 'succeeded':
                raise Rejected('result-unavailable', 409)
            raw = self.db.execute('SELECT result FROM jobs WHERE id=?', (job_id,)).fetchone()[0]
            value = decode(raw)
            if value['jobId'] != job_id or value['request'] != job['request'] or digest(value['output'].encode()) != value['outputSha256']:
                raise Rejected('stored-result-integrity', 409)
            return value

    def start(self):
        if self.thread is not None:
            raise Rejected('dispatcher-already-started')
        self.thread = threading.Thread(target=self.loop, name='apex-research-dispatch', daemon=True)
        self.thread.start()

    def loop(self):
        while not self.stopping.is_set():
            try:
                if self.blocked() or not self.run_one():
                    self.wake.wait(0.2)
                    self.wake.clear()
            except Exception:
                # Do not keep accepting work after a lost state write or a dead dispatcher.
                self.fault = 'worker-state-unavailable'
                return

    def run_one(self):
        with self.mutex:
            if self.blocked() or self.stopping.is_set():
                return False
            if self.db.execute("SELECT 1 FROM jobs WHERE state IN ('running','cancelling') LIMIT 1").fetchone():
                return False
            row = self.db.execute("SELECT * FROM jobs WHERE state='queued' ORDER BY created,id LIMIT 1").fetchone()
            if not row:
                return False
            job = self._job(row)
            self.db.execute("UPDATE jobs SET state='running', updated=? WHERE id=?", (stamp(), job['id']))
        cancelled = lambda: self.stopping.is_set() or self.get(job['id'])['state'] == 'cancelling'
        state, error, result = 'failed', 'engine-failed', None
        try:
            payload = self.engine(job, cancelled)
            if set(payload) != {'provider', 'kind', 'output', 'reaVersion', 'outputSha256', 'targetExecuted'} or payload['reaVersion'] != '6.8.0' or payload['targetExecuted'] is not False:
                raise Rejected('invalid-engine-result')
            expected = ('rea-elf-notes/1', 'elf-notes') if job['request']['operation'] == 'elf-notes' else ('ghidra/12.1.4', 'pseudocode')
            if (payload['provider'], payload['kind']) != expected or not isinstance(payload['output'], str) or not 1 <= len(payload['output'].encode()) <= 32768 or digest(payload['output'].encode()) != payload['outputSha256']:
                raise Rejected('invalid-engine-result')
            result = {'schema': 'apex.research-result.v1', 'jobId': job['id'], 'request': job['request'], 'target': self.targets[job['request']['targetSha256']][0], **payload}
            if len(encode(result).encode()) > 65536:
                raise Rejected('result-size-limit')
            state, error = 'succeeded', None
        except Rejected as failure:
            state = 'cleanup-unknown' if failure.code == 'process-cleanup-unverified' else 'failed'
            error = failure.code
        except Exception:
            error = 'engine-failed'
        with self.mutex:
            # Cancellation wins over a result not yet durably committed. Unknown cleanup never becomes cancelled.
            if state != 'cleanup-unknown' and cancelled():
                state, error, result = 'cancelled', None, None
            if state != 'succeeded':
                result = None
            self.db.execute('UPDATE jobs SET state=?, error=?, result=?, updated=? WHERE id=?', (state, error, encode(result) if result else None, stamp(), job['id']))
        return True

    def execute(self, job, cancelled):
        registered = self.targets.get(job['request']['targetSha256'])
        if not registered:
            raise Rejected('target-not-registered')
        data = bounded_file(registered[1])
        if digest(data) != registered[0]['sha256']:
            raise Rejected('target-changed')
        workspace = self.directory / job['id']
        workspace.mkdir(mode=0o700)
        target = workspace / 'input.elf'
        with target.open('xb') as f:
            os.fchmod(f.fileno(), 0o400)
            f.write(data)
        args = ['node', str(ROOT / 'tools/research-worker/analyse.mjs'), job['request']['operation'], str(target), registered[0]['sha256'], job['request']['symbol'] or '-']
        environment = dict(os.environ)
        environment.pop('APEX_RESEARCH_TOKEN', None)
        environment['REA_GHIDRA_DECOMPILE_TIMEOUT_SECONDS'] = '60'
        try:
            raw = run_process(args, cancelled, self.deadline, environment, workspace)
        except Rejected as error:
            if error.code != 'process-cleanup-unverified':
                target.unlink(missing_ok=True)
            raise
        if digest(bounded_file(target)) != registered[0]['sha256']:
            raise Rejected('snapshot-changed')
        target.unlink()
        return decode(raw)

    def close(self):
        self.stopping.set()
        self.wake.set()
        if self.thread:
            self.thread.join(self.deadline + 15)
            if self.thread.is_alive():
                raise Rejected('worker-stop-unverified')
        with self.mutex:
            self.db.close()
            fcntl.flock(self.lock, fcntl.LOCK_UN)
            os.close(self.lock)


def run_process(args, cancelled, deadline, environment, diagnostics=None):
    p = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True, env=environment, cwd=ROOT)
    selector = selectors.DefaultSelector()
    for stream in (p.stdout, p.stderr):
        os.set_blocking(stream.fileno(), False)
        selector.register(stream, selectors.EVENT_READ)
    captured, errors, total, reason = bytearray(), bytearray(), 0, None
    end = time.monotonic() + deadline
    try:
        while selector.get_map():
            if cancelled() or time.monotonic() >= end:
                reason = 'cancelled' if cancelled() else 'engine-timeout'
                break
            for key, _ in selector.select(0.05):
                chunk = os.read(key.fileobj.fileno(), 8192)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                total += len(chunk)
                if total > 131072:
                    reason = 'engine-output-limit'
                    break
                if key.fileobj is p.stdout:
                    captured.extend(chunk)
                else:
                    errors.extend(chunk)
            if reason:
                break
        if not reason:
            try:
                p.wait(timeout=max(0.01, end - time.monotonic()))
            except subprocess.TimeoutExpired:
                reason = 'engine-timeout'
    finally:
        selector.close()
        # Reap the direct child, then require absence of the owned group. Escaped descendants are outside this guarantee.
        def exists():
            try:
                os.killpg(p.pid, 0)
                return True
            except ProcessLookupError:
                return False
        clean = False
        try:
            if exists():
                if not reason:
                    reason = 'engine-left-processes'
                try:
                    os.killpg(p.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                try:
                    p.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    pass
                if exists():
                    try:
                        os.killpg(p.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
            p.wait(timeout=5)
            until = time.monotonic() + 2
            while exists() and time.monotonic() < until:
                time.sleep(0.02)
            clean = not exists()
        except (OSError, subprocess.SubprocessError):
            # An unavailable permission/process probe is uncertainty, never ordinary completion.
            try:
                p.kill()
                p.wait(timeout=2)
            except (OSError, subprocess.SubprocessError):
                pass
        finally:
            p.stdout.close()
            p.stderr.close()
        if diagnostics:
            try:
                record = {'exitCode': p.returncode, 'reason': reason, 'processGroupAbsent': clean,
                          'stdoutSha256': digest(captured), 'stderrSha256': digest(errors),
                          'capturedBytes': len(captured) + len(errors)}
                for name, data in [('stdout.txt', captured), ('stderr.txt', errors), ('process.json', encode(record).encode())]:
                    with (diagnostics / name).open('xb') as retained:
                        os.fchmod(retained.fileno(), 0o600)
                        retained.write(data)
                        retained.flush()
                        os.fsync(retained.fileno())
            except OSError:
                if clean:
                    raise Rejected('diagnostic-retention-failed') from None
        if not clean:
            raise Rejected('process-cleanup-unverified')
    if reason or p.returncode != 0:
        raise Rejected(reason or 'engine-failed')
    return bytes(captured).decode('utf-8', errors='strict')


class ResearchServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8

    def __init__(self, address, worker, token, *, origin=None):
        if not re.fullmatch(r'[A-Za-z0-9_-]{43,128}', token):
            raise Rejected('use-a-random-token-of-at-least-43-characters')
        self.worker, self.token, self.origin = worker, token, origin
        self.slots = threading.BoundedSemaphore(8)
        super().__init__(address, Handler)

    def process_request(self, connection, address):
        if not self.slots.acquire(False):
            self.shutdown_request(connection)
            return
        super().process_request(connection, address)

    def process_request_thread(self, connection, address):
        try:
            super().process_request_thread(connection, address)
        finally:
            self.slots.release()

    def handle_error(self, request, client_address):
        # Handshake rejection and socket failures must not expose request context or host paths.
        pass


class Handler(BaseHTTPRequestHandler):
    server_version = 'APEX-research'
    sys_version = ''

    def setup(self):
        self.request.settimeout(10)
        if isinstance(self.request, ssl.SSLSocket):
            self.request.do_handshake()
        super().setup()

    def log_message(self, *_):
        pass  # Never log credentials, request paths or engine content.

    def reply(self, status, value):
        content = encode(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Connection', 'close')
        if self.server.origin and self.headers.get('Origin') == self.server.origin:
            self.send_header('Access-Control-Allow-Origin', self.server.origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        self.end_headers()
        self.wfile.write(content)

    def do_OPTIONS(self):
        if self.server.origin and self.headers.get('Origin') == self.server.origin:
            self.reply(200, {})
        else:
            self.reply(403, {'error': 'origin-rejected'})

    def do_GET(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def dispatch(self):
        try:
            if self.headers.get('Origin') and self.headers.get('Origin') != self.server.origin:
                raise Rejected('origin-rejected', 403)
            auth = self.headers.get_all('Authorization', [])
            if len(auth) != 1 or not hmac.compare_digest(auth[0].encode(), ('Bearer ' + self.server.token).encode()):
                raise Rejected('unauthorised', 401)
            value = None
            if self.command == 'POST':
                lengths = self.headers.get_all('Content-Length', [])
                if self.headers.get('Transfer-Encoding') or self.headers.get('Content-Encoding') or len(lengths) != 1 or not re.fullmatch('[0-9]{1,5}', lengths[0]) or not 1 <= int(lengths[0]) <= 4096 or self.headers.get('Content-Type') != 'application/json':
                    raise Rejected('invalid-body-framing', 413)
                raw = self.rfile.read(int(lengths[0]))
                if len(raw) != int(lengths[0]):
                    raise Rejected('incomplete-body')
                value = decode(raw)
            worker = self.server.worker
            if self.command == 'GET' and self.path == '/v1/catalogue':
                return self.reply(200, {'targets': [t[0] for t in worker.targets.values()], 'blocked': worker.blocked()})
            if self.command == 'GET' and self.path == '/v1/jobs':
                return self.reply(200, {'jobs': worker.jobs()})
            if self.command == 'POST' and self.path == '/v1/jobs':
                return self.reply(200, worker.submit(value))
            match = re.fullmatch(r'/v1/jobs/([a-f0-9-]{36})(/cancel|/result)?', self.path)
            if not match or not ID.fullmatch(match[1]):
                raise Rejected('route-not-found', 404)
            job_id, suffix = match.groups()
            if self.command == 'GET' and not suffix:
                return self.reply(200, worker.get(job_id))
            if self.command == 'GET' and suffix == '/result':
                return self.reply(200, worker.result(job_id))
            if self.command == 'POST' and suffix == '/cancel' and value == {}:
                return self.reply(200, worker.cancel(job_id))
            raise Rejected('route-not-found', 404)
        except Rejected as error:
            self.reply(error.status, {'error': error.code})
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            self.close_connection = True
        except Exception:
            self.reply(500, {'error': 'worker-storage-or-runtime-failed'})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--target', type=Path, action='append', required=True)
    parser.add_argument('--cert', type=Path, required=True)
    parser.add_argument('--key', type=Path, required=True)
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8443)
    parser.add_argument('--web-origin')
    args = parser.parse_args()
    if args.web_origin:
        origin = urlsplit(args.web_origin)
        if origin.scheme not in ('https', 'http') or origin.path or origin.query or origin.fragment or origin.username or origin.password or not origin.hostname:
            parser.error('web-origin must be an exact browser origin')
    os.umask(0o077)
    worker = Worker(args.state, args.target)
    try:
        server = ResearchServer((args.bind, args.port), worker, os.environ.get('APEX_RESEARCH_TOKEN', ''), origin=args.web_origin)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(args.cert, args.key)
        server.socket = context.wrap_socket(server.socket, server_side=True, do_handshake_on_connect=False)
        worker.start()
        print(encode({'ready': True, 'port': server.server_port, 'targets': len(worker.targets), 'blocked': worker.blocked()}), flush=True)
        signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
        try:
            server.serve_forever(poll_interval=0.2)
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
    finally:
        worker.close()


if __name__ == '__main__':
    main()
