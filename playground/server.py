#!/usr/bin/env python3
"""Loopback-only trusted local editor. Never expose this compiler service publicly."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import hashlib
import json
import os
import signal
import subprocess
import tempfile
import threading
import urllib.parse

ROOT = Path(__file__).resolve().parent
PORT = 4191
LOCK = threading.Lock()
FILES = {'/': ('index.html', 'text/html'), '/app.js': ('app.js', 'text/javascript'),
         '/worker.js': ('worker.js', 'text/javascript'), '/wasi.js': ('wasi.js', 'text/javascript'),
         '/ContentView.swift': ('ContentView.swift', 'text/plain')}

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(body)

    def valid_host(self):
        return self.headers.get('Host') in (f'127.0.0.1:{PORT}', f'localhost:{PORT}')

    def do_GET(self):
        if not self.valid_host(): return self.reply(403, b'Invalid host', 'text/plain')
        path = urllib.parse.urlsplit(self.path).path
        if path not in FILES: return self.reply(404, b'Not found', 'text/plain')
        name, mime = FILES[path]
        self.reply(200, (ROOT / name).read_bytes(), mime)

    def do_POST(self):
        origin = self.headers.get('Origin')
        if not self.valid_host() or (origin and origin not in (f'http://127.0.0.1:{PORT}', f'http://localhost:{PORT}')):
            return self.reply(403, b'Invalid origin', 'text/plain')
        if self.path != '/compile': return self.reply(404, b'Not found', 'text/plain')
        if self.headers.get('Content-Type') != 'application/json': return self.reply(415, b'JSON required', 'text/plain')
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 65536: raise ValueError('Source must fit in 64 KiB')
            source = json.loads(self.rfile.read(size))['source']
            if not isinstance(source, str): raise ValueError('source must be text')
        except (ValueError, KeyError) as error:
            return self.reply(400, json.dumps({'error': str(error)}).encode())
        if not LOCK.acquire(blocking=False): return self.reply(429, b'{"error":"Compiler busy; try again"}')
        try:
            with tempfile.TemporaryDirectory(prefix='edit-', dir=ROOT / 'build') as folder:
                work = Path(folder)
                (work / 'ContentView.swift').write_text(source)
                process = subprocess.Popen(['python3', str(ROOT / 'build.py'), '--source', str(work / 'ContentView.swift'),
                    '--output', str(work / 'preview.wasm')], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    text=True, start_new_session=True)
                try:
                    stdout, stderr = process.communicate(timeout=30)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.communicate()
                    raise
                if process.returncode:
                    return self.reply(422, json.dumps({'error': stderr[-24000:].replace(str(work) + '/', '')}).encode())
                wasm = (work / 'preview.wasm').read_bytes()
                metrics = json.loads(stdout.splitlines()[-1])
                self.send_response(200)
                self.send_header('Content-Type', 'application/wasm')
                self.send_header('Content-Length', str(len(wasm)))
                self.send_header('Cache-Control', 'no-store')
                self.send_header('X-Build-Seconds', str(metrics['seconds']))
                self.send_header('X-Source-SHA256', hashlib.sha256(source.encode()).hexdigest())
                self.end_headers()
                self.wfile.write(wasm)
        except subprocess.TimeoutExpired:
            self.reply(408, b'{"error":"Compilation exceeded 30 seconds"}')
        finally:
            LOCK.release()

if __name__ == '__main__':
    print(f'OpenSwiftUI local playground: http://127.0.0.1:{PORT}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
