"""Loopback static host with an opt-in, browser-restricted ArcGIS runtime configuration."""
import json
import os
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from functools import partial

ROOT = Path(__file__).resolve().parents[1]
CONFIG = '/data/arcgis-runtime.json'

def settings():
    values = {}
    for name in ('.env', '.env.local'):
        path = ROOT / name
        if not path.is_file():
            continue
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            key, sep, value = line.strip().partition('=')
            if sep and key in ('ARCGIS_API_KEY', 'ARCGIS_IMAGERY_ENABLED'):
                values[key] = value.strip().strip('"').strip("'")
    enabled = os.environ.get('ARCGIS_IMAGERY_ENABLED', values.get('ARCGIS_IMAGERY_ENABLED', '')).lower() == 'true'
    token = os.environ.get('ARCGIS_API_KEY', values.get('ARCGIS_API_KEY', '')).strip() if enabled else ''
    return {'arcgisImageryEnabled': bool(token), 'arcgisApiKey': token}

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path != CONFIG:
            return super().do_GET()
        payload = json.dumps(settings()).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=5173)
    args = parser.parse_args()
    httpd = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(ROOT / 'dist')))
    print('Brigade Barcelona at http://127.0.0.1:%d/experience/' % httpd.server_port, flush=True)
    httpd.serve_forever()
