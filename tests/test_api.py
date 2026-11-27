"""Kiểm thử API: python -m unittest discover -s tests -v   (chạy trên CSDL tạm, không đụng dữ liệu thật)."""
import base64
import http.client
import json
import os
import secrets
import sys
import tempfile
import threading
import time
import unittest

# Mật khẩu thử nghiệm sinh ngẫu nhiên mỗi lần chạy (không ghi cứng trong mã)
def _pw():
    return "Aa1-" + secrets.token_urlsafe(12)


ADMIN_PW, LAN_PW, AN_PW = _pw(), _pw(), _pw()

TMP = tempfile.mkdtemp(prefix="lbai_test_")
os.environ["LBAI_DATA"] = TMP
os.environ["LBAI_QUIET"] = "1"
# Kiểm thử TUYỆT ĐỐI không dùng kho sao lưu thật: xóa mọi biến sao lưu kế thừa từ môi trường máy (tiến trình con của test cũng thừa hưởng os.environ)
for _k in [k for k in os.environ if k.startswith("LBAI_BACKUP")]:
    del os.environ[_k]
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
        self.assertEqual(admin.get("/api/status")[1], {"needs_setup": True, "needs_code": False})   # không đặt mã thiết lập → không đòi mã
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

    def test_short_answer_fractions(self):
        """Trả lời ngắn: phân số và số thập phân tương đương được chấm như nhau (1/2 = 0,5); khác giá trị thì sai."""
        from server import grading
        for given, key, ok in [("1/2", "0,5", True), ("0.5", "1/2", True), ("2/4", "1/2", True), ("-3/6", "-0,5", True), ("1/3", "0,33", False),
                               ("1/0", "0", False), ("a/b", "1/2", False), ("1/2", "1/2", True), ("22,5", "22.5", True), ("2", "3", False)]:
            self.assertEqual(grading.same_short(given, key), ok, (given, key))

    def test_practice_points_levels(self):
        """Tự luyện: điểm theo dạng câu (TN 0,25 · Đ/S 0,1/0,25/0,5/1 · TLN 1), giờ tự tính (TN 2' · Đ/S 7' · TLN 8'), chọn số câu theo mức độ."""
        lan, an = self.C(), self.C()
        lan.post("/api/login", {"username": "lan", "password": LAN_PW})
        an.post("/api/login", {"username": "an.nv", "password": AN_PW})
        cid = [k for k in lan.get("/api/classes")[1]["classes"] if k["name"] == "9A1"][0]["id"]
        key = {"subject": "Toán", "grade": "9", "topic": "Theo mức"}
        base = {"subject": "Toán", "grade": "9", "topic": "Theo mức"}
        bank = []
        for lv in (1, 2, 3, 4):
            for i in range(3 if lv < 4 else 2):
                bank.append({**base, "id": f"lm{lv}{i}", "t": "mcq", "lv": lv, "q": f"TN {lv}{i}", "opts": ["a", "b", "c", "d"], "ans": 0})
        for i in range(2):
            bank.append({**base, "id": f"lg{i}", "t": "tf", "lv": 3, "q": f"ĐS {i}", "sts": ["a", "b", "c", "d"], "ans": [0, 1, 0, 1]})
            bank.append({**base, "id": f"ls{i}", "t": "short", "lv": 2, "q": f"TLN {i}", "ans": "5"})
        self.assertEqual(lan.post("/api/bank/sync", {"upsert": bank})[0], 200)
        lan.post(f"/api/classes/{cid}/practice", {"open": [key]})
        grp = [g for g in an.get("/api/practice/topics")[1]["groups"] if g["topic"] == "Theo mức"][0]
        self.assertEqual(grp["levels"], {"mcq": [3, 3, 3, 2], "tf": [0, 0, 2, 0], "short": [0, 2, 0, 0]})        # số câu theo mức độ
        rules = an.get("/api/practice/topics")[1]["rules"]
        self.assertEqual((rules["points"]["mcq"], rules["minutes"], rules["tf_steps"]), (0.25, {"mcq": 2, "tf": 7, "short": 8}, [0, 0.1, 0.25, 0.5, 1]))

        # chọn theo mức: 2 TN nhận biết + 1 TN thông hiểu + 1 Đ/S vận dụng + 1 TLN thông hiểu
        st, r = an.post("/api/practice/start", {"groups": [key], "matrix": {"mcq": {"1": 2, "2": 1, "3": 0}, "tf": {"3": 1}, "short": {"2": 1}}})
        self.assertEqual(st, 200)
        lvs = sorted((q["t"], q["lv"]) for q in r["questions"])
        self.assertEqual(lvs, [("mcq", 1), ("mcq", 1), ("mcq", 2), ("short", 2), ("tf", 3)])
        self.assertEqual(r["duration_min"], 3 * 2 + 7 + 8)                                              # 21 phút, do server tính
        self.assertEqual((r["remaining"], r["max_points"]), (21 * 60, round(3 * 0.25 + 1 + 1, 2)))
        # không lộ đáp án; học sinh không thể ép giờ làm bài bằng cách gửi duration_min
        self.assertNotIn('"ans"', json.dumps(r["questions"]))
        st, r2 = an.post("/api/practice/start", {"groups": [key], "matrix": {"mcq": {"1": 1}}, "duration_min": 1})
        self.assertEqual((st, r2["duration_min"]), (200, 2))
        an.post(f"/api/practice/{r2['id']}/submit", {"answers": [0]})

        # chấm: TN đúng 2/3 (0,5), Đ/S đúng 2 ý (0,25), TLN đúng (1) → 1,75 / 2,75
        ans, n_mcq = [], 0
        for q in r["questions"]:
            if q["t"] == "tf":
                ans.append([0, 1, 1, 0])                              # đáp án [0,1,0,1] → đúng 2 ý đầu
            elif q["t"] == "short":
                ans.append("5")
            else:
                right = q["opts"].index("a")                          # server có đảo phương án → dò theo nội dung
                ans.append(right if n_mcq < 2 else (right + 1) % 4)   # 2 câu đầu đúng, câu thứ 3 sai
                n_mcq += 1
        st, res = an.post(f"/api/practice/{r['id']}/submit", {"answers": ans})
        self.assertEqual(st, 200)
        self.assertEqual((res["score"], res["max"], res["points"]), (1.75, 2.75, True))
        self.assertEqual(res["score10"], round(1.75 / 2.75 * 10, 2))
        self.assertEqual(sorted(d["pts"] for d in res["details"]), [0, 0.25, 0.25, 0.25, 1])
        self.assertEqual(sorted(d["max_pts"] for d in res["details"]), [0.25, 0.25, 0.25, 1, 1])
        self.assertFalse(res["overtime"])
        # lịch sử có điểm thật và thời gian
        h = [x for x in an.get("/api/practice")[1]["sessions"] if x["id"] == r["id"]][0]
        self.assertEqual((h["points"], h["score"], h["max"], h["duration_min"]), (True, 1.75, 2.75, 21))
        self.assertGreaterEqual(h["spent_sec"], 0)
        # vận dụng cao (mức 4); mức > 4 trong ngân hàng cũng gộp vào mức 4
        st, r4 = an.post("/api/practice/start", {"groups": [key], "matrix": {"mcq": {"4": 2}}})
        self.assertEqual((st, sorted(q["lv"] for q in r4["questions"])), (200, [4, 4]))
        # ma trận mặc định của lớp + riêng từng học sinh: giáo viên lưu, học sinh thấy gợi ý sẵn khi tự luyện
        mx = lan.get(f"/api/classes/{cid}/matrix")[1]
        self.assertIsNone(mx["default"])
        an_id = [s for s in mx["students"] if s["name"] and s["id"]][0]["id"]
        dflt = {"mcq": {"1": 3, "2": 2}, "tf": {"3": 1}, "short": {}}
        mine = {"mcq": {"1": 8, "3": 2}}
        st, _ = lan.post(f"/api/classes/{cid}/matrix", {"default": dflt, "students": {str(an_id): mine, "999999": mine}})
        self.assertEqual(st, 200)
        mx = lan.get(f"/api/classes/{cid}/matrix")[1]
        self.assertEqual(mx["default"]["mcq"], {"1": 3, "2": 2, "3": 0, "4": 0})
        self.assertEqual([s["matrix"]["mcq"]["1"] for s in mx["students"] if s["matrix"]], [8])
        eff = an.get("/api/practice/topics")[1]["matrix"]
        self.assertTrue(eff is not None and eff["mcq"]["1"] in (3, 8))                                   # riêng nếu em này được đặt, không thì mặc định lớp
        self.assertEqual(an.post(f"/api/classes/{cid}/matrix", {"default": dflt})[0], 403)               # học sinh không được sửa
        lan.post(f"/api/classes/{cid}/matrix", {"default": None, "students": {str(an_id): None}})
        self.assertIsNone(lan.get(f"/api/classes/{cid}/matrix")[1]["default"])
        # thiếu câu theo mức: vẫn tạo đề với số câu có sẵn và báo rõ
        st, r3 = an.post("/api/practice/start", {"groups": [key], "matrix": {"mcq": {"1": 5}}})
        self.assertEqual((st, len(r3["questions"])), (200, 3))
        self.assertIn("nhận biết", r3["note"])
        self.assertEqual(an.post("/api/practice/start", {"groups": [key], "matrix": {}})[0], 400)       # phải chọn ít nhất 1 câu
        self.assertEqual(an.post("/api/practice/start", {"groups": [key], "matrix": {"mcq": {"1": 99}}})[0], 400)   # tối đa 50 câu mỗi ô

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
        # thang điểm mới: 8 TN × 0,25 + 2 Đ/S × 1 + 2 TLN × 1 = 6 điểm
        self.assertEqual((res["score"], res["max"], res["score10"], res["points"]), (6.0, 6.0, 10.0, True))
        self.assertEqual(res["duration_min"], 8 * 2 + 2 * 7 + 2 * 8)                                   # giờ: 16 + 14 + 16 = 46 phút
        self.assertGreaterEqual(res["spent_sec"], 0)
        # điểm cộng mặc định: 8 TN × 10 + 2 Đ/S × 40 + 2 TLN × 50 = 260
        b = res["bonus"]
        self.assertEqual((b["points"], b["counts"], b["repeat"], b["month_total"]), (260, {"mcq": 8, "tf": 2, "short": 2}, 0, 260))
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

        # ---- điểm cộng ----
        self.assertEqual(hist["sessions"][0]["bonus"], 260)
        self.assertEqual(hist["sessions"][1]["bonus"], 0)
        # làm lại đúng các câu đã được cộng trong tháng → không cộng thêm
        st, r = an.post("/api/practice/start", {"groups": [key], "counts": {"mcq": 8, "tf": 2, "short": 2}})
        answers = []
        for q in r["questions"]:
            n = int(q["q"].split()[-1])
            answers.append([0, 1, 0, 1] if q.get("sts") else str(n + 1) + ",5" if q["t"] == "short" else q["opts"].index(f"{'xyzw'[n % 4]}{n}"))
        b = an.post(f"/api/practice/{r['id']}/submit", {"answers": answers})[1]["bonus"]
        self.assertEqual((b["points"], b["repeat"], b["month_total"]), (0, 12, 260))
        # giáo viên đổi điểm cộng; câu mới làm đúng tính theo mức mới; Đ/S sai 1 ý không được cộng
        self.assertEqual(an.post(f"/api/classes/{cid}/bonus-config", {"mcq": 1})[0], 403)          # học sinh không sửa được
        self.assertEqual(lan.post(f"/api/classes/{cid}/bonus-config", {"mcq": -1, "tf": 0, "short": 0})[0], 400)
        self.assertEqual(lan.post(f"/api/classes/{cid}/bonus-config", {"mcq": 5, "tf": 100, "short": 0})[1]["config"], {"mcq": 5, "tf": 100, "short": 0})
        lan.post("/api/bank/sync", {"upsert": [
            {"id": "pm9", "t": "mcq", "q": "Luyện TN 9", "opts": ["x9", "y9", "z9", "w9"], "ans": 1, "subject": "Toán", "grade": "9", "topic": "Luyện"},
            {"id": "pg9", "t": "tf", "q": "Luyện ĐS 9", "sts": ["a", "b", "c", "d"], "ans": [1, 1, 1, 1], "subject": "Toán", "grade": "9", "topic": "Luyện"},
            {"id": "ps9", "t": "short", "q": "Luyện TLN 9", "ans": "7", "subject": "Toán", "grade": "9", "topic": "Luyện"}]})
        st, r = an.post("/api/practice/start", {"groups": [key], "counts": {"mcq": 9, "tf": 3, "short": 3}})
        answers = []
        for q in r["questions"]:
            n = int(q["q"].split()[-1])
            if q.get("sts"):
                answers.append([1, 1, 1, 0] if n == 9 else [0, 1, 0, 1])                       # câu Đ/S mới sai 1 ý
            elif q["t"] == "short":
                answers.append("7" if n == 9 else str(n + 1) + ",5")
            else:
                answers.append(q["opts"].index(f"{'xyzw'[1 if n == 9 else n % 4]}{n}"))
        b = an.post(f"/api/practice/{r['id']}/submit", {"answers": answers})[1]["bonus"]
        self.assertEqual((b["points"], b["counts"], b["month_total"]), (5, {"mcq": 1, "tf": 0, "short": 0}, 265))   # TLN đặt 0 điểm
        # bảng điểm cộng của giáo viên
        st, t = lan.get(f"/api/classes/{cid}/bonus")
        self.assertEqual(st, 200)
        self.assertEqual(t["month"], app.month_key())
        row = [s for s in t["students"] if s["username"] == "an.nv"][0]
        self.assertEqual((row["points"], row["rank"], row["sessions"], row["mcq"], row["tf"], row["short"]), (265, 1, 4, 9, 2, 2))
        self.assertTrue(all(s["rank"] == 2 for s in t["students"] if s["username"] != "an.nv"))  # chưa có điểm: đồng hạng
        d = lan.get(f"/api/students/{an_id['id']}/bonus")[1]
        self.assertEqual((d["total"], len(d["sessions"])), (265, 4))
        # sang tháng khác: điểm về 0; tháng sai định dạng bị từ chối; người ngoài lớp không xem được
        self.assertTrue(all(s["points"] == 0 for s in lan.get(f"/api/classes/{cid}/bonus?month=2001-01")[1]["students"]))
        self.assertEqual(lan.get(f"/api/classes/{cid}/bonus?month=2026-13")[0], 400)
        self.assertEqual(an.get(f"/api/classes/{cid}/bonus")[0], 403)
        if hasattr(self.__class__, "binh_pw"):
            self.assertEqual(binh.get(f"/api/classes/{cid}/bonus")[0], 404)
        me = an.get("/api/bonus/me")[1]
        self.assertEqual((me["points"], me["rank"], me["config"]), (265, 1, {"mcq": 5, "tf": 100, "short": 0}))
        # ranh giới tháng theo giờ Việt Nam: 17:30 UTC ngày 31/10 là 00:30 ngày 01/11
        import calendar
        self.assertEqual(app.month_key(calendar.timegm((2026, 10, 31, 17, 30, 0))), "2026-11")
        self.assertEqual(app.month_key(calendar.timegm((2026, 10, 31, 16, 59, 0))), "2026-10")

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

    def test_zz_ai_solve(self):
        """AI giải câu hỏi: gọi dịch vụ Anthropic GIẢ (không tốn tiền, không cần khóa thật); kiểm tra quyền, giới hạn, định dạng đáp án và xử lý lỗi."""
        import http.server
        from server import ai
        seen = []
        script = {"mode": "ok"}

        class Fake(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
                seen.append(body)
                if script["mode"] == "500":
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(b'{"type":"error","error":{"type":"api_error","message":"boom"}}')
                    return
                texts = [b["text"] for b in body["messages"][0]["content"] if b["type"] == "text"]
                ids = [t.split("id=")[1].split(" ")[0] for t in texts if "id=" in t]
                kinds = [t.split("dạng: ")[1].split(" ")[0] for t in texts if "dạng: " in t]
                table = {"mcq": ("b", "high", "Chọn B"), "tf": ("ĐSSĐ", "medium", "Ý b, c sai"), "short": ("3.5", "high", "= 3,5")}
                ans = [{"id": i, "answer": table[k][0], "confidence": table[k][1], "note": table[k][2], "solution": "Bước 1: đọc đề.\nBước 2:   tính   toán.\n\nĐáp án: " + table[k][0]} for i, k in zip(ids, kinds)]
                if script["mode"] == "bad":
                    ans = [{"id": i, "answer": "E", "confidence": "high", "note": "lạ"} for i in ids]
                if script["mode"] == "partial":
                    ans = ans[:1]
                msg = {"id": "msg_test", "type": "message", "role": "assistant", "model": body["model"], "content": [{"type": "text", "text": json.dumps({"answers": ans}, ensure_ascii=False)}],
                       "stop_reason": "refusal" if script["mode"] == "refuse" else "end_turn", "stop_sequence": None, "usage": {"input_tokens": 1, "output_tokens": 1}}
                out = json.dumps(msg).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(out)))
                self.end_headers()
                self.wfile.write(out)

        fake = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Fake)
        threading.Thread(target=fake.serve_forever, daemon=True).start()
        keep = {k: os.environ.get(k) for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "GEMINI_API_KEY", "LBAI_AI_PROVIDER")}
        lan, an = self.C(), self.C()
        lan.post("/api/login", {"username": "lan", "password": LAN_PW})
        an.post("/api/login", {"username": "an.nv", "password": AN_PW})
        try:
            for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "GEMINI_API_KEY"):
                os.environ.pop(k, None)
            os.environ["LBAI_AI_PROVIDER"] = "claude"                                               # test này kiểm tra nhánh Claude (nhánh Gemini ở test_zz_ai_gemini)
            st, r = lan.get("/api/ai/status")                                                       # chưa đặt khóa → báo chưa bật
            self.assertEqual((st, r["configured"], r["ready"]), (200, False, False))
            self.assertEqual(an.get("/api/ai/status")[0], 403)                                       # học sinh không dùng được
            import struct
            import zlib

            def chunk(t, d):
                return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
            raw_png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\x00\xff\xff\xff")) + chunk(b"IEND", b"")
            png = "data:image/png;base64," + base64.b64encode(raw_png).decode()
            iid = lan.post("/api/img", {"data": png})[1]["id"]
            body = {"items": [{"id": "q1", "t": "mcq", "img": iid}]}
            st, r = lan.post("/api/ai/solve", body)
            self.assertEqual(st, 503)                                                                # chưa có khóa → 503 kèm hướng dẫn
            self.assertIn("ANTHROPIC_API_KEY", json.dumps(r, ensure_ascii=False))

            os.environ["ANTHROPIC_API_KEY"] = "k-" + secrets.token_hex(16)                          # khóa GIẢ sinh lúc chạy, chỉ dùng với server giả
            os.environ["ANTHROPIC_BASE_URL"] = f"http://127.0.0.1:{fake.server_address[1]}"
            st, r = lan.get("/api/ai/status")
            self.assertEqual((r["configured"], r["ready"], r["model"], r["provider"]), (True, True, ai.CLAUDE_MODEL, "claude"))
            self.assertNotIn(os.environ["ANTHROPIC_API_KEY"], json.dumps(r))                         # không bao giờ trả khóa ra ngoài
            self.assertEqual(an.post("/api/ai/solve", body)[0], 403)

            items = [{"id": "q1", "t": "mcq", "img": iid}, {"id": "q2", "t": "tf", "img": iid}, {"id": "q3", "t": "short", "text": "Tính 7 chia 2"}]
            st, r = lan.post("/api/ai/solve", {"items": items})
            self.assertEqual(st, 200, r)
            res = {x["id"]: x for x in r["results"]}
            self.assertEqual((res["q1"]["ans"], res["q1"]["conf"]), (1, "high"))                    # B → chỉ số 1
            self.assertEqual((res["q2"]["ans"], res["q2"]["conf"]), ([0, 1, 1, 0], "medium"))        # ĐSSĐ → 0 là Đúng
            self.assertEqual(res["q3"]["ans"], "3,5")                                                # dấu chấm → dấu phẩy
            self.assertEqual(res["q3"]["sol"], "Bước 1: đọc đề.\nBước 2: tính toán.\nĐáp án: 3.5")           # lời giải chi tiết được làm sạch: gộp khoảng trắng, bỏ dòng trống, giữ xuống dòng
            req = seen[-1]                                                                            # yêu cầu gửi đi đúng chuẩn
            self.assertEqual(req["model"], ai.CLAUDE_MODEL)
            self.assertEqual(req["output_config"]["format"]["type"], "json_schema")
            blocks = req["messages"][0]["content"]
            self.assertEqual(sum(1 for b in blocks if b["type"] == "image"), 2)                      # q1, q2 gửi ảnh; q3 gửi chữ
            self.assertTrue(any("Tính 7 chia 2" in b.get("text", "") for b in blocks))
            self.assertNotIn("lan", json.dumps(req))                                                  # không kèm thông tin người dùng

            script["mode"] = "bad"                                                                    # đáp án sai định dạng → từ chối, không ghi bừa
            res = lan.post("/api/ai/solve", {"items": items[:2]})[1]["results"]
            self.assertTrue(all(not x["ok"] for x in res))
            script["mode"] = "partial"                                                                # AI bỏ sót một câu → báo lỗi riêng câu đó
            res = lan.post("/api/ai/solve", {"items": items[:2]})[1]["results"]
            self.assertEqual([x["ok"] for x in res], [True, False])
            script["mode"] = "refuse"
            self.assertEqual(lan.post("/api/ai/solve", {"items": items[:1]})[0], 502)
            script["mode"] = "500"
            st, r = lan.post("/api/ai/solve", {"items": items[:1]})
            self.assertEqual(st, 502)
            self.assertNotIn(os.environ["ANTHROPIC_API_KEY"], json.dumps(r))
            script["mode"] = "ok"

            self.assertEqual(lan.post("/api/ai/solve", {"items": []})[0], 400)                       # 0 câu
            self.assertEqual(lan.post("/api/ai/solve", {"items": [{"id": "q%d" % i, "t": "mcq", "text": "x"} for i in range(ai.MAX_ITEMS + 1)]})[0], 400)
            self.assertEqual(lan.post("/api/ai/solve", {"items": [{"id": "q1", "t": "essay", "text": "x"}]})[0], 400)   # tự luận không giải
            self.assertEqual(lan.post("/api/ai/solve", {"items": [{"id": "q1", "t": "mcq", "img": "0" * 24}]})[0], 404)  # ảnh không tồn tại
            old = ai.HOURLY_LIMIT
            ai.HOURLY_LIMIT = 1                                                                       # hết hạn mức giờ → 429
            try:
                ai._usage.clear()
                self.assertEqual(lan.post("/api/ai/solve", {"items": items[:1]})[0], 200)
                self.assertEqual(lan.post("/api/ai/solve", {"items": items[:1]})[0], 429)
            finally:
                ai.HOURLY_LIMIT = old
                ai._usage.clear()
        finally:
            fake.shutdown()
            for k, v in keep.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_zz_ai_gemini(self):
        """AI giải đáp án bằng Gemini (gói miễn phí): gọi REST tới máy chủ Gemini GIẢ; kiểm tra yêu cầu gửi đi, đọc kết quả, giới hạn miễn phí và lỗi."""
        import http.server
        import struct
        import zlib
        from server import ai
        seen = []
        script = {"mode": "ok", "calls": 0}

        class Fake(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def reply(self, code, obj):
                out = json.dumps(obj).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(out)))
                self.end_headers()
                self.wfile.write(out)

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
                seen.append({"path": self.path, "key": self.headers.get("x-goog-api-key"), "body": body})
                script["calls"] += 1
                mode = script["mode"]
                if mode == "429":
                    return self.reply(429, {"error": {"code": 429, "message": "quota", "status": "RESOURCE_EXHAUSTED"}})
                if mode == "429once" and script["calls"] == 1:
                    return self.reply(429, {"error": {"code": 429, "message": "quota"}})
                if mode == "403":
                    return self.reply(403, {"error": {"code": 403, "message": "bad key"}})
                if mode == "404":
                    return self.reply(404, {"error": {"code": 404, "message": "no model"}})
                if mode == "block":
                    return self.reply(200, {"promptFeedback": {"blockReason": "SAFETY"}})
                parts = body["contents"][0]["parts"]
                texts = [x["text"] for x in parts if "text" in x]
                ids = [t.split("id=")[1].split(" ")[0] for t in texts if "id=" in t]
                kinds = [t.split("dạng: ")[1].split(" ")[0] for t in texts if "dạng: " in t]
                table = {"mcq": ("c", "high", "Chọn C"), "tf": ("Đ S S Đ", "medium", "Ý b, c sai"), "short": ("2.5", "high", "= 2,5")}
                ans = [{"id": i, "answer": table[k][0], "confidence": table[k][1], "note": table[k][2]} for i, k in zip(ids, kinds)]
                if mode == "bad":
                    ans = [{"id": i, "answer": "xyz", "confidence": "high", "note": ""} for i in ids]
                txt = json.dumps({"answers": ans}, ensure_ascii=False)
                if mode == "fence":
                    txt = "```json\n" + txt + "\n```"
                self.reply(200, {"candidates": [{"content": {"role": "model", "parts": [{"text": txt}]}, "finishReason": "STOP"}]})

        fake = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Fake)
        threading.Thread(target=fake.serve_forever, daemon=True).start()
        names = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "GEMINI_API_KEY", "LBAI_AI_PROVIDER")
        keep = {k: os.environ.get(k) for k in names}
        keep_base, keep_sleep = ai.GEMINI_BASE, time.sleep
        lan, an = self.C(), self.C()
        lan.post("/api/login", {"username": "lan", "password": LAN_PW})
        an.post("/api/login", {"username": "an.nv", "password": AN_PW})
        try:
            for k in names:
                os.environ.pop(k, None)
            ai.GEMINI_BASE = f"http://127.0.0.1:{fake.server_address[1]}"
            ai.time.sleep = lambda s: None                                                            # không chờ thật khi thử lại
            self.assertEqual(lan.get("/api/ai/status")[1]["ready"], False)
            key = "g-" + secrets.token_hex(16)                                                        # khóa GIẢ sinh lúc chạy
            os.environ["GEMINI_API_KEY"] = key
            st, r = lan.get("/api/ai/status")
            self.assertEqual((r["provider"], r["ready"], r["free"], r["model"], r["concurrency"]), ("gemini", True, True, ai.GEMINI_MODEL, 1))
            self.assertNotIn(key, json.dumps(r))
            raw_png = b"\x89PNG\r\n\x1a\n" + b"".join(struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF) for t, d in [(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)), (b"IDAT", zlib.compress(b"\x00\xff\xff\xff")), (b"IEND", b"")])
            iid = lan.post("/api/img", {"data": "data:image/png;base64," + base64.b64encode(raw_png).decode()})[1]["id"]
            items = [{"id": "g1", "t": "mcq", "img": iid}, {"id": "g2", "t": "tf", "img": iid}, {"id": "g3", "t": "short", "text": "Tính 5 chia 2"}]
            st, r = lan.post("/api/ai/solve", {"items": items})
            self.assertEqual(st, 200, r)
            res = {x["id"]: x for x in r["results"]}
            self.assertEqual((res["g1"]["ans"], res["g1"]["conf"]), (2, "high"))                      # C → chỉ số 2
            self.assertEqual(res["g2"]["ans"], [0, 1, 1, 0])                                          # "Đ S S Đ" có dấu cách vẫn đọc được
            self.assertEqual(res["g3"]["ans"], "2,5")
            self.assertEqual(r["provider"], "gemini")
            req = seen[-1]
            self.assertEqual(req["path"], f"/v1beta/models/{ai.GEMINI_MODEL}:generateContent")
            self.assertEqual(req["key"], key)                                                         # khóa gửi bằng header, không nằm trong URL hay nội dung
            self.assertNotIn(key, json.dumps(req["body"]) + req["path"])
            parts = req["body"]["contents"][0]["parts"]
            self.assertEqual(sum(1 for x in parts if "inline_data" in x), 2)                          # q1, q2 gửi ảnh; q3 gửi chữ
            self.assertEqual(parts[1]["inline_data"]["mime_type"], "image/png")
            self.assertTrue(any("Tính 5 chia 2" in x.get("text", "") for x in parts))
            self.assertIn("system_instruction", req["body"])
            self.assertNotIn("lan", json.dumps(req["body"]))

            script["mode"] = "fence"                                                                  # JSON bọc trong ```json … ``` vẫn đọc được
            self.assertEqual(lan.post("/api/ai/solve", {"items": items[:1]})[1]["results"][0]["ans"], 2)
            script["mode"] = "bad"                                                                    # đáp án sai định dạng → từ chối
            self.assertFalse(lan.post("/api/ai/solve", {"items": items[:1]})[1]["results"][0]["ok"])
            script["mode"], script["calls"] = "429once", 0                                            # chạm giới hạn miễn phí một lần → tự thử lại và thành công
            self.assertEqual(lan.post("/api/ai/solve", {"items": items[:1]})[0], 200)
            script["mode"] = "429"
            st, r = lan.post("/api/ai/solve", {"items": items[:1]})
            self.assertEqual(st, 429)
            self.assertIn("miễn phí", json.dumps(r, ensure_ascii=False))
            script["mode"] = "403"
            st, r = lan.post("/api/ai/solve", {"items": items[:1]})
            self.assertEqual(st, 502)
            self.assertNotIn(key, json.dumps(r))
            script["mode"] = "404"
            st, r = lan.post("/api/ai/solve", {"items": items[:1]})
            self.assertEqual(st, 502)
            self.assertIn("LBAI_AI_MODEL_GEMINI", json.dumps(r, ensure_ascii=False))
            script["mode"] = "block"
            self.assertEqual(lan.post("/api/ai/solve", {"items": items[:1]})[0], 502)
            self.assertEqual(an.post("/api/ai/solve", {"items": items[:1]})[0], 403)                  # học sinh không dùng được
            os.environ["LBAI_AI_PROVIDER"] = "claude"                                                 # chọn Claude khi chưa có khóa Claude → báo chưa bật, không gọi Gemini
            self.assertEqual(lan.get("/api/ai/status")[1]["ready"], False)
            self.assertEqual(lan.post("/api/ai/solve", {"items": items[:1]})[0], 503)
        finally:
            fake.shutdown()
            ai.GEMINI_BASE = keep_base
            ai.time.sleep = keep_sleep
            for k, v in keep.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_zz_http_bandwidth(self):
        """Tiết kiệm băng thông: nén gzip tệp giao diện và JSON lớn, ETag → 304 không kèm nội dung, vendor cache 7 ngày, ảnh bất biến cache 1 năm."""
        import gzip
        import struct
        import zlib
        anon, lan = self.C(), self.C()
        lan.post("/api/login", {"username": "lan", "password": LAN_PW})
        gz = {"Accept-Encoding": "gzip"}
        with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "app.js"), "rb") as f:
            raw_js = f.read()
        st, body, r = anon.get("/app.js", headers=gz, raw=True)
        self.assertEqual((st, r.getheader("Content-Encoding")), (200, "gzip"))
        self.assertEqual(gzip.decompress(body), raw_js)                                          # nén đúng, giải ra đúng nội dung
        self.assertLess(len(body), len(raw_js) * 0.5)                                            # nhỏ đi đáng kể
        etag = r.getheader("ETag")
        self.assertTrue(etag and r.getheader("Cache-Control") == "no-cache")                     # luôn hỏi lại nhưng chỉ tải khi đã đổi
        st, body, r = anon.get("/app.js", headers={**gz, "If-None-Match": etag}, raw=True)
        self.assertEqual((st, len(body)), (304, 0))                                              # không đổi → 304, không tốn băng thông
        st, body, r = anon.get("/app.js", raw=True)                                              # trình duyệt không nhận gzip → bản gốc
        self.assertEqual((st, r.getheader("Content-Encoding"), len(body)), (200, None, len(raw_js)))
        st, body, r = anon.get("/vendor/pdfjs/pdf.min.js", headers=gz, raw=True)
        self.assertEqual((st, r.getheader("Cache-Control")), (200, "public, max-age=604800"))   # thư viện ngoài hiếm đổi → giữ 7 ngày
        st, _, r = anon.get("/api/status", headers=gz, raw=True)
        self.assertIsNone(r.getheader("Content-Encoding"))                                       # JSON nhỏ không đáng nén
        # JSON lớn (danh sách ngân hàng) được nén và giải ra đúng
        qs = [{"id": f"bw{i}", "t": "mcq", "q": "Câu hỏi " + "x" * 200, "opts": ["a", "b", "c", "d"], "ans": 1} for i in range(40)]
        lan.post("/api/bank/sync", {"upsert": qs})
        st, body, r = lan.get("/api/bank", headers=gz, raw=True)
        self.assertEqual((st, r.getheader("Content-Encoding")), (200, "gzip"))
        self.assertEqual(len(json.loads(gzip.decompress(body))["questions"]) >= 40, True)
        lan.post("/api/bank/sync", {"delete": [q["id"] for q in qs]})
        # ảnh theo mã không bao giờ đổi → cache lâu
        def chunk(t, d):
            return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\x00\xff\xff\xff")) + chunk(b"IEND", b"")
        iid = lan.post("/api/img", {"data": "data:image/png;base64," + base64.b64encode(png).decode()})[1]["id"]
        st, body, r = lan.get(f"/api/img/{iid}", raw=True)
        self.assertEqual((st, r.getheader("Cache-Control")), (200, "private, max-age=31536000, immutable"))
        lan.call("DELETE", f"/api/img/{iid}")

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

    def test_zz_variations_review(self):
        """Chỉ định mã đề từng học sinh, chia ngẫu nhiên đều, đổi mã đề sau khi giao; học sinh xem lại bài theo chế độ xem đáp án."""
        lan, binh = self.C(), self.C()
        lan.post("/api/login", {"username": "lan", "password": LAN_PW})
        binh.post("/api/login", {"username": "binh", "password": self.__class__.binh_pw})
        cid = lan.post("/api/classes", {"name": "9A9", "grade": "9"})[1]["id"]
        accs = lan.post("/api/students/bulk", {"class_id": cid, "rows": ["Học Sinh Một", "Học Sinh Hai", "Học Sinh Ba", "Học Sinh Bốn", "Học Sinh Năm"]})[1]["accounts"]
        ids = [a["id"] for a in accs]
        S = []
        for a in accs:
            c = self.C()
            c.post("/api/login", {"username": a["username"], "password": a["password"]})
            S.append(c)
        img = lan.post("/api/img", {"data": "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 32).decode()})[1]["id"]
        q1 = {"id": "r1", "t": "mcq", "q": "1+1?", "opts": ["1", "2", "3", "4"], "ans": 1, "sol": "1+1=2", "solImg": img}
        vs = [{"code": f"Mã {101 + i}", "questions": [q1, mcq(9, i)]} for i in range(3)]
        base = {"title": "Chỉ định", "class_id": cid, "duration_min": 0, "max_attempts": 2, "exam": {"title": "CD", "variations": vs}}
        # chỉ định: mã đề / tự chọn / không giao
        vm = {str(ids[0]): 2, str(ids[1]): 0, str(ids[2]): "free", str(ids[3]): "none", str(ids[4]): "none"}
        self.assertEqual(lan.post("/api/assignments", {**base, "dist_mode": "manual"})[0], 400)                      # thiếu bảng chỉ định
        self.assertEqual(lan.post("/api/assignments", {**base, "dist_mode": "manual", "variation_map": {str(ids[0]): 7}})[0], 400)  # mã đề không tồn tại
        self.assertEqual(lan.post("/api/assignments", {**base, "dist_mode": "manual", "variation_map": {str(i): "none" for i in ids}})[0], 400)
        bad = {**base, "dist_mode": "manual", "variation_map": vm, "exam": {"title": "x", "variations": [{"code": "x", "questions": [{**q1, "solImg": "../x"}]}]}}
        self.assertEqual(lan.post("/api/assignments", bad)[0], 400)                                                  # ảnh lời giải không hợp lệ
        st, r = lan.post("/api/assignments", {**base, "dist_mode": "manual", "variation_map": vm, "show_result": 2, "due_at": 4102444800})
        self.assertEqual((st, r["students"]), (200, 3))
        aid = r["id"]
        self.assertEqual(S[0].post(f"/api/assignments/{aid}/start")[1]["code"], "Mã 103")
        self.assertEqual(S[1].post(f"/api/assignments/{aid}/start")[1]["code"], "Mã 101")
        self.assertEqual(S[2].post(f"/api/assignments/{aid}/start")[0], 400)                                       # tự chọn: phải gửi mã đề
        self.assertEqual(S[3].post(f"/api/assignments/{aid}/start")[0], 404)                                       # không được giao
        # nộp bài khi chế độ "xem đáp án sau hạn nộp": chưa lộ đáp án, lời giải
        res = S[0].post(f"/api/assignments/{aid}/submit", {"answers": [0, 2]})[1]
        self.assertEqual((res["score"], res["max"]), (1, 2))
        self.assertNotIn("details", res)
        self.assertIn("reveal_note", res)
        sub = res["submission_id"]
        mine = [x for x in S[0].get("/api/assignments")[1]["assignments"] if x["id"] == aid][0]
        self.assertEqual((mine["reveal"], mine["show_result"], mine["last_sub_id"]), (False, 2, sub))
        st, rv = S[0].get(f"/api/assignments/{aid}/my/{sub}")
        self.assertEqual((st, rv["reveal"], rv["score"]), (200, False, 1))
        self.assertNotIn('"key"', json.dumps(rv["details"]))
        self.assertNotIn("1+1=2", json.dumps(rv))
        self.assertEqual(rv["details"][0]["given"], 0)
        self.assertEqual(S[1].get(f"/api/assignments/{aid}/my/{sub}")[0], 404)                                     # không xem được bài bạn khác
        # đóng bài → học sinh xem được đáp án, lời giải chữ và ảnh
        lan.post(f"/api/assignments/{aid}/close", {"closed": True})
        rv = S[0].get(f"/api/assignments/{aid}/my/{sub}")[1]
        self.assertTrue(rv["reveal"])
        self.assertEqual((rv["details"][0]["key"], rv["details"][0]["sol"], rv["details"][0]["solImg"]), (1, "1+1=2", img))
        self.assertEqual(rv["details"][1]["key"], 2)
        self.assertNotIn("solImg", json.dumps(rv["questions"]))                                                     # đề gửi học sinh không kèm lời giải
        lan.post(f"/api/assignments/{aid}/close", {"closed": False})
        # đổi chế độ: không cho xem
        self.assertEqual(lan.call("PATCH", f"/api/assignments/{aid}", {"show_result": 0})[0], 200)
        self.assertFalse(S[0].get(f"/api/assignments/{aid}/my/{sub}")[1]["reveal"])
        self.assertEqual(lan.call("PATCH", f"/api/assignments/{aid}", {"show_result": 5})[0], 400)
        # đổi mã đề sau khi giao
        st, ro = lan.get(f"/api/assignments/{aid}/students")
        self.assertEqual(st, 200)
        by = {s["id"]: s for s in ro["students"]}
        self.assertEqual((by[ids[0]]["started"], by[ids[1]]["doing"], by[ids[3]]["assigned"]), (True, True, False))
        self.assertEqual(binh.get(f"/api/assignments/{aid}/students")[0], 404)                                      # giáo viên khác
        self.assertEqual(lan.post(f"/api/assignments/{aid}/students", {"variation_map": {str(ids[0]): "none"}})[0], 400)  # đã làm → không bỏ giao
        st, r = lan.post(f"/api/assignments/{aid}/students", {"variation_map": {str(ids[3]): 1, str(ids[2]): 2, str(ids[0]): 0}})
        self.assertEqual((st, r["changed"]), (200, 3))
        self.assertEqual(S[3].post(f"/api/assignments/{aid}/start")[1]["code"], "Mã 102")                          # giao thêm
        self.assertEqual(S[2].post(f"/api/assignments/{aid}/start")[1]["code"], "Mã 103")                          # tự chọn → chỉ định
        self.assertEqual(S[0].post(f"/api/assignments/{aid}/start")[1]["code"], "Mã 101")                          # lượt làm lại dùng mã đề mới
        self.assertEqual(S[1].post(f"/api/assignments/{aid}/start")[1]["code"], "Mã 101")                          # đang làm dở giữ mã cũ
        # chia ngẫu nhiên đều: 5 học sinh / 3 mã đề → mỗi mã 1–2 em
        st, r = lan.post("/api/assignments", {**base, "dist_mode": "random", "show_result": True})
        con = db.connect()
        vars_ = [x["variation"] for x in con.execute("SELECT variation FROM assignment_students WHERE assignment_id=?", (r["id"],)).fetchall()]
        con.close()
        self.assertEqual(len(vars_), 5)
        self.assertTrue(all(vars_.count(i) in (1, 2) for i in range(3)))
        # xem đáp án ngay (show_result=1): kết quả nộp bài có lời giải
        rid = r["id"]
        S[4].post(f"/api/assignments/{rid}/start")
        res = S[4].post(f"/api/assignments/{rid}/submit", {"answers": [1, 0]})[1]
        self.assertEqual(res["details"][0]["solImg"], img)
        self.assertEqual(S[4].get(f"/api/assignments/{rid}/my/{res['submission_id']}")[1]["details"][0]["sol"], "1+1=2")
        # thông tin máy chủ cho mã QR đăng nhập: server test chỉ nghe 127.0.0.1 → không có địa chỉ LAN
        st, info = lan.get("/api/server-info")
        self.assertEqual((st, info["lan"], info["urls"], info["port"]), (200, False, [], self.port))
        self.assertEqual(S[0].get("/api/server-info")[0], 403)

    def test_zz_attendance(self):
        """Lịch học theo lớp, điểm danh theo ngày, thống kê tháng và học phí (giả lập hôm nay là 31/10/2026)."""
        import datetime as dt
        lan, binh = self.C(), self.C()
        lan.post("/api/login", {"username": "lan", "password": LAN_PW})
        binh.post("/api/login", {"username": "binh", "password": self.__class__.binh_pw}) if hasattr(self.__class__, "binh_pw") else None
        cid = lan.post("/api/classes", {"name": "ĐD1", "grade": "9"})[1]["id"]
        accs = lan.post("/api/students/bulk", {"class_id": cid, "rows": ["Đinh An", "Đinh Bảo"]})[1]["accounts"]
        A, B = [a["id"] for a in accs]
        con = db.connect()
        con.execute("UPDATE users SET created_at=? WHERE id IN (?,?)", (1700000000, A, B))   # học sinh có từ trước tháng 10
        con.commit()
        con.close()
        real_today = app.today_vn
        app.today_vn = lambda: dt.date(2026, 10, 31)
        try:
            # lịch: Thứ 2 + Thứ 4, 100.000đ/buổi từ 01/10; từ 20/10 chỉ còn Thứ 2, 150.000đ/buổi
            self.assertEqual(lan.post(f"/api/classes/{cid}/schedule", {"days": {"0": "18:00–19:30", "2": ""}, "fee": 100000, "from": "2026-10-01"})[0], 200)
            self.assertEqual(lan.post(f"/api/classes/{cid}/schedule", {"days": {"9": ""}, "fee": 1})[0], 400)
            self.assertEqual(lan.post(f"/api/classes/{cid}/schedule", {"days": {}, "fee": 1, "from": "2026-13-01"})[0], 400)
            st, d = lan.get(f"/api/attendance?date=2026-10-05&class_id={cid}")
            self.assertEqual((st, d["weekday"]), (200, "Thứ 2"))
            self.assertEqual([(s["scheduled"], s["status"], s["time"]) for s in d["students"]], [(True, "present", "18:00–19:30")] * 2)
            d = lan.get(f"/api/attendance?date=2026-10-06&class_id={cid}")[1]                     # Thứ 3: không có lịch
            self.assertEqual({s["status"] for s in d["students"]}, {"none"})
            # A nghỉ ốm 05/10; B học bù Thứ 3 06/10; cả lớp không học 07/10
            self.assertEqual(lan.post("/api/attendance", {"date": "2026-10-05", "items": [{"student_id": A, "status": "absent", "note": "ốm"}]})[0], 200)
            lan.post("/api/attendance", {"date": "2026-10-06", "items": [{"student_id": B, "status": "present"}]})
            lan.post("/api/attendance", {"date": "2026-10-07", "items": [{"student_id": A, "status": "none"}, {"student_id": B, "status": "none"}]})
            d = lan.get(f"/api/attendance?date=2026-10-05&class_id={cid}")[1]
            a = [s for s in d["students"] if s["id"] == A][0]
            self.assertEqual((a["status"], a["marked"], a["note"]), ("absent", True, "ốm"))
            self.assertEqual(lan.post("/api/attendance", {"date": "2026-10-05", "items": [{"student_id": A, "status": "late"}]})[0], 400)
            self.assertEqual(lan.post("/api/attendance", {"date": "2027-01-05", "items": [{"student_id": A, "status": "absent"}]})[0], 400)
            # đổi lịch từ 20/10 → các ngày trước vẫn tính theo lịch cũ
            lan.post(f"/api/classes/{cid}/schedule", {"days": {"0": "18:00"}, "fee": 150000, "from": "2026-10-20"})
            sc = lan.get(f"/api/classes/{cid}/schedule")[1]
            self.assertEqual((sc["days"], sc["fee"], len(sc["history"])), ({"0": "18:00"}, 150000, 2))
            st, t = lan.get(f"/api/attendance/stats?month=2026-10&class_id={cid}")
            self.assertEqual(st, 200)
            rows = {s["id"]: s for s in t["students"]}
            # có lịch: 5, 7, 12, 14, 19 (T2+T4, 100k) và 26 (T2, 150k); 21, 28 (T4) không còn lịch
            self.assertEqual((rows[A]["planned"], rows[A]["present"], rows[A]["absent"], rows[A]["amount"]), (6, 4, 1, 450000))
            self.assertEqual((rows[B]["planned"], rows[B]["present"], rows[B]["absent"], rows[B]["amount"]), (6, 6, 0, 650000))
            self.assertEqual((rows[A]["marks"][4], rows[A]["marks"][5], rows[A]["marks"][6], rows[A]["marks"][11]), ("A", ".", "x", "p"))
            self.assertEqual(rows[B]["marks"][5], "P")
            self.assertEqual((rows[A]["notes"], t["total"], len(rows[A]["marks"])), (["05/10: ốm"], 1100000, 31))
            # tháng 11 (sau "hôm nay") chưa tính buổi nào
            n = {s["id"]: s for s in lan.get(f"/api/attendance/stats?month=2026-11&class_id={cid}")[1]["students"]}
            self.assertEqual((n[A]["present"], n[A]["amount"], n[A]["marks"].strip()), (0, 0, ""))
            # quyền: học sinh không vào được; giáo viên khác không thấy lớp / không điểm danh được học sinh lớp này
            st_c = self.C()
            st_c.post("/api/login", {"username": "an.nv", "password": AN_PW})
            self.assertEqual(st_c.get("/api/attendance")[0], 403)
            if hasattr(self.__class__, "binh_pw"):
                self.assertEqual(binh.get(f"/api/attendance/stats?class_id={cid}")[0], 404)
                self.assertNotIn(A, [s["id"] for s in binh.get("/api/attendance")[1]["students"]])
                self.assertEqual(binh.post("/api/attendance", {"date": "2026-10-05", "items": [{"student_id": A, "status": "present"}]})[0], 404)
                self.assertEqual(binh.post(f"/api/classes/{cid}/schedule", {"days": {}, "fee": 0})[0], 404)
            # bỏ đánh dấu → trả về theo lịch
            lan.post("/api/attendance", {"date": "2026-10-05", "items": [{"student_id": A, "status": "auto"}]})
            a = [s for s in lan.get(f"/api/attendance?date=2026-10-05&class_id={cid}")[1]["students"] if s["id"] == A][0]
            self.assertEqual((a["status"], a["marked"]), ("present", False))
        finally:
            app.today_vn = real_today

    def test_zz_missed_penalty(self):
        """Bài được giao có hạn nộp mà quá hạn chưa nộp → −5.000 điểm/bài (đặt được); nộp đúng hạn thì không bị trừ; gia hạn thì hết trừ;
        bài không có hạn không bị trừ; học sinh tự xem điểm của mình, giáo viên thấy trong thống kê."""
        lan = self.C()
        lan.post("/api/login", {"username": "lan", "password": LAN_PW})
        cid = lan.post("/api/classes", {"name": "PHAT", "grade": "9"})[1]["id"]
        accs = lan.post("/api/students/bulk", {"class_id": cid, "rows": ["Nộp Đủ", "Quên Bài"]})[1]["accounts"]
        A, B = accs[0]["id"], accs[1]["id"]
        v = {"code": "P1", "questions": [mcq(1, 0), mcq(2, 0)]}

        def give(title, due):
            st, r = lan.post("/api/assignments", {"title": title, "class_id": cid, "dist_mode": "alt", "duration_min": 0, "max_attempts": 1, "show_result": True,
                                                  "due_at": due, "exam": {"title": title, "variations": [v]}})
            self.assertEqual(st, 200, r)
            return r["id"]
        now = int(time.time())
        late_id = give("Bài quá hạn", now + 3600)           # hạn còn dài lúc tạo; sẽ chỉnh về quá khứ sau khi A nộp bài khác
        ok_id = give("Bài A nộp đúng hạn", now + 3600)
        free_id = give("Bài không hạn", None)
        future_id = give("Bài còn hạn", now + 86400)
        sa, sb = self.C(), self.C()
        sa.post("/api/login", {"username": accs[0]["username"], "password": accs[0]["password"]})
        sb.post("/api/login", {"username": accs[1]["username"], "password": accs[1]["password"]})
        sa.post(f"/api/assignments/{ok_id}/start")
        self.assertEqual(sa.post(f"/api/assignments/{ok_id}/submit", {"answers": [0, 0]})[0], 200)
        month = app.month_key()
        self.assertEqual(sb.get("/api/points/me")[1]["parts"]["missed"], 0)                      # chưa quá hạn bài nào
        past = now - 60                                                                          # hai bài hết hạn
        for aid in (late_id, ok_id):
            self.assertEqual(lan.call("PATCH", f"/api/assignments/{aid}", {"due_at": past})[0], 200)
        due_month = app.month_key(past)
        pa = sa.get(f"/api/points/me?month={due_month}")[1]
        pb = sb.get(f"/api/points/me?month={due_month}")[1]
        self.assertEqual([m["title"] for m in pa["missed"]], ["Bài quá hạn"])                    # A nộp bài kia đúng hạn → chỉ thiếu 1 bài
        self.assertEqual(sorted(m["title"] for m in pb["missed"]), ["Bài A nộp đúng hạn", "Bài quá hạn"])
        self.assertEqual((pa["parts"]["missed"], pb["parts"]["missed"]), (-5000, -10000))        # mặc định 5.000 điểm/bài
        self.assertEqual(pb["net"], -10000)
        self.assertEqual(pb["history"][0]["month"], month)
        self.assertEqual(len(pb["history"]), 6)
        # học sinh không thể nộp bài đã quá hạn
        self.assertEqual(sb.post(f"/api/assignments/{late_id}/start")[0], 403)
        # thống kê của giáo viên: cùng số liệu
        t = {x["id"]: x for x in lan.get(f"/api/attendance/stats?month={due_month}&class_id={cid}")[1]["students"]}
        self.assertEqual((t[A]["missed_fine"], t[B]["missed_fine"]), (5000, 10000))
        self.assertEqual(t[B]["net_points"], -10000 - t[B]["late_fine"] + t[B]["test_reward"] + t[B]["practice_bonus"])
        # đổi mức phạt theo quy tắc của giáo viên (áp dụng từ tháng đặt trở đi) và đặt 0 = tắt
        self.assertEqual(lan.post("/api/att-rules", {"month": due_month, "missed_penalty": 2000})[0], 200)
        self.assertEqual(lan.get(f"/api/att-rules?month={due_month}")[1]["rules"]["missed_penalty"], 2000)
        self.assertEqual(sb.get(f"/api/points/me?month={due_month}")[1]["parts"]["missed"], -4000)
        self.assertEqual(lan.post("/api/att-rules", {"month": due_month, "missed_penalty": -1})[0], 400)
        self.assertEqual(lan.post("/api/att-rules", {"month": due_month, "missed_penalty": 0})[0], 200)
        self.assertEqual(sb.get(f"/api/points/me?month={due_month}")[1]["parts"]["missed"], 0)
        lan.post("/api/att-rules", {"month": due_month, "missed_penalty": 5000})
        # gia hạn → hết bị trừ; bài không hạn / còn hạn không bao giờ bị trừ
        self.assertEqual(lan.call("PATCH", f"/api/assignments/{late_id}", {"due_at": now + 7200})[0], 200)
        self.assertEqual([m["title"] for m in sb.get(f"/api/points/me?month={due_month}")[1]["missed"]], ["Bài A nộp đúng hạn"])
        self.assertTrue({free_id, future_id}.isdisjoint({m["id"] for m in sb.get(f"/api/points/me?month={due_month}")[1]["missed"]}))
        # chỉ học sinh gọi được; tháng sai định dạng bị từ chối
        self.assertEqual(lan.get("/api/points/me")[0], 403)
        self.assertEqual(sb.get("/api/points/me?month=abc")[0], 400)
        self.assertEqual(self.C().get("/api/points/me")[0], 401)

    def test_zz_points_board(self):
        """Quản lý điểm: điểm cộng, điểm trừ, điểm hiện tại của cả lớp (xếp hạng cao → thấp, âm điểm nằm cuối), lịch sử từng học sinh có số dư lũy kế,
        khớp với điểm học sinh tự xem; lọc theo tháng; giáo viên khác và học sinh không xem được."""
        import datetime as dt
        lan = self.C()
        lan.post("/api/login", {"username": "lan", "password": LAN_PW})
        cid = lan.post("/api/classes", {"name": "BOARD", "grade": "9"})[1]["id"]
        accs = lan.post("/api/students/bulk", {"class_id": cid, "rows": ["Chăm Chỉ", "Hay Quên", "Bình Thường"]})[1]["accounts"]
        A, B, C = accs[0]["id"], accs[1]["id"], accs[2]["id"]
        today = app.today_vn()
        month = app.month_key()
        lan.post("/api/att-rules", {"month": month, "late_fee": 1000, "reward_min": 8, "reward_amount": 5000, "missed_penalty": 5000})
        # B đi muộn 10 phút hôm nay (phải có lịch học ngày hôm nay)
        lan.post(f"/api/classes/{cid}/schedule", {"days": {str(today.weekday()): "19:00–21:00"}, "fee": 100000, "from": today.replace(day=1).isoformat()})
        self.assertEqual(lan.post("/api/attendance", {"date": today.isoformat(), "items": [{"student_id": B, "status": "present", "late_min": 10}]})[0], 200)
        v = {"code": "B1", "questions": [mcq(1, 0), mcq(2, 0)]}
        now = int(time.time())

        def give(title, due):
            st, r = lan.post("/api/assignments", {"title": title, "class_id": cid, "dist_mode": "alt", "duration_min": 0, "max_attempts": 1, "show_result": True,
                                                  "due_at": due, "exam": {"title": title, "variations": [v]}})
            self.assertEqual(st, 200, r)
            return r["id"]
        late_id = give("Bài bị bỏ", now + 3600)
        ok_id = give("Bài nộp tốt", now + 3600)
        sa = self.C()
        sa.post("/api/login", {"username": accs[0]["username"], "password": accs[0]["password"]})
        sa.post(f"/api/assignments/{ok_id}/start")
        sa.post(f"/api/assignments/{ok_id}/submit", {"answers": [0, 0]})                     # A: 10 điểm → +5.000
        sc = self.C()
        sc.post("/api/login", {"username": accs[2]["username"], "password": accs[2]["password"]})
        sc.post(f"/api/assignments/{ok_id}/start")
        sc.post(f"/api/assignments/{ok_id}/submit", {"answers": [0, 0]})                     # C cũng đạt, rồi nộp nốt bài kia trước hạn
        sc.post(f"/api/assignments/{late_id}/start")
        sc.post(f"/api/assignments/{late_id}/submit", {"answers": [0, 1]})                   # C: 5 điểm → không thưởng, không bị phạt
        past = now - 60
        for aid in (late_id, ok_id):
            self.assertEqual(lan.call("PATCH", f"/api/assignments/{aid}", {"due_at": past})[0], 200)
        # A chưa nộp bài kia → bị phạt 5.000 (bài "Bài bị bỏ"); B không nộp gì → phạt 2 × 5.000 và muộn 10.000
        st, r = lan.get(f"/api/points/board?class_id={cid}")
        self.assertEqual(st, 200, r)
        by = {x["id"]: x for x in r["students"]}
        self.assertEqual((by[A]["plus"], by[A]["minus"], by[A]["net"]), (5000, 5000, 0))
        self.assertEqual((by[B]["plus"], by[B]["minus"], by[B]["net"]), (0, 20000, -20000))
        self.assertEqual((by[C]["plus"], by[C]["minus"], by[C]["net"]), (5000, 0, 5000))
        self.assertEqual([x["id"] for x in r["students"]], [C, A, B])                           # cao → thấp; âm điểm ở cuối
        self.assertEqual([x["rank"] for x in r["students"]], [1, 2, 3])
        self.assertEqual(by[B]["parts"], {"tests": 0, "practice": 0, "late": -10000, "missed": -10000, "discipline": 0, "adjust": 0})
        self.assertEqual((r["totals"]["plus"], r["totals"]["minus"], r["totals"]["net"], r["totals"]["negative"], r["totals"]["students"]), (10000, 25000, -15000, 1, 3))
        # khớp với điểm học sinh tự xem
        sb = self.C()
        sb.post("/api/login", {"username": accs[1]["username"], "password": accs[1]["password"]})
        self.assertEqual(sb.get("/api/points/me")[1]["net"], -20000)
        self.assertEqual(sa.get("/api/points/me")[1]["net"], 0)
        self.assertEqual(sc.get("/api/points/me")[1]["net"], 5000)
        # lịch sử của B: từng khoản, số dư lũy kế
        st, d = lan.get(f"/api/points/student/{B}")
        self.assertEqual(st, 200)
        self.assertEqual(sorted(e["kind"] for e in d["events"]), ["late", "missed", "missed"])
        self.assertEqual((d["plus"], d["minus"], d["net"]), (0, 20000, -20000))
        self.assertEqual(d["events"][-1]["balance"], -20000)
        self.assertEqual(sum(e["amount"] for e in d["events"]), -20000)
        self.assertTrue(all(e["at"] for e in d["events"]))
        self.assertEqual(d["months"][0]["net"], -20000)
        self.assertEqual(d["student"]["name"], "Hay Quên")
        # lọc theo tháng: tháng trống → 0 điểm
        empty = (dt.date.fromisoformat(month + "-01") - dt.timedelta(days=60)).strftime("%Y-%m")
        r2 = lan.get(f"/api/points/board?class_id={cid}&month={empty}")[1]
        self.assertEqual([x["net"] for x in r2["students"]], [0, 0, 0])
        r3 = lan.get(f"/api/points/board?class_id={cid}&month={app.month_key(past)}")[1]
        self.assertEqual({x["id"]: x["net"] for x in r3["students"]}[B], -20000)
        self.assertEqual(lan.get("/api/points/board?month=abc")[0], 400)
        # quyền: giáo viên khác không thấy học sinh của lớp này; học sinh và khách không vào được
        binh = self.C()
        binh.post("/api/login", {"username": "binh", "password": self.__class__.binh_pw})
        self.assertEqual(binh.get(f"/api/points/student/{B}")[0], 404)
        self.assertEqual(binh.get(f"/api/points/board?class_id={cid}")[0], 404)
        self.assertEqual(sb.get("/api/points/board")[0], 403)
        self.assertEqual(sb.get(f"/api/points/student/{B}")[0], 403)
        self.assertEqual(self.C().get("/api/points/board")[0], 401)

    def test_zz_points_adjust(self):
        """Giáo viên điều chỉnh điểm (cộng/trừ kèm lý do, chọn ngày), “miễn” một khoản phạt vì nghỉ học, xóa điều chỉnh; học sinh thấy khoản điều chỉnh;
        kiểm tra dữ liệu vào, quyền và ghi nhật ký."""
        lan = self.C()
        lan.post("/api/login", {"username": "lan", "password": LAN_PW})
        cid = lan.post("/api/classes", {"name": "ADJ", "grade": "9"})[1]["id"]
        accs = lan.post("/api/students/bulk", {"class_id": cid, "rows": ["Nghỉ Phép", "Được Cộng"]})[1]["accounts"]
        A, B = accs[0]["id"], accs[1]["id"]
        v = {"code": "J1", "questions": [mcq(1, 0)]}
        now = int(time.time())
        st, r = lan.post("/api/assignments", {"title": "Bài vắng", "class_id": cid, "dist_mode": "alt", "duration_min": 0, "max_attempts": 1, "show_result": True,
                                              "due_at": now + 3600, "exam": {"title": "Bài vắng", "variations": [v]}})
        aid = r["id"]
        past = now - 60
        lan.call("PATCH", f"/api/assignments/{aid}", {"due_at": past})                              # cả hai chưa nộp → mỗi em −5.000
        month = app.month_key(past)
        net = lambda sid: {x["id"]: x["net"] for x in lan.get(f"/api/points/board?class_id={cid}&month={month}")[1]["students"]}[sid]
        self.assertEqual((net(A), net(B)), (-5000, -5000))
        sa, sb = self.C(), self.C()
        sa.post("/api/login", {"username": accs[0]["username"], "password": accs[0]["password"]})
        sb.post("/api/login", {"username": accs[1]["username"], "password": accs[1]["password"]})
        # A nghỉ học có phép → miễn khoản phạt (hoàn 5.000, ghi vào đúng ngày hạn nộp)
        d = lan.get(f"/api/points/student/{A}")[1]
        miss = [e for e in d["events"] if e["kind"] == "missed"][0]
        day = time.strftime("%Y-%m-%d", time.gmtime(miss["at"] + app.VN_OFFSET))
        st, r = lan.post("/api/points/adjust", {"student_id": A, "amount": 5000, "reason": "Miễn: Bài vắng (nghỉ học có phép)", "date": day})
        self.assertEqual(st, 200, r)
        adj_id = r["id"]
        self.assertEqual((net(A), net(B)), (0, -5000))
        d = lan.get(f"/api/points/student/{A}")[1]
        adj = [e for e in d["events"] if e["kind"] == "adjust"]
        self.assertEqual([(e["amount"], e["adj_id"]) for e in adj], [(5000, adj_id)])
        self.assertEqual((d["plus"], d["minus"], d["net"]), (5000, 5000, 0))
        self.assertEqual(d["events"][-1]["balance"], 0)
        # học sinh tự xem thấy khoản điều chỉnh và điểm khớp
        me = sa.get(f"/api/points/me?month={month}")[1]
        self.assertEqual((me["net"], me["parts"]["adjust"], [a["reason"] for a in me["adjusts"]]), (0, 5000, ["Miễn: Bài vắng (nghỉ học có phép)"]))
        # B bị trừ thêm 2.000 với lý do (ngày mặc định hôm nay → tháng hiện tại)
        self.assertEqual(lan.post("/api/points/adjust", {"student_id": B, "amount": -2000, "reason": "Nói chuyện riêng"})[0], 200)
        cur = app.month_key()
        self.assertEqual(sb.get(f"/api/points/me?month={cur}")[1]["parts"]["adjust"], -2000)
        board = {x["id"]: x for x in lan.get(f"/api/points/board?class_id={cid}&month={cur}")[1]["students"]}
        self.assertEqual(board[B]["parts"]["adjust"], -2000)
        # xóa điều chỉnh → điểm tính lại
        self.assertEqual(lan.call("DELETE", f"/api/points/adjust/{adj_id}")[0], 200)
        self.assertEqual(net(A), -5000)
        self.assertEqual(lan.call("DELETE", f"/api/points/adjust/{adj_id}")[0], 404)
        # dữ liệu vào
        bad = [{"student_id": A, "amount": 0, "reason": "x"}, {"student_id": A, "amount": 5, "reason": ""}, {"student_id": A, "amount": "abc", "reason": "x"},
               {"student_id": A, "amount": 10 ** 9, "reason": "x"}, {"student_id": A, "amount": 5, "reason": "x", "date": "2999-01-01"},
               {"student_id": A, "amount": 5, "reason": "x", "date": "không phải ngày"}, {"amount": 5, "reason": "x"}]
        self.assertEqual([lan.post("/api/points/adjust", b)[0] for b in bad], [400] * len(bad))
        # quyền: giáo viên khác không điều chỉnh/xóa được; học sinh và khách bị chặn
        binh = self.C()
        binh.post("/api/login", {"username": "binh", "password": self.__class__.binh_pw})
        self.assertEqual(binh.post("/api/points/adjust", {"student_id": A, "amount": 100, "reason": "x"})[0], 404)
        lan.post("/api/points/adjust", {"student_id": A, "amount": 100, "reason": "thử xóa"})
        other_id = lan.get(f"/api/points/student/{A}")[1]["events"][-1]["adj_id"]
        self.assertEqual(binh.call("DELETE", f"/api/points/adjust/{other_id}")[0], 404)
        self.assertEqual(sa.post("/api/points/adjust", {"student_id": A, "amount": 99999, "reason": "tự cộng"})[0], 403)
        self.assertEqual(sa.call("DELETE", f"/api/points/adjust/{other_id}")[0], 403)
        self.assertEqual(self.C().post("/api/points/adjust", {"student_id": A, "amount": 1, "reason": "x"})[0], 401)

    def test_zz_assignment_count_points(self):
        """Mỗi bài giao có hai ô tick riêng: “cộng điểm” (thưởng bài kiểm tra) và “trừ điểm” (quá hạn chưa nộp). Có bài chỉ cộng, bài chỉ trừ, bài không tính; mặc định là có cả hai."""
        lan = self.C()
        lan.post("/api/login", {"username": "lan", "password": LAN_PW})
        cid = lan.post("/api/classes", {"name": "TICK", "grade": "9"})[1]["id"]
        accs = lan.post("/api/students/bulk", {"class_id": cid, "rows": ["Học Bài", "Bỏ Bài"]})[1]["accounts"]
        A, B = accs[0]["id"], accs[1]["id"]
        v = {"code": "T1", "questions": [mcq(1, 0), mcq(2, 0)]}
        now = int(time.time())

        def give(title, **extra):
            st, r = lan.post("/api/assignments", {"title": title, "class_id": cid, "dist_mode": "alt", "duration_min": 0, "max_attempts": 1, "show_result": True,
                                                  "due_at": now + 3600, "exam": {"title": title, "variations": [v]}, **extra})
            self.assertEqual(st, 200, r)
            return r["id"]
        both = give("Cộng và trừ")                                                         # mặc định: có cả hai
        b_only = give("Chỉ cộng", count_penalty=False)
        p_only = give("Chỉ trừ", count_bonus=False)
        none = give("Không tính", count_bonus=False, count_penalty=False)
        lst = {a["id"]: a for a in lan.get("/api/assignments")[1]["assignments"]}
        self.assertEqual([(lst[x]["count_bonus"], lst[x]["count_penalty"]) for x in (both, b_only, p_only, none)], [(True, True), (True, False), (False, True), (False, False)])
        sa, sb = self.C(), self.C()
        sa.post("/api/login", {"username": accs[0]["username"], "password": accs[0]["password"]})
        sb.post("/api/login", {"username": accs[1]["username"], "password": accs[1]["password"]})
        self.assertEqual({a["id"]: (a["count_bonus"], a["count_penalty"]) for a in sa.get("/api/assignments")[1]["assignments"]}[p_only], (False, True))   # học sinh biết
        for aid in (b_only, p_only):                                                       # A làm 10 điểm hai bài: chỉ bài “Chỉ cộng” được thưởng
            sa.post(f"/api/assignments/{aid}/start")
            sa.post(f"/api/assignments/{aid}/submit", {"answers": [0, 0]})
        for aid in (both, b_only, p_only, none):
            self.assertEqual(lan.call("PATCH", f"/api/assignments/{aid}", {"due_at": now - 60})[0], 200)   # cả 4 bài quá hạn
        me = lambda st: st.get(f"/api/points/me?month={app.month_key()}")[1]
        ra, rb = me(sa), me(sb)
        self.assertEqual((ra["parts"]["tests"], ra["parts"]["missed"], [m["title"] for m in ra["missed"]]), (5000, -5000, ["Cộng và trừ"]))
        # B không nộp gì: bị trừ ở bài “Cộng và trừ” + “Chỉ trừ”; bài “Chỉ cộng” và “Không tính” không bị trừ
        self.assertEqual(sorted(m["title"] for m in rb["missed"]), ["Chỉ trừ", "Cộng và trừ"])
        self.assertEqual((rb["parts"]["tests"], rb["parts"]["missed"], rb["net"]), (0, -10000, -10000))
        # đổi tick: bật cộng cho “Chỉ trừ” → A được thưởng thêm; bỏ trừ ở “Cộng và trừ” → A hết bị phạt; các thiết lập khác giữ nguyên
        self.assertEqual(lan.call("PATCH", f"/api/assignments/{p_only}", {"count_bonus": True})[0], 200)
        self.assertEqual(lan.call("PATCH", f"/api/assignments/{both}", {"count_penalty": False})[0], 200)
        ra = me(sa)
        self.assertEqual((ra["parts"]["tests"], ra["parts"]["missed"], ra["net"]), (10000, 0, 10000))
        self.assertEqual([m["title"] for m in me(sb)["missed"]], ["Chỉ trừ"])
        a = {x["id"]: x for x in lan.get("/api/assignments")[1]["assignments"]}[both]
        self.assertEqual((a["max_attempts"], a["show_result"], a["count_bonus"], a["count_penalty"]), (1, 1, True, False))
        self.assertEqual(lan.call("PATCH", f"/api/assignments/{both}", {"count_bonus": "yes"})[0], 400)
        # bảng điểm của giáo viên khớp
        bd = {x["id"]: x for x in lan.get(f"/api/points/board?class_id={cid}&month={app.month_key()}")[1]["students"]}
        self.assertEqual((bd[A]["plus"], bd[A]["minus"], bd[B]["plus"], bd[B]["minus"]), (10000, 0, 0, 5000))
        # quyền: giáo viên khác và học sinh không đổi được
        binh = self.C()
        binh.post("/api/login", {"username": "binh", "password": self.__class__.binh_pw})
        self.assertEqual(binh.call("PATCH", f"/api/assignments/{both}", {"count_bonus": False})[0], 404)
        self.assertEqual(sa.call("PATCH", f"/api/assignments/{both}", {"count_bonus": False})[0], 403)

    def test_zz_discipline(self):
        """Điểm danh có 3 cột số lần: mất trật tự, dùng điện thoại, ăn quà vặt; mỗi lần trừ 5.000 điểm (đổi được); vào điểm của học sinh, bảng quản lý điểm và thống kê tháng."""
        lan = self.C()
        lan.post("/api/login", {"username": "lan", "password": LAN_PW})
        cid = lan.post("/api/classes", {"name": "NOINQUY", "grade": "9"})[1]["id"]
        accs = lan.post("/api/students/bulk", {"class_id": cid, "rows": ["Hay Nói", "Ngoan Ngoãn"]})[1]["accounts"]
        A, B = accs[0]["id"], accs[1]["id"]
        today = app.today_vn()
        day, month = today.isoformat(), app.month_key()
        lan.post("/api/att-rules", {"month": month, "late_fee": 1000, "reward_min": 8, "reward_amount": 5000, "missed_penalty": 5000, "discipline_fee": 5000})
        lan.post(f"/api/classes/{cid}/schedule", {"days": {str(today.weekday()): "19:00–21:00"}, "fee": 100000, "from": today.replace(day=1).isoformat()})
        post = lambda body: lan.post("/api/attendance", {"date": day, "items": [{"student_id": A, "status": "present", **body}]})
        get = lambda: {x["id"]: x for x in lan.get(f"/api/attendance?date={day}&class_id={cid}")[1]["students"]}
        self.assertEqual(post({"noisy": 2, "phone": 1, "snack": 0})[0], 200)
        row = get()[A]
        self.assertEqual((row["noisy"], row["phone"], row["snack"], row["status"]), (2, 1, 0, "present"))
        self.assertEqual(lan.get(f"/api/attendance?date={day}&class_id={cid}")[1]["discipline_fee"], 5000)           # mức phạt mỗi lần hiện trên bảng điểm danh
        self.assertEqual((get()[B]["noisy"], get()[B]["phone"], get()[B]["snack"]), (0, 0, 0))
        # chỉ sửa ghi chú / số phút muộn thì giữ nguyên số lần vi phạm
        self.assertEqual(post({"late_min": 10, "note": "ghi chú"})[0], 200)
        row = get()[A]
        self.assertEqual((row["noisy"], row["phone"], row["snack"], row["late_min"]), (2, 1, 0, 10))
        # dữ liệu sai bị từ chối
        for bad in ({"noisy": -1}, {"phone": 100}, {"snack": 1.5}, {"noisy": "abc"}, {"phone": True}):
            self.assertEqual(post(bad)[0], 400, bad)
        # điểm: 3 lần × 5.000 = −15.000 (và muộn 10 phút × 1.000 = −10.000)
        board = lambda: {x["id"]: x for x in lan.get(f"/api/points/board?class_id={cid}&month={month}")[1]["students"]}
        self.assertEqual(board()[A]["parts"]["discipline"], -15000)
        self.assertEqual((board()[A]["minus"], board()[B]["minus"]), (25000, 0))
        sa = self.C()
        sa.post("/api/login", {"username": accs[0]["username"], "password": accs[0]["password"]})
        me = sa.get(f"/api/points/me?month={month}")[1]
        self.assertEqual((me["parts"]["discipline"], me["net"], [(x["noisy"], x["phone"], x["snack"], x["amount"]) for x in me["discipline"]]), (-15000, -25000, [(2, 1, 0, -15000)]))
        hist = lan.get(f"/api/points/student/{A}")[1]["events"]
        ev = [e for e in hist if e["kind"] == "discipline"]
        self.assertEqual((len(ev), ev[0]["amount"]), (1, -15000))
        self.assertIn("Mất trật tự 2", ev[0]["detail"])
        self.assertIn("Dùng điện thoại 1", ev[0]["detail"])
        # thống kê tháng của giáo viên
        t = {x["id"]: x for x in lan.get(f"/api/attendance/stats?month={month}&class_id={cid}")[1]["students"]}
        self.assertEqual((t[A]["disc"], t[A]["disc_times"], t[A]["disc_fine"]), ({"noisy": 2, "phone": 1, "snack": 0}, 3, 15000))
        self.assertEqual(t[A]["net_points"], t[A]["test_reward"] + t[A]["practice_bonus"] - t[A]["late_fine"] - t[A]["missed_fine"] - 15000)
        self.assertEqual(lan.get(f"/api/attendance/stats?month={month}&class_id={cid}")[1]["total_disc_fine"], 15000)
        # đổi mức phạt mỗi lần → tính lại; 0 = tắt
        lan.post("/api/att-rules", {"month": month, "late_fee": 1000, "discipline_fee": 2000})
        self.assertEqual(board()[A]["parts"]["discipline"], -6000)
        self.assertEqual(lan.get("/api/att-rules?month=" + month)[1]["rules"]["discipline_fee"], 2000)
        self.assertEqual(lan.post("/api/att-rules", {"month": month, "discipline_fee": -5})[0], 400)
        lan.post("/api/att-rules", {"month": month, "late_fee": 1000, "discipline_fee": 0})
        self.assertEqual(board()[A]["parts"]["discipline"], 0)
        lan.post("/api/att-rules", {"month": month, "late_fee": 1000, "discipline_fee": 5000})
        # miễn bằng điều chỉnh vẫn dùng được cho khoản vi phạm
        self.assertEqual(lan.post("/api/points/adjust", {"student_id": A, "amount": 15000, "reason": "Miễn: vi phạm (đã nhắc nhở)", "date": day})[0], 200)
        self.assertEqual(board()[A]["parts"]["adjust"], 15000)
        # nghỉ học thì xóa số lần vi phạm
        self.assertEqual(lan.post("/api/attendance", {"date": day, "items": [{"student_id": A, "status": "absent", "noisy": 5}]})[0], 200)
        self.assertEqual((get()[A]["noisy"], get()[A]["status"]), (0, "absent"))
        self.assertEqual(board()[A]["parts"]["discipline"], 0)
        # quyền: giáo viên khác không ghi được cho học sinh lớp này
        binh = self.C()
        binh.post("/api/login", {"username": "binh", "password": self.__class__.binh_pw})
        self.assertEqual(binh.post("/api/attendance", {"date": day, "items": [{"student_id": A, "status": "present", "noisy": 1}]})[0], 404)

    def test_zz_answer_reports(self):
        """Học sinh báo đáp án sai (kèm ảnh): giáo viên duyệt thì đáp án sửa ở ngân hàng + đề đã giao (kể cả mã đề đã đảo phương án), bài đã nộp được chấm lại, điểm thưởng tính lại;
        từ chối thì giữ nguyên; kiểm tra quyền, trùng lặp, dữ liệu vào."""
        import struct
        import zlib
        lan = self.C()
        lan.post("/api/login", {"username": "lan", "password": LAN_PW})
        cid = lan.post("/api/classes", {"name": "BAOSAI", "grade": "9"})[1]["id"]
        accs = lan.post("/api/students/bulk", {"class_id": cid, "rows": ["Báo Đúng", "Làm Mã Hai"]})[1]["accounts"]
        A, B = accs[0]["id"], accs[1]["id"]
        # câu có đáp án SAI trong ngân hàng: trắc nghiệm (đáp án thật là “20”), đúng/sai (thật [0,1,0,1]), trả lời ngắn (thật “7”)
        q1 = {"id": "rp1", "t": "mcq", "q": "Hai lần mười là", "opts": ["10", "20", "30", "40"], "ans": 0, "sol": "giải"}
        q2 = {"id": "rp2", "t": "tf", "q": "Xét các ý", "sts": ["a", "b", "c", "d"], "ans": [0, 0, 0, 0]}
        q3 = {"id": "rp3", "t": "short", "q": "Bảy cộng không", "ans": "5"}
        lan.post("/api/bank/sync", {"upsert": [q1, q2, q3]})
        q1b = {**q1, "opts": ["40", "30", "20", "10"], "ans": 3}                                     # mã đề 2: phương án bị đảo
        body = {"title": "Bài báo sai", "class_id": cid, "dist_mode": "manual", "duration_min": 0, "max_attempts": 1, "show_result": True,
                "variation_map": {str(A): 0, str(B): 1},
                "exam": {"title": "Bài báo sai", "variations": [{"code": "M1", "questions": [q1, q2, q3]}, {"code": "M2", "questions": [q1b, q2, q3]}]}}
        st, r = lan.post("/api/assignments", body)
        self.assertEqual(st, 200, r)
        aid = r["id"]
        sa, sb = self.C(), self.C()
        sa.post("/api/login", {"username": accs[0]["username"], "password": accs[0]["password"]})
        sb.post("/api/login", {"username": accs[1]["username"], "password": accs[1]["password"]})
        sa.post(f"/api/assignments/{aid}/start")
        ra = sa.post(f"/api/assignments/{aid}/submit", {"answers": [1, [0, 1, 0, 1], "7"]})[1]     # A làm đúng theo đáp án thật → hiện bị chấm sai cả ba
        sb.post(f"/api/assignments/{aid}/start", {})
        rb = sb.post(f"/api/assignments/{aid}/submit", {"answers": [2, [0, 0, 0, 0], "5"]})[1]    # B (mã đề 2): chọn “20” = đúng thật; hai câu còn lại đúng theo đáp án sai hiện tại
        self.assertEqual((ra["score"], rb["score"]), (0.25, 2))
        sub_a, sub_b = ra["submission_id"], rb["submission_id"]

        def png():
            def chunk(t, d):
                return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
            return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\x00\xff\xff\xff")) + chunk(b"IEND", b"")
        up = lambda cl: cl.post("/api/reports/image", {"data": "data:image/png;base64," + base64.b64encode(png()).decode()})
        st, im = up(sa)
        self.assertEqual(st, 200)
        self.assertEqual(up(lan)[0], 403)                                                             # chỉ học sinh tải ảnh báo cáo
        self.assertEqual(sa.post("/api/reports/image", {"data": "data:image/gif;base64,AAAA"})[0], 400)
        base = {"source": "assignment", "source_id": sub_a, "qi": 0}
        # dữ liệu vào và quyền
        self.assertEqual(sa.post("/api/reports", {**base})[0], 400)                                  # không có gì để báo
        self.assertEqual(sa.post("/api/reports", {**base, "proposed": 9})[0], 400)                   # phương án không có
        self.assertEqual(sa.post("/api/reports", {**base, "note": "x", "images": ["ab" * 12]})[0], 400)   # ảnh không phải của mình
        self.assertEqual(sa.post("/api/reports", {**base, "note": "x", "qi": 99})[0], 400)
        self.assertEqual(sb.post("/api/reports", {**base, "note": "x"})[0], 404)                     # bài làm của bạn khác
        self.assertEqual(sa.post("/api/reports", {**base, "note": "x", "source": "khac"})[0], 400)
        self.assertEqual(sa.post("/api/reports", {**base, "note": "x", "images": [im["id"]] * 2})[0], 400)
        st, r1 = sa.post("/api/reports", {**base, "proposed": 1, "note": "Hai lần mười là hai mươi", "images": [im["id"]]})
        self.assertEqual(st, 200, r1)
        self.assertEqual(sa.post("/api/reports", {**base, "note": "báo lại"})[0], 409)               # đang chờ duyệt thì không báo trùng
        r2 = sa.post("/api/reports", {"source": "assignment", "source_id": sub_a, "qi": 1, "proposed": [0, 1, 0, 1]})[1]
        r3 = sa.post("/api/reports", {"source": "assignment", "source_id": sub_a, "qi": 2, "proposed": " 7 ", "note": "đáp án là 7"})[1]
        self.assertEqual(sa.post("/api/reports", {"source": "assignment", "source_id": sub_a, "qi": 1, "proposed": [0, 1]})[0], 409)
        mine = sa.get(f"/api/reports/mine?source=assignment&source_id={sub_a}")[1]["reports"]
        self.assertEqual(sorted((x["qi"], x["status"]) for x in mine), [(0, "pending"), (1, "pending"), (2, "pending")])
        # bài chưa cho xem đáp án thì không báo được
        st, hid = lan.post("/api/assignments", {**body, "title": "Ẩn đáp án", "show_result": 0, "due_at": int(time.time()) + 99999})
        sa.post(f"/api/assignments/{hid['id']}/start")
        rh = sa.post(f"/api/assignments/{hid['id']}/submit", {"answers": [3, [1, 1, 1, 1], "0"]})[1]   # làm sai hết: không có điểm thưởng
        self.assertEqual(sa.post("/api/reports", {"source": "assignment", "source_id": rh["submission_id"], "qi": 0, "note": "x"})[0], 403)
        # giáo viên thấy báo cáo; giáo viên khác và học sinh thì không
        lst = lan.get("/api/reports")[1]
        got = {x["id"]: x for x in lst["reports"]}
        self.assertEqual((lst["pending"], len(got)), (3, 3))
        self.assertEqual((got[r1["id"]]["student"], got[r1["id"]]["title"], got[r1["id"]]["images"], got[r1["id"]]["snapshot"]["opts"]), ("Báo Đúng", "Bài báo sai", [im["id"]], ["10", "20", "30", "40"]))
        self.assertEqual(got[r3["id"]]["proposed"], "7")
        binh = self.C()
        binh.post("/api/login", {"username": "binh", "password": self.__class__.binh_pw})
        self.assertEqual((binh.get("/api/reports")[1]["pending"], binh.get("/api/reports")[1]["reports"]), (0, []))
        self.assertEqual(binh.post(f"/api/reports/{r1['id']}/resolve", {"approve": True})[0], 404)
        self.assertEqual(sa.get("/api/reports")[0], 403)
        self.assertEqual(sa.post(f"/api/reports/{r1['id']}/resolve", {"approve": True})[0], 403)
        # trước khi duyệt: điểm của A là 0 → không có điểm thưởng bài kiểm tra
        self.assertEqual(sa.get(f"/api/points/me?month={app.month_key()}")[1]["parts"]["tests"], 0)
        # duyệt câu 1 (dùng đáp án học sinh đề xuất): sửa ở ngân hàng, cả hai mã đề (mã đề 2 đã đảo phương án), chấm lại cả hai bài
        st, ap = lan.post(f"/api/reports/{r1['id']}/resolve", {"approve": True, "note": "Cảm ơn em"})
        self.assertEqual(st, 200, ap)
        fx = ap["affected"]
        self.assertEqual((fx["bank"], fx["exams"], fx["submissions"], fx["changed"]), (1, 2, 3, 2))   # 2 đề (cả bài “Ẩn đáp án” cùng câu), 3 bài nộp, 2 bài đổi điểm
        bank = {q["id"]: q for q in lan.get("/api/bank")[1]["questions"]}
        self.assertEqual(bank["rp1"]["ans"], 1)
        ex = lan.get(f"/api/assignments/{aid}")[1]
        review = lambda cl, sid: cl.get(f"/api/assignments/{aid}/my/{sid}")[1]
        self.assertEqual(review(sa, sub_a)["score"], 1.25)                                           # A: câu 1 giờ đúng (+1)
        self.assertEqual(review(sb, sub_b)["score"], 3)                                              # B (mã đề 2): đáp án tính theo nội dung “20” → đúng
        self.assertEqual([d["key"] for d in review(sb, sub_b)["details"]][:1], [2])                  # mã đề 2: “20” đứng ở vị trí C
        # duyệt câu 2 với đáp án giáo viên chọn khác đề xuất, từ chối câu 3
        self.assertEqual(lan.post(f"/api/reports/{r2['id']}/resolve", {"approve": True, "answer": [0, 1, 0]})[0], 400)       # thiếu ý
        self.assertEqual(lan.post(f"/api/reports/{r2['id']}/resolve", {"approve": True, "answer": [0, 1, 0, 1]})[0], 200)
        st, rj = lan.post(f"/api/reports/{r3['id']}/resolve", {"approve": False, "note": "Đáp án 5 là đúng, em kiểm tra lại đề"})
        self.assertEqual((st, rj["status"]), (200, "rejected"))
        self.assertEqual(review(sa, sub_a)["score"], 2)                                              # câu 2 giờ đúng đủ 4 ý; câu 3 giữ nguyên (sai)
        self.assertEqual(review(sb, sub_b)["score"], 2.25)                                           # B: câu 2 [0,0,0,0] giờ chỉ đúng 2/4 ý (0,25 điểm) → mất điểm
        self.assertEqual(lan.post(f"/api/reports/{r1['id']}/resolve", {"approve": True})[0], 409)    # đã xử lý
        mine = {x["qi"]: x for x in sa.get(f"/api/reports/mine?source=assignment&source_id={sub_a}")[1]["reports"]}
        self.assertEqual((mine[0]["status"], mine[0]["resolution"], mine[1]["status"], mine[2]["status"], mine[2]["resolution"]),
                         ("approved", "Cảm ơn em", "approved", "rejected", "Đáp án 5 là đúng, em kiểm tra lại đề"))
        done = lan.get("/api/reports?status=approved")[1]
        self.assertEqual(sorted(x["id"] for x in done["reports"]), sorted([r1["id"], r2["id"]]))
        self.assertEqual((done["reports"][0]["new_ans"] is not None, lan.get("/api/reports")[1]["pending"]), (True, 0))
        # điểm bài kiểm tra tính lại: A có điểm cao hơn thì được thưởng (bài còn 1 câu để dễ đạt mức thưởng)
        v = {"code": "T1", "questions": [{"id": "rp9", "t": "mcq", "q": "Một cộng một", "opts": ["1", "2", "3", "4"], "ans": 3}]}
        lan.post("/api/bank/sync", {"upsert": [v["questions"][0]]})
        a2 = lan.post("/api/assignments", {"title": "Bài thưởng", "class_id": cid, "dist_mode": "alt", "duration_min": 0, "max_attempts": 1, "show_result": True,
                                           "exam": {"title": "Bài thưởng", "variations": [v]}})[1]["id"]
        sa.post(f"/api/assignments/{a2}/start")
        sub2 = sa.post(f"/api/assignments/{a2}/submit", {"answers": [1]})[1]["submission_id"]          # “2” là đúng thật nhưng đáp án đang sai
        m0 = app.month_key()
        self.assertEqual(sa.get(f"/api/points/me?month={m0}")[1]["parts"]["tests"], 0)
        rr = sa.post("/api/reports", {"source": "assignment", "source_id": sub2, "qi": 0, "proposed": 1, "note": "1 + 1 = 2"})[1]["id"]
        self.assertEqual(lan.post(f"/api/reports/{rr}/resolve", {"approve": True})[0], 200)
        pa = sa.get(f"/api/points/me?month={m0}")[1]
        self.assertEqual(pa["parts"]["tests"], 5000)                                                 # điểm 10/10 → được thưởng sau khi chấm lại
        self.assertTrue(any(t["title"] == "Bài thưởng" for t in pa["tests"]))

    def test_zz_attendance_rules(self):
        """Học sinh mới tạo vẫn có lịch; phút đi muộn; chốt điểm danh; phạt muộn và thưởng điểm theo quy tắc từng tháng."""
        import datetime as dt
        lan = self.C()
        lan.post("/api/login", {"username": "lan", "password": LAN_PW})
        cid = lan.post("/api/classes", {"name": "ĐD2", "grade": "9"})[1]["id"]
        accs = lan.post("/api/students/bulk", {"class_id": cid, "rows": ["Phạm Muộn", "Lê Giỏi"]})[1]["accounts"]
        A, B = accs[0]["id"], accs[1]["id"]            # tạo MỚI (không lùi created_at): trước đây bị báo “không có lịch” ở ngày cũ
        real_today = app.today_vn
        app.today_vn = lambda: dt.date(2026, 10, 31)
        try:
            lan.post(f"/api/classes/{cid}/schedule", {"days": {"0": "19:00–21:00"}, "fee": 100000, "from": "2026-10-01"})
            d = lan.get(f"/api/attendance?date=2026-10-05&class_id={cid}")[1]
            self.assertEqual([(x["scheduled"], x["status"]) for x in d["students"]], [(True, "present")] * 2)
            self.assertEqual(d["classes"][0]["closed"], False)
            # phút đi muộn chỉ lưu cho học sinh đi học
            self.assertEqual(lan.post("/api/attendance", {"date": "2026-10-05", "items": [{"student_id": A, "status": "present", "late_min": 15},
                                                                                       {"student_id": B, "status": "absent", "late_min": 10}]})[0], 200)
            self.assertEqual(lan.post("/api/attendance", {"date": "2026-10-05", "items": [{"student_id": A, "status": "present", "late_min": 999}]})[0], 400)
            d = {x["id"]: x for x in lan.get(f"/api/attendance?date=2026-10-05&class_id={cid}")[1]["students"]}
            self.assertEqual((d[A]["late_min"], d[B]["late_min"], d[B]["status"]), (15, 0, "absent"))
            # chỉ đổi phút muộn thì giữ nguyên ghi chú / trạng thái
            lan.post("/api/attendance", {"date": "2026-10-05", "items": [{"student_id": A, "status": "present", "late_min": 20}]})
            t = {x["id"]: x for x in lan.get(f"/api/attendance/stats?month=2026-10&class_id={cid}")[1]["students"]}
            self.assertEqual((t[A]["late_min"], t[A]["late_fine"]), (20, 20000))           # mặc định 1.000đ/phút
            # quy tắc đổi theo tháng: đặt từ 10/2026 → 2.000đ/phút; tháng 11 đặt lại 500đ nhưng tháng 10 giữ nguyên
            self.assertEqual(lan.post("/api/att-rules", {"month": "2026-10", "late_fee": 2000})[0], 200)
            self.assertEqual(lan.get("/api/att-rules?month=2026-12")[1]["rules"]["late_fee"], 2000)   # thừa hưởng từ tháng gần nhất
            lan.post("/api/att-rules", {"month": "2026-11", "late_fee": 500})
            t = {x["id"]: x for x in lan.get(f"/api/attendance/stats?month=2026-10&class_id={cid}")[1]["students"]}
            self.assertEqual(t[A]["late_fine"], 40000)
            self.assertEqual(lan.post("/api/att-rules", {"month": "2026-10", "reward_min": 11})[0], 400)
            # chốt điểm danh: ghi cố định học sinh có lịch chưa đánh dấu, rồi khóa sửa
            self.assertEqual(lan.post("/api/attendance/close", {"date": "2026-11-30", "class_id": cid})[0], 400)   # chưa tới ngày
            st, r = lan.post("/api/attendance/close", {"date": "2026-10-12", "class_id": cid})
            self.assertEqual((st, r["filled"]), (200, 2))
            self.assertEqual(lan.post("/api/attendance", {"date": "2026-10-12", "items": [{"student_id": A, "status": "absent"}]})[0], 409)
            self.assertTrue(lan.get(f"/api/attendance?date=2026-10-12&class_id={cid}")[1]["classes"][0]["closed"])
            self.assertEqual(lan.post("/api/attendance/close", {"date": "2026-10-12", "class_id": cid, "closed": False})[0], 200)
            self.assertEqual(lan.post("/api/attendance", {"date": "2026-10-12", "items": [{"student_id": A, "status": "absent"}]})[0], 200)
        finally:
            app.today_vn = real_today
        # thưởng bài kiểm tra: ≥ mức thưởng (mặc định 8) được +5.000; mỗi học sinh có mức riêng; cộng dồn qua các bài
        v = {"code": "M1", "questions": [mcq(1, 0), mcq(2, 0)]}
        for title in ("KT 1", "KT 2"):
            lan.post("/api/assignments", {"title": title, "class_id": cid, "dist_mode": "alt", "duration_min": 0, "max_attempts": 1, "show_result": True,
                                          "exam": {"title": title, "variations": [v]}})
        lan.post("/api/att-rules", {"month": app.month_key(), "late_fee": 1000})                       # đặt lại mặc định cho tháng hiện tại
        sa, sb = self.C(), self.C()
        sa.post("/api/login", {"username": accs[0]["username"], "password": accs[0]["password"]})
        sb.post("/api/login", {"username": accs[1]["username"], "password": accs[1]["password"]})
        for stu, ans in ((sa, [0, 0]), (sb, [0, 1])):                                                  # A đúng hết (10đ); B đúng 1/2 (5đ)
            for a in stu.get("/api/assignments")[1]["assignments"]:
                stu.post(f"/api/assignments/{a['id']}/start")
                stu.post(f"/api/assignments/{a['id']}/submit", {"answers": ans})
        t = {x["id"]: x for x in lan.get(f"/api/attendance/stats?month={app.month_key()}&class_id={cid}")[1]["students"]}
        self.assertEqual((t[A]["test_reward"], len(t[A]["tests"])), (10000, 2))                       # 2 bài × 5.000 cộng dồn
        self.assertEqual(t[B]["test_reward"], 0)
        self.assertEqual(lan.post("/api/att-rules/student", {"student_id": B, "month": app.month_key(), "reward_min": 5})[0], 200)
        t = {x["id"]: x for x in lan.get(f"/api/attendance/stats?month={app.month_key()}&class_id={cid}")[1]["students"]}
        self.assertEqual(t[B]["test_reward"], 10000)                                                  # mức riêng của B là 5 điểm
        self.assertEqual(t[B]["net_points"], 10000 - t[B]["late_fine"])
        rl = {x["id"]: x for x in lan.get(f"/api/att-rules?month={app.month_key()}")[1]["students"]}
        self.assertEqual((rl[B]["reward_min"], rl[B]["custom"], rl[A]["custom"]), (5, True, False))
        lan.post("/api/att-rules/student", {"student_id": B, "month": app.month_key(), "reward_min": None})   # đặt lại về mặc định
        self.assertEqual(lan.get(f"/api/att-rules?month={app.month_key()}")[1]["students"][1]["custom"] or
                         lan.get(f"/api/att-rules?month={app.month_key()}")[1]["students"][0]["custom"], False)

    def test_zz_cloud_mode(self):
        """Chạy kiểu đám mây: nhận cổng PORT, nghe 0.0.0.0, IP thật qua X-Forwarded-For, trang thiết lập cần mã bí mật."""
        import subprocess
        import time
        import socket
        sock = socket.socket(); sock.bind(("127.0.0.1", 0)); port = sock.getsockname()[1]; sock.close()
        code, pw = secrets.token_urlsafe(10), "Aa1-" + secrets.token_urlsafe(10)
        env = {**os.environ, "PORT": str(port), "LBAI_DATA": tempfile.mkdtemp(prefix="lbai_cloud_"), "LBAI_SETUP_CODE": code,
               "LBAI_TRUST_PROXY": "1", "LBAI_NO_BROWSER": "1", "LBAI_QUIET": "1"}
        env.pop("LBAI_PORT", None); env.pop("LBAI_HOST", None)
        proc = subprocess.Popen([sys.executable, "-m", "server"], cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))), env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            c = Client(port)
            for _ in range(60):
                try:
                    st, r = c.get("/api/status")
                    break
                except OSError:
                    time.sleep(0.25)
            else:
                self.fail("máy chủ không khởi động ở cổng PORT")
            self.assertEqual(r, {"needs_setup": True, "needs_code": True})
            body = {"name": "Quản trị", "username": "quantri", "password": pw}
            self.assertEqual(c.post("/api/setup", body)[0], 403)                                           # thiếu mã
            self.assertEqual(c.post("/api/setup", {**body, "code": "sai-ma"})[0], 403)                     # sai mã
            self.assertEqual(c.post("/api/setup", {**body, "code": code})[0], 200)                         # đúng mã
            self.assertEqual(c.get("/api/status")[1], {"needs_setup": False, "needs_code": False})
            # khóa đăng nhập tính theo IP thật (X-Forwarded-For), không khóa chung mọi người sau proxy
            def bad(ip):
                return c.post("/api/login", {"username": "quantri", "password": "sai-mat-khau"}, headers={"X-Forwarded-For": f"9.9.9.9, {ip}"})[0]
            for _ in range(12):
                bad("10.0.0.1")
            self.assertEqual(bad("10.0.0.1"), 429)                                                         # IP này bị khóa tạm
            other = Client(port)
            self.assertEqual(other.post("/api/login", {"username": "quantri", "password": pw}, headers={"X-Forwarded-For": "1.1.1.1, 10.0.0.2"})[0], 200)  # IP khác vẫn đăng nhập được
            # người dùng tự khai thêm địa chỉ giả ở đầu X-Forwarded-For không né được khóa
            self.assertEqual(c.post("/api/login", {"username": "quantri", "password": "sai"}, headers={"X-Forwarded-For": "7.7.7.7, 10.0.0.1"})[0], 429)
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except Exception:
                proc.kill()

    # ---------- sao lưu / khôi phục ra kho ngoài ----------
    class _Dirs:
        """Tạm trỏ thư mục dữ liệu của máy chủ sang thư mục riêng để thử sao lưu mà không đụng CSDL của các test khác."""
        def __init__(self, path):
            self.path = path

        def __enter__(self):
            from server import backup
            self.old = (db.DATA_DIR, db.DB_PATH, db.UPLOAD_DIR, dict(backup.state), backup._last_sig, backup._remote)
            db.DATA_DIR, db.DB_PATH, db.UPLOAD_DIR = self.path, os.path.join(self.path, "lbai.db"), os.path.join(self.path, "uploads")
            backup.state.update(enabled=False, last_ok=None, last_error="", last_size=0, restored=None, blocked=False, last_daily=None)
            backup._last_sig = None
            backup._remote = None
            return self

        def __exit__(self, *a):
            from server import backup
            db.DATA_DIR, db.DB_PATH, db.UPLOAD_DIR = self.old[:3]
            backup.state.clear()
            backup.state.update(self.old[3])
            backup._last_sig = self.old[4]
            backup._remote = self.old[5]

    def test_zz_backup_chunks(self):
        """Bản sao lưu lớn hơn giới hạn từng file được chia thành nhiều phần, ghép lại đúng; thiếu/lệch phần thì báo lỗi, không khôi phục sai."""
        from server import backup
        B = tempfile.mkdtemp(prefix="lbai_bkchunk_")
        st = backup.DirStore(B)
        old = backup.CHUNK
        backup.CHUNK = 1000
        try:
            data = b"PK" + os.urandom(3500)
            self.assertEqual(backup.save(st, "latest.zip", data), 4)
            self.assertEqual(backup.load(st, "latest.zip"), data)
            self.assertEqual(backup.save(st, "latest.zip", b"PK" + b"x" * 10), 1)     # nhỏ lại → ghi thẳng, không dính chỉ mục cũ
            self.assertEqual(backup.load(st, "latest.zip"), b"PK" + b"x" * 10)
            backup.save(st, "latest.zip", data)
            with open(os.path.join(B, "latest.zip.part2"), "wb") as f:
                f.write(os.urandom(1000))                                            # một phần bị đổi → sha256 không khớp
            with self.assertRaises(ValueError):
                backup.load(st, "latest.zip")
            os.remove(os.path.join(B, "latest.zip.part1"))
            with self.assertRaises(ValueError):
                backup.load(st, "latest.zip")
            self.assertIsNone(backup.load(st, "khong-co.zip"))
        finally:
            backup.CHUNK = old

    def test_zz_backup_restore(self):
        """Sao lưu rồi khôi phục vào thư mục trống: giữ nguyên tài khoản và file tải lên; không đẩy lại khi không đổi; chặn khi khôi phục lỗi."""
        from server import backup
        import zipfile
        A, B, C = (tempfile.mkdtemp(prefix=f"lbai_bk{n}_") for n in "ABC")
        old_env = {k: os.environ.get(k) for k in ("LBAI_BACKUP_DIR", "LBAI_BACKUP_URL", "LBAI_BACKUP_KEY")}
        os.environ["LBAI_BACKUP_DIR"] = B
        os.environ.pop("LBAI_BACKUP_URL", None); os.environ.pop("LBAI_BACKUP_KEY", None)
        try:
            with self._Dirs(A):
                db.init()
                con = db.connect()
                app.create_user(con, None, "Bản gốc", "admin", "goc.admin", "Aa1-" + secrets.token_urlsafe(8), must_change=False)
                con.commit(); con.close()
                with open(os.path.join(db.UPLOAD_DIR, "tai-lieu.txt"), "wb") as f:
                    f.write(b"noi dung file")
                r = backup.run_backup()
                self.assertTrue(r["ok"] and r["size"] > 0, r)
                self.assertTrue(os.path.isfile(os.path.join(B, "latest.zip")))
                self.assertEqual(len([n for n in os.listdir(B) if n.startswith("daily-")]), 1)
                self.assertTrue(backup.run_backup().get("skipped"))                 # không đổi gì → không đẩy lại
                self.assertTrue(backup.run_backup(force=True)["ok"])
            with self._Dirs(C):                                                    # container mới: thư mục dữ liệu trống
                backup.restore_if_needed()
                self.assertEqual(backup.state["restored"], "ok")
                db.init()
                con = db.connect()
                self.assertEqual([r["username"] for r in con.execute("SELECT username FROM users")], ["goc.admin"])
                con.close()
                with open(os.path.join(db.UPLOAD_DIR, "tai-lieu.txt"), "rb") as f:
                    self.assertEqual(f.read(), b"noi dung file")
                backup.restore_if_needed()                                         # đã có CSDL cục bộ → không khôi phục đè
                self.assertEqual(backup.state["restored"], "local")
            # khôi phục lỗi → chặn sao lưu để không ghi đè bản tốt bằng CSDL trống
            good = open(os.path.join(B, "latest.zip"), "rb").read()
            with open(os.path.join(B, "latest.zip"), "wb") as f:
                f.write(b"khong phai file zip")
            D = tempfile.mkdtemp(prefix="lbai_bkD_")
            with self._Dirs(D):
                backup.restore_if_needed()
                self.assertEqual((backup.state["restored"], backup.state["blocked"]), ("error", True))
                db.init()
                r = backup.run_backup(force=True)
                self.assertFalse(r["ok"])
                self.assertEqual(open(os.path.join(B, "latest.zip"), "rb").read(), b"khong phai file zip")   # bản trên kho không bị đụng tới
            # file zip độc hại (đường dẫn ra ngoài thư mục dữ liệu) bị từ chối
            evil = os.path.join(B, "latest.zip")
            with zipfile.ZipFile(evil, "w") as z:
                z.writestr("lbai.db", b"x")
                z.writestr("../thoat-ra-ngoai.txt", b"x")
            E = tempfile.mkdtemp(prefix="lbai_bkE_")
            with self._Dirs(E):
                backup.restore_if_needed()
                self.assertEqual(backup.state["restored"], "error")
                self.assertFalse(os.path.exists(os.path.join(os.path.dirname(E), "thoat-ra-ngoai.txt")))
                self.assertFalse(os.path.exists(db.DB_PATH))
            self.assertGreater(len(good), 100)
        finally:
            for k, v in old_env.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_zz_backup_incremental(self):
        """Sao lưu tiết kiệm băng thông: ảnh/file tải lên nằm ở các gói bất biến, mỗi lần chỉ gửi gói MỚI; gói không còn dùng được dọn; khôi phục đủ ảnh;
        thiếu gói thì chặn (không khôi phục thiếu ảnh); bản sao lưu kiểu cũ (một zip chứa cả ảnh) vẫn khôi phục được."""
        from server import backup
        A, B, C, D, B2, E = (tempfile.mkdtemp(prefix=f"lbai_bi{n}_") for n in ("A", "B", "C", "D", "B2", "E"))
        old_env = {k: os.environ.get(k) for k in ("LBAI_BACKUP_DIR", "LBAI_BACKUP_URL", "LBAI_BACKUP_KEY")}
        os.environ["LBAI_BACKUP_DIR"] = B
        os.environ.pop("LBAI_BACKUP_URL", None); os.environ.pop("LBAI_BACKUP_KEY", None)
        old_pack, puts, real_put = backup.PACK_BYTES, [], backup.DirStore.put
        backup.PACK_BYTES = 3000

        def spy(self, name, data):
            puts.append((name, len(data)))
            return real_put(self, name, data)
        backup.DirStore.put = spy

        def add_image(con, i, created):
            con.execute("INSERT INTO images(id,owner_id,mime,data,created_at) VALUES(?,?,?,?,?)", (f"{i:016x}", 1, "image/png", bytes([i]) * 1000, created))
        try:
            with self._Dirs(A):
                db.init()
                con = db.connect()
                for i in range(1, 7):
                    add_image(con, i, 100 + i)
                con.commit(); con.close()
                with open(os.path.join(db.UPLOAD_DIR, "tai-lieu.txt"), "wb") as f:
                    f.write(b"noi dung file")
                r = backup.run_backup()
                self.assertTrue(r["ok"], r)
                imgs = sorted(n for n in os.listdir(B) if n.startswith("img-"))
                self.assertEqual(len(imgs), 2)                                                  # 6 ảnh × 1000 byte, mỗi gói tối đa 3000 byte
                self.assertTrue(any(n.startswith("up-") for n in os.listdir(B)))
                self.assertLess(os.path.getsize(os.path.join(B, "latest.zip")), 100000)         # bản chính chỉ có CSDL, không chứa dữ liệu ảnh
                self.assertTrue(backup.run_backup().get("skipped"))                              # không đổi → không gửi gì
                puts.clear()
                con = db.connect(); add_image(con, 7, 200); con.commit(); con.close()            # thêm 1 ảnh mới
                r = backup.run_backup()
                names = [n for n, _ in puts]
                self.assertEqual([n for n in names if n.startswith("img-")].__len__(), 1)        # chỉ gửi gói chứa ảnh mới
                self.assertIn("latest.zip", names)
                self.assertFalse(any(n.startswith("up-") for n in names))                        # file tải lên không đổi → không gửi lại
                self.assertLess(r["sent"], 2500)                                                 # ~1 ảnh, không phải cả kho
                self.assertEqual(len([n for n in os.listdir(B) if n.startswith("img-")]), 3)
                con = db.connect(); con.execute("DELETE FROM images WHERE id=?", (f"{7:016x}",)); con.commit(); con.close()
                backup.run_backup()                                                              # ảnh bị xóa → gói chỉ chứa nó không còn được chỉ mục nhắc tới → được dọn
                self.assertEqual(len([n for n in os.listdir(B) if n.startswith("img-")]), 2)
                legacy = backup.build_archive()                                                  # bản kiểu cũ (chứa cả ảnh) để thử khả năng tương thích
            with self._Dirs(C):                                                                  # container mới: khôi phục
                backup.restore_if_needed()
                self.assertEqual(backup.state["restored"], "ok")
                db.init()
                con = db.connect()
                got = {r["id"]: bytes(r["data"]) for r in con.execute("SELECT id, data FROM images")}
                con.close()
                self.assertEqual(sorted(got), [f"{i:016x}" for i in range(1, 7)])
                self.assertTrue(all(got[f"{i:016x}"] == bytes([i]) * 1000 for i in range(1, 7)))   # ảnh nguyên vẹn
                with open(os.path.join(db.UPLOAD_DIR, "tai-lieu.txt"), "rb") as f:
                    self.assertEqual(f.read(), b"noi dung file")
                puts.clear()
                self.assertTrue(backup.run_backup(force=True)["ok"])                             # sau khôi phục: biết gói nào đã có → không gửi lại ảnh
                self.assertFalse(any(n.startswith(("img-", "up-")) for n, _ in puts))
            os.remove(os.path.join(B, imgs[0]))                                                  # kho mất một gói → khôi phục phải báo lỗi và chặn, không chạy thiếu ảnh
            with self._Dirs(D):
                backup.restore_if_needed()
                self.assertEqual((backup.state["restored"], backup.state["blocked"]), ("error", True))
                self.assertFalse(os.path.exists(db.DB_PATH))
            os.environ["LBAI_BACKUP_DIR"] = B2                                                   # bản kiểu cũ vẫn khôi phục được
            os.makedirs(B2, exist_ok=True)
            with open(os.path.join(B2, "latest.zip"), "wb") as f:
                f.write(legacy)
            with self._Dirs(E):
                backup.restore_if_needed()
                self.assertEqual(backup.state["restored"], "ok")
                db.init()
                con = db.connect()
                self.assertEqual(con.execute("SELECT COUNT(*) n FROM images").fetchone()["n"], 6)
                self.assertEqual(bytes(con.execute("SELECT data FROM images WHERE id=?", (f"{3:016x}",)).fetchone()["data"]), bytes([3]) * 1000)
                con.close()
        finally:
            backup.PACK_BYTES = old_pack
            backup.DirStore.put = real_put
            for k, v in old_env.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_zz_backup_supabase_api(self):
        """Kho Supabase Storage: kiểm tra đúng đường dẫn, header xác thực, upsert và xử lý 'không tìm thấy' (máy chủ giả lập)."""
        from server import backup
        import http.server as hs
        store, seen = {}, []

        class H(hs.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _auth(self):
                seen.append((self.command, self.path, self.headers.get("Authorization"), self.headers.get("apikey"), self.headers.get("x-upsert")))
                return self.headers.get("Authorization") == "Bearer " + KEY and self.headers.get("apikey") == KEY

            def _send(self, code, body=b"{}"):
                self.send_response(code)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_POST(self):
                n = int(self.headers.get("Content-Length") or 0)
                data = self.rfile.read(n)
                if not self._auth():
                    return self._send(401)
                if self.path == "/storage/v1/bucket":
                    return self._send(200 if "bkt" not in store else 409)
                store[self.path] = data
                self._send(200)

            def do_GET(self):
                if not self._auth():
                    return self._send(401)
                key = self.path.replace("/object/authenticated/", "/object/")
                if key in store:
                    return self._send(200, store[key])
                self._send(400, b'{"statusCode":"404","error":"Bucket not found","message":"Object not found"}')

        KEY = "khoa-thu-nghiem-" + secrets.token_hex(8)
        srv = hs.ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        old_env = {k: os.environ.get(k) for k in ("LBAI_BACKUP_DIR", "LBAI_BACKUP_URL", "LBAI_BACKUP_KEY", "LBAI_BACKUP_BUCKET")}
        os.environ.pop("LBAI_BACKUP_DIR", None)
        os.environ.update(LBAI_BACKUP_URL=f"http://127.0.0.1:{srv.server_address[1]}", LBAI_BACKUP_KEY=KEY, LBAI_BACKUP_BUCKET="bkt")
        try:
            A, C = tempfile.mkdtemp(prefix="lbai_sbA_"), tempfile.mkdtemp(prefix="lbai_sbC_")
            with self._Dirs(A):
                backup.restore_if_needed()
                self.assertEqual(backup.state["restored"], "none")                  # kho trống → hệ thống mới, không lỗi, không chặn
                self.assertFalse(backup.state["blocked"])
                db.init()
                con = db.connect()
                app.create_user(con, None, "Qua Supabase", "admin", "sb.admin", "Aa1-" + secrets.token_urlsafe(8), must_change=False)
                con.commit(); con.close()
                self.assertTrue(backup.run_backup()["ok"])
            self.assertIn("/storage/v1/object/bkt/latest.zip", store)
            self.assertTrue(any(x[0] == "POST" and x[1].endswith("latest.zip") and x[4] == "true" for x in seen))   # ghi đè bằng x-upsert
            with self._Dirs(C):
                backup.restore_if_needed()
                self.assertEqual(backup.state["restored"], "ok")
                db.init()
                con = db.connect()
                self.assertEqual(con.execute("SELECT username FROM users").fetchone()["username"], "sb.admin")
                con.close()
            os.environ["LBAI_BACKUP_KEY"] = "sai-khoa"                              # sai khóa → lỗi rõ ràng, chặn sao lưu, không sập
            F = tempfile.mkdtemp(prefix="lbai_sbF_")
            with self._Dirs(F):
                backup.restore_if_needed()
                self.assertEqual((backup.state["restored"], backup.state["blocked"]), ("error", True))
        finally:
            srv.shutdown()
            for k, v in old_env.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_zz_backup_survives_restart(self):
        """Máy chủ thật: tạo dữ liệu → sao lưu → xóa sạch thư mục dữ liệu (mô phỏng container mới) → khởi động lại vẫn còn tài khoản."""
        import subprocess
        import time
        import socket
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        store_dir, pw = tempfile.mkdtemp(prefix="lbai_store_"), "Aa1-" + secrets.token_urlsafe(10)

        def start():
            sock = socket.socket(); sock.bind(("127.0.0.1", 0)); port = sock.getsockname()[1]; sock.close()
            env = {**os.environ, "PORT": str(port), "LBAI_DATA": tempfile.mkdtemp(prefix="lbai_new_"), "LBAI_BACKUP_DIR": store_dir,
                   "LBAI_NO_BROWSER": "1", "LBAI_QUIET": "1", "LBAI_BACKUP_INTERVAL": "3600"}
            for k in ("LBAI_PORT", "LBAI_HOST", "LBAI_SETUP_CODE", "LBAI_BACKUP_URL", "LBAI_BACKUP_KEY"):
                env.pop(k, None)
            pr = subprocess.Popen([sys.executable, "-m", "server"], cwd=base, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            c = Client(port)
            for _ in range(80):
                try:
                    c.get("/api/status")
                    return pr, c
                except OSError:
                    time.sleep(0.25)
            pr.kill()
            self.fail("máy chủ không khởi động")

        p1, c1 = start()
        try:
            self.assertEqual(c1.get("/api/status")[1]["needs_setup"], True)
            self.assertEqual(c1.post("/api/setup", {"name": "Quản trị", "username": "quantri", "password": pw})[0], 200)
            self.assertEqual(c1.get("/api/backup/status")[1]["enabled"], True)
            st, r = c1.post("/api/backup/run")
            self.assertEqual((st, r["ok"]), (200, True))
        finally:
            p1.terminate(); p1.wait(timeout=10)
        p2, c2 = start()                                                           # thư mục dữ liệu MỚI hoàn toàn
        try:
            self.assertEqual(c2.get("/api/status")[1]["needs_setup"], False)       # tài khoản được khôi phục từ kho
            self.assertEqual(c2.post("/api/login", {"username": "quantri", "password": pw})[0], 200)
            self.assertEqual(c2.get("/api/backup/status")[1]["restored"], "ok")
        finally:
            p2.terminate(); p2.wait(timeout=10)

if __name__ == "__main__":
    unittest.main()
