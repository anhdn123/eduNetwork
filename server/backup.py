"""Sao lưu / khôi phục dữ liệu ra kho lưu trữ ngoài — để chạy được trên nền tảng có đĩa tạm thời (vd gói free của Render).

Cách hoạt động
  - Khi khởi động: nếu CHƯA có CSDL cục bộ (container mới) thì tải bản sao lưu mới nhất về và giải nén vào thư mục dữ liệu.
  - Khi chạy: cứ vài phút (LBAI_BACKUP_INTERVAL, mặc định 300 giây) nếu dữ liệu có thay đổi thì đẩy bản sao lên kho ngoài.
  - Khi tắt (SIGTERM, ví dụ dịch vụ "ngủ"): đẩy bản sao cuối cùng.
  - Bản sao gồm: CSDL SQLite (sao chép nhất quán bằng API backup của SQLite) + thư mục uploads, nén thành một file zip.

Chọn kho lưu trữ bằng biến môi trường (khóa/mật khẩu chỉ đặt qua biến môi trường, không ghi vào mã):
  LBAI_BACKUP_DIR=/duong/dan            sao lưu ra một thư mục (ổ gắn ngoài, ổ mạng...)
  LBAI_BACKUP_URL + LBAI_BACKUP_KEY     Supabase Storage (URL dự án + service key); LBAI_BACKUP_BUCKET (mặc định lbai-backup)
"""
import io
import json
import os
import re
import shutil
import sqlite3
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

from . import db

LATEST = "latest.zip"
MAX_ARCHIVE = int(os.environ.get("LBAI_BACKUP_MAX_MB") or 45) * 1024 * 1024   # Supabase gói free giới hạn ~50 MB mỗi file
state = {"enabled": False, "provider": "", "last_ok": None, "last_error": "", "last_size": 0, "restored": None, "blocked": False, "last_daily": None}
_lock = threading.Lock()
_last_sig = None


def _log(*a):
    """Ghi log an toàn: console không hỗ trợ tiếng Việt (vd cp1252) cũng không được làm hỏng việc khởi động / sao lưu."""
    try:
        print(*a, flush=True)
    except Exception:
        try:
            print(" ".join(str(x) for x in a).encode("ascii", "replace").decode(), flush=True)
        except Exception:
            pass


class DirStore:
    provider = "thư mục"

    def __init__(self, path):
        self.path = path

    def prepare(self):
        os.makedirs(self.path, exist_ok=True)

    def put(self, name, data):
        self.prepare()
        tmp = os.path.join(self.path, name + ".tmp")
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, os.path.join(self.path, name))   # ghi nguyên tử: không bao giờ để lại file dở dang

    def get(self, name):
        p = os.path.join(self.path, name)
        if not os.path.isfile(p):
            return None
        with open(p, "rb") as f:
            return f.read()


class SupabaseStore:
    provider = "Supabase Storage"

    def __init__(self, url, key, bucket):
        self.base, self.key, self.bucket = url.rstrip("/"), key, bucket

    def _req(self, method, path, data=None, headers=None):
        h = {"Authorization": "Bearer " + self.key, "apikey": self.key}
        h.update(headers or {})
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        return urllib.request.urlopen(req, timeout=90)

    def prepare(self):
        """Tạo bucket riêng tư nếu chưa có (đã có thì bỏ qua)."""
        try:
            self._req("POST", "/storage/v1/bucket", json.dumps({"id": self.bucket, "name": self.bucket, "public": False}).encode(),
                      {"Content-Type": "application/json"}).close()
        except urllib.error.HTTPError:
            pass   # đã tồn tại / không đủ quyền tạo → sẽ báo lỗi rõ ở bước tải lên

    def put(self, name, data):
        self.prepare()
        self._req("POST", f"/storage/v1/object/{urllib.parse.quote(self.bucket)}/{urllib.parse.quote(name)}", data,
                  {"Content-Type": "application/zip", "x-upsert": "true"}).close()

    def get(self, name):
        try:
            with self._req("GET", f"/storage/v1/object/authenticated/{urllib.parse.quote(self.bucket)}/{urllib.parse.quote(name)}") as r:
                return r.read()
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace").lower()
            if e.code == 404 or (e.code == 400 and ("not found" in body or "404" in body)):
                return None   # chưa có bản sao lưu nào (hoặc bucket chưa tạo)
            raise


def store():
    d = os.environ.get("LBAI_BACKUP_DIR")
    if d:
        return DirStore(d)
    url, key = os.environ.get("LBAI_BACKUP_URL"), os.environ.get("LBAI_BACKUP_KEY")
    if url and key:
        return SupabaseStore(url, key, os.environ.get("LBAI_BACKUP_BUCKET") or "lbai-backup")
    return None


def build_archive() -> bytes:
    tmp = tempfile.mkdtemp(prefix="lbai_snap_")
    try:
        snap = os.path.join(tmp, "lbai.db")
        src, dst = sqlite3.connect(db.DB_PATH, timeout=30), sqlite3.connect(snap)
        try:
            src.backup(dst)   # sao chép nhất quán ngay cả khi đang có người ghi dữ liệu
        finally:
            dst.close()
            src.close()
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            z.write(snap, "lbai.db")
            if os.path.isdir(db.UPLOAD_DIR):
                for n in sorted(os.listdir(db.UPLOAD_DIR)):
                    p = os.path.join(db.UPLOAD_DIR, n)
                    if os.path.isfile(p):
                        z.write(p, "uploads/" + n)
        return buf.getvalue()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _sig():
    """Dấu hiệu dữ liệu đã đổi (mtime + kích thước CSDL, file WAL và thư mục uploads) để không đẩy lại khi không có gì mới."""
    parts = []
    for p in (db.DB_PATH, db.DB_PATH + "-wal"):
        try:
            s = os.stat(p)
            parts.append((s.st_mtime_ns, s.st_size))
        except OSError:
            parts.append(None)
    up, n = 0, 0
    if os.path.isdir(db.UPLOAD_DIR):
        for f in os.listdir(db.UPLOAD_DIR):
            try:
                up, n = max(up, os.stat(os.path.join(db.UPLOAD_DIR, f)).st_mtime_ns), n + 1
            except OSError:
                pass
    return (tuple(parts), up, n)


def run_backup(force=False) -> dict:
    global _last_sig
    st = store()
    if not st:
        return {"ok": False, "error": "Chưa cấu hình kho sao lưu"}
    with _lock:
        if state["blocked"]:
            return {"ok": False, "error": "Tạm dừng sao lưu để không ghi đè bản sao lưu cũ: lần khôi phục khi khởi động bị lỗi. " + state["last_error"]}
        sig = _sig()
        if not force and sig == _last_sig:
            return {"ok": True, "skipped": True}
        try:
            data = build_archive()
            if len(data) > MAX_ARCHIVE:
                raise RuntimeError(f"Bản sao lưu {len(data) // 1048576} MB vượt giới hạn {MAX_ARCHIVE // 1048576} MB của kho lưu trữ")
            st.put(LATEST, data)
            today = time.strftime("%Y-%m-%d", time.gmtime())
            if state["last_daily"] != today:   # mỗi ngày một bản riêng, quay vòng 7 ngày (daily-0 … daily-6) để cứu khi dữ liệu bị hỏng
                st.put(f"daily-{time.gmtime().tm_wday}.zip", data)
                state["last_daily"] = today
        except Exception as e:   # không để lỗi mạng làm sập ứng dụng; ghi lại để quản trị viên thấy
            state["last_error"] = f"{type(e).__name__}: {str(e)[:200]}"
            return {"ok": False, "error": state["last_error"]}
        _last_sig = sig
        state.update(last_ok=int(time.time()), last_error="", last_size=len(data))
        return {"ok": True, "size": len(data)}


def _safe_extract(data: bytes):
    z = zipfile.ZipFile(io.BytesIO(data))
    names = z.namelist()
    if "lbai.db" not in names:
        raise ValueError("bản sao lưu không có CSDL")
    if sum(i.file_size for i in z.infolist()) > 2 * 1024 ** 3:
        raise ValueError("bản sao lưu quá lớn")
    ok = re.compile(r"^uploads/[A-Za-z0-9._-]{1,100}$")
    for n in names:
        if n != "lbai.db" and not ok.match(n):
            raise ValueError("bản sao lưu chứa đường dẫn không hợp lệ")   # chống ghi ra ngoài thư mục dữ liệu
    os.makedirs(db.UPLOAD_DIR, exist_ok=True)
    tmp_db = db.DB_PATH + ".restore"
    with z.open("lbai.db") as src, open(tmp_db, "wb") as dst:
        shutil.copyfileobj(src, dst)
    chk = sqlite3.connect(tmp_db)
    try:
        if chk.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("CSDL trong bản sao lưu bị hỏng")
    finally:
        chk.close()
    for n in names:
        if n.startswith("uploads/"):
            with z.open(n) as src, open(os.path.join(db.UPLOAD_DIR, n[8:]), "wb") as dst:
                shutil.copyfileobj(src, dst)
    os.replace(tmp_db, db.DB_PATH)   # đặt CSDL vào chỗ cuối cùng, chỉ khi mọi thứ đã hợp lệ


def restore_if_needed():
    """Gọi TRƯỚC db.init(). Chỉ khôi phục khi chưa có CSDL cục bộ (container mới); có đĩa lưu bền thì dữ liệu sẵn đó, không đụng tới."""
    global _last_sig
    st = store()
    state["enabled"] = bool(st)
    state["provider"] = st.provider if st else ""
    if not st:
        return
    if os.path.isfile(db.DB_PATH) and os.path.getsize(db.DB_PATH) > 0:
        state["restored"] = "local"
        return
    try:
        os.makedirs(db.DATA_DIR, exist_ok=True)
        data = st.get(LATEST)
        if data is None:
            state["restored"] = "none"   # chưa có bản sao lưu: hệ thống mới
            return
        _safe_extract(data)
    except Exception as e:
        # KHÔNG được để ứng dụng chạy với CSDL trống rồi sao lưu đè lên bản tốt → chặn sao lưu cho tới khi khởi động lại thành công
        state.update(blocked=True, restored="error", last_error=f"Không khôi phục được: {type(e).__name__}: {str(e)[:160]}")
        _log("CẢNH BÁO:", state["last_error"])
        return
    state["restored"] = "ok"
    _log("Đã khôi phục dữ liệu từ bản sao lưu.")


def mark_clean():
    """Sau khi khôi phục thành công: coi dữ liệu hiện tại đã khớp bản sao lưu, không đẩy lại ngay."""
    global _last_sig
    if state["restored"] == "ok":
        _last_sig = _sig()


def start_loop():
    st = store()
    if not st:
        return
    interval = max(30, int(os.environ.get("LBAI_BACKUP_INTERVAL") or 300))

    def loop():
        while True:
            time.sleep(interval)
            r = run_backup()
            if not r.get("ok"):
                _log("Sao lưu lỗi:", r.get("error"))
    threading.Thread(target=loop, daemon=True, name="lbai-backup").start()


def status() -> dict:
    return {**{k: state[k] for k in ("enabled", "provider", "last_ok", "last_error", "last_size", "restored", "blocked")},
            "interval": int(os.environ.get("LBAI_BACKUP_INTERVAL") or 300)}
