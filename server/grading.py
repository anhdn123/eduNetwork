"""Chấm điểm phía server (học sinh không bao giờ nhận được đáp án trước khi nộp bài)."""
import re

TFG_SCORE = [0, 0.1, 0.25, 0.5, 1]   # đúng 0/1/2/3/4 ý của câu đúng-sai 4 ý


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


def same_short(given, key) -> bool:
    x, y = _norm(given), _norm(key)
    if x == y:
        return True
    try:
        return x != "" and y != "" and abs(float(x) - float(y)) < 1e-9
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
