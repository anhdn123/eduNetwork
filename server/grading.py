"""Chấm điểm phía server (học sinh không bao giờ nhận được đáp án trước khi nộp bài)."""
import re

TFG_SCORE = [0, 0.1, 0.25, 0.5, 1]   # đúng 0/1/2/3/4 ý của câu đúng-sai 4 ý

# ---- Tự luyện tập: điểm và thời gian theo từng dạng câu ----
# Điểm tối đa mỗi câu: trắc nghiệm 4 phương án 0,25; đúng/sai 1 (đúng 1 ý 0,1 · 2 ý 0,25 · 3 ý 0,5 · 4 ý 1); trả lời ngắn 1.
# Thời gian làm mỗi câu (phút): trắc nghiệm 2, đúng/sai 7, trả lời ngắn 8.
PRACTICE_POINTS = {"mcq": 0.25, "tf": 1.0, "short": 1.0}
PRACTICE_MINUTES = {"mcq": 2, "tf": 7, "short": 8}
LEVELS = (1, 2, 3, 4)   # 1 nhận biết · 2 thông hiểu · 3 vận dụng · 4 vận dụng cao


def has_key(q: dict) -> bool:
    """Câu có đáp án để chấm tự động."""
    t = q.get("t")
    if t == "essay":
        return False
    ans = q.get("ans")
    if isinstance(q.get("sts"), list):
        return isinstance(ans, list) and len(ans) == len(q["sts"]) and all(v in (0, 1) for v in ans)
    if t == "short":
        return ans is not None and str(ans).strip() != ""
    opts = q.get("opts") or []
    return isinstance(ans, int) and not isinstance(ans, bool) and 0 <= ans < len(opts)


def _norm(s) -> str:
    s = str(s).strip().lower().replace("−", "-").replace(" ", "")
    s = s.replace(",", ".").rstrip("%")   # "22,5%" và "22,5" là cùng đáp án
    return s[:-1] if s.endswith(".") else s


def _num(s):
    """Số thực của chuỗi đã chuẩn hóa; hiểu cả phân số đơn giản "p/q" (1/2 = 0,5)."""
    if "/" in s:
        a, _, b = s.partition("/")
        d = float(b)
        return float(a) / d if d else None
    return float(s)


def same_short(given, key) -> bool:
    x, y = _norm(given), _norm(key)
    if x == y:
        return True
    try:
        nx, ny = _num(x), _num(y)
        return x != "" and y != "" and nx is not None and ny is not None and abs(nx - ny) < 1e-9
    except ValueError:
        return False


def grade_question(q: dict, given):
    """Trả về điểm của một câu trong [0, 1]; None nếu câu không chấm tự động."""
    if not has_key(q):
        return None
    if isinstance(q.get("sts"), list):
        if not isinstance(given, list):
            return 0
        right = sum(1 for i, k in enumerate(q["ans"]) if i < len(given) and given[i] == k)
        return TFG_SCORE[min(right, 4)]
    if q.get("t") == "short":
        return 1 if given not in (None, "") and same_short(given, q["ans"]) else 0
    return 1 if isinstance(given, int) and not isinstance(given, bool) and given == q["ans"] else 0


def grade(questions: list, answers: list, reveal: bool):
    """Chấm cả đề. Trả về (điểm, điểm tối đa, chi tiết từng câu)."""
    total, mx, details = 0.0, 0, []
    for i, q in enumerate(questions):
        given = answers[i] if i < len(answers) else None
        sc = grade_question(q, given)
        d = {"i": i, "t": q.get("t"), "score": sc, "given": given}
        if sc is not None:
            total += sc
            mx += 1
        details.append(d)
    if reveal:
        details = reveal_details(questions, details)
    return round(total, 2), mx, details


def practice_type(q: dict):
    return "tf" if isinstance(q.get("sts"), list) else q.get("t")


def question_level(q: dict) -> int:
    """Mức độ 1–4 của câu (nhận biết / thông hiểu / vận dụng / vận dụng cao; mức cao hơn gộp vào vận dụng cao; chưa gắn mức thì coi là thông hiểu)."""
    try:
        lv = int(q.get("lv"))
    except (TypeError, ValueError):
        return 2
    return min(max(lv, 1), 4)


def grade_points(questions: list, answers: list, reveal: bool):
    """Chấm bài tự luyện theo thang điểm của từng dạng. Trả về (điểm đạt, điểm tối đa, chi tiết từng câu).
    Mỗi chi tiết giữ `score` ∈ [0,1] (tỉ lệ đúng) và thêm `pts`/`max_pts` (điểm thật của câu)."""
    total, mx, details = 0.0, 0.0, []
    for i, q in enumerate(questions):
        given = answers[i] if i < len(answers) else None
        sc = grade_question(q, given)
        w = PRACTICE_POINTS.get(practice_type(q))
        d = {"i": i, "t": q.get("t"), "score": sc, "given": given}
        if sc is not None and w:
            d["pts"], d["max_pts"] = round(sc * w, 4), w
            total += sc * w
            mx += w
        details.append(d)
    if reveal:
        details = reveal_details(questions, details)
    return round(total, 2), round(mx, 2), details


def reveal_details(questions: list, details: list, manual: dict | None = None) -> list:
    """Gắn đáp án đúng, lời giải (chữ và ảnh cắt từ đề) và điểm giáo viên chấm tay vào chi tiết từng câu."""
    out = []
    for i, q in enumerate(questions):
        d = dict(details[i]) if i < len(details) and isinstance(details[i], dict) else {"i": i, "t": q.get("t"), "score": None, "given": None}
        d["key"] = q.get("ans")
        d["sol"] = q.get("sol", "")
        if q.get("solImg"):
            d["solImg"] = q["solImg"]
        if q.get("solBad"):
            d["solBad"] = True   # lời giải dạng chữ bị vỡ công thức khi đọc PDF → giao diện không hiện
        if manual and i in manual:
            d["manual"] = manual[i]
        out.append(d)
    return out


def hide_details(details: list, manual: dict | None = None) -> list:
    """Chi tiết từng câu khi chưa được xem đáp án: chỉ còn bài làm và đúng/sai."""
    out = []
    for i, d in enumerate(details):
        d = {k: v for k, v in d.items() if k not in ("key", "sol", "solImg", "solBad")}
        if manual and i in manual:
            d["manual"] = manual[i]
        out.append(d)
    return out


def sanitize_question(q: dict) -> dict:
    """Bản câu hỏi gửi cho học sinh: bỏ đáp án và lời giải."""
    keep = ("t", "lv", "q", "opts", "sts", "img")
    return {k: q[k] for k in keep if k in q}
