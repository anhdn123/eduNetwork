import sys

# Cửa sổ lệnh Windows có thể dùng bảng mã cũ (cp1252/cp437): ép UTF-8 và không để lỗi in chữ tiếng Việt làm sập server
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from .app import serve  # noqa: E402

if __name__ == "__main__":
    serve(page=sys.argv[1] if len(sys.argv) > 1 else "index.html")
