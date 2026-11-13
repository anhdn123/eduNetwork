import os

print("Đang khởi tạo toàn bộ hệ thống Learning by AI & Đề Toán 12...")

# Tạo thư mục gốc
os.makedirs("Learning_by_AI_FINAL", exist_ok=True)

# 1. Trang chủ Teacher Copilot (teacher-builder.html)
with open("Learning_by_AI_FINAL/teacher-builder.html", "w", encoding="utf-8") as f:
    f.write('''<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Teacher Copilot · Learning by AI</title><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="app.css"></head><body>
<div class="topbar"><span>LEARNING BY AI · AI TEACHER COPILOT</span><span>Soạn ít hơn · Hiểu học sinh hơn</span></div>
<header class="header"><a class="logo" href="index.html">Learning <span>by AI</span></a><nav class="nav"><a href="index.html">Bảng tin</a><a class="active" href="teacher-builder.html">AI Copilot</a></nav></header>
<main class="builder-layout" style="max-width:900px;margin:30px auto;padding:0 20px">
  <div class="card">
    <h2 class="section-title" style="font-size:22px">Lên Đề & Quản lý Kho Dữ Liệu</h2>
    <div class="grid3" style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <div>
        <label class="muted" style="font-size:10px">Môn học</label>
        <select id="cfg-subject" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px"><option value="Toán" selected>Toán học</option></select>
      </div>
      <div>
        <label class="muted" style="font-size:10px">Khối lớp</label>
        <select id="cfg-grade" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px"><option value="12" selected>Khối 12</option></select>
      </div>
      <div>
        <label class="muted" style="font-size:10px">Chuyên đề bài học</label>
        <select id="cfg-topic" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px">
          <option value="Đề giữa kì 1 Toán 12" selected>Đề giữa kì 1 Toán 12</option>
          <option value="Ứng dụng đạo hàm khảo sát & vẽ đồ thị hàm số">Ứng dụng đạo hàm khảo sát & vẽ đồ thị hàm số</option>
        </select>
      </div>
    </div>
    <div style="margin-top:16px;display:flex;gap:15px;align-items:center">
      <div><label style="font-size:11px">Số câu / đề:</label> <input id="cfg-n" type="number" value="10" min="3" max="30" style="width:60px;padding:6px;border-radius:6px;border:1px solid #ccc"></div>
      <button class="btn btn-blue" data-act="gen" style="padding:10px 20px;background:#2563eb;color:#fff;border-radius:8px;font-weight:bold;border:0;cursor:pointer">✦ Generate & Xem trước đề thi</button>
    </div>
  </div>
</main>
<script src="app.js"></script></body></html>''')

# 2. Trang Bảng tin (index.html)
with open("Learning_by_AI_FINAL/index.html", "w", encoding="utf-8") as f:
    f.write('''<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Learning by AI · Bảng tin</title><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="app.css"></head><body>
<div class="topbar"><span>LEARNING BY AI · EDUCATION SOCIAL NETWORK</span><span>Kết nối · Chia sẻ · Cá nhân hóa</span></div>
<header class="header"><a class="logo" href="index.html">Learning <span>by AI</span></a><nav class="nav"><a class="active" href="index.html">Bảng tin</a><a href="teacher-builder.html">AI Copilot</a></nav></header>
<main style="max-width:800px;margin:30px auto;padding:0 20px">
  <div class="card"><h2>Chào mừng đến với hệ sinh thái Edu-Network</h2><p>Hệ thống hỗ trợ giáo viên soạn đề, quản lý kho dữ liệu và tổ chức kiểm tra trực tuyến.</p><a href="teacher-builder.html" style="display:inline-block;margin-top:10px;padding:10px 16px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Mở AI Teacher Copilot →</a></div>
</main>
<script src="app.js"></script></body></html>''')

# 3. File CSS (style.css & app.css)
with open("Learning_by_AI_FINAL/style.css", "w", encoding="utf-8") as f:
    f.write(":root{--navy:#10233f;--blue:#2563eb;--bg:#f5f7fb;--card:#fff;--text:#172033;--muted:#667085;--line:#e5eaf1}body{margin:0;font-family:Inter,Arial,sans-serif;color:var(--text);background:var(--bg);font-size:14px}.topbar{height:30px;background:#0b1c32;color:#b9c8da;display:flex;justify-content:space-between;align-items:center;padding:0 28px;font-size:10px}.header{height:68px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;padding:0 28px;gap:28px}.logo{font-size:21px;font-weight:900;color:var(--navy);text-decoration:none}.logo span{color:var(--blue)}.nav{display:flex;gap:12px}.nav a{color:#526070;text-decoration:none;font-size:12px;font-weight:bold}.card{background:var(--card);border:1px solid var(--line);border-radius:15px;padding:20px;box-shadow:0 12px 35px rgba(16,35,63,.08)}")

with open("Learning_by_AI_FINAL/app.css", "w", encoding="utf-8") as f:
    f.write(""".lb-overlay{position:fixed;inset:0;background:rgba(16,35,63,.55);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto}.lb-modal{background:#fff;border-radius:16px;padding:24px;width:100%;max-width:800px;position:relative;box-shadow:0 24px 60px rgba(16,35,63,.3);font-size:12px;line-height:1.6}.lb-x{position:absolute;top:10px;right:12px;border:0;background:none;font-size:22px;cursor:pointer;color:#667085}.lb-exam{border:1px solid var(--line);border-radius:12px;padding:16px;background:#fcfdff;max-height:55vh;overflow:auto}.lb-q{margin:0 0 16px}.lb-q .qh{font-weight:700}.lb-q .opts{display:grid;grid-template-columns:1fr 1fr;gap:4px 14px;margin:6px 0 0 14px}.lb-q .sol{background:#effaf5;border-left:3px solid #18a67a;padding:6px 10px;margin-top:6px;font-size:11px}""")

# 4. File Logic (app.js chứa kho dữ liệu Toán 12)
with open("Learning_by_AI_FINAL/app.js", "w", encoding="utf-8") as f:
    f.write("""(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const OFFLINE_QUESTION_BANK = {
  'Toán': {
    '12': [
      { t:'mcq', lv:1, q:'Cho hàm số y = f(x) có bảng xét dấu f\'(x). Hàm số đồng biến trên khoảng nào?', opts:['(-∞; +∞)', '(-2; +∞)', '(-∞; -2)', '(2; +∞)'], ans:2, sol:'Hàm số đồng biến trên khoảng (-∞; -2) nơi f\'(x) > 0.' },
      { t:'mcq', lv:2, q:'Hàm số y = -x³ + 3x² + 1 đồng biến trên khoảng nào dưới đây?', opts:['(-∞; 0)', '(2; +∞)', '(0; 2)', '(-∞; 1)'], ans:2, sol:'y\' = -3x² + 6x > 0 <=> 0 < x < 2.' },
      { t:'mcq', lv:2, q:'Điểm cực tiểu của hàm số y = x³ - 3x + 5 là:', opts:['x = -1', 'x = 1', 'y = 3', 'y = 7'], ans:1, sol:'y\' = 3x² - 3 = 0 => x = ±1. Đổi dấu từ - sang + tại x = 1.' },
      { t:'mcq', lv:1, q:'Giá trị lớn nhất của hàm số liên tục trên đoạn [-1; 2] bằng 5, GTNN bằng 1. GTLN bằng:', opts:['4', '2', '5', '1'], ans:2, sol:'Giá trị lớn nhất trên đoạn [-1; 2] bằng 5 theo bảng biến thiên.' },
      { t:'mcq', lv:2, q:'Đường tiệm cận đứng của đồ thị hàm số y = (3x - 2) / (x - 4) là:', opts:['y = 3', 'x = -4', 'x = 4', 'y = 4'], ans:2, sol:'Mẫu số x - 4 = 0 => x = 4 là tiệm cận đứng.' },
      { t:'short', lv:2, q:'Tìm vận tốc lớn nhất của vật chuyển động với s(t) = -t³ + 6t² + 12t trong 4 giây đầu tiên (m/s).', ans:24, sol:'v(t) = -3t² + 12t + 12 = -3(t-2)² + 24 <= 24. Max v = 24 tại t = 2.' },
      { t:'short', lv:2, q:'Sau khi tiêm thuốc, nồng độ thuốc trong máu C(t) = 6t / (t² + 9). Sau bao nhiêu giờ thì nồng độ thuốc đạt mức cao nhất?', ans:3, sol:'C\'(t) = 6(9 - t²)/(t²+9)² = 0 => t = 3 giờ.' },
      { t:'essay', lv:3, q:'Tìm giá trị lớn nhất và nhỏ nhất của hàm số y = x³ - 3x² + 2 trên đoạn [0; 3].', sol:'y\' = 3x² - 6x = 0 => x = 0, x = 2. y(0) = 2, y(2) = -2, y(3) = 2. GTLN = 2, GTNN = -2.' }
    ]
  }
};

function modal(html) {
  $$('.lb-overlay').forEach(x => x.remove());
  const o = document.createElement('div'); o.className = 'lb-overlay';
  o.innerHTML = `<div class="lb-modal"><button class="lb-x" aria-label="Đóng">×</button><div class="lb-body">${html}</div></div>`;
  o.onclick = e => { if (e.target === o) o.remove(); };
  $('.lb-x', o).onclick = () => o.remove();
  document.body.append(o);
}

const btn = $('[data-act="gen"]');
if (btn) {
  btn.onclick = () => {
    const n = +$('#cfg-n').value || 5;
    const pool = OFFLINE_QUESTION_BANK['Toán']['12'];
    const qs = [];
    for(let i=0; i<n; i++) qs.push(pool[i % pool.length]);

    const html = `<h2>📄 Đề kiểm tra Giữa kì 1 - Toán 12</h2>
      <div class="lb-exam" style="margin-top:10px">
        ${qs.map((q, i) => `<div class="lb-q"><div class="qh">Câu ${i+1}. ${q.q}</div>` +
          (q.opts ? `<div class="opts">${q.opts.map((o, j) => `<span><b>${'ABCD'[j]}.</b> ${o}</span>`).join('')}</div>` : '') +
          `<div class="sol"><b>Lời giải:</b> ${q.sol}</div></div>`).join('')}
      </div>
      <button style="margin-top:15px;padding:10px 16px;background:#2563eb;color:#fff;border-radius:8px;font-weight:bold;border:0;cursor:pointer" onclick="window.print()">🖨 In đề thi chuẩn A4</button>`;
    modal(html);
  };
}
})();""")

print("=> HOÀN TẤT! Đã tạo thư mục 'Learning_by_AI_FINAL' thành công.")