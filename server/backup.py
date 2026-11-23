"""Sao lưu / khôi phục dữ liệu ra kho lưu trữ ngoài — để chạy được trên nền tảng có đĩa tạm thời (vd gói free của Render).

Cách hoạt động
  - Khi khởi động: nếu CHƯA có CSDL cục bộ (container mới) thì tải bản sao lưu mới nhất về và giải nén vào thư mục dữ liệu.
  - Khi chạy: cứ 30 phút (LBAI_BACKUP_INTERVAL, mặc định 1800 giây) nếu dữ liệu có thay đổi thì đẩy bản sao lên kho ngoài.
  - Khi tắt (SIGTERM, ví dụ dịch vụ "ngủ"): đẩy bản sao cuối cùng.
  - TIẾT KIỆM BĂNG THÔNG (gói free của Render chỉ cho 5 GB/tháng, lưu lượng đẩy lên kho ngoài cũng bị tính): bản sao gồm
      · `latest.zip` — CSDL SQLite (sao chép nhất quán bằng API backup của SQLite) đã BỎ phần dữ liệu ảnh, kèm `blobs.json` liệt kê các gói bên dưới → rất nhỏ;
      · các gói `img-<số>-<mã>.zip` (ảnh câu hỏi/lời giải) và `up-<số>-<mã>.zip` (file tải lên): mỗi gói bất biến, tên có mã băm nội dung;
        mỗi lần sao lưu chỉ gửi gói MỚI hoặc gói đã đổi — ảnh cũ không bao giờ phải gửi lại.
    Bản sao lưu kiểu cũ (một file zip chứa cả ảnh, không có blobs.json) vẫn khôi phục được.

Chọn kho lưu trữ bằng biến môi trường (khóa/mật khẩu chỉ đặt qua biến môi trường, không ghi vào mã):
  LBAI_BACKUP_DIR=/duong/dan            sao lưu ra một thư mục (ổ gắn ngoài, ổ mạng...)
  LBAI_BACKUP_URL + LBAI_BACKUP_KEY     Supabase Storage (URL dự án + service key); LBAI_BACKUP_BUCKET (mặc định lbai-backup)
"""
import hashlib
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
PACK_BYTES = int(os.environ.get("LBAI_BACKUP_PACK_MB") or 20) * 1024 * 1024   # mỗi gói ảnh/file ~20 MB (nhỏ hơn CHUNK → một đối tượng duy nhất)
DEFAULT_INTERVAL = 1800
CHUNK = int(os.environ.get("LBAI_BACKUP_CHUNK_MB") or 40) * 1024 * 1024   # Supabase gói free giới hạn ~50 MB mỗi file → bản lớn hơn được chia thành nhiều phần
MAX_ARCHIVE = int(os.environ.get("LBAI_BACKUP_MAX_MB") or 900) * 1024 * 1024   # trần tổng dung lượng một bản sao lưu
state = {"enabled": False, "provider": "", "last_ok": None, "last_error": "", "last_size": 0, "restored": None, "blocked": False, "last_daily": None}
_lock = threading.Lock()
_last_sig = None
_remote = None   # tên các gói đã có trên kho (None = chưa biết → đọc từ bản sao lưu trên kho ở lần sao lưu đầu)
_NAME_OK = re.compile(r"^[A-Za-z0-9._-]{1,100}$")


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

    def delete(self, name):
        try:
            os.remove(os.path.join(self.path, name))
        except OSError:
            pass


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
        self._req("POST", f"/storage/v1/object/{urllib.parse.quote(self.bucket)}/{urllib.parse.quote(name)}", data,
                  {"Content-Type": "application/zip", "x-upsert": "true"}).close()

    def delete(self, name):
        try:
            self._req("DELETE", f"/storage/v1/object/{urllib.parse.quote(self.bucket)}/{urllib.parse.quote(name)}").close()
        except Exception:
            pass   # dọn gói cũ chỉ là tiện ích: lỗi thì để lại, không ảnh hưởng sao lưu

    def get(self, name):
        try:
            with self._req("GET", f"/storage/v1/object/authenticated/{urllib.parse.quote(self.bucket)}/{urllib.parse.quote(name)}") as r:
                return r.read()
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace").lower()
            if e.code == 404 or (e.code == 400 and ("not found" in body or "404" in body)):
                return None   # chưa có bản sao lưu nào (hoặc bucket chưa tạo)
            raise


def save(st, name, data):
    """Bản nhỏ: ghi thẳng file zip. Bản lớn: ghi các phần `<name>.partN` rồi ghi vào `<name>` một file chỉ mục JSON (kèm sha256).
    Chỉ mục ghi SAU CÙNG nên người đọc không bao giờ thấy chỉ mục trỏ tới phần chưa có."""
    if len(data) <= CHUNK:
        st.put(name, data)
        return 1
    parts = [data[i:i + CHUNK] for i in range(0, len(data), CHUNK)]
    for i, part in enumerate(parts):
        st.put(f"{name}.part{i}", part)
    st.put(name, json.dumps({"format": "lbai-parts", "parts": len(parts), "size": len(data),
                             "sha256": hashlib.sha256(data).hexdigest()}).encode())
    return len(parts)


def load(st, name):
    """Đọc bản sao lưu (nguyên file hoặc ghép từ các phần); trả None nếu chưa có."""
    head = st.get(name)
    if head is None or head[:2] == b"PK":
        return head
    try:
        m = json.loads(head.decode("utf-8"))
        n, size = int(m["parts"]), int(m["size"])
        if m.get("format") != "lbai-parts" or not 1 <= n <= 200:
            raise ValueError
    except Exception:
        raise ValueError("chỉ mục bản sao lưu không hợp lệ")
    buf = bytearray()
    for i in range(n):
        part = st.get(f"{name}.part{i}")
        if part is None:
            raise ValueError(f"thiếu phần {i} của bản sao lưu")
        buf += part
    data = bytes(buf)
    if len(data) != size or hashlib.sha256(data).hexdigest() != m.get("sha256"):
        raise ValueError("các phần của bản sao lưu không khớp nhau (có thể đang ghi dở)")
    return data


def store():
    d = os.environ.get("LBAI_BACKUP_DIR")
    if d:
        return DirStore(d)
    url, key = os.environ.get("LBAI_BACKUP_URL"), os.environ.get("LBAI_BACKUP_KEY")
    if url and key:
        return SupabaseStore(url, key, os.environ.get("LBAI_BACKUP_BUCKET") or "lbai-backup")
    return None


def build_archive() -> bytes:
    """Bản sao lưu KIỂU CŨ (một file zip chứa cả ảnh trong CSDL và thư mục uploads). Không còn dùng để sao lưu; giữ lại để kiểm thử khả năng khôi phục bản cũ."""
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


def _pack_plan(items):
    """items: [(tên, kích thước)] đã sắp thứ tự ổn định → các gói [{members, h}] mỗi gói ≤ PACK_BYTES; mã băm tính từ (tên, kích thước) vì ảnh/file không bao giờ đổi nội dung."""
    packs, cur, size = [], [], 0
    for name, n in items:
        if cur and size + n > PACK_BYTES:
            packs.append(cur)
            cur, size = [], 0
        cur.append((name, n))
        size += n
    if cur:
        packs.append(cur)
    return [{"members": m, "h": hashlib.sha256("\n".join(f"{x}:{y}" for x, y in m).encode()).hexdigest()[:12]} for m in packs]


def _snapshot(tmp):
    """Chụp CSDL nhất quán rồi BỎ dữ liệu ảnh khỏi bản chụp (ảnh nằm ở các gói riêng) và thu gọn file."""
    snap = os.path.join(tmp, "lbai.db")
    src, dst = sqlite3.connect(db.DB_PATH, timeout=30), sqlite3.connect(snap)
    try:
        src.backup(dst)
    finally:
        src.close()
    try:
        dst.execute("UPDATE images SET data = x''")
        dst.commit()
        dst.execute("VACUUM")
    finally:
        dst.close()
    return snap


def _plan_blobs():
    """Danh sách ảnh (trong CSDL) và file tải lên hiện có, chia thành gói: {"img": [...], "up": [...]}."""
    con = sqlite3.connect(db.DB_PATH, timeout=30)
    try:
        imgs = [(r[0], r[1]) for r in con.execute("SELECT id, length(data) FROM images ORDER BY created_at, id")]
    finally:
        con.close()
    ups = []
    if os.path.isdir(db.UPLOAD_DIR):
        for n in sorted(os.listdir(db.UPLOAD_DIR)):
            p = os.path.join(db.UPLOAD_DIR, n)
            if os.path.isfile(p) and _NAME_OK.match(n):
                ups.append((n, os.path.getsize(p)))
    out = {}
    for kind, items in (("img", imgs), ("up", ups)):
        plan = _pack_plan(items)
        for i, pk in enumerate(plan):
            pk["name"] = f"{kind}-{i}-{pk['h']}.zip"
        out[kind] = plan
    return out


def _build_pack(kind, pk):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:   # ảnh JPEG/PNG đã nén sẵn nên không nén lại
        if kind == "img":
            con = sqlite3.connect(db.DB_PATH, timeout=30)
            try:
                for name, _ in pk["members"]:
                    r = con.execute("SELECT data FROM images WHERE id=?", (name,)).fetchone()
                    if r is not None:
                        z.writestr(name, bytes(r[0]))
            finally:
                con.close()
        else:
            for name, _ in pk["members"]:
                p = os.path.join(db.UPLOAD_DIR, name)
                if os.path.isfile(p):
                    z.write(p, name)
    return buf.getvalue()


def _core_zip(snap, manifest):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.write(snap, "lbai.db")
        z.writestr("blobs.json", json.dumps(manifest, ensure_ascii=False))
    return buf.getvalue()


def _manifest_of(data):
    """Đọc blobs.json trong latest.zip (None nếu là bản kiểu cũ hoặc không đọc được)."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            return json.loads(z.read("blobs.json").decode("utf-8")) if "blobs.json" in z.namelist() else None
    except Exception:
        return None


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
    """Đẩy bản sao lưu: gói ảnh/file MỚI trước, rồi `latest.zip` (nhỏ), sau cùng mới dọn gói cũ — nên người khôi phục không bao giờ thấy chỉ mục trỏ tới gói chưa có."""
    global _last_sig, _remote
    st = store()
    if not st:
        return {"ok": False, "error": "Chưa cấu hình kho sao lưu"}
    with _lock:
        if state["blocked"]:
            return {"ok": False, "error": "Tạm dừng sao lưu để không ghi đè bản sao lưu cũ: lần khôi phục khi khởi động bị lỗi. " + state["last_error"]}
        sig = _sig()
        if not force and sig == _last_sig:
            return {"ok": True, "skipped": True}
        tmp = tempfile.mkdtemp(prefix="lbai_snap_")
        try:
            st.prepare()
            if _remote is None:   # chưa biết kho đang có gói nào (vd khởi động với đĩa còn dữ liệu) → đọc chỉ mục từ bản sao lưu trên kho
                try:
                    head = load(st, LATEST)
                    m = _manifest_of(head) if head else None
                    _remote = {x["n"] for k in ("img", "up") for x in (m or {}).get(k, [])}
                except Exception:
                    _remote = set()
            plan = _plan_blobs()
            sent = 0
            for kind in ("img", "up"):
                for pk in plan[kind]:
                    if pk["name"] in _remote:
                        continue
                    data = _build_pack(kind, pk)
                    sent += len(data)
                    save(st, pk["name"], data)   # tên có mã băm nội dung → không bao giờ ghi đè gói cũ
                    _remote.add(pk["name"])
            manifest = {k: [{"n": pk["name"], "h": pk["h"], "c": len(pk["members"])} for pk in plan[k]] for k in ("img", "up")}
            core = _core_zip(_snapshot(tmp), manifest)
            total = sent + len(core)
            if total > MAX_ARCHIVE:
                raise RuntimeError(f"Bản sao lưu {total // 1048576} MB vượt giới hạn {MAX_ARCHIVE // 1048576} MB của kho lưu trữ")
            save(st, LATEST, core)
            today = time.strftime("%Y-%m-%d", time.gmtime())
            if state["last_daily"] != today:   # mỗi ngày một bản riêng, quay vòng 7 ngày (daily-0 … daily-6) để cứu khi dữ liệu bị hỏng
                save(st, f"daily-{time.gmtime().tm_wday}.zip", core)
                state["last_daily"] = today
            live = {x["n"] for k in ("img", "up") for x in manifest[k]}   # dọn gói không còn được chỉ mục nhắc tới (ảnh đã xóa / gói đã thay thế)
            for old in sorted(_remote - live):
                if hasattr(st, "delete"):
                    st.delete(old)
            _remote &= live
            total = sent + len(core)
        except Exception as e:   # không để lỗi mạng làm sập ứng dụng; ghi lại để quản trị viên thấy
            state["last_error"] = f"{type(e).__name__}: {str(e)[:200]}"
            return {"ok": False, "error": state["last_error"]}
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        _last_sig = sig
        state.update(last_ok=int(time.time()), last_error="", last_size=total)
        return {"ok": True, "size": total, "sent": sent}


def _safe_extract(data: bytes, st=None):
    z = zipfile.ZipFile(io.BytesIO(data))
    names = z.namelist()
    if "lbai.db" not in names:
        raise ValueError("bản sao lưu không có CSDL")
    if sum(i.file_size for i in z.infolist()) > 2 * 1024 ** 3:
        raise ValueError("bản sao lưu quá lớn")
    ok = re.compile(r"^uploads/[A-Za-z0-9._-]{1,100}$")
    for n in names:
        if n not in ("lbai.db", "blobs.json") and not ok.match(n):
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
        if n.startswith("uploads/"):   # bản kiểu cũ: file tải lên nằm ngay trong zip
            with z.open(n) as src, open(os.path.join(db.UPLOAD_DIR, n[8:]), "wb") as dst:
                shutil.copyfileobj(src, dst)
    packs = set()
    if "blobs.json" in names:   # bản kiểu mới: ảnh và file tải lên nằm ở các gói riêng
        try:
            m = json.loads(z.read("blobs.json").decode("utf-8"))
            lst = [(k, x["n"]) for k in ("img", "up") for x in m.get(k, [])]
        except Exception:
            raise ValueError("chỉ mục gói ảnh không hợp lệ")
        if st is None:
            raise ValueError("thiếu kho lưu trữ để tải các gói ảnh")
        con = sqlite3.connect(tmp_db)
        try:
            for kind, pname in lst:
                if not _NAME_OK.match(pname):
                    raise ValueError("tên gói không hợp lệ")
                blob = load(st, pname)
                if blob is None:
                    raise ValueError(f"thiếu gói {pname} trên kho lưu trữ")
                pz = zipfile.ZipFile(io.BytesIO(blob))
                for mem in pz.namelist():
                    if not _NAME_OK.match(mem):
                        raise ValueError("gói chứa tên tệp không hợp lệ")
                    if kind == "img":
                        con.execute("UPDATE images SET data=? WHERE id=?", (pz.read(mem), mem))
                    else:
                        with open(os.path.join(db.UPLOAD_DIR, mem), "wb") as dst:
                            dst.write(pz.read(mem))
                packs.add(pname)
            con.commit()
        finally:
            con.close()
    os.replace(tmp_db, db.DB_PATH)   # đặt CSDL vào chỗ cuối cùng, chỉ khi mọi thứ đã hợp lệ
    return packs


def restore_if_needed():
    """Gọi TRƯỚC db.init(). Chỉ khôi phục khi chưa có CSDL cục bộ (container mới); có đĩa lưu bền thì dữ liệu sẵn đó, không đụng tới."""
    global _last_sig, _remote
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
        data = load(st, LATEST)
        if data is None:
            state["restored"] = "none"   # chưa có bản sao lưu: hệ thống mới
            return
        _remote = _safe_extract(data, st)
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
    interval = max(30, int(os.environ.get("LBAI_BACKUP_INTERVAL") or DEFAULT_INTERVAL))

    def loop():
        while True:
            time.sleep(interval)
            r = run_backup()
            if not r.get("ok"):
                _log("Sao lưu lỗi:", r.get("error"))
    threading.Thread(target=loop, daemon=True, name="lbai-backup").start()


def status() -> dict:
    return {**{k: state[k] for k in ("enabled", "provider", "last_ok", "last_error", "last_size", "restored", "blocked")},
            "interval": int(os.environ.get("LBAI_BACKUP_INTERVAL") or DEFAULT_INTERVAL)}
