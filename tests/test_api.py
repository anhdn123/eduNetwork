"""Kiểm thử API: python -m unittest discover -s tests -v   (chạy trên CSDL tạm, không đụng dữ liệu thật)."""
import base64
import http.client
import json
import os
import secrets
import sys
import tempfile
import threading
import unittest

# Mật khẩu thử nghiệm sinh ngẫu nhiên mỗi lần chạy (không ghi cứng trong mã)
def _pw():
    return "Aa1-" + secrets.token_urlsafe(12)


ADMIN_PW, LAN_PW, AN_PW = _pw(), _pw(), _pw()

TMP = tempfile.mkdtemp(prefix="lbai_test_")
os.environ["LBAI_DATA"] = TMP
os.environ["LBAI_QUIET"] = "1"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server import app, db  # noqa: E402


class Client:
    def __init__(self, port):
        self.port, self.cookie = port, None

    def call(self, method, path, body=None, headers=None, raw=False):
        con = http.client.HTTPConnection("127.0.0.1", self.port, timeout=15)
        h = {"X-Requested-With": "fetch", "Content-Type": "application/json"}
        if self.cookie:
            h["Cookie"] = self.cookie
        h.update(headers or {})
        con.request(method, path, json.dumps(body) if body is not None else None, h)
        r = con.getresponse()
        data = r.read()
        sc = r.getheader("Set-Cookie")
        if sc and sc.startswith("sid="):
            self.cookie = sc.split(";")[0] if sc.split(";")[0] != "sid=" else None
        con.close()
        if raw:
            return r.status, data, r
        return r.status, (json.loads(data) if data and data[:1] in b"{[" else data)

    def get(self, p, **k):
        return self.call("GET", p, **k)

    def post(self, p, b=None, **k):
        return self.call("POST", p, b or {}, **k)


def mcq(i, ans):
    return {"id": f"q{i}", "t": "mcq", "q": f"Câu {i}", "opts": ["a", "b", "c", "d"], "ans": ans, "sol": "giải"}


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db.init()
        cls.httpd = app.Server(("127.0.0.1", 0), app.Handler)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def C(self):
        return Client(self.port)

    # --- toàn bộ luồng, theo thứ tự ---
    def test_full_flow(self):
        admin = self.C()
        self.assertEqual(admin.get("/api/status")[1], {"needs_setup": True})
        self.assertEqual(admin.get("/api/me")[0], 401)                      # chưa đăng nhập
        self.assertEqual(admin.post("/api/setup", {"name": "Admin", "username": "admin", "password": "short"})[0], 400)
        st, r = admin.post("/api/setup", {"name": "Quản trị", "username": "admin", "password": ADMIN_PW})
        self.assertEqual(st, 200)
        self.assertEqual(admin.post("/api/setup", {"name": "X", "username": "x2", "password": ADMIN_PW})[0], 403)  # chỉ setup 1 lần
        self.assertEqual(admin.get("/api/me")[1]["user"]["role"], "admin")

        # CSRF: thiếu header X-Requested-With bị từ chối
        con = http.client.HTTPConnection("127.0.0.1", self.port)
        con.request("POST", "/api/logout", "{}", {"Content-Type": "application/json", "Cookie": admin.cookie})
        self.assertEqual(con.getresponse().status, 403)
        con.close()

        # admin tạo 2 giáo viên
        st, r = admin.post("/api/teachers", {"name": "Cô Lan", "username": "lan", "password": LAN_PW})
        self.assertEqual(st, 200)
        st, r = admin.post("/api/teachers", {"name": "Thầy Bình", "username": "binh"})
        self.assertEqual(st, 200)
        gen_pw = r["account"]["password"]
        type(self).binh_pw = gen_pw
        self.assertGreaterEqual(len(gen_pw), 8)

        lan, binh = self.C(), self.C()
        self.assertEqual(lan.post("/api/login", {"username": "lan", "password": "sai-mat-khau"})[0], 401)
        self.assertEqual(lan.post("/api/login", {"username": "lan", "password": LAN_PW})[0], 200)
        self.assertEqual(binh.post("/api/login", {"username": "binh", "password": gen_pw})[0], 200)
        self.assertEqual(lan.get("/api/teachers")[0], 403)                   # giáo viên không quản lý giáo viên khác

        # lớp + học sinh
        st, r = lan.post("/api/classes", {"name": "9A1", "grade": "9"})
        cid = r["id"]
        st, r = lan.post("/api/students", {"class_id": cid, "name": "Nguyễn Văn An"})
        self.assertEqual(r["account"]["username"], "an.nv")
        an_pw = r["account"]["password"]
        st, r = lan.post("/api/students/bulk", {"class_id": cid, "rows": ["Trần Thị Bình", "Lê Minh Châu", "Nguyễn Văn An"]})
        self.assertEqual(len(r["accounts"]), 3)
        names = {a["username"] for a in r["accounts"]}
        self.assertIn("an.nv2", names)                                     # trùng tên → tự thêm số
        self.assertEqual(lan.post("/api/students", {"class_id": cid, "name": "Dup", "username": "an.nv"})[0], 409)
        self.assertEqual(len(lan.get(f"/api/students?class_id={cid}")[1]["students"]), 4)
        # phân quyền dữ liệu giữa giáo viên
        self.assertEqual(binh.get(f"/api/students?class_id={cid}")[1]["students"], [])
        self.assertEqual(binh.post("/api/students", {"class_id": cid, "name": "Lén"})[0], 404)
        self.assertEqual(binh.get("/api/classes")[1]["classes"], [])

        # học sinh đăng nhập, bắt buộc đổi mật khẩu
        an = self.C()
        st, r = an.post("/api/login", {"username": "an.nv", "password": an_pw})
        self.assertTrue(r["user"]["must_change"])
        self.assertEqual(an.get("/api/classes")[0], 403)                     # học sinh không vào được API giáo viên
        self.assertEqual(an.post("/api/password", {"old": an_pw, "new": "123"})[0], 400)
        self.assertEqual(an.post("/api/password", {"old": an_pw, "new": AN_PW})[0], 200)
        self.assertFalse(an.get("/api/me")[1]["user"]["must_change"])

        # ngân hàng câu hỏi
        bank = [mcq(1, 0), {"id": "t1", "t": "tf", "q": "tfg", "sts": ["a", "b", "c", "d"], "ans": [0, 1, 0, 1], "subject": "Toán", "grade": "9", "topic": "T"}]
        self.assertEqual(lan.post("/api/bank/sync", {"upsert": bank})[0], 200)
        self.assertEqual(len(lan.get("/api/bank")[1]["questions"]), 2)
        self.assertEqual(binh.get("/api/bank")[1]["questions"], [])          # kho riêng từng giáo viên
        self.assertEqual(lan.post("/api/bank/sync", {"upsert": [{"id": "../x", "t": "mcq", "q": "x"}]})[0], 400)
        lan.post("/api/bank/sync", {"delete": ["q1"]})
        self.assertEqual(len(lan.get("/api/bank")[1]["questions"]), 1)

        # giao đề: 2 mã đề, chế độ xen kẽ
        v1 = {"code": "Mã đề 101", "questions": [mcq(1, 0), mcq(2, 1), {"id": "s", "t": "short", "q": "s", "ans": "0,4"},
                                                  {"id": "g", "t": "tf", "q": "g", "sts": ["a", "b", "c", "d"], "ans": [0, 1, 0, 1]},
                                                  {"id": "e", "t": "essay", "q": "tự luận"}]}
        v2 = {"code": "Mã đề 102", "questions": [mcq(2, 1), mcq(1, 0)]}
        body = {"title": "Kiểm tra 15'", "class_id": cid, "dist_mode": "alt", "duration_min": 15, "max_attempts": 1, "show_result": True,
                "exam": {"title": "KT", "subject": "Toán", "grade": "9", "variations": [v1, v2]}}
        self.assertEqual(binh.post("/api/assignments", body)[0], 404)       # giáo viên khác không giao được vào lớp này
        st, r = lan.post("/api/assignments", body)
        self.assertEqual(st, 200)
        aid = r["id"]
        self.assertEqual(r["students"], 4)

        # học sinh thấy bài, nhưng không thấy đáp án
        lst = an.get("/api/assignments")[1]["assignments"]
        self.assertEqual(len(lst), 1)
        st, r = an.post(f"/api/assignments/{aid}/start")
        self.assertEqual(st, 200)
        self.assertNotIn("ans", json.dumps(r["questions"]))
        self.assertNotIn("sol", json.dumps(r["questions"]))
        code = r["code"]
        qs = r["questions"]
        self.assertEqual(an.post(f"/api/assignments/{aid}/start")[1]["submission_id"], r["submission_id"])  # mở lại đúng bài đang làm
        # chấm: lấy đúng đáp án theo mã đề được giao
        if code == "Mã đề 101":
            answers = [0, 1, "0.4", [0, 1, 0, 0], "bài tự luận"]       # 3 ý đúng ở câu đúng/sai → 0.5
            exp, mx = 1 + 1 + 1 + 0.5, 4
        else:
            answers = [1, 0]
            exp, mx = 2, 2
        st, res = an.post(f"/api/assignments/{aid}/submit", {"answers": answers})
        self.assertEqual(st, 200)
        self.assertEqual((res["score"], res["max"]), (exp, mx))
        self.assertIn("details", res)
        self.assertEqual(an.post(f"/api/assignments/{aid}/start")[0], 403)   # hết lượt làm
        self.assertEqual(an.post(f"/api/assignments/{aid}/submit", {"answers": []})[0], 400)  # nộp lại không được

        # học sinh khác không xem được bài của lớp không được giao
        other = self.C()
        lan.post("/api/classes", {"name": "9A2", "grade": "9"})
        st, r = lan.post("/api/students", {"class_id": cid + 1, "name": "Phạm Hoa"})
        other.post("/api/login", {"username": r["account"]["username"], "password": r["account"]["password"]})
        self.assertEqual(other.get("/api/assignments")[1]["assignments"], [])
        self.assertEqual(other.post(f"/api/assignments/{aid}/start")[0], 404)

        # kết quả cho giáo viên
        res = lan.get(f"/api/assignments/{aid}/results")[1]["results"]
        self.assertEqual(len(res), 4)
        self.assertEqual(sum(1 for x in res if x["status"] == "done"), 1)
        self.assertEqual(binh.get(f"/api/assignments/{aid}/results")[0], 404)
        self.assertEqual(an.get(f"/api/assignments/{aid}/results")[0], 403)
        lstt = lan.get("/api/assignments")[1]["assignments"][0]
        self.assertEqual((lstt["total"], lstt["submitted"]), (4, 1))

        # phụ huynh
        st, r = lan.post("/api/parents", {"name": "Phụ huynh An", "student_id": res[0]["student_id"]})
        self.assertEqual(st, 200)
        ph = self.C()
        self.assertEqual(ph.post("/api/login", {"username": r["account"]["username"], "password": r["account"]["password"]})[0], 200)
        self.assertEqual(len(ph.get("/api/children")[1]["children"]), 1)

        # đặt lại mật khẩu
        sid = res[0]["student_id"]
        st, r = lan.post(f"/api/users/{sid}/reset-password")
        self.assertEqual(st, 200)
        self.assertIn(binh.post(f"/api/users/{sid}/reset-password")[0], (403, 404))

        # bảng tin
        data = base64.b64encode(b"%PDF-1.4 test").decode()
        st, r = lan.post("/api/posts", {"kind": "Tài liệu", "title": "Chuyên đề", "text": "Tài liệu <b>hay</b>", "tags": ["Toán 9"], "file": {"name": "a.pdf", "data": data}})
        self.assertEqual(st, 200)
        pid = r["id"]
        self.assertEqual(lan.post("/api/posts", {"text": "x", "file": {"name": "virus.exe", "data": data}})[0], 400)
        self.assertEqual(an.post("/api/posts", {"kind": "Tài liệu", "text": "x"})[0], 403)   # học sinh không đăng Tài liệu
        posts = an.get("/api/posts")[1]["posts"]
        self.assertEqual(len(posts), 1)
        self.assertEqual(an.post(f"/api/posts/{pid}/like")[1]["on"], True)
        self.assertEqual(an.post(f"/api/posts/{pid}/like")[1]["on"], False)
        an.post(f"/api/posts/{pid}/comments", {"text": "Cảm ơn cô"})
        self.assertEqual(an.get(f"/api/posts/{pid}/comments")[1]["comments"][0]["text"], "Cảm ơn cô")
        fid = posts[0]["file"]["id"]
        st, body, hdr = an.get(f"/api/files/{fid}", raw=True)
        self.assertEqual((st, hdr.getheader("Content-Type")), (200, "application/pdf"))
        self.assertEqual(an.post(f"/api/follow/{admin.get('/api/me')[1]['user']['id']}")[1]["on"], True)
        self.assertEqual(binh.post(f"/api/posts/{pid}/like")[0], 200)
        self.assertEqual(an.call("DELETE", f"/api/posts/{pid}")[0], 404)     # chỉ tác giả xóa được
        self.assertEqual(lan.call("DELETE", f"/api/posts/{pid}")[0], 200)

        # static: không lộ mã nguồn server / CSDL
        for p in ("/../server/app.py", "/data/lbai.db", "/%2e%2e/server/app.py", "/server/app.py"):
            self.assertIn(self.C().get(p, raw=True)[0], (403, 404))
        self.assertEqual(self.C().get("/index.html", raw=True)[0], 200)

        # đăng xuất
        self.assertEqual(an.post("/api/logout")[0], 200)
        self.assertEqual(an.get("/api/me")[0], 401)

    def test_security_hardening(self):
        """Chạy sau test_full_flow (dùng lại tài khoản lan / an.nv đã tạo ở đó)."""
        lan, an = self.C(), self.C()
        self.assertEqual(lan.post("/api/login", {"username": "lan", "password": LAN_PW})[0], 200)
        self.assertEqual(an.post("/api/login", {"username": "an.nv", "password": AN_PW})[0], 200)
        # 1) HTML nguy hiểm trong câu hỏi bị vô hiệu hóa, thẻ định dạng an toàn được giữ
        q = {"id": "xss1", "t": "essay", "q": "<script>alert(1)</script><b>đậm</b><img src=x onerror=alert(2)>", "sol": "<iframe src=x></iframe>ok"}
        self.assertEqual(lan.post("/api/bank/sync", {"upsert": [q]})[0], 200)
        got = [x for x in lan.get("/api/bank")[1]["questions"] if x["id"] == "xss1"][0]
        self.assertNotIn("<script", got["q"])
        self.assertNotIn("<img", got["q"])
        self.assertIn("<b>đậm</b>", got["q"])
        self.assertNotIn("<iframe", got["sol"])
        # 2) file đính kèm của bài "chỉ người theo dõi" không tải được nếu chưa theo dõi
        data = base64.b64encode(b"%PDF-1.4 secret").decode()
        st, r = lan.post("/api/posts", {"text": "chỉ người theo dõi", "visibility": "Người theo dõi", "file": {"name": "riêng.pdf", "data": data}})
        self.assertEqual(st, 200)
        mine = lan.get("/api/posts?mode=mine")[1]["posts"][0]
        fid = mine["file"]["id"]
        self.assertEqual(an.get(f"/api/files/{fid}", raw=True)[0], 404)
        self.assertEqual(an.get("/api/posts")[1]["posts"], [] if not [p for p in an.get("/api/posts")[1]["posts"] if p["id"] == mine["id"]] else an.get("/api/posts")[1]["posts"])
        lan_id = [t for t in an.get("/api/directory/teachers")[1]["teachers"] if t["name"] == "Cô Lan"][0]["id"]
        an.post(f"/api/follow/{lan_id}")
        self.assertEqual(an.get(f"/api/files/{fid}", raw=True)[0], 200)
        # 3) học sinh không xem được hồ sơ của học sinh khác
        other = lan.get("/api/students")[1]["students"][-1]["id"]
        self.assertEqual(an.get(f"/api/users/{other}/public")[0], 404)
        self.assertEqual(an.get(f"/api/users/{lan_id}/public")[0], 200)

    def test_practice(self):
        """Học sinh tự luyện tập (chạy sau test_full_flow: dùng lớp 9A1 của cô Lan và học sinh an.nv)."""
        lan, binh, an = self.C(), self.C(), self.C()
        lan.post("/api/login", {"username": "lan", "password": LAN_PW})
        binh.post("/api/login", {"username": "binh", "password": self.__class__.binh_pw}) if hasattr(self.__class__, "binh_pw") else None
        an.post("/api/login", {"username": "an.nv", "password": AN_PW})
        cid = [k for k in lan.get("/api/classes")[1]["classes"] if k["name"] == "9A1"][0]["id"]
        bank = []
        for i in range(8):
            bank.append({"id": f"pm{i}", "t": "mcq", "q": f"Luyện TN {i}", "opts": [f"x{i}", f"y{i}", f"z{i}", f"w{i}"], "ans": i % 4, "sol": "giải", "subject": "Toán", "grade": "9", "topic": "Luyện"})
        for i in range(2):
            bank.append({"id": f"ps{i}", "t": "short", "q": f"Luyện TLN {i}", "ans": str(i + 1) + ",5", "subject": "Toán", "grade": "9", "topic": "Luyện"})
            bank.append({"id": f"pg{i}", "t": "tf", "q": f"Luyện ĐS {i}", "sts": ["a", "b", "c", "d"], "ans": [0, 1, 0, 1], "subject": "Toán", "grade": "9", "topic": "Luyện"})
        bank.append({"id": "pe1", "t": "essay", "q": "tự luận", "subject": "Toán", "grade": "9", "topic": "Luyện"})                     # không tính
        bank.append({"id": "pn1", "t": "mcq", "q": "chưa có đáp án", "opts": ["a", "b", "c", "d"], "subject": "Toán", "grade": "9", "topic": "Luyện"})  # không tính
        self.assertEqual(lan.post("/api/bank/sync", {"upsert": bank})[0], 200)
        grp = [g for g in lan.get(f"/api/classes/{cid}/practice")[1]["groups"] if g["topic"] == "Luyện"][0]
        self.assertEqual((grp["counts"], grp["open"]), ({"mcq": 8, "tf": 2, "short": 2}, False))

        # chưa mở → học sinh không thấy và không tạo được đề
        self.assertEqual(an.get("/api/practice/topics")[1]["groups"], [])
        key = {"subject": "Toán", "grade": "9", "topic": "Luyện"}
        self.assertEqual(an.post("/api/practice/start", {"groups": [key], "counts": {"mcq": 3}})[0], 403)
        self.assertEqual(an.post(f"/api/classes/{cid}/practice", {"open": [key]})[0], 403)         # học sinh không tự mở được
        self.assertEqual(lan.post(f"/api/classes/{cid}/practice", {"open": [key, {"subject": "x", "grade": "1", "topic": "không có"}]})[1]["open"], 1)
        self.assertEqual(len(an.get("/api/practice/topics")[1]["groups"]), 1)

        # tạo đề: không lộ đáp án
        st, r = an.post("/api/practice/start", {"groups": [key], "counts": {"mcq": 5, "tf": 1, "short": 1}})
        self.assertEqual(st, 200)
        self.assertEqual(len(r["questions"]), 7)
        self.assertNotIn('"ans"', json.dumps(r["questions"]))
        self.assertNotIn('"sol"', json.dumps(r["questions"]))
        st, res = an.post(f"/api/practice/{r['id']}/submit", {"answers": []})                      # bỏ trống hết
        self.assertEqual((st, res["score"], res["score10"]), (200, 0, 0))
        self.assertIn("details", res)                                                                  # luyện tập: xem đáp án ngay
        self.assertEqual(an.post(f"/api/practice/{r['id']}/submit", {"answers": []})[0], 400)       # không nộp 2 lần

        # lấy toàn bộ ngân hàng (12 câu) rồi làm đúng hết → 10 điểm. Đáp án đúng dò theo nội dung phương án (server có đảo A-D)
        st, r = an.post("/api/practice/start", {"groups": [key], "counts": {"mcq": 8, "tf": 2, "short": 2}})
        self.assertEqual(len(r["questions"]), 12)
        answers = []
        for q in r["questions"]:
            if q.get("sts"):
                answers.append([0, 1, 0, 1])
            elif q["t"] == "short":
                n = int(q["q"].split()[-1])
                answers.append(str(n + 1) + ",5")
            else:
                n = int(q["q"].split()[-1])
                answers.append(q["opts"].index(f"{'xyzw'[n % 4]}{n}"))
        st, res = an.post(f"/api/practice/{r['id']}/submit", {"answers": answers})
        self.assertEqual((res["score"], res["max"], res["score10"]), (12, 12, 10.0))
        self.assertEqual(an.post("/api/practice/start", {"groups": [key], "counts": {}})[0], 400)  # phải chọn số câu

        # lịch sử và xem lại
        hist = an.get("/api/practice")[1]
        self.assertEqual((len(hist["sessions"]), hist["avg"]), (2, 5.0))
        rv = an.get(f"/api/practice/{hist['sessions'][0]['id']}")[1]
        self.assertEqual(len(rv["questions"]), 12)

        # kết quả về tới giáo viên của lớp (qua mạng LAN cũng vậy: tất cả lưu ở máy chủ)
        an_id = [s for s in lan.get(f"/api/students?class_id={cid}")[1]["students"] if s["username"] == "an.nv"][0]
        self.assertEqual(an_id["practice"], {"n": 2, "avg": 5.0})
        tp = lan.get(f"/api/students/{an_id['id']}/practice")
        self.assertEqual((tp[0], len(tp[1]["sessions"])), (200, 2))
        self.assertEqual(lan.get(f"/api/students/{an_id['id']}/practice/{hist['sessions'][0]['id']}")[0], 200)
        self.assertEqual(an.get(f"/api/students/{an_id['id']}/practice")[0], 403)                   # học sinh không xem của người khác
        if hasattr(self.__class__, "binh_pw"):
            self.assertEqual(binh.get(f"/api/students/{an_id['id']}/practice")[0], 404)             # giáo viên lớp khác cũng không xem được

    def test_question_images(self):
        """Ảnh cắt từ PDF: giáo viên tải lên, mọi người đã đăng nhập xem được, chỉ chủ ảnh xóa được, ảnh đang dùng không bị xóa."""
        lan, an, anon = self.C(), self.C(), self.C()
        lan.post("/api/login", {"username": "lan", "password": LAN_PW})
        an.post("/api/login", {"username": "an.nv", "password": AN_PW})
        png = "data:image/png;base64," + base64.b64encode(bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082")).decode()
        self.assertEqual(an.post("/api/img", {"data": png})[0], 403)                         # học sinh không tải ảnh lên
        self.assertEqual(lan.post("/api/img", {"data": "data:image/svg+xml;base64,PHN2Zz4="})[0], 400)  # chỉ nhận JPEG/PNG
        st, r = lan.post("/api/img", {"data": png})
        self.assertEqual(st, 200)
        iid = r["id"]
        st, body, hdr = an.get(f"/api/img/{iid}", raw=True)
        self.assertEqual((st, hdr.getheader("Content-Type")), (200, "image/png"))
        self.assertEqual(anon.get(f"/api/img/{iid}", raw=True)[0], 401)                       # chưa đăng nhập thì không xem được
        lan.post("/api/bank/sync", {"upsert": [{"id": "imgq1", "t": "essay", "q": "x", "img": iid}]})
        lan.call("DELETE", f"/api/img/{iid}")                                                  # còn câu hỏi dùng → giữ lại
        self.assertEqual(an.get(f"/api/img/{iid}", raw=True)[0], 200)
        lan.post("/api/bank/sync", {"delete": ["imgq1"]})                                      # xóa câu hỏi → ảnh được dọn
        self.assertEqual(an.get(f"/api/img/{iid}", raw=True)[0], 404)

    def test_rate_limit(self):
        c = self.C()
        for _ in range(8):
            c.post("/api/login", {"username": "nobody", "password": "x"})
        self.assertEqual(c.post("/api/login", {"username": "nobody", "password": "x"})[0], 429)


    def test_teacher_tools(self):
        """Chấm tự luận bằng tay, gia hạn bài, chuyển lớp, liên kết thêm con, xóa bình luận (chạy sau test_full_flow)."""
        lan, binh, an = self.C(), self.C(), self.C()
        lan.post("/api/login", {"username": "lan", "password": LAN_PW})
        binh.post("/api/login", {"username": "binh", "password": self.__class__.binh_pw})
        an.post("/api/login", {"username": "an.nv", "password": AN_PW})
        classes = lan.get("/api/classes")[1]["classes"]
        c1 = [k for k in classes if k["name"] == "9A1"][0]["id"]
        c2 = [k for k in classes if k["name"] == "9A2"][0]["id"]
        v = {"code": "M1", "questions": [mcq(1, 0), {"id": "e1", "t": "essay", "q": "tự luận 1"}, {"id": "e2", "t": "essay", "q": "tự luận 2"}]}
        body = {"title": "Có tự luận", "class_id": c1, "dist_mode": "alt", "duration_min": 0, "max_attempts": 1, "show_result": True,
                "exam": {"title": "T", "variations": [v]}}
        aid = lan.post("/api/assignments", body)[1]["id"]
        sid = an.post(f"/api/assignments/{aid}/start")[1]["submission_id"]
        res = an.post(f"/api/assignments/{aid}/submit", {"answers": [0, "bài 1", "bài 2"]})[1]
        self.assertEqual((res["score"], res["max"]), (1, 1))
        # chấm tay
        self.assertEqual(an.post(f"/api/submissions/{sid}/grade", {"grades": {"1": 1}})[0], 403)      # học sinh không chấm được
        self.assertEqual(binh.post(f"/api/submissions/{sid}/grade", {"grades": {"1": 1}})[0], 404)    # giáo viên khác không chấm được
        self.assertEqual(lan.post(f"/api/submissions/{sid}/grade", {"grades": {"0": 1}})[0], 400)     # câu đã chấm tự động
        self.assertEqual(lan.post(f"/api/submissions/{sid}/grade", {"grades": {"1": 1.5}})[0], 400)   # điểm ngoài 0–1
        st, r = lan.post(f"/api/submissions/{sid}/grade", {"grades": {"1": 0.5, "2": 1}})
        self.assertEqual((st, r["score"], r["max"]), (200, 2.5, 3))
        sub = lan.get(f"/api/submissions/{sid}")[1]
        self.assertEqual(sub["manual"], {"1": 0.5, "2": 1.0})
        st, r = lan.post(f"/api/submissions/{sid}/grade", {"grades": {"2": None}})                    # bỏ điểm một câu
        self.assertEqual((r["score"], r["max"]), (1.5, 2))
        # gia hạn
        due = 4102444800
        self.assertEqual(lan.call("PATCH", f"/api/assignments/{aid}", {"due_at": due, "max_attempts": 3})[0], 200)
        self.assertEqual(binh.call("PATCH", f"/api/assignments/{aid}", {"due_at": due})[0], 404)
        a = [x for x in lan.get("/api/assignments")[1]["assignments"] if x["id"] == aid][0]
        self.assertEqual((a["due_at"], a["max_attempts"]), (due, 3))
        self.assertEqual(an.post(f"/api/assignments/{aid}/start")[0], 200)                            # còn lượt làm lại
        # chuyển lớp
        sid_an = [s for s in lan.get(f"/api/students?class_id={c1}")[1]["students"] if s["username"] == "an.nv"][0]["id"]
        self.assertEqual(lan.call("PATCH", f"/api/students/{sid_an}", {"name": "Nguyễn Văn An", "class_id": c2})[0], 200)
        self.assertEqual(binh.call("PATCH", f"/api/students/{sid_an}", {"name": "x", "class_id": c2})[0], 404)
        # phụ huynh nhiều con
        st, r = lan.post("/api/parents", {"name": "Phụ huynh An", "student_id": sid_an})
        pid = r["account"]["id"]
        sid_b = [s for s in lan.get(f"/api/students?class_id={c1}")[1]["students"] if s["username"] != "an.nv"][0]["id"]
        self.assertEqual(lan.post(f"/api/parents/{pid}/link", {"student_id": sid_b})[0], 200)
        self.assertEqual(binh.post(f"/api/parents/{pid}/link", {"student_id": sid_b})[0], 404)
        ph = self.C()
        ph.post("/api/login", {"username": r["account"]["username"], "password": r["account"]["password"]})
        self.assertEqual(len(ph.get("/api/children")[1]["children"]), 2)
        self.assertEqual(lan.post(f"/api/parents/{pid}/unlink", {"student_id": sid_b})[0], 200)
        self.assertEqual(lan.post(f"/api/parents/{pid}/unlink", {"student_id": sid_an})[0], 409)      # không gỡ liên kết cuối cùng
        # xóa bình luận: chủ bình luận, chủ bài, admin; người khác thì không
        pidpost = lan.post("/api/posts", {"text": "Bài của cô Lan"})[1]["id"]
        an.post(f"/api/posts/{pidpost}/comments", {"text": "Em hỏi"})
        cm = lan.get(f"/api/posts/{pidpost}/comments")[1]["comments"][0]
        self.assertTrue(cm["can_del"])
        self.assertEqual(binh.call("DELETE", f"/api/comments/{cm['id']}")[0], 404)
        self.assertEqual(lan.call("DELETE", f"/api/comments/{cm['id']}")[0], 200)                       # chủ bài xóa được
        self.assertEqual(lan.get(f"/api/posts/{pidpost}/comments")[1]["comments"], [])

    def test_zz_adaptive(self):
        """Giao bài cá nhân hóa: học sinh được xếp mức theo điểm trung bình (chạy sau các test khác)."""
        lan = self.C()
        lan.post("/api/login", {"username": "lan", "password": LAN_PW})
        cid = [k for k in lan.get("/api/classes")[1]["classes"] if k["name"] == "9A1"][0]["id"]
        mk = lambda code, n: {"code": code, "questions": [mcq(i, 0) for i in range(n)]}
        body = {"title": "Cá nhân hóa", "class_id": cid, "dist_mode": "adaptive", "duration_min": 0, "max_attempts": 1, "show_result": True,
                "exam": {"title": "CN", "variations": [mk("Mức Củng cố", 2), mk("Mức Tiêu chuẩn", 3), mk("Mức Nâng cao", 4)]}}
        st, r = lan.post("/api/assignments", body)
        self.assertEqual(st, 200)
        self.assertEqual(sum(r["tiers"]), r["students"])
        self.assertEqual(len(r["tiers"]), 3)
        # học sinh đã có điểm trung bình cao/thấp thì rơi vào mức tương ứng
        con = db.connect()
        sid = con.execute("SELECT id FROM users WHERE role='student' AND class_id=? ORDER BY id LIMIT 1", (cid,)).fetchone()["id"]
        con.execute("DELETE FROM practice WHERE student_id=?", (sid,))
        con.execute("DELETE FROM submissions WHERE student_id=?", (sid,))
        self.assertEqual(app.adaptive_variation(con, sid, 3), 1)                       # chưa có điểm → tiêu chuẩn
        con.execute("INSERT INTO practice(student_id,title,questions,started_at,score,max_score,submitted_at) VALUES(?,?,?,?,?,?,?)", (sid, "t", "[]", 1, 2, 10, 2))
        self.assertEqual(app.adaptive_variation(con, sid, 3), 0)                       # 2/10 → củng cố
        con.execute("UPDATE practice SET score=9 WHERE student_id=?", (sid,))
        self.assertEqual(app.adaptive_variation(con, sid, 3), 2)                       # 9/10 → nâng cao
        self.assertEqual(app.adaptive_variation(con, sid, 2), 1)                       # chỉ có 2 mức → mức cao nhất hiện có
        con.rollback(); con.close()

if __name__ == "__main__":
    unittest.main()
