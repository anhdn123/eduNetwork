"""Learning by AI — server (Python thuần + SQLite, không cần cài thêm thư viện).

Chạy:  python -m server           (mặc định chỉ nghe ở 127.0.0.1)
Biến môi trường:
  LBAI_HOST=0.0.0.0   cho phép máy khác trong mạng LAN truy cập
  LBAI_PORT=5500      cổng ưu tiên (nếu bận / bị Windows chặn sẽ thử cổng khác)
  LBAI_DATA=...       thư mục dữ liệu (SQLite + file upload)
  LBAI_COOKIE_SECURE=1  bật cờ Secure cho cookie (khi chạy sau HTTPS)
"""
import base64
import calendar
import datetime
import hashlib
import hmac
import http.server
import json
import mimetypes
import os
import random
import re
import secrets
import signal
import sys
import threading
import time
import urllib.parse
import webbrowser

from . import ai, backup, db, grading, security

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
COOKIE_SECURE = os.environ.get("LBAI_COOKIE_SECURE") == "1"
# Chạy sau proxy/CDN (Render, Caddy, nginx, Cloudflare...): lấy IP thật của người dùng từ X-Forwarded-For để khóa đăng nhập đúng người.
# Chỉ bật khi thật sự đứng sau proxy tin cậy; PROXY_HOPS = số lớp proxy (lấy địa chỉ thứ N tính từ bên phải, phần bên trái do người dùng tự khai nên không tin).
TRUST_PROXY = os.environ.get("LBAI_TRUST_PROXY") == "1"
PROXY_HOPS = max(1, int(os.environ.get("LBAI_PROXY_HOPS") or 1))
# Mã thiết lập: nếu đặt, trang “Thiết lập lần đầu” (tạo quản trị viên) bắt buộc nhập mã này → người lạ vào trước không chiếm được quyền admin
SETUP_CODE = os.environ.get("LBAI_SETUP_CODE") or ""
MAX_JSON = 3 * 1024 * 1024
MAX_UPLOAD = 25 * 1024 * 1024
FILE_EXT = {  # whitelist file upload; MIME do server quyết định, không tin client
    "pdf": "application/pdf", "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "ppt": "application/vnd.ms-powerpoint", "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "xls": "application/vnd.ms-excel", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp",
    "txt": "text/plain; charset=utf-8", "mp4": "video/mp4", "zip": "application/zip",
}
INLINE_MIME = ("image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "video/mp4")
STATIC_EXT = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8",
              ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json",
              ".gz": "application/gzip", ".wasm": "application/wasm"}   # .gz: dữ liệu ngôn ngữ OCR (vendor/tesseract/lang)
TEACHER_ROLES = ("admin", "teacher")
limiter = security.RateLimiter()


class ApiError(Exception):
    def __init__(self, status, msg):
        super().__init__(msg)
        self.status, self.msg = status, msg


class Raw:
    def __init__(self, status, headers, body):
        self.status, self.headers, self.body = status, headers, body


ROUTES = []


def route(method, pattern, roles=None):
    """roles=None: công khai · 'any': mọi người đã đăng nhập · tuple: chỉ các vai trò đó."""
    rx = re.compile("^" + pattern + "$")

    def deco(fn):
        ROUTES.append((method, rx, roles, fn))
        return fn
    return deco


class Ctx:
    def __init__(self, handler, con, user, body, query, params):
        self.h, self.con, self.user, self.body, self.query, self.p = handler, con, user, body, query, params


# ---------- tiện ích ----------
def need_str(body, key, maxlen=200, required=True):
    v = body.get(key)
    if v is None or v == "":
        if required:
            raise ApiError(400, f"Thiếu trường “{key}”")
        return ""
    if not isinstance(v, str):
        raise ApiError(400, f"Trường “{key}” không hợp lệ")
    v = v.strip()
    if len(v) > maxlen:
        raise ApiError(400, f"Trường “{key}” quá dài (tối đa {maxlen} ký tự)")
    if required and not v:
        raise ApiError(400, f"Thiếu trường “{key}”")
    return v


def need_int(body, key, lo=None, hi=None, default=None):
    v = body.get(key, default)
    if v is None:
        raise ApiError(400, f"Thiếu trường “{key}”")
    try:
        v = int(v)
    except (TypeError, ValueError):
        raise ApiError(400, f"Trường “{key}” phải là số")
    if (lo is not None and v < lo) or (hi is not None and v > hi):
        raise ApiError(400, f"Trường “{key}” ngoài phạm vi cho phép")
    return v


def audit(con, user_id, action, detail=""):
    con.execute("INSERT INTO audit(user_id,action,detail,at) VALUES(?,?,?,?)", (user_id, action, str(detail)[:500], db.now()))


def user_dict(con, u):
    cls = con.execute("SELECT name, grade FROM classes WHERE id=?", (u["class_id"],)).fetchone() if u["class_id"] else None
    return {"id": u["id"], "username": u["username"], "name": u["name"], "role": u["role"], "class_id": u["class_id"],
            "class_name": cls["name"] if cls else None, "class_grade": cls["grade"] if cls else "", "must_change": bool(u["must_change"]), "subject": u["subject"], "bio": u["bio"]}


def is_teacher(u):
    return u["role"] in TEACHER_ROLES


def get_class(con, user, cid):
    c = con.execute("SELECT * FROM classes WHERE id=?", (cid,)).fetchone()
    if not c or (user["role"] != "admin" and c["owner_id"] != user["id"]):
        raise ApiError(404, "Không tìm thấy lớp")
    return c


def get_student(con, user, sid):
    s = con.execute("SELECT * FROM users WHERE id=? AND role='student'", (sid,)).fetchone()
    if not s:
        raise ApiError(404, "Không tìm thấy học sinh")
    if user["role"] != "admin":
        owner = con.execute("SELECT owner_id FROM classes WHERE id=?", (s["class_id"],)).fetchone() if s["class_id"] else None
        if not ((owner and owner["owner_id"] == user["id"]) or s["created_by"] == user["id"]):
            raise ApiError(404, "Không tìm thấy học sinh")
    return s


def get_assignment(con, user, aid, teacher_side=True):
    a = con.execute("SELECT * FROM assignments WHERE id=?", (aid,)).fetchone()
    if not a or (teacher_side and user["role"] != "admin" and a["owner_id"] != user["id"]):
        raise ApiError(404, "Không tìm thấy bài được giao")
    return a


def unique_username(con, base):
    base = re.sub(r"[^a-z0-9._-]", "", base.lower())[:24] or "user"
    cand, n = base, 1
    while con.execute("SELECT 1 FROM users WHERE username=?", (cand,)).fetchone():
        n += 1
        cand = f"{base}{n}"
    return cand


def valid_username(u):
    return bool(re.fullmatch(r"[a-zA-Z0-9._-]{3,32}", u or ""))


def create_user(con, creator_id, name, role, username=None, password=None, class_id=None, must_change=True, subject=""):
    if username:
        if not valid_username(username):
            raise ApiError(400, "Tên đăng nhập 3–32 ký tự, chỉ gồm chữ, số, dấu . _ -")
        if con.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
            raise ApiError(409, f"Tên đăng nhập “{username}” đã tồn tại")
    else:
        username = unique_username(con, security.slug_username(name))
    generated = not password
    pw = password or security.random_password()
    if not generated:
        prob = security.password_problem(pw)
        if prob:
            raise ApiError(400, prob)
    cur = con.execute("INSERT INTO users(username,name,role,pw,class_id,created_by,created_at,must_change,subject) VALUES(?,?,?,?,?,?,?,?,?)",
                      (username, name, role, security.hash_password(pw), class_id, creator_id, db.now(), 1 if must_change else 0, subject))
    return {"id": cur.lastrowid, "username": username, "name": name, "role": role, "class_id": class_id, "password": pw}


# ---------- xác thực ----------
@route("GET", "/api/status")
def r_status(c):
    n = c.con.execute("SELECT COUNT(*) n FROM users").fetchone()["n"]
    return {"needs_setup": n == 0, "needs_code": n == 0 and bool(SETUP_CODE)}


def client_ip(h) -> str:
    peer = h.client_address[0]
    if TRUST_PROXY:
        parts = [p.strip() for p in (h.headers.get("X-Forwarded-For") or "").split(",") if p.strip()]
        if len(parts) >= PROXY_HOPS:
            return parts[-PROXY_HOPS][:64]
    return peer


def start_session(c, user_id):
    c.con.execute("DELETE FROM sessions WHERE expires_at<?", (db.now(),))
    tok = security.new_token()
    c.con.execute("INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)",
                  (security.token_hash(tok), user_id, db.now(), db.now() + security.SESSION_TTL))
    c.con.execute("UPDATE users SET last_login=? WHERE id=?", (db.now(), user_id))
    c.h.set_cookie = f"sid={tok}; HttpOnly; SameSite=Lax; Path=/; Max-Age={security.SESSION_TTL}" + ("; Secure" if COOKIE_SECURE else "")


@route("POST", "/api/setup")
def r_setup(c):
    if c.con.execute("SELECT COUNT(*) n FROM users").fetchone()["n"]:
        raise ApiError(403, "Hệ thống đã được thiết lập")
    if SETUP_CODE:
        key = ("setup", client_ip(c.h))
        wait = limiter.blocked(key)
        if wait:
            raise ApiError(429, f"Nhập sai mã thiết lập quá nhiều lần. Thử lại sau {wait} giây.")
        if not hmac.compare_digest(str(c.body.get("code") or "").encode(), SETUP_CODE.encode()):
            limiter.fail(key)
            raise ApiError(403, "Mã thiết lập không đúng")
        limiter.ok(key)
    name, username = need_str(c.body, "name", 80), need_str(c.body, "username", 32)
    pw = c.body.get("password") or ""
    u = create_user(c.con, None, name, "admin", username, pw, must_change=False)
    audit(c.con, u["id"], "setup", username)
    start_session(c, u["id"])
    return {"ok": True}


@route("POST", "/api/login")
def r_login(c):
    username = need_str(c.body, "username", 64).lower()
    pw = c.body.get("password") or ""
    key = (client_ip(c.h), username)
    wait = limiter.blocked(key)
    if wait:
        raise ApiError(429, f"Đăng nhập sai quá nhiều lần. Thử lại sau {wait} giây.")
    u = c.con.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    if not u or not u["active"] or not security.verify_password(pw, u["pw"]):
        limiter.fail(key)
        audit(c.con, u["id"] if u else None, "login_fail", username)
        raise ApiError(401, "Sai tên đăng nhập hoặc mật khẩu")
    limiter.ok(key)
    start_session(c, u["id"])
    audit(c.con, u["id"], "login", "")
    return {"user": user_dict(c.con, u)}


@route("POST", "/api/logout", "any")
def r_logout(c):
    c.con.execute("DELETE FROM sessions WHERE token_hash=?", (security.token_hash(c.h.session_token),))
    c.h.set_cookie = "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    return {"ok": True}


@route("GET", "/api/me", "any")
def r_me(c):
    return {"user": user_dict(c.con, c.user)}


@route("POST", "/api/password", "any")
def r_password(c):
    old, new = c.body.get("old") or "", c.body.get("new") or ""
    if not security.verify_password(old, c.user["pw"]):
        raise ApiError(400, "Mật khẩu hiện tại không đúng")
    prob = security.password_problem(new)
    if prob:
        raise ApiError(400, prob)
    if new == old:
        raise ApiError(400, "Mật khẩu mới phải khác mật khẩu cũ")
    c.con.execute("UPDATE users SET pw=?, must_change=0 WHERE id=?", (security.hash_password(new), c.user["id"]))
    c.con.execute("DELETE FROM sessions WHERE user_id=? AND token_hash<>?", (c.user["id"], security.token_hash(c.h.session_token)))
    audit(c.con, c.user["id"], "password_change", "")
    return {"ok": True}


@route("PATCH", "/api/profile", "any")
def r_profile(c):
    name = need_str(c.body, "name", 80)
    c.con.execute("UPDATE users SET name=?, bio=?, subject=? WHERE id=?",
                  (name, need_str(c.body, "bio", 600, False), need_str(c.body, "subject", 60, False), c.user["id"]))
    return {"ok": True}


# ---------- quản lý tài khoản ----------
@route("GET", "/api/teachers", ("admin",))
def r_teachers(c):
    rows = c.con.execute("SELECT id,username,name,active,last_login,created_at FROM users WHERE role='teacher' ORDER BY name").fetchall()
    return {"teachers": [dict(r) for r in rows]}


@route("POST", "/api/teachers", ("admin",))
def r_teacher_new(c):
    u = create_user(c.con, c.user["id"], need_str(c.body, "name", 80), "teacher", need_str(c.body, "username", 32, False) or None,
                    c.body.get("password") or None, subject=need_str(c.body, "subject", 60, False))
    audit(c.con, c.user["id"], "create_teacher", u["username"])
    return {"account": u}


@route("GET", "/api/backup/status", ("admin",))
def r_backup_status(c):
    return backup.status()


@route("POST", "/api/backup/run", ("admin",))
def r_backup_run(c):
    r = backup.run_backup(force=True)
    audit(c.con, c.user["id"], "backup", "ok" if r.get("ok") else "lỗi")
    if not r.get("ok"):
        raise ApiError(502, r.get("error") or "Sao lưu không thành công")
    return r


@route("POST", r"/api/users/(\d+)/reset-password", ("admin", "teacher"))
def r_reset_pw(c):
    uid = int(c.p[0])
    t = c.con.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not t or t["role"] == "admin":
        raise ApiError(404, "Không tìm thấy tài khoản")
    if c.user["role"] != "admin":
        if t["role"] == "student":
            get_student(c.con, c.user, uid)
        elif t["role"] == "parent" and t["created_by"] == c.user["id"]:
            pass
        else:
            raise ApiError(403, "Bạn không có quyền đặt lại mật khẩu tài khoản này")
    pw = security.random_password()
    c.con.execute("UPDATE users SET pw=?, must_change=1 WHERE id=?", (security.hash_password(pw), uid))
    c.con.execute("DELETE FROM sessions WHERE user_id=?", (uid,))
    audit(c.con, c.user["id"], "reset_password", t["username"])
    return {"account": {"id": uid, "username": t["username"], "name": t["name"], "password": pw}}


@route("POST", r"/api/users/(\d+)/active", ("admin", "teacher"))
def r_user_active(c):
    uid = int(c.p[0])
    t = c.con.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not t or t["role"] == "admin" or t["id"] == c.user["id"]:
        raise ApiError(404, "Không tìm thấy tài khoản")
    if c.user["role"] != "admin":
        if t["role"] == "student":
            get_student(c.con, c.user, uid)
        elif not (t["role"] == "parent" and t["created_by"] == c.user["id"]):
            raise ApiError(403, "Bạn không có quyền với tài khoản này")
    active = 1 if c.body.get("active") else 0
    c.con.execute("UPDATE users SET active=? WHERE id=?", (active, uid))
    if not active:
        c.con.execute("DELETE FROM sessions WHERE user_id=?", (uid,))
    audit(c.con, c.user["id"], "set_active", f"{t['username']}={active}")
    return {"ok": True}


# ---------- lớp học & học sinh ----------
@route("GET", "/api/classes", TEACHER_ROLES)
def r_classes(c):
    q = "SELECT c.*, (SELECT COUNT(*) FROM users u WHERE u.class_id=c.id AND u.role='student' AND u.active=1) n FROM classes c"
    rows = c.con.execute(q + ("" if c.user["role"] == "admin" else " WHERE c.owner_id=?") + " ORDER BY c.name",
                         () if c.user["role"] == "admin" else (c.user["id"],)).fetchall()
    return {"classes": [{"id": r["id"], "name": r["name"], "grade": r["grade"], "students": r["n"]} for r in rows]}


@route("POST", "/api/classes", TEACHER_ROLES)
def r_class_new(c):
    cur = c.con.execute("INSERT INTO classes(name,grade,owner_id,created_at) VALUES(?,?,?,?)",
                        (need_str(c.body, "name", 60), need_str(c.body, "grade", 4, False), c.user["id"], db.now()))
    return {"id": cur.lastrowid}


@route("PATCH", r"/api/classes/(\d+)", TEACHER_ROLES)
def r_class_edit(c):
    get_class(c.con, c.user, int(c.p[0]))
    c.con.execute("UPDATE classes SET name=?, grade=? WHERE id=?", (need_str(c.body, "name", 60), need_str(c.body, "grade", 4, False), int(c.p[0])))
    return {"ok": True}


@route("DELETE", r"/api/classes/(\d+)", TEACHER_ROLES)
def r_class_del(c):
    cid = int(c.p[0])
    get_class(c.con, c.user, cid)
    if c.con.execute("SELECT 1 FROM users WHERE class_id=? AND active=1", (cid,)).fetchone():
        raise ApiError(409, "Lớp còn học sinh — hãy chuyển hoặc vô hiệu hóa học sinh trước")
    if c.con.execute("SELECT 1 FROM assignments WHERE class_id=?", (cid,)).fetchone():
        raise ApiError(409, "Lớp đã được giao bài, không thể xóa")
    c.con.execute("DELETE FROM classes WHERE id=?", (cid,))
    return {"ok": True}


def student_row(r, con=None):
    d = {"id": r["id"], "username": r["username"], "name": r["name"], "class_id": r["class_id"], "active": bool(r["active"]),
         "must_change": bool(r["must_change"]), "last_login": r["last_login"]}
    if con is not None:
        d["practice"] = practice_stats(con, r["id"])
    return d


@route("GET", "/api/students", TEACHER_ROLES)
def r_students(c):
    cid = c.query.get("class_id")
    sql = "SELECT u.* FROM users u JOIN classes k ON k.id=u.class_id WHERE u.role='student'"
    args = []
    if c.user["role"] != "admin":
        sql += " AND k.owner_id=?"
        args.append(c.user["id"])
    if cid:
        sql += " AND u.class_id=?"
        args.append(int(cid))
    rows = c.con.execute(sql + " ORDER BY u.name", args).fetchall()
    return {"students": [student_row(r, c.con) for r in rows]}


@route("POST", "/api/students", TEACHER_ROLES)
def r_student_new(c):
    cid = need_int(c.body, "class_id")
    get_class(c.con, c.user, cid)
    a = create_user(c.con, c.user["id"], need_str(c.body, "name", 80), "student", need_str(c.body, "username", 32, False) or None,
                    c.body.get("password") or None, class_id=cid, must_change=True)
    audit(c.con, c.user["id"], "create_student", a["username"])
    return {"account": a}


@route("POST", "/api/students/bulk", TEACHER_ROLES)
def r_student_bulk(c):
    cid = need_int(c.body, "class_id")
    get_class(c.con, c.user, cid)
    rows = c.body.get("rows")
    if not isinstance(rows, list) or not rows or len(rows) > 200:
        raise ApiError(400, "Cần danh sách 1–200 học sinh")
    out, errors = [], []
    for i, row in enumerate(rows):
        try:
            name = need_str(row if isinstance(row, dict) else {"name": row}, "name", 80)
            username = row.get("username") if isinstance(row, dict) else None
            out.append(create_user(c.con, c.user["id"], name, "student", username or None, None, class_id=cid, must_change=True))
        except ApiError as e:
            errors.append({"row": i + 1, "error": e.msg})
    audit(c.con, c.user["id"], "bulk_students", f"{len(out)} ok / {len(errors)} lỗi")
    return {"accounts": out, "errors": errors}


@route("PATCH", r"/api/students/(\d+)", TEACHER_ROLES)
def r_student_edit(c):
    s = get_student(c.con, c.user, int(c.p[0]))
    cid = need_int(c.body, "class_id")
    get_class(c.con, c.user, cid)
    c.con.execute("UPDATE users SET name=?, class_id=? WHERE id=?", (need_str(c.body, "name", 80), cid, s["id"]))
    return {"ok": True}


@route("GET", "/api/parents", TEACHER_ROLES)
def r_parents(c):
    sql = ("SELECT p.id,p.username,p.name,p.active,s.id sid,s.name sname FROM users p JOIN parent_links l ON l.parent_id=p.id "
           "JOIN users s ON s.id=l.student_id LEFT JOIN classes k ON k.id=s.class_id WHERE p.role='parent'")
    args = []
    if c.user["role"] != "admin":
        sql += " AND (k.owner_id=? OR p.created_by=?)"
        args = [c.user["id"], c.user["id"]]
    return {"parents": [dict(r) for r in c.con.execute(sql + " ORDER BY p.name", args).fetchall()]}


@route("POST", "/api/parents", TEACHER_ROLES)
def r_parent_new(c):
    s = get_student(c.con, c.user, need_int(c.body, "student_id"))
    a = create_user(c.con, c.user["id"], need_str(c.body, "name", 80), "parent", need_str(c.body, "username", 32, False) or None,
                    c.body.get("password") or None, must_change=True)
    c.con.execute("INSERT INTO parent_links(parent_id,student_id) VALUES(?,?)", (a["id"], s["id"]))
    audit(c.con, c.user["id"], "create_parent", a["username"])
    return {"account": a}


def get_parent(con, user, pid):
    p = con.execute("SELECT * FROM users WHERE id=? AND role='parent'", (pid,)).fetchone()
    if not p or (user["role"] != "admin" and p["created_by"] != user["id"]):
        raise ApiError(404, "Không tìm thấy phụ huynh")
    return p


@route("POST", r"/api/parents/(\d+)/link", TEACHER_ROLES)
def r_parent_link(c):
    """Liên kết tài khoản phụ huynh có sẵn với thêm một học sinh (phụ huynh có nhiều con)."""
    p = get_parent(c.con, c.user, int(c.p[0]))
    s = get_student(c.con, c.user, need_int(c.body, "student_id"))
    c.con.execute("INSERT OR IGNORE INTO parent_links(parent_id,student_id) VALUES(?,?)", (p["id"], s["id"]))
    audit(c.con, c.user["id"], "link_parent", f"{p['username']} → {s['username']}")
    return {"ok": True}


@route("POST", r"/api/parents/(\d+)/unlink", TEACHER_ROLES)
def r_parent_unlink(c):
    p = get_parent(c.con, c.user, int(c.p[0]))
    sid = need_int(c.body, "student_id")
    if c.con.execute("SELECT COUNT(*) n FROM parent_links WHERE parent_id=?", (p["id"],)).fetchone()["n"] <= 1:
        raise ApiError(409, "Phụ huynh phải còn liên kết với ít nhất một học sinh — hãy vô hiệu hóa tài khoản nếu không dùng nữa")
    c.con.execute("DELETE FROM parent_links WHERE parent_id=? AND student_id=?", (p["id"], sid))
    audit(c.con, c.user["id"], "unlink_parent", f"{p['username']} ✕ {sid}")
    return {"ok": True}


# ---------- ngân hàng câu hỏi (mỗi giáo viên một kho riêng) ----------
@route("GET", "/api/bank", TEACHER_ROLES)
def r_bank(c):
    rows = c.con.execute("SELECT data FROM bank WHERE owner_id=? ORDER BY seq", (c.user["id"],)).fetchall()
    return {"questions": [json.loads(r["data"]) for r in rows]}


_TAG_OK = re.compile(r"^<(/?)(br|b|i|u|sub|sup|strong|em)\s*/?>$", re.I)


def clean_html(s):
    """Chỉ cho phép vài thẻ định dạng an toàn (không thuộc tính); mọi thứ khác bị escape."""
    if not isinstance(s, str):
        return ""
    out = []
    for part in re.split(r"(<[^<>]*>)", s):
        if part.startswith("<") and part.endswith(">") and (_TAG_OK.match(part) or part in ('<span class="sys">', "</span>")):
            out.append(part)
        else:
            out.append(part.replace("<", "&lt;").replace(">", "&gt;"))
    return "".join(out)


def valid_img_id(v):
    return isinstance(v, str) and bool(re.fullmatch(r"[a-f0-9]{16,40}", v))


def clean_question(q):
    if not isinstance(q, dict) or not isinstance(q.get("id"), str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", q["id"]):
        raise ApiError(400, "Câu hỏi không hợp lệ (id)")
    if q.get("t") not in ("mcq", "tf", "short", "essay") or not isinstance(q.get("q"), str):
        raise ApiError(400, "Câu hỏi không hợp lệ (dạng câu / nội dung)")
    for k in ("img", "solImg"):
        if q.get(k) is not None and not valid_img_id(q[k]):
            raise ApiError(400, "Câu hỏi không hợp lệ (ảnh)")
    q["q"] = clean_html(q["q"])
    if "sol" in q:
        q["sol"] = clean_html(q["sol"])
    s = json.dumps(q, ensure_ascii=False)
    if len(s) > 120_000:
        raise ApiError(400, "Câu hỏi quá lớn")
    return s


def drop_image_if_unused(con, img):
    """Chỉ xóa ảnh khi không còn câu hỏi trong ngân hàng nào và không có đề đã giao nào dùng."""
    used = con.execute("SELECT 1 FROM bank WHERE data LIKE ? LIMIT 1", (f'%"{img}"%',)).fetchone() or \
        con.execute("SELECT 1 FROM exams WHERE variations LIKE ? LIMIT 1", (f'%"{img}"%',)).fetchone()
    if not used:
        con.execute("DELETE FROM images WHERE id=?", (img,))


@route("POST", "/api/bank/sync", TEACHER_ROLES)
def r_bank_sync(c):
    up, de = c.body.get("upsert") or [], c.body.get("delete") or []
    if not isinstance(up, list) or not isinstance(de, list) or len(up) > 3000 or len(de) > 3000:
        raise ApiError(400, "Dữ liệu đồng bộ không hợp lệ")
    seq = (c.con.execute("SELECT COALESCE(MAX(seq),0) m FROM bank WHERE owner_id=?", (c.user["id"],)).fetchone()["m"]) + 1
    for q in up:
        s = clean_question(q)
        ex = c.con.execute("SELECT seq FROM bank WHERE owner_id=? AND id=?", (c.user["id"], q["id"])).fetchone()
        vals = (str(q.get("subject") or "")[:60], str(q.get("grade") or "")[:4], str(q.get("topic") or "")[:200], q["t"], str(q.get("src") or "")[:200], s, db.now())
        if ex:
            c.con.execute("UPDATE bank SET subject=?,grade=?,topic=?,t=?,src=?,data=?,updated_at=? WHERE owner_id=? AND id=?", vals + (c.user["id"], q["id"]))
        else:
            c.con.execute("INSERT INTO bank(subject,grade,topic,t,src,data,updated_at,owner_id,id,seq) VALUES(?,?,?,?,?,?,?,?,?,?)", vals + (c.user["id"], q["id"], seq))
            seq += 1
    for qid in de:
        if isinstance(qid, str):
            row = c.con.execute("SELECT data FROM bank WHERE owner_id=? AND id=?", (c.user["id"], qid)).fetchone()
            if row:
                old = json.loads(row["data"])
                c.con.execute("DELETE FROM bank WHERE owner_id=? AND id=?", (c.user["id"], qid))
                for k in ("img", "solImg"):
                    if valid_img_id(old.get(k)):
                        drop_image_if_unused(c.con, old[k])
    return {"ok": True}


@route("POST", "/api/img", TEACHER_ROLES)
def r_img_up(c):
    data = c.body.get("data") or ""
    m = re.fullmatch(r"data:(image/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)", data)
    if not m:
        raise ApiError(400, "Ảnh không hợp lệ (chỉ nhận JPEG/PNG)")
    raw = base64.b64decode(m.group(2))
    if len(raw) > 3 * 1024 * 1024:
        raise ApiError(400, "Ảnh quá lớn (tối đa 3 MB)")
    iid = secrets.token_hex(12)
    c.con.execute("INSERT INTO images(id,owner_id,mime,data,created_at) VALUES(?,?,?,?,?)", (iid, c.user["id"], m.group(1), raw, db.now()))
    return {"id": iid}


@route("GET", "/api/ai/status", TEACHER_ROLES)
def r_ai_status(c):
    return ai.status()


@route("POST", "/api/ai/solve", TEACHER_ROLES)
def r_ai_solve(c):
    """Nhờ AI giải 1–4 câu hỏi (ảnh đã lưu trên máy chủ hoặc văn bản) và trả đáp án kèm mức tin cậy; không tự ghi vào ngân hàng — giáo viên xem lại rồi lưu."""
    raw = c.body.get("items")
    if not isinstance(raw, list) or not 1 <= len(raw) <= ai.MAX_ITEMS:
        raise ApiError(400, f"Mỗi lần gửi từ 1 đến {ai.MAX_ITEMS} câu")
    items = []
    for it in raw:
        if not isinstance(it, dict) or not isinstance(it.get("id"), str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", it["id"]) or it.get("t") not in ("mcq", "tf", "short"):
            raise ApiError(400, "Câu hỏi gửi lên không hợp lệ")
        item = {"id": it["id"], "kind": it["t"], "image": None, "text": None}
        if it.get("img") is not None:
            if not valid_img_id(it["img"]):
                raise ApiError(400, "Ảnh câu hỏi không hợp lệ")
            row = c.con.execute("SELECT owner_id, mime, data FROM images WHERE id=?", (it["img"],)).fetchone()
            if not row or (row["owner_id"] != c.user["id"] and c.user["role"] != "admin"):
                raise ApiError(404, "Không tìm thấy ảnh câu hỏi (hãy lưu ngân hàng rồi thử lại)")
            item["image"] = (row["mime"], bytes(row["data"]))
        elif isinstance(it.get("text"), str) and it["text"].strip():
            item["text"] = it["text"]
        else:
            raise ApiError(400, "Câu hỏi cần có ảnh hoặc nội dung chữ")
        items.append(item)
    try:
        res = ai.solve(c.user["id"], items)
    except ai.AiError as e:
        raise ApiError(e.status, e.msg)
    audit(c.con, c.user["id"], "ai_solve", f"{len(items)} câu")
    return {"results": res, "model": ai.model(), "provider": ai.provider()}


@route("DELETE", r"/api/img/([a-f0-9]{16,40})", TEACHER_ROLES)
def r_img_del(c):
    r = c.con.execute("SELECT owner_id FROM images WHERE id=?", (c.p[0],)).fetchone()
    if r and (r["owner_id"] == c.user["id"] or c.user["role"] == "admin"):
        drop_image_if_unused(c.con, c.p[0])
    return {"ok": True}


@route("GET", r"/api/img/([a-f0-9]{16,40})", "any")
def r_img_get(c):
    r = c.con.execute("SELECT mime,data FROM images WHERE id=?", (c.p[0],)).fetchone()
    if not r:
        raise ApiError(404, "Không có ảnh")
    return Raw(200, {"Content-Type": r["mime"], "Cache-Control": "private, max-age=86400"}, bytes(r["data"]))


# ---------- đề & giao bài ----------
def check_variations(vs):
    if not isinstance(vs, list) or not 1 <= len(vs) <= 100:
        raise ApiError(400, "Đề cần 1–100 mã đề")
    out = []
    for i, v in enumerate(vs):
        qs = v.get("questions") if isinstance(v, dict) else None
        if not isinstance(qs, list) or not 1 <= len(qs) <= 200:
            raise ApiError(400, "Mỗi mã đề cần 1–200 câu")
        for q in qs:
            if not isinstance(q, dict) or q.get("t") not in ("mcq", "tf", "short", "essay") or not isinstance(q.get("q", ""), str):
                raise ApiError(400, "Có câu hỏi không hợp lệ trong đề")
            q["q"] = clean_html(q["q"])
            if "sol" in q:
                q["sol"] = clean_html(q["sol"])
            if any(q.get(k) is not None and not valid_img_id(q[k]) for k in ("img", "solImg")):
                raise ApiError(400, "Có câu hỏi không hợp lệ trong đề (ảnh)")
        out.append({"code": str(v.get("code") or f"Mã đề {101 + i}")[:30], "name": str(v.get("name") or f"Đề số {i + 1}")[:60],
                    "desc": str(v.get("desc") or "")[:120], "questions": qs})
    return out


def student_avg10(con, sid):
    """Điểm trung bình (thang 10) của học sinh trên mọi bài đã nộp và bài tự luyện tập; None nếu chưa có điểm."""
    vals = []
    for tbl in ("submissions", "practice"):
        for r in con.execute(f"SELECT score, max_score FROM {tbl} WHERE student_id=? AND submitted_at IS NOT NULL AND max_score>0", (sid,)).fetchall():
            vals.append(r["score"] / r["max_score"] * 10)
    return sum(vals) / len(vals) if vals else None


def adaptive_variation(con, sid, n):
    """Xếp học sinh vào mức đề: điểm TB < 5 → mức 0 (củng cố), < 8 → mức 1 (tiêu chuẩn), còn lại → mức 2 (nâng cao).
    Chưa có điểm → mức tiêu chuẩn. Mã đề được xếp từ dễ đến khó."""
    avg = student_avg10(con, sid)
    tier = 1 if avg is None else (0 if avg < 5 else (1 if avg < 8 else 2))
    return min(tier, n - 1)


def balanced_random(n_students, n_vars):
    """Chia ngẫu nhiên nhưng đều: số học sinh mỗi mã đề chênh nhau tối đa 1."""
    lst = [i % n_vars for i in range(n_students)]
    random.shuffle(lst)
    return lst


def parse_var_choice(v, n_vars):
    """Lựa chọn mã đề cho một học sinh: số thứ tự mã đề · 'free' (học sinh tự chọn) · 'none'/None (không giao)."""
    if v is None or v == "none":
        return "none"
    if v == "free":
        return None
    if isinstance(v, bool) or not isinstance(v, int) or not 0 <= v < n_vars:
        raise ApiError(400, "Mã đề chỉ định không hợp lệ")
    return v


def show_result_value(v):
    """0: không cho xem đáp án · 1: xem ngay sau khi nộp · 2: xem sau khi hết hạn nộp hoặc giáo viên đóng bài."""
    if v is True or v is None:
        return 1
    if v is False:
        return 0
    if isinstance(v, int) and v in (0, 1, 2):
        return v
    raise ApiError(400, "Chế độ xem đáp án không hợp lệ")


def can_reveal(a, now=None):
    """Học sinh đã được xem đáp án và lời giải của bài này chưa."""
    s = a["show_result"]
    if s == 1:
        return True
    if s == 2:
        now = now or db.now()
        return bool(a["closed"]) or bool(a["due_at"] and now > a["due_at"])
    return False


def reveal_note(a):
    if a["show_result"] == 2:
        return "Đáp án và lời giải sẽ hiện sau khi hết hạn nộp bài" + ("" if a["due_at"] else " (khi giáo viên đóng bài)") + "."
    return "Giáo viên không cho xem đáp án chi tiết của bài này."


@route("POST", "/api/assignments", TEACHER_ROLES)
def r_assign_new(c):
    b = c.body
    cls = get_class(c.con, c.user, need_int(b, "class_id"))
    ex = b.get("exam") or {}
    vs = check_variations(ex.get("variations"))
    mode = b.get("dist_mode") if b.get("dist_mode") in ("alt", "random", "free", "adaptive", "manual") else "alt"
    if len(vs) == 1 and mode != "manual":
        mode = "alt"
    students = c.con.execute("SELECT id FROM users WHERE class_id=? AND role='student' AND active=1 ORDER BY name", (cls["id"],)).fetchall()
    if not students:
        raise ApiError(400, "Lớp chưa có học sinh — hãy tạo tài khoản học sinh trước")
    plan = None   # [(student_id, mã đề | None = tự chọn)] khi giáo viên chỉ định từng học sinh
    if mode == "manual":
        vm = b.get("variation_map")
        if not isinstance(vm, dict):
            raise ApiError(400, "Thiếu bảng chỉ định mã đề cho từng học sinh")
        plan = []
        for s in students:
            v = parse_var_choice(vm.get(str(s["id"])), len(vs))
            if v != "none":
                plan.append((s["id"], v))
        if not plan:
            raise ApiError(400, "Chưa chọn học sinh nào để giao bài")
    show = show_result_value(b.get("show_result", True))
    title = need_str(b, "title", 150)
    ecur = c.con.execute("INSERT INTO exams(owner_id,title,subject,grade,topic,variations,created_at) VALUES(?,?,?,?,?,?,?)",
                         (c.user["id"], title, str(ex.get("subject") or "")[:60], str(ex.get("grade") or "")[:4], str(ex.get("topic") or "")[:200],
                          json.dumps(vs, ensure_ascii=False), db.now()))
    due = b.get("due_at")
    due = int(due) if isinstance(due, (int, float)) and due > 0 else None
    acur = c.con.execute("INSERT INTO assignments(exam_id,owner_id,class_id,title,dist_mode,due_at,duration_min,max_attempts,show_result,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                         (ecur.lastrowid, c.user["id"], cls["id"], title, mode, due, need_int(b, "duration_min", 0, 300, 0),
                          need_int(b, "max_attempts", 1, 10, 1), show, db.now()))
    tiers = [0] * len(vs)
    if plan is None:
        rnd = balanced_random(len(students), len(vs)) if mode == "random" else None
        plan = []
        for i, s in enumerate(students):
            if mode == "adaptive":
                var = adaptive_variation(c.con, s["id"], len(vs))
                tiers[var] += 1
            else:
                var = None if mode == "free" else (rnd[i] if rnd else i % len(vs))
            plan.append((s["id"], var))
    for sid, var in plan:
        c.con.execute("INSERT INTO assignment_students(assignment_id,student_id,variation) VALUES(?,?,?)", (acur.lastrowid, sid, var))
    audit(c.con, c.user["id"], "assign", f"{title} → lớp {cls['name']} ({len(plan)} HS, {mode})")
    out = {"id": acur.lastrowid, "students": len(plan)}
    if mode == "adaptive":
        out["tiers"] = tiers
    return out


def score10(score, mx):
    return round(score / mx * 10, 2) if mx else None


@route("GET", "/api/assignments", "any")
def r_assign_list(c):
    u, con = c.user, c.con
    if is_teacher(u):
        rows = con.execute("SELECT a.*, k.name cname FROM assignments a JOIN classes k ON k.id=a.class_id" +
                           ("" if u["role"] == "admin" else " WHERE a.owner_id=?") + " ORDER BY a.id DESC",
                           () if u["role"] == "admin" else (u["id"],)).fetchall()
        out = []
        for a in rows:
            tot = con.execute("SELECT COUNT(*) n FROM assignment_students WHERE assignment_id=?", (a["id"],)).fetchone()["n"]
            subs = con.execute("SELECT student_id, MAX(score*1.0/NULLIF(max_score,0)*10) best FROM submissions WHERE assignment_id=? AND submitted_at IS NOT NULL GROUP BY student_id", (a["id"],)).fetchall()
            bests = [s["best"] for s in subs if s["best"] is not None]
            out.append({"id": a["id"], "title": a["title"], "class_id": a["class_id"], "class_name": a["cname"], "due_at": a["due_at"],
                        "duration_min": a["duration_min"], "dist_mode": a["dist_mode"], "closed": bool(a["closed"]), "created_at": a["created_at"],
                        "max_attempts": a["max_attempts"], "show_result": a["show_result"],
                        "total": tot, "submitted": len(subs), "avg": round(sum(bests) / len(bests), 2) if bests else None})
        return {"assignments": out}
    if u["role"] == "student":
        rows = con.execute("SELECT a.*, k.name cname, s.variation FROM assignments a JOIN assignment_students s ON s.assignment_id=a.id "
                           "LEFT JOIN classes k ON k.id=a.class_id WHERE s.student_id=? ORDER BY a.id DESC", (u["id"],)).fetchall()
        out = []
        for a in rows:
            subs = con.execute("SELECT * FROM submissions WHERE assignment_id=? AND student_id=? ORDER BY id", (a["id"], u["id"])).fetchall()
            done = [s for s in subs if s["submitted_at"]]
            doing = [s for s in subs if not s["submitted_at"]]
            best = max((score10(s["score"], s["max_score"]) or 0 for s in done), default=None)
            out.append({"id": a["id"], "title": a["title"], "class_name": a["cname"], "due_at": a["due_at"], "duration_min": a["duration_min"],
                        "closed": bool(a["closed"]), "free": a["variation"] is None, "attempts": len(done), "max_attempts": a["max_attempts"],
                        "doing": bool(doing), "best": best, "show_result": a["show_result"], "reveal": can_reveal(a),
                        "last_submitted": done[-1]["submitted_at"] if done else None,
                        "last_sub_id": done[-1]["id"] if done else None})
        return {"assignments": out}
    raise ApiError(403, "Không có quyền")


@route("GET", r"/api/assignments/(\d+)", TEACHER_ROLES)
def r_assign_get(c):
    a = get_assignment(c.con, c.user, int(c.p[0]))
    ex = c.con.execute("SELECT * FROM exams WHERE id=?", (a["exam_id"],)).fetchone()
    return {"assignment": {"id": a["id"], "title": a["title"], "class_id": a["class_id"], "dist_mode": a["dist_mode"], "due_at": a["due_at"],
                           "duration_min": a["duration_min"], "max_attempts": a["max_attempts"], "closed": bool(a["closed"])},
            "exam": {"title": ex["title"], "subject": ex["subject"], "grade": ex["grade"], "topic": ex["topic"], "variations": json.loads(ex["variations"])}}


@route("GET", r"/api/assignments/(\d+)/results", TEACHER_ROLES)
def r_assign_results(c):
    a = get_assignment(c.con, c.user, int(c.p[0]))
    ex = c.con.execute("SELECT variations FROM exams WHERE id=?", (a["exam_id"],)).fetchone()
    codes = [v["code"] for v in json.loads(ex["variations"])]
    rows = c.con.execute("SELECT s.student_id, s.variation, u.name, u.username FROM assignment_students s JOIN users u ON u.id=s.student_id WHERE s.assignment_id=? ORDER BY u.name", (a["id"],)).fetchall()
    out = []
    for r in rows:
        subs = c.con.execute("SELECT * FROM submissions WHERE assignment_id=? AND student_id=? ORDER BY id", (a["id"], r["student_id"])).fetchall()
        done = [s for s in subs if s["submitted_at"]]
        best = max(done, key=lambda s: (s["score"] or 0) / (s["max_score"] or 1), default=None)
        var = best["variation"] if best else r["variation"]
        out.append({"student_id": r["student_id"], "name": r["name"], "username": r["username"],
                    "code": codes[var] if var is not None and var < len(codes) else None,
                    "status": "done" if done else ("doing" if subs else "todo"), "attempts": len(done),
                    "score": best["score"] if best else None, "max": best["max_score"] if best else None,
                    "score10": score10(best["score"], best["max_score"]) if best else None,
                    "late": bool(best["late"]) if best else False, "submitted_at": best["submitted_at"] if best else None,
                    "sub_id": best["id"] if best else None})
    return {"results": out}


@route("GET", r"/api/submissions/(\d+)", TEACHER_ROLES)
def r_sub_get(c):
    s = c.con.execute("SELECT * FROM submissions WHERE id=?", (int(c.p[0]),)).fetchone()
    if not s:
        raise ApiError(404, "Không tìm thấy bài làm")
    a = get_assignment(c.con, c.user, s["assignment_id"])
    ex = json.loads(c.con.execute("SELECT variations FROM exams WHERE id=?", (a["exam_id"],)).fetchone()["variations"])
    stu = c.con.execute("SELECT name FROM users WHERE id=?", (s["student_id"],)).fetchone()
    manual = {str(r["qi"]): r["score"] for r in c.con.execute("SELECT qi,score FROM essay_grades WHERE submission_id=?", (s["id"],)).fetchall()}
    return {"student": stu["name"], "questions": ex[s["variation"]]["questions"], "code": ex[s["variation"]]["code"],
            "answers": json.loads(s["answers"] or "[]"), "details": json.loads(s["details"] or "[]"), "score": s["score"], "max": s["max_score"],
            "manual": manual, "submitted": bool(s["submitted_at"])}


def recompute_score(con, sub):
    """Điểm = tổng điểm câu chấm tự động + điểm giáo viên chấm tay (mỗi câu tối đa 1 điểm).
    Câu tự luận chưa được chấm chưa tính vào điểm tối đa."""
    details = json.loads(sub["details"] or "[]")
    manual = {r["qi"]: r["score"] for r in con.execute("SELECT qi,score FROM essay_grades WHERE submission_id=?", (sub["id"],)).fetchall()}
    total, mx = 0.0, 0
    for i, d in enumerate(details):
        if d.get("score") is not None:
            total += d["score"]
            mx += 1
        elif i in manual:
            total += manual[i]
            mx += 1
    con.execute("UPDATE submissions SET score=?, max_score=? WHERE id=?", (round(total, 2), mx, sub["id"]))
    return round(total, 2), mx


@route("POST", r"/api/submissions/(\d+)/grade", TEACHER_ROLES)
def r_sub_grade(c):
    s = c.con.execute("SELECT * FROM submissions WHERE id=?", (int(c.p[0]),)).fetchone()
    if not s:
        raise ApiError(404, "Không tìm thấy bài làm")
    get_assignment(c.con, c.user, s["assignment_id"])
    if not s["submitted_at"]:
        raise ApiError(400, "Học sinh chưa nộp bài này")
    grades = c.body.get("grades")
    if not isinstance(grades, dict) or not grades or len(grades) > 300:
        raise ApiError(400, "Thiếu điểm cần lưu")
    details = json.loads(s["details"] or "[]")
    for k, v in grades.items():
        try:
            qi = int(k)
        except (TypeError, ValueError):
            raise ApiError(400, "Số câu không hợp lệ")
        if not 0 <= qi < len(details) or details[qi].get("score") is not None:
            raise ApiError(400, f"Câu {qi + 1} đã được chấm tự động, không chấm tay được")
        if v is None or v == "":
            c.con.execute("DELETE FROM essay_grades WHERE submission_id=? AND qi=?", (s["id"], qi))
            continue
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not 0 <= v <= 1:
            raise ApiError(400, f"Điểm câu {qi + 1} phải từ 0 đến 1")
        c.con.execute("INSERT OR REPLACE INTO essay_grades(submission_id,qi,score,graded_by,graded_at) VALUES(?,?,?,?,?)",
                      (s["id"], qi, float(v), c.user["id"], db.now()))
    sc, mx = recompute_score(c.con, s)
    audit(c.con, c.user["id"], "grade_essay", f"bài làm {s['id']}")
    return {"score": sc, "max": mx, "score10": score10(sc, mx)}


@route("POST", r"/api/assignments/(\d+)/close", TEACHER_ROLES)
def r_assign_close(c):
    a = get_assignment(c.con, c.user, int(c.p[0]))
    c.con.execute("UPDATE assignments SET closed=? WHERE id=?", (1 if c.body.get("closed") else 0, a["id"]))
    return {"ok": True}


@route("PATCH", r"/api/assignments/(\d+)", TEACHER_ROLES)
def r_assign_edit(c):
    """Gia hạn / đổi hạn nộp và số lần làm của bài đã giao."""
    a = get_assignment(c.con, c.user, int(c.p[0]))
    due = c.body.get("due_at", a["due_at"])
    if due in (None, "", 0):
        due = None
    elif isinstance(due, bool) or not isinstance(due, (int, float)) or due < 0:
        raise ApiError(400, "Hạn nộp không hợp lệ")
    else:
        due = int(due)
    att = need_int(c.body, "max_attempts", 1, 10, a["max_attempts"])
    show = show_result_value(c.body["show_result"]) if "show_result" in c.body else a["show_result"]
    c.con.execute("UPDATE assignments SET due_at=?, max_attempts=?, show_result=? WHERE id=?", (due, att, show, a["id"]))
    audit(c.con, c.user["id"], "edit_assignment", a["title"])
    return {"ok": True}


def assignment_roster(con, a):
    """Học sinh của lớp (đang hoạt động) và học sinh đã được giao bài, kèm mã đề và tình trạng làm bài."""
    links = {r["student_id"]: r["variation"] for r in con.execute("SELECT student_id, variation FROM assignment_students WHERE assignment_id=?", (a["id"],)).fetchall()}
    rows = con.execute("SELECT id, name, username FROM users WHERE role='student' AND ((class_id=? AND active=1) OR id IN (SELECT student_id FROM assignment_students WHERE assignment_id=?)) ORDER BY name",
                       (a["class_id"], a["id"])).fetchall()
    out = []
    for r in rows:
        subs = con.execute("SELECT submitted_at FROM submissions WHERE assignment_id=? AND student_id=?", (a["id"], r["id"])).fetchall()
        out.append({"id": r["id"], "name": r["name"], "username": r["username"], "assigned": r["id"] in links,
                    "variation": links.get(r["id"]), "started": bool(subs), "doing": any(s["submitted_at"] is None for s in subs)})
    return out


@route("GET", r"/api/assignments/(\d+)/students", TEACHER_ROLES)
def r_assign_students(c):
    a = get_assignment(c.con, c.user, int(c.p[0]))
    ex = json.loads(c.con.execute("SELECT variations FROM exams WHERE id=?", (a["exam_id"],)).fetchone()["variations"])
    return {"variations": [{"code": v["code"], "name": v["name"], "count": len(v["questions"])} for v in ex],
            "students": assignment_roster(c.con, a)}


@route("POST", r"/api/assignments/(\d+)/students", TEACHER_ROLES)
def r_assign_students_set(c):
    """Giáo viên đổi mã đề / giao thêm / bỏ giao cho từng học sinh của bài đã giao.
    Học sinh đang làm dở giữ nguyên mã đề của lượt đang làm; mã đề mới áp dụng từ lượt làm sau."""
    a = get_assignment(c.con, c.user, int(c.p[0]))
    vm = c.body.get("variation_map")
    if not isinstance(vm, dict) or not vm or len(vm) > 500:
        raise ApiError(400, "Thiếu bảng chỉ định mã đề")
    n = len(json.loads(c.con.execute("SELECT variations FROM exams WHERE id=?", (a["exam_id"],)).fetchone()["variations"]))
    roster = {s["id"]: s for s in assignment_roster(c.con, a)}
    changed = 0
    for k, v in vm.items():
        try:
            sid = int(k)
        except (TypeError, ValueError):
            raise ApiError(400, "Học sinh không hợp lệ")
        s = roster.get(sid)
        if not s:
            raise ApiError(404, "Học sinh không thuộc lớp của bài này")
        var = parse_var_choice(v, n)
        if var == "none":
            if not s["assigned"]:
                continue
            if s["started"]:
                raise ApiError(400, f"{s['name']} đã làm bài này nên không bỏ giao được")
            c.con.execute("DELETE FROM assignment_students WHERE assignment_id=? AND student_id=?", (a["id"], sid))
        elif s["assigned"]:
            if s["variation"] == var:
                continue
            c.con.execute("UPDATE assignment_students SET variation=? WHERE assignment_id=? AND student_id=?", (var, a["id"], sid))
        else:
            c.con.execute("INSERT INTO assignment_students(assignment_id,student_id,variation) VALUES(?,?,?)", (a["id"], sid, var))
        changed += 1
    if changed:
        c.con.execute("UPDATE assignments SET dist_mode='manual' WHERE id=?", (a["id"],))
        audit(c.con, c.user["id"], "assign_variations", f"{a['title']} ({changed} HS)")
    return {"ok": True, "changed": changed}


@route("DELETE", r"/api/assignments/(\d+)", TEACHER_ROLES)
def r_assign_del(c):
    a = get_assignment(c.con, c.user, int(c.p[0]))
    c.con.execute("DELETE FROM essay_grades WHERE submission_id IN (SELECT id FROM submissions WHERE assignment_id=?)", (a["id"],))
    c.con.execute("DELETE FROM submissions WHERE assignment_id=?", (a["id"],))
    c.con.execute("DELETE FROM assignment_students WHERE assignment_id=?", (a["id"],))
    c.con.execute("DELETE FROM assignments WHERE id=?", (a["id"],))
    c.con.execute("DELETE FROM exams WHERE id=? AND NOT EXISTS(SELECT 1 FROM assignments WHERE exam_id=exams.id)", (a["exam_id"],))
    audit(c.con, c.user["id"], "delete_assignment", a["title"])
    return {"ok": True}


# ---------- học sinh làm bài ----------
def student_assignment(c, aid):
    a = get_assignment(c.con, c.user, aid, teacher_side=False)
    link = c.con.execute("SELECT * FROM assignment_students WHERE assignment_id=? AND student_id=?", (aid, c.user["id"])).fetchone()
    if not link:
        raise ApiError(404, "Bài này không được giao cho bạn")
    return a, link


@route("POST", r"/api/assignments/(\d+)/start", ("student",))
def r_start(c):
    a, link = student_assignment(c, int(c.p[0]))
    now = db.now()
    if a["closed"]:
        raise ApiError(403, "Bài đã đóng")
    if a["due_at"] and now > a["due_at"]:
        raise ApiError(403, "Đã quá hạn nộp bài")
    ex = json.loads(c.con.execute("SELECT variations FROM exams WHERE id=?", (a["exam_id"],)).fetchone()["variations"])
    subs = c.con.execute("SELECT * FROM submissions WHERE assignment_id=? AND student_id=? ORDER BY id", (a["id"], c.user["id"])).fetchall()
    doing = next((s for s in subs if not s["submitted_at"]), None)
    done = [s for s in subs if s["submitted_at"]]
    if doing:
        var = doing["variation"]
        sid, started = doing["id"], doing["started_at"]
    else:
        if len(done) >= a["max_attempts"]:
            raise ApiError(403, "Bạn đã hết số lần làm bài")
        var = link["variation"]
        if var is None:
            var = c.body.get("variation")
            if not isinstance(var, int) or not 0 <= var < len(ex):
                raise ApiError(400, "Hãy chọn mã đề")
        cur = c.con.execute("INSERT INTO submissions(assignment_id,student_id,variation,attempt,started_at) VALUES(?,?,?,?,?)",
                            (a["id"], c.user["id"], var, len(done) + 1, now))
        sid, started = cur.lastrowid, now
    v = ex[var]
    remain = max(0, a["duration_min"] * 60 - (now - started)) if a["duration_min"] else None
    return {"submission_id": sid, "code": v["code"], "title": a["title"], "duration_min": a["duration_min"], "remaining": remain,
            "questions": [grading.sanitize_question(q) for q in v["questions"]]}


@route("GET", r"/api/assignments/(\d+)/variations", ("student",))
def r_variations(c):
    a, link = student_assignment(c, int(c.p[0]))
    if link["variation"] is not None:
        raise ApiError(400, "Mã đề đã được giáo viên phân sẵn")
    ex = json.loads(c.con.execute("SELECT variations FROM exams WHERE id=?", (a["exam_id"],)).fetchone()["variations"])
    return {"variations": [{"idx": i, "code": v["code"], "name": v["name"], "desc": v["desc"], "count": len(v["questions"])} for i, v in enumerate(ex)]}


@route("POST", r"/api/assignments/(\d+)/submit", ("student",))
def r_submit(c):
    a, link = student_assignment(c, int(c.p[0]))
    sub = c.con.execute("SELECT * FROM submissions WHERE assignment_id=? AND student_id=? AND submitted_at IS NULL ORDER BY id DESC", (a["id"], c.user["id"])).fetchone()
    if not sub:
        raise ApiError(400, "Không có bài làm đang mở (có thể đã nộp rồi)")
    answers = c.body.get("answers")
    if not isinstance(answers, list) or len(answers) > 300:
        raise ApiError(400, "Dữ liệu bài làm không hợp lệ")
    ex = json.loads(c.con.execute("SELECT variations FROM exams WHERE id=?", (a["exam_id"],)).fetchone()["variations"])
    qs = ex[sub["variation"]]["questions"]
    now = db.now()
    late = 1 if (a["duration_min"] and now > sub["started_at"] + a["duration_min"] * 60 + 60) or (a["due_at"] and now > a["due_at"] + 60) else 0
    # lưu bài làm không kèm đáp án; đáp án và lời giải được gắn lúc học sinh xem lại (theo chế độ giáo viên chọn)
    sc, mx, details = grading.grade(qs, answers, reveal=False)
    c.con.execute("UPDATE submissions SET answers=?, score=?, max_score=?, details=?, late=?, submitted_at=? WHERE id=?",
                  (json.dumps(answers, ensure_ascii=False)[:200000], sc, mx, json.dumps(details, ensure_ascii=False), late, now, sub["id"]))
    res = {"score": sc, "max": mx, "score10": score10(sc, mx), "late": bool(late), "essay": sum(1 for q in qs if q.get("t") == "essay"),
           "submission_id": sub["id"]}
    if can_reveal(a, now):
        res["details"] = grading.reveal_details(qs, details)
        res["questions"] = [grading.sanitize_question(q) for q in qs]
    else:
        res["reveal_note"] = reveal_note(a)
    return res


@route("GET", r"/api/assignments/(\d+)/my", ("student",))
def r_my(c):
    a, _ = student_assignment(c, int(c.p[0]))
    rows = c.con.execute("SELECT * FROM submissions WHERE assignment_id=? AND student_id=? AND submitted_at IS NOT NULL ORDER BY id DESC", (a["id"], c.user["id"])).fetchall()
    return {"submissions": [{"id": s["id"], "attempt": s["attempt"], "score": s["score"], "max": s["max_score"], "score10": score10(s["score"], s["max_score"]),
                             "submitted_at": s["submitted_at"], "late": bool(s["late"])} for s in rows]}


@route("GET", r"/api/assignments/(\d+)/my/(\d+)", ("student",))
def r_my_review(c):
    """Học sinh xem lại một lần nộp bài: bài làm của mình, đúng/sai từng câu; đáp án và lời giải khi giáo viên cho phép."""
    a, _ = student_assignment(c, int(c.p[0]))
    s = c.con.execute("SELECT * FROM submissions WHERE id=? AND assignment_id=? AND student_id=? AND submitted_at IS NOT NULL",
                      (int(c.p[1]), a["id"], c.user["id"])).fetchone()
    if not s:
        raise ApiError(404, "Không tìm thấy bài làm")
    v = json.loads(c.con.execute("SELECT variations FROM exams WHERE id=?", (a["exam_id"],)).fetchone()["variations"])[s["variation"]]
    qs, details = v["questions"], json.loads(s["details"] or "[]")
    answers = json.loads(s["answers"] or "[]")
    details = [details[i] if i < len(details) else {"i": i, "t": q.get("t"), "score": None, "given": answers[i] if i < len(answers) else None}
               for i, q in enumerate(qs)]
    manual = {r["qi"]: r["score"] for r in c.con.execute("SELECT qi,score FROM essay_grades WHERE submission_id=?", (s["id"],)).fetchall()}
    reveal = can_reveal(a)
    out = {"title": a["title"], "code": v["code"], "attempt": s["attempt"], "score": s["score"], "max": s["max_score"],
           "score10": score10(s["score"], s["max_score"]), "submitted_at": s["submitted_at"], "late": bool(s["late"]), "reveal": reveal,
           "questions": [grading.sanitize_question(q) for q in qs],
           "details": grading.reveal_details(qs, details, manual) if reveal else grading.hide_details(details, manual)}
    if not reveal:
        out["reveal_note"] = reveal_note(a)
    return out


@route("GET", "/api/children", ("parent",))
def r_children(c):
    kids = c.con.execute("SELECT u.id,u.name,u.class_id FROM users u JOIN parent_links l ON l.student_id=u.id WHERE l.parent_id=?", (c.user["id"],)).fetchall()
    out = []
    for k in kids:
        cls = c.con.execute("SELECT name FROM classes WHERE id=?", (k["class_id"],)).fetchone() if k["class_id"] else None
        rows = c.con.execute("SELECT a.title, s.score, s.max_score, s.submitted_at FROM submissions s JOIN assignments a ON a.id=s.assignment_id "
                             "WHERE s.student_id=? AND s.submitted_at IS NOT NULL ORDER BY s.submitted_at DESC LIMIT 20", (k["id"],)).fetchall()
        res = [{"title": r["title"], "score10": score10(r["score"], r["max_score"]), "at": r["submitted_at"]} for r in rows]
        pend = c.con.execute("SELECT COUNT(*) n FROM assignment_students s JOIN assignments a ON a.id=s.assignment_id WHERE s.student_id=? AND a.closed=0 AND NOT EXISTS("
                             "SELECT 1 FROM submissions x WHERE x.assignment_id=a.id AND x.student_id=s.student_id AND x.submitted_at IS NOT NULL)", (k["id"],)).fetchone()["n"]
        vals = [r["score10"] for r in res if r["score10"] is not None]
        out.append({"id": k["id"], "name": k["name"], "class_name": cls["name"] if cls else "", "results": res, "pending": pend,
                    "avg": round(sum(vals) / len(vals), 2) if vals else None, "practice": practice_stats(c.con, k["id"])})
    return {"children": out}


@route("GET", "/api/my-results", ("student",))
def r_my_results(c):
    rows = c.con.execute("SELECT a.title, s.score, s.max_score, s.submitted_at FROM submissions s JOIN assignments a ON a.id=s.assignment_id "
                         "WHERE s.student_id=? AND s.submitted_at IS NOT NULL ORDER BY s.submitted_at DESC LIMIT 30", (c.user["id"],)).fetchall()
    res = [{"title": r["title"], "score10": score10(r["score"], r["max_score"]), "at": r["submitted_at"]} for r in rows]
    vals = [r["score10"] for r in res if r["score10"] is not None]
    return {"results": res, "avg": round(sum(vals) / len(vals), 2) if vals else None}


# ---------- học sinh tự luyện tập ----------
# Giáo viên "mở" các chuyên đề trong ngân hàng của mình cho từng lớp; học sinh của lớp đó tự tạo đề từ các chuyên đề đã mở,
# làm bài và được chấm ngay (kèm đáp án, lời giải). Câu hỏi được bốc ngẫu nhiên ở máy chủ, học sinh không nhận đáp án trước khi nộp.
FIXED_OPT = re.compile(r"tất\s*cả|cả\s+[A-D]\b|các\s+đáp\s+án|không\s+có\s+đáp\s+án|đều\s+(?:đúng|sai)", re.I)
PRACTICE_TYPES = ("mcq", "tf", "short")


def bank_groups(con, owner_id, levels=None):
    """Nhóm (môn, khối, chuyên đề) trong ngân hàng của giáo viên, chỉ đếm câu có đáp án chấm được (không tính tự luận).
    Truyền dict vào `levels` để nhận thêm số câu theo mức độ: levels[nhóm][dạng] = [nhận biết, thông hiểu, vận dụng, vận dụng cao]."""
    groups = {}
    for r in con.execute("SELECT subject, grade, topic, data FROM bank WHERE owner_id=?", (owner_id,)).fetchall():
        q = json.loads(r["data"])
        if q.get("t") not in PRACTICE_TYPES or not grading.has_key(q):
            continue
        key = (r["subject"], r["grade"], r["topic"])
        g = groups.setdefault(key, {"mcq": 0, "tf": 0, "short": 0})
        g[q["t"]] += 1
        if levels is not None:
            levels.setdefault(key, {t: [0, 0, 0, 0] for t in PRACTICE_TYPES})[q["t"]][grading.question_level(q) - 1] += 1
    return groups


def open_groups(con, class_id):
    return {(r["subject"], r["grade"], r["topic"]) for r in con.execute("SELECT subject,grade,topic FROM practice_topics WHERE class_id=?", (class_id,)).fetchall()}


def group_dict(key, counts, is_open=None, levels=None):
    d = {"subject": key[0], "grade": key[1], "topic": key[2], "counts": counts, "total": sum(counts.values())}
    if levels is not None:
        d["levels"] = levels
    if is_open is not None:
        d["open"] = is_open
    return d


@route("GET", r"/api/classes/(\d+)/practice", TEACHER_ROLES)
def r_class_practice(c):
    cls = get_class(c.con, c.user, int(c.p[0]))
    opened = open_groups(c.con, cls["id"])
    groups = bank_groups(c.con, cls["owner_id"])
    return {"groups": [group_dict(k, v, k in opened) for k, v in sorted(groups.items())]}


@route("POST", r"/api/classes/(\d+)/practice", TEACHER_ROLES)
def r_class_practice_set(c):
    cls = get_class(c.con, c.user, int(c.p[0]))
    items = c.body.get("open")
    if not isinstance(items, list) or len(items) > 500:
        raise ApiError(400, "Danh sách chuyên đề không hợp lệ")
    valid = set(bank_groups(c.con, cls["owner_id"]).keys())
    c.con.execute("DELETE FROM practice_topics WHERE class_id=?", (cls["id"],))
    n = 0
    for it in items:
        key = (str(it.get("subject") or ""), str(it.get("grade") or ""), str(it.get("topic") or "")) if isinstance(it, dict) else None
        if key in valid:
            c.con.execute("INSERT OR IGNORE INTO practice_topics(class_id,subject,grade,topic) VALUES(?,?,?,?)", (cls["id"],) + key)
            n += 1
    audit(c.con, c.user["id"], "practice_topics", f"lớp {cls['name']}: mở {n} chuyên đề")
    return {"ok": True, "open": n}


def clean_matrix(m):
    """Ma trận {dạng: {mức 1–4: số câu}} đã làm sạch; None nếu rỗng hoặc không hợp lệ."""
    if not isinstance(m, dict):
        return None
    out, tot = {}, 0
    for t in PRACTICE_TYPES:
        row = m.get(t) if isinstance(m.get(t), dict) else {}
        out[t] = {str(lv): need_int(row, str(lv), 0, 50, 0) for lv in grading.LEVELS}
        tot += sum(out[t].values())
    return out if tot else None


def load_matrix(raw):
    try:
        return clean_matrix(json.loads(raw)) if raw else None
    except (ValueError, TypeError, ApiError):
        return None


@route("GET", r"/api/classes/(\d+)/matrix", TEACHER_ROLES)
def r_class_matrix(c):
    cls = get_class(c.con, c.user, int(c.p[0]))
    rows = c.con.execute("SELECT id, name, level_matrix FROM users WHERE class_id=? AND role='student' AND active=1 ORDER BY name", (cls["id"],)).fetchall()
    return {"default": load_matrix(cls["level_matrix"]),
            "students": [{"id": r["id"], "name": r["name"], "matrix": load_matrix(r["level_matrix"])} for r in rows]}


@route("POST", r"/api/classes/(\d+)/matrix", TEACHER_ROLES)
def r_class_matrix_set(c):
    """Lưu ma trận mặc định của lớp (`default`) và ma trận riêng từng học sinh (`students`: {id: ma trận | null = dùng mặc định lớp})."""
    cls = get_class(c.con, c.user, int(c.p[0]))
    b = c.body
    if "default" in b:
        c.con.execute("UPDATE classes SET level_matrix=? WHERE id=?", (json.dumps(clean_matrix(b["default"])) if clean_matrix(b["default"]) else None, cls["id"]))
    st = b.get("students")
    n = 0
    if isinstance(st, dict):
        ids = {r["id"] for r in c.con.execute("SELECT id FROM users WHERE class_id=? AND role='student'", (cls["id"],)).fetchall()}
        for k, m in st.items():
            if not str(k).isdigit() or int(k) not in ids:
                continue
            cm = clean_matrix(m)
            c.con.execute("UPDATE users SET level_matrix=? WHERE id=?", (json.dumps(cm) if cm else None, int(k)))
            n += 1
    audit(c.con, c.user["id"], "level_matrix", f"lớp {cls['name']}: mặc định + {n} học sinh")
    return {"ok": True, "students": n}


def my_class(c):
    if not c.user["class_id"]:
        raise ApiError(400, "Tài khoản của bạn chưa thuộc lớp nào — hãy báo giáo viên")
    cls = c.con.execute("SELECT * FROM classes WHERE id=?", (c.user["class_id"],)).fetchone()
    if not cls:
        raise ApiError(400, "Không tìm thấy lớp của bạn")
    return cls


@route("GET", "/api/practice/topics", ("student",))
def r_practice_topics(c):
    cls = my_class(c)
    opened = open_groups(c.con, cls["id"])
    lv = {}
    groups = bank_groups(c.con, cls["owner_id"], lv)
    me = c.con.execute("SELECT level_matrix FROM users WHERE id=?", (c.user["id"],)).fetchone()
    return {"groups": [group_dict(k, v, None, lv.get(k)) for k, v in sorted(groups.items()) if k in opened],
            "matrix": load_matrix(me and me["level_matrix"]) or load_matrix(cls["level_matrix"]),
            "rules": {"points": grading.PRACTICE_POINTS, "tf_steps": grading.TFG_SCORE, "minutes": grading.PRACTICE_MINUTES}}


def shuffle_options(q):
    """Đảo phương án A-D (trừ câu có ảnh hoặc phương án kiểu 'cả A và B', 'tất cả các đáp án')."""
    opts = q.get("opts") or []
    if q.get("t") != "mcq" or q.get("img") or len(opts) < 3 or any(FIXED_OPT.search(str(o)) for o in opts):
        return q
    idx = list(range(len(opts)))
    random.shuffle(idx)
    q = dict(q)
    q["opts"] = [opts[k] for k in idx]
    q["ans"] = idx.index(q["ans"])
    return q


@route("POST", "/api/practice/start", ("student",))
def r_practice_start(c):
    cls = my_class(c)
    b = c.body
    groups = b.get("groups")
    if not isinstance(groups, list) or not groups or len(groups) > 100:
        raise ApiError(400, "Hãy chọn ít nhất một chuyên đề")
    opened = open_groups(c.con, cls["id"])
    sel = {(str(g.get("subject") or ""), str(g.get("grade") or ""), str(g.get("topic") or "")) for g in groups if isinstance(g, dict)} & opened
    if not sel:
        raise ApiError(403, "Các chuyên đề này chưa được giáo viên mở cho lớp của bạn")
    # số câu cần lấy: ma trận {dạng: {mức: số câu}} (mức 1 nhận biết · 2 thông hiểu · 3 vận dụng); bản cũ chỉ gửi số câu theo dạng (không chia mức)
    plan = []   # (dạng, mức hoặc None, số câu)
    matrix = b.get("matrix")
    if isinstance(matrix, dict):
        for t in PRACTICE_TYPES:
            row = matrix.get(t) if isinstance(matrix.get(t), dict) else {}
            for lv in grading.LEVELS:
                plan.append((t, lv, need_int(row, str(lv), 0, 50, 0)))
    else:
        counts = b.get("counts") if isinstance(b.get("counts"), dict) else {}
        plan = [(t, None, need_int(counts, t, 0, 50, 0)) for t in PRACTICE_TYPES]
    if not 1 <= sum(n for _, _, n in plan) <= 60:
        raise ApiError(400, "Số câu mỗi đề từ 1 đến 60")
    pool = {t: [] for t in PRACTICE_TYPES}
    for r in c.con.execute("SELECT subject, grade, topic, data FROM bank WHERE owner_id=?", (cls["owner_id"],)).fetchall():
        if (r["subject"], r["grade"], r["topic"]) in sel:
            q = json.loads(r["data"])
            if q.get("t") in pool and grading.has_key(q):
                pool[q["t"]].append(q)
    TV = {"mcq": "trắc nghiệm", "tf": "đúng/sai", "short": "trả lời ngắn"}
    LVN = {1: "nhận biết", 2: "thông hiểu", 3: "vận dụng", 4: "vận dụng cao"}
    qs, short = [], []
    for t, lv, n in plan:
        if not n:
            continue
        cand = [q for q in pool[t] if lv is None or grading.question_level(q) == lv]
        pick = random.sample(cand, min(n, len(cand)))
        if len(pick) < n:
            short.append(f"{TV[t]}{' · ' + LVN[lv] if lv else ''}: có {len(pick)}/{n}")
        qs += [shuffle_options(q) for q in pick]
    if not qs:
        raise ApiError(400, "Các chuyên đề đã chọn chưa có câu hỏi phù hợp với số câu bạn yêu cầu")
    # thời gian do hệ thống tính theo số câu thực tế của từng dạng (không tin số phút do máy khách gửi)
    dur = sum(grading.PRACTICE_MINUTES[grading.practice_type(q)] for q in qs)
    topics = sorted({k[2] or "Chưa phân chuyên đề" for k in sel})
    title = "Luyện tập · " + (", ".join(topics[:3]) + (f" (+{len(topics) - 3})" if len(topics) > 3 else ""))
    cur = c.con.execute("INSERT INTO practice(student_id,title,topics,questions,duration_min,started_at,scheme) VALUES(?,?,?,?,?,?,1)",
                        (c.user["id"], title[:200], json.dumps(topics, ensure_ascii=False), json.dumps(qs, ensure_ascii=False), dur, db.now()))
    mx = round(sum(grading.PRACTICE_POINTS[grading.practice_type(q)] for q in qs), 2)
    return {"id": cur.lastrowid, "title": title, "code": "Tự luyện tập", "duration_min": dur, "remaining": dur * 60,
            "max_points": mx, "questions": [grading.sanitize_question(q) for q in qs], "note": "; ".join(short)}


def own_practice(c, pid):
    p = c.con.execute("SELECT * FROM practice WHERE id=? AND student_id=?", (pid, c.user["id"])).fetchone()
    if not p:
        raise ApiError(404, "Không tìm thấy bài luyện tập")
    return p


@route("POST", r"/api/practice/(\d+)/submit", ("student",))
def r_practice_submit(c):
    p = own_practice(c, int(c.p[0]))
    if p["submitted_at"]:
        raise ApiError(400, "Bài luyện tập này đã nộp rồi")
    answers = c.body.get("answers")
    if not isinstance(answers, list) or len(answers) > 100:
        raise ApiError(400, "Dữ liệu bài làm không hợp lệ")
    qs = json.loads(p["questions"])
    new_scheme = p["scheme"] == 1
    sc, mx, details = grading.grade_points(qs, answers, reveal=True) if new_scheme else grading.grade(qs, answers, reveal=True)
    now = db.now()
    c.con.execute("UPDATE practice SET answers=?, score=?, max_score=?, details=?, submitted_at=? WHERE id=?",
                  (json.dumps(answers, ensure_ascii=False), sc, mx, json.dumps(details, ensure_ascii=False), now, p["id"]))
    bonus = award_bonus(c.con, c.user, p["id"], qs, details, now)
    spent = max(0, now - p["started_at"])
    return {"score": sc, "max": mx, "score10": score10(sc, mx), "late": False, "essay": 0, "details": details,
            "questions": [grading.sanitize_question(q) for q in qs], "bonus": bonus,
            "points": new_scheme, "spent_sec": spent, "duration_min": p["duration_min"],
            "overtime": bool(p["duration_min"]) and spent > p["duration_min"] * 60 + 15}


def practice_sessions(con, student_id):
    rows = con.execute("SELECT p.*, b.points bonus FROM practice p LEFT JOIN bonus_log b ON b.practice_id=p.id "
                       "WHERE p.student_id=? AND p.submitted_at IS NOT NULL ORDER BY p.id DESC LIMIT 100", (student_id,)).fetchall()
    out = [{"id": r["id"], "title": r["title"], "topics": json.loads(r["topics"] or "[]"), "score": r["score"], "max": r["max_score"],
            "score10": score10(r["score"], r["max_score"]), "at": r["submitted_at"], "bonus": r["bonus"] or 0,
            "points": r["scheme"] == 1, "spent_sec": max(0, r["submitted_at"] - r["started_at"]), "duration_min": r["duration_min"]} for r in rows]
    vals = [x["score10"] for x in out if x["score10"] is not None]
    return {"sessions": out, "avg": round(sum(vals) / len(vals), 2) if vals else None}


def practice_review(p):
    if not p["submitted_at"]:
        raise ApiError(400, "Bài chưa nộp")
    qs = json.loads(p["questions"])
    return {"title": p["title"], "score": p["score"], "max": p["max_score"], "score10": score10(p["score"], p["max_score"]),
            "details": json.loads(p["details"]), "questions": [grading.sanitize_question(q) for q in qs], "answers": json.loads(p["answers"] or "[]"),
            "points": p["scheme"] == 1, "spent_sec": max(0, p["submitted_at"] - p["started_at"]), "duration_min": p["duration_min"]}


@route("GET", "/api/practice", ("student",))
def r_practice_list(c):
    return practice_sessions(c.con, c.user["id"])


@route("GET", r"/api/practice/(\d+)", ("student",))
def r_practice_review(c):
    return practice_review(own_practice(c, int(c.p[0])))


# giáo viên (của lớp đó) xem kết quả tự luyện tập của học sinh
@route("GET", r"/api/students/(\d+)/practice", TEACHER_ROLES)
def r_student_practice(c):
    s = get_student(c.con, c.user, int(c.p[0]))
    return {"student": s["name"], **practice_sessions(c.con, s["id"])}


@route("GET", r"/api/students/(\d+)/practice/(\d+)", TEACHER_ROLES)
def r_student_practice_review(c):
    s = get_student(c.con, c.user, int(c.p[0]))
    p = c.con.execute("SELECT * FROM practice WHERE id=? AND student_id=?", (int(c.p[1]), s["id"])).fetchone()
    if not p:
        raise ApiError(404, "Không tìm thấy bài luyện tập")
    return {"student": s["name"], **practice_review(p)}


def practice_stats(con, student_id):
    r = con.execute("SELECT COUNT(*) n, AVG(score*10.0/NULLIF(max_score,0)) a FROM practice WHERE student_id=? AND submitted_at IS NOT NULL", (student_id,)).fetchone()
    return {"n": r["n"], "avg": round(r["a"], 2) if r["a"] is not None else None}


# ---------- điểm cộng tự luyện tập ----------
# Giáo viên đặt số điểm cộng cho mỗi câu làm đúng theo dạng câu (theo lớp). Điểm cộng dồn theo tháng (giờ Việt Nam) và
# tự về 0 khi sang tháng mới; các tháng cũ vẫn giữ để xem lại. Mỗi câu hỏi chỉ được cộng điểm lần đầu làm đúng trong tháng
# (luyện lại câu đã biết đáp án không được cộng thêm). Câu đúng/sai chỉ được cộng khi đúng cả 4 ý.
BONUS_DEFAULT = {"mcq": 10, "tf": 40, "short": 50}
BONUS_TYPES = ("mcq", "tf", "short")
VN_OFFSET = 7 * 3600
MONTH_RE = re.compile(r"\d{4}-(0[1-9]|1[0-2])")


def month_key(ts=None) -> str:
    return time.strftime("%Y-%m", time.gmtime((db.now() if ts is None else ts) + VN_OFFSET))


def bonus_config(con, class_id) -> dict:
    r = con.execute("SELECT mcq, tf, short FROM bonus_config WHERE class_id=?", (class_id,)).fetchone() if class_id else None
    return {t: r[t] for t in BONUS_TYPES} if r else dict(BONUS_DEFAULT)


def bonus_qid(q) -> str:
    qid = q.get("id")
    if isinstance(qid, str) and qid:
        return qid
    return "h" + hashlib.sha1(json.dumps([q.get("q"), q.get("opts"), q.get("sts")], ensure_ascii=False).encode()).hexdigest()[:20]


def award_bonus(con, user, practice_id, qs, details, ts) -> dict:
    """Cộng điểm cho các câu làm đúng hoàn toàn trong một lần tự luyện tập; ghi sổ để không cộng trùng."""
    cfg, month = bonus_config(con, user["class_id"]), month_key(ts)
    n = {t: 0 for t in BONUS_TYPES}
    repeat = 0
    for q, d in zip(qs, details):
        t = q.get("t")
        if t not in BONUS_TYPES or d.get("score") != 1 or not cfg[t]:
            continue
        cur = con.execute("INSERT OR IGNORE INTO bonus_q(student_id, month, qid) VALUES(?,?,?)", (user["id"], month, bonus_qid(q)))
        if cur.rowcount:
            n[t] += 1
        else:
            repeat += 1
    pts = sum(n[t] * cfg[t] for t in BONUS_TYPES)
    con.execute("INSERT OR REPLACE INTO bonus_log(practice_id, student_id, class_id, month, points, n_mcq, n_tf, n_short, n_repeat, at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (practice_id, user["id"], user["class_id"], month, pts, n["mcq"], n["tf"], n["short"], repeat, ts))
    total = con.execute("SELECT COALESCE(SUM(points),0) s FROM bonus_log WHERE student_id=? AND month=?", (user["id"], month)).fetchone()["s"]
    return {"points": pts, "counts": n, "repeat": repeat, "month": month, "month_total": total, "config": cfg}


def need_month(v) -> str:
    v = str(v or "").strip() or month_key()
    if not MONTH_RE.fullmatch(v):
        raise ApiError(400, "Tháng không hợp lệ (định dạng YYYY-MM)")
    return v


def class_bonus_table(con, class_id, month):
    """Bảng điểm cộng của các học sinh đang ở lớp trong một tháng, xếp hạng giảm dần (bằng điểm thì cùng hạng)."""
    studs = con.execute("SELECT id, name, username FROM users WHERE role='student' AND active=1 AND class_id=? ORDER BY name", (class_id,)).fetchall()
    agg = {r["student_id"]: r for r in con.execute(
        "SELECT student_id, SUM(points) pts, COUNT(*) n, SUM(n_mcq) m, SUM(n_tf) t, SUM(n_short) s, MAX(at) last FROM bonus_log "
        "WHERE month=? AND student_id IN (SELECT id FROM users WHERE role='student' AND class_id=?) GROUP BY student_id", (month, class_id)).fetchall()}
    rows = []
    for s in studs:
        a = agg.get(s["id"])
        rows.append({"id": s["id"], "name": s["name"], "username": s["username"], "points": a["pts"] if a else 0, "sessions": a["n"] if a else 0,
                     "mcq": a["m"] if a else 0, "tf": a["t"] if a else 0, "short": a["s"] if a else 0, "last": a["last"] if a else None})
    rows.sort(key=lambda r: (-r["points"], r["name"]))
    for i, r in enumerate(rows):
        r["rank"] = rows[i - 1]["rank"] if i and rows[i - 1]["points"] == r["points"] else i + 1
    return rows


def bonus_months(con, class_id):
    cur = month_key()
    ms = {r["month"] for r in con.execute(
        "SELECT DISTINCT month FROM bonus_log WHERE student_id IN (SELECT id FROM users WHERE role='student' AND class_id=?)", (class_id,)).fetchall()}
    return sorted(ms | {cur}, reverse=True)


@route("GET", r"/api/classes/(\d+)/bonus", TEACHER_ROLES)
def r_class_bonus(c):
    cls = get_class(c.con, c.user, int(c.p[0]))
    month = need_month(c.query.get("month"))
    return {"class": cls["name"], "month": month, "current": month_key(), "months": bonus_months(c.con, cls["id"]),
            "config": bonus_config(c.con, cls["id"]), "default": BONUS_DEFAULT, "students": class_bonus_table(c.con, cls["id"], month)}


@route("POST", r"/api/classes/(\d+)/bonus-config", TEACHER_ROLES)
def r_class_bonus_config(c):
    cls = get_class(c.con, c.user, int(c.p[0]))
    cfg = {t: need_int(c.body, t, 0, 10000, BONUS_DEFAULT[t]) for t in BONUS_TYPES}
    c.con.execute("INSERT OR REPLACE INTO bonus_config(class_id, mcq, tf, short, updated_by, updated_at) VALUES(?,?,?,?,?,?)",
                  (cls["id"], cfg["mcq"], cfg["tf"], cfg["short"], c.user["id"], db.now()))
    audit(c.con, c.user["id"], "bonus_config", f"lớp {cls['name']}: TN {cfg['mcq']} · Đ/S {cfg['tf']} · TLN {cfg['short']}")
    return {"ok": True, "config": cfg}


@route("GET", r"/api/students/(\d+)/bonus", TEACHER_ROLES)
def r_student_bonus(c):
    s = get_student(c.con, c.user, int(c.p[0]))
    month = need_month(c.query.get("month"))
    rows = c.con.execute("SELECT b.*, p.title, p.score, p.max_score FROM bonus_log b JOIN practice p ON p.id=b.practice_id "
                         "WHERE b.student_id=? AND b.month=? ORDER BY b.at DESC", (s["id"], month)).fetchall()
    return {"student": s["name"], "month": month, "total": sum(r["points"] for r in rows),
            "sessions": [{"id": r["practice_id"], "title": r["title"], "points": r["points"], "mcq": r["n_mcq"], "tf": r["n_tf"], "short": r["n_short"],
                          "repeat": r["n_repeat"], "score": r["score"], "max": r["max_score"], "at": r["at"]} for r in rows]}


@route("GET", "/api/bonus/me", ("student",))
def r_my_bonus(c):
    month = month_key()
    total = c.con.execute("SELECT COALESCE(SUM(points),0) s FROM bonus_log WHERE student_id=? AND month=?", (c.user["id"], month)).fetchone()["s"]
    hist = [dict(month=r["month"], points=r["s"]) for r in c.con.execute(
        "SELECT month, SUM(points) s FROM bonus_log WHERE student_id=? GROUP BY month ORDER BY month DESC LIMIT 12", (c.user["id"],)).fetchall()]
    rank = size = None
    if c.user["class_id"]:
        table = class_bonus_table(c.con, c.user["class_id"], month)
        size = len(table)
        rank = next((r["rank"] for r in table if r["id"] == c.user["id"]), None)
    return {"month": month, "points": total, "config": bonus_config(c.con, c.user["class_id"]), "rank": rank, "class_size": size, "history": hist}


# ---------- lịch học & điểm danh ----------
# Mỗi lớp có lịch học theo thứ trong tuần (kèm giờ học) và học phí mỗi buổi. Lịch lưu theo "áp dụng từ ngày" nên đổi lịch
# không làm sai các tháng đã qua. Ngày lớp có lịch: học sinh mặc định "có đi học"; giáo viên chỉ cần đánh dấu em nghỉ.
# Ngày không có lịch: mặc định không học; giáo viên vẫn tick "có học" được (học bù, học thêm).
WEEKDAY_VN = ("Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật")
ATT_STATUS = ("present", "absent", "none")


def today_vn() -> datetime.date:
    return datetime.datetime.fromtimestamp(db.now() + VN_OFFSET, datetime.timezone.utc).date()


def need_date(v, default=None) -> datetime.date:
    if not v:
        return default or today_vn()
    try:
        return datetime.date.fromisoformat(str(v))
    except ValueError:
        raise ApiError(400, "Ngày không hợp lệ (định dạng YYYY-MM-DD)")


def clean_days(v) -> dict:
    if not isinstance(v, dict):
        raise ApiError(400, "Lịch học không hợp lệ")
    out = {}
    for k, t in v.items():
        if str(k) not in ("0", "1", "2", "3", "4", "5", "6"):
            raise ApiError(400, "Lịch học không hợp lệ (thứ)")
        out[str(k)] = str(t or "").strip()[:40]
    return dict(sorted(out.items()))


def schedules(con, class_ids) -> dict:
    """{class_id: [(from_date, days, fee), ...]} sắp theo ngày áp dụng tăng dần."""
    out = {cid: [] for cid in class_ids}
    if class_ids:
        q = ",".join("?" * len(class_ids))
        for r in con.execute(f"SELECT class_id, from_date, days, fee FROM class_schedule WHERE class_id IN ({q}) ORDER BY from_date", list(class_ids)).fetchall():
            out[r["class_id"]].append((r["from_date"], json.loads(r["days"]), r["fee"]))
    return out


def sched_on(rows, d: datetime.date):
    """Lịch đang áp dụng ngày d: (days, fee) hoặc None nếu lớp chưa có lịch vào ngày đó."""
    iso, cur = d.isoformat(), None
    for f, days, fee in rows or []:
        if f <= iso:
            cur = (days, fee)
    return cur


def visible_classes(con, user):
    if user["role"] == "admin":
        return con.execute("SELECT * FROM classes ORDER BY name").fetchall()
    return con.execute("SELECT * FROM classes WHERE owner_id=? ORDER BY name", (user["id"],)).fetchall()


def att_students(con, user, class_id=None):
    cls = {k["id"]: k for k in visible_classes(con, user)}
    if class_id is not None:
        if class_id not in cls:
            raise ApiError(404, "Không tìm thấy lớp")
        cls = {class_id: cls[class_id]}
    if not cls:
        return cls, []
    q = ",".join("?" * len(cls))
    studs = con.execute(f"SELECT id, name, username, class_id, created_at FROM users WHERE role='student' AND active=1 AND class_id IN ({q}) ORDER BY name",
                        list(cls)).fetchall()
    return cls, studs


def joined_on(s) -> str:
    return datetime.datetime.fromtimestamp(s["created_at"] + VN_OFFSET, datetime.timezone.utc).date().isoformat()


def day_status(rec, sched, d: datetime.date, joined: str):
    """(trạng thái, có lịch?, giờ học) của một học sinh trong một ngày."""
    wd = str(d.weekday())
    # Ngày lớp có lịch thì học sinh nào của lớp cũng có lịch (không phụ thuộc ngày tạo tài khoản: giáo viên thường nhập học sinh sau khi lớp đã học)
    scheduled = bool(sched and wd in sched[0])
    if rec:
        return rec, scheduled, sched[0].get(wd, "") if sched else ""
    return ("present" if scheduled else "none"), scheduled, sched[0].get(wd, "") if sched else ""


@route("GET", r"/api/classes/(\d+)/schedule", TEACHER_ROLES)
def r_schedule(c):
    cls = get_class(c.con, c.user, int(c.p[0]))
    rows = schedules(c.con, [cls["id"]])[cls["id"]]
    cur = sched_on(rows, today_vn())
    nxt = [r for r in rows if r[0] > today_vn().isoformat()]
    show = nxt[-1] if nxt else (rows[-1] if rows else None)
    return {"class": cls["name"], "has": bool(rows), "days": show[1] if show else {}, "fee": show[2] if show else 0,
            "from": show[0] if show else None, "current": {"days": cur[0], "fee": cur[1]} if cur else None,
            "history": [{"from": f, "days": d, "fee": fee} for f, d, fee in rows][::-1][:10]}


@route("POST", r"/api/classes/(\d+)/schedule", TEACHER_ROLES)
def r_schedule_set(c):
    cls = get_class(c.con, c.user, int(c.p[0]))
    days = clean_days(c.body.get("days"))
    fee = need_int(c.body, "fee", 0, 100_000_000, 0)
    frm = need_date(c.body.get("from"))
    if abs((frm - today_vn()).days) > 400:
        raise ApiError(400, "Ngày áp dụng phải trong khoảng một năm quanh hôm nay")
    c.con.execute("INSERT OR REPLACE INTO class_schedule(class_id, from_date, days, fee, updated_by, updated_at) VALUES(?,?,?,?,?,?)",
                  (cls["id"], frm.isoformat(), json.dumps(days, ensure_ascii=False), fee, c.user["id"], db.now()))
    # lịch mới thay mọi lịch đặt cho các ngày sau đó
    c.con.execute("DELETE FROM class_schedule WHERE class_id=? AND from_date>?", (cls["id"], frm.isoformat()))
    audit(c.con, c.user["id"], "schedule", f"lớp {cls['name']}: {', '.join(WEEKDAY_VN[int(k)] for k in days) or 'không có buổi'} · {fee}đ/buổi · từ {frm.isoformat()}")
    return {"ok": True}


@route("GET", "/api/attendance", TEACHER_ROLES)
def r_attendance(c):
    d = need_date(c.query.get("date"))
    cid = int(c.query["class_id"]) if str(c.query.get("class_id") or "").isdigit() else None
    cls, studs = att_students(c.con, c.user, cid)
    sch = schedules(c.con, list(cls))
    recs = {r["student_id"]: r for r in c.con.execute("SELECT * FROM attendance WHERE date=?", (d.isoformat(),)).fetchall()}
    closed = {r["class_id"]: r for r in c.con.execute("SELECT * FROM att_close WHERE date=?", (d.isoformat(),)).fetchall()}
    out = []
    for s in studs:
        r = recs.get(s["id"])
        st, scheduled, tm = day_status(r["status"] if r else None, sched_on(sch[s["class_id"]], d), d, joined_on(s))
        out.append({"id": s["id"], "name": s["name"], "username": s["username"], "class_id": s["class_id"], "class_name": cls[s["class_id"]]["name"],
                    "scheduled": scheduled, "time": tm, "status": st, "marked": bool(r), "note": r["note"] if r else "",
                    "late_min": r["late_min"] if r and st == "present" else 0})
    classes = []
    for k in cls.values():
        sc = sched_on(sch[k["id"]], d)
        classes.append({"id": k["id"], "name": k["name"], "has_schedule": bool(sch[k["id"]]),
                        "scheduled": bool(sc and str(d.weekday()) in sc[0]), "time": sc[0].get(str(d.weekday()), "") if sc else "",
                        "closed": k["id"] in closed, "closed_at": closed[k["id"]]["closed_at"] if k["id"] in closed else None})
    return {"date": d.isoformat(), "weekday": WEEKDAY_VN[d.weekday()], "today": today_vn().isoformat(), "classes": classes, "students": out}


@route("POST", "/api/attendance", TEACHER_ROLES)
def r_attendance_set(c):
    d = need_date(c.body.get("date"))
    if (d - today_vn()).days > 31:
        raise ApiError(400, "Chỉ điểm danh trước tối đa 31 ngày")
    items = c.body.get("items")
    if not isinstance(items, list) or not items or len(items) > 2000:
        raise ApiError(400, "Danh sách điểm danh không hợp lệ")
    _, studs = att_students(c.con, c.user)
    mine = {s["id"]: s for s in studs}
    closed = {r["class_id"] for r in c.con.execute("SELECT class_id FROM att_close WHERE date=?", (d.isoformat(),)).fetchall()}
    n = 0
    for it in items:
        sid = it.get("student_id") if isinstance(it, dict) else None
        if sid not in mine:
            raise ApiError(404, "Không tìm thấy học sinh trong các lớp của bạn")
        if mine[sid]["class_id"] in closed:
            raise ApiError(409, f"Ngày {d.strftime('%d/%m/%Y')} đã chốt điểm danh cho lớp này — hãy bấm “Mở lại” để sửa")
        st = it.get("status")
        old = c.con.execute("SELECT late_min FROM attendance WHERE student_id=? AND date=?", (sid, d.isoformat())).fetchone()
        late = it.get("late_min", old["late_min"] if old else 0)
        if isinstance(late, bool) or not isinstance(late, (int, float)) or not 0 <= late <= 600:
            raise ApiError(400, "Số phút đi muộn phải từ 0 đến 600")
        if st == "auto":   # bỏ đánh dấu, quay về mặc định theo lịch
            c.con.execute("DELETE FROM attendance WHERE student_id=? AND date=?", (sid, d.isoformat()))
        elif st in ATT_STATUS:
            c.con.execute("INSERT OR REPLACE INTO attendance(student_id, date, status, class_id, note, marked_by, marked_at, late_min) VALUES(?,?,?,?,?,?,?,?)",
                          (sid, d.isoformat(), st, mine[sid]["class_id"], str(it.get("note") or "").strip()[:200], c.user["id"], db.now(),
                           int(late) if st == "present" else 0))   # chỉ học sinh đi học mới có số phút muộn
        else:
            raise ApiError(400, "Trạng thái điểm danh không hợp lệ")
        n += 1
    audit(c.con, c.user["id"], "attendance", f"{d.isoformat()}: {n} học sinh")
    return {"ok": True, "saved": n}


@route("POST", "/api/attendance/close", TEACHER_ROLES)
def r_attendance_close(c):
    """Chốt (hoặc mở lại) điểm danh của một ngày cho một lớp (không gửi class_id = mọi lớp của giáo viên).
    Khi chốt: học sinh có lịch mà chưa được đánh dấu sẽ được ghi cố định là đi học; sau đó không sửa được cho đến khi mở lại."""
    d = need_date(c.body.get("date"))
    if d > today_vn():
        raise ApiError(400, "Chưa tới ngày này nên chưa chốt điểm danh được")
    cid = c.body.get("class_id")
    cls, studs = att_students(c.con, c.user, int(cid) if str(cid or "").isdigit() else None)
    if not cls:
        raise ApiError(404, "Không tìm thấy lớp")
    sch, iso, done, filled = schedules(c.con, list(cls)), d.isoformat(), 0, 0
    if c.body.get("closed", True):
        have = {r["student_id"] for r in c.con.execute("SELECT student_id FROM attendance WHERE date=?", (iso,)).fetchall()}
        for s in studs:
            sc = sched_on(sch[s["class_id"]], d)
            if s["id"] not in have and sc and str(d.weekday()) in sc[0]:
                c.con.execute("INSERT INTO attendance(student_id, date, status, class_id, note, marked_by, marked_at, late_min) VALUES(?,?,?,?,?,?,?,0)",
                              (s["id"], iso, "present", s["class_id"], "", c.user["id"], db.now()))
                filled += 1
        for k in cls:
            c.con.execute("INSERT OR REPLACE INTO att_close(date, class_id, closed_by, closed_at) VALUES(?,?,?,?)", (iso, k, c.user["id"], db.now()))
            done += 1
        audit(c.con, c.user["id"], "attendance_close", f"{iso}: {done} lớp, ghi cố định {filled} học sinh")
    else:
        for k in cls:
            c.con.execute("DELETE FROM att_close WHERE date=? AND class_id=?", (iso, k))
            done += 1
        audit(c.con, c.user["id"], "attendance_reopen", f"{iso}: {done} lớp")
    return {"ok": True, "classes": done, "filled": filled}


# ---------- quy tắc phạt đi muộn / thưởng điểm (đổi được theo tháng, áp dụng từ tháng đặt trở đi) ----------
RULE_DEFAULT = {"late_fee": 1000, "reward_min": 8.0, "reward_amount": 5000}


def att_rules(con, owner_id, month) -> dict:
    """Quy tắc của giáo viên có hiệu lực ở tháng `month`: bản ghi gần nhất không muộn hơn tháng đó, chưa đặt thì dùng mặc định."""
    r = con.execute("SELECT late_fee, reward_min, reward_amount, month FROM att_rules WHERE owner_id=? AND month<=? ORDER BY month DESC LIMIT 1",
                    (owner_id, month)).fetchone()
    out = dict(RULE_DEFAULT)
    out["from"] = None
    if r:
        out.update({k: r[k] for k in ("late_fee", "reward_min", "reward_amount")})
        out["from"] = r["month"]
    return out


def student_reward_min(con, sid, month, default_min) -> float:
    r = con.execute("SELECT reward_min FROM student_reward WHERE student_id=? AND month<=? ORDER BY month DESC LIMIT 1", (sid, month)).fetchone()
    return default_min if (not r or r["reward_min"] < 0) else r["reward_min"]


def test_rewards(con, sid, owner_id, month) -> list:
    """Các bài kiểm tra (bài giáo viên giao) được thưởng trong tháng: mỗi bài tính một lần, theo lần nộp đầu tiên đạt mức thưởng của học sinh.
    Điểm thưởng cộng dồn qua các bài."""
    rows = con.execute("SELECT s.assignment_id, s.score, s.max_score, s.submitted_at, a.title FROM submissions s JOIN assignments a ON a.id=s.assignment_id "
                       "WHERE s.student_id=? AND s.submitted_at IS NOT NULL AND s.max_score>0 ORDER BY s.submitted_at", (sid,)).fetchall()
    seen, out = set(), []
    for r in rows:
        if r["assignment_id"] in seen:
            continue
        mm = month_key(r["submitted_at"])
        rules = att_rules(con, owner_id, mm)
        s10 = r["score"] * 10.0 / r["max_score"]
        if s10 + 1e-9 >= student_reward_min(con, sid, mm, rules["reward_min"]) and rules["reward_amount"] > 0:
            seen.add(r["assignment_id"])
            if mm == month:
                out.append({"title": r["title"], "score10": round(s10, 2), "amount": rules["reward_amount"]})
    return out


@route("GET", "/api/att-rules", TEACHER_ROLES)
def r_att_rules(c):
    month = need_month(c.query.get("month") or month_key())
    cls, studs = att_students(c.con, c.user)
    rules = att_rules(c.con, c.user["id"], month)
    return {"month": month, "rules": rules, "default": RULE_DEFAULT,
            "students": [{"id": s["id"], "name": s["name"], "class_name": cls[s["class_id"]]["name"],
                          "reward_min": student_reward_min(c.con, s["id"], month, rules["reward_min"]),
                          "custom": abs(student_reward_min(c.con, s["id"], month, rules["reward_min"]) - rules["reward_min"]) > 1e-9} for s in studs]}


@route("POST", "/api/att-rules", TEACHER_ROLES)
def r_att_rules_set(c):
    month = need_month(c.body.get("month") or month_key())
    fee = need_int(c.body, "late_fee", 0, 1_000_000, RULE_DEFAULT["late_fee"])
    amount = need_int(c.body, "reward_amount", 0, 100_000_000, RULE_DEFAULT["reward_amount"])
    rmin = c.body.get("reward_min", RULE_DEFAULT["reward_min"])
    if isinstance(rmin, bool) or not isinstance(rmin, (int, float)) or not 0 <= rmin <= 10:
        raise ApiError(400, "Mức điểm được thưởng phải từ 0 đến 10")
    c.con.execute("INSERT OR REPLACE INTO att_rules(owner_id, month, late_fee, reward_min, reward_amount, updated_at) VALUES(?,?,?,?,?,?)",
                  (c.user["id"], month, fee, float(rmin), amount, db.now()))
    audit(c.con, c.user["id"], "att_rules", f"từ {month}: muộn {fee}đ/phút · thưởng ≥{rmin} → +{amount}")
    return {"ok": True}


@route("POST", "/api/att-rules/student", TEACHER_ROLES)
def r_att_rules_student(c):
    month = need_month(c.body.get("month") or month_key())
    _, studs = att_students(c.con, c.user)
    sid = need_int(c.body, "student_id")
    if sid not in {s["id"] for s in studs}:
        raise ApiError(404, "Không tìm thấy học sinh trong các lớp của bạn")
    v = c.body.get("reward_min")
    if v is None or v == "":
        v = -1   # dùng mức mặc định
    elif isinstance(v, bool) or not isinstance(v, (int, float)) or not 0 <= v <= 10:
        raise ApiError(400, "Mức điểm được thưởng phải từ 0 đến 10")
    c.con.execute("INSERT OR REPLACE INTO student_reward(student_id, month, reward_min) VALUES(?,?,?)", (sid, month, float(v)))
    return {"ok": True}


@route("GET", "/api/attendance/stats", TEACHER_ROLES)
def r_attendance_stats(c):
    month = need_month(c.query.get("month"))
    cid = int(c.query["class_id"]) if str(c.query.get("class_id") or "").isdigit() else None
    y, m = int(month[:4]), int(month[5:])
    first, ndays = datetime.date(y, m, 1), calendar.monthrange(y, m)[1]
    last, today = datetime.date(y, m, ndays), today_vn()
    cls, studs = att_students(c.con, c.user, cid)
    sch = schedules(c.con, list(cls))
    recs = {}
    if studs:
        q = ",".join("?" * len(studs))
        for r in c.con.execute(f"SELECT student_id, date, status, note, late_min FROM attendance WHERE date BETWEEN ? AND ? AND student_id IN ({q})",
                               [first.isoformat(), last.isoformat()] + [s["id"] for s in studs]).fetchall():
            recs[(r["student_id"], r["date"])] = r
    out = []
    for s in studs:
        joined, marks, present, absent, planned, amount, notes, late = joined_on(s), [], 0, 0, 0, 0, [], 0
        for i in range(ndays):
            d = first + datetime.timedelta(days=i)
            if d > today:
                marks.append(" ")
                continue
            r = recs.get((s["id"], d.isoformat()))
            sc = sched_on(sch[s["class_id"]], d)
            st, scheduled, _ = day_status(r["status"] if r else None, sc, d, joined)
            planned += scheduled
            if st == "present":
                present += 1
                amount += sc[1] if sc else 0
                late += r["late_min"] if r else 0
                marks.append("P" if r else "p")
            elif st == "absent":
                absent += 1
                marks.append("A")
                if r["note"]:
                    notes.append(f"{d.day:02d}/{m:02d}: {r['note']}")
            else:
                marks.append("x" if scheduled else ".")   # x: có lịch nhưng giáo viên đánh dấu không học (lớp nghỉ)
        # điểm phạt đi muộn + điểm thưởng (bài kiểm tra đạt mức thưởng, bài tự luyện tập) → điểm ròng của tháng
        owner = cls[s["class_id"]]["owner_id"]
        rules = att_rules(c.con, owner, month)
        fine = late * rules["late_fee"]
        tests = test_rewards(c.con, s["id"], owner, month)
        test_pts = sum(t["amount"] for t in tests)
        practice_pts = c.con.execute("SELECT COALESCE(SUM(points),0) s FROM bonus_log WHERE student_id=? AND month=?", (s["id"], month)).fetchone()["s"]
        out.append({"id": s["id"], "name": s["name"], "username": s["username"], "class_id": s["class_id"], "class_name": cls[s["class_id"]]["name"],
                    "present": present, "absent": absent, "planned": planned, "amount": amount, "marks": "".join(marks), "notes": notes,
                    "late_min": late, "late_fine": fine, "tests": tests, "test_reward": test_pts, "practice_bonus": practice_pts,
                    "net_points": test_pts + practice_pts - fine})
    fees = {k: (sched_on(sch[k], min(today, last)) or (None, 0))[1] for k in cls}
    return {"month": month, "days": ndays, "first_weekday": first.weekday(), "today": today.isoformat(),
            "classes": [{"id": k["id"], "name": k["name"], "fee": fees[k["id"]]} for k in cls.values()], "students": out,
            "total": sum(x["amount"] for x in out), "total_late_fine": sum(x["late_fine"] for x in out),
            "total_reward": sum(x["test_reward"] + x["practice_bonus"] for x in out)}


# ---------- bảng tin ----------
def post_visible_sql(u):
    return "(p.visibility='Công khai' OR p.author_id=:uid OR (p.visibility='Người theo dõi' AND EXISTS(SELECT 1 FROM follows f WHERE f.user_id=:uid AND f.target_id=p.author_id)))"


def post_dict(con, r, uid):
    file = con.execute("SELECT id,name,size FROM files WHERE id=?", (r["file_id"],)).fetchone() if r["file_id"] else None
    return {"id": r["id"], "kind": r["kind"], "title": r["title"], "text": r["text"], "tags": json.loads(r["tags"] or "[]"),
            "visibility": r["visibility"], "created_at": r["created_at"],
            "author": {"id": r["author_id"], "name": r["aname"], "role": r["arole"]},
            "likes": con.execute("SELECT COUNT(*) n FROM post_likes WHERE post_id=?", (r["id"],)).fetchone()["n"],
            "liked": bool(con.execute("SELECT 1 FROM post_likes WHERE post_id=? AND user_id=?", (r["id"], uid)).fetchone()),
            "saved": bool(con.execute("SELECT 1 FROM post_saves WHERE post_id=? AND user_id=?", (r["id"], uid)).fetchone()),
            "comments": con.execute("SELECT COUNT(*) n FROM comments WHERE post_id=?", (r["id"],)).fetchone()["n"],
            "followed": bool(con.execute("SELECT 1 FROM follows WHERE user_id=? AND target_id=?", (uid, r["author_id"])).fetchone()),
            "file": dict(file) if file else None}


@route("GET", "/api/posts", "any")
def r_posts(c):
    u, q = c.user, c.query
    mode = q.get("mode", "foryou")
    sql = ("SELECT p.*, a.name aname, a.role arole FROM posts p JOIN users a ON a.id=p.author_id WHERE " + post_visible_sql(u))
    args = {"uid": u["id"]}
    if mode == "following":
        sql += " AND (p.author_id=:uid OR EXISTS(SELECT 1 FROM follows f WHERE f.user_id=:uid AND f.target_id=p.author_id))"
    elif mode == "saved":
        sql += " AND EXISTS(SELECT 1 FROM post_saves s WHERE s.post_id=p.id AND s.user_id=:uid)"
    elif mode == "mine":
        sql += " AND p.author_id=:uid"
    if q.get("author"):
        sql += " AND p.author_id=:author"
        args["author"] = int(q["author"])
    if q.get("q"):
        sql += " AND (p.text LIKE :q ESCAPE '\\' OR p.title LIKE :q ESCAPE '\\' OR p.tags LIKE :q ESCAPE '\\')"
        args["q"] = "%" + q["q"].replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    if q.get("kind"):
        sql += " AND p.kind=:kind"
        args["kind"] = q["kind"]
    sql += " ORDER BY p.id DESC LIMIT 60"
    return {"posts": [post_dict(c.con, r, u["id"]) for r in c.con.execute(sql, args).fetchall()]}


def save_file(con, owner, f):
    if not isinstance(f, dict):
        return None
    name = os.path.basename(str(f.get("name") or "file"))[:120]
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in FILE_EXT:
        raise ApiError(400, "Loại file không được hỗ trợ (cho phép: " + ", ".join(sorted(FILE_EXT)) + ")")
    try:
        raw = base64.b64decode(f.get("data") or "", validate=True)
    except Exception:
        raise ApiError(400, "File tải lên không hợp lệ")
    if not raw or len(raw) > 20 * 1024 * 1024:
        raise ApiError(400, "File tối đa 20 MB")
    path = secrets.token_hex(16) + "." + ext
    with open(os.path.join(db.UPLOAD_DIR, path), "wb") as fh:
        fh.write(raw)
    cur = con.execute("INSERT INTO files(owner_id,name,mime,size,path,created_at) VALUES(?,?,?,?,?,?)", (owner, name, FILE_EXT[ext], len(raw), path, db.now()))
    return cur.lastrowid


POST_KINDS = ("Bài viết", "Video bài giảng", "Tài liệu", "Project học tập")


@route("POST", "/api/posts", "any")
def r_post_new(c):
    b, u = c.body, c.user
    kind = b.get("kind") if b.get("kind") in POST_KINDS else "Bài viết"
    if u["role"] in ("student", "parent") and kind not in ("Bài viết", "Project học tập"):
        raise ApiError(403, "Tài khoản của bạn chỉ đăng được Bài viết hoặc Project học tập")
    text = need_str(b, "text", 5000)
    tags = [str(t).strip()[:30] for t in (b.get("tags") or []) if str(t).strip()][:5]
    vis = b.get("visibility") if b.get("visibility") in ("Công khai", "Người theo dõi") else "Công khai"
    fid = save_file(c.con, u["id"], b.get("file")) if b.get("file") else None
    cur = c.con.execute("INSERT INTO posts(author_id,kind,title,text,tags,visibility,file_id,created_at) VALUES(?,?,?,?,?,?,?,?)",
                        (u["id"], kind, need_str(b, "title", 120, False), text, json.dumps(tags, ensure_ascii=False), vis, fid, db.now()))
    return {"id": cur.lastrowid}


@route("DELETE", r"/api/posts/(\d+)", "any")
def r_post_del(c):
    p = c.con.execute("SELECT * FROM posts WHERE id=?", (int(c.p[0]),)).fetchone()
    if not p or (p["author_id"] != c.user["id"] and c.user["role"] != "admin"):
        raise ApiError(404, "Không tìm thấy bài đăng")
    if p["file_id"]:
        f = c.con.execute("SELECT path FROM files WHERE id=?", (p["file_id"],)).fetchone()
        if f:
            try:
                os.remove(os.path.join(db.UPLOAD_DIR, f["path"]))
            except OSError:
                pass
        c.con.execute("DELETE FROM files WHERE id=?", (p["file_id"],))
    for t in ("post_likes", "post_saves", "comments"):
        c.con.execute(f"DELETE FROM {t} WHERE post_id=?", (p["id"],))
    c.con.execute("DELETE FROM posts WHERE id=?", (p["id"],))
    return {"ok": True}


def toggle(c, table, pid):
    if not c.con.execute("SELECT 1 FROM posts WHERE id=?", (pid,)).fetchone():
        raise ApiError(404, "Không tìm thấy bài đăng")
    cur = c.con.execute(f"DELETE FROM {table} WHERE post_id=? AND user_id=?", (pid, c.user["id"]))
    on = cur.rowcount == 0
    if on:
        c.con.execute(f"INSERT INTO {table}(post_id,user_id) VALUES(?,?)", (pid, c.user["id"]))
    return on


@route("POST", r"/api/posts/(\d+)/like", "any")
def r_like(c):
    on = toggle(c, "post_likes", int(c.p[0]))
    return {"on": on, "count": c.con.execute("SELECT COUNT(*) n FROM post_likes WHERE post_id=?", (int(c.p[0]),)).fetchone()["n"]}


@route("POST", r"/api/posts/(\d+)/save", "any")
def r_save(c):
    return {"on": toggle(c, "post_saves", int(c.p[0]))}


@route("GET", r"/api/posts/(\d+)/comments", "any")
def r_comments(c):
    rows = c.con.execute("SELECT m.*, u.name uname, u.role urole FROM comments m JOIN users u ON u.id=m.user_id WHERE m.post_id=? ORDER BY m.id", (int(c.p[0]),)).fetchall()
    pa = c.con.execute("SELECT author_id FROM posts WHERE id=?", (int(c.p[0]),)).fetchone()
    own_post = bool(pa) and pa["author_id"] == c.user["id"]
    return {"comments": [{"id": r["id"], "text": r["text"], "name": r["uname"], "role": r["urole"], "at": r["created_at"], "mine": r["user_id"] == c.user["id"],
                          "can_del": r["user_id"] == c.user["id"] or own_post or c.user["role"] == "admin"} for r in rows]}


@route("POST", r"/api/posts/(\d+)/comments", "any")
def r_comment_new(c):
    if not c.con.execute("SELECT 1 FROM posts WHERE id=?", (int(c.p[0]),)).fetchone():
        raise ApiError(404, "Không tìm thấy bài đăng")
    c.con.execute("INSERT INTO comments(post_id,user_id,text,created_at) VALUES(?,?,?,?)", (int(c.p[0]), c.user["id"], need_str(c.body, "text", 600), db.now()))
    return {"ok": True}


@route("DELETE", r"/api/comments/(\d+)", "any")
def r_comment_del(c):
    m = c.con.execute("SELECT m.*, p.author_id pauthor FROM comments m JOIN posts p ON p.id=m.post_id WHERE m.id=?", (int(c.p[0]),)).fetchone()
    if not m or (c.user["id"] not in (m["user_id"], m["pauthor"]) and c.user["role"] != "admin"):
        raise ApiError(404, "Không tìm thấy bình luận")
    c.con.execute("DELETE FROM comments WHERE id=?", (m["id"],))
    return {"ok": True}


@route("POST", r"/api/follow/(\d+)", "any")
def r_follow(c):
    tid = int(c.p[0])
    if tid == c.user["id"] or not c.con.execute("SELECT 1 FROM users WHERE id=? AND active=1", (tid,)).fetchone():
        raise ApiError(400, "Không thể theo dõi tài khoản này")
    cur = c.con.execute("DELETE FROM follows WHERE user_id=? AND target_id=?", (c.user["id"], tid))
    on = cur.rowcount == 0
    if on:
        c.con.execute("INSERT INTO follows(user_id,target_id) VALUES(?,?)", (c.user["id"], tid))
    return {"on": on}


@route("GET", r"/api/files/(\d+)", "any")
def r_file(c):
    f = c.con.execute("SELECT * FROM files WHERE id=?", (int(c.p[0]),)).fetchone()
    if not f:
        raise ApiError(404, "Không có file")
    if f["owner_id"] != c.user["id"] and c.user["role"] != "admin":
        ok = c.con.execute("SELECT 1 FROM posts p WHERE p.file_id=:fid AND " + post_visible_sql(c.user), {"fid": f["id"], "uid": c.user["id"]}).fetchone()
        if not ok:
            raise ApiError(404, "Không có file")
    p = os.path.join(db.UPLOAD_DIR, os.path.basename(f["path"]))
    if not os.path.isfile(p):
        raise ApiError(404, "File đã bị xóa")
    with open(p, "rb") as fh:
        body = fh.read()
    disp = "inline" if f["mime"] in INLINE_MIME else "attachment"
    fname = urllib.parse.quote(f["name"])
    return Raw(200, {"Content-Type": f["mime"], "Content-Disposition": f"{disp}; filename*=UTF-8''{fname}", "Cache-Control": "private, max-age=3600"}, body)


@route("GET", "/api/directory/teachers", "any")
def r_directory(c):
    rows = c.con.execute("SELECT id,name,subject,bio FROM users WHERE role IN ('teacher','admin') AND active=1 ORDER BY name").fetchall()
    out = []
    for r in rows:
        out.append({"id": r["id"], "name": r["name"], "subject": r["subject"], "bio": r["bio"],
                    "followers": c.con.execute("SELECT COUNT(*) n FROM follows WHERE target_id=?", (r["id"],)).fetchone()["n"],
                    "posts": c.con.execute("SELECT COUNT(*) n FROM posts WHERE author_id=? AND visibility='Công khai'", (r["id"],)).fetchone()["n"],
                    "followed": bool(c.con.execute("SELECT 1 FROM follows WHERE user_id=? AND target_id=?", (c.user["id"], r["id"])).fetchone())})
    return {"teachers": out}


@route("GET", r"/api/users/(\d+)/public", "any")
def r_public_profile(c):
    r = c.con.execute("SELECT id,name,role,subject,bio FROM users WHERE id=? AND active=1 AND (role IN ('teacher','admin') OR id=?)", (int(c.p[0]), c.user["id"])).fetchone()
    if not r:
        raise ApiError(404, "Không tìm thấy")
    return {"user": dict(r), "followers": c.con.execute("SELECT COUNT(*) n FROM follows WHERE target_id=?", (r["id"],)).fetchone()["n"],
            "followed": bool(c.con.execute("SELECT 1 FROM follows WHERE user_id=? AND target_id=?", (c.user["id"], r["id"])).fetchone())}


@route("GET", "/api/server-info", TEACHER_ROLES)
def r_server_info(c):
    """Địa chỉ để máy khác trong mạng (điện thoại, máy học sinh) vào hệ thống — dùng để hiện mã QR đăng nhập."""
    host, port = c.h.server.server_address[:2]
    lan = host not in ("127.0.0.1", "localhost", "::1")
    ips = (lan_addresses() if host in ("0.0.0.0", "", "::") else [host]) if lan else []
    return {"lan": lan, "port": port, "urls": [f"http://{ip}:{port}/login.html" for ip in ips]}


# ---------- HTTP ----------
class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "LBAI"
    protocol_version = "HTTP/1.1"
    set_cookie = None
    session_token = ""

    def log_message(self, fmt, *a):
        if os.environ.get("LBAI_QUIET") != "1":
            sys.stderr.write("%s %s\n" % (self.address_string(), fmt % a))

    # --- phản hồi ---
    def _send(self, status, headers, body):
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "same-origin")
        if self.set_cookie:
            self.send_header("Set-Cookie", self.set_cookie)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status, obj):
        self._send(status, {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"}, json.dumps(obj, ensure_ascii=False).encode("utf-8"))

    # --- xử lý ---
    def do_GET(self):
        self._handle()

    do_POST = do_PATCH = do_DELETE = do_PUT = do_GET

    def do_HEAD(self):
        self._handle()

    def _cookie_token(self):
        for part in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = part.strip().partition("=")
            if k == "sid":
                return v
        return ""

    def _handle(self):
        self.set_cookie = None
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path
        try:
            if path.startswith("/api/"):
                self._api(path, dict(urllib.parse.parse_qsl(parsed.query)))
            else:
                self._static(path)
        except ApiError as e:
            self._json(e.status, {"error": e.msg})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # không để lộ chi tiết nội bộ cho client
            sys.stderr.write(f"LỖI SERVER {self.command} {path}: {e!r}\n")
            try:
                self._json(500, {"error": "Lỗi hệ thống, vui lòng thử lại"})
            except Exception:
                pass

    def _api(self, path, query):
        method = "GET" if self.command == "HEAD" else self.command
        unsafe = method in ("POST", "PATCH", "DELETE", "PUT")
        body, raw, n = {}, b"", 0
        if unsafe:  # đọc hết nội dung trước để kết nối keep-alive không bị lệch khi trả lỗi
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_UPLOAD:
                self.close_connection = True
                raise ApiError(413, "Dữ liệu gửi lên quá lớn")
            raw = self.rfile.read(n) if n else b""
            # chống CSRF: yêu cầu header tùy biến + Origin phải cùng máy chủ
            if self.headers.get("X-Requested-With") != "fetch":
                raise ApiError(403, "Yêu cầu không hợp lệ")
            origin = self.headers.get("Origin")
            if origin and urllib.parse.urlsplit(origin).netloc != self.headers.get("Host"):
                raise ApiError(403, "Nguồn yêu cầu không hợp lệ")
            if n > MAX_JSON and not (path in ("/api/posts", "/api/img") or path.startswith("/api/bank")):
                raise ApiError(413, "Dữ liệu gửi lên quá lớn")
            if raw:
                try:
                    body = json.loads(raw.decode("utf-8"))
                except ValueError:
                    raise ApiError(400, "JSON không hợp lệ")
                if not isinstance(body, dict):
                    raise ApiError(400, "JSON không hợp lệ")
        for m, rx, roles, fn in ROUTES:
            mt = rx.match(path)
            if m == method and mt:
                con = db.connect()
                try:
                    user = None
                    self.session_token = self._cookie_token()
                    if self.session_token:
                        row = con.execute("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1",
                                          (security.token_hash(self.session_token), db.now())).fetchone()
                        user = row
                    if roles is not None:
                        if not user:
                            raise ApiError(401, "Bạn cần đăng nhập")
                        if roles != "any" and user["role"] not in roles:
                            raise ApiError(403, "Bạn không có quyền thực hiện thao tác này")
                    res = fn(Ctx(self, con, user, body, query, mt.groups()))
                    con.commit()
                finally:
                    con.close()
                if isinstance(res, Raw):
                    return self._send(res.status, res.headers, res.body)
                return self._json(200, res)
        raise ApiError(404, "Không tìm thấy API")

    def _static(self, path):
        if self.command not in ("GET", "HEAD"):
            raise ApiError(405, "Phương thức không được hỗ trợ")
        path = urllib.parse.unquote(path)
        if path in ("", "/"):
            path = "/index.html"
        full = os.path.normpath(os.path.join(PUBLIC, path.lstrip("/")))
        if not (full == PUBLIC or full.startswith(PUBLIC + os.sep)):
            raise ApiError(403, "Không có quyền")
        ext = os.path.splitext(full)[1].lower()
        if ext not in STATIC_EXT or not os.path.isfile(full):
            raise ApiError(404, "Không tìm thấy trang")
        with open(full, "rb") as fh:
            body = fh.read()
        self._send(200, {"Content-Type": STATIC_EXT[ext], "Cache-Control": "no-store"}, body)


class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = False
    daemon_threads = True

    def handle_error(self, request, client_address):
        if isinstance(sys.exc_info()[1], (ConnectionError, TimeoutError)):
            return  # trình duyệt đóng kết nối giữa chừng: bình thường
        super().handle_error(request, client_address)


def lan_addresses():
    """Các địa chỉ IPv4 của máy này trong mạng nội bộ (để máy khác gõ vào trình duyệt)."""
    import socket
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))   # không gửi gói tin nào, chỉ để hệ điều hành chọn card mạng đang dùng
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        ips.update(socket.gethostbyname_ex(socket.gethostname())[2])
    except OSError:
        pass
    return sorted(i for i in ips if not i.startswith("127."))


def serve(host=None, port=None, open_browser=True, page="index.html"):
    backup.restore_if_needed()   # container mới (chưa có CSDL) → tải bản sao lưu về trước khi mở CSDL
    db.init()
    backup.mark_clean()
    backup.start_loop()
    # Nền tảng đám mây (Render, Railway, Heroku...) cấp cổng qua biến PORT và yêu cầu nghe ở 0.0.0.0 — chỉ dùng đúng cổng đó
    cloud_port = os.environ.get("PORT") if not os.environ.get("LBAI_PORT") else None
    host = host or os.environ.get("LBAI_HOST") or ("0.0.0.0" if cloud_port else "127.0.0.1")
    pref = int(port or os.environ.get("LBAI_PORT") or cloud_port or 5500)
    ports = [pref] if cloud_port else [pref] + [p for p in (5500, 5501, 5502, 3000, 3001, 8090, 8100, 9000, 9100) if p != pref]
    for p in ports:
        try:
            httpd = Server((host, p), Handler)
        except OSError as e:
            print(f"Cổng {p} không dùng được ({getattr(e, 'winerror', e)}), thử cổng khác...")
            continue
        url = f"http://localhost:{p}/{page}"
        print(f"Learning by AI đang chạy tại {url}")
        print(f"Dữ liệu: {db.DATA_DIR}")
        if host != "127.0.0.1":
            print("Server đang mở cho các máy khác CÙNG MẠNG (wifi/LAN). Máy khác mở một trong các địa chỉ sau:")
            for ip in lan_addresses():
                print(f"    http://{ip}:{p}/")
            print("Chú ý: đường truyền chưa mã hóa — chỉ dùng trong mạng tin cậy; ra Internet bắt buộc dùng HTTPS.")
        print("Nhấn Ctrl+C để dừng.")
        if open_browser and os.environ.get("LBAI_NO_BROWSER") != "1":
            threading.Timer(0.8, lambda: webbrowser.open(url)).start()
        def _term(*_):   # SIGTERM (nền tảng tắt/“ngủ” dịch vụ) → thoát vòng lặp êm để còn kịp sao lưu lần cuối
            raise KeyboardInterrupt
        try:
            signal.signal(signal.SIGTERM, _term)
        except (ValueError, OSError):
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        r = backup.run_backup()
        if backup.state["enabled"]:
            backup._log("Sao lưu lần cuối:", "xong" if r.get("ok") else r.get("error"))
        return httpd
    print("Không tìm được cổng trống.")
    sys.exit(1)
