"""Bảo mật: băm mật khẩu (scrypt), token phiên, tạo mật khẩu ngẫu nhiên, giới hạn đăng nhập sai."""
import hashlib
import hmac
import secrets
import time
import unicodedata
import re

SCRYPT_N, SCRYPT_R, SCRYPT_P = 2 ** 14, 8, 1
SESSION_TTL = 7 * 24 * 3600
# Bảng ký tự không gây nhầm lẫn (bỏ 0/O, 1/l/I) để học sinh dễ gõ mật khẩu được cấp
PW_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${h.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, h = stored.split("$")
        if algo != "scrypt":
            return False
        calc = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(calc.hex(), h)
    except Exception:
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def random_password(length: int = 8) -> str:
    return "".join(secrets.choice(PW_ALPHABET) for _ in range(length))


def password_problem(pw: str):
    """Trả về lý do mật khẩu không hợp lệ, hoặc None nếu hợp lệ."""
    if not isinstance(pw, str) or len(pw) < 8:
        return "Mật khẩu cần tối thiểu 8 ký tự"
    if len(pw) > 100:
        return "Mật khẩu quá dài"
    return None


def slug_username(name: str) -> str:
    """'Nguyễn Văn An' -> 'an.nv' (tên + chữ cái đầu họ và đệm), không dấu."""
    s = unicodedata.normalize("NFD", name.replace("đ", "d").replace("Đ", "D"))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    parts = [p for p in re.split(r"[^a-z0-9]+", s) if p]
    if not parts:
        return "hs"
    return parts[-1] + ("." + "".join(p[0] for p in parts[:-1]) if len(parts) > 1 else "")


class RateLimiter:
    """Giới hạn đăng nhập sai: quá `limit` lần trong `window` giây thì khóa `lock` giây."""

    def __init__(self, limit=8, window=600, lock=300):
        self.limit, self.window, self.lock = limit, window, lock
        self.fails = {}
        self.locked = {}

    def blocked(self, key):
        t = self.locked.get(key)
        if t and t > time.time():
            return int(t - time.time())
        return 0

    def fail(self, key):
        now = time.time()
        arr = [x for x in self.fails.get(key, []) if now - x < self.window] + [now]
        self.fails[key] = arr
        if len(arr) >= self.limit:
            self.locked[key] = now + self.lock
            self.fails[key] = []

    def ok(self, key):
        self.fails.pop(key, None)
        self.locked.pop(key, None)
