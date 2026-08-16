#!/usr/bin/env python3
"""Luma Home Dashboard – dependency-free local server."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, urljoin
from urllib.request import Request, urlopen
from pathlib import Path
from email.utils import formatdate
import base64, hashlib, hmac, ipaddress, json, os, re, secrets, socket, sqlite3, ssl, subprocess, time

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get("DASHBOARD_DB", str(ROOT / "dashboard.db")))
ITERATIONS = 210_000

def db():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    return con

def password_hash(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${base64.b64encode(salt).decode()}${base64.b64encode(key).decode()}"

def password_ok(password, encoded):
    try:
        _, rounds, salt, expected = encoded.split("$")
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt), int(rounds))
        return hmac.compare_digest(actual, base64.b64decode(expected))
    except Exception:
        return False

def init_db():
    DB.parent.mkdir(parents=True, exist_ok=True)
    with db() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', active INTEGER NOT NULL DEFAULT 1,
          must_change_password INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS dashboards (
          user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          data TEXT NOT NULL, updated_at INTEGER NOT NULL
        );
        """)
        if not con.execute("SELECT 1 FROM users").fetchone():
            admin_username = os.environ.get("DASHBOARD_ADMIN_USERNAME", "admin")
            admin_password = os.environ.get("DASHBOARD_ADMIN_PASSWORD", "admin")
            con.execute("INSERT INTO users(username,display_name,password_hash,role,must_change_password,created_at) VALUES(?,?,?,?,?,?)",
                        (admin_username, "Administrator", password_hash(admin_password), "admin", 0 if os.environ.get("DASHBOARD_ADMIN_PASSWORD") else 1, int(time.time())))

DEFAULT_DATA = {
  "settings": {},
  "widgets": []
}

class Handler(SimpleHTTPRequestHandler):
    server_version = "LumaDashboard/1.0"
    def translate_path(self, path):
        return str(ROOT / urlparse(path).path.lstrip("/"))
    def log_message(self, fmt, *args): print("[dashboard]", fmt % args)
    def body(self):
        try:
            n = int(self.headers.get("Content-Length", 0)); return json.loads(self.rfile.read(n) or b"{}")
        except Exception: return None
    def send_json(self, data, status=200, headers=None):
        raw=json.dumps(data,ensure_ascii=False).encode(); self.send_response(status)
        self.send_header("Content-Type","application/json; charset=utf-8"); self.send_header("Content-Length",str(len(raw)))
        self.send_header("Cache-Control","no-store")
        for k,v in (headers or {}).items(): self.send_header(k,v)
        self.end_headers(); self.wfile.write(raw)
    def send_image(self, raw, content_type):
        self.send_response(200); self.send_header("Content-Type",content_type)
        self.send_header("Content-Length",str(len(raw))); self.send_header("Cache-Control","private, max-age=3600")
        self.end_headers(); self.wfile.write(raw)
    def favicon(self, page_url):
        parsed=urlparse(page_url)
        if parsed.scheme not in ("http","https") or not parsed.netloc:return None
        context=ssl._create_unverified_context()
        headers={"User-Agent":"Mozilla/5.0 LumaDashboard/1.0","Accept":"text/html,image/*"}
        candidates=[]
        try:
            req=Request(page_url,headers=headers)
            with urlopen(req,timeout=4,context=context) as response:
                html=response.read(750000).decode(response.headers.get_content_charset() or "utf-8","ignore")
                final_url=response.geturl()
            tags=re.findall(r'<link\b[^>]*>',html,re.I)
            for tag in tags:
                rel=re.search(r'\brel\s*=\s*["\']([^"\']+)',tag,re.I)
                href=re.search(r'\bhref\s*=\s*["\']([^"\']+)',tag,re.I)
                if rel and href and ("icon" in rel.group(1).lower() or "apple-touch-icon" in rel.group(1).lower()):
                    candidates.append(urljoin(final_url,href.group(1)))
        except Exception: pass
        candidates.append(f"{parsed.scheme}://{parsed.netloc}/favicon.ico")
        for icon_url in candidates[:8]:
            try:
                with urlopen(Request(icon_url,headers=headers),timeout=4,context=context) as response:
                    raw=response.read(800000); content_type=response.headers.get_content_type()
                if raw and len(raw)<=750000 and (content_type.startswith("image/") or raw[:4] in (b"\x00\x00\x01\x00",b"\x89PNG")):
                    return raw, (content_type if content_type.startswith("image/") else "image/x-icon")
            except Exception: continue
        return None
    def cookies(self):
        out={}
        for item in self.headers.get("Cookie","").split(";"):
            if "=" in item:
                k,v=item.strip().split("=",1); out[k]=v
        return out
    def user(self):
        token=self.cookies().get("dashboard_session")
        if not token: return None
        th=hashlib.sha256(token.encode()).hexdigest()
        with db() as con:
            return con.execute("SELECT u.id,u.username,u.display_name,u.role,u.must_change_password FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1",(th,int(time.time()))).fetchone()
    def require(self, admin=False):
        u=self.user()
        if not u: self.send_json({"error":"Nicht angemeldet"},401); return None
        if admin and u["role"]!="admin": self.send_json({"error":"Keine Berechtigung"},403); return None
        return u
    def do_GET(self):
        parsed_request=urlparse(self.path); p=parsed_request.path
        if p in ("/dashboard.db", "/server.py") or p.startswith("/__pycache__/"):
            return self.send_json({"error":"Nicht gefunden"},404)
        if p=="/api/me":
            u=self.user(); return self.send_json({"user":dict(u) if u else None})
        if p=="/api/favicon":
            u=self.require()
            if not u:return
            page_url=parse_qs(parsed_request.query).get("url",[""])[0]
            result=self.favicon(page_url)
            if not result:return self.send_json({"error":"Kein Favicon gefunden"},404)
            return self.send_image(*result)
        if p=="/api/device-status":
            u=self.require()
            if not u:return
            host=parse_qs(parsed_request.query).get("host",[""])[0].strip()
            if not host or len(host)>253 or not re.fullmatch(r"[A-Za-z0-9._:-]+",host):
                return self.send_json({"error":"Ungültige IP-Adresse oder Hostname"},400)
            online=False; method=None
            try:
                result=subprocess.run(["ping","-c","1","-W","1","--",host],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=3)
                online=result.returncode==0
                if online: method="ping"
            except (OSError,subprocess.TimeoutExpired): pass
            requested_port=parse_qs(parsed_request.query).get("port",[""])[0]
            ports=[]
            if requested_port:
                try:
                    port=int(requested_port)
                    if 1<=port<=65535: ports=[port]
                except ValueError: pass
            if not ports: ports=[445,3389,22,80,443,32400]
            if not online:
                for port in ports:
                    try:
                        with socket.create_connection((host,port),timeout=.35): online=True; method=f"tcp:{port}"; break
                    except OSError: continue
            return self.send_json({"online":online,"method":method})
        if p=="/api/dashboard":
            u=self.require()
            if not u:return
            with db() as con: row=con.execute("SELECT data FROM dashboards WHERE user_id=?",(u["id"],)).fetchone()
            return self.send_json(json.loads(row["data"]) if row else DEFAULT_DATA)
        if p=="/api/users":
            u=self.require(True)
            if not u:return
            with db() as con: rows=con.execute("SELECT id,username,display_name,role,active,created_at FROM users ORDER BY id").fetchall()
            return self.send_json({"users":[dict(x) for x in rows]})
        if p.startswith("/api/"): return self.send_json({"error":"Nicht gefunden"},404)
        if p=="/": self.path="/index.html"
        return super().do_GET()
    def do_POST(self):
        p=urlparse(self.path).path; data=self.body()
        if data is None:return self.send_json({"error":"Ungültiges JSON"},400)
        if p=="/api/login":
            with db() as con: u=con.execute("SELECT * FROM users WHERE lower(username)=lower(?) AND active=1",(str(data.get("username","")),)).fetchone()
            if not u or not password_ok(str(data.get("password","")),u["password_hash"]): return self.send_json({"error":"Benutzername oder Passwort ist falsch."},401)
            token=secrets.token_urlsafe(40); now=int(time.time()); days=3650
            with db() as con:
                con.execute("DELETE FROM sessions WHERE expires_at<?",(now,)); con.execute("INSERT INTO sessions VALUES(?,?,?,?)",(hashlib.sha256(token.encode()).hexdigest(),u["id"],now+days*86400,now))
            expires=formatdate(now+days*86400,usegmt=True)
            cookie=f"dashboard_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={days*86400}; Expires={expires}"
            return self.send_json({"ok":True},headers={"Set-Cookie":cookie})
        if p=="/api/logout":
            token=self.cookies().get("dashboard_session","")
            with db() as con: con.execute("DELETE FROM sessions WHERE token_hash=?",(hashlib.sha256(token.encode()).hexdigest(),))
            return self.send_json({"ok":True},headers={"Set-Cookie":"dashboard_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"})
        if p=="/api/users":
            u=self.require(True)
            if not u:return
            username=str(data.get("username","")).strip(); password=str(data.get("password","")); name=str(data.get("display_name","")).strip()
            if len(username)<3 or len(password)<6 or not name:return self.send_json({"error":"Name und Benutzername sind erforderlich; Passwort mindestens 6 Zeichen."},400)
            role="admin" if data.get("role")=="admin" else "user"
            try:
                with db() as con: con.execute("INSERT INTO users(username,display_name,password_hash,role,must_change_password,created_at) VALUES(?,?,?,?,1,?)",(username,name,password_hash(password),role,int(time.time())))
            except sqlite3.IntegrityError:return self.send_json({"error":"Benutzername ist bereits vergeben."},409)
            return self.send_json({"ok":True},201)
        if p=="/api/password":
            u=self.require()
            if not u:return
            password=str(data.get("password",""))
            if len(password)<8:return self.send_json({"error":"Mindestens 8 Zeichen erforderlich."},400)
            with db() as con: con.execute("UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?",(password_hash(password),u["id"]))
            return self.send_json({"ok":True})
        if p=="/api/wol":
            u=self.require()
            if not u:return
            mac=re.sub(r'[^0-9A-Fa-f]','',str(data.get("mac","")))
            if len(mac)!=12:return self.send_json({"error":"Ungültige MAC-Adresse"},400)
            try:
                broadcast=str(ipaddress.IPv4Address(str(data.get("broadcast","255.255.255.255"))))
                port=int(data.get("port",9))
                if not 1<=port<=65535:raise ValueError()
                packet=b'\xff'*6+bytes.fromhex(mac)*16
                with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as sock:
                    sock.setsockopt(socket.SOL_SOCKET,socket.SO_BROADCAST,1); sock.sendto(packet,(broadcast,port))
            except (ValueError,OSError) as error:return self.send_json({"error":f"Magic Packet konnte nicht gesendet werden: {error}"},400)
            return self.send_json({"ok":True,"message":"Magic Packet gesendet"})
        return self.send_json({"error":"Nicht gefunden"},404)
    def do_PUT(self):
        p=urlparse(self.path).path; data=self.body(); u=self.require()
        if not u:return
        if p=="/api/dashboard":
            if not isinstance(data,dict) or not isinstance(data.get("widgets"),list):return self.send_json({"error":"Ungültiges Dashboard"},400)
            raw=json.dumps(data,ensure_ascii=False)
            if len(raw)>20*1024*1024:return self.send_json({"error":"Dashboard ist zu gross (maximal 20 MB)"},413)
            with db() as con: con.execute("INSERT INTO dashboards(user_id,data,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",(u["id"],raw,int(time.time())))
            return self.send_json({"ok":True})
        return self.send_json({"error":"Nicht gefunden"},404)
    def do_PATCH(self):
        p=urlparse(self.path).path; data=self.body(); u=self.require(True)
        if not u:return
        if p.startswith("/api/users/"):
            try: uid=int(p.rsplit("/",1)[1])
            except:return self.send_json({"error":"Ungültige ID"},400)
            if uid==u["id"] and data.get("active") is False:return self.send_json({"error":"Eigenes Konto kann nicht deaktiviert werden."},400)
            fields=[]; vals=[]
            for key in ("display_name","role","active"):
                if key in data:
                    val=data[key]
                    if key=="role": val="admin" if val=="admin" else "user"
                    if key=="active": val=1 if val else 0
                    fields.append(key+"=?");vals.append(val)
            if data.get("password"):
                if len(str(data["password"]))<6:return self.send_json({"error":"Passwort mindestens 6 Zeichen."},400)
                fields += ["password_hash=?","must_change_password=1"]; vals.append(password_hash(str(data["password"])))
            if not fields:return self.send_json({"error":"Keine Änderung"},400)
            vals.append(uid)
            with db() as con: con.execute(f"UPDATE users SET {','.join(fields)} WHERE id=?",vals)
            return self.send_json({"ok":True})
        return self.send_json({"error":"Nicht gefunden"},404)
    def do_DELETE(self):
        p=urlparse(self.path).path; u=self.require(True)
        if not u:return
        if p.startswith("/api/users/"):
            try:uid=int(p.rsplit("/",1)[1])
            except:return self.send_json({"error":"Ungültige ID"},400)
            if uid==u["id"]:return self.send_json({"error":"Das eigene angemeldete Konto kann nicht gelöscht werden."},400)
            with db() as con:
                target=con.execute("SELECT username FROM users WHERE id=?",(uid,)).fetchone()
                if not target:return self.send_json({"error":"Benutzer nicht gefunden"},404)
                con.execute("DELETE FROM users WHERE id=?",(uid,))
            return self.send_json({"ok":True})
        return self.send_json({"error":"Nicht gefunden"},404)

if __name__=="__main__":
    init_db(); port=int(os.environ.get("DASHBOARD_PORT","8080")); host=os.environ.get("DASHBOARD_HOST","0.0.0.0")
    print(f"Luma Dashboard: http://{host}:{port}")
    ThreadingHTTPServer((host,port),Handler).serve_forever()
