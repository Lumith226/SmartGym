"""Static WEB only. AI runs separately on port 8001."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='WEB: giao diện Smart Gym V4 local')
    parser.add_argument('--port', type=int, default=8080)
    args = parser.parse_args()
    handler = partial(SimpleHTTPRequestHandler, directory=str(Path(__file__).resolve().parent))
    print(f'WEB: http://localhost:{args.port} — Server AI riêng: http://127.0.0.1:8001', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), handler).serve_forever()
