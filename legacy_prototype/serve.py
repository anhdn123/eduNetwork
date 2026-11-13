"""Server tĩnh cho dự án Learning by AI.
Tự thử lần lượt các cổng; bỏ qua cổng bị Windows chặn (WinError 10013) hoặc đang bận.
Cổng ưu tiên cố định để dữ liệu trình duyệt (ngân hàng câu hỏi) không bị đổi địa chỉ.
"""
import http.server
import os
import sys
import threading
import webbrowser

PORTS = [5500, 5501, 5502, 3000, 3001, 8090, 8100, 9000, 9100]
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # không cache để luôn nhận bản app.js mới nhất
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = False  # trên Windows, reuse cho phép 2 server chiếm cùng cổng


def main():
    page = sys.argv[1] if len(sys.argv) > 1 else "teacher-builder.html"
    for port in PORTS:
        try:
            httpd = Server(("127.0.0.1", port), Handler)
        except OSError as e:
            print(f"Cổng {port} không dùng được ({e.winerror if hasattr(e, 'winerror') else e}), thử cổng khác...")
            continue
        url = f"http://localhost:{port}/{page}"
        print(f"Dang chay server tai {url}")
        print("Nhan Ctrl+C de dung server.")
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        return
    print("Khong tim duoc cong trong nao. Hay dong bot chuong trinh dang dung cong hoac mo truc tiep file HTML.")
    sys.exit(1)


if __name__ == "__main__":
    main()
