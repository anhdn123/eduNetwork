(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const OFFLINE_QUESTION_BANK = {
  'Toán': {
    '12': [
      { t:'mcq', lv:1, q:'Cho hàm số y = f(x) có bảng xét dấu f'(x). Hàm số đồng biến trên khoảng nào?', opts:['(-∞; +∞)', '(-2; +∞)', '(-∞; -2)', '(2; +∞)'], ans:2, sol:'Hàm số đồng biến trên khoảng (-∞; -2) nơi f'(x) > 0.' },
      { t:'mcq', lv:2, q:'Hàm số y = -x³ + 3x² + 1 đồng biến trên khoảng nào dưới đây?', opts:['(-∞; 0)', '(2; +∞)', '(0; 2)', '(-∞; 1)'], ans:2, sol:'y' = -3x² + 6x > 0 <=> 0 < x < 2.' },
      { t:'mcq', lv:2, q:'Điểm cực tiểu của hàm số y = x³ - 3x + 5 là:', opts:['x = -1', 'x = 1', 'y = 3', 'y = 7'], ans:1, sol:'y' = 3x² - 3 = 0 => x = ±1. Đổi dấu từ - sang + tại x = 1.' },
      { t:'mcq', lv:1, q:'Giá trị lớn nhất của hàm số liên tục trên đoạn [-1; 2] bằng 5, GTNN bằng 1. GTLN bằng:', opts:['4', '2', '5', '1'], ans:2, sol:'Giá trị lớn nhất trên đoạn [-1; 2] bằng 5 theo bảng biến thiên.' },
      { t:'mcq', lv:2, q:'Đường tiệm cận đứng của đồ thị hàm số y = (3x - 2) / (x - 4) là:', opts:['y = 3', 'x = -4', 'x = 4', 'y = 4'], ans:2, sol:'Mẫu số x - 4 = 0 => x = 4 là tiệm cận đứng.' },
      { t:'short', lv:2, q:'Tìm vận tốc lớn nhất của vật chuyển động với s(t) = -t³ + 6t² + 12t trong 4 giây đầu tiên (m/s).', ans:24, sol:'v(t) = -3t² + 12t + 12 = -3(t-2)² + 24 <= 24. Max v = 24 tại t = 2.' },
      { t:'short', lv:2, q:'Sau khi tiêm thuốc, nồng độ thuốc trong máu C(t) = 6t / (t² + 9). Sau bao nhiêu giờ thì nồng độ thuốc đạt mức cao nhất?', ans:3, sol:'C'(t) = 6(9 - t²)/(t²+9)² = 0 => t = 3 giờ.' },
      { t:'essay', lv:3, q:'Tìm giá trị lớn nhất và nhỏ nhất của hàm số y = x³ - 3x² + 2 trên đoạn [0; 3].', sol:'y' = 3x² - 6x = 0 => x = 0, x = 2. y(0) = 2, y(2) = -2, y(3) = 2. GTLN = 2, GTNN = -2.' }
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
})();