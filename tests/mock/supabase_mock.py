"""最小 Supabase 模拟（只实现 online.js 用到的接口），给 tests/2d-online.test.mjs 用。用法：python3 supabase_mock.py 端口"""
import json, sys, uuid, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
USERS = {}   # email -> {id,password,username}
TOKENS = {}  # token -> user id
PLAYERS = {} # id -> {username,is_tester}
CHARS = {}   # id -> row
STASH = {}   # owner -> row
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,DELETE,PATCH,OPTIONS')
    def _send(self, code, obj=None):
        self.send_response(code); self._cors(); self.send_header('Content-Type', 'application/json'); self.end_headers()
        if obj is not None: self.wfile.write(json.dumps(obj).encode())
    def do_OPTIONS(self): self.send_response(204); self._cors(); self.end_headers()
    def _body(self):
        n = int(self.headers.get('Content-Length') or 0); return json.loads(self.rfile.read(n) or b'null')
    def _uid(self):
        a = self.headers.get('Authorization', ''); return TOKENS.get(a[7:]) if a.startswith('Bearer ') else None
    def _session(self, uid):
        t = uuid.uuid4().hex; TOKENS[t] = uid
        return {'access_token': t, 'refresh_token': 'r' + t, 'expires_in': 3600, 'user': {'id': uid}}
    def do_POST(self):
        u = urlparse(self.path); q = parse_qs(u.query); b = self._body()
        if u.path == '/auth/v1/signup':
            if b['email'] in USERS: return self._send(422, {'msg': 'User already registered'})
            uid = str(uuid.uuid4()); name = (b.get('data') or {}).get('username', b['email'].split('@')[0]).lower()
            USERS[b['email']] = {'id': uid, 'password': b['password']}; PLAYERS[uid] = {'username': name, 'is_tester': name == 'guixu_test'}
            return self._send(200, self._session(uid))
        if u.path == '/auth/v1/token':
            if q.get('grant_type') == ['password']:
                usr = USERS.get(b['email'])
                if not usr or usr['password'] != b['password']: return self._send(400, {'error_description': 'Invalid login credentials'})
                return self._send(200, self._session(usr['id']))
            uid = TOKENS.get(b['refresh_token'][1:]); return self._send(200, self._session(uid)) if uid else self._send(400, {'msg': 'bad refresh'})
        if u.path == '/auth/v1/logout': return self._send(204)
        uid = self._uid()
        if not uid: return self._send(401, {'message': 'JWT expired'})
        if u.path == '/rest/v1/characters':
            for row in b:
                if row['owner'] != uid: return self._send(403, {'message': 'rls'})
                CHARS[row['id']] = row
            return self._send(201)
        if u.path == '/rest/v1/stashes':
            for row in b: STASH[uid] = row
            return self._send(201)
        self._send(404, {})
    def do_GET(self):
        u = urlparse(self.path); uid = self._uid()
        if not uid: return self._send(401, {'message': 'JWT expired'})
        if u.path == '/rest/v1/players': p = PLAYERS.get(uid); return self._send(200, [p] if p else [])
        if u.path == '/rest/v1/characters': return self._send(200, [r for r in CHARS.values() if r['owner'] == uid])
        if u.path == '/rest/v1/stashes': return self._send(200, [STASH[uid]] if uid in STASH else [])
        self._send(404, {})
    def do_DELETE(self):
        u = urlparse(self.path); uid = self._uid(); q = parse_qs(u.query)
        cid = q.get('id', [''])[0].removeprefix('eq.')
        if CHARS.get(cid, {}).get('owner') == uid: del CHARS[cid]
        self._send(204)
ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
