"""Nhờ AI đọc câu hỏi trong ảnh và đưa ra đáp án để giáo viên duyệt rồi giao cho học sinh làm online.

Hai nhà cung cấp (chọn bằng LBAI_AI_PROVIDER = gemini | claude; không đặt thì tự chọn theo khóa nào có trong môi trường, ưu tiên Gemini):
- gemini (MẶC ĐỊNH, có gói miễn phí): khóa ở biến môi trường GEMINI_API_KEY (lấy tại Google AI Studio). Chỉ dùng thư viện chuẩn của Python.
  LƯU Ý: ở gói miễn phí, Google ghi rõ nội dung gửi lên có thể được dùng để cải thiện sản phẩm của Google.
- claude (trả phí, chính xác hơn): khóa ở ANTHROPIC_API_KEY, cần cài thêm gói `anthropic` (pip install -r requirements.txt).

Quy tắc chung: khóa chỉ nằm ở biến môi trường của MÁY CHỦ — không bao giờ gửi xuống trình duyệt, ghi vào CSDL hay log; chỉ gửi ảnh/chữ của câu hỏi
(không kèm tên, lớp hay thông tin học sinh); đáp án AI luôn cần giáo viên xem lại (giao diện đánh dấu "do AI" tới khi giáo viên xác nhận).
"""
import base64
import json
import os
import re
import threading
import time
import urllib.error
import urllib.request

PROVIDERS = ("gemini", "claude")
GEMINI_MODEL = os.environ.get("LBAI_AI_MODEL_GEMINI") or "gemini-3.8-flash"            # model Flash mạnh nhất còn miễn phí theo bảng giá của Google (đổi bằng biến này nếu Google đổi tên)
CLAUDE_MODEL = os.environ.get("LBAI_AI_MODEL_CLAUDE") or "claude-opus-5-5"
GEMINI_FALLBACK = [m.strip() for m in (os.environ.get("LBAI_AI_MODEL_GEMINI_FALLBACK") or "gemini-2.5-flash").split(",") if m.strip()]   # model dự phòng khi model chính không tồn tại
GEMINI_BASE = (os.environ.get("GEMINI_BASE_URL") or "https://generativelanguage.googleapis.com").rstrip("/")
EFFORT = os.environ.get("LBAI_AI_EFFORT") or "high"                                    # chỉ dùng cho Claude
TIMEOUT = float(os.environ.get("LBAI_AI_TIMEOUT") or 85)                               # giây cho mỗi lần gọi (proxy của máy chủ web thường cắt sau ~100 giây)
MAX_ITEMS = 4                                                                          # số câu tối đa mỗi lần gọi
HOURLY_LIMIT = int(os.environ.get("LBAI_AI_HOURLY") or 400)                            # số câu tối đa mỗi giáo viên mỗi giờ (chặn dùng quá tay / tốn chi phí)

try:   # tùy chọn: chỉ cần cho Claude
    import anthropic
except ImportError:   # pragma: no cover - phụ thuộc môi trường
    anthropic = None

_lock = threading.Lock()
_usage = {}   # user_id -> [thời điểm các câu đã gửi trong 1 giờ qua]


class AiError(Exception):
    """Lỗi có thể hiển thị cho giáo viên: (mã HTTP, thông báo tiếng Việt)."""

    def __init__(self, status, msg):
        super().__init__(msg)
        self.status, self.msg = status, msg


def _has(name):
    return bool(os.environ.get(name))


def provider():
    """Nhà cung cấp đang dùng: theo LBAI_AI_PROVIDER, nếu không đặt thì Gemini khi có GEMINI_API_KEY, ngược lại Claude khi có khóa Claude; None nếu chưa có khóa nào."""
    p = (os.environ.get("LBAI_AI_PROVIDER") or "").strip().lower()
    if p in PROVIDERS:
        return p
    if _has("GEMINI_API_KEY"):
        return "gemini"
    if _has("ANTHROPIC_API_KEY") or _has("ANTHROPIC_AUTH_TOKEN"):
        return "claude"
    return None


def model():
    return {"gemini": GEMINI_MODEL, "claude": CLAUDE_MODEL}.get(provider() or "", "")


def configured() -> bool:
    """Đã đặt khóa cho nhà cung cấp đang chọn chưa (chỉ kiểm tra có/không, không đọc nội dung khóa)."""
    p = provider()
    return (p == "gemini" and _has("GEMINI_API_KEY")) or (p == "claude" and (_has("ANTHROPIC_API_KEY") or _has("ANTHROPIC_AUTH_TOKEN")))


def status() -> dict:
    p = provider()
    sdk = anthropic is not None if p == "claude" else True   # Gemini gọi thẳng REST, không cần gói ngoài
    return {"configured": configured(), "sdk": sdk, "ready": configured() and sdk, "provider": p or "", "model": model() if configured() else "",
            "free": p == "gemini",                  # Gemini dùng gói miễn phí: Google có thể dùng nội dung để cải thiện sản phẩm
            "concurrency": 1 if p == "gemini" else 3,   # gói miễn phí giới hạn số yêu cầu mỗi phút → gửi lần lượt
            "max_items": MAX_ITEMS}


SYSTEM = """Bạn là giáo viên Toán Việt Nam giàu kinh nghiệm, đang giải các câu hỏi trong một đề kiểm tra để lấy đáp án đúng.
Mỗi câu được cung cấp dưới dạng ảnh chụp hoặc văn bản, kèm mã (id) và dạng câu hỏi. Hãy đọc kỹ đề, tự giải cẩn thận từng bước rồi mới kết luận.

Quy tắc ghi đáp án (trường "answer"):
- Dạng "mcq" (trắc nghiệm 4 phương án): đúng MỘT chữ cái in hoa A, B, C hoặc D.
- Dạng "tf" (đúng/sai gồm 4 ý a, b, c, d): đúng 4 ký tự Đ hoặc S theo thứ tự ý a, b, c, d, ví dụ "ĐSSĐ".
- Dạng "short" (trả lời ngắn): chỉ MỘT số, không đơn vị, không chữ, dùng dấu phẩy làm dấu thập phân (ví dụ "12,5"). Kết quả vô tỉ hoặc số lẻ dài thì làm tròn đến 2 chữ số thập phân; nếu đề yêu cầu làm tròn khác thì theo đề. Không viết căn, phân số hay biểu thức: hãy tính ra số.

Nếu ảnh bị cắt, mờ, thiếu dữ kiện hoặc đề có lỗi khiến không thể kết luận chắc chắn, đừng đoán bừa: để "answer" là chuỗi rỗng, đặt "confidence" là "low" và nêu lý do ngắn gọn trong "note".
"confidence": "high" khi bạn đã kiểm tra lại kết quả và chắc chắn; "medium" khi còn một chút nghi ngờ; "low" khi không chắc.
"note": một câu tiếng Việt ngắn (tối đa 200 ký tự) nêu ý chính của lời giải hoặc điểm cần giáo viên lưu ý.
"solution": lời giải chi tiết bằng tiếng Việt cho học sinh lớp 9 đọc hiểu được: các bước tính ngắn gọn, mỗi bước một dòng (phân cách bằng ký tự xuống dòng \\n), tối đa 1200 ký tự, viết công thức bằng ký hiệu thông thường (√, ^, /, π, ∠, ≤, ≥…), kết thúc bằng dòng "Đáp án: …". Nếu không giải được thì để chuỗi rỗng."""

JSON_FORMAT = """Chỉ trả về MỘT đối tượng JSON hợp lệ, không kèm chữ nào khác, đúng dạng:
{"answers": [{"id": "<id câu>", "answer": "<đáp án>", "confidence": "high|medium|low", "note": "<ghi chú ngắn>", "solution": "<lời giải chi tiết>"}]}
Mỗi câu đúng một mục, dùng đúng id đã cho."""

SCHEMA = {   # chỉ Claude ép được lược đồ; với Gemini lược đồ được mô tả bằng JSON_FORMAT và kiểm tra lại ở phía máy chủ
    "type": "object",
    "properties": {
        "answers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "answer": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "note": {"type": "string"},
                    "solution": {"type": "string"},
                },
                "required": ["id", "answer", "confidence", "note", "solution"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["answers"],
    "additionalProperties": False,
}

KIND_VN = {"mcq": "trắc nghiệm 4 phương án (A, B, C, D)", "tf": "đúng/sai (4 ý a, b, c, d)", "short": "trả lời ngắn (một số)"}


def normalize(kind, answer):
    """Đưa đáp án AI về dạng hệ thống lưu: mcq → chỉ số 0–3; tf → [0|1]*4 (0 = Đúng); short → chuỗi số. Trả về None nếu không hợp lệ."""
    a = (answer or "").strip() if isinstance(answer, str) else ""
    if not a:
        return None
    if kind == "mcq":
        a = a.upper()
        return "ABCD".index(a) if re.fullmatch(r"[ABCD]", a) else None
    if kind == "tf":
        a = re.sub(r"[\s,;.\-]", "", a.upper().replace("ĐÚNG", "Đ").replace("SAI", "S").replace("D", "Đ"))
        return [0 if c == "Đ" else 1 for c in a] if re.fullmatch(r"[ĐS]{4}", a) else None
    if kind == "short":
        a = a.replace(" ", "").replace("−", "-")
        if re.fullmatch(r"-?\d+\.\d+", a):
            a = a.replace(".", ",")
        return a if re.fullmatch(r"-?\d+(,\d+)?", a) and len(a) <= 30 else None
    return None


def _quota(user_id, n):
    now = time.time()
    with _lock:
        used = [t for t in _usage.get(user_id, []) if now - t < 3600]
        if len(used) + n > HOURLY_LIMIT:
            raise AiError(429, f"Đã dùng AI cho {len(used)} câu trong 1 giờ qua (giới hạn {HOURLY_LIMIT}). Hãy thử lại sau.")
        used.extend([now] * n)
        _usage[user_id] = used


def _items_text(it):
    return f"Câu id={it['id']} — dạng: {it['kind']} ({KIND_VN[it['kind']]})."


# ---------------------------------------------------------------- Gemini (REST, chỉ dùng thư viện chuẩn)
def _gemini_call(items, parts=None, system=None, timeout=None):
    key = (os.environ.get("GEMINI_API_KEY") or "").strip().strip("\"' ")   # bỏ khoảng trắng / dấu nháy dán thừa
    if not key:
        raise AiError(503, "Chưa bật AI: quản trị viên cần đặt biến môi trường GEMINI_API_KEY (khóa miễn phí lấy tại Google AI Studio) trên máy chủ.")
    if parts is None:
        parts = []
        for it in items:
            if it.get("image"):
                mime, data = it["image"]
                parts.append({"text": _items_text(it) + " Ảnh đề:"})
                parts.append({"inline_data": {"mime_type": mime, "data": base64.standard_b64encode(data).decode("ascii")}})
            else:
                parts.append({"text": _items_text(it) + "\nĐề (văn bản):\n" + (it.get("text") or "")[:6000]})
        parts.append({"text": "Giải tất cả các câu trên. " + JSON_FORMAT})
    body = {"system_instruction": {"parts": [{"text": system or SYSTEM}]}, "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"responseMimeType": "application/json"}}
    models = [GEMINI_MODEL] + [m for m in GEMINI_FALLBACK if m != GEMINI_MODEL]   # model chính; nếu Google báo không có model đó thì thử model dự phòng
    url = f"{GEMINI_BASE}/v1beta/models/{models[0]}:generateContent"

    def post(b):
        req = urllib.request.Request(url, data=json.dumps(b).encode("utf-8"), method="POST",
                                     headers={"Content-Type": "application/json", "x-goog-api-key": key})
        with urllib.request.urlopen(req, timeout=timeout or TIMEOUT) as r:
            return json.loads(r.read().decode("utf-8"))

    def err_msg(e):
        try:
            return str(json.loads(e.read().decode("utf-8")).get("error", {}).get("message") or "")[:160]
        except Exception:
            return ""

    for attempt in range(3):
        try:
            try:
                resp = post(body)
            except urllib.error.HTTPError as e:
                if e.code == 400 and "generationConfig" in body:   # phòng khi máy chủ Google không nhận trường generationConfig: thử lại không có, vẫn dặn trả JSON trong lời nhắc
                    body = {k: v for k, v in body.items() if k != "generationConfig"}
                    resp = post(body)
                else:
                    raise
            break
        except urllib.error.HTTPError as e:
            msg = err_msg(e)
            if e.code in (429, 500, 502, 503) and attempt < 2:
                time.sleep(3 * (attempt + 1))   # gói miễn phí hay chạm giới hạn theo phút: chờ rồi thử lại
                continue
            if e.code == 429:
                raise AiError(429, "Đã chạm giới hạn của gói miễn phí Gemini (theo phút hoặc theo ngày) — chờ ít phút rồi thử lại, hoặc để mai.")
            if e.code in (401, 403) or (e.code == 400 and "API_KEY_INVALID" in (msg + str(getattr(e, "reason", "")))) or (e.code == 400 and "api key" in msg.lower()):
                raise AiError(502, "Khóa Gemini không hợp lệ hoặc không có quyền — quản trị viên kiểm tra GEMINI_API_KEY.")
            if e.code == 404 and len(models) > 1:
                models.pop(0)
                url = f"{GEMINI_BASE}/v1beta/models/{models[0]}:generateContent"
                continue
            if e.code == 404:
                raise AiError(502, f"Không tìm thấy model Gemini “{GEMINI_MODEL}” — đặt LBAI_AI_MODEL_GEMINI theo tên model hiện hành của Google.")
            raise AiError(502, f"Dịch vụ Gemini lỗi ({e.code}). {msg}".strip())
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            if isinstance(e, TimeoutError) or "timed out" in str(e):
                raise AiError(504, "AI trả lời quá lâu — hãy thử lại (câu khó nên gửi từng câu một).")
            raise AiError(502, "Không kết nối được dịch vụ Gemini.")
        except ValueError:
            raise AiError(502, "Dịch vụ Gemini trả về dữ liệu không đọc được.")
    pf = resp.get("promptFeedback") or {}
    cands = resp.get("candidates") or []
    if pf.get("blockReason") or not cands:
        raise AiError(502, "Gemini từ chối xử lý yêu cầu này (bộ lọc an toàn).")
    cand = cands[0]
    text = "".join(p.get("text", "") for p in (cand.get("content") or {}).get("parts", []) if isinstance(p, dict) and not p.get("thought"))
    if not text.strip():
        raise AiError(502, "Gemini không trả lời (" + str(cand.get("finishReason") or "không rõ lý do") + ").")
    return text


# ---------------------------------------------------------------- Claude (SDK chính thức, tùy chọn)
def _claude_call(items, content=None, system=None, schema=None, timeout=None):
    if anthropic is None:
        raise AiError(503, "Máy chủ chưa cài thư viện AI cho Claude (pip install -r requirements.txt).")
    if not (_has("ANTHROPIC_API_KEY") or _has("ANTHROPIC_AUTH_TOKEN")):
        raise AiError(503, "Chưa bật AI: quản trị viên cần đặt biến môi trường ANTHROPIC_API_KEY trên máy chủ.")
    if content is None:
        content = []
        for it in items:
            if it.get("image"):
                mime, data = it["image"]
                content.append({"type": "text", "text": _items_text(it) + " Ảnh đề:"})
                content.append({"type": "image", "source": {"type": "base64", "media_type": mime, "data": base64.standard_b64encode(data).decode("ascii")}})
            else:
                content.append({"type": "text", "text": _items_text(it) + "\nĐề (văn bản):\n" + (it.get("text") or "")[:6000]})
        content.append({"type": "text", "text": "Giải tất cả các câu trên và trả về JSON theo đúng định dạng yêu cầu, mỗi câu một mục với đúng id đã cho."})
    client = anthropic.Anthropic(timeout=timeout or TIMEOUT, max_retries=1)
    try:
        resp = client.messages.create(
            model=CLAUDE_MODEL, max_tokens=16000, system=system or SYSTEM,
            output_config={"effort": EFFORT, "format": {"type": "json_schema", "schema": schema or SCHEMA}},
            messages=[{"role": "user", "content": content}],
        )
    except anthropic.AuthenticationError:
        raise AiError(502, "Khóa AI không hợp lệ — quản trị viên cần kiểm tra ANTHROPIC_API_KEY.")
    except anthropic.PermissionDeniedError:
        raise AiError(502, "Khóa AI không có quyền dùng model này.")
    except anthropic.RateLimitError:
        raise AiError(429, "Dịch vụ AI đang quá tải hoặc hết hạn mức — thử lại sau ít phút.")
    except anthropic.APITimeoutError:
        raise AiError(504, "AI trả lời quá lâu — hãy thử lại (câu khó nên gửi từng câu một).")
    except anthropic.APIConnectionError:
        raise AiError(502, "Không kết nối được dịch vụ AI.")
    except anthropic.BadRequestError as e:
        raise AiError(502, "Dịch vụ AI từ chối yêu cầu: " + str(getattr(e, "message", e))[:160])
    except anthropic.APIStatusError as e:
        raise AiError(502, f"Dịch vụ AI lỗi ({e.status_code}).")
    if getattr(resp, "stop_reason", None) == "refusal":
        raise AiError(502, "AI từ chối trả lời yêu cầu này.")
    return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")


def _parse(text):
    """Lấy danh sách đáp án từ văn bản AI trả về (chấp nhận cả khi bị bọc trong ```json ... ```)."""
    t = (text or "").strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t)
    try:
        data = json.loads(t)
    except ValueError:
        m = re.search(r"\{[\s\S]*\}", t)
        data = json.loads(m.group(0)) if m else None
    answers = data.get("answers") if isinstance(data, dict) else None
    if not isinstance(answers, list):
        raise ValueError("thiếu answers")
    return {str(a.get("id")): a for a in answers if isinstance(a, dict)}


def solve(user_id, items):
    """items: [{id, kind, image: (mime, bytes) | None, text: str | None}] → [{id, ok, ans, conf, note | error}] theo đúng thứ tự."""
    if not items or len(items) > MAX_ITEMS:
        raise AiError(400, f"Mỗi lần gửi từ 1 đến {MAX_ITEMS} câu")
    p = provider()
    if p is None or not configured():
        raise AiError(503, "Chưa bật AI: quản trị viên cần đặt biến môi trường GEMINI_API_KEY (miễn phí) hoặc ANTHROPIC_API_KEY trên máy chủ.")
    _quota(user_id, len(items))
    text = _gemini_call(items) if p == "gemini" else _claude_call(items)
    try:
        got = _parse(text)
    except (ValueError, KeyError, TypeError, AttributeError):
        raise AiError(502, "AI trả về dữ liệu không đúng định dạng — hãy thử lại.")
    out = []
    for it in items:
        a = got.get(it["id"])
        if not a:
            out.append({"id": it["id"], "ok": False, "error": "AI không trả lời câu này"})
            continue
        ans = normalize(it["kind"], a.get("answer"))
        conf = a.get("confidence") if a.get("confidence") in ("high", "medium", "low") else "low"
        note = re.sub(r"\s+", " ", str(a.get("note") or "")).strip()[:300]
        sol = "\n".join(re.sub(r"[ \t]+", " ", ln).strip() for ln in str(a.get("solution") or "").replace("\\n", "\n").splitlines() if ln.strip())[:1500]
        if ans is None:
            out.append({"id": it["id"], "ok": False, "error": note or "AI không chắc chắn nên không đưa đáp án", "conf": "low"})
        else:
            out.append({"id": it["id"], "ok": True, "ans": ans, "conf": conf, "note": note, "sol": sol})
    return out


# ---------------------------------------------------------------- Hỏi bài: học sinh gửi đề (ảnh / chữ), AI giải thích từng bước
TUTOR_TIMEOUT = float(os.environ.get("LBAI_HELP_TIMEOUT") or 170)       # hỏi bài chạy nền (không bị proxy cắt) nên cho AI nhiều thời gian hơn
TUTOR_HOURLY = int(os.environ.get("LBAI_HELP_HOURLY") or 12)          # số lần hỏi AI mỗi học sinh mỗi giờ
TUTOR_SYSTEM = """Bạn là gia sư thân thiện cho học sinh Việt Nam (THCS – THPT), giỏi mọi môn, đặc biệt Toán. Học sinh gửi ảnh chụp hoặc chữ của một bài tập để nhờ giải.
Hãy đọc kỹ đề, tự giải cẩn thận rồi kiểm tra lại kết quả. Viết lời giải bằng tiếng Việt, dễ hiểu cho học sinh: mỗi bước một dòng (phân cách bằng ký tự xuống dòng \\n), giải thích ngắn gọn vì sao làm vậy, viết công thức bằng ký hiệu thông thường (√, ^, /, π, ∠, ≤, ≥…), tối đa 3000 ký tự.
- "answer": kết luận ngắn gọn (một dòng, ví dụ "x = 3" hoặc "Chọn B").
- "solution": các bước giải chi tiết.
- "confidence": "high" khi bạn đã kiểm tra lại và chắc chắn; "medium" khi còn chút nghi ngờ; "low" khi không chắc, ảnh mờ/thiếu dữ kiện/đề có lỗi hoặc ngoài khả năng — khi đó đừng đoán bừa, để "answer" rỗng và nêu rõ cần thêm gì trong "note".
- "note": một hai câu lưu ý hoặc gợi ý ôn tập (tối đa 300 ký tự).
Nếu nội dung không phải bài học, hãy lịch sự từ chối, confidence "low"."""
TUTOR_JSON = """Chỉ trả về MỘT đối tượng JSON hợp lệ, không kèm chữ nào khác: {"answer": "...", "solution": "...", "confidence": "high|medium|low", "note": "..."}"""
TUTOR_SCHEMA = {"type": "object", "properties": {"answer": {"type": "string"}, "solution": {"type": "string"}, "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                "note": {"type": "string"}}, "required": ["answer", "solution", "confidence", "note"], "additionalProperties": False}


def tutor(user_id, images, text="", subject=""):
    """images: [(mime, bytes)] · trả về {answer, solution, conf, note}. Chỉ gửi ảnh / chữ của đề, không kèm tên hay lớp học sinh."""
    p = provider()
    if p is None or not configured():
        raise AiError(503, "AI chưa được bật")
    now = time.time()
    with _lock:
        key = ("help", user_id)
        used = [t for t in _usage.get(key, []) if now - t < 3600]
        if len(used) >= TUTOR_HOURLY:
            raise AiError(429, f"Bạn đã hỏi AI {len(used)} lần trong 1 giờ qua (tối đa {TUTOR_HOURLY}). Hãy thử lại sau hoặc nhờ thầy cô.")
        used.append(now)
        _usage[key] = used
    intro = "Bài của học sinh" + (f" (môn {subject})" if subject else "") + "."
    if p == "gemini":
        parts = [{"text": intro}]
        if text:
            parts.append({"text": "Đề bài (chữ):\n" + text[:6000]})
        for mime, data in images:
            parts.append({"inline_data": {"mime_type": mime, "data": base64.standard_b64encode(data).decode("ascii")}})
        parts.append({"text": "Hãy giải bài này. " + TUTOR_JSON})
        raw = _gemini_call(None, parts=parts, system=TUTOR_SYSTEM, timeout=TUTOR_TIMEOUT)
    else:
        content = [{"type": "text", "text": intro}]
        if text:
            content.append({"type": "text", "text": "Đề bài (chữ):\n" + text[:6000]})
        for mime, data in images:
            content.append({"type": "image", "source": {"type": "base64", "media_type": mime, "data": base64.standard_b64encode(data).decode("ascii")}})
        content.append({"type": "text", "text": "Hãy giải bài này và trả về JSON theo đúng định dạng."})
        raw = _claude_call(None, content=content, system=TUTOR_SYSTEM, schema=TUTOR_SCHEMA, timeout=TUTOR_TIMEOUT)
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", (raw or "").strip())
    try:
        d = json.loads(t)
    except ValueError:
        m = re.search(r"\{[\s\S]*\}", t)
        try:
            d = json.loads(m.group(0)) if m else None
        except ValueError:
            d = None
    if not isinstance(d, dict):
        raise AiError(502, "AI trả về dữ liệu không đúng định dạng — hãy thử lại.")
    conf = d.get("confidence") if d.get("confidence") in ("high", "medium", "low") else "low"
    clean = lambda v, n: "\n".join(re.sub(r"[ \t]+", " ", ln).strip() for ln in str(v or "").replace("\\n", "\n").splitlines() if ln.strip())[:n]
    return {"answer": clean(d.get("answer"), 300), "solution": clean(d.get("solution"), 3500), "conf": conf, "note": clean(d.get("note"), 400)}
