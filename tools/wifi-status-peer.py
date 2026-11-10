#!/usr/bin/env python3
"""Read-only HTTPS status companion for a Linux lab host."""

import argparse
import hmac
import json
import os
import re
import ssl
import stat
from http.server import BaseHTTPRequestHandler, HTTPServer


SECURITY_MODES = ('open', 'wpa2', 'transition', 'wpa3', 'enterprise', 'unknown')
# Exact, common UCI encryption values. See docs/WIFI_STATUS_PEER.md for upstream.
OPENWRT_MODES = {
    'none': 'open',
    'psk2': 'wpa2',
    'sae-mixed': 'transition',
    'psk3-mixed': 'transition',
    'sae': 'wpa3',
    'psk3': 'wpa3',
    'wpa2': 'enterprise',
    'wpa3': 'enterprise',
    'wpa3-mixed': 'enterprise',
    'wpa3-192': 'enterprise',
}


def read_token(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_size > 128:
            raise ValueError('The pairing token must be in a private regular file.')
        token = os.read(fd, 129).strip().lower()
    finally:
        os.close(fd)
    if not re.fullmatch(rb'[0-9a-f]{64}', token):
        raise ValueError('The pairing token must contain 64 hexadecimal characters.')
    return token


def host_uptime():
    try:
        with open('/proc/uptime', 'rb') as metrics:
            seconds = int(float(metrics.read(128).split()[0]))
        return seconds if 0 <= seconds <= 0xffff_ffff else None
    except (OSError, IndexError, ValueError, OverflowError):
        return None


class StatusPeer(HTTPServer):
    def __init__(self, address, tls, token, security):
        self.tls = tls
        self.authorization = b'Bearer ' + token
        self.security = security
        super().__init__(address, StatusHandler)

    def get_request(self):
        client, address = super().get_request()
        try:
            client.settimeout(3)
            return self.tls.wrap_socket(client, server_side=True), address
        except OSError:
            client.close()
            raise


class StatusHandler(BaseHTTPRequestHandler):
    server_version = 'APEX-StatusPeer/1'
    sys_version = ''

    def do_GET(self):
        if self.path != '/v1/status':
            self.reply(404)
            return
        authorization = self.headers.get_all('Authorization', [])
        if len(authorization) != 1 or not hmac.compare_digest(
            authorization[0].encode('latin-1'), self.server.authorization
        ):
            self.reply(401)
            return
        status = {'version': 1, 'uptimeSeconds': host_uptime(), 'security': self.server.security}
        self.reply(200, json.dumps(status, separators=(',', ':')).encode('ascii'))

    def reply(self, code, body=b''):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format, *_args):
        # Request lines and authorization headers have no place in status logs.
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8443)
    parser.add_argument('--cert', required=True, help='TLS certificate chain in PEM format')
    parser.add_argument('--key', required=True, help='TLS private key in PEM format')
    parser.add_argument('--token-file', required=True)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--security', choices=SECURITY_MODES, default='unknown')
    modes.add_argument('--openwrt-encryption', choices=OPENWRT_MODES, help='Explicit UCI encryption value')
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error('Port must be between 0 and 65535.')
    try:
        token = read_token(args.token_file)
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.minimum_version = ssl.TLSVersion.TLSv1_2
        tls.load_cert_chain(args.cert, args.key)
        security = OPENWRT_MODES.get(args.openwrt_encryption, args.security)
        with StatusPeer((args.bind, args.port), tls, token, security) as peer:
            print(f'APEX status peer listening on port {peer.server_port}', flush=True)
            peer.serve_forever()
    except KeyboardInterrupt:
        pass
    except (OSError, ValueError) as error:
        parser.error(str(error))


if __name__ == '__main__':
    main()
