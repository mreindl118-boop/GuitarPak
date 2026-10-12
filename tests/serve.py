# Static server for the test suites: the repo root on 127.0.0.1:4573, quiet,
# with JS/woff2 content types set (python's defaults vary by platform).
import functools, http.server, os, socketserver
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'application/javascript; charset=utf-8', '.woff2': 'font/woff2'}
class S(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    def handle_error(self, request, client_address): pass  # a closed browser mid-download is fine
S(('127.0.0.1', 4573), functools.partial(Q, directory=ROOT)).serve_forever()
