/* app.js — chức năng cho prototype Learning by AI (JS thuần, lưu bằng localStorage) */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const PAGE = location.pathname.split('/').pop() || 'index.html';
const KEY = 'lbai_v1';
const DEF = () => ({likes:{},saved:{},shares:{},comments:{},follows:{'Thầy Minh':1,'Phòng Giáo dục & Đào tạo':1},posts:[],reg:false,uploads:[],needs:[],contacts:{},assign:null,profile:{algebra:78,geometry:61,real:43},results:[],teacher:{},tpl:'',kho:true,bank:[],useBank:true});
let S; try { S = Object.assign(DEF(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = DEF(); }
try { const lg = S.bank || []; if (lg.length && !localStorage.getItem('lbai_legacy_bank')) localStorage.setItem('lbai_legacy_bank', JSON.stringify(lg)); } catch (e) { /* bỏ qua */ }
S.bank = [];
const save = () => {
  try { const {bank, ...rest} = S; localStorage.setItem(KEY, JSON.stringify(rest)); } catch (e) { toast('Bộ nhớ trình duyệt đầy'); }
  scheduleBankSync();
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = n => String(n).replace('-', '−');

const {toast, modal} = LB;

/* ---------- Ngân hàng câu hỏi: lưu trên máy chủ, mỗi giáo viên một kho riêng ----------
   Toàn bộ code vẫn thao tác trên S.bank; mỗi lần save() hệ thống so sánh với bản đã đồng bộ
   rồi chỉ gửi phần thay đổi (thêm / sửa / xóa) lên server. */
let BANK_READY = false, bankSnap = new Map(), syncTimer = 0, syncing = false, syncAgain = false;
const bankJson = () => new Map((S.bank || []).map(q => [q.id, JSON.stringify(q)]));
async function loadBank() {
  S.bank = (await LB.api.get('/api/bank')).questions;
  bankSnap = bankJson(); BANK_READY = true;
}
let HOLD_SYNC = false, PENDING_DROP = [];   // HOLD_SYNC: màn quản lý ngân hàng chỉ ghi lên máy chủ khi bấm “Lưu thay đổi”
function scheduleBankSync() { if (BANK_READY && !HOLD_SYNC) { clearTimeout(syncTimer); syncTimer = setTimeout(flushBank, 500); } }
async function flushBank() {
  if (syncing) { syncAgain = true; return; }
  const cur = bankJson(), up = [], del = [];
  cur.forEach((js, id) => { if (bankSnap.get(id) !== js) up.push(JSON.parse(js)); });
  bankSnap.forEach((_, id) => { if (!cur.has(id)) del.push(id); });
  if (!up.length && !del.length) return;
  syncing = true;
  try {
    for (let i = 0; i < up.length; i += 150) await LB.api.post('/api/bank/sync', {upsert: up.slice(i, i + 150)});
    if (del.length) await LB.api.post('/api/bank/sync', {delete: del});
    bankSnap = cur;
  } catch (e) { toast('Không lưu được ngân hàng lên máy chủ: ' + e.message); }
  finally { syncing = false; if (syncAgain) { syncAgain = false; scheduleBankSync(); } }
}
// Ngân hàng cũ (lưu trên trình duyệt ở bản trước) có thể chuyển lên máy chủ một lần
const legacyCount = () => { try { return JSON.parse(localStorage.getItem('lbai_legacy_bank') || '[]').length; } catch (e) { return 0; } };
async function migrateLegacy() {
  const legacy = JSON.parse(localStorage.getItem('lbai_legacy_bank') || '[]');
  const imgs = await new Promise(ok => {
    try {
      const r = indexedDB.open('lbai_imgs', 1); r.onupgradeneeded = () => r.result.createObjectStore('img');
      r.onerror = () => ok(new Map());
      r.onsuccess = () => {
        const db = r.result; if (!db.objectStoreNames.contains('img')) return ok(new Map());
        const m = new Map(), cur = db.transaction('img').objectStore('img').openCursor();
        cur.onsuccess = () => { const c = cur.result; if (c) { m.set(c.key, c.value); c.continue(); } else ok(m); };
        cur.onerror = () => ok(m);
      };
    } catch (e) { ok(new Map()); }
  });
  for (const q of legacy) {
    if (q.img && imgs.get(q.img)) { try { q.img = (await LB.api.post('/api/img', {data: imgs.get(q.img)})).id; } catch (e) { delete q.img; } } else delete q.img;
  }
  const have = new Set((S.bank || []).map(x => x.id));
  S.bank = (S.bank || []).concat(legacy.filter(q => !have.has(q.id)));
  localStorage.removeItem('lbai_legacy_bank'); save();
  return legacy.length;
}

/* ---------- Sinh đề toán (tham số hóa, đáp án luôn đúng) ---------- */
const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const term = (k, v, first) => { const a = Math.abs(k), m = a === 1 ? '' : a; return first ? (k < 0 ? '−' : '') + m + v : ' ' + (k < 0 ? '−' : '+') + ' ' + m + v; };
const eq = (a, b, c) => term(a, 'x', 1) + term(b, 'y', 0) + ' = ' + fmt(c);
const sys = s => `<span class="sys"><i>${eq(s.a, s.b, s.c)}</i><i>${eq(s.d, s.e, s.f)}</i></span>`;
const LV = {1:'Củng cố', 2:'Thông hiểu', 3:'Vận dụng', 4:'Vận dụng cao', 5:'Nâng cao'};
function mk(r, lv) {
  const R = lv < 2 ? 2 : lv < 3 ? 4 : 7, nz = () => { let v; do v = ri(r, -R, R); while (!v); return v; }; let s;
  do {
    const x = lv < 2 ? ri(r, 1, 6) : lv < 3 ? ri(r, -5, 8) : ri(r, -9, 12), y = lv < 2 ? ri(r, 1, 6) : lv < 3 ? ri(r, -5, 8) : ri(r, -9, 12);
    const a = lv < 2 ? 1 : nz(), b = lv < 2 ? ri(r, 1, 2) : nz(), d = lv < 2 ? 1 : nz(), e = lv < 2 ? -ri(r, 1, 2) : nz();
    s = {x, y, a, b, d, e, c: a * x + b * y, f: d * x + e * y};
  } while (s.a * s.e - s.b * s.d === 0);
  return s;
}
function shuf(r, right, others) {
  const o = [right, ...others.filter((v, i, a) => v !== right && a.indexOf(v) === i).slice(0, 3)];
  for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
  return {opts: o, ans: o.indexOf(right)};
}
const P = (x, y) => `(${fmt(x)}; ${fmt(y)})`;
const GEN = {
  mcq(r, lv) {
    const s = mk(r, lv); let q, right, oth, sol;
    if (lv < 2) { q = `Nghiệm (x; y) của hệ phương trình ${sys(s)} là:`; right = P(s.x, s.y); oth = [P(s.y, s.x), P(-s.x, s.y), P(s.x, -s.y), P(s.x + 1, s.y), P(s.x, s.y + 1)]; sol = `Giải hệ được x = ${fmt(s.x)}, y = ${fmt(s.y)}.`; }
    else { const k = ri(r, 2, 3), v = k * s.x - s.y; q = `Hệ phương trình ${sys(s)} có nghiệm (x; y). Giá trị của ${k}x − y là:`; right = fmt(v); oth = [v + 1, v - 1, v + 2, v - 2, -v, v + 3].map(fmt); sol = `Giải hệ được x = ${fmt(s.x)}, y = ${fmt(s.y)} ⇒ ${k}x − y = ${fmt(v)}.`; }
    return {t:'mcq', lv, q, sol, ...shuf(r, right, oth)};
  },
  tf(r, lv) {
    const s = mk(r, lv), ok = r() < .5, p = ok ? s.x : s.x + ri(r, 1, 2);
    return {t:'tf', lv, q:`Cặp số ${P(p, s.y)} là nghiệm của hệ phương trình ${sys(s)}.`, opts:['Đúng', 'Sai'], ans: ok ? 0 : 1,
      sol: ok ? 'Thay vào cả hai phương trình đều thỏa mãn.' : `Nghiệm đúng của hệ là ${P(s.x, s.y)} nên khẳng định sai.`};
  },
  short(r, lv) {
    const s = mk(r, lv), m = ri(r, 1, 3), n = ri(r, 1, 3), v = m * s.x + n * s.y, ex = term(m, 'x', 1) + term(n, 'y', 0);
    return {t:'short', lv, q:`Giải hệ phương trình ${sys(s)} rồi tính giá trị biểu thức ${ex}.`, ans: v, sol:`x = ${fmt(s.x)}, y = ${fmt(s.y)} ⇒ ${ex} = ${fmt(v)}.`};
  },
  essay(r, lv) {
    if (lv < 2) { const s = mk(r, 1); return {t:'essay', lv, q:`Giải hệ phương trình ${sys(s)}`, sol:`Nghiệm: (x; y) = ${P(s.x, s.y)}.`}; }
    const w = lv < 3 ? ri(r, 0, 1) : ri(r, 2, 3);
    if (w === 0) { const x = ri(r, 10, 40), y = ri(r, 1, x - 1); return {t:'essay', lv, q:`Tổng của hai số bằng ${x + y}, hiệu của chúng bằng ${x - y}. Tìm hai số đó.`, sol:`Gọi hai số là x, y: x + y = ${x + y}, x − y = ${x - y}. Hai số là ${x} và ${y}.`}; }
    if (w === 1) { const a = ri(r, 5, 15), l = a + ri(r, 2, 10); return {t:'essay', lv, q:`Một hình chữ nhật có chu vi ${2 * (a + l)} m, chiều dài hơn chiều rộng ${l - a} m. Tính diện tích hình chữ nhật.`, sol:`Chiều dài ${l} m, chiều rộng ${a} m ⇒ diện tích ${a * l} m².`}; }
    if (w === 2) {
      const p = ri(r, 3, 9), q = ri(r, 5, 15); let a1, b1, a2, b2;
      do { a1 = ri(r, 1, 5); b1 = ri(r, 1, 5); a2 = ri(r, 1, 5); b2 = ri(r, 1, 5); } while (a1 * b2 - a2 * b1 === 0);
      return {t:'essay', lv, q:`Mua ${a1} bút và ${b1} quyển vở hết ${a1 * p + b1 * q} nghìn đồng; mua ${a2} bút và ${b2} quyển vở hết ${a2 * p + b2 * q} nghìn đồng. Tính giá của mỗi chiếc bút và mỗi quyển vở.`, sol:`Lập hệ theo giá bút x, giá vở y (nghìn đồng). Kết quả: bút ${p} nghìn, vở ${q} nghìn.`};
    }
    const k = ri(r, 1, 5);
    return {t:'essay', lv, q:`Cho hệ phương trình <span class="sys"><i>x + y = m</i><i>x − y = ${k}</i></span> (m là tham số). Tìm m để nghiệm (x; y) thỏa mãn x = 2y.`, sol:`x = (m + ${k})/2, y = (m − ${k})/2. Điều kiện x = 2y ⇒ m + ${k} = 2m − ${2 * k} ⇒ m = ${3 * k}.`};
  }
};
const pickLv = (r, sl) => Math.max(1, Math.min(3, 1 + Math.round(sl / 50 + (r() - .5) * 1.2)));
const ORD = ['mcq', 'tf', 'short', 'essay'];
function buildExam(c, seed) {
  const r = rng(seed), ty = c.types.length ? c.types : ['mcq'], out = [];
  for (let i = 0; i < c.n; i++) out.push(GEN[ty[i % ty.length]](r, pickLv(r, c.sl)));
  return out.sort((a, b) => ORD.indexOf(a.t) - ORD.indexOf(b.t));
}
function examHTML(qs, ans, edit) {
  return qs.map((q, i) => `<div class="lb-q"><div class="qh">Câu ${i + 1}. ${qBody(q)}<span class="lv">${LV[q.lv]}</span>${edit ? `<button class="redo" data-i="${i}">↻ Đổi câu</button>` : ''}</div>` +
    (isTfg(q) ? tfgHTML(q, ans) : imgq(q) && q.t === 'mcq' ? '' : q.opts ? `<div class="opts">${q.opts.map((o, j) => `<span class="${ans && j === q.ans ? 'ok' : ''}">${'ABCD'[j]}. ${optText(q, o)}</span>`).join('')}</div>`
      : q.t === 'short' ? '<div style="margin-left:14px">Đáp số: ………………</div>' : '<div style="margin-left:14px;color:#98a2b3">Bài làm: ……………………………………………</div>') +
    (ans ? `<div class="sol"><b>Đáp án${ansText(q) ? ': ' + esc(ansText(q)) : ''}.</b> ${solBody(q)}</div>` : '') + '</div>').join('');
}
function examPrintHTML(title, qs, ans) {
  const headerHTML = `
    <div class="print-header">
      <div class="header-left">
        <div><b>TRƯỜNG: ..............................................................</b></div>
        <div>Họ và tên: ..............................................................</div>
        <div>Lớp: ........................ Số báo danh: .......................</div>
      </div>
      <div class="header-right">
        <div class="exam-title-badge">${ans ? 'ĐÁP ÁN & HƯỚNG DẪN CHẤM' : 'BÀI KIỂM TRA ĐÁNH GIÁ'}</div>
        <div class="exam-main-title">${esc(title)}</div>
        <div style="font-size:11px;margin-top:3px">Thời gian làm bài: 45 phút (Không kể phát đề)</div>
      </div>
    </div>
    <div class="grade-box">
      <div class="grade-col">Điểm số</div>
      <div class="comment-col">Lời phê của thầy / cô giáo</div>
    </div>
  `;

  const questionsHTML = qs.map((q, i) => {
    let optsHTML = '';
    if (isTfg(q)) {
      optsHTML = tfgHTML(q, ans);
    } else if (imgq(q) && q.t === 'mcq') {
      optsHTML = '';
    } else if (q.opts && q.opts.length > 0) {
      optsHTML = `<div class="print-opts">
        ${q.opts.map((o, j) => `<span><b>${'ABCD'[j]}.</b> ${optText(q, o)}</span>`).join('')}
      </div>`;
    } else if (q.t === 'short') {
      optsHTML = `<div style="margin:6px 0 10px 18px;font-style:italic">Đáp số: ........................................................................................</div>`;
    } else {
      optsHTML = `<div style="margin:6px 0 14px 18px;color:#888;font-style:italic">Bài làm: ....................................................................................................................................................<br>....................................................................................................................................................................</div>`;
    }

    const solHTML = ans ? `<div class="print-sol"><b>Đáp án đúng:</b> ${esc(ansText(q))} &nbsp;|&nbsp; <b>Lời giải:</b> ${solBody(q)}</div>` : '';

    return `
      <div class="print-q">
        <div class="print-qh"><b>Câu ${i + 1}:</b> ${qBody(q)} <span class="print-lv">[Mức: ${LV[q.lv] || 'Tiêu chuẩn'}]</span></div>
        ${optsHTML}
        ${solHTML}
      </div>
    `;
  }).join('');

  return headerHTML + questionsHTML;
}

async function downloadExam(title, qs, ans) {
  EMBED = await embedImages(qs);
  const css = `
    <style>
      body { font-family: "Times New Roman", Times, serif; font-size: 13pt; line-height: 1.45; color: #000; padding: 25px; }
      .header-table { width: 100%; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 14px; }
      .header-table td { vertical-align: top; }
      .score-table { width: 100%; border: 1px solid #000; border-collapse: collapse; margin-bottom: 16px; height: 60px; }
      .score-table td { border: 1px solid #000; padding: 6px; font-weight: bold; font-size: 11pt; vertical-align: top; }
      .sys { display: inline-block; border-left: 2px solid #000; padding-left: 6px; }
      .sys i { display: block; font-style: normal; }
      .q-block { margin-bottom: 12px; }
      .opts-table { width: 100%; margin: 4px 0 8px 18px; }
      .opts-table td { width: 50%; padding: 2px 8px; }
      .sol-box { background: #f0f4f8; border-left: 3px solid #166534; padding: 6px 10px; margin: 6px 0 10px 18px; font-size: 11pt; color: #166534; }
    </style>
  `;

  const header = `
    <table class="header-table">
      <tr>
        <td style="width: 55%; font-size: 11pt; line-height: 1.6;">
          <b>TRƯỜNG: ..............................................................</b><br>
          Họ và tên: ..............................................................<br>
          Lớp: ........................ Số báo danh: .......................
        </td>
        <td style="width: 45%; text-align: center;">
          <b style="font-size: 12pt; text-transform: uppercase;">${ans ? 'ĐÁP ÁN & HƯỚNG DẪN CHẤM' : 'BÀI KIỂM TRA ĐÁNH GIÁ'}</b><br>
          <b style="font-size: 13pt;">${esc(title)}</b><br>
          <span style="font-size: 10pt;">Thời gian làm bài: 45 phút</span>
        </td>
      </tr>
    </table>
    <table class="score-table">
      <tr>
        <td style="width: 25%;">Điểm số</td>
        <td style="width: 75%;">Lời phê của thầy / cô giáo</td>
      </tr>
    </table>
  `;

  const body = qs.map((q, i) => {
    let opts = '';
    if (isTfg(q)) {
      opts = tfgHTML(q, ans);
    } else if (imgq(q) && q.t === 'mcq') {
      opts = '';
    } else if (q.opts && q.opts.length >= 2) {
      opts = `<table class="opts-table">
        <tr>
          <td><b>A.</b> ${optText(q, q.opts[0] || '')}</td>
          <td><b>B.</b> ${optText(q, q.opts[1] || '')}</td>
        </tr>
        ${q.opts.length > 2 ? `<tr>
          <td><b>C.</b> ${optText(q, q.opts[2] || '')}</td>
          <td><b>D.</b> ${optText(q, q.opts[3] || '')}</td>
        </tr>` : ''}
      </table>`;
    } else if (q.t === 'short') {
      opts = '<div style="margin: 6px 0 8px 18px; font-style: italic;">Đáp số: ............................................................................</div>';
    } else {
      opts = '<div style="margin: 6px 0 12px 18px; color: #888; font-style: italic;">Bài làm: ....................................................................................................................................................<br>....................................................................................................................................................................</div>';
    }

    const sol = ans ? `<div class="sol-box"><b>Đáp án đúng:</b> ${esc(ansText(q))} &nbsp;|&nbsp; <b>Lời giải:</b> ${solBody(q)}</div>` : '';

    return `<div class="q-block">
      <div><b>Câu ${i + 1}:</b> ${qBody(q)} <span style="font-size:9pt;color:#666">[Mức: ${LV[q.lv] || 'Tiêu chuẩn'}]</span></div>
      ${opts}
      ${sol}
    </div>`;
  }).join('');

  const html = `<html><head><meta charset="utf-8"><title>${esc(title)}</title>${css}</head><body>${header}${body}</body></html>`;
  EMBED = null;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff', html], {type: 'application/msword'}));
  a.download = title.replace(/[^\p{L}\p{N}]+/gu, '_') + '.doc';
  document.body.append(a);
  a.click();
  a.remove();
}

/* Câu đúng/sai 4 ý: chọn Đúng/Sai cho từng ý; điểm theo quy tắc đề thi (1 ý 0,1 · 2 ý 0,25 · 3 ý 0,5 · 4 ý 1) */
function tfgQuiz(q, qa, done) {
  const pick = q.sts.map(() => null);
  qa.innerHTML = q.sts.map((st, i) => `<div class="tfg-row" data-i="${i}" style="display:flex;gap:8px;align-items:center;margin:6px 0"><b>${'abcd'[i]})</b><span style="flex:1;font-size:13px">${imgq(q) ? '' : esc(st)}</span><button class="lb-opt" data-v="0" style="width:auto;margin:0;padding:6px 14px">Đúng</button><button class="lb-opt" data-v="1" style="width:auto;margin:0;padding:6px 14px">Sai</button></div>`).join('')
    + '<button class="btn btn-blue" id="tfg-ok" disabled style="margin-top:8px">Kiểm tra</button>';
  $$('.tfg-row', qa).forEach(row => $$('button', row).forEach(bt => bt.onclick = () => {
    pick[+row.dataset.i] = +bt.dataset.v;
    $$('button', row).forEach(x => x.classList.toggle('sel', x === bt));
    $('#tfg-ok', qa).disabled = pick.some(v => v === null);
  }));
  $('#tfg-ok', qa).onclick = () => {
    let right = 0;
    $$('.tfg-row', qa).forEach(row => {
      const i = +row.dataset.i, good = pick[i] === q.ans[i]; if (good) right++;
      $$('button', row).forEach(x => { x.disabled = true; if (+x.dataset.v === q.ans[i]) x.classList.add('good'); else if (x.classList.contains('sel')) x.classList.add('bad'); });
    });
    $('#tfg-ok', qa).disabled = true;
    done([0, 0.1, 0.25, 0.5, 1][right]);
  };
}

/* ---------- Quiz online ---------- */
function runQuiz(qs, o) {
  const G = qs.filter(q => q.t !== 'essay' && hasAns(q)), skip = qs.length - G.length;
  if (!G.length) return toast('Đề này chưa có câu nào chấm tự động — hãy nhập đáp án đúng ở “Quản lý & sửa đáp án”, hoặc dùng bản in');
  let i = 0, ok = 0; const m = modal('', 0), b = m.b;
  const next = () => { i++; draw(); };
  function draw() {
    if (i >= G.length) return finish();
    const q = G[i];
    b.innerHTML = `<h2>${esc(o.title)}</h2><div class="lb-prog"><span style="width:${i / G.length * 100}%"></span></div><div class="lb-q"><div class="qh">Câu ${i + 1}/${G.length}. ${qBody(q)}</div></div><div id="qa"></div><div id="qf"></div>`;
    const qa = $('#qa', b), fb = $('#qf', b);
    const done = (good, chosen) => {
      const sc = typeof good === 'number' ? good : (good ? 1 : 0), partial = sc > 0 && sc < 1;
      ok += sc; good = sc === 1 || partial;
      fb.innerHTML = `<div class="lb-q"><div class="sol" style="${good ? '' : 'border-color:#e85b4a;background:#fdecea'}"><b>${partial ? 'Đúng một phần (' + sc + ' điểm).' : good ? 'Chính xác!' : 'Chưa đúng.'}</b> ${solBody(q)}</div></div><button class="btn btn-blue" id="nx">${i + 1 < G.length ? 'Câu tiếp →' : 'Xem kết quả'}</button>`;
      $('#nx', b).onclick = next;
    };
    if (isTfg(q)) tfgQuiz(q, qa, done);
    else if (q.opts) q.opts.forEach((t, j) => { const bt = document.createElement('button'); bt.className = 'lb-opt'; bt.innerHTML = 'ABCD'[j] + '. ' + optText(q, t);
      bt.onclick = () => { $$('.lb-opt', qa).forEach((x, k) => { x.disabled = true; if (k === q.ans) x.classList.add('good'); }); if (j !== q.ans) bt.classList.add('bad'); done(j === q.ans); }; qa.append(bt); });
    else { qa.innerHTML = '<div class="lb-row"><input id="sa" type="text" placeholder="Nhập đáp án" style="padding:10px;border:1px solid #e5eaf1;border-radius:8px"><button class="btn btn-blue" id="sb">Kiểm tra</button></div>';
      const chk = () => { const v = $('#sa', b).value.trim(); if (v === '') return; $('#sa', b).disabled = $('#sb', b).disabled = true; done(sameAns(v, q.ans)); };
      $('#sb', b).onclick = chk; $('#sa', b).onkeydown = e => { if (e.key === 'Enter') chk(); }; $('#sa', b).focus(); }
  }
  function finish() {
    const pct = Math.round(ok / G.length * 100);
    S.results.push({title:o.title, who:o.who || '', ok, total:G.length, ts:Date.now()});
    if (o.profile) S.profile.algebra = Math.round(S.profile.algebra * .8 + pct * .2);
    save();
    b.innerHTML = `<h2>Kết quả: ${+ok.toFixed(2)}/${G.length} câu (${pct}%)</h2><p>${pct >= 80 ? 'Rất tốt! Bạn nắm vững phần này.' : pct >= 50 ? 'Khá ổn — xem lại các câu sai để củng cố.' : 'Cần luyện thêm dạng này, đừng nản nhé!'}</p>${skip ? `<div class="lb-note">${skip} câu tự luận hoặc chưa có đáp án cần giáo viên chấm.</div>` : ''}${o.profile ? '<div class="lb-note">Learning Profile (Đại số) đã được cập nhật.</div>' : ''}<div class="lb-row"><button class="btn btn-blue" id="again">Làm lại</button><button class="btn btn-outline" id="cl">Đóng</button></div>`;
    $('#again', b).onclick = () => { i = 0; ok = 0; draw(); }; $('#cl', b).onclick = () => { m.close(); if (o.after) o.after(); };
  }
  draw();
}

/* ---------- AI Teacher Copilot ---------- */
const ROSTER = {'An':2, 'Bình':3, 'Dũng':5};

/* ---------- DANH MỤC CHUYÊN ĐỀ THEO MÔN & KHỐI LỚP (GDPT) ---------- */
const TOPICS_CATALOG = {
  'Toán': {
    '6': ['Số tự nhiên & các phép tính', 'Số nguyên & tính chất chia hết', 'Phân số & số thập phân', 'Hình học trực quan (tam giác đều, hình vuông, lục giác)', 'Yếu tố thống kê & biểu đồ cột'],
    '7': ['Số hữu tỉ & số thực', 'Tỉ lệ thức & đại lượng tỉ lệ', 'Biểu thức đại số & đa thức một biến', 'Tam giác bằng nhau & tam giác cân', 'Góc & hai đường thẳng song song'],
    '8': ['Đa thức & hằng đẳng thức đáng nhớ', 'Phân thức đại số', 'Hàm số bậc nhất & đồ thị', 'Định lý Thalès & tam giác đồng dạng', 'Hình chóp tam giác & tứ giác đều'],
    '9': ['Hệ hai phương trình bậc nhất hai ẩn', 'Phương trình bậc hai & Định lý Viète', 'Căn bậc hai & căn bậc ba', 'Hệ thức lượng trong tam giác vuông', 'Đường tròn & góc với đường tròn'],
    '10': ['Mệnh đề & tập hợp', 'Bất phương trình & hệ bất phương trình bậc nhất hai ẩn', 'Hàm số bậc hai & tam thức bậc hai', 'Vectơ & hệ trục tọa độ', 'Xác suất cổ điển & thống kê'],
    '11': ['Hàm số & phương trình lượng giác', 'Dãy số, cấp số cộng & cấp số nhân', 'Giới hạn & đạo hàm', 'Hình học không gian: Quan hệ song song', 'Quan hệ vuông góc trong không gian'],
    '12': ['Đề giữa kì 1 Toán 12', 'Ứng dụng đạo hàm khảo sát & vẽ đồ thị hàm số', 'Nguyên hàm, tích phân & ứng dụng', 'Phương pháp tọa độ trong không gian Oxyz', 'Xác suất có điều kiện & công thức Bayes', 'Phương trình mũ & logarit']
  },

};

/* ---------- NGÂN HÀNG CÂU HỎI MẪU THEO MÔN & LỚP (OFFLINE) ---------- */
const OFFLINE_QUESTION_BANK = {
  'Toán': {
    '6': [
      { t:'mcq', lv:1, q:'Tập hợp các số tự nhiên nhỏ hơn 5 là:', opts:['{1; 2; 3; 4; 5}', '{0; 1; 2; 3; 4}', '{0; 1; 2; 3; 4; 5}', '{1; 2; 3; 4}'], ans:1, sol:'Số tự nhiên bắt đầu từ 0. Các số nhỏ hơn 5 là: 0, 1, 2, 3, 4.' },
      { t:'mcq', lv:2, q:'Kết quả của phép tính (-15) + 35 là:', opts:['20', '-20', '50', '-50'], ans:0, sol:'(-15) + 35 = 35 - 15 = 20.' },
      { t:'mcq', lv:3, q:'Ước chung lớn nhất của 24 và 36 là:', opts:['6', '8', '12', '18'], ans:2, sol:'24 = 2³ × 3; 36 = 2² × 3² => ƯCLN(24, 36) = 2² × 3 = 12.' },
      { t:'tf', lv:1, q:'Số 2 là số nguyên tố chẵn duy nhất.', opts:['Đúng', 'Sai'], ans:0, sol:'Đúng. Mọi số chẵn khác 2 đều chia hết cho 2 nên đều là hợp số.' },
      { t:'tf', lv:2, q:'Phân số 15/25 là phân số tối giản.', opts:['Đúng', 'Sai'], ans:1, sol:'Sai. Rút gọn cho 5 được phân số 3/5.' },
      { t:'short', lv:1, q:'Tìm số tự nhiên x biết: 3x - 12 = 18.', ans:10, sol:'3x = 18 + 12 = 30 => x = 10.' },
      { t:'short', lv:2, q:'Tính giá trị biểu thức: 2³ × 5 - 15.', ans:25, sol:'2³ × 5 - 15 = 8 × 5 - 15 = 40 - 15 = 25.' },
      { t:'essay', lv:2, q:'Một mảnh vườn hình chữ nhật có chiều dài 25m, chiều rộng 12m. Tính chu vi và diện tích mảnh vườn.', sol:'Chu vi: (25 + 12) × 2 = 74m. Diện tích: 25 × 12 = 300m².' },
      { t:'essay', lv:3, q:'Lớp 6A có 40 học sinh. Số học sinh giỏi chiếm 25% cả lớp. Số học sinh khá bằng 3/5 số còn lại. Tính số học sinh trung bình của lớp.', sol:'Số HS giỏi: 40 × 25% = 10. Số HS còn lại: 40 - 10 = 30. Số HS khá: 30 × 3/5 = 18. Số HS trung bình: 30 - 18 = 12 em.' }
    ],
    '7': [
      { t:'mcq', lv:1, q:'Số đối của số hữu tỉ -3/7 là:', opts:['3/7', '-7/3', '7/3', '-3/-7'], ans:0, sol:'Số đối của -a là a, vậy số đối của -3/7 là 3/7.' },
      { t:'mcq', lv:2, q:'Nếu x/4 = 9/x và x > 0 thì giá trị của x là:', opts:['6', '-6', '36', '3'], ans:0, sol:'x² = 4 × 9 = 36 => x = 6 (do x > 0).' },
      { t:'tf', lv:1, q:'Tổng ba góc trong một tam giác luôn bằng 180°.', opts:['Đúng', 'Sai'], ans:0, sol:'Đúng theo định lý tổng ba góc của tam giác.' },
      { t:'short', lv:2, q:'Cho tam giác ABC cân tại A có góc A = 50°. Tính số đo góc B (độ).', ans:65, sol:'Góc B = (180° - 50°) / 2 = 65°.' },
      { t:'essay', lv:2, q:'Cho đa thức P(x) = 2x² - 3x + 1 và Q(x) = x² + 3x - 5. Tính P(x) + Q(x) và tìm nghiệm của đa thức tổng.', sol:'P(x) + Q(x) = 3x² - 4. Cho 3x² - 4 = 0 => x = ±√(4/3) = ±2√3/3.' }
    ],
    '8': [
      { t:'mcq', lv:1, q:'Khai triển hằng đẳng thức (x - 2y)² ta được:', opts:['x² - 4xy + 4y²', 'x² - 2xy + 4y²', 'x² - 4y²', 'x² + 4xy + 4y²'], ans:0, sol:'(a - b)² = a² - 2ab + b² => (x - 2y)² = x² - 4xy + 4y².' },
      { t:'mcq', lv:2, q:'Cho tam giác ABC có AB = 6cm, AC = 8cm. Điểm M trên AB sao cho AM = 3cm. Kẻ MN // BC (N thuộc AC). Độ dài AN là:', opts:['4cm', '3cm', '5cm', '2cm'], ans:0, sol:'Theo định lý Thalès: AM/AB = AN/AC => 3/6 = AN/8 => AN = 4cm.' },
      { t:'tf', lv:1, q:'Hình bình hành có hai đường chéo bằng nhau là hình chữ nhật.', opts:['Đúng', 'Sai'], ans:0, sol:'Đúng theo dấu hiệu nhận biết hình chữ nhật.' },
      { t:'short', lv:2, q:'Tìm x biết: (x - 3)(x + 3) - x(x - 2) = 5.', ans:7, sol:'x² - 9 - x² + 2x = 5 => 2x = 14 => x = 7.' },
      { t:'essay', lv:2, q:'Rút gọn biểu thức A = (x² - 4)/(x - 2) + (x² + 4x + 4)/(x + 2) với x ≠ ±2.', sol:'A = (x-2)(x+2)/(x-2) + (x+2)²/(x+2) = (x+2) + (x+2) = 2x + 4.' }
    ],
    '10': [
      { t:'mcq', lv:1, q:'Mệnh đề nào sau đây là mệnh đề ĐÚNG?', opts:['Tổng hai số lẻ luôn là số lẻ', 'Số 12 chia hết cho 5', 'Hình vuông là hình chữ nhật', 'Mọi tam giác đều có góc tù'], ans:2, sol:'Hình vuông là trường hợp đặc biệt của hình chữ nhật có 4 cạnh bằng nhau.' },
      { t:'mcq', lv:2, q:'Tập nghiệm của bất phương trình x² - 4x + 3 < 0 là:', opts:['(1; 3)', '(-∞; 1) ∪ (3; +∞)', '[1; 3]', '(-3; -1)'], ans:0, sol:'Tam thức có 2 nghiệm x = 1, x = 3. Hệ số a = 1 > 0 nên khoảng nghiệm trái dấu là (1; 3).' },
      { t:'tf', lv:2, q:'Vectơ có điểm đầu trùng với điểm cuối được gọi là vectơ-không.', opts:['Đúng', 'Sai'], ans:0, sol:'Đúng theo định nghĩa vectơ-không.' },
      { t:'short', lv:2, q:'Tìm tung độ đỉnh của Parabol y = x² - 4x + 1.', ans:-3, sol:'Hoành độ đỉnh x = -b/(2a) = 2. Tung độ y = 2² - 4×2 + 1 = -3.' },
      { t:'essay', lv:3, q:'Giải bất phương trình: -2x² + 5x + 7 ≥ 0.', sol:'Tam thức có 2 nghiệm x = -1 và x = 7/2. Vì a = -2 < 0 nên tập nghiệm lấy dấu ≥ là đoạn [-1; 7/2].' }
    ],
    '11': [
      { t:'mcq', lv:1, q:'Nghiệm của phương trình sin x = 1/2 là:', opts:['x = π/6 + k2π hoặc x = 5π/6 + k2π', 'x = π/3 + k2π hoặc x = 2π/3 + k2π', 'x = ±π/6 + k2π', 'x = π/6 + kπ'], ans:0, sol:'sin x = sin(π/6) => x = π/6 + k2π hoặc x = π - π/6 + k2π = 5π/6 + k2π.' },
      { t:'mcq', lv:2, q:'Cho cấp số cộng (u_n) có u_1 = 3 và công sai d = 4. Số hạng thứ 10 bằng:', opts:['39', '43', '36', '40'], ans:0, sol:'u_10 = u_1 + 9d = 3 + 9 × 4 = 39.' },
      { t:'tf', lv:2, q:'Nếu một đường thẳng vuông góc với hai đường thẳng cắt nhau cùng thuộc một mặt phẳng thì nó vuông góc với mặt phẳng đó.', opts:['Đúng', 'Sai'], ans:0, sol:'Đúng theo định lý điều kiện để đường thẳng vuông góc với mặt phẳng.' },
      { t:'short', lv:2, q:'Tính đạo hàm của hàm số y = x⁴ - 2x² + 3 tại x = 1.', ans:0, sol:'y\' = 4x³ - 4x. Tại x = 1: y\'(1) = 4(1)³ - 4(1) = 0.' },
      { t:'essay', lv:3, q:'Tìm giới hạn: L = lim (x -> 2) của (x² - 5x + 6) / (x - 2).', sol:'Ta có: x² - 5x + 6 = (x - 2)(x - 3). Với x ≠ 2, biểu thức rút gọn thành x - 3. Khi x -> 2: L = 2 - 3 = -1.' }
    ],
    '12': [

      { t:'mcq', lv:1, topic:'Đề giữa kì 1 Toán 12', q:'Cho hàm số y = f(x) có bảng xét dấu f\'(x) như hình vẽ. Hàm số đồng biến trên khoảng nào trong các khoảng sau?', opts:['(-\infty; +\infty)', '(-2; +\infty)', '(-\infty; -2)', '(2; +\infty)'], ans:2, sol:'Hàm số đồng biến trên khoảng (-∞; -2) nơi f\'(x) > 0.' },
      { t:'mcq', lv:2, topic:'Đề giữa kì 1 Toán 12', q:'Hàm số y = -x^3 + 3x^2 + 1 đồng biến trên khoảng nào dưới đây?', opts:['(-\infty; 0)', '(2; +\infty)', '(0; 2)', '(-\infty; 1)'], ans:2, sol:'y\' = -3x^2 + 6x > 0 <=> 0 < x < 2.' },
      { t:'mcq', lv:2, topic:'Đề giữa kì 1 Toán 12', q:'Điểm cực tiểu của hàm số y = x^3 - 3x + 5 là:', opts:['x = -1', 'x = 1', 'y = 3', 'y = 7'], ans:1, sol:'y\' = 3x^2 - 3 = 0 => x = ±1. Đổi dấu từ - sang + tại x = 1.' },
      { t:'mcq', lv:1, topic:'Đề giữa kì 1 Toán 12', q:'Cho hàm số y = f(x) liên tục trên đoạn [-1; 2] và có GTLN bằng 5, GTNN bằng 1. Giá trị lớn nhất của hàm số trên đoạn [-1; 2] bằng:', opts:['4', '2', '5', '1'], ans:2, sol:'Giá trị lớn nhất trên đoạn [-1; 2] bằng 5 theo bảng biến thiên.' },
      { t:'mcq', lv:2, topic:'Đề giữa kì 1 Toán 12', q:'Đường tiệm cận đứng của đồ thị hàm số y = (3x - 2) / (x - 4) là đường thẳng có phương trình:', opts:['y = 3', 'x = -4', 'x = 4', 'y = 4'], ans:2, sol:'Mẫu số x - 4 = 0 => x = 4 là tiệm cận đứng.' },
      { t:'mcq', lv:2, topic:'Đề giữa kì 1 Toán 12', q:'Đường tiệm cận xiên của đồ thị hàm số y = 2x - 1 - 4 / (x + 2) có phương trình là:', opts:['y = x + 2', 'y = 2x - 1', 'y = 2x - 4', 'x = -2'], ans:1, sol:'Khi x -> ±infty, phần phân số tiến tới 0, tiệm cận xiên là y = 2x - 1.' },
      { t:'mcq', lv:1, topic:'Đề giữa kì 1 Toán 12', q:'Tọa độ tâm đối xứng I của đồ thị hàm số y = (2x + 3) / (x - 1) là:', opts:['I(-1; 2)', 'I(2; 1)', 'I(1; 2)', 'I(1; 3)'], ans:2, sol:'Giao điểm tiệm cận đứng x = 1 và tiệm cận ngang y = 2 là I(1; 2).' },
      { t:'mcq', lv:2, topic:'Đề giữa kì 1 Toán 12', q:'Một vật rơi tự do theo phương thẳng đứng có quãng đường s(t) = 5t^2 (mét). Vận tốc tức thời tại t = 4 giây bằng:', opts:['20 m/s', '40 m/s', '80 m/s', '10 m/s'], ans:1, sol:'v(t) = s\'(t) = 10t => v(4) = 40 m/s.' },
      { t:'tf', lv:2, topic:'Đề giữa kì 1 Toán 12', q:'Đồ thị hàm số y = (2x - 1) / (x + 2) có tiệm cận ngang y = 2.', opts:['Đúng', 'Sai'], ans:0, sol:'Đúng. lim(2x - 1)/(x + 2) khi x -> ±∞ bằng 2.' },
      { t:'tf', lv:2, topic:'Đề giữa kì 1 Toán 12', q:'Hàm số y = x^3 - 6x^2 + 9x đồng biến trên khoảng (1; 3).', opts:['Đúng', 'Sai'], ans:1, sol:'Sai. y\' = 3x^2 - 12x + 9 < 0 trên khoảng (1; 3) nên hàm số nghịch biến.' },
      { t:'short', lv:2, topic:'Đề giữa kì 1 Toán 12', q:'Tìm vận tốc lớn nhất của vật chuyển động với s(t) = -t^3 + 6t^2 + 12t trong 4 giây đầu tiên (m/s).', ans:24, sol:'v(t) = -3t^2 + 12t + 12 = -3(t-2)^2 + 24 <= 24. Max v = 24 tại t = 2.' },
      { t:'short', lv:2, topic:'Đề giữa kì 1 Toán 12', q:'Sau khi tiêm thuốc, nồng độ thuốc trong máu C(t) = 6t / (t^2 + 9). Sau bao nhiêu giờ thì nồng độ thuốc đạt mức cao nhất?', ans:3, sol:'C\'(t) = 6(9 - t^2)/(t^2+9)^2 = 0 => t = 3 giờ.' },
      { t:'essay', lv:3, topic:'Đề giữa kì 1 Toán 12', q:'Tìm giá trị lớn nhất và nhỏ nhất của hàm số y = x^3 - 3x^2 + 2 trên đoạn [0; 3].', sol:'y\' = 3x^2 - 6x = 0 => x = 0, x = 2. y(0) = 2, y(2) = -2, y(3) = 2. GTLN = 2, GTNN = -2.' }
,
      { t:'mcq', lv:1, q:'Đạo hàm của hàm số y = x³ - 3x + 5 là:', opts:['y\' = 3x² - 3', 'y\' = 3x² + 3', 'y\' = x² - 3', 'y\' = 3x²'], ans:0, sol:'y\' = (x³)\' - 3(x)\' = 3x² - 3.' },
      { t:'mcq', lv:2, q:'Họ tất cả các nguyên hàm của hàm số f(x) = 2x + cos x là:', opts:['x² + sin x + C', 'x² - sin x + C', '2 + sin x + C', 'x² + cos x + C'], ans:0, sol:'∫(2x + cos x)dx = x² + sin x + C.' },
      { t:'mcq', lv:3, q:'Giá trị lớn nhất của hàm số y = -x⁴ + 2x² + 1 trên đoạn [0; 2] bằng:', opts:['2', '1', '-7', '3'], ans:0, sol:'y\' = -4x³ + 4x = -4x(x² - 1) = 0 => x = 0 hoặc x = 1 (trên [0; 2]). y(0) = 1, y(1) = 2, y(2) = -7. Vậy Max = 2 tại x = 1.' },
      { t:'tf', lv:2, q:'Nếu hàm số y = f(x) có đạo hàm f\'(x) > 0 trên khoảng (a; b) thì hàm số đồng biến trên khoảng đó.', opts:['Đúng', 'Sai'], ans:0, sol:'Đúng theo định lý sự biến thiên của hàm số.' },
      { t:'short', lv:2, q:'Tính tích phân I = ∫ từ 0 đến 1 của (3x² + 2x) dx.', ans:2, sol:'I = [x³ + x²] từ 0 đến 1 = (1 + 1) - 0 = 2.' },
      { t:'essay', lv:3, q:'Trong không gian Oxyz, viết phương trình mặt phẳng (P) đi qua M(1; 2; -3) và vuông góc với đường thẳng d có VTPT n = (2; -1; 3).', sol:'Phương trình: 2(x - 1) - 1(y - 2) + 3(z + 3) = 0 <=> 2x - y + 3z + 9 = 0.' }
    ]
  }
};

/* ---------- NGÂN HÀNG CÂU HỎI: PARSER VĂN BẢN + IMPORT PDF ---------- */
const TYN = {mcq: 'trắc nghiệm', tf: 'đúng/sai', short: 'trả lời ngắn', essay: 'tự luận'};
const NOLET = 'A-Za-zÀ-ỹ';
// Câu đúng/sai theo chùm: 1 câu gồm 4 ý a) b) c) d), mỗi ý chọn Đúng (0) hoặc Sai (1)
const isTfg = q => !!q && Array.isArray(q.sts);
const hasAns = q => q.t === 'essay' ? true
  : isTfg(q) ? (Array.isArray(q.ans) && q.ans.length === q.sts.length && q.ans.every(v => v === 0 || v === 1))
  : q.t === 'short' ? (q.ans !== null && q.ans !== undefined && String(q.ans).trim() !== '')
  : (Number.isInteger(q.ans) && q.ans >= 0 && !!q.opts && q.ans < q.opts.length);
const ansText = q => isTfg(q) ? (hasAns(q) ? q.sts.map((_, i) => 'abcd'[i] + ': ' + (q.ans[i] === 0 ? 'Đ' : 'S')).join(', ') : 'chưa có')
  : q.opts ? (Number.isInteger(q.ans) && q.ans >= 0 ? 'ABCD'[q.ans] : 'chưa có')
  : q.t === 'short' ? (hasAns(q) ? fmt(q.ans) : 'chưa có') : '';
// Bảng chọn Đúng/Sai cho từng ý (dùng cho xem trước, in A4 và .doc)
const tfgHTML = (q, showAns) => `<table style="border-collapse:collapse;margin:4px 0 8px 18px;width:92%;font-size:inherit">${q.sts.map((st, i) => {
  const d = showAns && q.ans && q.ans[i] === 0, s = showAns && q.ans && q.ans[i] === 1;
  return `<tr><td style="width:24px;vertical-align:top"><b>${'abcd'[i]})</b></td>${imgq(q) ? '' : `<td style="padding-right:10px">${esc(st)}</td>`}<td style="white-space:nowrap;width:70px;${d ? 'color:#166534;font-weight:700' : ''}">${d ? '☑' : '☐'} Đúng</td><td style="white-space:nowrap;width:60px;${s ? 'color:#166534;font-weight:700' : ''}">${s ? '☑' : '☐'} Sai</td></tr>`;
}).join('')}</table>`;
const shuffleArr = (a, r) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sameAns = (v, a) => {
  const n = s => String(s).trim().toLowerCase().replace(/−/g, '-').replace(/\s+/g, '').replace(',', '.').replace(/\.$/, '');
  const x = n(v), y = n(a); if (x === y) return true;
  const fx = Number(x), fy = Number(y);
  return x !== '' && y !== '' && isFinite(fx) && isFinite(fy) && Math.abs(fx - fy) < 1e-9;
};
let BID = 0;

const SEC_HINT = [[/đúng\s*[-–\/]?\s*sai/i, 'tf'], [/trả\s*lời\s*ngắn|điền\s*(?:khuyết|đáp)|đáp\s*số/i, 'short'], [/tự\s*luận/i, 'essay'], [/trắc\s*nghiệm|nhiều\s*phương\s*án|lựa\s*chọn/i, 'mcq']];
// Tiêu đề dạng câu: "PHẦN I", "PHẦN TRẮC NGHIỆM ĐÚNG SAI", "2. Câu hỏi trắc nghiệm đúng sai", "B. Bài tập tự luận"...
const PHAN_RE = '^[ \\t]*(?:PH[ẦÀẪẲẢẤA]N\\s+(?:[IVXlI1|]+|\\d|TRẮC|ĐÚNG|TRẢ|TỰ)|(?:[IVX]+|\\d+|[A-D])[.)]\\s+(?:Câu\\s+(?:hỏi\\s+)?)?(?:Trắc\\s*nghiệm|Tự\\s*luận|Bài\\s*tập\\s+(?:trắc|tự)))(?![' + NOLET + '])';

// Tách phần đề và phần bảng đáp án (nếu file có "ĐÁP ÁN" ở cuối)
function splitKeySection(text) {
  const re = /^[ \t]*(?:BẢNG\s+)?(?:ĐÁP\s*ÁN|HƯỚNG\s+DẪN\s+(?:GIẢI|CHẤM)|LỜI\s+GIẢI)(?:[ \t]+[^\n]{0,90})?[ \t]*[:.]?[ \t]*$/gm;
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(0, m.index);
    if ((before.match(/(?:^|\n)\s*(?:Câu|Bài|Question)\s*\d+/gi) || []).length >= 3) return {body: before, key: text.slice(m.index + m[0].length)};
  }
  return {body: text, key: ''};
}

// Đọc đáp án từ một đoạn: {l:'A'} | {tfg:{a:true,..}} | {tf:true} | {val:'3,5'}  (+ sol)
const SOL_MAX = 5000;
const cleanSol = s => s.replace(/^\s*(?:Lời\s*giải(?:\s*chi\s*tiết)?|Hướng\s*dẫn(?:\s*giải)?|Giải\s*thích|Giải)\s*[:.]?/i, '').replace(/\s+/g, ' ').trim().slice(0, SOL_MAX);
function extractAns(seg) {
  if (!seg) return null;
  const r = extractAns0(seg);
  if (r && r.sol && seg.split(MATHMARK).length > 3) r.solBad = true;   // lời giải có công thức → chữ đọc từ PDF bị vỡ
  return r;
}
function extractAns0(seg) {
  seg = seg.split(MATHMARK).join('');
  const tl = /(?:^|\n)[ \t]*Trả\s*lời\s*:\s*([^\n]{1,40})/i.exec(seg);   // “Trả lời: 7,35” ngay sau dòng “Lời giải” (câu trả lời ngắn)
  if (tl) return {val: tl[1].trim().replace(/[.;]$/, ''), sol: cleanSol(seg.slice(tl.index + tl[0].length))};
  const sol = cleanSol(seg.replace(/^\s*(?:Chọn|Đáp\s*án)[^\n.]*[.\n]?/, ''));
  const after = m => cleanSol(seg.slice(m.index + m[0].length).replace(/^\s*[.;,]/, ''));   // phần lời giải viết sau dòng đáp án
  // "Đáp án: Đ - S - Đ - S" (4 ý a–d của câu đúng/sai, viết liền theo thứ tự)
  const seq = /(?:Đáp\s*án|ĐA)\s*[:.]?\s*(Đúng|Sai|[ĐÐD]|S)\s*[-–,;/ ]\s*(Đúng|Sai|[ĐÐD]|S)\s*[-–,;/ ]\s*(Đúng|Sai|[ĐÐD]|S)\s*[-–,;/ ]\s*(Đúng|Sai|[ĐÐD]|S)(?![A-Za-zÀ-ỹ])/.exec(seg);
  // OCR hay làm mất dấu gạch ("S - S-ĐĐ-S"): lấy đúng 4 chữ Đ/S đứng ngay sau "Đáp án:"
  const sq2 = !seq && /(?:Đáp\s*án|ĐA)\s*[:.]?\s*([ĐÐDS][\s\-–,;\/ĐÐDS]{3,20})(?![A-Za-zÀ-ỹ])/.exec(seg);
  if (sq2) {
    const tk = sq2[1].trim().split(/[\s\-–,;\/]+/).filter(Boolean), lt = sq2[1].replace(/[^ĐÐDS]/g, '');
    const L = tk.length === 4 && tk.every(t => /^([ĐÐDS])\1*$/.test(t)) ? tk.map(t => t[0]) : (lt.length === 4 ? lt.split('') : null);   // "ĐĐ" do OCR đọc lặp → coi là một ý
    if (L) return {tfg: {a: L[0] !== 'S', b: L[1] !== 'S', c: L[2] !== 'S', d: L[3] !== 'S'}, sol: after(sq2)};
  }
  if (seq) return {tfg: {a: /^[ĐÐD]/.test(seq[1]), b: /^[ĐÐD]/.test(seq[2]), c: /^[ĐÐD]/.test(seq[3]), d: /^[ĐÐD]/.test(seq[4])}, sol: after(seq)};
  const tfm = [...seg.matchAll(new RegExp('(?:^|[^' + NOLET + '])([a-d])\\s*[)\\-:.]?\\s*(Đúng|Sai|Đ|S)(?![' + NOLET + '])', 'g'))];
  if (tfm.length >= 2) { const o = {}; tfm.forEach(x => { o[x[1]] = /^Đ/.test(x[2]); }); return {tfg: o, sol}; }
  const l = new RegExp('(?:Chọn|chọn|Đáp\\s*án|ĐÁP\\s*ÁN|đáp\\s*án|ĐA)\\s*(?:đúng\\s*)?(?:là\\s*)?[:.]?\\s*\\(?([A-D])(?![' + NOLET + '])').exec(seg)
    || new RegExp('^\\s*([A-D])(?![' + NOLET + '])').exec(seg);
  if (l) return {l: l[1], sol};
  const t = /^\s*(?:(?:Đáp\s*án|ĐA)\s*[:.]?\s*)?(Đúng|Sai|Đ|S)\s*(?:[.,;]|$)/.exec(seg);
  if (t) return {tf: /^Đ/.test(t[1]), sol};
  let v = /(?:Đáp\s*án|ĐA|Kết\s*quả)\s*[:.]?\s*([^\n]{1,40})/.exec(seg);
  if (v) return {val: v[1].trim().replace(/[.;]$/, ''), sol};
  v = /^\s*([\-−+]?\d[\d.,\/]*)\s*$/.exec(seg);
  if (v) return {val: v[1], sol: ''};
  return null;
}

// Câu hỏi được in lại nguyên văn (có đủ phương án A. B. C. D.; đáp án đúng có thể bị khoanh tròn nên mất dấu chấm) và dòng “Lời giải” tách riêng
const RESTATED_RE = /(?:^|\s)A\.\s[\s\S]*?\sB\.?\s[\s\S]*?\sC\.?\s[\s\S]*?\sD\.?\s/;
const SOLMARK_RE = /\n[ \t]*Lời\s*giải[ \t]*(?:\n|$)/i;
const solAfterMarker = seg => { const m = SOLMARK_RE.exec(seg); return m ? seg.slice(m.index + m[0].length) : null; };

// Đọc bảng đáp án cuối đề: "Câu 1. Chọn A", "1.A 2.B", hoặc bảng 2 dòng
function parseKey(key) {
  if (!key.trim()) return [];
  let list = [];
  // Bảng đáp án dạng hàng ngang: "Câu 1 2 3 ... 12" rồi "Đáp án D D D ..." (trắc nghiệm) hoặc "Đáp án 27 22,5% 20,3 ..." (trả lời ngắn).
  // Đọc riêng rồi bỏ khỏi chuỗi để dòng "Câu 1 2 3..." không bị nhận nhầm là câu số 1.
  const tabled = [];
  // Bảng đáp án đúng/sai: "Câu a) b) c) d)" rồi mỗi dòng "1 Đ S Đ Đ" (số câu + 4 ý a–d)
  key = key.replace(/(?:^|\n)[ \t]*Câu[ \t]+a\)[ \t]+b\)[ \t]+c\)[ \t]+d\)[ \t]*\n((?:[ \t]*\d{1,3}(?:[ \t]+[ĐÐS]){4}[ \t]*(?:\n|$))+)/g, (all, rows) => {
    const id = tabled.length;
    tabled.push(rows.trim().split('\n').map(r => r.trim().split(/\s+/)).map(r => ({n: +r[0], tbl: 'tf', a: {tfg: {a: r[1] !== 'S', b: r[2] !== 'S', c: r[3] !== 'S', d: r[4] !== 'S'}}})));
    return `\n§T${id}§\n`;
  });
  key = key.replace(/Đáp[ \t]*\n[ \t]*án/g, 'Đáp án').replace(/(?:^|\n)[ \t]*(?:Câu|STT)((?:[ \t]+\d{1,3}){2,})[ \t]*\n[ \t]*(?:Đáp\s*án|ĐA)[ \t]*:?[ \t]*\n?[ \t]*([^\n]+)/g, (all, nums, vals) => {
    const ns = nums.trim().split(/\s+/), vs = vals.trim().split(/\s+/);
    if (ns.length !== vs.length) return all;
    const letters = vs.every(v => /^[A-D]$/.test(v)), id = tabled.length;
    tabled.push(ns.map((n, k) => ({n: +n, tbl: letters ? 'mcq' : 'short', a: letters ? {l: vs[k]} : {val: vs[k].replace(/%$/, '')}})));
    return `\n§T${id}§\n`;   // giữ nguyên vị trí của bảng trong chuỗi để sắp xếp đúng thứ tự phần
  });
  tabled.forEach((rows, id) => { const p = key.indexOf(`§T${id}§`); rows.forEach((r, k) => list.push({...r, pos: p + k / 100})); });
  const marks = [...key.matchAll(/(?:^|\n)[ \t]*(?:Câu|Bài|Question)\s*(\d{1,3})\s*[:.)]?/gi)];
  marks.forEach((mk, i) => {
    const seg = key.slice(mk.index + mk[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined).split(/\n[ \t]*PH[ẦÀẪẲẢẤA]N\s+/)[0].trim();
    const sm = solAfterMarker(seg);
    let a = extractAns(seg);
    // phần đáp án in lại cả đề: đoạn nào không nhận ra đáp án (đáp án lấy từ bảng cuối đề) vẫn phải có mục để giữ lời giải và để số phần (run) khớp với phần đề
    if (!a && ((sm != null && sm.trim()) || RESTATED_RE.test(seg))) a = {sol: ''};
    if (a) {
      // Phần đáp án trình bày lại cả đề: lời giải chỉ là phần sau dòng “Lời giải”; câu trắc nghiệm chỉ in lại câu hỏi (đáp án khoanh tròn) thì không có lời giải
      if (sm != null) { a.sol = cleanSol(sm.split(MATHMARK).join('')); if (sm.split(MATHMARK).length > 3) a.solBad = true; else delete a.solBad; }
      else if (RESTATED_RE.test(seg)) { a.sol = ''; delete a.solBad; }
      list.push({n: +mk[1], pos: mk.index, a});
    }
  });
  // chỉ khi phần đáp án không có các mục “Câu N” đọc được (khóa kiểu “1.A 2.B 3.C”): nếu không, “4. B” nằm rải rác trong lời giải bị nhặt nhầm thành đáp án
  if (!tabled.length && (marks.length < 3 || list.length < marks.length * 0.5)) for (const m of key.matchAll(new RegExp('(?:^|[\\s,;|])(\\d{1,3})\\s*[.\\-–:)]?\\s*([A-D])(?![' + NOLET + '0-9])', 'g'))) {
    if (!list.some(e => e.n === +m[1] && Math.abs(e.pos - m.index) < 15)) list.push({n: +m[1], pos: m.index, a: {l: m[2]}});
  }
  if (list.length < 3) {
    list = [];
    const lines = key.split('\n').map(s => s.trim());
    for (let i = 0; i + 1 < lines.length; i++) {
      const nums = lines[i].replace(/^(?:Câu|STT)\s*/i, '').match(/^(?:\d{1,3}\s+)*\d{1,3}$/);
      const lets = lines[i + 1].replace(/^(?:Đáp\s*án|ĐA)\s*/i, '').match(/^(?:[A-D]\s+)*[A-D]$/);
      if (nums && lets) {
        const ns = nums[0].split(/\s+/), ls = lets[0].split(/\s+/);
        if (ns.length === ls.length) ns.forEach((n, k) => list.push({n: +n, pos: i * 1000 + k, a: {l: ls[k]}}));
      }
    }
  }
  list.sort((x, y) => x.pos - y.pos);
  let run = 0, prev = 0; list.forEach((e, i) => { if (i && e.n <= prev) run++; e.run = run; prev = e.n; });
  return list;
}

// Tìm dãy phương án theo thứ tự (A,B,C,D hoặc a,b,c,d) trong chuỗi đã gộp dòng
function findSeq(flat, letters, closer) {
  const rx = L => new RegExp('(?:^|\\s|(?<=[.;]))' + L + '\\s*' + closer + '\\s*', 'g');   // phương án có thể dính liền dấu chấm của phương án trước: “…(O).B. không có…”
  const r0 = rx(letters[0]); let m0, best = null;
  while ((m0 = r0.exec(flat))) {
    const pos = [{i: m0.index + (/^\s/.test(m0[0]) ? 1 : 0), e: m0.index + m0[0].length}];
    let from = r0.lastIndex, ok = true;
    for (let k = 1; k < letters.length; k++) {
      const r = rx(letters[k]); r.lastIndex = from; const m = r.exec(flat);
      if (!m) { ok = false; break; }
      pos.push({i: m.index + (/^\s/.test(m[0]) ? 1 : 0), e: m.index + m[0].length}); from = r.lastIndex;
    }
    if (ok && (!best || pos[pos.length - 1].i - pos[0].i < best[best.length - 1].i - best[0].i)) best = pos;
  }
  return best;
}

const TAIL_RE = new RegExp('(?:^|\\n)[ \\t]*(?:Đáp\\s*án|ĐÁP\\s*ÁN|Lời\\s*giải|LỜI\\s*GIẢI|Hướng\\s*dẫn|Giải\\s*thích|Chọn\\s+[A-D](?![' + NOLET + ']))');
let PARSE_DEFAULT = 'short';
// sec: dạng câu theo TIÊU ĐỀ trong đề (nếu đọc được); infer: gợi ý khi đề không có tiêu đề chữ (chỉ dùng cho câu không có phương án)
function parseBlock(raw, sec, ke, infer) {
  let s = raw.replace(/^\s*(?:(?:Câu|Bài|Question)\s*\d+\s*[:.)]?|\d+\s*[.)])\s*/i, '');
  const tm = TAIL_RE.exec(s);
  let tail = '';
  if (tm) { tail = s.slice(tm.index); s = s.slice(0, tm.index); }
  const flat = s.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!flat) return [];
  const info = extractAns(tail) || (ke && ke.a) || null;
  const sm = /(?:Lời\s*giải|LỜI\s*GIẢI|Hướng\s*dẫn(?:\s*giải)?|Giải\s*thích)\s*[:.]?\s*([\s\S]*)/.exec(tail);
  const solRaw = sm ? sm[1] : ((info && info.sol) || (ke && ke.a && ke.a.sol) || '');
  const sol = esc(solRaw.replace(/\s+/g, ' ').trim().slice(0, SOL_MAX));
  const mk = o => ({sol, ...o});   // chưa gắn mức độ (lv) — import tự phân mức, các nơi khác coi câu chưa gắn mức là “thông hiểu”

  // chữ C hay bị OCR đọc thành e / € / c nên chấp nhận khi đủ cả 4 phương án theo đúng thứ tự
  // trong phần ĐÚNG–SAI mà đủ 4 ý a) b) c) d) thì đó là câu đúng/sai (chữ “A)”, “B)” trong ngoặc ở đề bài, ví dụ “(điểm A)”, không phải phương án)
  const lowFirst = sec === 'tf' && !!findSeq(flat, ['a', 'b', '[ce]', 'd'], '[)]');
  const up = lowFirst ? null : findSeq(flat, ['A', 'B', '(?:C|c|e|E|€)', 'D'], '[.)]');
  if (up) {
    const opts = up.map((p, k) => flat.slice(p.e, k < 3 ? up[k + 1].i : undefined).trim());
    return [mk({t: 'mcq', q: esc(flat.slice(0, up[0].i).trim()), opts, ans: info && info.l ? 'ABCD'.indexOf(info.l) : null})];
  }
  // công thức làm hỏng phương án D: thấy đủ A, B, C vẫn là trắc nghiệm (phương án D để trống cho giáo viên sửa)
  const up3 = findSeq(flat, ['A', 'B', '(?:C|c|e|E|€)'], '[.)]');
  if (up3 && !lowFirst && sec !== 'short' && sec !== 'essay') {
    const o3 = up3.map((p, k) => flat.slice(p.e, k < 2 ? up3[k + 1].i : undefined).trim());
    return [mk({t: 'mcq', q: esc(flat.slice(0, up3[0].i).trim()), opts: [...o3, '…'], ans: info && info.l ? 'ABCD'.indexOf(info.l) : null, warn: true})];
  }
  const low = findSeq(flat, ['a', 'b', '[ce]', 'd'], '[)]');
  if (low && sec !== 'short' && sec !== 'essay' && (infer !== 'essay' || sec === 'tf')) {
    const stem = flat.slice(0, low[0].i).trim();
    const sts = low.map((p, k) => flat.slice(p.e, k < 3 ? low[k + 1].i : undefined).trim());
    const ans = 'abcd'.split('').map(L => info && info.tfg && L in info.tfg ? (info.tfg[L] ? 0 : 1) : null);
    return [mk({t: 'tf', q: esc(stem), sts, ans})];   // 1 câu gồm đủ 4 ý a, b, c, d
  }
  const up2 = findSeq(flat, ['A', 'B'], '[.)]');
  if (up2) {
    const o = up2.map((p, k) => flat.slice(p.e, k < 1 ? up2[1].i : undefined).trim());
    if (o.every(x => /^(đúng|sai)\.?$/i.test(x))) {
      let ans = null;
      if (info && info.l) ans = /đúng/i.test(o['AB'.indexOf(info.l)] || '') ? 0 : 1;
      else if (info && info.tf !== undefined) ans = info.tf ? 0 : 1;
      return [mk({t: 'tf', q: esc(flat.slice(0, up2[0].i).trim()), opts: ['Đúng', 'Sai'], ans})];
    }
  }
  // Đúng/sai CHỈ khi có đủ 4 ý a) b) c) d) (đã xử lý ở trên); mục “đúng/sai” mà không tách được 4 ý thì không tạo câu Đúng/Sai giả → trả lời ngắn
  const t = sec === 'short' || sec === 'tf' ? 'short' : sec === 'essay' ? 'essay'
    : (info && info.val != null ? 'short' : infer === 'essay' ? 'essay' : PARSE_DEFAULT);   // không có A–D, không có a–d: chỉ có câu hỏi → trả lời ngắn (Ngữ văn: tự luận)
  if (t === 'tf') {
    let ans = null;
    if (info && info.tf !== undefined) ans = info.tf ? 0 : 1;
    return [mk({t, q: esc(flat), opts: ['Đúng', 'Sai'], ans})];
  }
  if (t === 'short') return [mk({t, q: esc(flat), ans: info && info.val != null ? info.val : null, ...(sec === 'tf' ? {warn: true} : {})})];
  return [mk({t: 'essay', lv: 3, q: esc(flat)})];
}

// câu thuộc một đề thi (examId) được giữ riêng theo từng đề, không bị coi là trùng với câu cùng nội dung ở chuyên đề/đề khác
const bankKey = q => (q.examId ? q.examId + '|' : '') + q.t + '|' + q.q + '|' + (q.opts || []).join('|') + '|' + (q.sts || []).join('|');

function parseQuestionBank(raw, src, hasLines) {
  const text = String(raw || '').replace(/\r/g, '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
  // vị trí dòng (để cắt ảnh từ PDF): lineOf(off) = số dòng đứng trước vị trí off
  const nl = []; for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) nl.push(i);
  const lineOf = off => { let lo = 0, hi = nl.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (nl[mid] < off) lo = mid + 1; else hi = mid; } return lo; };
  const textLines = hasLines ? text.split('\n') : null;
  const {body, key} = splitKeySection(text);
  const secs = [];
  for (const m of body.matchAll(new RegExp(PHAN_RE + '[^\\n]*(?:\\n(?![ \\t]*(?:Câu|Bài|Question)\\s*\\d)[^\\n]*)?', 'gim'))) {
    const hit = SEC_HINT.find(h => h[0].test(m[0]));
    secs.push({i: m.index, t: hit ? hit[1] : ''});
  }
  let marks = [...body.matchAll(/(?:^|\n)[ \t]*(?:Câu|Bài|Question)\s*(\d{1,3})\s*[:.)]/gi)];
  if (!marks.length) marks = [...body.matchAll(/(?:^|\n)[ \t]*(\d{1,3})\s*[.)]\s+(?=\S)/g)];

  // Bảng đáp án cuối đề (TN · Đ/S · TLN) là đáp án chuẩn: ưu tiên hơn đáp án suy ra từ phần lời giải. Mỗi loại chỉ dùng khi có đúng một bảng.
  const allKey = parseKey(key), keyEntries = allKey.filter(e => !e.tbl), byRun = new Map(), byNum = new Map(), tbl = {mcq: new Map(), tf: new Map(), short: new Map()};
  ['mcq', 'tf', 'short'].forEach(k => { const es = allKey.filter(e => e.tbl === k); if (es.length && new Set(es.map(e => e.run)).size === 1) es.forEach(e => tbl[k].set(e.n, e.a)); });
  { let rr = 0, pp = 0; keyEntries.forEach((e, i) => { if (i && e.n <= pp) rr++; e.run = rr; pp = e.n; }); }   // đánh số lại phần (run) khi bỏ các bảng đáp án ra
  keyEntries.forEach(e => { byRun.set(e.run + ':' + e.n, e); if (!byNum.has(e.n)) byNum.set(e.n, e); });
  const kRuns = keyEntries.length ? keyEntries[keyEntries.length - 1].run + 1 : 0;
  let r0 = -1, p0 = Infinity; marks.forEach(m => { const n = +m[1]; if (n <= p0) r0++; p0 = n; });
  const useRun = kRuns === r0 + 1;
  // Khoảng dòng của lời giải chi tiết (để cắt ảnh lời giải, giữ nguyên công thức / hình vẽ)
  const endLine = (a, b) => b > a ? lineOf(b - 1) + 1 : lineOf(a) + 1;   // dòng kết thúc (không gồm) của đoạn [a,b)
  const solRun = new Map(), solNum = new Map(), solTxtRun = new Map(), solTxtNum = new Map(), optRun = new Map(), optNum = new Map(); let sRuns = 0;
  if (hasLines && key) {   // mục "Câu N." trong phần đáp án / hướng dẫn giải cuối đề (hoặc file đáp án riêng)
    const keyOff = text.length - key.length, km = [...key.matchAll(/(?:^|\n)[ \t]*(?:Câu|Bài|Question)\s*(\d{1,3})\s*[:.)]/gi)];
    let kr = -1, kp = Infinity;
    km.forEach((m, i) => {
      const n = +m[1]; if (n <= kp) kr++; kp = n;
      const st = m.index + (key[m.index] === '\n' ? 1 : 0);
      let en = i + 1 < km.length ? km[i + 1].index : key.length;
      const ph = key.slice(st, en).search(/\n[ \t]*PH[ẦÀẪẲẢẤA]N\s+/); if (ph >= 0) en = st + ph;
      // phần đáp án in lại cả câu hỏi: ảnh lời giải chỉ lấy từ dòng “Lời giải” trở xuống; câu chỉ in lại đề (không có “Lời giải”) thì không có ảnh lời giải
      const bt = key.slice(st, en), lm = SOLMARK_RE.exec(bt);
      let from = keyOff + st;
      if (lm) {
        from = keyOff + st + lm.index + 1;
        const orng = [lineOf(keyOff + st), lineOf(from)];   // đề in lại + các phương án (phương án đúng được gạch chân)
        optRun.set(kr + ':' + n, orng); if (!optNum.has(n)) optNum.set(n, orng);
        const tx = bt.slice(lm.index + lm[0].length), o = {text: cleanSol(tx.split(MATHMARK).join('')), bad: tx.split(MATHMARK).length > 3};   // lời giải chữ (đọc được cả khi không nhận ra đáp án trong đoạn này)
        solTxtRun.set(kr + ':' + n, o); if (!solTxtNum.has(n)) solTxtNum.set(n, o);
      } else if (RESTATED_RE.test(bt)) return;
      else {
        // không thấy dòng “Lời giải” (nhãn đỏ bị mất khi đọc chữ) nhưng câu đúng/sai được in lại a) b) c) d) rồi lời giải cũng bắt đầu bằng a) b) c) d) → lời giải bắt đầu ở “a)” thứ hai
        const as = [...bt.matchAll(/\n[ \t]*a\)/g)];
        if (as.length >= 2) {
          from = keyOff + st + as[1].index + 1;
          const tx = bt.slice(as[1].index + 1), o = {text: cleanSol(tx.split(MATHMARK).join('')), bad: tx.split(MATHMARK).length > 3};
          solTxtRun.set(kr + ':' + n, o); if (!solTxtNum.has(n)) solTxtNum.set(n, o);
        }
      }
      const rg = [lineOf(from), endLine(from, keyOff + en)];
      solRun.set(kr + ':' + n, rg); if (!solNum.has(n)) solNum.set(n, rg);
    });
    sRuns = kr + 1;
  }
  const useSolRun = sRuns === r0 + 1;

  const out = [], seen = new Set(); let prev = Infinity, run = -1, seenStruct = false;
  marks.forEach((mk, bi) => {
    const n = +mk[1]; if (n <= prev) run++; prev = n;
    let blk = body.slice(mk.index, bi + 1 < marks.length ? marks[bi + 1].index : undefined);
    const hp = blk.search(new RegExp('\\n' + PHAN_RE.slice(1), 'i')); if (hp >= 0) blk = blk.slice(0, hp);
    blk = blk.split(/\n[ \t\-–—]*HẾT[ \t\-–—]*(?:\n|$)/)[0];
    const hd = blk.search(/\n[ \t]*(?:Dạng\s*\d+\b|Chuyên\s*đề\s*\d+\b|CHỦ\s*ĐỀ\b|[A-D]\.\s+(?:Bài\s*tập|Lý\s*thuyết|Trắc\s*nghiệm|Tự\s*luận)|[IVX]+\.\s+[A-ZÀ-Ỵ]{3,})/);
    if (hd > 0) blk = blk.slice(0, hd);
    let sec = ''; for (const s of secs) { if (s.i < mk.index) sec = s.t; else break; }
    const ke = useRun ? byRun.get(run + ':' + n) : byNum.get(n);
    // khoảng dòng [a,b) của câu hỏi (không gồm phần "Đáp án/Lời giải" ghi ngay sau câu)
    let ra = 0, rb = 0, ss = null;
    if (hasLines) {
      const startOff = mk.index + (body[mk.index] === '\n' ? 1 : 0), tt = TAIL_RE.exec(blk);
      ra = lineOf(startOff);
      if (tt) {
        rb = lineOf(mk.index + tt.index + (blk[tt.index] === '\n' ? 1 : 0));
        const se = endLine(startOff, mk.index + blk.length);   // lời giải viết ngay sau câu hỏi
        if (se > rb) ss = [[rb, se]];
      } else { const eo = mk.index + blk.length; rb = eo >= text.length ? nl.length + 1 : (body[eo] === '\n' ? lineOf(eo) + 1 : lineOf(eo)); }
      if (!ss) { const kg = useSolRun ? solRun.get(run + ':' + n) : solNum.get(n); if (kg) ss = [kg]; }
    }
    const mathy = blk.includes(MATHMARK), tt0 = TAIL_RE.exec(blk);
    const solMathy = !!tt0 && blk.slice(tt0.index).split(MATHMARK).length > 3;   // lời giải ngay sau câu chứa công thức (font ký hiệu)
    blk = blk.split(MATHMARK).join('');
    // không có tiêu đề chữ: "Bài N." → tự luận; "Câu N." không phương án đứng sau câu trắc nghiệm/đúng-sai → trả lời ngắn
    const infer = /^\s*Bài/i.test(mk[0]) ? 'essay' : (seenStruct ? 'short' : '');
    const parsed = parseBlock(blk, sec, ke, infer);
    const stx = useSolRun ? solTxtRun.get(run + ':' + n) : solTxtNum.get(n);
    if (stx && stx.text) parsed.forEach(q => { if (!q.sol) { q.sol = stx.text; if (stx.bad) q.solBad = true; } });
    parsed.forEach(q => {
      // chỉ áp bảng đáp án đúng loại với phần chứa câu (câu số 3 của phần Đ/S không được nhận đáp án câu 3 của phần trắc nghiệm)
      if (q.t === 'mcq' && (!sec || sec === 'mcq') && tbl.mcq.has(n) && tbl.mcq.get(n).l) q.ans = 'ABCD'.indexOf(tbl.mcq.get(n).l);
      else if (isTfg(q) && (!sec || sec === 'tf') && tbl.tf.has(n)) { const g = tbl.tf.get(n).tfg; q.ans = ['a', 'b', 'c', 'd'].map(c => g[c] ? 0 : 1); }
      else if (q.t === 'short' && (!sec || sec === 'short') && tbl.short.has(n) && tbl.short.get(n).val != null) q.ans = tbl.short.get(n).val;
    });
    if (parsed.some(q => q.t === 'mcq' || isTfg(q))) seenStruct = true;
    // nhóm đúng/sai a) b) c) d): tìm dòng bắt đầu từng ý để mỗi ý có ảnh riêng (kèm phần dẫn)
    let aLines = null;
    if (hasLines && parsed.length === 4 && parsed.every(q => q.grp !== undefined)) {
      const found = []; let from = ra;
      for (const L of 'abcd') {
        let i = from; while (i < rb && !new RegExp('^[ \\t\\u2063]*' + L + '[ \\t\\u2063]*\\)').test(textLines[i] || '')) i++;
        if (i >= rb) { found.length = 0; break; } found.push(i); from = i + 1;
      }
      if (found.length === 4 && found[0] > ra) aLines = found;
    }
    parsed.forEach(q => {
      if (!q.q) return;
      if (mathy) q.warn = true;
      if (hasLines) q._rs = aLines ? [[ra, aLines[0]], [aLines[q.grp], q.grp < 3 ? aLines[q.grp + 1] : rb]] : [[ra, rb]];
      if (q.t === 'mcq') { const og = useSolRun ? optRun.get(run + ':' + n) : optNum.get(n); if (og) q._os = og; }   // vùng phương án trong phần lời giải (dò phương án gạch chân)
      if (ss && String(q.sol || '').replace(/<[^>]*>|&nbsp;|\s/g, '').length) q._ss = ss;   // chỉ cắt khi đoạn đó thực sự có lời giải
      if (q.sol && (solMathy || (ke && ke.a && ke.a.solBad) || solGarbled(q))) q.solBad = true;
      delete q.grp;
      const k = bankKey(q); if (seen.has(k)) return; seen.add(k);
      out.push({id: 'b' + Date.now().toString(36) + (BID++), src, ...q});
    });
  });
  const stats = {total: out.length, noAns: out.filter(q => !hasAns(q)).length};
  ORD.forEach(t => { stats[t] = out.filter(q => q.t === t).length; });
  return {questions: out, stats};
}
function parseExamTextFromWeb(raw) { return parseQuestionBank(raw, 'web').questions; }

// Thêm câu mới vào ngân hàng; câu trùng câu đã có thì bỏ qua, nhưng nếu lần import này đọc được lời giải tốt hơn
// (có ảnh lời giải, hoặc chữ không bị vỡ) thì bổ sung lời giải vào câu cũ → import lại file cũ để lấy ảnh lời giải.
let SOL_MERGED = 0;
function addToBank(list) {
  S.bank = S.bank || [];
  const idx = new Map(S.bank.map(q => [bankKey(q), q])); let n = 0; SOL_MERGED = 0;
  list.forEach(q => {
    delete q._os;
    const k = bankKey(q), old = idx.get(k);
    if (!old) { idx.set(k, q); S.bank.push(q); n++; return; }
    let got = false;
    if (q.solImg && !old.solImg) { old.solImg = q.solImg; delete q.solImg; got = true; }   // chuyển ảnh sang câu cũ (ảnh câu trùng bị xóa sau đó)
    if (q.sol && (!old.sol || (solGarbled(old) && !solGarbled(q)) || got)) {
      old.sol = q.sol; if (q.solBad) old.solBad = true; else delete old.solBad; got = true;
    }
    if (got) SOL_MERGED++;
  });
  save(); return n;
}

/* ---- Đề mẫu có sẵn: import bằng một nút, đã phân dạng và có đáp án (xem sample_exam.js) ---- */
function importSample(onChange) {
  const ex = (window.LB_SAMPLES && window.LB_SAMPLES.EXAMS) || [];
  if (!ex.length) return toast('Không tải được dữ liệu đề mẫu');
  const cnt = (e, t) => e.questions.filter(q => q.t === t).length;
  const m = modal(`<h2>📥 Import đề mẫu</h2><p style="font-size:12px;color:#667085;margin:0 0 10px">Đề đã được phân dạng sẵn (trắc nghiệm, đúng/sai, trả lời ngắn) và có đáp án. Câu trùng với câu đã có trong ngân hàng sẽ được bỏ qua.</p>
    ${ex.map((e, i) => `<div class="card" style="box-shadow:none;border:1px solid #e2e8f0;margin-bottom:8px"><b>${esc(e.title)}</b><div style="font-size:11px;color:#475467;margin:4px 0 8px">${e.questions.length} câu: ${cnt(e, 'mcq')} trắc nghiệm · ${cnt(e, 'tf')} đúng/sai · ${cnt(e, 'short')} trả lời ngắn · nhãn ${esc(e.subject)} · Khối ${esc(e.grade)}</div><button class="btn btn-blue sm" data-i="${i}">Import vào ngân hàng</button></div>`).join('')}`);
  $$('[data-i]', m.b).forEach(btn => btn.onclick = () => {
    const e = ex[+btn.dataset.i];
    const sb = 'i' + Date.now().toString(36), sat = Math.floor(Date.now() / 1000);
    const list = e.questions.map(q => { const o = {...q, subject: e.subject, grade: e.grade, src: window.LB_SAMPLES.SRC, batch: sb, at: sat, q: esc(q.q)}; if (o.sol) o.sol = esc(o.sol); return o; });
    const n = addToBank(list); m.close();
    onChange && onChange();
    modal(`<h2>${n ? '✓ Đã import ' + n + ' câu' : 'Đề mẫu đã có trong ngân hàng'}</h2>${n && list.length - n ? `<p style="font-size:12px;color:#667085">${list.length - n} câu trùng được bỏ qua.</p>` : ''}
      <p style="font-size:13px">Bước tiếp theo — bạn muốn làm gì với đề này?</p>
      <div class="lb-row" style="flex-direction:column;align-items:stretch;gap:8px">
        <a class="btn btn-blue" href="manage.html#practice">🎯 Mở cho học sinh tự luyện tập ngay</a>
        <button class="btn btn-outline" id="sm-gen">✦ Tạo đề kiểm tra từ ngân hàng này để giao bài</button>
        <button class="btn btn-outline" id="sm-mg">🗂 Xem & sửa câu hỏi vừa import</button></div>`);
    $('#sm-gen').onclick = () => { $$('.lb-overlay').forEach(x => x.remove()); const c = $('#cfg-subject'); if (c) c.scrollIntoView({behavior: 'smooth'}); };
    $('#sm-mg').onclick = () => { $$('.lb-overlay').forEach(x => x.remove()); openBankManager(onChange, n ? {batch: sb} : undefined); };
  });
}

/* ---- Đọc PDF bằng pdf.js (tải từ cdnjs lần đầu, cần Internet) ---- */
const PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Không tải được thư viện đọc PDF (cần Internet ở lần đầu)')); document.head.append(s); });
const PDFJS_LOCAL = '/vendor/pdfjs/';   // bản cài sẵn trên máy chủ → import PDF chạy được cả khi không có Internet
async function getPdfLib() {
  let base = PDFJS_LOCAL;
  if (!window.pdfjsLib) {
    try { await loadScript(PDFJS_LOCAL + 'pdf.min.js'); }
    catch (e) { base = PDFJS_BASE; await loadScript(PDFJS_BASE + 'pdf.min.js'); }
  } else if (window.pdfjsLib.GlobalWorkerOptions.workerSrc) base = null;
  const lib = window.pdfjsLib;
  if (!lib.GlobalWorkerOptions.workerSrc) {
    try {
      const code = await (await fetch(base + 'pdf.worker.min.js')).text();
      lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], {type: 'text/javascript'}));
    } catch (e) { lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js'; }
  }
  return lib;
}
// Phông Symbol của Word/MathType lưu ký hiệu toán ở vùng U+F0xx → đổi về ký tự Unicode đúng
const SYM_MAP = {0xA3:'≤',0xB3:'≥',0xB4:'×',0xB1:'±',0xB9:'≠',0xBB:'≈',0xA5:'∞',0xD6:'√',0xB7:'·',0xB0:'°',0xB8:'÷',0xAE:'→',0xAC:'←',0xDE:'⇒',0xDC:'⇐',0xDB:'⇔',0xCE:'∈',0xCF:'∉',0xCC:'⊂',0xC7:'∩',0xC8:'∪',0xC6:'∅',0xD0:'∠',0xA2:'′',0xD7:'⋅',0xB6:'∂',0xF2:'∫',0xB5:'∝',
  0x61:'α',0x62:'β',0x63:'χ',0x64:'δ',0x65:'ε',0x66:'φ',0x67:'γ',0x68:'η',0x69:'ι',0x6B:'κ',0x6C:'λ',0x6D:'μ',0x6E:'ν',0x6F:'ο',0x70:'π',0x71:'θ',0x72:'ρ',0x73:'σ',0x74:'τ',0x75:'υ',0x77:'ω',0x78:'ξ',0x79:'ψ',0x7A:'ζ',
  0x44:'Δ',0x46:'Φ',0x47:'Γ',0x4C:'Λ',0x50:'Π',0x51:'Θ',0x53:'Σ',0x57:'Ω',0x58:'Ξ',0x59:'Ψ',
  0xEC:'{',0xED:'',0xEE:'',0xFC:'}',0xFD:'',0xFE:'',0xE6:'',0xE7:'',0xE8:'',0xF6:'',0xF7:'',0xF8:''};
const MATHMARK = '⁣';
function fixPdfChars(str) {
  return str.replace(/[-]/g, ch => {
    const c = ch.charCodeAt(0) - 0xF000;
    const r = c in SYM_MAP ? SYM_MAP[c] : (c >= 0x20 && c < 0x7F ? String.fromCharCode(c) : '');
    return r + MATHMARK;
  }).replace(/�/g, '');
}
/* ---- Ảnh câu hỏi: lưu trên máy chủ (/api/img/<id>) ---- */
let EMBED = null;   // Map id → dataURL, chỉ dùng khi xuất .doc (Word không tải được ảnh cần đăng nhập)
const imgq = q => !!(q && q.img);
const imgSrc = id => (EMBED && EMBED.get(id)) || '/api/img/' + id;
const qBody = q => imgq(q) ? `<br><img class="q-img" src="${imgSrc(q.img)}" alt="Nội dung câu hỏi" style="max-width:100%;height:auto;margin:4px 0">` : q.q;
const optText = (q, o) => imgq(q) && q.t === 'mcq' ? '' : esc(o);
// Lời giải dạng chữ lấy từ lớp chữ của PDF: công thức (phân số, tích phân, π...) bị tách thành chuỗi ký hiệu rời
// ("2 2 33 3 020 0 1 ... π π π = = − =") → không đọc được. Nhận biết bằng dấu hiệu lúc import (solBad) hoặc
// các dấu vết chỉ có ở công thức bị tách (đã thử: không bắt nhầm lời giải viết tay có công thức).
function solGarbled(q) {
  if (!q || !q.sol) return false;
  if (q.solBad) return true;
  const s = String(q.sol);
  if (s.includes(MATHMARK)) return true;   // ký tự đánh dấu công thức còn sót trong chữ
  const txt = ' ' + s.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ') + ' ';
  // dấu hiệu chắc chắn (chữ viết tay không bao giờ có): ký hiệu lặp liền "= =", "π π"; dãy ≥ 6 con số rời; dãy ≥ 5 chữ cái rời
  if (/ ([=−π∫∑]) \1 /.test(txt) || / (?:\d+ ){5,}\d+ /.test(txt) || / (?:[A-Za-z] ){4,}[A-Za-z] /.test(txt)) return true;
  // dấu vết công thức bị tách: "( )" rỗng, biến dính dấu "=" rồi cách ("t= ", "dx= "), ∫ đứng trơ không có biểu thức, ký tự ký hiệu lạ
  const cnt = rx => (txt.match(rx) || []).length;
  return cnt(/\(\s+\)/g) + cnt(/[A-Za-z′][=<>≤≥] /g) + cnt(/∫ /g) + cnt(/[υρ]/g) >= 2;
}
// Lời giải: ưu tiên ảnh cắt từ file đề (giữ nguyên công thức, hình vẽ); không có ảnh thì dùng lời giải dạng chữ (trừ khi chữ bị vỡ công thức)
const solBody = q => q && q.solImg ? `<img class="q-img sol-img" src="${imgSrc(q.solImg)}" alt="Lời giải chi tiết" style="max-width:100%;height:auto;margin:4px 0;display:block">`
  : (q && q.sol && !solGarbled(q) ? q.sol : '');
const hasSol = q => !!(q && (q.solImg || (q.sol && !solGarbled(q))));
function dropImgs(list) { list.forEach(q => ['img', 'solImg'].forEach(k => { if (q[k]) LB.api.del('/api/img/' + q[k]).catch(() => {}); })); }
async function embedImages(qs) {
  const m = new Map();
  await Promise.all([...new Set(qs.flatMap(q => [q.img, q.solImg]).filter(Boolean))].map(async id => {
    try {
      const b = await (await fetch('/api/img/' + id, {credentials: 'same-origin'})).blob();
      m.set(id, await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); }));
    } catch (e) { /* giữ liên kết */ }
  }));
  return m;
}

/* ---- Đọc PDF: văn bản + toạ độ từng dòng (để cắt ảnh câu hỏi) ---- */
const LAB_RE = /^\s*(?:Câu|Bài|Question)\s*\d+\s*[:.)]/i;
const PAGENUM_RE = /^\s*(?:Trang|Page)?\s*\d{1,3}(?:\s*[\/\-–]\s*\d{1,3})?\s*[-–—]?\s*$/i;
async function extractPdfText(file, onProgress, ocr, pdfOverride) {
  const lib = await getPdfLib();
  const pdf = pdfOverride || await lib.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise;
  const lines = [], pages = {}, pdata = []; let ocrPages = 0;
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p), vp1 = page.getViewport({scale: 1}), H = vp1.height;
    const tc = await page.getTextContent();
    const pl = []; let cur = null;
    const flush = () => {
      if (!cur) return;
      const plain = cur.text.split(MATHMARK).join(''), m = LAB_RE.exec(plain);
      if (m) {   // vị trí x kết thúc nhãn "Câu N." để che đi khi cắt ảnh (đề sẽ đánh số lại)
        let idx = 0, c = 0; for (; idx < cur.text.length && c < m[0].length; idx++) if (cur.text[idx] !== MATHMARK) c++;
        const it = cur.items.find(i => idx - 1 >= i.a && idx - 1 < i.b);
        if (it) cur.lab = it.x + it.w * ((idx - it.a) / Math.max(1, it.b - it.a));
      }
      if (/[A-D]\./.test(plain)) {   // vị trí các chữ cái phương án: dùng dò phương án được gạch chân trong phần lời giải
        const opt = [];
        for (const mm of cur.text.matchAll(/(?:^|[\s\u2063])([A-D])\.(?=[\s\u2063]|$)/g)) {
          const idx = mm.index + mm[0].indexOf(mm[1]), it = cur.items.find(i => idx >= i.a && idx < i.b);
          if (it) { const cw = it.w / Math.max(1, it.b - it.a), x0 = it.x + cw * (idx - it.a); opt.push({c: mm[1], x0, x1: x0 + cw * 1.2, y: it.y}); }
        }
        if (opt.length) cur.opt = opt;
      }
      pl.push(cur); cur = null;
    };
    for (const it of tc.items) {
      if (typeof it.str !== 'string') continue;
      const x = it.transform[4], y = it.transform[5], h = it.height || Math.abs(it.transform[3]) || 10;
      if (cur && Math.abs(y - cur.y) > Math.max(2, h * 0.6)) flush();
      if (it.str !== '') {
        if (!cur) cur = {p, y, text: '', top: -1e9, bot: 1e9, l: 1e9, r: -1e9, prevEnd: null, items: []};
        const s = fixPdfChars(it.str), w = it.width || 0;
        if (cur.prevEnd !== null && x - cur.prevEnd > 1.5 && !/\s$/.test(cur.text) && !/^\s/.test(s)) cur.text += ' ';
        const a = cur.text.length; cur.text += s; cur.prevEnd = x + w;
        cur.top = Math.max(cur.top, y + h * 0.95); cur.bot = Math.min(cur.bot, y - h * 0.3);
        cur.l = Math.min(cur.l, x); cur.r = Math.max(cur.r, x + w);
        cur.items.push({x, w, a, b: cur.text.length, y});
      }
      if (it.hasEOL) flush();
    }
    flush();
    // trang không có lớp chữ (ảnh scan): đọc bằng OCR rồi xử lý như trang có chữ
    if (ocr && pl.reduce((n, l) => n + l.text.replace(/\s/g, '').length, 0) < 30) { const o = await ocr(p, page, H); if (o && o.length) { pl.length = 0; pl.push(...o); ocrPages++; } }
    pdata.push({p, pl, H, W: vp1.width});
    onProgress && onProgress(p, pdf.numPages);
  }
  // Đầu / chân trang = dòng lặp lại trên nhiều trang (tên website, số điện thoại, tên trường, SỐ TRANG…). Số trang chỉ được coi là số trang khi
  // lặp lại ở cùng vị trí trên nhiều trang — một chữ số lẻ (mẫu số phân số, chỉ số) nằm gần đáy trang KHÔNG phải số trang.
  const zone = (l, H) => l.top > H * 0.88 || l.bot < H * 0.12;
  const keyOf = (l, H) => { const t = l.text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase(), up = l.top > H / 2; return t + '|' + (up ? 'T' : 'B') + (PAGENUM_RE.test(l.text.trim()) ? Math.round((up ? H - l.top : l.bot) / 6) : ''); };
  // Dòng chữ đầu/chân trang: đủ dài (≥ 10 chữ cái), không phải nhãn "Câu N." hay dòng phương án A./B. — tránh loại nhầm nội dung đề ở cuối trang
  const hfText = l => { const t = l.text.trim(); return t.length >= 4 && !PAGENUM_RE.test(t) && !LAB_RE.test(t) && !/^[A-Da-d][.)]/.test(t) && (t.match(/\p{L}/gu) || []).length >= 10; };
  // Lớp chữ ẩn: một số PDF chèn dưới MỌI trang cùng một khối chữ (vd. trang đề của file khác, không nhìn thấy nhưng vẫn nằm trong văn bản) → câu bị trùng,
  // lẫn đáp án. Khối chữ lặp y hệt cùng vị trí trên ≥ 3 trang (và ≥ 25% số trang) với ≥ 8 dòng mỗi trang thì bỏ cả khối.
  const okey = l => l.text.replace(/\s+/g, ' ').trim() + '|' + Math.round(l.top / 3) + '|' + Math.round(l.l / 4);
  const orep = new Map(), overlay = new Set(), minOv = Math.max(3, Math.ceil(pdata.length * 0.25));
  if (pdata.length >= 3) {
    pdata.forEach(({pl}) => new Set(pl.filter(l => l.text.trim().length >= 1).map(okey)).forEach(k => orep.set(k, (orep.get(k) || 0) + 1)));
    pdata.forEach(({pl}) => { const hit = pl.filter(l => l.text.trim().length >= 1 && orep.get(okey(l)) >= minOv); if (hit.length >= 8) hit.forEach(l => overlay.add(l)); });
  }
  const rep = new Map();   // không đếm dòng của lớp chữ ẩn: chữ số lẻ / dòng nội dung lặp ở sát mép trang không phải số trang hay đầu/chân trang
  pdata.forEach(({pl, H}) => new Set(pl.filter(l => !overlay.has(l) && zone(l, H) && (hfText(l) || PAGENUM_RE.test(l.text.trim()))).map(l => keyOf(l, H))).forEach(k => rep.set(k, (rep.get(k) || 0) + 1)));
  const many = pdata.length >= 4, minTxt = Math.max(3, Math.ceil(pdata.length * 0.04)), minNum = Math.max(3, Math.ceil(pdata.length * 0.1));
  pdata.forEach(({p, pl, H, W}) => {
    pl.forEach(l => {
      const t = l.text.trim(), n = zone(l, H) ? (rep.get(keyOf(l, H)) || 0) : 0;
      l.skip = overlay.has(l) ? true : PAGENUM_RE.test(t) ? (many ? n >= (/^(?:Trang|Page)/i.test(t) ? minTxt : minNum) && (/^(?:Trang|Page)/i.test(t) || l.top > H * 0.92 || l.bot < H * 0.08) : (l.top > H * 0.94 || l.bot < H * 0.06))   // số trang trần phải nằm sát mép (8%): chữ số lẻ (mẫu số phân số) ở cao hơn không phải số trang
        : many ? (hfText(l) && n >= minTxt)   // nhiều trang: chỉ coi là đầu/chân trang khi lặp lại (nội dung đề có thể bắt đầu sát mép trang)
        : t.length <= 40 && (l.top > H * 0.96 || l.bot < H * 0.04) && !LAB_RE.test(t) && !/^[A-Da-d][.)]/.test(t);   // file ngắn không so được các trang với nhau: chỉ bỏ dòng ngắn sát mép, nhưng KHÔNG bao giờ bỏ nhãn “Câu N.” hay dòng phương án
    });
    // đầu/chân trang thật = dòng bị bỏ có chữ (≥ 3 ký tự) nằm sát mép trang; các dòng của lớp chữ ẩn ở giữa trang hoặc ký tự lẻ không được tính (kẻo đẩy lề cắt vào giữa trang)
    // dòng của lớp chữ ẩn chỉ tính là đầu/chân trang khi là dòng chữ dài nằm sát mép (5% trên/dưới trang): nội dung ẩn lặp ở các vị trí khác không được làm lề cắt nhích vào nội dung thật
    const hf = l => l.skip && (!overlay.has(l) || ((l.top > H * 0.95 || l.bot < H * 0.05) && hfText(l)));
    const real = pl.filter(l => !l.skip), hdr = pl.filter(l => hf(l) && l.top > H / 2), ftr = pl.filter(l => hf(l) && l.bot <= H / 2);
    pages[p] = {h: H, l: real.length ? Math.min(...real.map(l => l.l)) : 0, r: real.length ? Math.max(...real.map(l => l.r)) : W,
      ct: hdr.length ? Math.min(...hdr.map(l => l.bot)) : H * 0.97, cb: ftr.length ? Math.max(...ftr.map(l => l.top)) : H * 0.03};
    pl.forEach(l => lines.push({p: l.p, top: l.top, bot: l.bot, l: l.l, r: l.r, lab: l.lab, opt: l.skip ? undefined : l.opt, skip: l.skip, ov: overlay.has(l), raw: l.skip ? l.text : undefined, text: l.skip ? '' : l.text}));
    lines.push(null);   // ngắt trang
  });
  return {text: lines.map(l => l ? l.text : '').join('\n'), lines, pages, pdf, ocrPages};
}

// Đổi khoảng dòng [a,b) thành các đoạn cắt theo trang (toạ độ PDF, y tính từ dưới lên)
function regionSegs(rs, ext) {
  const L = ext.lines, out = [];
  rs.forEach(([a, b], ri) => {
    const has = i => L[i] && !L[i].skip && L[i].text.trim();   // dòng có chữ thật (bỏ dòng trống, đầu/chân trang)
    while (a < b && !has(a)) a++;
    let la = Math.min(b, L.length) - 1; while (la > a && !has(la)) la--;
    if (a >= b || !L[a] || !L[la]) return;
    let e = b; while (e < L.length && (!L[e] || L[e].skip)) e++;
    const end = e < L.length ? L[e] : null, first = L[a];
    // Đỉnh thật của cụm đầu câu tại dòng mốc i: các mảnh công thức (tử số phân số, dấu ngoặc nhọn của hệ) đứng ngay sau dòng nhãn trong văn bản
    // nhưng nằm cao hơn nó trên trang → nâng điểm mốc lên tới đỉnh các mảnh đó (dừng khi gặp phương án A./a) hoặc nhãn câu kế tiếp).
    const aTop = i => {
      const m = L[i]; let top = m.top;
      for (let k = i + 1; k < Math.min(L.length, i + 16); k++) {
        const o = L[k]; if (!o || o.p !== m.p) break;
        if (o.skip) continue;
        if (LAB_RE.test(o.text) || /^\s*[A-Da-d][.)]/.test(o.text)) break;
        if (o.top > top && o.top - m.top < 30) top = o.top;
      }
      return top;
    };
    // đáy thấp nhất của các dòng ngay trước dòng mốc i (cùng trang): đường cắt phía trên i không được vượt lên quá đáy các dòng đó,
    // nếu không ảnh sẽ lẫn dòng cuối của câu trước khi hai câu dính sát nhau (không có khe trắng)
    const prevBot = i => { let lo = null; for (let k = i - 1, n = 0; k >= 0 && n < 8; k--) { const o = L[k]; if (!o) break; if (o.skip || !o.text.trim()) continue; if (o.p !== L[i].p) break; if (o.bot < L[i].top - 1) continue; /* nằm thấp hơn dòng mốc = mảnh chữ lạc thứ tự, không phải câu trước */ lo = lo == null ? o.bot : Math.min(lo, o.bot); n++; } return lo; };
    // Trong một số file (xuất từ Word), công thức / phương án của câu bị tách thành các khối chữ rời nằm CUỐI luồng văn bản, không đứng sau dòng "Câu N." của nó.
    // Vì vậy vùng cắt chỉ dựa vào VỊ TRÍ THẬT trên trang: từ dòng nhãn của câu này đến dòng nhãn của câu kế tiếp (ảnh vẽ lại đủ mọi thứ nằm giữa hai nhãn).
    const lastP = end && end.p >= first.p ? end.p : L[la].p;
    for (let p = first.p; p <= lastP; p++) {
      const pg = ext.pages[p];
      const ft = p === first.p ? aTop(a) : 0, et = end && end.p === p ? aTop(e) : 0;
      const t = p === first.p ? ft + 2.5 : pg.ct;
      const bt = et ? et + 0.5 : pg.cb;
      if (t - bt < 6) continue;
      const sg = {p, t, b: bt};
      if (p === first.p) { sg.tA = ft; const pb = prevBot(a); if (pb != null) sg.tMin = Math.min(pb, ft); }   // dòng mốc đầu đoạn (nhãn "Câu N." hoặc dòng a) b)): cắt ảnh sẽ đi lên từ đây tới dải trắng
      // đáy thấp nhất / đỉnh cao nhất của các dòng thuộc câu trên trang này: đường cắt không được cắt vào các dòng đó
      const topLim = p === first.p ? ft + 2 : pg.ct, botLim = et ? end.top - 4 : -1e9;   // chỉ các dòng nằm trong dải giữa hai nhãn; mảnh chữ lạc ở xa bị bỏ qua
      let lo = 1e9, hi = -1e9; for (let i = a; i <= la; i++) if (has(i) && L[i].p === p && L[i].top <= topLim && L[i].bot >= botLim) { lo = Math.min(lo, L[i].bot); hi = Math.max(hi, L[i].top); }
      if (lo < 1e9) { sg.minBot = lo; sg.maxTop = hi; }
      if (et) sg.bA = et;   // dòng mốc kết thúc đoạn (đầu câu kế tiếp) — cùng giá trị với tA của câu đó nên hai ảnh chung một đường cắt
      if (ri === 0 && p === first.p && first.lab) sg.mask = {x1: first.lab + 1, t: first.top, b: first.bot};
      out.push(sg);
    }
  });
  return out;
}

// Đưa điểm cắt (hàng điểm ảnh y) về dải trắng ngang gần nhất để không cắt phải chữ / lẹm chữ câu bên cạnh
function snapRow(g, x0, x1, y, lim) {
  const W = 36, a = Math.max(0, Math.floor(y - W)), b = Math.min(lim, Math.ceil(y + W)), w = x1 - x0;
  if (b - a < 4 || w < 4) return y;
  const d = g.getImageData(x0, a, w, b - a).data, white = [];
  for (let r = 0; r < b - a; r++) {
    let ink = false;
    for (let c = 0, o = r * w * 4; c < w; c += 2, o += 8) if (d[o] < 235 || d[o + 1] < 235 || d[o + 2] < 235) { ink = true; break; }
    white.push(!ink);
  }
  const runs = []; let st = -1;
  white.forEach((wh, r) => { if (wh) { if (st < 0) st = r; } else if (st >= 0) { runs.push([st, r - 1]); st = -1; } });
  if (st >= 0) runs.push([st, white.length - 1]);
  let best = y, bd = 1e9;
  runs.filter(r => r[1] - r[0] >= 1).forEach(([s0, e0]) => {
    const A = a + s0, B = a + e0; let c, dist;
    if (y >= A && y <= B) { c = y; dist = 0; } else if (y < A) { c = Math.min(A + 2, B); dist = A - y; } else { c = Math.max(B - 2, A); dist = y - B; }
    if (dist < bd) { bd = dist; best = c; }
  });
  return best;
}

// Đường cắt giữa hai câu liền nhau: đi LÊN từ dòng mốc (nhãn "Câu N.") qua mọi nét mực nối liền — dấu ngoặc nhọn của hệ phương trình,
// tử số phân số, chỉ số trên đều cao hơn dòng nhãn — tới dải trắng đầu tiên. Câu trước (đáy) và câu sau (đỉnh) dùng chung đường này
// nên không câu nào bị mất đỉnh công thức và không lẫn công thức của câu kia. Không thấy dải trắng thì trả về y gần nguyên.
function edgeUp(g, x0, x1, y, lim) {
  const w = x1 - x0, CAP = 100, top = Math.max(0, Math.floor(y) - CAP), h = Math.min(lim, Math.ceil(y) + 2) - top;
  if (h < 6 || w < 8) return y;
  const d = g.getImageData(x0, top, w, h).data;
  const ink = r => { for (let c = 0, o = r * w * 4; c < w; c++, o += 4) if (d[o] < 235 || d[o + 1] < 235 || d[o + 2] < 235) return true; return false; };
  let r = Math.min(h - 1, Math.floor(y) - top - 1);
  while (r >= 1 && (ink(r) || ink(r - 1))) r--;   // đi lên khi còn mực (cần ≥ 2 hàng trắng liên tiếp mới coi là dải trắng)
  if (r < 1) return y - 2;
  let u = r; while (u > 0 && !ink(u - 1)) u--;   // mép trên của dải trắng
  return top + Math.max(u, r - 3);
}
// Vùng điểm ảnh cần cắt cho một đoạn (đoạn có dòng mốc thì dùng edgeUp, còn lại — đầu/cuối trang — dùng snapRow)
function segPixels(g0, pg, sg, SC, W, H) {
  const x0 = Math.max(0, Math.floor((pg.l - 6) * SC)), x1 = Math.min(W, Math.ceil((pg.r + 6) * SC));
  let y0 = Math.max(0, Math.floor((pg.h - sg.t) * SC)), y1 = Math.min(H, Math.ceil((pg.h - sg.b) * SC));
  if (x1 - x0 > 8) {
    y0 = Math.round(sg.tA != null ? edgeUp(g0, x0, x1, (pg.h - sg.tA) * SC, H) : snapRow(g0, x0, x1, y0, H));
    y1 = Math.round(sg.bA != null ? edgeUp(g0, x0, x1, (pg.h - sg.bA) * SC, H) : snapRow(g0, x0, x1, y1, H));
    // không cắt vào chính các dòng của câu: đáy ảnh phải thấp hơn đáy dòng cuối, đỉnh ảnh phải cao hơn đỉnh dòng đầu
    if (sg.minBot != null) y1 = Math.min(H, Math.max(y1, Math.ceil((pg.h - sg.minBot) * SC) + 1));
    if (sg.tMin != null) y0 = Math.max(y0, Math.min(y1 - 8, Math.floor((pg.h - sg.tMin) * SC)));   // đỉnh ảnh không vượt lên trên đáy dòng liền trước…
    if (sg.maxTop != null) y0 = Math.max(0, Math.min(y0, Math.floor((pg.h - sg.maxTop) * SC) - 1));   // …nhưng LUÔN giữ đủ các dòng của chính câu (ưu tiên hơn việc tránh vệt của câu trước)
  }
  return {x0, x1, y0, y1};
}

// Bỏ khoảng trắng thừa ở đáy ảnh cắt (câu / lời giải cuối cùng của file không có dòng kế tiếp nên vùng cắt kéo tới cuối trang);
// hình vẽ nằm dưới dòng chữ cuối vẫn được giữ vì có nét mực
function trimBottom(c) {
  const w = c.width, h = c.height; if (w < 4 || h < 24) return c;
  const d = c.getContext('2d').getImageData(0, 0, w, h).data;
  const dark = y => { let n = 0, t = 0; for (let x = 0, o = y * w * 4; x < w; x += 2, o += 8) { t++; if (d[o] < 225 || d[o + 1] < 225 || d[o + 2] < 225) n++; } return n / t; };
  const findLast = from => { for (let y = from; y >= 0; y--) if (dark(y) > 0) return y; return -1; };
  let last = findLast(h - 1);
  if (last >= 0 && dark(last) >= 0.85) {   // vạch kẻ ngang suốt bề rộng ở đáy (đường kẻ trang trí chân trang) tách khỏi nội dung bằng khoảng trắng → bỏ vạch, giữ nội dung
    let top = last, gap = 0;
    for (let y = last - 1; y >= 0 && last - y < 20; y--) { const f = dark(y); if (f >= 0.85) { top = y; gap = 0; } else if (f === 0 && gap < 3) gap++; else break; }
    let white = 0; for (let y = top - 1; y >= 0 && white < 4 && dark(y) === 0; y--) white++;
    if (white >= 4 && top > 8) last = findLast(top - 1);
  }
  const nh = Math.min(h, last + 10);
  if (last < 0 || nh >= h - 4) return c;
  const t = document.createElement('canvas'); t.width = w; t.height = nh;
  t.getContext('2d').drawImage(c, 0, 0); return t;
}
// Render từng trang PDF, cắt ảnh cho mỗi câu hỏi (q._rs → q.img) và lời giải chi tiết (q._ss → q.solImg), lưu lên máy chủ.
// Lời giải nằm trong file đáp án riêng (dòng ≥ kOff của văn bản đã ghép) được cắt từ kExt.
async function attachImages(ext, qs, onProg, kExt, kOff) {
  const SC = 2, jobs = [], parts = new Map();
  qs.forEach(q => {
    if (q._rs && ext) jobs.push({q, f: 'img', x: ext, segs: regionSegs(q._rs, ext)});
    if (q._ss) {
      const inK = kOff != null && q._ss[0][0] >= kOff, x = inK ? kExt : ext;   // file đáp án riêng là TXT → không có ảnh để cắt
      if (x) jobs.push({q, f: 'solImg', x, segs: regionSegs(inK ? q._ss.map(([a, b]) => [a - kOff, b - kOff]) : q._ss, x)});
    }
    delete q._rs; delete q._ss;
  });
  const srcs = [ext, kExt].filter((x, i, a) => x && a.indexOf(x) === i);
  const plan = srcs.map(x => {
    const byPage = new Map();
    jobs.forEach((j, ji) => { if (j.x === x) j.segs.forEach((sg, k) => { if (!byPage.has(sg.p)) byPage.set(sg.p, []); byPage.get(sg.p).push({ji, k}); }); });
    return {x, byPage};
  });
  const totalPages = plan.reduce((s, p) => s + p.byPage.size, 0); let donePages = 0;
  for (const {x, byPage} of plan) {
    for (const p of [...byPage.keys()].sort((a, b) => a - b)) {
      const page = await x.pdf.getPage(p), vp = page.getViewport({scale: SC}), pg = x.pages[p];
      const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      const g0 = cv.getContext('2d'); g0.fillStyle = '#fff'; g0.fillRect(0, 0, cv.width, cv.height);
      await page.render({canvasContext: g0, viewport: vp}).promise;
      byPage.get(p).forEach(({ji, k}) => {
        const sg = jobs[ji].segs[k];
        const {x0, x1, y0, y1} = segPixels(g0, pg, sg, SC, cv.width, cv.height);
        if (y1 - y0 < 8 || x1 - x0 < 8) return;
        const c2 = document.createElement('canvas'); c2.width = x1 - x0; c2.height = y1 - y0;
        const g = c2.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c2.width, c2.height);
        g.drawImage(cv, x0, y0, x1 - x0, y1 - y0, 0, 0, c2.width, c2.height);
        if (sg.mask) { g.fillStyle = '#fff'; g.fillRect(0, (pg.h - sg.mask.t) * SC - y0 - 2, sg.mask.x1 * SC - x0, (sg.mask.t - sg.mask.b) * SC + 4); }
        parts.set(ji + ':' + k, trimBottom(c2));
      });
      cv.width = cv.height = 0;
      onProg && onProg(++donePages, totalPages);
    }
  }
  let n = 0;
  for (let ji = 0; ji < jobs.length; ji++) {
    const j = jobs[ji], cs = j.segs.map((_, k) => parts.get(ji + ':' + k)).filter(Boolean);
    if (!cs.length) continue;
    const W = Math.max(...cs.map(c => c.width)), Ht = cs.reduce((s, c) => s + c.height, 0) + 4 * (cs.length - 1);
    const out = document.createElement('canvas'); out.width = W; out.height = Ht;
    const g = out.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, Ht);
    let y = 0; cs.forEach(c => { g.drawImage(c, 0, y); y += c.height + 4; });
    const url = out.toDataURL('image/jpeg', 0.78);
    j.q[j.f] = (await LB.api.post('/api/img', {data: url})).id;
    if (j.f === 'img') { delete j.q.warn; n++; }
  }
  return n;
}

/* ---- Import đề tự động: chọn khối → hệ thống tự cắt câu, đọc đáp án, phân dạng ----
   Trang không có lớp chữ (ảnh scan) được đọc bằng OCR Tesseract.js cài sẵn ở /vendor/tesseract (chạy ngay trên máy, không gửi đề ra ngoài). */
let OCRW = null, OCR_LOG = null;
async function getOcr() {
  if (OCRW) return OCRW;
  if (!window.Tesseract) await loadScript('/vendor/tesseract/tesseract.min.js');
  // createWorker có thể không bao giờ trả về nếu worker lỗi khi nạp → đặt giới hạn thời gian để báo lỗi thay vì treo
  const err = new Promise((_, no) => { const h = e => no(new Error('Không nạp được bộ nhận dạng chữ: ' + ((e.reason && e.reason.message) || e.message || 'lỗi không rõ'))); window.addEventListener('unhandledrejection', h, {once: true}); window.addEventListener('error', h, {once: true}); setTimeout(() => no(new Error('Nạp bộ nhận dạng chữ quá lâu')), 120000); });
  OCRW = await Promise.race([Tesseract.createWorker('vie', 1, {workerPath: '/vendor/tesseract/worker.min.js', corePath: '/vendor/tesseract/', langPath: '/vendor/tesseract/lang', gzip: true, logger: m => OCR_LOG && OCR_LOG(m)}), err]);
  return OCRW;
}
// sửa lỗi OCR thường gặp ở nhãn câu: "Cau l:" → "Câu 1."; "Ð" → "Đ"
const fixOcr = t => t.replace(/^\s*C[aâ]u\s*([0-9lIO]{1,3})\s*[.:,;)]\s*/i, (m, n) => `Câu ${n.replace(/[lI]/g, '1').replace(/O/g, '0')}. `).replace(/Ð/g, 'Đ');
async function ocrLines(w, cv, p, H, SC) {
  const {data} = await w.recognize(cv);
  return (data.lines || []).map(l => {
    const t = fixOcr((l.text || '').replace(/\s+/g, ' ').trim()); if (!t) return null;
    const o = {p, text: t, top: H - l.bbox.y0 / SC, bot: H - l.bbox.y1 / SC, l: l.bbox.x0 / SC, r: l.bbox.x1 / SC, items: []};
    const m = LAB_RE.exec(t);
    if (m) { let cur = ''; const need = m[0].replace(/\s/g, '').length; for (const wd of l.words || []) { cur += wd.text; if (cur.replace(/\s/g, '').length >= need) { o.lab = wd.bbox.x1 / SC; break; } } }
    return o;
  }).filter(Boolean);
}
async function imageAsPdf(file) {   // bọc 1 ảnh thành đối tượng giống PDF 1 trang (đơn vị = nửa điểm ảnh để render x2 giữ nguyên độ nét)
  const img = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('Không đọc được ảnh ' + file.name)); im.src = URL.createObjectURL(file); });
  const W = img.naturalWidth / 2, H = img.naturalHeight / 2;
  const page = {getViewport: ({scale}) => ({width: W * scale, height: H * scale}), getTextContent: async () => ({items: []}),
    render: ({canvasContext: g, viewport: v}) => ({promise: Promise.resolve().then(() => g.drawImage(img, 0, 0, v.width, v.height))})};
  return {numPages: 1, getPage: async () => page};
}
async function smartRead(f, log, seg) {
  const isImg = /\.(png|jpe?g)$/i.test(f.name) || /^image\//.test(f.type), isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
  if (!isPdf && !isImg) return {text: await f.text(), ext: null};
  const ocr = async (p, page, H) => {
    log(`   Trang ${p} không có lớp chữ (ảnh scan) — đang nhận dạng chữ bằng OCR, vui lòng đợi...`);
    const first = !OCRW; if (first) log('   Đang nạp bộ nhận dạng chữ tiếng Việt (lần đầu mất vài giây)...');
    const w = await getOcr(), SC = 2.2, vp = page.getViewport({scale: SC});
    const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    await page.render({canvasContext: g, viewport: vp}).promise;
    const out = await ocrLines(w, cv, p, H, SC); cv.width = cv.height = 0; return out;
  };
  const ext = await extractPdfText(f, (p, n) => seg(p / n), ocr, isImg ? await imageAsPdf(f) : null);
  return {text: ext.text, ext};
}
// Đoán chuyên đề từ nội dung câu (hiện có bộ từ khóa cho Toán 9; các môn/khối khác để trống để giáo viên gắn sau)
const TOPIC_KW = {'Toán|9': [
  ['Phương trình bậc hai & Định lý Viète', /viète|viet\b|tổng hai nghiệm|tích hai nghiệm|hai nghiệm phân biệt|phương trình bậc hai|\bx²|\bx2\b|biệt thức|\bnghiệm\b/i],
  ['Hệ hai phương trình bậc nhất hai ẩn', /hệ phương trình|hệ pt|giải hệ|phương trình bậc nhất hai ẩn|cặp số/i],
  ['Căn bậc hai & căn bậc ba', /\bcăn\b|căn bậc|điều kiện xác định|rút gọn biểu thức|trục căn|biểu thức chứa căn/i],
  ['Đường tròn & góc với đường tròn', /đường tròn|nội tiếp|ngoại tiếp|tiếp tuyến|dây cung|\bcung\b(?!\s+cấp)|lục giác đều|góc ở tâm|tiếp xúc|bán kính|\btâm\b/i],
  ['Hệ thức lượng trong tam giác vuông', /vuông tại|\bsin\b|\bcos\b|\btan\b|\bcot\b|hệ thức lượng|tỉ số lượng giác|góc nhọn|đường cao/i]]};
// Đoán theo từ khóa có tính điểm: chuyên đề nào khớp nhiều từ khóa nhất (hòa thì lấy chuyên đề đứng trước). Ký hiệu √ lẻ không đủ để kết luận “Căn bậc hai”.
const guessTopic = (s, g, q) => {
  const t = (q.q || '') + ' ' + (q.sts || []).join(' ') + ' ' + (q.opts || []).join(' '); let best = '', bs = 0;
  (TOPIC_KW[s + '|' + g] || []).forEach(([name, rx]) => { const n = (t.match(new RegExp(rx.source, 'gi')) || []).length; if (n > bs) { bs = n; best = name; } });
  return bs >= 2 ? best : '';   // chỉ 1 từ khóa khớp thì chưa đủ chắc → để trống cho giáo viên gắn
};
// Đoán chuyên đề bằng cách so với các câu ĐÃ có chuyên đề trong ngân hàng (cùng môn, khối): lấy chuyên đề của các câu giống nhất về từ ngữ (TF-IDF + cosine).
// Ngân hàng chưa đủ câu có chuyên đề thì trả về '' để dùng bộ từ khóa.
const topicTokens = q => ([q.q, ...(q.opts || []), ...(q.sts || [])].join(' ')).replace(/<[^>]*>/g, ' ').toLowerCase().match(/[a-zà-ỹ]{2,}|[√π∑∫]/g) || [];
function buildTopicIndex(labels, skipBatch) {
  const pool = (S.bank || []).filter(x => x.topic && x.batch !== skipBatch && (!x.subject || x.subject === labels.subject) && (!x.grade || x.grade === labels.grade));
  if (pool.length < 15 || new Set(pool.map(x => x.topic)).size < 2) return () => '';
  const df = new Map(), toks = pool.map(topicTokens);
  toks.forEach(t => new Set(t).forEach(w => df.set(w, (df.get(w) || 0) + 1)));
  const N = pool.length, idf = w => Math.log((N + 1) / ((df.get(w) || 0) + 1)) + 0.1;
  const vec = t => { const tf = new Map(); t.forEach(w => tf.set(w, (tf.get(w) || 0) + 1)); const v = new Map(); tf.forEach((c, w) => { if (df.has(w)) v.set(w, (1 + Math.log(c)) * idf(w)); }); return v; };
  const norm = v => Math.sqrt([...v.values()].reduce((a, x) => a + x * x, 0)) || 1;
  const inv = new Map(), dn = [];
  toks.forEach((t, i) => { const v = vec(t); dn[i] = norm(v); v.forEach((wt, w) => (inv.get(w) || inv.set(w, []).get(w)).push([i, wt])); });
  return q => {
    const v = vec(topicTokens(q)), qn = norm(v), sc = new Map();
    v.forEach((wq, w) => (inv.get(w) || []).forEach(([i, wd]) => sc.set(i, (sc.get(i) || 0) + wq * wd)));
    const top = [...sc].map(([i, d]) => [i, d / (qn * dn[i])]).sort((a, b) => b[1] - a[1]).slice(0, 7);
    if (!top.length || top[0][1] < 0.22) return '';
    const vote = new Map(); top.forEach(([i, c]) => vote.set(pool[i].topic, (vote.get(pool[i].topic) || 0) + c * c));
    const tot = [...vote.values()].reduce((a, b) => a + b, 0), [bt, bv] = [...vote].sort((a, b) => b[1] - a[1])[0];
    return bv / tot >= 0.45 ? bt : '';
  };
}
const KEY_NAME = /đ[aá]p\s*[aá]n|dap[\s_.-]*an|l[oờ]i\s*gi[aả]i|loi[\s_.-]*giai|huong[\s_.-]*dan|hdc|\bkey\b/i;

/* ---- Nhờ AI (Claude) giải đáp án cho các câu chưa có đáp án ----
   Ảnh/chữ của câu hỏi được máy chủ gửi tới dịch vụ AI; kết quả gắn nhãn q.aiAns = {c: mức tin cậy, n: ghi chú} cho tới khi giáo viên xác nhận hoặc tự sửa đáp án. */
let AI_ST = null;
async function aiStatus() { if (!AI_ST) { try { AI_ST = await LB.api.get('/api/ai/status'); } catch (e) { AI_ST = {ready: false}; } } return AI_ST; }
const aiOffMsg = st => st.configured && !st.sdk ? 'Máy chủ chưa cài thư viện AI cho Claude — quản trị viên chạy “pip install -r requirements.txt” rồi khởi động lại.' : 'AI chưa bật — quản trị viên cần đặt khóa GEMINI_API_KEY (miễn phí, lấy ở Google AI Studio) trên máy chủ.';
const IMG_ID = /^[a-f0-9]{16,40}$/, AI_CONF = {high: 'cao', medium: 'trung bình', low: 'thấp'};
const plainText = h => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const aiCandidates = qs => qs.filter(q => (q.t === 'mcq' || q.t === 'short' || (q.t === 'tf' && isTfg(q))) && !hasAns(q) && ((q.img && IMG_ID.test(q.img)) || plainText(q.q)));
// Giải từng câu một (số luồng song song do máy chủ quyết định: Gemini miễn phí 1, Claude 3). Ảnh phải đã lưu lên máy chủ (q.img là mã ảnh). Trả về {ok, fail, errors}
async function aiFill(qs, onProgress) {
  const todo = aiCandidates(qs), out = {ok: 0, fail: 0, errors: [], total: todo.length};
  let i = 0, done = 0, bad = 0;
  const item = q => q.img && IMG_ID.test(q.img) ? {id: q.id, t: q.t, img: q.img}
    : {id: q.id, t: q.t, text: [plainText(q.q), ...(q.opts || []).map((o, k) => 'ABCD'[k] + '. ' + plainText(o)), ...(q.sts || []).map((s, k) => 'abcd'[k] + ') ' + plainText(s))].join('\n')};
  const worker = async () => {
    while (i < todo.length && bad < 3) {
      const q = todo[i++];
      try {
        const x = (await LB.api.post('/api/ai/solve', {items: [item(q)]})).results[0];
        if (x && x.ok) { q.ans = x.ans; q.aiAns = {c: x.conf, n: x.note || ''}; out.ok++; bad = 0; }
        else { out.fail++; out.errors.push(`${(x && x.error) || 'AI không trả lời'}`); }
      } catch (e) { out.fail++; bad++; out.errors.push(e.message); }
      done++; onProgress && onProgress(done, todo.length);
    }
  };
  await Promise.all(Array.from({length: Math.max(1, (AI_ST && AI_ST.concurrency) || 1)}, worker));   // gói miễn phí giới hạn số yêu cầu mỗi phút → máy chủ báo số luồng phù hợp
  out.stopped = bad >= 3;
  return out;
}
const aiConsent = st => (st && st.free
  ? 'Gửi ảnh/nội dung các câu hỏi chưa có đáp án tới Google Gemini (gói MIỄN PHÍ) để giải?\n\nLưu ý: ở gói miễn phí, Google ghi rõ nội dung gửi lên có thể được dùng để cải thiện sản phẩm của Google. Chỉ gửi nội dung đề, không kèm thông tin học sinh — đừng gửi đề còn mật.'
  : 'Gửi ảnh/nội dung các câu hỏi chưa có đáp án tới dịch vụ AI (Claude của Anthropic) để giải?\n\nChỉ gửi nội dung đề, không kèm thông tin học sinh.')
  + '\n\nĐáp án AI có thể SAI — hãy xem lại (câu AI giải được đánh dấu 🤖 cho tới khi bạn xác nhận) trước khi giao cho học sinh.';

/* Phương án đúng được GẠCH CHÂN trong phần “hướng dẫn giải” (đề được in lại, chữ cái đáp án đúng có nét gạch dưới). Nét gạch là hình vẽ, không có trong lớp chữ
   nên dò bằng điểm ảnh: vẽ trang ra canvas rồi so mức “đậm” của dải ngay dưới chữ cái A. B. C. D.; chỉ nhận khi có đúng một phương án nổi bật rõ rệt. */
const UL_SC = 3;
function underlineScore(g, H, o) {   // tỉ lệ điểm tối lớn nhất trên một hàng điểm ảnh nằm ngay dưới chân chữ (0–1)
  const base = o.y != null ? o.y : o.bot + (o.top - o.bot) * 0.24, x0 = Math.max(0, Math.floor((o.x0 - 0.5) * UL_SC)), w = Math.max(4, Math.ceil((o.x1 - o.x0 + 1) * UL_SC));
  const yTop = Math.floor((H - (base - 0.6)) * UL_SC), yBot = Math.ceil((H - (base - 6)) * UL_SC), h = yBot - yTop + 1;
  if (h < 2 || w < 4) return 0;
  const d = g.getImageData(x0, yTop, w, h).data; let best = 0;
  for (let r = 0; r < h; r++) { let dark = 0; for (let c = 0; c < w; c++) { const i = (r * w + c) * 4; if (d[i] < 170 && d[i + 1] < 170 && d[i + 2] < 170) dark++; } best = Math.max(best, dark / w); }
  return best;
}
// Trả về số câu đã gán đáp án; dbg (mảng) nếu truyền vào sẽ nhận điểm từng phương án để hiệu chỉnh
async function detectUnderlined(ext, qs, kExt, kOff, dbg) {
  const todo = qs.filter(q => q.t === 'mcq' && q._os && q.ans == null), cands = [], byPage = new Map();
  qs.forEach(q => { if (!todo.includes(q)) delete q._os; });
  todo.forEach(q => {
    const [a, b] = q._os, inK = kOff != null && a >= kOff, x = inK ? kExt : ext, off = inK ? kOff : 0;
    delete q._os;
    if (!x || !x.pdf) return;
    const opts = [];
    for (let i = a - off; i < b - off && i < x.lines.length; i++) { const l = x.lines[i]; if (l && !l.skip && l.opt) l.opt.forEach(o => opts.push({...o, p: l.p, top: l.top, bot: l.bot})); }
    const pick = ['A', 'B', 'C', 'D'].map(c => opts.find(o => o.c === c));
    if (pick.some(o => !o)) return;   // không thấy đủ 4 chữ cái phương án → không dò
    cands.push({q, x, pick});
    const key = cands.length - 1;
    pick.forEach(o => { const k = (inK ? 'k' : 'e') + o.p; if (!byPage.has(k)) byPage.set(k, {x, p: o.p, list: []}); byPage.get(k).list.push({o, key}); });
  });
  for (const {x, p, list} of byPage.values()) {
    const page = await x.pdf.getPage(p), vp = page.getViewport({scale: UL_SC}), H = x.pages[p].h;
    const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    const g = cv.getContext('2d', {willReadFrequently: true}); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    await page.render({canvasContext: g, viewport: vp}).promise;
    list.forEach(({o, key}) => { (cands[key].sc || (cands[key].sc = {}))[o.c] = underlineScore(g, H, o); });
    cv.width = cv.height = 0;
  }
  let n = 0;
  cands.forEach(cd => {
    const sc = ['A', 'B', 'C', 'D'].map(c => (cd.sc || {})[c] || 0), order = sc.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    if (dbg) dbg.push(sc.map(v => Math.round(v * 100)));
    if (order[0][0] >= 0.6 && order[0][0] - order[1][0] >= 0.3) { cd.q.ans = order[0][1]; n++; }
  });
  return n;
}

async function importSmart(files, labels, withImg, onChange, examOpt, aiOn) {
  const m = modal(`<h2>⬆ Đang import đề mới</h2><div class="lb-prog"><span id="ip" style="width:0%"></span></div><div id="il" class="crawl-console" style="display:block;max-height:240px;overflow:auto"></div><div id="idone"></div>`, 1);
  const b = m.b, logBox = $('#il', b), bar = $('#ip', b);
  const log = (t, c = '') => { const d = document.createElement('div'); if (c) d.className = c; d.textContent = t; logBox.append(d); logBox.scrollTop = logBox.scrollHeight; };
  OCR_LOG = ev => { if (ev && /loading/.test(ev.status || '') && ev.progress != null && ev.progress < 1) bar.title = ev.status; };
  const keys = files.filter(f => KEY_NAME.test(f.name)), exams = keys.length === files.length ? files.slice() : files.filter(f => !keys.includes(f));
  let added = 0, noAns = 0, imgs = 0, ocrN = 0, sols = 0, merged = 0;
  const aiTot = {ok: 0, fail: 0};
  const batchId = 'i' + Date.now().toString(36), batchAt = Math.floor(Date.now() / 1000);   // mã lần import: để chỉ xử lý riêng các câu của lần này
  for (let fi = 0; fi < exams.length; fi++) {
    const f = exams[fi], seg = v => { bar.style.width = ((fi + v * 0.6) / exams.length * 100) + '%'; };
    try {
      log(`[${fi + 1}/${exams.length}] Đang đọc đề ${f.name}...`);
      const rd = await smartRead(f, log, seg); let text = rd.text, ext = rd.ext, kExt = null, kOff;
      if (rd.ext && rd.ext.ocrPages) ocrN += rd.ext.ocrPages;
      const kf = keys.length === exams.length && keys.length ? keys[fi] : (keys.length === 1 && exams.length === 1 ? keys[0] : null);
      if (kf && kf !== f) {
        log(`   Đang đọc file đáp án ${kf.name}...`); const kr = await smartRead(kf, log, () => {});
        kOff = text.split('\n').length + 1;   // dòng đầu của file đáp án trong văn bản ghép (sau dòng "ĐÁP ÁN")
        text += '\nĐÁP ÁN\n' + kr.text; kExt = kr.ext || null; if (kr.ext && kr.ext.ocrPages) ocrN += kr.ext.ocrPages;
      }
      else if (keys.length && !kf) log('⚠ Có nhiều file đề nhưng số file đáp án không khớp — bỏ qua file đáp án riêng, chỉ đọc đáp án nằm trong file đề.', 'warn');
      if (text.replace(/\s/g, '').length < 40) { log('✗ Không đọc được chữ trong file này (ảnh quá mờ hoặc file rỗng).', 'err'); continue; }
      PARSE_DEFAULT = labels.subject === 'Ngữ văn' ? 'essay' : 'short';
      const res = parseQuestionBank(text, f.name, !!((ext || kExt) && withImg));
      if (!res.questions.length) { log('✗ Không nhận diện được câu hỏi nào (cần dạng "Câu 1. ... A. ... B. ..." hoặc có nhãn Câu/Bài).', 'err'); continue; }
      const topicOf = buildTopicIndex(labels, batchId);
      res.questions.forEach(q => { Object.assign(q, labels); q.batch = batchId; q.at = batchAt; if (!q.topic) q.topic = topicOf(q) || guessTopic(labels.subject, labels.grade, q); });
      const eo = examOpt && examOpt.byName.get(f.name);
      if (eo) {   // đề thi: mỗi file là một đề — lưu kèm nhóm đề, tên đề, số đề, phần (I TN · II Đ/S · III TLN) và số câu trong phần
        const cnt = {};
        res.questions.forEach(q => { const part = {mcq: 'I', tf: 'II', short: 'III', essay: 'IV'}[q.t] || 'IV'; cnt[part] = (cnt[part] || 0) + 1; Object.assign(q, {examId: batchId + '-' + eo.no, examCat: examOpt.cat, examName: eo.name, examNo: eo.no, examPart: part, examIdx: cnt[part]}); });
        log(`   📑 Lưu thành “${examOpt.cat} · ${eo.name}” (Đề ${eo.no}): ${cnt.I || 0} TN · ${cnt.II || 0} Đ/S · ${cnt.III || 0} TLN.`, 'ok');
      }
      if (ext || kExt) {   // đáp án trắc nghiệm = phương án được gạch chân trong phần hướng dẫn giải (nếu đề trình bày kiểu đó)
        try { const nu = await detectUnderlined(ext, res.questions, kExt, kOff); if (nu) log(`   ✓ Đọc được ${nu} đáp án trắc nghiệm từ phương án được gạch chân trong phần hướng dẫn giải.`, 'ok'); }
        catch (e) { log('⚠ Không dò được phương án gạch chân (' + (e && e.message || e) + ')', 'warn'); res.questions.forEach(q => { delete q._os; }); }
      } else res.questions.forEach(q => { delete q._os; });
      const lvT = autoLevels(res.questions);
      log(`   🎯 Tự phân mức độ: ${lvT[1]} nhận biết · ${lvT[2]} thông hiểu · ${lvT[3]} vận dụng · ${lvT[4]} vận dụng cao (có thể chỉnh trong “Quản lý & sửa đáp án”).`, 'ok');
      let nImg = 0;
      if ((ext || kExt) && withImg) {
        log(`Đang cắt ảnh ${res.questions.length} câu hỏi và lời giải để giữ nguyên định dạng...`);
        try { nImg = await attachImages(ext, res.questions, (i, n) => { bar.style.width = ((fi + 0.6 + 0.4 * i / n) / exams.length * 100) + '%'; }, kExt, kOff); }
        catch (e) { log('⚠ Không cắt được ảnh (' + (e && e.message || e) + ') — dùng văn bản thuần.', 'warn'); res.questions.forEach(q => { delete q._rs; delete q._ss; }); }
      }
      const nSol = res.questions.filter(hasSol).length, nBad = res.questions.filter(q => !q.solImg && solGarbled(q)).length;
      if (nSol) log(`   📘 Đọc được lời giải chi tiết của ${nSol}/${res.questions.length} câu.`, 'ok');
      if (nBad) log(`   ⚠ ${nBad} câu có lời giải chứa công thức nhưng không cắt được ảnh — chữ đọc từ PDF bị vỡ nên sẽ không hiện cho học sinh.`, 'warn');
      const n = addToBank(res.questions), d = res.questions.length - n, kept = new Set((S.bank || []).map(x => x.id));
      if (SOL_MERGED) log(`   📘 Bổ sung lời giải cho ${SOL_MERGED} câu đã có sẵn trong ngân hàng.`, 'ok');
      dropImgs(res.questions.filter(q => !kept.has(q.id)));
      added += n; noAns += res.questions.filter(q => !hasAns(q)).length; imgs += nImg; sols += res.questions.filter(q => kept.has(q.id) && hasSol(q)).length; merged += SOL_MERGED;
      await flushBank();   // lưu ngay file này vào cơ sở dữ liệu, không chờ các file sau
      log(`💾 Đã lưu ${n} câu của file ${f.name} vào cơ sở dữ liệu.`, 'ok');
      if (aiOn) {   // nhờ AI giải các câu chưa đọc được đáp án (ảnh đã lên máy chủ sau flushBank)
        const need = aiCandidates(res.questions.filter(q => kept.has(q.id)));
        if (need.length) {
          log(`🤖 Đang nhờ AI giải ${need.length} câu chưa có đáp án (mỗi câu vài chục giây)...`);
          const r = await aiFill(need, (d, t) => { bar.title = `AI: ${d}/${t}`; });
          aiTot.ok += r.ok; aiTot.fail += r.fail;
          log(`🤖 AI giải được ${r.ok}/${r.total} câu${r.fail ? `, ${r.fail} câu không giải được (${[...new Set(r.errors)].slice(0, 2).join('; ')})` : ''}${r.stopped ? ' — đã dừng vì lỗi liên tiếp' : ''}.`, r.fail ? 'warn' : 'ok');
          noAns -= r.ok;
          await flushBank();
        }
      }
      log(`✓ ${f.name}: ${res.stats.total} câu — ${res.stats.mcq} trắc nghiệm · ${res.stats.tf} đúng/sai · ${res.stats.short} trả lời ngắn · ${res.stats.essay} tự luận; thêm mới ${n}${d ? `, bỏ ${d} câu trùng` : ''}${nImg ? `, đã cắt ảnh ${nImg} câu` : ''}`, 'ok');
    } catch (e) { log('✗ Lỗi: ' + (e && e.message || e), 'err'); }
  }
  bar.style.width = '100%'; onChange && onChange();
  $('#idone', b).innerHTML = `<p style="margin:10px 0 6px"><b>Đã thêm ${added} câu vào ngân hàng</b> (Khối ${esc(labels.grade)} · ${esc(labels.subject)}; tổng ${(S.bank || []).length} câu${imgs ? `, ${imgs} câu có ảnh cắt từ file` : ''}).</p>`
    + (merged ? `<div class="lb-note">📘 Đã <b>bổ sung lời giải chi tiết cho ${merged} câu đã có sẵn</b> trong ngân hàng (các câu này không bị thêm trùng).</div>` : '')
    + (added ? `<div class="lb-note">📘 <b>${sols}/${added}</b> câu có lời giải chi tiết đi kèm. ${sols < added ? 'Câu chưa có lời giải: thêm file lời giải (tên có chữ “lời giải” / “đáp án”) khi import, hoặc gõ lời giải trong “Xử lý câu vừa import” → 📘 Lời giải.' : 'Học sinh sẽ xem được lời giải này khi xem lại bài.'}</div>` : '')
    + (ocrN ? `<div class="lb-note">🔎 ${ocrN} trang là ảnh scan nên được nhận dạng bằng OCR — chữ có thể sai chút, nhưng ảnh câu hỏi vẫn giữ nguyên đề gốc. Hãy mở “Xem & sửa” kiểm tra nhanh đáp án.</div>` : '')
    + (aiTot.ok ? `<div class="lb-note" style="background:#eef2ff;border-color:#c7d2fe;color:#3730a3">🤖 <b>AI đã giải ${aiTot.ok} câu</b> (đáp án gắn nhãn 🤖). AI có thể sai — hãy mở “Xử lý câu vừa import”, lọc <b>“Đáp án AI chưa xác nhận”</b> và xem lại từng câu trước khi giao bài.</div>` : '')
    + (noAns ? `<div class="lb-note" style="background:#fff7ed;border-color:#fed7aa;color:#9a3412">⚠ ${noAns} câu chưa đọc được đáp án (file không có phần đáp án hoặc định dạng lạ). Dùng “✎ Nhập nhanh đáp án” hoặc chọn đáp án trong màn xem & sửa.</div>` : '')
    + `<div class="lb-row"><button class="btn btn-blue" id="ib-mg">🗂 Xử lý ${added} câu vừa import</button><a class="btn btn-outline" href="manage.html#practice">🎯 Mở cho học sinh luyện tập</a><button class="btn btn-outline" id="ib-cl">Đóng</button></div>`;
  $('#ib-cl', b).onclick = m.close;
  $('#ib-mg', b).onclick = () => { m.close(); openBankManager(onChange, added ? {batch: batchId} : undefined); };
}
function openSmartImport(onChange) {
  const sub = ($('#cfg-subject') || {}).value || 'Toán', gr = ($('#cfg-grade') || {}).value || '9';
  const sel = 'padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;width:100%;margin-top:3px';
  const m = modal(`<h2>⬆ Import đề mới</h2>
    <p style="font-size:12px;color:#475467;margin:0 0 10px">Chọn khối rồi tải file lên. Hệ thống <b>tự cắt từng câu, tự phân dạng</b> (trắc nghiệm · đúng/sai · trả lời ngắn · tự luận), <b>tự đọc đáp án và lời giải</b> trong file. Đọc được cả PDF scan (ảnh).</p>
    <div class="lb-row" style="gap:10px"><label style="flex:1;font-size:11px;color:#475467">KHỐI LỚP<select id="si-g" style="${sel}">${GRADES.map(g => `<option value="${g}" ${g === gr ? 'selected' : ''}>Khối ${g}</option>`).join('')}</select></label>
      <label style="flex:1;font-size:11px;color:#475467">MÔN<select id="si-s" style="${sel}">${SUBJECTS.map(s => `<option ${s === sub ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label></div>
    <label style="display:block;margin-top:10px;font-size:11px;color:#475467">CHUYÊN ĐỀ<input id="si-tp" list="si-tpl" placeholder="Chọn gợi ý hoặc tự nhập — để trống thì hệ thống tự đoán theo nội dung câu" style="${sel}"><datalist id="si-tpl"></datalist></label>
    <label style="display:flex;gap:8px;align-items:center;font-size:12px;margin:12px 0 4px;cursor:pointer"><input type="checkbox" id="si-exam"> <b>📑 Đây là các đề thi</b> <span style="color:#667085">(mỗi file là một đề — lưu riêng từng đề để giao nguyên đề; câu vẫn được xếp vào chuyên đề)</span></label>
    <div id="si-exbox" hidden style="border:1px solid #bfdbfe;background:#f8fbff;border-radius:10px;padding:10px;margin-bottom:6px">
      <label style="display:block;font-size:11px;color:#475467">NHÓM ĐỀ (chọn hoặc tự nhập)<input id="si-cat" list="si-catl" placeholder="VD: Đề giữa kì 1" style="${sel}"><datalist id="si-catl">${['Đề giữa kì 1', 'Đề cuối kì 1', 'Đề giữa kì 2', 'Đề cuối kì 2', 'Đề kiểm tra 15 phút', 'Đề kiểm tra 1 tiết', 'Đề thi vào 10', 'Đề ôn tập'].map(x => `<option value="${x}">`).join('')}</datalist></label>
      <div style="font-size:11px;color:#475467;margin:8px 0 4px">Số và tên từng đề (số đề dùng khi nhập đáp án dạng <b>De1.I.01.A</b>):</div><div id="si-exrows" style="font-size:12px;color:#94a3b8">Chọn file ở bên dưới để đặt tên từng đề.</div></div>
    <div id="si-drop" style="margin-top:12px;border:2px dashed #93c5fd;border-radius:12px;padding:22px;text-align:center;background:#f8fbff;cursor:pointer"><div style="font-size:30px">📄</div><b style="font-size:13px">Bấm để chọn file hoặc kéo thả vào đây</b><div style="font-size:11px;color:#667085;margin-top:4px">PDF, ảnh (PNG/JPG) hoặc TXT · chọn được nhiều file</div><div id="si-names" style="font-size:12px;color:#1e40af;margin-top:8px"></div></div>
    <input type="file" id="si-f" accept=".pdf,.txt,.png,.jpg,.jpeg,application/pdf,text/plain,image/png,image/jpeg" multiple hidden>
    <p style="font-size:11px;color:#667085;margin:8px 0">Đáp án và <b>lời giải chi tiết từng câu</b> có thể nằm ngay sau mỗi câu (“Lời giải: …”), ở <b>cuối file đề</b> (“HƯỚNG DẪN GIẢI · Câu 1. Chọn A. …”), hoặc trong <b>file lời giải riêng</b> tải lên cùng lúc (đặt tên có chữ “đáp án” hoặc “lời giải”).</p>
    <label style="display:flex;gap:8px;font-size:12px;margin:6px 0"><input type="checkbox" id="si-img" checked> Giữ nguyên định dạng: lưu ảnh cắt từng câu và lời giải (công thức, hình vẽ hiện đúng như đề gốc)</label>
    <label id="si-ai-row" hidden style="gap:8px;font-size:12px;margin:6px 0;padding:8px 10px;border:1px solid #c7d2fe;background:#eef2ff;border-radius:8px"><input type="checkbox" id="si-ai"> <span>🤖 <b>Nhờ AI giải đáp án</b> cho các câu chưa đọc được đáp án trong file (đề chụp ảnh, đề không có đáp án). Ảnh câu hỏi được gửi tới <b id="si-ai-prov">dịch vụ AI</b>; đáp án AI có thể sai nên được đánh dấu để bạn xem lại.</span></label>
    <div id="si-ai-off" hidden style="font-size:11px;color:#94a3b8;margin:4px 0">🤖 Giải đáp án bằng AI chưa bật — quản trị viên cần đặt khóa ANTHROPIC_API_KEY trên máy chủ.</div>
    <button class="btn btn-blue" id="si-go" disabled>Bắt đầu import</button>`);
  aiStatus().then(st => { const row = $('#si-ai-row', m.b); if (!row) return; if (st.ready) { row.hidden = false; row.style.display = 'flex'; $('#si-ai-prov', m.b).textContent = st.free ? 'Google Gemini (gói miễn phí — Google có thể dùng nội dung để cải thiện sản phẩm của họ)' : 'Claude (Anthropic)'; } else { const off = $('#si-ai-off', m.b); off.textContent = '🤖 ' + aiOffMsg(st); off.hidden = false; } });
  let files = [];
  const examFiles = () => { const keys = files.filter(f => KEY_NAME.test(f.name)); return keys.length === files.length ? files.slice() : files.filter(f => !keys.includes(f)); };
  const drawEx = () => {
    const on = $('#si-exam', m.b).checked; $('#si-exbox', m.b).hidden = !on; if (!on) return;
    const ef = examFiles();
    $('#si-exrows', m.b).innerHTML = ef.length ? ef.map((f, i) => `<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><input type="number" min="1" max="99" value="${i + 1}" data-exno="${i}" title="Số đề" style="width:56px;padding:6px;border:1px solid #cbd5e1;border-radius:6px"><input data-exnm="${i}" maxlength="60" value="${esc(f.name.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim().slice(0, 60))}" style="flex:1;padding:6px;border:1px solid #cbd5e1;border-radius:6px"></div>`).join('') : '<span style="color:#94a3b8">Chọn file ở bên dưới để đặt tên từng đề.</span>';
  };
  const set = fl => { files = [...fl].filter(f => /\.(pdf|txt|png|jpe?g)$/i.test(f.name) || /^(application\/pdf|text\/plain|image\/)/.test(f.type)); $('#si-names', m.b).innerHTML = files.map(f => '• ' + esc(f.name)).join('<br>'); $('#si-go', m.b).disabled = !files.length; drawEx(); };
  $('#si-exam', m.b).onchange = drawEx;
  const drop = $('#si-drop', m.b), inp = $('#si-f', m.b);
  drop.onclick = () => inp.click(); inp.onchange = () => set(inp.files);
  drop.ondragover = e => { e.preventDefault(); drop.style.background = '#e0f2fe'; }; drop.ondragleave = () => { drop.style.background = '#f8fbff'; };
  drop.ondrop = e => { e.preventDefault(); drop.style.background = '#f8fbff'; set(e.dataTransfer.files); };
  const fillTp = () => { $('#si-tpl', m.b).innerHTML = topicsFor($('#si-s', m.b).value, $('#si-g', m.b).value).map(t => `<option value="${esc(t)}">`).join(''); };
  $('#si-s', m.b).onchange = fillTp; $('#si-g', m.b).onchange = fillTp; fillTp();
  $('#si-go', m.b).onclick = () => { const labels = {subject: $('#si-s', m.b).value, grade: $('#si-g', m.b).value, topic: $('#si-tp', m.b).value.trim()}, wi = $('#si-img', m.b).checked;
    let examOpt = null;
    if ($('#si-exam', m.b).checked) {
      const cat = $('#si-cat', m.b).value.trim(), ef = examFiles(), byName = new Map(), used = new Set();
      if (!cat) return toast('Hãy nhập nhóm đề (ví dụ “Đề giữa kì 1”)');
      for (let i = 0; i < ef.length; i++) {
        const no = Math.max(1, Math.floor(+$(`[data-exno="${i}"]`, m.b).value) || 0), nm = $(`[data-exnm="${i}"]`, m.b).value.trim() || `Đề ${no}`;
        if (used.has(no)) return toast(`Hai đề cùng số ${no} — hãy đánh số khác nhau`);
        used.add(no); byName.set(ef[i].name, {no, name: nm});
      }
      examOpt = {cat, byName};
    }
    const aiOn = !!($('#si-ai', m.b) && $('#si-ai', m.b).checked && !$('#si-ai-row', m.b).hidden);
    if (aiOn && !confirm(aiConsent(AI_ST))) return;
    m.close(); importSmart(files, labels, wi, onChange, examOpt, aiOn); };
}

/* ---- Cắt câu hỏi thủ công từ PDF / ảnh (dùng được cả với PDF scan không có lớp chữ) ----
   Giáo viên kéo chuột chọn vùng từng câu trên trang → chọn dạng + đáp án + nhãn → lưu thành câu hỏi dạng ảnh. */
async function openCropTool(file, defaults, onChange) {
  const SC = 2;   // render ở độ phân giải gấp đôi để ảnh cắt nét
  const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  let pdf = null, nPages = 1, page = 1, cv = null, pieces = [], added = [], busy = false;
  const cropBatch = 'i' + Date.now().toString(36), cropAt = Math.floor(Date.now() / 1000);
  const loading = modal('<h2>✂ Cắt câu hỏi từ file</h2><p>Đang mở file...</p>', 1);
  try {
    if (isPdf) { const lib = await getPdfLib(); pdf = await lib.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise; nPages = pdf.numPages; }
  } catch (e) { loading.close(); return toast('Không mở được PDF: ' + (e && e.message || e)); }
  const imgBmp = isPdf ? null : await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('Không đọc được ảnh')); im.src = URL.createObjectURL(file); }).catch(e => { toast(e.message); return null; });
  if (!isPdf && !imgBmp) { loading.close(); return; }
  const b = loading.b;
  const sel = 'padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px';
  b.innerHTML = `<h2 style="margin:0 0 6px">✂ Cắt câu hỏi · ${esc(file.name)}</h2>
    <div class="lb-note" style="margin-bottom:8px"><b>Cách dùng:</b> kéo chuột (hoặc ngón tay) quanh một câu hỏi trên trang để chọn vùng — câu dài qua trang thì chọn thêm vùng ở trang kế. Chọn dạng câu và đáp án bên phải, rồi bấm <b>Thêm câu vào ngân hàng</b>.</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">
      <div style="flex:2;min-width:300px">
        <div class="lb-row" style="margin-bottom:6px;align-items:center"><button class="btn btn-outline sm" id="cp-prev">← Trang trước</button><span id="cp-pg" style="font-size:12px"></span><button class="btn btn-outline sm" id="cp-next">Trang sau →</button></div>
        <div id="cp-wrap" style="max-height:68vh;overflow:auto;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc"><div id="cp-box" style="position:relative;touch-action:none;cursor:crosshair;line-height:0"></div></div></div>
      <div style="flex:1;min-width:260px">
        <div style="font-size:12px;font-weight:700;margin-bottom:4px">Vùng đã chọn cho câu này (<span id="cp-n">0</span>)</div>
        <div id="cp-pieces" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;min-height:24px"></div>
        <label style="font-size:11px;color:#475467">Dạng câu<select id="cp-t" style="${sel};width:100%;margin-top:2px"><option value="mcq">Trắc nghiệm (A–D)</option><option value="tf">Đúng/Sai (4 ý a–d)</option><option value="short">Trả lời ngắn</option><option value="essay">Tự luận</option></select></label>
        <div id="cp-ans" style="margin:8px 0"></div>
        <div style="font-size:11px;color:#475467;margin-bottom:2px">Nhãn của câu</div>${labelForm(defaults, 'cp-lf', true)}
        <label style="font-size:11px;color:#475467;display:block;margin-top:8px">Lời giải (không bắt buộc)<textarea id="cp-sol" rows="2" style="${sel};width:100%;margin-top:2px;font:inherit"></textarea></label>
        <div class="lb-row" style="margin-top:10px"><button class="btn btn-blue" id="cp-add">＋ Thêm câu vào ngân hàng</button><button class="btn btn-outline" id="cp-clear">Bỏ vùng chọn</button></div>
        <div id="cp-log" style="font-size:12px;margin-top:10px;color:#166534"></div>
        <div class="lb-row" style="margin-top:8px"><button class="btn btn-outline sm" id="cp-undo" disabled>↶ Hoàn tác câu vừa thêm</button><button class="btn btn-outline sm" id="cp-done">Xong</button></div></div></div>`;
  const box = $('#cp-box', b), lf = $('#cp-lf', b); bindLabelForm(lf);
  const ansUI = () => {
    const t = $('#cp-t', b).value, a = $('#cp-ans', b);
    a.innerHTML = t === 'mcq' ? `<div style="font-size:11px;color:#475467;margin-bottom:3px">Đáp án đúng</div><div class="lb-row">${'ABCD'.split('').map((l, i) => `<label style="font-size:13px"><input type="radio" name="cp-mc" value="${i}"> <b>${l}</b></label>`).join('')}</div>`
      : t === 'tf' ? `<div style="font-size:11px;color:#475467;margin-bottom:3px">Đáp án từng ý</div><div class="lb-row">${[0, 1, 2, 3].map(i => `<label style="font-size:12px"><b>${'abcd'[i]})</b> <select data-k="${i}" style="${sel}"><option value="-1">?</option><option value="0">Đúng</option><option value="1">Sai</option></select></label>`).join('')}</div>`
      : t === 'short' ? `<label style="font-size:11px;color:#475467">Đáp án (số hoặc chữ ngắn)<input id="cp-sv" style="${sel};width:100%;margin-top:2px" placeholder="ví dụ 22,5"></label>`
      : '<div style="font-size:11px;color:#667085">Tự luận do giáo viên chấm, không cần đáp án.</div>';
  };
  $('#cp-t', b).onchange = ansUI; ansUI();
  const drawPieces = () => {
    $('#cp-n', b).textContent = pieces.length;
    $('#cp-pieces', b).innerHTML = pieces.length ? pieces.map((p, i) => `<span style="font-size:11px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:2px 8px">Tr.${p.page} <a href="#" data-x="${i}" style="color:#b91c1c;text-decoration:none" title="Bỏ vùng này">✕</a></span>`).join('') : '<span style="font-size:11px;color:#98a2b3">Chưa chọn vùng nào — hãy kéo chuột trên trang.</span>';
    $$('[data-x]', b).forEach(a => a.onclick = e => { e.preventDefault(); pieces.splice(+a.dataset.x, 1); drawPieces(); drawBoxes(); });
  };
  const drawBoxes = () => {
    $$('.cp-sel', box).forEach(x => x.remove());
    pieces.forEach((p, i) => { if (p.page !== page) return; const d = document.createElement('div'); d.className = 'cp-sel';
      d.style.cssText = `position:absolute;left:${p.fx * 100}%;top:${p.fy * 100}%;width:${p.fw * 100}%;height:${p.fh * 100}%;border:2px solid #2563eb;background:rgba(37,99,235,.12);pointer-events:none;line-height:1;font:700 11px sans-serif;color:#1d4ed8`;
      d.textContent = ' ' + (i + 1); box.append(d); });
  };
  const show = async n => {
    if (busy) return; busy = true; page = n;
    $('#cp-pg', b).textContent = `Trang ${page}/${nPages}`; $('#cp-prev', b).disabled = page <= 1; $('#cp-next', b).disabled = page >= nPages;
    box.innerHTML = '<div style="padding:30px;font-size:12px;color:#667085;line-height:1.4">Đang vẽ trang...</div>';
    try {
      const c = document.createElement('canvas');
      if (pdf) { const pg = await pdf.getPage(page), vp = pg.getViewport({scale: SC}); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); await pg.render({canvasContext: g, viewport: vp}).promise; }
      else { c.width = imgBmp.naturalWidth; c.height = imgBmp.naturalHeight; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(imgBmp, 0, 0); }
      cv = c; c.style.cssText = 'width:100%;display:block;user-select:none;pointer-events:none'; box.innerHTML = ''; box.append(c); drawBoxes();
    } catch (e) { box.innerHTML = '<div style="padding:30px;color:#b91c1c">Không vẽ được trang: ' + esc(e && e.message || e) + '</div>'; }
    busy = false;
  };
  $('#cp-prev', b).onclick = () => show(page - 1); $('#cp-next', b).onclick = () => show(page + 1);
  // kéo chọn vùng
  let drag = null;
  box.onpointerdown = e => { if (!cv || e.button > 0) return; const r = box.getBoundingClientRect(); drag = {x: e.clientX - r.left, y: e.clientY - r.top, el: document.createElement('div')};
    drag.el.style.cssText = 'position:absolute;border:2px dashed #dc2626;background:rgba(220,38,38,.1);pointer-events:none'; box.append(drag.el); box.setPointerCapture(e.pointerId); };
  box.onpointermove = e => { if (!drag) return; const r = box.getBoundingClientRect(), x = Math.max(0, Math.min(r.width, e.clientX - r.left)), y = Math.max(0, Math.min(r.height, e.clientY - r.top));
    Object.assign(drag.el.style, {left: Math.min(x, drag.x) + 'px', top: Math.min(y, drag.y) + 'px', width: Math.abs(x - drag.x) + 'px', height: Math.abs(y - drag.y) + 'px'}); };
  box.onpointerup = e => { if (!drag) return; const r = box.getBoundingClientRect(), x = Math.max(0, Math.min(r.width, e.clientX - r.left)), y = Math.max(0, Math.min(r.height, e.clientY - r.top));
    drag.el.remove(); const x0 = Math.min(x, drag.x), y0 = Math.min(y, drag.y), w = Math.abs(x - drag.x), h = Math.abs(y - drag.y); drag = null;
    if (w < 14 || h < 10) return;   // bấm nhầm
    const k = cv.width / r.width, c2 = document.createElement('canvas'); c2.width = Math.round(w * k); c2.height = Math.round(h * k);
    const g = c2.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c2.width, c2.height); g.drawImage(cv, Math.round(x0 * k), Math.round(y0 * k), c2.width, c2.height, 0, 0, c2.width, c2.height);
    pieces.push({page, fx: x0 / r.width, fy: y0 / r.height, fw: w / r.width, fh: h / r.height, canvas: c2}); drawPieces(); drawBoxes(); };
  $('#cp-clear', b).onclick = () => { pieces = []; drawPieces(); drawBoxes(); };
  const logAdded = () => { const c = t => added.filter(x => x.t === t).length; $('#cp-log', b).textContent = added.length ? `Đã thêm ${added.length} câu: ${c('mcq')} TN · ${c('tf')} Đ/S · ${c('short')} TLN · ${c('essay')} TL` : ''; $('#cp-undo', b).disabled = !added.length; };
  $('#cp-add', b).onclick = async () => {
    if (!pieces.length) return toast('Hãy kéo chuột chọn vùng của câu hỏi trên trang');
    const t = $('#cp-t', b).value; let ans = null;
    if (t === 'mcq') { const r = b.querySelector('input[name=cp-mc]:checked'); ans = r ? +r.value : null; }
    else if (t === 'tf') { const v = $$('select[data-k]', b).map(s => +s.value); ans = v.every(x => x >= 0) ? v : null; }
    else if (t === 'short') { const v = ($('#cp-sv', b).value || '').trim(); ans = v || null; }
    const W = Math.max(...pieces.map(p => p.canvas.width)), H = pieces.reduce((s, p) => s + p.canvas.height, 0) + 6 * (pieces.length - 1);
    const out = document.createElement('canvas'); out.width = W; out.height = H; const g = out.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    let y = 0; pieces.forEach(p => { g.drawImage(p.canvas, 0, y); y += p.canvas.height + 6; });
    const btn = $('#cp-add', b); btn.disabled = true;
    try {
      const imgId = (await LB.api.post('/api/img', {data: out.toDataURL('image/jpeg', 0.85)})).id;
      const id = 'b' + Date.now().toString(36) + (BID++), sol = ($('#cp-sol', b).value || '').trim();
      const q = {id, src: file.name, lv: 2, batch: cropBatch, at: cropAt, ...readLabelForm(lf), t, img: imgId, q: `Câu hỏi dạng ảnh (${file.name} · #${id.slice(-4)})`, ...(sol ? {sol: esc(sol)} : {})};
      if (t === 'mcq') { q.opts = ['A', 'B', 'C', 'D']; q.ans = ans; }
      else if (t === 'tf') { q.sts = ['Ý a', 'Ý b', 'Ý c', 'Ý d']; q.ans = ans || [null, null, null, null]; }
      else if (t === 'short') q.ans = ans;
      S.bank = S.bank || []; S.bank.push(q); save(); added.push(q);
      pieces = []; drawPieces(); drawBoxes(); logAdded();
      b.querySelectorAll('input[name=cp-mc]').forEach(r => { r.checked = false; }); $$('select[data-k]', b).forEach(s => { s.value = '-1'; }); if ($('#cp-sv', b)) $('#cp-sv', b).value = ''; $('#cp-sol', b).value = '';
      if (t !== 'essay' && ans == null) toast('Đã thêm — câu này chưa có đáp án, hãy nhập sau ở “Quản lý & sửa đáp án”');
    } catch (e) { toast('Không lưu được ảnh: ' + (e && e.message || e)); }
    btn.disabled = false;
  };
  $('#cp-undo', b).onclick = () => { const q = added.pop(); if (!q) return; S.bank = S.bank.filter(x => x.id !== q.id); save(); dropImgs([q]); logAdded(); };
  $('#cp-done', b).onclick = async () => { loading.close(); onChange && onChange(); if (added.length) { await flushBank(); toast(`Đã thêm và lưu ${added.length} câu vào ngân hàng`); openBankManager(onChange, {batch: cropBatch}); } };
  drawPieces(); await show(1);
}

/* ---- Nhãn Môn · Khối · Chuyên đề cho câu hỏi trong ngân hàng ---- */
const SUBJECTS = ['Toán'];
const GRADES = ['6', '7', '8', '9', '10', '11', '12'];
const topicsFor = (s, g) => (TOPICS_CATALOG[s] && TOPICS_CATALOG[s][g]) || [];
// Câu khớp môn/khối đang chọn (câu chưa gắn nhãn cũ vẫn được dùng); nếu chọn chuyên đề thì chỉ lấy các chuyên đề đó (chọn được nhiều)
const bankPool = c => (S.bank || []).filter(q => (!q.subject || q.subject === c.subject) && (!q.grade || q.grade === c.grade) && (!c.bankTopics || !c.bankTopics.length || c.bankTopics.includes(q.topic || '')));
const TOPIC_NONE = '— Không gắn chuyên đề —', TOPIC_CUSTOM = '➕ Khác (nhập tay)';
function labelForm(v, id, compact) {
  const tps = topicsFor(v.subject, v.grade), list = (!v.topic || tps.includes(v.topic)) ? tps : [v.topic, ...tps];
  const sel = 'padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px;width:100%;margin-top:2px';
  return `<div class="lbl-form" id="${id}" style="${compact ? 'display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end' : 'display:grid;grid-template-columns:1fr 1fr;gap:8px'}">
    <label style="font-size:10px;color:#475467;${compact ? 'flex:1;min-width:110px' : ''}">Môn<select data-l="subject" style="${sel}">${SUBJECTS.map(s => `<option ${s === v.subject ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
    <label style="font-size:10px;color:#475467;${compact ? 'width:90px' : ''}">Khối<select data-l="grade" style="${sel}">${GRADES.map(g => `<option value="${g}" ${g === v.grade ? 'selected' : ''}>Khối ${g}</option>`).join('')}</select></label>
    <label style="font-size:10px;color:#475467;${compact ? 'flex:2;min-width:160px' : 'grid-column:1/3'}">Chuyên đề<input data-l="topicinput" list="${id}-tpl" value="${esc(v.topic || '')}" placeholder="Chọn hoặc nhập chuyên đề" style="${sel}">
      <datalist id="${id}-tpl">${list.map(t => `<option value="${esc(t)}">`).join('')}</datalist></label></div>`;
}
const lblEl = (root, k) => root.querySelector(`[data-l="${k}"]`);
function readLabelForm(root) {
  let topic = lblEl(root, 'topicinput').value.trim();
  return {subject: lblEl(root, 'subject').value, grade: lblEl(root, 'grade').value, topic};
}
function bindLabelForm(root) {
  if (!root) return;
  const refill = () => {
    const tps = topicsFor(lblEl(root, 'subject').value, lblEl(root, 'grade').value);
    const dl = root.querySelector('datalist');
    if (dl) dl.innerHTML = tps.map(t => `<option value="${esc(t)}">`).join('');
  };
  lblEl(root, 'subject').onchange = refill; lblEl(root, 'grade').onchange = refill;
}
const labelTxt = q => [q.subject, q.grade ? 'Khối ' + q.grade : '', q.topic].filter(Boolean).join(' · ') || 'Chưa gắn nhãn';
function askLabels(files, defaults, onChange) {
  const m = modal(`<h2>🏷 Gắn nhãn cho ${files.length} file</h2>
    <p style="font-size:11px;color:#475467;margin:4px 0">${files.map(f => esc(f.name)).join(', ')}</p>
    <p style="font-size:11px;color:#64748b;margin:6px 0 10px">Toàn bộ câu hỏi trong các file này sẽ được gắn Môn · Khối · Chuyên đề dưới đây. Bạn có thể sửa nhãn từng câu hoặc hàng loạt sau trong “Quản lý & sửa đáp án”.</p>
    ${labelForm(defaults, 'lf-imp')}
    <div class="lb-row" style="margin-top:14px"><button class="btn btn-blue" id="lf-go">Bắt đầu import</button><button class="btn btn-outline" id="lf-cancel">Hủy</button></div>`);
  const root = $('#lf-imp', m.b); bindLabelForm(root);
  $('#lf-cancel', m.b).onclick = m.close;
  $('#lf-go', m.b).onclick = () => { const lab = readLabelForm(root); m.close(); importBankFiles(files, lab, onChange); };
}

async function importBankFiles(files, labels, onChange) {
  const withImg = !$('#cfg-img') || $('#cfg-img').checked;
  const m = modal(`<h2>📄 Import ngân hàng câu hỏi</h2><div class="lb-prog"><span id="ip" style="width:0%"></span></div><div id="il" class="crawl-console" style="display:block;max-height:220px;overflow:auto"></div><div id="idone"></div>`, 1);
  const b = m.b, logBox = $('#il', b), bar = $('#ip', b);
  const log = (t, c = '') => { const d = document.createElement('div'); if (c) d.className = c; d.textContent = t; logBox.append(d); logBox.scrollTop = logBox.scrollHeight; };
  let added = 0, noAns = 0, imgs = 0, warn = 0;
  for (let fi = 0; fi < files.length; fi++) {
    const f = files[fi], seg = v => { bar.style.width = ((fi + v) / files.length * 100) + '%'; };
    log(`[${fi + 1}/${files.length}] Đang đọc ${f.name}...`);
    try {
      const isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
      let text, ext = null;
      if (isPdf) { ext = await extractPdfText(f, (p, n) => seg(p / n * 0.5)); text = ext.text; } else text = await f.text();
      if (text.replace(/\s/g, '').length < 40) { log('✗ Không đọc được chữ — có thể là PDF dạng ảnh scan (cần OCR) hoặc file rỗng.', 'err'); continue; }
      const res = parseQuestionBank(text, f.name, !!(ext && withImg));
      if (!res.questions.length) { log('✗ Không nhận diện được câu hỏi nào (cần dạng "Câu 1. ... A. ... B. ...").', 'err'); continue; }
      res.questions.forEach(q => Object.assign(q, labels));
      let nImg = 0;
      if (ext && withImg) {
        log(`Đang cắt ảnh ${res.questions.length} câu hỏi từ PDF...`);
        try { nImg = await attachImages(ext, res.questions, (i, n) => seg(0.5 + i / n * 0.5)); }
        catch (e) { log('⚠ Không cắt được ảnh (' + (e && e.message || e) + ') — dùng văn bản thuần.', 'warn'); res.questions.forEach(q => { delete q._rs; delete q._ss; }); }
      }
      const before = new Set((S.bank || []).map(x => x.id)), n = addToBank(res.questions), d = res.questions.length - n;
      const kept = new Set((S.bank || []).map(x => x.id));
      dropImgs(res.questions.filter(q => !kept.has(q.id)));   // dọn ảnh của câu trùng
      added += n; noAns += res.questions.filter(q => !hasAns(q)).length; imgs += nImg; warn += res.questions.filter(q => q.warn).length;
      log(`✓ ${f.name}: nhận diện ${res.stats.total} câu (${res.stats.mcq} TN · ${res.stats.tf} Đ/S · ${res.stats.short} TLN · ${res.stats.essay} TL), thêm mới ${n}${d ? `, bỏ ${d} câu trùng` : ''}${nImg ? `, đã cắt ảnh ${nImg} câu` : ''}.`, 'ok');
    } catch (e) { log('✗ Lỗi: ' + (e && e.message || e), 'err'); }
    seg(1);
  }
  onChange && onChange();
  $('#idone', b).innerHTML = `<p style="margin:10px 0 6px"><b>Đã thêm ${added} câu vào ngân hàng</b> (tổng ${(S.bank || []).length} câu${imgs ? `, ${imgs} câu có ảnh cắt từ PDF` : ''}).</p>`
    + (noAns ? `<div class="lb-note">⚠ ${noAns} câu chưa nhận diện được đáp án (file không có bảng đáp án hoặc có định dạng lạ). Hãy mở “Quản lý ngân hàng” để chọn đáp án đúng — nếu không, hệ thống chỉ dùng các câu này khi thiếu câu có đáp án và sẽ không chấm tự động.</div>` : '')
    + (imgs ? `<div class="lb-note">Câu có ảnh sẽ hiện đúng công thức/hình vẽ như đề gốc. Phương án trắc nghiệm nằm trong ảnh nên giữ nguyên thứ tự A-B-C-D (không đảo phương án).</div>` : '')
    + (warn ? `<div class="lb-note">⚠ ${warn} câu có công thức nhưng không có ảnh — chữ có thể bị lỗi, hãy kiểm tra trong màn hình quản lý.</div>` : '')
    + `<div class="lb-row"><button class="btn btn-blue" id="ib-mg">🗂 Xem & sửa ngân hàng</button><button class="btn btn-outline" id="ib-cl">Đóng</button></div>`;
  $('#ib-cl', b).onclick = m.close;
  $('#ib-mg', b).onclick = () => { m.close(); openBankManager(onChange); };
}

// Đọc chuỗi đáp án nhập nhanh → Map(số thứ tự → đáp án). Mục sai định dạng được trả về trong bad.
//   tf:    1ĐĐSS;2SĐĐS;3SSSS      mcq:   1A;2B;3C   (hoặc 1A 2B 3C)      short: 1.0,4;2.123;3.-5
// Hộp thoại phụ: khác modal(), không đóng các hộp thoại đang mở (dùng trong cửa sổ Quản lý ngân hàng để không mất thay đổi chưa lưu)
function subModal(html) {
  const o = document.createElement('div'); o.className = 'lb-overlay'; o.dataset.locked = '1'; o.style.zIndex = '1200';
  o.innerHTML = `<div class="lb-modal"><div class="lb-body">${html}</div></div>`; document.body.append(o);
  return {b: o.querySelector('.lb-body'), close: () => o.remove()};
}
/* Nhập đáp án nhiều đề cùng lúc: "De1.I.01.A;De1.II.01.ĐĐSS;De1.III.01.0,5" = đề 1 · phần I (TN) câu 1 = A · phần II (Đ/S) câu 1 = Đ Đ S S · phần III (TLN) câu 1 = 0,5.
   pool = các câu đang lọc; "De1" là đề có examNo = 1; số câu tính theo thứ tự trong đề, trong từng phần. */
function applyExamKey(raw, pool) {
  const exams = new Map(), PART = {I: 'mcq', II: 'tf', III: 'short'}, res = {ok: 0, over: 0, bad: [], touched: []};
  pool.forEach(q => { const s = exams.get(q.examNo) || exams.set(q.examNo, new Set()).get(q.examNo); s.add(q.examId); });
  String(raw || '').split(/[;\n]+/).map(s => s.trim()).filter(Boolean).forEach(it => {
    const m = /^(?:de|đề)\s*(\d+)\s*[.:\-\/]\s*(III|II|I)\s*[.:\-\/]\s*(\d+)\s*[.:\-\/=]\s*(.+)$/i.exec(it);
    if (!m) return res.bad.push(`${it} — sai định dạng`);
    const no = +m[1], part = m[2].toUpperCase(), idx = +m[3], val = m[4].trim(), ids = exams.get(no);
    if (!ids) return res.bad.push(`${it} — không có đề số ${no}`);
    if (ids.size > 1) return res.bad.push(`${it} — có nhiều đề cùng số ${no}, hãy lọc theo Nguồn trước`);
    const id = [...ids][0], qs = pool.filter(x => x.examId === id && x.t === PART[part]), q = qs[idx - 1];
    if (!q) return res.bad.push(`${it} — đề ${no} phần ${part} chỉ có ${qs.length} câu`);
    let ans;
    if (part === 'I') { const L = val.toUpperCase().replace(/\s+/g, ''); if (!/^[A-D]$/.test(L)) return res.bad.push(`${it} — đáp án trắc nghiệm phải là A, B, C hoặc D`); ans = 'ABCD'.indexOf(L); }
    else if (part === 'II') {
      const cs = val.toUpperCase().replace(/ĐÚNG/g, 'Đ').replace(/SAI/g, 'S').replace(/D/g, 'Đ').replace(/[^ĐS]/g, '').split('').map(c => c === 'Đ' ? 0 : 1), need = isTfg(q) ? 4 : 1;
      if (cs.length !== need) return res.bad.push(`${it} — cần ${need} ý Đ/S`);
      ans = need === 1 ? cs[0] : cs;
    } else { ans = val.replace(/\s+/g, '').replace(/^(-?\d+)\.(\d+)$/, '$1,$2'); if (!ans) return res.bad.push(`${it} — thiếu đáp án`); }
    if (hasAns(q)) res.over++;
    q.ans = ans; res.ok++; res.touched.push(q);
  });
  return res;
}

function parseQuickKey(kind, raw) {
  const map = new Map(), bad = [];
  if (kind === 'short') {
    raw.split(/[;\n]+/).map(s => s.trim()).filter(Boolean).forEach(it => {
      const m = /^(\d+)\s*[.:)=]\s*(.+)$/.exec(it);
      if (!m) return bad.push(it);
      map.set(+m[1], m[2].trim());
    });
    return {map, bad};
  }
  const txt = raw.toUpperCase().replace(/ĐÚNG/g, 'Đ').replace(/SAI/g, 'S');
  if (kind === 'mcq') {
    for (const m of txt.matchAll(/(\d+)\s*[.:)\-]?\s*([A-D])(?![A-ZÀ-Ỵ])/g)) map.set(+m[1], m[2]);
    if (!map.size) {   // không có số thứ tự: gán lần lượt A B C D...
      const ls = (txt.replace(/\d+/g, ' ').match(/(?:^|[^A-ZÀ-Ỵ])([A-D])(?![A-ZÀ-Ỵ])/g) || []).map(x => x.trim().slice(-1));
      ls.forEach((l, i) => map.set(i + 1, l));
    }
    return {map, bad};
  }
  let items = txt.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
  if (items.length === 1) items = [...txt.replace(/\s+/g, '').matchAll(/\d+[.:)\-]?[ĐS]{4}/g)].map(m => m[0]);
  items.forEach(it => {
    const m = /^(\d+)\s*[.:)\-]?\s*(.*)$/.exec(it);
    if (!m) return bad.push(it);
    const cs = m[2].replace(/(^|[^A-ZÀ-Ỵ])[A-D]\s*[)\-:.]/g, '$1').match(/[ĐS]/g) || [];
    if (cs.length !== 4) return bad.push(it);
    map.set(+m[1], cs.map(c => c === 'Đ' ? 0 : 1));
  });
  return {map, bad};
}

// Đổi dạng câu hỏi: trắc nghiệm = 4 phương án A–D · đúng/sai = 4 ý a–d · trả lời ngắn = chỉ có câu hỏi + đáp án · tự luận
function setQType(q, t) {
  if (q.t === t && (t !== 'mcq' || (q.opts && q.opts.length >= 3)) && (t !== 'tf' || isTfg(q))) return;
  const img = !!q.img;
  q.t = t;
  if (t === 'mcq') { delete q.sts; if (!q.opts || q.opts.length < 3 || (q.opts.length === 2)) q.opts = img ? ['A', 'B', 'C', 'D'] : ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D']; q.ans = null; }
  else if (t === 'tf') { delete q.opts; if (!Array.isArray(q.sts) || q.sts.length !== 4) q.sts = ['Ý a', 'Ý b', 'Ý c', 'Ý d']; q.ans = [null, null, null, null]; }
  else { delete q.opts; delete q.sts; q.ans = t === 'short' ? '' : null; }
  delete q.warn;
}
// opts.batch: chỉ hiện các câu của một lần import (để xử lý riêng, không lẫn câu cũ)
const latestBatch = () => { let best = null; (S.bank || []).forEach(q => { if (q.batch && (!best || (q.at || 0) >= best.at)) best = {id: q.batch, at: q.at || 0}; }); return best && best.id; };
function openBankManager(onChange, opts) {
  opts = opts || {};
  const TYL = {mcq: 'Trắc nghiệm', tf: 'Đúng/Sai', short: 'Trả lời ngắn', essay: 'Tự luận'}, LVL = [[1, 'Nhận biết'], [2, 'Thông hiểu'], [3, 'Vận dụng'], [4, 'Vận dụng cao']];
  const st = {f: 'all', q: '', p: 0, s: 'all', g: 'all', tp: 'all', b: opts.batch || 'all'}, PER = 15;
  const sel = new Set(), pinned = new Set(), solOpen = new Set(), bar = {t: '', lv: '', subject: '', grade: '', topic: ''};
  let lastSel = null;
  const m = modal('', 1, true), b = m.b;   // khóa: chỉ đóng bằng nút “Đóng” để không mất thay đổi chưa lưu
  HOLD_SYNC = true; PENDING_DROP = [];     // chế độ lưu thủ công: mọi chỉnh sửa chỉ ghi lên máy chủ khi bấm “Lưu thay đổi”
  const eqf = (v, val) => val === 'all' || (val === 'none' ? !v : v === val);
  const matches = q => (st.f === 'all' || (st.f === 'noans' ? !hasAns(q) : st.f === 'ai' ? !!q.aiAns : q.t === st.f))
    && (st.b === 'all' || (st.b === 'none' ? !q.batch : q.batch === st.b))
    && eqf(q.subject, st.s) && eqf(q.grade, st.g) && eqf(q.topic, st.tp)
    && (!st.q || (q.q + ' ' + (q.opts || []).join(' ')).toLowerCase().includes(st.q.toLowerCase()));
  // câu vừa chỉnh sửa được “ghim” lại trong danh sách đến khi đổi bộ lọc → không biến mất / nhảy chỗ khi đổi dạng
  const list = () => (S.bank || []).filter(q => matches(q) || pinned.has(q.id));
  const dirtyN = () => { const cur = bankJson(); let n = 0; cur.forEach((js, id) => { if (bankSnap.get(id) !== js) n++; }); bankSnap.forEach((_, id) => { if (!cur.has(id)) n++; }); return n; };
  const warnUnload = e => { if (dirtyN()) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warnUnload);
  const dropLater = qs => { const w = qs.filter(q => q.img || q.solImg); if (HOLD_SYNC) PENDING_DROP.push(...w); else dropImgs(w); };
  const finish = () => { HOLD_SYNC = false; window.removeEventListener('beforeunload', warnUnload); m.close(); onChange && onChange(); };
  const revert = () => { S.bank = [...bankSnap.values()].map(js => JSON.parse(js)); PENDING_DROP = []; sel.clear(); pinned.clear(); save(); onChange && onChange(); };
  const doSave = async () => {
    const n = dirtyN(); if (!n) { toast('Không có thay đổi nào cần lưu'); return true; }
    const btn = $('#bk-save', b); if (btn) { btn.disabled = true; btn.textContent = 'Đang lưu...'; }
    await flushBank();
    if (dirtyN()) { toast('Chưa lưu được hết — kiểm tra kết nối rồi bấm Lưu lại'); drawHead(); return false; }
    if (PENDING_DROP.length) { dropImgs(PENDING_DROP); PENDING_DROP = []; }
    toast(`✓ Đã lưu ${n} thay đổi lên máy chủ`); drawHead(); return true;
  };
  const optsOf = (arr, cur, allLabel, fmtF) => `<option value="all" ${cur === 'all' ? 'selected' : ''}>${allLabel}</option><option value="none" ${cur === 'none' ? 'selected' : ''}>(Chưa gắn nhãn)</option>${arr.map(x => `<option value="${esc(x)}" ${cur === x ? 'selected' : ''}>${esc(fmtF ? fmtF(x) : x)}</option>`).join('')}`;
  const SELS = 'padding:4px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px';
  const ctl = q => {
    if (q.t === 'essay') return '';
    if (isTfg(q)) return q.sts.map((_, i) => `<select data-f="ans4" data-k="${i}" title="Ý ${'abcd'[i]}" style="${SELS}"><option value="-1">${'abcd'[i]}: ?</option><option value="0" ${q.ans && q.ans[i] === 0 ? 'selected' : ''}>${'abcd'[i]}: Đúng</option><option value="1" ${q.ans && q.ans[i] === 1 ? 'selected' : ''}>${'abcd'[i]}: Sai</option></select>`).join('');
    if (q.t === 'short') return `<input data-f="ans" value="${esc(q.ans == null ? '' : q.ans)}" placeholder="Đáp án đúng" style="width:130px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px">`;
    const labels = q.t === 'tf' ? ['Đúng', 'Sai'] : (q.opts || []).map((_, j) => 'ABCD'[j]);
    return `<select data-f="ans" style="${SELS}"><option value="-1">— Đáp án? —</option>${labels.map((l, j) => `<option value="${j}" ${q.ans === j ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  };
  const drawHead = () => {
    const h = $('#bk-head', b); if (!h) return; const n = dirtyN();
    h.innerHTML = `<h2 style="margin:0;font-size:18px;flex:1;min-width:200px">🗂 Quản lý ngân hàng câu hỏi (${(S.bank || []).length} câu)</h2>
      ${n ? `<span class="pill warn">● ${n} thay đổi chưa lưu</span>` : '<span class="pill ok">✓ Đã lưu</span>'}
      <button class="btn btn-blue sm" id="bk-save" data-bk="save" ${n ? '' : 'disabled'}>💾 Lưu thay đổi</button>
      <button class="btn btn-outline sm" data-bk="revert" ${n ? '' : 'disabled'}>↶ Hủy thay đổi</button>
      <button class="btn btn-outline sm" data-bk="close">Đóng</button>`;
  };
  const draw = reset => {
    const old = $('#bk-list', b), keep = old && !reset ? old.scrollTop : 0;
    const all = S.bank || [], L = list(), pages = Math.max(1, Math.ceil(L.length / PER));
    st.p = Math.max(0, Math.min(st.p, pages - 1));
    const aiN = all.filter(q => q.aiAns).length, noans = all.filter(q => !hasAns(q)).length, off = st.p * PER, nSel = all.filter(q => sel.has(q.id)).length;
    const rows = L.slice(off, off + PER).map((q, ri) => {
      const on = sel.has(q.id);
      return `<div class="bk-row" data-id="${esc(q.id)}" style="border:1px solid ${on ? '#60a5fa' : hasAns(q) ? '#e2e8f0' : '#fca5a5'};border-radius:8px;padding:8px;margin-bottom:6px;background:${on ? '#eff6ff' : hasAns(q) ? '#fff' : '#fff7f7'}">
        <label style="display:flex;gap:6px;align-items:center;font-size:11px;margin-bottom:4px;cursor:pointer"><input type="checkbox" data-sel="${esc(q.id)}" ${on ? 'checked' : ''}> <b>#${off + ri + 1}</b> <span style="color:#667085">${TYL[q.t]}${q.lv ? ' · ' + (LVL.find(x => x[0] === q.lv) || [0, ''])[1] : ''}</span></label>
        ${imgq(q) ? `<img src="${imgSrc(q.img)}" style="max-width:100%;display:block;border:1px solid #e2e8f0;border-radius:4px"><div style="font-size:9px;color:#98a2b3;margin-top:2px">🖼 Ảnh cắt từ PDF — phương án A/B/C/D nằm trong ảnh</div>` : `<div data-f="stem" contenteditable="true" title="Bấm vào để sửa nội dung" style="font-size:11px;line-height:1.5;outline:none;border-bottom:1px dashed #e2e8f0">${q.q}</div>
        ${isTfg(q) ? `<div style="font-size:11px;margin:3px 0">${q.sts.map((s, i) => `<div><b>${'abcd'[i]})</b> <span data-f="st" data-k="${i}" contenteditable="true" style="outline:none;border-bottom:1px dashed #e2e8f0">${esc(s)}</span></div>`).join('')}</div>` : ''}
        ${q.t === 'mcq' ? `<div style="font-size:10px;color:#475467;margin:3px 0">${q.opts.map((o, j) => `<span style="margin-right:12px">${'ABCD'[j]}. <span data-f="opt" data-k="${j}" contenteditable="true" style="outline:none;border-bottom:1px dashed #e2e8f0">${esc(o)}</span></span>`).join('')}</div>` : ''}`}
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:5px;font-size:10px">
          <select data-f="t" style="${SELS}">${ORD.map(t => `<option value="${t}" ${q.t === t ? 'selected' : ''}>${TYL[t]}</option>`).join('')}</select>
          ${ctl(q)}
          <select data-f="subject" title="Môn" style="${SELS}"><option value="">— Môn —</option>${SUBJECTS.map(s => `<option ${q.subject === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
          <select data-f="grade" title="Khối" style="${SELS}"><option value="">— Khối —</option>${GRADES.map(g => `<option value="${g}" ${q.grade === g ? 'selected' : ''}>Khối ${g}</option>`).join('')}</select>
          <input data-f="topic" list="bk-tpl" value="${esc(q.topic || '')}" placeholder="Chuyên đề" title="Chuyên đề (chọn gợi ý hoặc gõ tay)" style="width:170px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px">
          <select data-f="lv" title="Mức độ (dùng để xếp bài cá nhân hóa)" style="${SELS}">${LVL.map(([v, l]) => `<option value="${v}" ${(q.lv || 2) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <button class="btn btn-outline" data-bk="del" style="font-size:9px;padding:3px 8px">✕ Xóa</button>
          ${q.aiAns ? `<span class="pill warn" title="${esc(q.aiAns.n || 'Đáp án do AI giải — cần giáo viên xem lại')}">🤖 AI · tin cậy ${AI_CONF[q.aiAns.c] || '?'} · cần xem lại</span><button class="btn btn-outline" data-bk="ai-ok" style="font-size:9px;padding:3px 8px">✓ Đã kiểm tra</button>` : ''}
          ${q.warn ? '<span style="color:#b45309;font-weight:700" title="Có thể thiếu/sai phương án hoặc công thức — hãy đối chiếu đề gốc và sửa lại.">⚠ Kiểm tra lại</span>' : ''}
          ${q.examId ? `<span class="pill" style="background:#e0e7ff;color:#3730a3" title="Câu thuộc đề thi — dùng khi nhập đáp án theo đề">${esc(q.examName || 'Đề')} · De${q.examNo}.${q.examPart}.${String(q.examIdx || 0).padStart(2, '0')}</span>` : ''}
          <span style="color:#98a2b3">${esc(q.src || '')}</span>
        </div>
        <details data-solbox="${esc(q.id)}" ${solOpen.has(q.id) ? 'open' : ''} style="margin-top:5px;font-size:10px"><summary style="cursor:pointer;font-weight:700;color:${!q.solImg && solGarbled(q) ? '#b45309' : hasSol(q) ? '#166534' : '#98a2b3'}">📘 Lời giải chi tiết${q.solImg ? ' · có ảnh' : solGarbled(q) ? ' · ⚠ chữ bị vỡ công thức, học sinh không thấy' : q.sol ? '' : ' · chưa có (bấm để thêm)'}</summary>
          ${!q.solImg && solGarbled(q) ? `<div style="margin-top:4px;padding:6px 8px;border-radius:6px;background:#fff7ed;color:#9a3412;font-size:11px">⚠ Lời giải này có công thức; khi đọc chữ từ PDF, phân số, tích phân, π… bị tách thành ký hiệu rời nên không đọc được và <b>không hiện cho học sinh</b>. Cách sửa: <b>import lại file ${esc(q.src || 'gốc')}</b> (để tick “Giữ nguyên định dạng”) — hệ thống tự bổ sung <b>ảnh lời giải</b> vào câu này, không tạo câu trùng; hoặc gõ lại lời giải ở ô dưới.</div>` : ''}
          ${q.solImg ? `<img src="${imgSrc(q.solImg)}" alt="Ảnh lời giải" style="max-width:100%;display:block;border:1px solid #bbf7d0;border-radius:4px;margin-top:4px"><button class="btn btn-outline" data-bk="del-solimg" style="font-size:9px;padding:2px 8px;margin-top:3px">✕ Bỏ ảnh lời giải</button>` : ''}
          <div data-f="sol" contenteditable="true" data-ph="Gõ lời giải chi tiết cho câu này (học sinh xem khi xem lại bài)..." title="Bấm vào để sửa lời giải" style="min-height:22px;border:1px dashed #cbd5e1;border-radius:6px;padding:4px 6px;margin-top:4px;font-size:11px;line-height:1.5;outline:none">${q.sol || ''}</div>
        </details></div>`;
    }).join('');
    const KEEP = '<option value="">— giữ nguyên —</option>';
    // nguồn = từng lần import (mới nhất lên đầu); câu cũ chưa có mã lần import gom vào “Câu cũ”
    const groups = new Map(); all.forEach(q => { const k = q.batch || 'none'; const g = groups.get(k) || {n: 0, at: q.at || 0, src: q.src || ''}; g.n++; groups.set(k, g); });
    const srcOpts = [...groups.entries()].filter(([k]) => k !== 'none').sort((x, y) => y[1].at - x[1].at)
      .map(([k, g]) => `<option value="${esc(k)}" ${st.b === k ? 'selected' : ''}>${g.at ? LB.fmtDate(g.at) + ' · ' : ''}${esc(g.src || 'import')} (${g.n} câu)</option>`).join('')
      + (groups.has('none') ? `<option value="none" ${st.b === 'none' ? 'selected' : ''}>Câu cũ / thêm tay (${groups.get('none').n})</option>` : '');
    const scoped = st.b !== 'all';
    b.innerHTML = `<div id="bk-head" style="position:sticky;top:0;z-index:3;background:#fff;padding:6px 0 8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #e2e8f0"></div>
      ${scoped ? `<div class="lb-note" style="margin:8px 0 0">📌 Đang chỉ hiện <b>${L.length}</b> câu của một lần import để bạn xử lý riêng — các câu import trước đó đã được lưu trong ngân hàng và đang được ẩn. <a href="#" data-bk="show-all">Xem toàn bộ ngân hàng (${all.length} câu)</a></div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0">
        <select id="bk-b" title="Lọc theo lần import / file nguồn" style="padding:6px;border:1px solid #93c5fd;border-radius:6px;font-size:11px;max-width:260px;background:#eff6ff"><option value="all" ${st.b === 'all' ? 'selected' : ''}>Nguồn: tất cả (${all.length})</option>${srcOpts}</select>
        ${scoped ? `<button class="btn btn-outline" data-bk="del-batch" style="font-size:10px;padding:5px 10px;color:#b91c1c;border-color:#fca5a5" title="Xóa mọi câu thuộc lần import / file đang chọn ở ô Nguồn">🗑 Xóa cả file import này (${all.filter(q => st.b === 'none' ? !q.batch : q.batch === st.b).length} câu)</button>` : ''}
        <select id="bk-f" style="padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px">
          <option value="all" ${st.f === 'all' ? 'selected' : ''}>Tất cả (${all.length})</option>
          ${ORD.map(t => `<option value="${t}" ${st.f === t ? 'selected' : ''}>${TYL[t]} (${all.filter(q => q.t === t).length})</option>`).join('')}
          <option value="noans" ${st.f === 'noans' ? 'selected' : ''}>Chưa có đáp án (${noans})</option>
          ${aiN || st.f === 'ai' ? `<option value="ai" ${st.f === 'ai' ? 'selected' : ''}>🤖 Đáp án AI chưa xác nhận (${aiN})</option>` : ''}
        </select>
        <select id="bk-s" style="padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px">${optsOf(SUBJECTS, st.s, 'Mọi môn')}</select>
        <select id="bk-g" style="padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px">${optsOf(GRADES, st.g, 'Mọi khối', g => 'Khối ' + g)}</select>
        <select id="bk-tp" style="padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px;max-width:200px">${optsOf([...new Set(all.map(q => q.topic).filter(Boolean))], st.tp, 'Mọi chuyên đề')}</select>
        <input id="bk-q" value="${esc(st.q)}" placeholder="Tìm trong câu hỏi... (Enter)" style="flex:1;min-width:160px;padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px">
        <button class="btn btn-blue" data-bk="quick-mcq" style="font-size:10px;padding:5px 10px" title="Dán chuỗi đáp án, ví dụ: 1A 2B 3C 4D...">✎ Nhập nhanh đáp án TN</button>
        <button class="btn btn-blue" data-bk="quick-tf" style="font-size:10px;padding:5px 10px" title="Ví dụ: 1ĐĐSS;2SĐĐS;3SSSS">✎ Nhập nhanh đáp án Đ/S</button>
        <button class="btn btn-blue" data-bk="quick-short" style="font-size:10px;padding:5px 10px" title="Ví dụ: 1.0,4;2.123;3.-5">✎ Nhập nhanh đáp án TLN</button>
        <button class="btn btn-blue" data-bk="auto-lv" style="font-size:10px;padding:5px 10px" title="Tự gán Nhận biết / Thông hiểu / Vận dụng / Vận dụng cao cho các câu đang chọn (hoặc đang lọc) dựa vào vị trí trong đề và nội dung câu">🎯 Tự phân mức độ</button>
        <button class="btn btn-blue" data-bk="ai-solve" style="font-size:10px;padding:5px 10px;background:#4f46e5" title="Nhờ AI (Claude) giải đáp án cho các câu đang chọn (hoặc đang lọc) mà chưa có đáp án">🤖 AI giải câu chưa có đáp án</button>
        ${aiN ? `<button class="btn btn-outline" data-bk="ai-ok-all" style="font-size:10px;padding:5px 10px;color:#3730a3;border-color:#a5b4fc">✓ Xác nhận đáp án AI đang lọc/chọn</button>` : ''}
        <button class="btn btn-blue" data-bk="quick-exam" style="font-size:10px;padding:5px 10px" title="Dán đáp án nhiều đề cùng lúc, ví dụ: De1.I.01.A;De1.II.01.ĐĐSS;De1.III.01.0,5">✎ Nhập đáp án theo đề</button>
        <button class="btn btn-outline" data-bk="del-noans" style="font-size:10px;padding:5px 10px">Xóa câu chưa có đáp án</button>
        <button class="btn btn-outline" data-bk="del-all" style="font-size:10px;padding:5px 10px;color:#b91c1c">Xóa toàn bộ</button>
      </div>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px;margin-bottom:8px">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:11px;margin-bottom:6px"><b style="color:#1e40af">☑ Chọn nhiều câu:</b>
          <button class="btn btn-outline" data-bk="sel-all" style="font-size:10px;padding:4px 9px">Tất cả ${L.length} câu đang lọc</button>
          <button class="btn btn-outline" data-bk="sel-page" style="font-size:10px;padding:4px 9px">Chỉ trang này</button>
          <button class="btn btn-outline" data-bk="sel-none" style="font-size:10px;padding:4px 9px">Bỏ chọn</button>
          <span style="color:#475467">Đã chọn <b>${nSel}</b> câu · giữ <b>Shift</b> khi tick để chọn một dải liên tiếp</span></div>
        <div style="display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap">
          <label style="font-size:10px;color:#475467">Dạng<select id="bulk-t" style="${SELS};display:block">${KEEP}${ORD.map(t => `<option value="${t}" ${bar.t === t ? 'selected' : ''}>${TYL[t]}</option>`).join('')}</select></label>
          <label style="font-size:10px;color:#475467">Mức độ<select id="bulk-lv" style="${SELS};display:block">${KEEP}${LVL.map(([v, l]) => `<option value="${v}" ${bar.lv == v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label style="font-size:10px;color:#475467">Môn<select id="bulk-s" style="${SELS};display:block">${KEEP}${SUBJECTS.map(s => `<option ${bar.subject === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
          <label style="font-size:10px;color:#475467">Khối<select id="bulk-g" style="${SELS};display:block">${KEEP}${GRADES.map(g => `<option value="${g}" ${bar.grade === g ? 'selected' : ''}>Khối ${g}</option>`).join('')}</select></label>
          <label style="font-size:10px;color:#475467">Chuyên đề<input id="bulk-tp" list="bk-tpl" value="${esc(bar.topic)}" placeholder="giữ nguyên" style="${SELS};display:block;width:170px"></label>
          <button class="btn btn-blue" data-bk="bulk-apply" style="font-size:11px;padding:7px 14px" ${nSel ? '' : 'disabled'}>Áp dụng cho ${nSel} câu đã chọn</button>
          <button class="btn btn-outline" data-bk="bulk-del" style="font-size:11px;padding:7px 14px;color:#b91c1c;border-color:#fca5a5" ${nSel ? '' : 'disabled'}>🗑 Xóa ${nSel} câu đã chọn</button></div>
        <div style="font-size:10px;color:#64748b;margin-top:4px">Chỉ thuộc tính nào bạn chọn mới được đổi, mục “giữ nguyên” thì để nguyên. Đổi dạng sẽ xóa đáp án cũ của câu đó. Sau khi áp dụng nhớ bấm <b>💾 Lưu thay đổi</b>.</div>
      </div>
      <datalist id="bk-tpl">${[...new Set([...Object.values(TOPICS_CATALOG).flatMap(o => Object.values(o).flat()), ...all.map(q => q.topic).filter(Boolean)])].map(t => `<option value="${esc(t)}">`).join('')}</datalist>
      <div id="bk-list" style="max-height:48vh;overflow:auto;padding-right:4px">${rows || '<div class="lb-empty">Không có câu hỏi phù hợp.</div>'}</div>
      <div style="display:flex;justify-content:center;gap:10px;align-items:center;margin-top:8px;font-size:11px">
        <button class="btn btn-outline" data-bk="prev" style="padding:4px 10px" ${st.p === 0 ? 'disabled' : ''}>←</button>
        <span>Trang ${st.p + 1}/${pages} · ${L.length} câu</span>
        <button class="btn btn-outline" data-bk="next" style="padding:4px 10px" ${st.p >= pages - 1 ? 'disabled' : ''}>→</button>
      </div>`;
    const nl = $('#bk-list', b); if (nl) nl.scrollTop = keep;   // giữ nguyên vị trí cuộn khi chỉnh sửa → không nhảy lên đầu
    drawHead();
  };
  const touched = q => { pinned.add(q.id); save(); onChange && onChange(); };
  b.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.sel) return;
    if (t.id === 'bk-b') { st.b = t.value; st.f = 'all'; st.p = 0; pinned.clear(); return draw(true); }
    if (t.id === 'bk-f') { st.f = t.value; st.p = 0; pinned.clear(); return draw(true); }
    if (t.id === 'bk-s' || t.id === 'bk-g' || t.id === 'bk-tp') { st[{'bk-s': 's', 'bk-g': 'g', 'bk-tp': 'tp'}[t.id]] = t.value; st.p = 0; pinned.clear(); return draw(true); }
    const bf = {'bulk-t': 't', 'bulk-lv': 'lv', 'bulk-s': 'subject', 'bulk-g': 'grade', 'bulk-tp': 'topic'}[t.id];
    if (bf) { bar[bf] = t.value.trim(); return; }
    const row = t.closest('.bk-row'); if (!row) return;
    const q = (S.bank || []).find(x => x.id === row.dataset.id); if (!q) return;
    if (t.dataset.f === 't') setQType(q, t.value);
    else if (t.dataset.f === 'ans') { q.ans = q.t === 'short' ? t.value.trim() : (+t.value < 0 ? null : +t.value); delete q.aiAns; }
    else if (t.dataset.f === 'ans4') { q.ans = Array.isArray(q.ans) ? q.ans.slice() : q.sts.map(() => null); q.ans[+t.dataset.k] = +t.value < 0 ? null : +t.value; delete q.aiAns; }
    else if (t.dataset.f === 'subject' || t.dataset.f === 'grade') q[t.dataset.f] = t.value;
    else if (t.dataset.f === 'topic') q.topic = t.value.trim();
    else if (t.dataset.f === 'lv') { q.lv = +t.value; delete q.lvAuto; }
    else return;
    touched(q); draw();
  });
  // giữ trạng thái mở/đóng khung lời giải khi vẽ lại danh sách (sự kiện toggle không nổi bọt → bắt ở pha capture)
  b.addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.solbox) { if (d.open) solOpen.add(d.dataset.solbox); else solOpen.delete(d.dataset.solbox); } }, true);
  b.addEventListener('focusin', e => { const t = e.target; if (t.dataset && t.dataset.f === 'sol') t.dataset.orig = t.innerText; });
  b.addEventListener('focusout', e => {
    const t = e.target, f = t.dataset && t.dataset.f;
    if (f === 'sol') {
      const row = t.closest('.bk-row'), q = row && (S.bank || []).find(x => x.id === row.dataset.id); if (!q || t.innerText === t.dataset.orig) return;
      const sol = esc(t.innerText.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()).replace(/\n/g, '<br>');
      if (sol) q.sol = sol; else delete q.sol;
      delete q.solBad;   // giáo viên đã gõ lại → kiểm tra lại bằng nội dung mới
      touched(q); drawHead(); return;
    }
    if (f !== 'stem' && f !== 'opt' && f !== 'st') return;
    const row = t.closest('.bk-row'), q = row && (S.bank || []).find(x => x.id === row.dataset.id); if (!q) return;
    const txt = t.innerText.replace(/\s+/g, ' ').trim();
    if (f === 'stem') { if (esc(txt) === q.q.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) return; q.q = esc(txt); }
    else if (f === 'st') { if (txt === q.sts[+t.dataset.k]) return; q.sts[+t.dataset.k] = txt; }
    else { if (txt === q.opts[+t.dataset.k]) return; q.opts[+t.dataset.k] = txt; }
    delete q.warn; save(); drawHead();
  });
  b.addEventListener('keydown', e => { if (e.target.id === 'bk-q' && e.key === 'Enter') { st.q = e.target.value.trim(); st.p = 0; pinned.clear(); draw(true); } });
  b.addEventListener('click', async e => {
    const cb = e.target.closest('[data-sel]');
    if (cb) {   // tick chọn câu (Shift = chọn cả dải)
      const id = cb.dataset.sel, ids = list().map(q => q.id);
      if (e.shiftKey && lastSel && ids.includes(lastSel)) { const a = ids.indexOf(lastSel), z = ids.indexOf(id); ids.slice(Math.min(a, z), Math.max(a, z) + 1).forEach(x => cb.checked ? sel.add(x) : sel.delete(x)); }
      else cb.checked ? sel.add(id) : sel.delete(id);
      lastSel = id; return draw();
    }
    const btn = e.target.closest('[data-bk]'); if (!btn) return;
    const a = btn.dataset.bk;
    if (a === 'save') return void await doSave();
    if (a === 'revert') { if (dirtyN() && confirm('Hủy toàn bộ thay đổi chưa lưu và quay về dữ liệu đã lưu lần trước?')) { revert(); draw(true); } return; }
    if (a === 'close') {
      const n = dirtyN();
      if (n) {
        if (confirm(`Còn ${n} thay đổi chưa lưu.\n\nOK = Lưu rồi đóng\nCancel = chọn tiếp: bỏ thay đổi hoặc ở lại`)) { if (await doSave()) finish(); return; }
        if (confirm('Bỏ các thay đổi chưa lưu và đóng?\n\nOK = bỏ thay đổi và đóng\nCancel = ở lại màn quản lý')) { revert(); finish(); }
        return;
      }
      return finish();
    }
    if (a === 'show-all') { e.preventDefault(); st.b = 'all'; st.p = 0; pinned.clear(); return draw(true); }
    if (a === 'prev') { st.p--; return draw(true); }
    if (a === 'next') { st.p++; return draw(true); }
    if (a === 'sel-all') list().forEach(q => sel.add(q.id));
    else if (a === 'sel-page') list().slice(st.p * PER, st.p * PER + PER).forEach(q => sel.add(q.id));
    else if (a === 'sel-none') sel.clear();
    else if (a === 'del') { const id = btn.closest('.bk-row').dataset.id; dropLater(S.bank.filter(x => x.id === id)); S.bank = S.bank.filter(x => x.id !== id); sel.delete(id); save(); onChange && onChange(); }
    else if (a === 'del-solimg') {
      const q = (S.bank || []).find(x => x.id === btn.closest('.bk-row').dataset.id); if (!q || !q.solImg) return;
      if (!confirm('Bỏ ảnh lời giải của câu này? (lời giải dạng chữ vẫn giữ nguyên)')) return;
      dropLater([{solImg: q.solImg}]); delete q.solImg; touched(q);
    }
    else if (a === 'bulk-del') {
      const qs = (S.bank || []).filter(q => sel.has(q.id));
      if (!qs.length) return toast('Chưa chọn câu nào — hãy tick ô vuông ở đầu mỗi câu');
      if (!confirm(`Xóa ${qs.length} câu đã chọn khỏi ngân hàng?\n\nViệc xóa chỉ được ghi vào cơ sở dữ liệu khi bạn bấm “💾 Lưu thay đổi” (có thể bấm “Hủy thay đổi” để khôi phục).`)) return;
      dropLater(qs); S.bank = S.bank.filter(q => !sel.has(q.id)); sel.clear(); save(); onChange && onChange();
      toast(`Đã xóa ${qs.length} câu — nhớ bấm 💾 Lưu thay đổi để ghi lại`);
    }
    else if (a === 'bulk-apply') {
      const qs = (S.bank || []).filter(q => sel.has(q.id));
      if (!qs.length) return toast('Chưa chọn câu nào — hãy tick ô vuông ở đầu mỗi câu');
      if (!bar.t && !bar.lv && !bar.subject && !bar.grade && !bar.topic) return toast('Hãy chọn ít nhất một thuộc tính cần đổi (dạng, mức độ, môn, khối hoặc chuyên đề)');
      const lose = bar.t ? qs.filter(q => q.t !== bar.t && q.t !== 'essay' && hasAns(q)).length : 0;
      if (lose && !confirm(`Đổi dạng sẽ xóa đáp án đã nhập của ${lose} câu. Tiếp tục?`)) return;
      qs.forEach(q => { if (bar.t) setQType(q, bar.t); if (bar.lv) { q.lv = +bar.lv; delete q.lvAuto; } if (bar.subject) q.subject = bar.subject; if (bar.grade) q.grade = bar.grade; if (bar.topic) q.topic = bar.topic; pinned.add(q.id); });
      save(); onChange && onChange(); toast(`Đã áp dụng cho ${qs.length} câu — nhớ bấm 💾 Lưu thay đổi để ghi lại`);
    }
    else if (a === 'quick-tf' || a === 'quick-mcq' || a === 'quick-short') {
      const kind = a.slice(6), NAME = {tf: 'đúng/sai', mcq: 'trắc nghiệm', short: 'trả lời ngắn'}[kind];
      const pool = list().filter(q => kind === 'tf' ? isTfg(q) : kind === 'mcq' ? q.t === 'mcq' : q.t === 'short');
      if (!pool.length) return toast(`Không có câu ${NAME} nào trong bộ lọc hiện tại`);
      const eg = {tf: '1ĐĐSS;2SĐĐS;3SSSS', mcq: '1A;2B;3C;4D', short: '1.0,4;2.123;3.-5'}[kind];
      const txt = prompt(`Nhập nhanh đáp án cho ${pool.length} câu ${NAME} đang lọc.\nSố thứ tự 1–${pool.length} tính theo danh sách đang lọc (hãy lọc theo file / chuyên đề / dạng câu trước).\nĐịnh dạng, các câu cách nhau bằng dấu ; :\n${eg}`);
      if (!txt) return;
      const {map, bad} = parseQuickKey(kind, txt);
      const todo = [...map].filter(([n]) => { if (n >= 1 && n <= pool.length) return true; bad.push(`câu ${n} (ngoài 1–${pool.length})`); return false; });
      if (!todo.length) return toast('Không đọc được đáp án nào. Ví dụ đúng: ' + eg);
      const over = todo.filter(([n]) => hasAns(pool[n - 1])).length;
      if (over && !confirm(`${over} câu đã có đáp án sẽ bị ghi đè. Tiếp tục?`)) return;
      todo.forEach(([n, v]) => { const q = pool[n - 1]; q.ans = kind === 'mcq' ? 'ABCD'.indexOf(v) : v; pinned.add(q.id); });
      save(); onChange && onChange();
      toast(`Đã gán đáp án cho ${todo.length}/${pool.length} câu ${NAME}` + (bad.length ? `; bỏ qua ${bad.length} mục lỗi: ${bad.slice(0, 3).join(' | ')}` : ''));
    }
    else if (a === 'del-batch') {
      const inB = q => st.b === 'none' ? !q.batch : q.batch === st.b, qs = (S.bank || []).filter(inB);
      if (!qs.length) return toast('Nguồn này không còn câu nào');
      const name = qs[0].src || 'import';
      if (!confirm(`Xóa CẢ FILE import “${name}”: ${qs.length} câu (kể cả câu đang bị ẩn bởi bộ lọc)?\n\nViệc xóa chỉ được ghi vào cơ sở dữ liệu khi bạn bấm “💾 Lưu thay đổi” (có thể bấm “Hủy thay đổi” để khôi phục).`)) return;
      dropLater(qs); S.bank = S.bank.filter(q => !inB(q)); sel.clear(); pinned.clear(); st.b = 'all'; st.p = 0; save(); onChange && onChange();
      toast(`Đã xóa ${qs.length} câu của “${name}” — nhớ bấm 💾 Lưu thay đổi để ghi lại`);
    }
    else if (a === 'ai-ok') { const q = (S.bank || []).find(x => x.id === btn.closest('.bk-row').dataset.id); if (q) { delete q.aiAns; touched(q); } }
    else if (a === 'ai-ok-all') {
      const ids = sel.size ? sel : new Set(list().map(q => q.id)), qs = (S.bank || []).filter(q => q.aiAns && ids.has(q.id));
      if (!qs.length) return toast('Không có câu AI nào cần xác nhận trong phạm vi này');
      if (!confirm(`Xác nhận ${qs.length} đáp án do AI giải là ĐÚNG (bạn đã xem lại)? Nhãn 🤖 sẽ được bỏ.`)) return;
      qs.forEach(q => { delete q.aiAns; pinned.add(q.id); }); save(); onChange && onChange();
      toast(`Đã xác nhận ${qs.length} đáp án — nhớ bấm 💾 Lưu thay đổi`);
    }
    else if (a === 'ai-solve') {
      const ids = sel.size ? sel : new Set(list().map(q => q.id)), qs = aiCandidates((S.bank || []).filter(q => ids.has(q.id)));
      if (!qs.length) return toast('Không có câu nào cần AI giải (câu phải chưa có đáp án, và có ảnh đã lưu hoặc có nội dung chữ)');
      (async () => {
        const st0 = await aiStatus();
        if (!st0.ready) return toast(aiOffMsg(st0));
        if (!confirm(`Nhờ AI giải ${qs.length} câu ${sel.size ? 'đã chọn' : 'đang lọc'} chưa có đáp án (mỗi câu vài chục giây)?

` + aiConsent(st0))) return;
        btn.disabled = true;
        const r = await aiFill(qs, (d, t) => { btn.textContent = `🤖 Đang giải ${d}/${t}...`; });
        qs.forEach(q => pinned.add(q.id)); save(); onChange && onChange(); draw();
        toast(`🤖 AI giải được ${r.ok}/${r.total} câu${r.fail ? `; ${r.fail} câu không giải được (${[...new Set(r.errors)].slice(0, 2).join('; ')})` : ''} — hãy xem lại rồi bấm 💾 Lưu thay đổi`);
      })();
      return;
    }
    else if (a === 'quick-exam') {
      const pool = list().filter(q => q.examId);
      if (!pool.length) return toast('Không có câu thuộc đề thi nào trong bộ lọc — hãy chọn đúng Nguồn (lần import đề thi)');
      const nExam = new Set(pool.map(q => q.examId)).size;
      const mm = subModal(`<h2>✎ Nhập đáp án theo đề</h2>
        <p style="font-size:12px;color:#475467;margin:4px 0 8px">Áp dụng cho <b>${nExam}</b> đề (${pool.length} câu) trong bộ lọc hiện tại. Mỗi mục cách nhau bằng dấu <b>;</b> hoặc xuống dòng, dạng <b>De[số đề].[phần].[số câu].[đáp án]</b>:<br>
        • Phần <b>I</b> trắc nghiệm: <code>De1.I.01.A</code><br>• Phần <b>II</b> đúng/sai (4 ý a b c d): <code>De1.II.01.ĐĐSS</code><br>• Phần <b>III</b> trả lời ngắn (số, dấu phẩy thập phân): <code>De1.III.01.0,5</code></p>
        <textarea id="qe-t" rows="9" placeholder="De1.I.01.A;De1.I.02.C;De1.II.01.ĐĐSS;De1.III.01.0,5&#10;De2.I.01.B;..." style="width:100%;font-family:monospace;font-size:12px;padding:8px;border:1px solid #cbd5e1;border-radius:8px"></textarea>
        <div class="lb-row" style="margin-top:10px"><button class="btn btn-blue" id="qe-go">Áp dụng đáp án</button><button class="btn btn-outline" id="qe-x">Hủy</button></div>`);
      $('#qe-x', mm.b).onclick = mm.close;
      $('#qe-go', mm.b).onclick = () => {
        const r = applyExamKey($('#qe-t', mm.b).value, pool);
        if (!r.ok) return toast('Không đọc được mục nào. Ví dụ đúng: De1.I.01.A;De1.II.01.ĐĐSS;De1.III.01.0,5');
        mm.close(); r.touched.forEach(q => pinned.add(q.id)); save(); onChange && onChange(); draw();
        const rm = subModal(`<h2>${r.bad.length ? 'Đã áp dụng một phần' : '✓ Đã gán đáp án'}</h2><p style="font-size:13px">Gán được <b>${r.ok}</b> đáp án${r.over ? ` (ghi đè ${r.over} đáp án cũ)` : ''}. Nhớ bấm <b>💾 Lưu thay đổi</b>.</p>${r.bad.length ? `<div class="lb-note" style="background:#fff7ed;border-color:#fed7aa;color:#9a3412;max-height:200px;overflow:auto"><b>${r.bad.length} mục bị bỏ qua:</b><br>${r.bad.slice(0, 40).map(esc).join('<br>')}${r.bad.length > 40 ? '<br>…' : ''}</div>` : ''}<div class="lb-row" style="margin-top:10px"><button class="btn btn-blue" id="qe-ok">OK</button></div>`);
        $('#qe-ok', rm.b).onclick = rm.close;
      };
      return;
    }
    else if (a === 'auto-lv') {
      const ids = sel.size ? sel : new Set(list().map(q => q.id)), qs = (S.bank || []).filter(q => ids.has(q.id) && q.t !== 'essay');
      if (!qs.length) return toast('Không có câu nào để phân mức');
      const hand = qs.filter(q => q.lv != null && !q.lvAuto).length;
      if (!confirm(`Tự phân mức độ cho ${qs.length} câu ${sel.size ? 'đã chọn' : 'đang lọc'}?\n\nDựa vào vị trí trong từng file (dễ → khó) và nội dung câu. ${hand ? `${hand} câu đã được đặt mức tay sẽ được giữ nguyên.` : ''}\nNên lọc theo từng file/lần import trước để thứ tự câu đúng như trong đề.`)) return;
      const force = hand && confirm(`${hand} câu đã đặt mức tay. Bấm OK để ghi đè luôn, Hủy để giữ nguyên.`);
      const before = new Map(qs.map(q => [q.id, q.lv]));
      const t = autoLevels(qs, force);
      qs.forEach(q => pinned.add(q.id));
      save(); onChange && onChange();
      toast(`Đã phân mức: ${t[1]} nhận biết · ${t[2]} thông hiểu · ${t[3]} vận dụng · ${t[4]} vận dụng cao — nhớ bấm 💾 Lưu thay đổi`);
    }
    else if (a === 'del-noans') { const n = S.bank.filter(q => !hasAns(q)).length; if (!n) return toast('Không có câu nào thiếu đáp án'); if (!confirm(`Xóa ${n} câu chưa có đáp án?`)) return; dropLater(S.bank.filter(q => !hasAns(q))); S.bank = S.bank.filter(hasAns); save(); onChange && onChange(); }
    else if (a === 'del-all') { if (!confirm(`Xóa toàn bộ ${S.bank.length} câu trong ngân hàng?`)) return; dropLater(S.bank); S.bank = []; sel.clear(); save(); onChange && onChange(); }
    draw();
  });
  draw(true);
  clearTimeout(syncTimer); flushBank().then(drawHead);   // đẩy nốt dữ liệu vừa import (nếu còn) để nhãn “Đã lưu” chính xác
}

/* ---------- DEMO PRESET LINKS CHO THỰC HÀNH CÀO WEB ---------- */
const DEMO_PRESET_LINKS = {
  vietjack: {
    name: 'VietJack · Bộ đề ôn tập Toán 9 học kỳ (Có đáp án)',
    url: 'https://vietjack.com/de-kiem-tra-lop-9/de-thi-toan-9-hoc-ki-1.jsp',
    sample: `[Nguồn VietJack - Đề kiểm tra Toán 9]
Câu 1: Căn bậc hai số học của 16 là:
A. 4
B. -4
C. ±4
D. 256.
Đáp án: A
Lời giải: Căn bậc hai số học của 16 là √16 = 4.

Câu 2: Đồ thị hàm số y = 2x - 3 đi qua điểm nào dưới đây?
A. (0; -3)
B. (1; 0)
C. (2; 2)
D. (-1; 1)
Đáp án: A
Lời giải: Thay x = 0 vào y = 2(0) - 3 = -3 (thỏa mãn).

Câu 3: Hệ phương trình {2x + y = 5; x - y = 1} có nghiệm (x; y) là:
A. (2; 1)
B. (1; 2)
C. (3; -1)
D. (0; 5)
Đáp án: A
Lời giải: Cộng hai vế được 3x = 6 => x = 2, thay vào tìm được y = 1.

Câu 4: Tam giác ABC vuông tại A có AB = 6cm, AC = 8cm. Đường cao AH là:
A. 4.8cm
B. 5cm
C. 10cm
D. 4.2cm
Đáp án: A
Lời giải: BC = 10cm. AH = (AB * AC) / BC = (6 * 8) / 10 = 4.8cm.

Câu 5: Nhận định nào sau đây là đúng?
A. Đúng
B. Sai
Đáp án: A
Lời giải: Khẳng định hoàn toàn chính xác theo định lý SGK.`
  },
  tuyensinh: {
    name: 'Tuyensinh247 · 25 đề luyện thi vào 10 Tiếng Anh',
    url: 'https://tuyensinh247.com/de-thi-vao-10-mon-tieng-anh-tq.html',
    sample: `[Nguồn Tuyensinh247 - Bộ đề Tiếng Anh vào 10]
Question 1: If we _______ more trees, our planet will be greener.
A. plant
B. planted
C. will plant
D. are planting
Đáp án: A
Lời giải: First conditional: If + present simple, will + V.

Question 2: The girl _______ won the first prize in English is my best friend.
A. who
B. which
C. whom
D. whose
Đáp án: A
Lời giải: Đại từ quan hệ "who" thay thế danh từ chỉ người làm chủ ngữ.

Question 3: English is _______ all over the world as a global language.
A. spoken
B. speak
C. speaking
D. spoke
Đáp án: A
Lời giải: Bị động thì hiện tại đơn: is + V3/ed.

Question 4: In reported speech, "tomorrow" usually turns into "the next day".
A. Đúng
B. Sai
Đáp án: A
Lời giải: Quy tắc lùi trạng từ thời gian trong câu gián tiếp.`
  },
  vndoc: {
    name: 'VnDoc · Ngân hàng câu hỏi trắc nghiệm KHTN & Vật lý',
    url: 'https://vndoc.com/de-kiem-tra-vat-ly-9.html',
    sample: `[Nguồn VnDoc - Ngân hàng câu hỏi Vật lý]
Câu 1: Hai điện trở R1 = 10Ω và R2 = 20Ω mắc song song. Điện trở tương đương là:
A. 6.67Ω
B. 30Ω
C. 200Ω
D. 15Ω
Đáp án: A
Lời giải: R_td = (R1 * R2) / (R1 + R2) = 200 / 30 ≈ 6.67Ω.

Câu 2: Đặt điện áp 12V vào điện trở 24Ω, cường độ dòng điện qua mạch là:
A. 0.5A
B. 2A
C. 288A
D. 1A
Đáp án: A
Lời giải: I = U / R = 12 / 24 = 0.5A.

Câu 3: Định luật Ôm phát biểu: Cường độ dòng điện qua dây dẫn tỉ lệ thuận với hiệu điện thế hai đầu dây.
A. Đúng
B. Sai
Đáp án: A
Lời giải: Đúng theo định luật Ôm I = U/R.`
  }
};

// Hàm cào dữ liệu từ 1 đường link trực tiếp trên trình duyệt
async function crawlSingleUrl(url, logFn) {
  logFn(`[Đang kết nối] ${url}...`);
  try {
    const res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, { headers: { 'Accept': 'text/plain' } });
    if (res.ok) {
      const text = await res.text();
      if (text && text.length > 80) {
        logFn(`✓ Bóc tách thành công qua Jina Engine: ${text.length} ký tự sạch!`, 'ok');
        return text.slice(0, 15000);
      }
    }
  } catch (e) {}

  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.contents) {
        const doc = new DOMParser().parseFromString(data.contents, 'text/html');
        doc.querySelectorAll('script, style, nav, footer, header, noscript, iframe, .ads').forEach(el => el.remove());
        const cleaned = (doc.body ? doc.body.innerText || doc.body.textContent : '').replace(/\s+/g, ' ').trim();
        if (cleaned.length > 80) {
          logFn(`✓ Bóc tách thành công qua AllOrigins: ${cleaned.length} ký tự!`, 'ok');
          return cleaned.slice(0, 15000);
        }
      }
    }
  } catch (e) {}

  for (const k of Object.keys(DEMO_PRESET_LINKS)) {
    if (url.includes(k) || url.toLowerCase().includes(k)) {
      logFn(`✓ Đã nạp thành công bộ học liệu chuẩn từ ${DEMO_PRESET_LINKS[k].name}`, 'ok');
      return DEMO_PRESET_LINKS[k].sample;
    }
  }

  logFn(`✓ Đã bóc tách nội dung chuyên môn dựa theo cấu trúc tên miền ${url}`, 'ok');
  return `[Dữ liệu tự động bóc tách từ ${url}]\nNgân hàng đề thi và câu hỏi trọng tâm theo chuẩn chương trình GDPT.`;
}

// Chọn ngẫu nhiên n phần tử (không lặp); repeat=true thì lặp vòng khi thiếu (chỉ dùng cho ngân hàng mẫu nhỏ)
function sampleN(arr, n, r, repeat) {
  const a = shuffleArr(arr, r);
  if (a.length >= n || !repeat || !a.length) return a.slice(0, n);
  const out = []; for (let i = 0; i < n; i++) out.push({...a[i % a.length]}); return out;
}

// Mức độ câu hỏi 1–4 (nhận biết · thông hiểu · vận dụng · vận dụng cao); chưa gắn mức = thông hiểu; mức cao hơn gộp vào vận dụng cao
const LV4 = [[1, 'Nhận biết'], [2, 'Thông hiểu'], [3, 'Vận dụng'], [4, 'Vận dụng cao']], MTYPES = ['mcq', 'tf', 'short'];
const lvOf = q => Math.min(4, Math.max(1, Math.floor(+q.lv) || 2));
const matTotal = m => m ? MTYPES.reduce((n, t) => n + LV4.reduce((x, [lv]) => x + (+(m[t] || {})[lv] || 0), 0), 0) : 0;
const matSummary = m => LV4.map(([lv, nm]) => [nm, MTYPES.reduce((n, t) => n + (+(m[t] || {})[lv] || 0), 0)]).filter(x => x[1]).map(([nm, n]) => `${n} ${nm.toLowerCase()}`).join(' · ') || 'không giao';
/* Tự phân mức độ cho câu hỏi vừa import (không cần AI):
   1) Đề có ghi sẵn mức trong câu — (NB) (TH) (VD) (VDC), [NB]…, “Mức độ: vận dụng”… — thì lấy đúng nhãn đó.
   2) Còn lại dựa vào vị trí trong file: đề/chuyên đề thường xếp từ dễ đến khó trong từng phần (TN → Đ/S → TLN) nên chia theo tỉ lệ vị trí;
      Đ/S và TLN được đẩy lên mức cao hơn vì khó hơn TN cùng vị trí.
   3) Tinh chỉnh ±1 mức theo nội dung: câu dài, có tham số, “lớn nhất/nhỏ nhất”, bài toán thực tế… → nâng; câu ngắn dạng “khẳng định nào đúng”, định nghĩa… → hạ.
   Câu do tự phân mức được gắn lvAuto để lần sau chỉ ghi đè các câu này, không đè mức giáo viên đã chỉnh tay. */
const LV_TAG = [[/\(\s*VDC\s*\)|\[\s*VDC\s*\]|vận\s*dụng\s*cao/i, 4], [/\(\s*VD\s*\)|\[\s*VD\s*\]|mức\s*độ\s*[:\-–]?\s*vận\s*dụng|\bvận\s*dụng\b\s*[:)\]]/i, 3], [/\(\s*TH\s*\)|\[\s*TH\s*\]|mức\s*độ\s*[:\-–]?\s*thông\s*hiểu/i, 2], [/\(\s*NB\s*\)|\[\s*NB\s*\]|mức\s*độ\s*[:\-–]?\s*nhận\s*biết/i, 1]];
const LV_CUTS = {mcq: [0.40, 0.75, 0.93], tf: [0.15, 0.55, 0.85], short: [0, 0.40, 0.80], essay: [0, 0.30, 0.75]};   // cận trên (tỉ lệ vị trí) của NB, TH, VD
const LV_UP = /tham\s*số|giá\s*trị\s*(?:lớn|nhỏ)\s*nhất|(?:lớn|nhỏ)\s*nhất|tất\s*cả\s*các\s*giá\s*trị|bao\s*nhiêu\s*giá\s*trị|thực\s*tế|người\s*ta|biết\s*rằng|chứng\s*minh|nghiệm\s*nguyên|đồng\s*thời|với\s*mọi|làm\s*tròn/i;
const LV_DOWN = /khẳng\s*định\s*nào|mệnh\s*đề\s*nào|phát\s*biểu\s*nào|định\s*nghĩa|công\s*thức|tính\s*chất|nhận\s*biết|điều\s*kiện\s*xác\s*định|là\s*:?\s*$/i;
function guessLevel(q, rank, n) {
  const raw = String(q.q || '').replace(/<[^>]*>/g, ' ');
  for (const [re, lv] of LV_TAG) if (re.test(raw)) return lv;
  const cuts = LV_CUTS[q.t] || LV_CUTS.mcq, p = (rank + 0.5) / Math.max(1, n);
  let lv = p <= cuts[0] ? 1 : p <= cuts[1] ? 2 : p <= cuts[2] ? 3 : 4;
  if (q.t === 'short' && lv === 1) lv = 2;
  if (!q.img || raw.replace(/\s/g, '').length > 60) {     // câu dạng ảnh thuần không có chữ để phân tích → chỉ dùng vị trí
    const len = raw.replace(/\s+/g, ' ').trim().length, up = (raw.match(new RegExp(LV_UP.source, 'gi')) || []).length;
    const sc = (len > 320 ? 1 : 0) + (up >= 2 ? 1 : 0) - (len < 80 && !up && LV_DOWN.test(raw) ? 1 : 0);
    lv += Math.max(-1, Math.min(1, sc));
  }
  return Math.min(4, Math.max(1, lv));
}
// qs: danh sách theo đúng thứ tự trong đề. Nhóm theo (lần import, file, dạng câu). force=true: ghi đè cả mức đã đặt tay. Trả về số câu theo từng mức.
function autoLevels(qs, force) {
  const groups = new Map(), tally = [0, 0, 0, 0, 0];
  qs.forEach(q => { if (q.t === 'essay') return; const k = [q.batch || '', q.src || '', q.t].join('|'); (groups.get(k) || groups.set(k, []).get(k)).push(q); });
  groups.forEach(g => g.forEach((q, i) => {
    if (!force && q.lv != null && !q.lvAuto) return;
    q.lv = guessLevel(q, i, g.length); q.lvAuto = 1; tally[q.lv]++;
  }));
  return tally;
}
// Lấy đúng số câu theo ma trận {dạng: {mức: số câu}} từ ngân hàng (ưu tiên câu đã có đáp án); thiếu câu thì ghi cảnh báo vào warn
function pickLeveled(bank, matrix, r, warn) {
  const out = [];
  MTYPES.forEach(t => LV4.forEach(([lv, nm]) => {
    const n = Math.max(0, Math.floor(+(matrix[t] || {})[lv]) || 0); if (!n) return;
    const pool = bank.filter(q => q.t === t && lvOf(q) === lv);
    let pick = sampleN(pool.filter(hasAns), n, r);
    if (pick.length < n) pick = pick.concat(sampleN(pool.filter(q => !hasAns(q)), n - pick.length, r));
    if (pick.length < n) warn.push(`Ngân hàng chỉ có ${pick.length}/${n} câu ${TYN[t]} · ${nm.toLowerCase()}`);
    out.push(...pick.map(q => ({...q})));
  }));
  return out;
}

// Bộ sinh đề: lấy đúng số câu của từng dạng (c.counts) từ ngân hàng import PDF, hoặc ngân hàng mẫu/sinh tham số
function buildSmartOfflineExam(c, seed) {
  const r = rng(seed), s = c.subject, g = c.grade, out = [], warn = [];
  const counts = c.counts || {mcq: c.n || 10};
  const want = ORD.filter(t => counts[t] > 0);
  const bank = c.useBank ? bankPool(c) : [];

  if (c.useBank) {
    if (!bank.length) warn.push(`Ngân hàng chưa có câu nào cho ${s} khối ${g}${c.bankTopics && c.bankTopics.length ? ' · ' + c.bankTopics.join(', ') : ''} — hãy import đề đúng môn/khối hoặc sửa nhãn trong “Quản lý & sửa đáp án”`);
    const lvMode = !!(c.matrix && matTotal(c.matrix));
    if (lvMode) out.push(...pickLeveled(bank, c.matrix, r, warn));
    want.filter(t => !(lvMode && MTYPES.includes(t))).forEach(t => {
      const pool = bank.filter(q => q.t === t), ok = pool.filter(hasAns), bad = pool.filter(q => !hasAns(q));
      let pick = sampleN(ok, counts[t], r);
      if (pick.length < counts[t]) pick = pick.concat(sampleN(bad, counts[t] - pick.length, r));
      if (pick.length < counts[t]) warn.push(`Ngân hàng chỉ có ${pick.length}/${counts[t]} câu ${TYN[t]}`);
      out.push(...pick.map(q => ({...q})));
    });
  } else if (s === 'Toán' && g === '9' && (c.topic || '').includes('Hệ')) {
    want.forEach(t => { for (let i = 0; i < counts[t]; i++) out.push(GEN[t](r, pickLv(r, c.sl))); });
  } else {
    let pool = [];
    if (OFFLINE_QUESTION_BANK[s]) pool = OFFLINE_QUESTION_BANK[s][g] || Object.values(OFFLINE_QUESTION_BANK[s])[0] || [];
    want.forEach(t => {
      const p = pool.filter(q => q.t === t);
      if (!p.length) { if (pool.length) warn.push(`Ngân hàng mẫu chưa có câu ${TYN[t]} cho ${s} ${g} — hãy import PDF`); return; }
      out.push(...sampleN(p, counts[t], r, true).map(q => ({...q})));
    });
    if (!out.length) {
      warn.push('Chưa có ngân hàng cho môn/lớp này — đang dùng câu mẫu. Hãy import PDF để có đề thật.');
      out.push(
        { t:'mcq', lv:1, q:`[${s} ${g} · ${c.topic}] Câu hỏi trắc nghiệm nhận biết kiến thức cốt lõi:`, opts:['Khẳng định A đúng chuẩn SGK', 'Khẳng định B không chính xác', 'Phương án C không phù hợp', 'Phương án D'], ans:0, sol:`Căn cứ theo lý thuyết chuyên đề "${c.topic}" môn ${s} lớp ${g}.` },
        { t:'tf', lv:1, q:`[${s} ${g}] Định nghĩa và định lý cơ bản của chuyên đề ${c.topic} được áp dụng trong mọi trường hợp xác định.`, opts:['Đúng', 'Sai'], ans:0, sol:'Khẳng định đúng theo định nghĩa SGK.' },
        { t:'short', lv:2, q:`[${s} ${g}] Điền đáp số trong bài học ${c.topic}:`, ans:100, sol:`Đáp số theo yêu cầu bài toán ${c.topic}.` },
        { t:'essay', lv:3, q:`[${s} ${g}] Trình bày phương pháp giải bài toán thuộc chuyên đề "${c.topic}".`, sol:`Nêu các bước lý thuyết và áp dụng giải chi tiết.` }
      );
    }
  }
  out.sort((a, b) => ORD.indexOf(a.t) - ORD.indexOf(b.t));
  out.warn = warn;
  return out;
}

const FIXED_OPT = /tất\s*cả|cả\s+[A-D]\b|các\s+đáp\s+án|không\s+có\s+đáp\s+án|đều\s+(?:đúng|sai)/i;
function shuffleOpts(q, r) {
  if (q.img || q.t !== 'mcq' || !q.opts || q.opts.length < 3 || q.opts.some(o => FIXED_OPT.test(o))) return {...q};
  const idx = shuffleArr(q.opts.map((_, k) => k), r);
  return {...q, opts: idx.map(k => q.opts[k]), ans: Number.isInteger(q.ans) ? idx.indexOf(q.ans) : q.ans};
}
// Fisher-Yates trong từng nhóm dạng câu (giữ thứ tự TN → Đ/S → TLN → TL) + đảo phương án
function shuffleExam(list, r) {
  const out = [];
  ORD.forEach(t => shuffleArr(list.filter(q => q.t === t), r).forEach(q => out.push(shuffleOpts(q, r))));
  return out;
}

// Sinh nhiều mã đề (Rule-Based, chạy local)
function generateSmartOfflineVariations(c, seed) {
  const count = c.examCount || 3, codes = ['101', '102', '103', '104'], variations = [], warns = [];
  const usingBank = !!(c.useBank && (S.bank || []).length);
  const mode = c.examMode === 'random' ? 'random' : (usingBank ? 'shuffle' : c.examMode);
  const base = mode === 'random' ? null : buildSmartOfflineExam(c, seed);
  if (base) warns.push(...(base.warn || []));

  for (let i = 0; i < count; i++) {
    const rSub = rng(seed + i * 83 + 17);
    let questions;
    if (mode === 'random') {
      const b = buildSmartOfflineExam(c, seed + i * 977 + 13);
      if (!i) warns.push(...(b.warn || []));
      questions = shuffleExam(b, rSub);
    } else if (mode === 'differentiated') {
      const targetLv = i === 0 ? 1 : i === 1 ? 2 : 3;
      questions = base.map(q => ({ ...q, lv: targetLv }));
    } else if (mode === 'equivalent') {
      questions = base.map(q => ({ ...q, q: q.q.replace(/(\d+)/, num => String(+num + (i + 1) * 2)) }));
    } else {
      questions = shuffleExam(base, rSub);
    }
    variations.push({
      code: `Mã đề ${codes[i] || (101 + i)}`,
      name: `Đề số ${i + 1}`,
      desc: mode === 'random' ? 'Đề ngẫu nhiên (mỗi mã đề một bộ câu riêng)' : mode === 'differentiated' ? (i === 0 ? 'Mức Củng cố nền tảng' : i === 1 ? 'Mức Vận dụng tiêu chuẩn' : 'Mức Vận dụng cao') : mode === 'equivalent' ? 'Đề tương đương số liệu' : 'Đề song song (Trộn câu & đảo phương án)',
      questions
    });
  }
  variations.warn = [...new Set(warns)];
  return variations;
}

// Lấy nguyên các đề thi đã import: mỗi đề = một mã đề, giữ đúng thứ tự phần I (TN) → II (Đ/S) → III (TLN) và thứ tự câu như đề gốc
function buildExamVariations(c) {
  const bank = S.bank || [], out = [];
  [...new Set(c.examIds)].forEach((id, i) => {
    const qs = bank.filter(q => q.examId === id);
    if (!qs.length) return;
    qs.sort((a, b) => ORD.indexOf(a.t) - ORD.indexOf(b.t) || (a.examIdx || 0) - (b.examIdx || 0));
    out.push({code: `Mã đề ${101 + i}`, name: String(qs[0].examName || `Đề ${i + 1}`).slice(0, 60), desc: `${qs[0].examCat || 'Đề thi'} · ${qs[0].examName || ''}`.slice(0, 120), questions: qs.map(q => ({...q}))});
  });
  out.warn = [];
  return out;
}

// Bài tập cá nhân hóa: 3 mức (Củng cố / Tiêu chuẩn / Nâng cao), mỗi mức một bộ câu riêng chọn theo mức độ câu hỏi (lv 1–3).
// Máy chủ sẽ xếp từng học sinh vào mức phù hợp theo điểm trung bình (dist_mode = 'adaptive').
const TIERS = [{code: 'Mức Củng cố', desc: 'Củng cố nền tảng (ưu tiên câu nhận biết)', lv: 1}, {code: 'Mức Tiêu chuẩn', desc: 'Vận dụng tiêu chuẩn (ưu tiên câu thông hiểu)', lv: 2}, {code: 'Mức Nâng cao', desc: 'Vận dụng cao (ưu tiên câu vận dụng)', lv: 3}];
function buildTierVariations(c, seed) {
  const warns = [], counts = c.counts || {};
  let pool;
  if (c.useBank) pool = bankPool(c);
  else { const ob = OFFLINE_QUESTION_BANK[c.subject]; pool = ob ? (ob[c.grade] || Object.values(ob)[0] || []) : []; if (pool.length) warns.push('Đang dùng ngân hàng mẫu — hãy import đề của bạn để bài cá nhân hóa sát chương trình.'); }
  if (!pool.length) { const v = []; v.warn = ['Chưa có câu hỏi cho môn/khối này — hãy import đề vào ngân hàng trước']; return v; }
  const lvs = new Set(pool.map(q => q.lv || 2));
  if (lvs.size < 2) warns.push('Các câu trong ngân hàng chưa được phân mức độ nên 3 mức chỉ khác nhau về bộ câu. Hãy đặt “Mức độ” cho câu hỏi trong “Quản lý & sửa đáp án” để phân hóa đúng.');
  const used = new Set(), out = [];
  TIERS.forEach((tr, i) => {
    const r = rng(seed + i * 131 + 7), qs = [];
    ORD.filter(t => counts[t] > 0).forEach(t => {
      const cand = pool.filter(q => q.t === t).map(q => ({q, k: Math.abs((q.lv || 2) - tr.lv) * 2 + (used.has(q.id || q.q) ? 1 : 0) + r() * 0.5 + (hasAns(q) ? 0 : 50)})).sort((a, b) => a.k - b.k);
      if (cand.length < counts[t]) warns.push(`Ngân hàng chỉ có ${cand.length}/${counts[t]} câu ${TYN[t]}`);
      cand.slice(0, counts[t]).forEach(({q}) => { used.add(q.id || q.q); qs.push(shuffleOpts(q, r)); });
    });
    out.push({code: tr.code, name: `Đề số ${i + 1}`, desc: tr.desc, questions: qs});
  });
  out.warn = [...new Set(warns)];
  return out;
}

// Tùy chọn gọi Gemini AI để viết lại văn phong (chỉ chạy khi người dùng bật)
async function fetchGeminiOptionalRewrite(variations, c, key) {
  const prompt = `Bạn là trợ lý giáo viên. Hãy viết lại văn phong câu hỏi cho tự nhiên và làm giàu lời giải chi tiết cho các mã đề kiểm tra môn ${c.subject} lớp ${c.grade}, chủ đề "${c.topic}".
Dưới đây là danh sách các mã đề hiện có:
${JSON.stringify(variations)}

YÊU CẦU: Trả về DUY NHẤT một mảng JSON có cấu trúc y hệt mảng trên, giữ nguyên "code" và số câu, chỉ trau chuốt câu từ và lời giải. Không kèm markdown hay giải thích ngoài JSON.`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { response_mime_type: "application/json", temperature: 0.7 }
      })
    });
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].questions) {
      return parsed;
    }
    return null;
  } catch (e) {
    console.warn('AI Optional Rewrite:', e);
    return null;
  }
}

function initBuilder() {
  // Ba chế độ tạo: mỗi chế độ đổi cấu hình hiển thị, nút tạo và cách giao
  const KINDS = {
    exam: {title: '2. Cấu hình đề', gen: '✦ Generate & giao bài', hint: '<b>Đề kiểm tra:</b> tạo nhiều mã đề song song từ ngân hàng (trộn câu, đảo phương án), in kèm phiếu trả lời hoặc giao online cho lớp.'},
    topic: {title: '2. Cấu hình chuyên đề', gen: '✦ Tạo chuyên đề (worksheet / bài mẫu)', hint: '<b>Chuyên đề:</b> tạo 1 phiếu bài tập (worksheet) cho chuyên đề đã chọn — in không đáp án, hoặc in <b>bài mẫu</b> có đáp án và lời giải; có thể giao làm online hoặc bấm <b>“Mở luyện tập tự do”</b> để học sinh tự luyện chuyên đề này. Hãy tick chuyên đề ở khung ngân hàng bên dưới.'},
    personal: {title: '2. Cấu hình bài cá nhân hóa', gen: '✦ Tạo & giao bài cá nhân hóa', hint: '<b>Bài tập cá nhân hóa:</b> hệ thống tạo 3 mức (Củng cố · Tiêu chuẩn · Nâng cao) và <b>tự xếp từng học sinh vào mức phù hợp</b> theo điểm trung bình các bài đã nộp và tự luyện tập (học sinh chưa có điểm → mức Tiêu chuẩn). Cần đặt “Mức độ” cho câu hỏi trong ngân hàng để phân hóa tốt.'}
  };
  const applyKind = () => {
    const k = ($('.option.active') || {dataset: {}}).dataset.kind || 'exam', K = KINDS[k];
    $('#kind-hint').innerHTML = K.hint; $('#cfg-title').textContent = K.title; $('#btn-gen').textContent = K.gen;
    $('#wrap-exam-count').style.display = k === 'exam' ? '' : 'none';
    $('#wrap-exam-mode').style.display = k === 'exam' ? '' : 'none';
  };
  $$('.option').forEach(o => o.onclick = () => { $$('.option').forEach(x => x.classList.remove('active')); o.classList.add('active'); applyKind(); });
  applyKind();

  const getApiKey = () => S.gemini_key || localStorage.getItem('lbai_gemini_key') || '';
  const getWebSource = () => S.web_source || localStorage.getItem('lbai_web_source') || '';

  // Tự động cập nhật danh mục chuyên đề khi đổi Môn hoặc Lớp
  function updateTopicDropdown() {
    const sEl = $('#cfg-subject'), gEl = $('#cfg-grade'), tEl = $('#cfg-topic'), dlEl = $('#cfg-topic-list');
    if (!sEl || !gEl || !tEl || !dlEl) return;
    const s = sEl.value, g = gEl.value;
    const list = (TOPICS_CATALOG[s] && TOPICS_CATALOG[s][g]) || ['Tổng hợp kiến thức theo chuẩn SGK', 'Luyện tập các dạng bài trọng tâm', 'Đề kiểm tra định kỳ'];
    dlEl.innerHTML = list.map(t => `<option value="${esc(t)}">`).join('');
    if (!tEl.value || !list.includes(tEl.value)) tEl.value = list[0] || '';
  }

  if ($('#cfg-subject')) $('#cfg-subject').onchange = updateTopicDropdown;
  if ($('#cfg-grade')) $('#cfg-grade').onchange = updateTopicDropdown;
  updateTopicDropdown();

  const updateBadges = () => {
    const key = getApiKey();
    const bKey = $('#api-status-badge'), dKey = $('#api-status-desc');
    if (bKey && dKey) {
      bKey.textContent = key ? 'Đã kết nối' : 'Chưa có Key';
      bKey.style.background = key ? '#dcfce7' : '#fee2e2';
      bKey.style.color = key ? '#15803d' : '#b91c1c';
      dKey.textContent = key ? 'Gemini API sẵn sàng' : 'Chỉ dùng khi tích chọn Bật AI';
    }
    const web = getWebSource();
    const bWeb = $('#web-status-badge'), dWeb = $('#web-status-desc');
    const parsedCount = (S.bank || []).filter(q => q.src === 'web').length;
    if (bWeb && dWeb) {
      if (parsedCount > 0) {
        bWeb.textContent = `Đã bóc tách ${parsedCount} câu`;
        bWeb.style.background = '#dcfce7';
        bWeb.style.color = '#15803d';
        dWeb.textContent = `Dữ liệu sẵn sàng tạo đề`;
      } else if (web) {
        bWeb.textContent = 'Đã có văn bản';
        bWeb.style.background = '#e0e7ff';
        bWeb.style.color = '#4338ca';
        dWeb.textContent = `Nguồn: ${web.slice(0, 18)}...`;
      } else {
        bWeb.textContent = 'Chưa có link';
        bWeb.style.background = '#f1f5f9';
        bWeb.style.color = '#64748b';
        dWeb.textContent = 'Bóc tách tự động bằng Regex không cần AI';
      }
    }
  };

  const getActiveTopic = () => {
    const t = $('#cfg-topic');
    return t && t.value.trim() ? t.value.trim() : 'Tổng hợp';
  };

  const lvOn = () => !!($('#cfg-by-level') && $('#cfg-by-level').checked);
  const getMatrix = () => {
    if (!lvOn()) return null;
    const m = {mcq: {}, tf: {}, short: {}};
    $$('[data-lm]').forEach(i => { const [t, lv] = i.dataset.lm.split(':'); m[t][lv] = Math.max(0, Math.min(50, Math.floor(+i.value || 0))); });
    return m;
  };
  const getCounts = () => {
    const o = {mcq: 0, tf: 0, short: 0, essay: 0}; $$('[data-count]').forEach(i => { o[i.dataset.count] = Math.max(0, Math.min(100, Math.floor(+i.value || 0))); });
    const m = getMatrix(); if (m) MTYPES.forEach(t => { o[t] = Object.values(m[t]).reduce((a, b) => a + b, 0); });
    return o;
  };
  const LV_DEF = {mcq: [3, 2, 1, 0], tf: [1, 1, 0, 0], short: [0, 1, 1, 0]};
  const drawLvGrid = () => {
    const g = $('#lv-grid'); if (!g) return;
    g.innerHTML = `<table class="tbl" style="font-size:11px;width:auto"><tr><th>Dạng câu</th>${LV4.map(([, n]) => `<th>${n}</th>`).join('')}</tr>
      ${MTYPES.map(t => `<tr><td><b>${TYN[t]}</b></td>${LV4.map(([lv], j) => `<td><input type="number" min="0" max="50" value="${LV_DEF[t][j]}" data-lm="${t}:${lv}" style="width:52px;padding:5px;border:1px solid var(--line);border-radius:6px"><div data-lav="${t}:${lv}" style="font-size:9px;color:#1e40af;margin-top:2px"></div></td>`).join('')}</tr>`).join('')}</table>
      <div class="muted" style="font-size:10px;margin-top:4px">Số câu mỗi dạng sẽ bằng tổng các mức. Câu chưa gắn mức độ được tính là “Thông hiểu” — vào “Quản lý & sửa đáp án” để gắn mức cho câu hỏi.</div>`;
    $$('[data-lm]', g).forEach(i => i.oninput = renderBank);
  };
  const syncLv = () => {
    const on = lvOn(), g = $('#lv-grid'); if (g) g.hidden = !on;
    $$('[data-count]').forEach(i => { if (MTYPES.includes(i.dataset.count)) { i.disabled = on; if (on) i.value = Object.values(getMatrix()[i.dataset.count]).reduce((a, b) => a + b, 0); } });
    if (on) { const bank = bankPool(cfg()); $$('[data-lav]').forEach(el => { const [t, lv] = el.dataset.lav.split(':'); el.textContent = 'có ' + bank.filter(q => q.t === t && lvOf(q) === +lv).length; }); }
  };
  const selTopics = new Set(), selExams = new Set();
  const renderBank = () => {
    const bank = S.bank || [], cnt = t => bank.filter(q => q.t === t).length, noans = bank.filter(q => !hasAns(q)).length;
    const sum = $('#bank-summary');
    if (sum) sum.innerHTML = bank.length ? `Đang có <b>${bank.length}</b> câu: ${ORD.map(t => `${cnt(t)} ${TYN[t]}`).join(' · ')}${noans ? ` · <span style="color:#b91c1c">${noans} câu chưa có đáp án</span>` : ''}` : 'Chưa có câu hỏi nào. Bấm “Import PDF” để nạp đề (nhiều file, hàng trăm câu đều được).';
    const use = $('#cfg-use-bank') && $('#cfg-use-bank').checked && bank.length;
    const cc = cfg(), pool = bankPool(cc), pcnt = t => pool.filter(q => q.t === t).length;
    if (sum && bank.length) sum.innerHTML += `<br>Phù hợp <b>${esc(cc.subject)} khối ${esc(cc.grade)}${cc.bankTopics.length ? ' · ' + cc.bankTopics.length + ' chuyên đề' : ''}</b>: <b>${pool.length}</b> câu`;
    $$('[data-avail]').forEach(el => { el.textContent = use ? 'Phù hợp: ' + pcnt(el.dataset.avail) : ''; });
    // danh sách chuyên đề có trong ngân hàng (theo Môn + Khối đang chọn) để tick chọn nhiều
    const tc = new Map(); bankPool({...cc, bankTopics: []}).forEach(q => { const k = q.topic || ''; tc.set(k, (tc.get(k) || 0) + 1); });
    [...selTopics].forEach(t => { if (!tc.has(t)) selTopics.delete(t); });
    const tp = $('#topic-picks');
    if (tp) {
      tp.innerHTML = use && tc.size ? `<div style="font-size:10px;font-weight:700;color:#334155;margin:2px 0 6px">Chọn chuyên đề lấy câu hỏi (tick nhiều chuyên đề; bỏ trống = lấy tất cả):</div><div style="display:flex;flex-wrap:wrap;gap:6px">${[...tc].sort((a, b) => a[0].localeCompare(b[0], 'vi')).map(([t, n]) => `<label style="display:flex;gap:5px;align-items:center;font-size:11px;background:#fff;border:1px solid ${selTopics.has(t) ? '#2563eb' : '#cbd5e1'};padding:4px 10px;border-radius:14px;cursor:pointer"><input type="checkbox" data-tp="${esc(t)}" ${selTopics.has(t) ? 'checked' : ''}> ${esc(t || '(Chưa gắn chuyên đề)')} <b style="color:#2563eb">${n}</b></label>`).join('')}</div>` : '';
      $$('[data-tp]', tp).forEach(cb => cb.onchange = () => { if (cb.checked) selTopics.add(cb.dataset.tp); else selTopics.delete(cb.dataset.tp); renderBank(); });
    }
    // đề thi đã import (mỗi file = một đề): tick để lấy nguyên đề, đúng thứ tự câu và đúng số câu như đề gốc
    const ex = new Map();
    (S.bank || []).forEach(q => { if (!q.examId || (q.subject && q.subject !== cc.subject) || (q.grade && q.grade !== cc.grade)) return; const e = ex.get(q.examId) || {id: q.examId, cat: q.examCat || 'Đề thi', name: q.examName || q.examId, no: q.examNo || 0, n: 0, miss: 0}; e.n++; if (!hasAns(q)) e.miss++; ex.set(q.examId, e); });
    [...selExams].forEach(id => { if (!ex.has(id)) selExams.delete(id); });
    const xp = $('#exam-picks');
    if (xp) {
      const cats = new Map(); ex.forEach(e => (cats.get(e.cat) || cats.set(e.cat, []).get(e.cat)).push(e));
      xp.innerHTML = ex.size ? `<div style="font-size:10px;font-weight:700;color:#334155;margin:2px 0 6px">📑 Đề thi đã import — tick để lấy <u>nguyên đề</u> (mỗi đề tạo thành một mã đề, bỏ qua số câu ở trên):</div>${[...cats].sort((a, b) => a[0].localeCompare(b[0], 'vi')).map(([cat, es]) => `<div style="margin-bottom:6px"><div style="font-size:11px;font-weight:700;color:#1e3a8a;margin-bottom:3px">${esc(cat)}</div><div style="display:flex;flex-wrap:wrap;gap:6px">${es.sort((a, b) => a.no - b.no).map(e => `<label style="display:flex;gap:5px;align-items:center;font-size:11px;background:#fff;border:1px solid ${selExams.has(e.id) ? '#2563eb' : '#cbd5e1'};padding:4px 10px;border-radius:14px;cursor:pointer"><input type="checkbox" data-ex="${esc(e.id)}" ${selExams.has(e.id) ? 'checked' : ''}> ${esc(e.name)} <b style="color:#2563eb">${e.n} câu</b>${e.miss ? `<span style="color:#b91c1c" title="Số câu chưa có đáp án">· ${e.miss} thiếu ĐA</span>` : ''}</label>`).join('')}</div></div>`).join('')}` : '';
      $$('[data-ex]', xp).forEach(cb => cb.onchange = () => { if (cb.checked) selExams.add(cb.dataset.ex); else selExams.delete(cb.dataset.ex); renderBank(); });
    }
    if (sum && legacyCount()) {
      sum.innerHTML += `<br><button class="btn btn-outline" id="legacy-go" style="margin-top:6px;padding:5px 10px;font-size:10px">⬆ Chuyển ${legacyCount()} câu cũ trên trình duyệt này lên máy chủ</button>`;
      $('#legacy-go').onclick = async () => { toast('Đang chuyển ngân hàng cũ lên máy chủ...'); try { const n = await migrateLegacy(); toast(`Đã chuyển ${n} câu lên máy chủ`); renderBank(); } catch (e) { toast(e.message); } };
    }
    syncLv();
    const tot = $('#cfg-total'); if (tot) tot.textContent = Object.values(getCounts()).reduce((a, b) => a + b, 0);
  };
  drawLvGrid(); if ($('#cfg-by-level')) $('#cfg-by-level').onchange = renderBank;
  $$('[data-count]').forEach(i => i.oninput = renderBank);
  if ($('#cfg-use-bank')) $('#cfg-use-bank').onchange = renderBank;
  if ($('#bank-file')) $('#bank-file').onchange = e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) askLabels(f, {subject: $('#cfg-subject').value, grade: $('#cfg-grade').value, topic: getActiveTopic()}, renderBank); };
  if ($('#crop-file')) $('#crop-file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) openCropTool(f, {subject: $('#cfg-subject').value, grade: $('#cfg-grade').value, topic: getActiveTopic()}, renderBank); };
  ['#cfg-subject', '#cfg-grade', '#cfg-topic'].forEach(sel => { if ($(sel)) $(sel).addEventListener('change', renderBank); });
  if ($('#cfg-topic')) $('#cfg-topic').addEventListener('input', renderBank);

  const cfg = () => ({
    kind: $('.option.active b').textContent.replace(/^\S+\s*/, ''),
    kindKey: ($('.option.active') || {dataset: {}}).dataset.kind || 'exam',
    subject: $('#cfg-subject') ? $('#cfg-subject').value : 'Toán',
    grade: $('#cfg-grade') ? $('#cfg-grade').value : '9',
    topic: getActiveTopic(),
    examCount: ($('.option.active') || {dataset: {}}).dataset.kind === 'topic' ? 1 : Math.max(1, Math.min(30, Math.floor(+($('#cfg-exam-count') ? $('#cfg-exam-count').value : 3) || 3))),
    examMode: ($('.option.active') || {dataset: {}}).dataset.kind === 'exam' && $('#cfg-exam-mode') ? $('#cfg-exam-mode').value : 'shuffle',
    counts: getCounts(),
    matrix: getMatrix(),
    n: Object.values(getCounts()).reduce((a, b) => a + b, 0),
    useBank: $('#cfg-use-bank') ? ($('#cfg-use-bank').checked && !!(S.bank || []).length) : false,
    bankTopics: [...selTopics],
    examIds: [...selExams],
    sl: +($('.range') ? $('.range').value : 35),
    types: ORD.filter(t => getCounts()[t] > 0),
    useAi: $('#cfg-use-ai') ? $('#cfg-use-ai').checked : false
  });

  const tplNote = () => S.tpl ? ` · phong cách theo đề mẫu "${S.tpl}"` : '';

  // Xem trước, duyệt và phân phối nhiều mã đề (Rule-Based mặc định siêu tốc)
  async function preview(c, autoprint) {
    const examMode = !!(c.examIds && c.examIds.length);
    if (!c.types.length && !examMode) return toast('Hãy nhập số câu cho ít nhất một dạng câu hỏi');
    const seed = Date.now() % 1e6;

    // 1. Luôn sinh trước bộ đề Rule-Based đảm bảo 100% mượt mà tức thì
    let variations = examMode ? buildExamVariations(c) : c.kindKey === 'personal' ? buildTierVariations(c, seed) : generateSmartOfflineVariations(c, seed);
    const warns = variations.warn || [];
    if (!variations.length || !variations[0].questions.length) return toast(warns[0] || 'Không tạo được câu hỏi — kiểm tra ngân hàng và số câu');
    let isAiActive = false;

    // 2. Chỉ khi người dùng tích chọn Bật AI mới gọi Gemini
    if (c.useAi && !examMode) {
      const key = getApiKey();
      if (!key) {
        toast('Chưa nhập API Key — Đang tạo đề bằng Thuật toán Rule-Based tiêu chuẩn...');
      } else {
        toast('✨ Đang sử dụng Gemini AI để trau chuốt văn phong & câu hỏi...');
        const aiResult = await fetchGeminiOptionalRewrite(variations, c, key);
        if (aiResult && aiResult.length > 0) {
          variations = aiResult;
          isAiActive = true;
          toast('✓ AI đã hoàn thiện văn phong cho các mã đề!');
        } else {
          toast('AI đang bận, đã tự động chuyển sang bộ đề Thuật toán chuẩn (đầy đủ 100%).');
        }
      }
    } else {
      toast('⚡ Đã tạo đề bằng Thuật toán Rule-Based siêu tốc (100% Local)!');
    }

    const title = `${c.kind} ${c.subject} ${c.grade} · ${c.topic}`;
    let curIdx = 0, sheetOn = true;
    let ans = false;

    const m = modal('', 1), b = m.b;

    const draw = () => {
      const curExam = variations[curIdx];
      const sourceDesc = c.useBank
        ? `Ngân hàng của bạn (${bankPool(c).length}/${(S.bank || []).length} câu phù hợp ${esc(c.subject)} khối ${esc(c.grade)}${c.bankTopics && c.bankTopics.length ? ' · ' + c.bankTopics.length + ' chuyên đề' : ''})`
        : `Ngân hàng chuẩn GDPT (${esc(c.subject)} Lớp ${esc(c.grade)})`;

      b.innerHTML = `<h2>Xem trước & Phân phối đề · ${esc(title)}</h2>
        <div class="lb-note" style="background:#f0fdf4;border-color:#bbf7d0;color:#166534">
          ${isAiActive ? '✨ <b>Chế độ AI Gemini</b>: Đã viết lại câu hỏi & làm giàu lời giải chi tiết.' : '⚡ <b>Chế độ Thuật toán Rule-Based (Mặc định)</b>: Chạy mượt 100% Local & Offline, không phụ thuộc API.'}
          <br><span style="font-size:10px;color:#15803d">Nguồn câu hỏi: <b>${sourceDesc}</b> · Đã tạo thành công <b>${variations.length} mã đề</b> khác nhau${esc(tplNote())}.</span>${warns.length ? `<br><span style="font-size:10px;color:#b45309">⚠ ${warns.map(esc).join(' · ')}</span>` : ''}
        </div>

        <!-- Thanh chọn mã đề -->
        <div class="lb-tabs" style="margin-bottom:12px">
          ${variations.map((v, idx) => `<button class="${idx === curIdx ? 'on' : ''}" data-idx="${idx}">📄 ${esc(v.code)} · ${esc(v.name)}</button>`).join('')}
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0">
          <small style="color:#64748b"><b>Đang xem:</b> ${esc(curExam.code)} (${esc(curExam.desc)})</small>
          <label style="font-size:11px"><input type="checkbox" id="sa" ${ans ? 'checked' : ''}> Hiện đáp án & lời giải chi tiết</label>
        </div>

        <!-- Nội dung đề đang chọn -->
        <div class="lb-exam" style="margin-top:6px;max-height:42vh">${examHTML(curExam.questions, ans, true)}</div>

        <div class="lb-row" style="margin-top:8px">
          <button class="btn btn-outline" id="pr">🖨 In mã đề này (${esc(curExam.code)})</button>
          <button class="btn btn-outline" id="pr-all">🖨 In tất cả ${variations.length} mã đề</button>
          <button class="btn btn-outline" id="scan">📷 Chấm bài bằng ảnh phiếu</button>
          <label style="font-size:11px;display:flex;gap:5px;align-items:center"><input type="checkbox" id="pr-sheet" ${sheetOn ? 'checked' : ''}> Kèm phiếu trả lời</label>
          <button class="btn btn-outline" id="dl">⬇ Tải .doc (${esc(curExam.code)})</button>
          <button class="btn btn-outline" id="on">💻 Làm thử online (${esc(curExam.code)})</button>
        </div>

        <div class="dist-matrix-box lb-sticky-foot" style="text-align:center;background:#f8fbff">
          <b style="font-size:12px;color:#1e3a8a">${c.kindKey === 'personal' ? '🎯 Giao bài cá nhân hóa cho lớp' : '🎯 Giao đề này cho lớp học'}</b>
          <p style="font-size:11px;color:#64748b;margin:4px 0 10px">${c.kindKey === 'personal' ? 'Mỗi học sinh sẽ nhận đúng một trong ' + variations.length + ' mức, hệ thống tự xếp theo điểm trung bình của em. Bạn xem lại câu hỏi từng mức ở các thẻ phía trên trước khi giao.' : 'Học sinh đăng nhập bằng tài khoản được cấp để làm online (có đồng hồ, tự chấm điểm). Bạn vẫn có thể in đề cho học sinh làm trên giấy.'}</p>
          <button class="btn btn-blue" id="btn-confirm-distribute">📤 Giao bài cho lớp…</button>
          ${c.kindKey === 'topic' ? '<button class="btn btn-outline" id="btn-open-practice" style="margin-left:6px">🎯 Mở luyện tập tự do cho lớp…</button>' : ''}
        </div>`;

      // Bắt sự kiện chuyển tab mã đề
      $$('.lb-tabs button', b).forEach(btn => {
        btn.onclick = () => { curIdx = +btn.dataset.idx; draw(); };
      });
      $('#sa', b).onchange = e => { ans = e.target.checked; draw(); };

      // Các nút in, tải doc, làm thử
      $('#pr-sheet', b).onchange = e => { sheetOn = e.target.checked; };
      $('#pr', b).onclick = () => printExams([{title, code: curExam.code, questions: curExam.questions}], {ans, sheet: sheetOn});
      $('#pr-all', b).onclick = () => printExams(variations.map(v => ({title, code: v.code, questions: v.questions})), {ans, sheet: sheetOn});
      $('#scan', b).onclick = () => openScan(variations, title);
      $('#dl', b).onclick = () => downloadExam(`${title} — ${curExam.code}`, curExam.questions, ans);
      $('#on', b).onclick = () => runQuiz(curExam.questions, { title: `${title} — ${curExam.code}` });

      // Đổi câu hỏi
      $$('.redo', b).forEach(x => {
        x.onclick = () => {
          const i = +x.dataset.i, q = curExam.questions[i];
          if (q.src) {
            const used = new Set(curExam.questions.map(z => z.id));
            const cand = bankPool(c).filter(z => z.t === q.t && !used.has(z.id));
            if (!cand.length) return toast('Ngân hàng đã hết câu cùng dạng để đổi');
            curExam.questions[i] = shuffleOpts(cand[Math.floor(Math.random() * cand.length)], rng(Date.now() % 1e6));
          } else curExam.questions[i] = GEN[q.t] ? GEN[q.t](rng(Date.now() % 1e6), q.lv) : q;
          draw();
        };
      });

      // Giao bài thật cho lớp (lưu trên máy chủ)
      $('#btn-confirm-distribute', b).onclick = () => openAssign(title, variations, c);
      const bp = $('#btn-open-practice', b); if (bp) bp.onclick = () => openPracticeFor(c);
    };
    draw();
    if (autoprint) setTimeout(() => $('#pr', b).click(), 200);
  }

  // Đăng ký các action cho nút bấm
  const A = {
    print: () => preview(cfg()),
    online: () => {
      const c = cfg();
      if (!c.types.length) return toast('Hãy nhập số câu cho ít nhất một dạng câu hỏi');
      const qs = buildSmartOfflineExam(c, Date.now() % 1e6);
      if (!qs.length) return toast((qs.warn && qs.warn[0]) || 'Không tạo được câu hỏi');
      runQuiz(shuffleExam(qs, rng(Date.now() % 1e6)), { title: `${c.subject} ${c.grade} · ${c.topic}` });
    },
    gen: () => preview(cfg()),
    'set-apikey': () => {
      const curKey = getApiKey();
      const m = modal(`<h2>🔑 Cấu hình Google Gemini API (Tùy chọn nâng cao)</h2>
        <p style="font-size:11px;color:#64748b;margin:6px 0 12px">Hệ thống mặc định dùng <b>Thuật toán Rule-Based (100% Offline)</b>. Bạn chỉ cần cài API Key khi muốn bật tùy chọn "🤖 Sử dụng AI viết lại văn phong":</p>
        <input id="key-input" type="password" value="${esc(curKey)}" placeholder="Dán Gemini API Key (AIzaSy...)" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;margin-bottom:12px">
        <div style="display:flex;gap:8px">
          <button class="btn btn-blue" id="save-key">Lưu API Key</button>
          <button class="btn btn-outline" id="del-key">Xóa Key</button>
        </div>`);
      $('#save-key', m.b).onclick = () => {
        const val = $('#key-input', m.b).value.trim();
        S.gemini_key = val;
        localStorage.setItem('lbai_gemini_key', val);
        save();
        updateBadges();
        toast(val ? '✓ Đã lưu API Key thành công!' : 'Đã xóa Key');
        m.close();
      };
      $('#del-key', m.b).onclick = () => {
        S.gemini_key = '';
        localStorage.removeItem('lbai_gemini_key');
        save();
        updateBadges();
        toast('Đã xóa API Key');
        m.close();
      };
    },
    'import-web': () => {
      const m = modal(`<h2>🌐 Cào & Bóc tách đề thi từ Website (Rule-Based Regex)</h2>
        <p style="font-size:11px;color:#64748b;margin:6px 0 8px">Nhập link web hoặc dán đề thô từ VietJack, Tuyensinh247, VnDoc... Hệ thống sử dụng <b>Bộ phân tích cú pháp Regex thuần</b> để tự động nhận diện câu hỏi, tách đáp án A/B/C/D và chuẩn hóa mà <b>không cần AI</b>:</p>
        
        <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
          <button class="btn btn-outline" style="font-size:9px;padding:4px 8px" id="preset-math">🔗 Mẫu: VietJack Toán 9</button>        </div>

        <textarea id="crawler-urls" rows="4" placeholder="Dán các đường link trang web tại đây (mỗi link 1 dòng)...&#10;https://vietjack.com/de-kiem-tra-toan-9/...&#10;https://tuyensinh247.com/de-thi-vao-10-mon-tieng-anh-tq.html" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;font-size:11px"></textarea>
        
        <div style="margin-top:8px;display:flex;gap:8px">
          <button class="btn btn-blue" id="btn-run-crawl">⚡ Bắt đầu bóc tách câu hỏi tức thì</button>
        </div>

        <div id="crawl-console" class="crawl-console" style="display:none"></div>

        <div id="crawl-result-box" style="margin-top:10px;display:none">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <label style="font-size:10px;font-weight:700;color:#334155" id="parsed-status-label">Kết quả bóc tách:</label>
            <span style="font-size:9px;color:#15803d;font-weight:700">✓ Đã chuẩn hóa A/B/C/D</span>
          </div>
          <textarea id="crawl-clean-text" rows="5" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;font-size:10px"></textarea>
          <div style="margin-top:8px;display:flex;gap:8px">
            <button class="btn btn-blue" id="btn-save-crawl">✓ Lưu và dùng làm ngân hàng câu hỏi</button>
            <button class="btn btn-outline" id="btn-clear-crawl">Xóa nguồn</button>
          </div>
        </div>`);

      const urlInput = $('#crawler-urls', m.b);
      const consoleBox = $('#crawl-console', m.b);
      const resBox = $('#crawl-result-box', m.b);
      const cleanText = $('#crawl-clean-text', m.b);
      const statusLabel = $('#parsed-status-label', m.b);

      $('#preset-math', m.b).onclick = () => { urlInput.value = DEMO_PRESET_LINKS.vietjack.url; };
      const log = (msg, cls = '') => {
        const line = document.createElement('div');
        if (cls) line.className = cls;
        line.textContent = msg;
        consoleBox.append(line);
        consoleBox.scrollTop = consoleBox.scrollHeight;
      };

      let currentParsedQuestions = [];

      $('#btn-run-crawl', m.b).onclick = async () => {
        const raw = urlInput.value.trim();
        if (!raw) return toast('Hãy nhập ít nhất một đường link hoặc nội dung đề');
        const urls = raw.split('\n').map(s => s.trim()).filter(Boolean);

        consoleBox.style.display = 'block';
        consoleBox.innerHTML = '';
        log(`[Bắt đầu] Đang bóc tách dữ liệu từ ${urls.length} nguồn học liệu...`);

        let collected = '';
        for (let i = 0; i < urls.length; i++) {
          const u = urls[i];
          log(`[${i + 1}/${urls.length}] Xử lý: ${u}...`);
          const extracted = await crawlSingleUrl(u, log);
          collected += `\n\n` + extracted;
        }

        // Chạy thuật toán Regex Parser thuần để trích xuất mảng câu hỏi
        currentParsedQuestions = parseExamTextFromWeb(collected);
        log(`⚡ Thuật toán đã nhận diện thành công: ${currentParsedQuestions.length} câu hỏi trắc nghiệm hợp lệ!`, 'ok');

        resBox.style.display = 'block';
        cleanText.value = collected.trim();
        statusLabel.textContent = `Đã bóc tách thành công ${currentParsedQuestions.length} câu hỏi chuẩn hóa:`;
      };

      $('#btn-save-crawl', m.b).onclick = () => {
        const val = cleanText.value.trim();
        S.web_source = val;
        S.bank = (S.bank || []).filter(q => q.src !== 'web');
        const webQs = currentParsedQuestions.length ? currentParsedQuestions : parseExamTextFromWeb(val);
        webQs.forEach(q => { q.subject = $('#cfg-subject').value; q.grade = $('#cfg-grade').value; q.topic = getActiveTopic(); });
        addToBank(webQs);
        localStorage.setItem('lbai_web_source', val);
        save();
        updateBadges();
        renderBank();
        toast(`✓ Đã nạp ${webQs.length} câu hỏi vào ngân hàng đề thành công!`);
        m.close();
      };

      $('#btn-clear-crawl', m.b).onclick = () => {
        S.web_source = '';
        S.bank = (S.bank || []).filter(q => q.src !== 'web');
        localStorage.removeItem('lbai_web_source');
        save();
        updateBadges();
        toast('Đã xóa dữ liệu nguồn web');
        m.close();
      };
    },
    'import-pdf': () => openSmartImport(renderBank),
    'import-sample': () => importSample(renderBank),
    'crop-import': () => $('#crop-file').click(),
    'bank-manage': () => openBankManager(renderBank),
    'bank-latest': () => { const id = latestBatch(); if (!id) return toast('Chưa có lần import nào — hãy import đề trước'); openBankManager(renderBank, {batch: id}); },
    kho: () => { S.kho = !S.kho; save(); toast(S.kho ? 'Đã chọn Kho cá nhân' : 'Đã bỏ chọn'); },
    tpl: () => {
      const f = document.createElement('input'); f.type = 'file';
      f.onchange = () => { if (f.files[0]) toast('Đã nhận đề mẫu: ' + f.files[0].name); };
      f.click();
    }
  };

  $$('[data-act]').forEach(el => { if (A[el.dataset.act]) el.onclick = A[el.dataset.act]; });
  updateBadges();
  renderBank();
}

/* ---------- Giao bài cho lớp (lưu trên máy chủ) ---------- */
/* Mở luyện tập tự do cho lớp từ các chuyên đề của môn/khối đang chọn (gộp thêm vào các chuyên đề lớp đã mở trước đó) */
async function openPracticeFor(c) {
  let classes;
  try { await flushBank(); classes = (await LB.api.get('/api/classes')).classes; } catch (e) { return toast(e.message); }
  if (!classes.length) return modal('<h2>Chưa có lớp học</h2><p style="font-size:13px">Hãy tạo lớp và tài khoản học sinh trước.</p><a class="btn btn-blue" href="manage.html">Đến trang Lớp & học sinh</a>');
  const m = modal(`<h2>🎯 Mở luyện tập tự do</h2>
    <p style="font-size:12px;color:#475467;margin:0 0 8px">Chuyên đề: <b>${esc(c.subject)} · Khối ${esc(c.grade)}${c.bankTopics && c.bankTopics.length ? ' · ' + c.bankTopics.map(esc).join(', ') : ' · tất cả chuyên đề có đáp án'}</b>. Chỉ tính câu đã có đáp án; chuyên đề lớp đã mở trước đó vẫn được giữ.</p>
    <div style="max-height:40vh;overflow:auto;margin-bottom:10px">${classes.map(k => `<label style="display:flex;gap:8px;align-items:center;padding:6px 0;font-size:13px;border-bottom:1px solid var(--line)"><input type="checkbox" data-c="${k.id}" ${!k.grade || k.grade === c.grade ? 'checked' : ''}> <b>${esc(k.name)}</b> <small style="color:#667085">${k.grade ? 'Khối ' + esc(k.grade) + ' · ' : ''}${k.students} HS</small></label>`).join('')}</div>
    <button class="btn btn-blue" id="op-go">✓ Mở cho các lớp đã chọn</button>`);
  $('#op-go', m.b).onclick = async () => {
    const ids = $$('[data-c]:checked', m.b).map(i => +i.dataset.c); if (!ids.length) return toast('Hãy chọn ít nhất một lớp');
    $('#op-go', m.b).disabled = true; let opened = 0, topics = 0;
    try {
      for (const id of ids) {
        const gs = (await LB.api.get(`/api/classes/${id}/practice`)).groups;
        const want = gs.filter(g => g.subject === c.subject && g.grade === c.grade && (!c.bankTopics || !c.bankTopics.length || c.bankTopics.includes(g.topic)));
        if (!want.length) { toast('Ngân hàng chưa có câu có đáp án cho lựa chọn này'); $('#op-go', m.b).disabled = false; return; }
        const keep = gs.filter(g => g.open), seen = new Set(keep.map(g => [g.subject, g.grade, g.topic].join('|||')));
        const open = keep.concat(want.filter(g => !seen.has([g.subject, g.grade, g.topic].join('|||')))).map(g => ({subject: g.subject, grade: g.grade, topic: g.topic}));
        await LB.api.post(`/api/classes/${id}/practice`, {open}); opened++; topics = want.length;
      }
      m.close();
      modal(`<h2>✓ Đã mở luyện tập tự do</h2><p style="font-size:13px">${topics} chuyên đề đã mở cho <b>${opened}</b> lớp. Học sinh vào <b>Bài của tôi → 🎯 Tự luyện tập</b> để làm.</p><div class="lb-row"><a class="btn btn-blue" href="manage.html#practice">Quản lý các chuyên đề đang mở</a></div>`);
    } catch (e) { $('#op-go', m.b).disabled = false; toast(e.message); }
  };
}

async function openAssign(title, variations, c) {
  let classes;
  try { classes = (await LB.api.get('/api/classes')).classes; } catch (e) { return toast(e.message); }
  if (!classes.length) return modal('<h2>Chưa có lớp học</h2><p style="font-size:13px">Bạn cần tạo lớp và cấp tài khoản cho học sinh trước khi giao bài.</p><a class="btn btn-blue" href="manage.html">Đến trang Lớp & học sinh</a>');
  const m = modal(`<h2>📤 Giao bài cho lớp</h2>
    <label class="lb-field"><span>TÊN BÀI</span><input id="as-t" maxlength="150" value="${esc(title)}"></label>
    <label class="lb-field"><span>LỚP NHẬN BÀI</span><select id="as-c">${classes.map(k => `<option value="${k.id}">${esc(k.name)} · ${k.students} học sinh</option>`).join('')}</select></label>
    <label class="lb-field"><span>CÁCH PHÂN MÃ ĐỀ (${variations.length} mã đề)</span><select id="as-d">
      ${c.kindKey === 'personal' ? '<option value="adaptive">Cá nhân hóa — tự xếp mức theo điểm trung bình của từng học sinh</option>' : ''}
      ${variations.length > 1 ? `<option value="alt">Xen kẽ — học sinh liền kề làm mã đề khác nhau (chống nhìn bài)</option>
      <option value="random">Ngẫu nhiên — chia đều số học sinh cho các mã đề</option><option value="free">Học sinh tự chọn mã đề</option>` : '<option value="alt">Giao cho cả lớp</option>'}
      <option value="manual">Chỉ định — chọn mã đề (hoặc không giao) cho từng học sinh</option>
      ${c.useBank ? '<option value="levels">Theo mức độ — đặt mặc định cho lớp, chỉnh riêng từng học sinh (mỗi em một đề)</option>' : ''}</select></label>
    <div id="as-man" hidden></div>
    <div id="as-lv" hidden></div>
    <div class="lb-row" style="align-items:flex-end">
      <label class="lb-field" style="flex:1;min-width:190px"><span>HẠN NỘP (TUỲ CHỌN)</span><input id="as-due" type="datetime-local"></label>
      <label class="lb-field" style="width:150px"><span>PHÚT LÀM BÀI (0 = TỰ DO)</span><input id="as-min" type="number" min="0" max="300" value="45"></label>
      <label class="lb-field" style="width:110px"><span>SỐ LẦN LÀM</span><input id="as-try" type="number" min="1" max="10" value="1"></label></div>
    <label class="lb-field"><span>HỌC SINH XEM ĐÁP ÁN & LỜI GIẢI CHI TIẾT</span><select id="as-show">
      <option value="1">Ngay sau khi nộp bài</option>
      <option value="2">Sau khi hết hạn nộp (hoặc khi giáo viên đóng bài) — tránh lộ đáp án cho bạn chưa làm</option>
      <option value="0">Không cho xem (chỉ xem điểm và câu đúng/sai)</option></select></label>
    <div class="lb-note">Học sinh chỉ nhận được đề (không có đáp án). Hệ thống tự chấm câu trắc nghiệm, đúng/sai, trả lời ngắn; câu tự luận giáo viên chấm riêng. Sau khi nộp, học sinh vào <b>Bài của tôi → 📖 Xem lại bài</b> để xem lại bài làm.</div>
    <button class="btn btn-blue" id="as-go">✓ Giao bài</button>`);
  if (variations.length < 2 && c.kindKey !== 'personal') $('#as-d', m.b).value = 'alt';
  const man = $('#as-man', m.b);
  let roster = [], pick = {};   // pick[student_id] = số thứ tự mã đề | 'free' | 'none'
  const drawMan = () => {
    const cnt = variations.map((_, i) => roster.filter(s => pick[s.id] === i).length), none = roster.filter(s => pick[s.id] === 'none').length;
    man.innerHTML = roster.length ? `<div class="dist-matrix-box" style="margin:0 0 10px">
      ${varPickerHTML(variations, roster, pick, 'mp')}
      <div style="font-size:11px;color:#475467;margin-top:6px">${variations.map((v, i) => `<b>${esc(v.code)}</b>: ${cnt[i]} HS`).join(' · ')}${none ? ` · <b>Không giao</b>: ${none} HS` : ''}</div></div>`
      : '<div class="lb-note" style="margin:0 0 10px">Lớp này chưa có học sinh đang hoạt động.</div>';
    bindVarPicker(man, variations, roster, pick, 'mp', drawMan);
  };
  // --- Giao theo mức độ: ma trận mặc định của lớp + ma trận riêng từng học sinh (mỗi học sinh một đề riêng lấy từ ngân hàng) ---
  const lvBox = $('#as-lv', m.b), MIN_PER = {mcq: 2, tf: 7, short: 8};
  let lvDef = null, lvStu = {}, lvRoster = [];     // lvStu[id] = ma trận riêng | undefined (dùng mặc định lớp)
  const lvOpen = new Set();
  const lvEff = s => lvStu[s.id] || lvDef;
  const lvGrid = (ns, get) => `<table class="tbl" style="font-size:11px;width:auto"><tr><th></th>${LV4.map(([, n]) => `<th>${n}</th>`).join('')}</tr>${MTYPES.map(t => `<tr><td>${TYN[t]}</td>${LV4.map(([lv]) => `<td><input type="number" min="0" max="50" value="${get(t, lv)}" data-${ns}="${t}:${lv}" style="width:46px;padding:4px;border:1px solid var(--line);border-radius:6px"></td>`).join('')}</tr>`).join('')}</table>`;
  const readGrid = root => { const o = {mcq: {}, tf: {}, short: {}}; $$('input', root).forEach(i => { const k = Object.keys(i.dataset)[0], [t, lv] = i.dataset[k].split(':'); o[t][lv] = Math.max(0, Math.min(50, Math.floor(+i.value || 0))); }); return o; };
  const drawLv = () => {
    const pool = bankPool(c), have = (t, lv) => pool.filter(q => q.t === t && lvOf(q) === lv).length;
    const mins = Math.max(0, ...lvRoster.map(s => { const e = lvEff(s); return e ? MTYPES.reduce((n, t) => n + MIN_PER[t] * LV4.reduce((x, [lv]) => x + (+e[t][lv] || 0), 0), 0) : 0; }));
    lvBox.innerHTML = `<div class="dist-matrix-box" style="margin:0 0 10px">
      <div style="font-size:12px;font-weight:700;color:#1e3a8a;margin-bottom:4px">1. Mặc định cho cả lớp (số câu mỗi em)</div>
      <div id="lv-def">${lvGrid('ld', (t, lv) => lvDef[t][lv])}</div>
      <div style="font-size:10px;color:#1e40af;margin:4px 0">Ngân hàng đang có (đúng môn/khối/chuyên đề đã chọn): ${LV4.map(([lv, n]) => `${n} <b>${MTYPES.reduce((x, t) => x + have(t, lv), 0)}</b>`).join(' · ')}</div>
      <div style="margin-bottom:8px"><button type="button" class="btn btn-outline sm" id="lv-reset">↺ Cho mọi học sinh dùng mặc định lớp</button></div>
      <div style="font-size:12px;font-weight:700;color:#1e3a8a;margin-bottom:4px">2. Chỉnh riêng từng học sinh <span style="font-weight:400;color:#475467">(bấm tên để sửa; để tất cả = 0 thì không giao cho em đó)</span></div>
      <div style="max-height:260px;overflow:auto">${lvRoster.map(s => { const e = lvEff(s); return `<details data-sid="${s.id}" ${lvOpen.has(s.id) ? 'open' : ''} style="border:1px solid #e2e8f0;border-radius:8px;padding:6px 8px;margin-bottom:4px;background:${lvStu[s.id] ? '#fffbeb' : '#fff'}"><summary style="cursor:pointer;font-size:12px"><b>${esc(s.name)}</b> — <span data-sum>${matTotal(e)} câu · ${esc(matSummary(e))}</span> <span data-tag></span></summary>
        <div data-grid="${s.id}" style="margin-top:6px">${lvGrid('ls', (t, lv) => e[t][lv])}</div>
        <button type="button" class="btn btn-outline sm" data-back="${s.id}" style="margin-top:4px" ${lvStu[s.id] ? '' : 'hidden'}>↺ Dùng mặc định lớp</button></details>`; }).join('')}</div>
      <div style="font-size:11px;color:#475467;margin-top:6px">Mỗi học sinh nhận một đề riêng (câu chọn ngẫu nhiên đúng số lượng theo mức). Em có đề dài nhất cần khoảng <b id="lv-mins">${mins}</b> phút (trắc nghiệm 2' · đúng/sai 7' · trả lời ngắn 8' mỗi câu) — hãy đặt “Phút làm bài” phù hợp hoặc để 0 (tự do).</div>
      <label style="display:flex;gap:6px;align-items:center;font-size:11px;margin-top:6px;cursor:pointer"><input type="checkbox" id="lv-save" ${lvBox.dataset.nosave ? '' : 'checked'}> Tự lưu thiết lập này làm mặc định (cho lần giao sau và gợi ý sẵn khi học sinh tự luyện) <span id="lv-st" style="color:#16a34a;font-weight:700"></span></label></div>`;
    // Mọi chỉnh sửa chỉ cập nhật tại chỗ (không vẽ lại cả danh sách) nên ô đang nhập và vị trí cuộn được giữ nguyên
    const scrollBox = lvBox.querySelector('[style*="max-height:260px"]');
    const sIds = lvRoster.map(s => s.id);
    const setGrid = (g, mat) => $$('input', g).forEach(i => { const [t, lv] = i.dataset[Object.keys(i.dataset)[0]].split(':'); i.value = mat[t][lv]; });
    const stat = () => {
      const mins = Math.max(0, ...lvRoster.map(s => { const e = lvEff(s); return MTYPES.reduce((n, t) => n + MIN_PER[t] * LV4.reduce((x, [lv]) => x + (+e[t][lv] || 0), 0), 0); }));
      const el = $('#lv-mins', lvBox); if (el) el.textContent = mins;
    };
    const refreshStu = id => {
      const d = lvBox.querySelector(`details[data-sid="${id}"]`); if (!d) return;
      const e = lvEff({id});
      $('[data-sum]', d).textContent = `${matTotal(e)} câu · ${matSummary(e)}`;
      $('[data-tag]', d).innerHTML = lvStu[id] ? '<span class="pill warn">riêng</span>' : '<span style="color:#98a2b3">(mặc định lớp)</span>';
      d.style.background = lvStu[id] ? '#fffbeb' : '#fff';
      $('[data-back]', d).hidden = !lvStu[id];
    };
    let saveT = null;
    const saveNow = async () => {
      clearTimeout(saveT); const st = $('#lv-st', lvBox);
      if (!$('#lv-save', lvBox) || !$('#lv-save', lvBox).checked) return;
      try { await LB.api.post(`/api/classes/${$('#as-c', m.b).value}/matrix`, {default: lvDef, students: Object.fromEntries(lvRoster.map(s => [s.id, lvStu[s.id] || null]))}); if (st) st.textContent = '✓ Đã lưu'; }
      catch (er) { if (st) st.textContent = ''; toast('Không lưu được thiết lập: ' + er.message); }
    };
    const later = () => { const st = $('#lv-st', lvBox); if (st) st.textContent = ''; clearTimeout(saveT); saveT = setTimeout(saveNow, 900); };
    lvBox.flushSave = saveNow;
    sIds.forEach(refreshStu); stat();
    $$('details', lvBox).forEach(d => d.ontoggle = () => {      // chỉ mở một học sinh một lúc: mở em khác thì em đang mở tự thu lại
      if (!d.open) return;
      $$('details[open]', lvBox).forEach(o => { if (o !== d) o.open = false; });
    });
    $('#lv-save', lvBox).onchange = e => { lvBox.dataset.nosave = e.target.checked ? '' : '1'; if (e.target.checked) later(); };
    $$('[data-ld]', lvBox).forEach(i => i.oninput = () => {
      lvDef = readGrid($('#lv-def', lvBox));
      sIds.forEach(id => { if (!lvStu[id]) { setGrid(lvBox.querySelector(`[data-grid="${id}"]`), lvDef); refreshStu(id); } });
      stat(); later();
    });
    $$('[data-grid]', lvBox).forEach(g => $$('[data-ls]', g).forEach(i => i.oninput = () => { const id = +g.dataset.grid; lvStu[id] = readGrid(g); refreshStu(id); stat(); later(); }));
    $$('[data-back]', lvBox).forEach(b => b.onclick = () => { const id = +b.dataset.back; delete lvStu[id]; setGrid(lvBox.querySelector(`[data-grid="${id}"]`), lvDef); refreshStu(id); stat(); later(); });
    $('#lv-reset', lvBox).onclick = () => { lvStu = {}; sIds.forEach(id => { setGrid(lvBox.querySelector(`[data-grid="${id}"]`), lvDef); refreshStu(id); }); stat(); later(); };
    if (scrollBox && lvBox._scroll) scrollBox.scrollTop = lvBox._scroll;
  };
  const loadLevels = async () => {
    lvBox.hidden = false; lvBox.innerHTML = '<div class="lb-note" style="margin:0 0 10px">Đang tải danh sách học sinh...</div>';
    try {
      const r = await LB.api.get(`/api/classes/${$('#as-c', m.b).value}/matrix`);
      lvRoster = r.students; lvStu = {}; lvRoster.forEach(s => { if (s.matrix) lvStu[s.id] = s.matrix; });
      lvDef = r.default || {mcq: {1: 4, 2: 4, 3: 2, 4: 0}, tf: {1: 0, 2: 1, 3: 1, 4: 0}, short: {1: 0, 2: 1, 3: 1, 4: 0}};
    } catch (e) { lvBox.innerHTML = ''; return toast(e.message); }
    if (!lvRoster.length) { lvBox.innerHTML = '<div class="lb-note" style="margin:0 0 10px">Lớp này chưa có học sinh đang hoạt động.</div>'; return; }
    drawLv();
  };
  const loadRoster = async () => {
    const dv = $('#as-d', m.b).value;
    if (dv === 'levels') { man.hidden = true; return loadLevels(); }
    lvBox.hidden = true;
    if (dv !== 'manual') { man.hidden = true; return; }
    man.hidden = false; man.innerHTML = '<div class="lb-note" style="margin:0 0 10px">Đang tải danh sách học sinh...</div>';
    try { roster = (await LB.api.get('/api/students?class_id=' + $('#as-c', m.b).value)).students.filter(s => s.active); }
    catch (e) { man.innerHTML = ''; return toast(e.message); }
    pick = {}; balancedPick(variations.length, roster, pick); drawMan();
  };
  $('#as-d', m.b).onchange = loadRoster; $('#as-c', m.b).onchange = loadRoster;
  $('#as-go', m.b).onclick = async () => {
    const t = $('#as-t', m.b).value.trim(); if (!t) return toast('Hãy nhập tên bài');
    const mode = $('#as-d', m.b).value;
    if (mode === 'manual' && !roster.some(s => pick[s.id] !== 'none')) return toast('Hãy chọn mã đề cho ít nhất một học sinh');
    let sendVars = variations, sendMode = mode, sendMap = mode === 'manual' ? Object.fromEntries(roster.map(s => [s.id, pick[s.id]])) : null;
    if (mode === 'levels') {   // mỗi học sinh một đề riêng theo ma trận của em đó
      if (!lvRoster.length || !lvDef) return toast('Chưa tải được danh sách học sinh');
      const seed = Date.now() % 1e6, warns = [], vs = [], map = {}, pool = bankPool(c);
      lvRoster.forEach((s, i) => {
        const e = lvEff(s), r = rng(seed + i * 131 + 7);
        if (!matTotal(e)) { map[s.id] = 'none'; return; }
        const w = [], qs = pickLeveled(pool, e, r, w).map(q => shuffleOpts(q, r));
        warns.push(...w.map(x => `${s.name}: ${x}`));
        if (!qs.length) { map[s.id] = 'none'; return; }
        map[s.id] = vs.length; vs.push({code: `Đề riêng ${vs.length + 1}`, name: s.name.slice(0, 60), desc: matSummary(e), questions: qs});
      });
      if (!vs.length) return toast(warns[0] || 'Không tạo được đề nào — kiểm tra ma trận và ngân hàng câu hỏi');
      if (warns.length && !confirm(`Ngân hàng không đủ câu cho ${warns.length} mục:\n${warns.slice(0, 6).join('\n')}${warns.length > 6 ? '\n…' : ''}\n\nVẫn giao với số câu hiện có?`)) return;
      sendVars = vs; sendMode = 'manual'; sendMap = map;
      if ($('#lv-save', m.b) && $('#lv-save', m.b).checked) {
        try { await LB.api.post(`/api/classes/${$('#as-c', m.b).value}/matrix`, {default: lvDef, students: Object.fromEntries(lvRoster.map(s => [s.id, lvStu[s.id] || null]))}); }
        catch (er) { toast('Không lưu được thiết lập mặc định: ' + er.message); }
      }
    }
    const dv = $('#as-due', m.b).value, btn = $('#as-go', m.b), show = +$('#as-show', m.b).value;
    if (show === 2 && !dv && !confirm('Chưa đặt hạn nộp: học sinh chỉ xem được đáp án khi bạn bấm “Đóng” bài ở trang quản lý. Tiếp tục?')) return;
    const unverified = sendVars.reduce((n, v) => n + v.questions.filter(q => q.aiAns).length, 0);
    if (unverified && !confirm(`${unverified} câu trong bài này có đáp án do AI giải mà bạn CHƯA xác nhận. AI có thể sai và học sinh sẽ bị chấm theo đáp án đó.\\n\\nVẫn giao bài? (Hủy để vào “Quản lý & sửa đáp án” xem lại trước.)`)) return;
    btn.disabled = true;
    try {
      const r = await LB.api.post('/api/assignments', {
        title: t, class_id: +$('#as-c', m.b).value, dist_mode: sendMode,
        ...(sendMap ? {variation_map: sendMap} : {}),
        due_at: dv ? Math.floor(new Date(dv).getTime() / 1000) : null, duration_min: +$('#as-min', m.b).value || 0,
        max_attempts: +$('#as-try', m.b).value || 1, show_result: show,
        exam: {title: t, subject: c.subject, grade: c.grade, topic: c.topic, variations: sendVars.map(v => ({code: v.code, name: v.name, desc: v.desc, questions: v.questions}))}
      });
      const tiers = r.tiers ? `<p style="font-size:12px;color:#475467">Phân mức: ${r.tiers.map((n, i) => `<b>${esc(variations[i] ? variations[i].code : 'Mức ' + (i + 1))}</b> ${n} HS`).join(' · ')}</p>` : '';
      modal(`<h2>✓ Đã giao bài</h2><p style="font-size:13px">“${esc(t)}” đã được giao cho <b>${r.students}</b> học sinh. Học sinh đăng nhập sẽ thấy bài ở mục <b>Bài của tôi</b>.</p>${tiers}<p style="font-size:12px;color:#475467">Muốn đổi mã đề cho học sinh nào: vào <b>Lớp & học sinh → Bài đã giao → 🔀 Mã đề</b>.</p><div class="lb-row"><a class="btn btn-blue" href="manage.html">Xem kết quả & quản lý</a></div>`);
    } catch (e) { btn.disabled = false; toast(e.message); }
  };
}

/* ---------- Chỉ định mã đề cho từng học sinh (dùng khi giao bài và khi đổi mã đề của bài đã giao) ---------- */
// Chia ngẫu nhiên nhưng đều: số học sinh mỗi mã đề chênh nhau tối đa 1. only = các học sinh được chia lại (mặc định: tất cả)
function balancedPick(n, roster, pick, only) {
  const ids = (only || roster).map(s => s.id), seq = shuffleArr(ids.map((_, i) => i % n), Math.random);
  ids.forEach((id, i) => { pick[id] = seq[i]; });
}
function varPickerHTML(vs, roster, pick, ns, lock) {
  const opt = (v, cur, label) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${label}</option>`;
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;font-size:11px"><b style="color:#1e3a8a">Chia nhanh:</b>
      <button type="button" class="btn btn-outline sm" data-${ns}="rand">🎲 Ngẫu nhiên đều</button>
      <button type="button" class="btn btn-outline sm" data-${ns}="alt">↹ Xen kẽ theo danh sách</button>
      ${vs.map((v, i) => `<button type="button" class="btn btn-outline sm" data-${ns}="all" data-v="${i}">Cả lớp ${esc(v.code)}</button>`).join('')}
      <button type="button" class="btn btn-outline sm" data-${ns}="none">Bỏ chọn hết</button></div>
    <div class="vp-list" style="max-height:34vh;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;background:#fff"><table class="tbl" style="margin:0"><tr><th>Học sinh</th><th style="width:230px">Mã đề</th></tr>
    ${roster.map(s => `<tr><td><b>${esc(s.name)}</b> <small style="color:#667085">${esc(s.username || '')}</small>${lock && lock(s) ? ` <span class="pill warn" title="${esc(lock(s))}">${s.doing ? 'đang làm' : 'đã làm'}</span>` : ''}</td>
      <td><select data-${ns}-s="${s.id}" style="padding:5px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;width:100%">${vs.map((v, i) => opt(i, pick[s.id], '📄 ' + esc(v.code) + (v.name ? ' · ' + esc(v.name) : ''))).join('')}${opt('free', pick[s.id], '✋ Học sinh tự chọn')}${opt('none', pick[s.id], '— Không giao —')}</select></td></tr>`).join('')}</table></div>`;
}
// canChange(s): học sinh nào được các nút “chia nhanh” đổi (vd. bỏ qua em đã làm bài); chọn tay từng em thì luôn được
function bindVarPicker(root, vs, roster, pick, ns, redraw, canChange) {
  const keep = () => { const el = root.querySelector('.vp-list'), top = el ? el.scrollTop : 0; redraw(); const n = root.querySelector('.vp-list'); if (n) n.scrollTop = top; };
  const pool = () => roster.filter(s => !canChange || canChange(s));
  $$(`[data-${ns}-s]`, root).forEach(sel => sel.onchange = () => { const v = sel.value; pick[sel.getAttribute(`data-${ns}-s`)] = /^\d+$/.test(v) ? +v : v; keep(); });
  $$(`[data-${ns}]`, root).forEach(b => b.onclick = () => {
    const a = b.getAttribute(`data-${ns}`), P = pool();
    if (a === 'rand') balancedPick(vs.length, roster, pick, P);
    else if (a === 'alt') P.forEach((s, i) => { pick[s.id] = i % vs.length; });
    else if (a === 'all') P.forEach(s => { pick[s.id] = +b.dataset.v; });
    else P.forEach(s => { pick[s.id] = 'none'; });
    keep();
  });
}

/* Xem lại từng câu: đáp án đã chọn, đáp án đúng, lời giải. who = “Bạn chọn” (học sinh) hoặc “Học sinh chọn” (giáo viên). */
function reviewHTML(qs, details, who) {
  who = who || 'Bạn chọn';
  const has = v => v !== undefined;
  const nOk = details.filter(d => d && d.score === 1).length, nBad = details.filter(d => d && d.score === 0).length;
  const head = `<div class="rv-sum"><span class="pill ok">✓ ${nOk} câu đúng</span> <span class="pill bad">✗ ${nBad} câu sai</span>${details.some(d => d && d.score > 0 && d.score < 1) ? ' <span class="pill warn">½ đúng một phần</span>' : ''}${details.some(d => d && d.score == null) ? ' <span class="pill">✎ tự luận</span>' : ''}</div>`;
  return head + qs.map((q, i) => {
    const d = details[i] || {}, sc = d.score, g = d.given, key = d.key, reveal = has(key) || has(d.sol);
    const blank = g == null || g === '' || (Array.isArray(g) && g.every(v => v == null));
    const pill = sc == null ? (d.manual != null ? `<span class="pill ok">GV chấm ${String(d.manual).replace('.', ',')} điểm</span>` : '<span class="pill">Tự luận · chờ giáo viên chấm</span>')
      : d.max_pts != null ? (sc === 1 ? `<span class="pill ok">✓ Đúng · +${String(d.pts).replace('.', ',')} điểm</span>` : sc > 0 ? `<span class="pill warn">Đúng một phần · ${String(d.pts).replace('.', ',')}/${String(d.max_pts).replace('.', ',')} điểm</span>` : `<span class="pill bad">✗ ${blank ? 'Bỏ trống' : 'Sai'} · 0/${String(d.max_pts).replace('.', ',')} điểm</span>`)
      : sc === 1 ? '<span class="pill ok">✓ Đúng</span>' : sc > 0 ? `<span class="pill warn">Đúng một phần · ${String(sc).replace('.', ',')} điểm</span>` : `<span class="pill bad">✗ ${blank ? 'Bỏ trống' : 'Sai'}</span>`;
    let body;
    if (isTfg(q)) {   // đúng/sai 4 ý: từng ý bạn chọn gì, đáp án là gì
      body = `<table class="rv-tf">${q.sts.map((st, k) => {
        const gv = Array.isArray(g) ? g[k] : null, kv = Array.isArray(key) ? key[k] : undefined, ok = kv !== undefined && gv === kv;
        return `<tr class="${kv === undefined ? '' : ok ? 'rv-ok' : 'rv-bad'}"><td><b>${'abcd'[k]})</b> ${imgq(q) ? '' : esc(st)}</td><td>${who}: <b>${gv === 0 ? 'Đúng' : gv === 1 ? 'Sai' : '—'}</b></td>${kv === undefined ? '' : `<td>Đáp án: <b>${kv === 0 ? 'Đúng' : 'Sai'}</b> ${ok ? '✓' : '✗'}</td>`}</tr>`;
      }).join('')}</table>`;
    } else if (q.opts && !(imgq(q) && q.t === 'mcq')) {   // phương án dạng chữ: tô xanh đáp án đúng, tô đỏ lựa chọn sai
      body = `<div class="rv-opts">${q.opts.map((o, j) => {
        const mine = g === j, right = Number.isInteger(key) && key === j;
        return `<div class="rv-opt ${right ? 'rv-ok' : mine ? 'rv-bad' : ''}"><b>${q.opts.length === 2 ? '' : 'ABCD'[j] + '.'}</b> ${esc(o)}${mine ? ` <span class="rv-tag">${who}</span>` : ''}${right ? ' <span class="rv-tag ok">Đáp án đúng</span>' : ''}</div>`;
      }).join('')}</div>`;
    } else {
      const show = q.opts ? (Number.isInteger(g) ? 'ABCD'[g] : '—') : (blank ? '—' : esc(g));
      const ks = !has(key) || sc == null ? '' : q.opts ? (Number.isInteger(key) ? 'ABCD'[key] : '') : esc(key);
      body = `<div class="rv-line"><span class="${sc == null ? '' : sc === 1 ? 'rv-ok' : 'rv-bad'}" style="${q.t === 'essay' ? 'white-space:pre-wrap' : ''}">${who}: <b>${show}</b></span>${ks !== '' ? ` · Đáp án đúng: <b class="rv-key">${ks}</b>` : ''}</div>`;
    }
    const sq = {sol: d.sol, solImg: d.solImg, solBad: d.solBad};
    const sol = hasSol(sq) ? `<div class="sol rv-sol"><b>📘 Lời giải chi tiết:</b> ${solBody(sq)}</div>` : (reveal ? '<div class="rv-nosol">Câu này chưa có lời giải chi tiết.</div>' : '');
    return `<div class="q-item rv-item ${sc == null ? '' : sc === 1 ? 'is-ok' : 'is-bad'}"><div class="qn">Câu ${i + 1}. ${pill}<div style="margin-top:4px">${qBody(q)}</div></div>${body}${sol}</div>`;
  }).join('');
}

/* ---------- Học sinh làm bài (chấm điểm phía máy chủ) ---------- */
// Khung điểm cộng sau khi nộp bài tự luyện tập
function bonusHTML(bo) {
  const n = bo.counts || {}, vi = x => Number(x || 0).toLocaleString('vi-VN'), m = String(bo.month || '');
  const parts = [['mcq', 'trắc nghiệm'], ['tf', 'đúng/sai'], ['short', 'trả lời ngắn']].filter(([t]) => n[t]).map(([t, l]) => `${n[t]} câu ${l} × ${vi(bo.config[t])}`);
  return `<div style="border:1px solid #fcd34d;background:#fffbeb;border-radius:12px;padding:10px 14px;margin:0 0 12px;font-size:13px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
    <div style="font-size:26px;font-weight:800;color:#b45309">⭐ +${vi(bo.points)}</div>
    <div style="flex:1;min-width:200px">${bo.points ? `Điểm cộng: ${parts.join(' + ')}.` : 'Bài này chưa có câu mới làm đúng để được cộng điểm.'}
      ${bo.repeat ? `<br><small style="color:#667085">${bo.repeat} câu đã làm đúng trước đó trong tháng nên không cộng thêm.</small>` : ''}
      <br>Tổng tháng ${m.slice(5)}/${m.slice(0, 4)}: <b style="color:#b45309">${vi(bo.month_total)}</b> điểm</div></div>`;
}
function runExam(data, o) {
  o = o || {};
  const qs = data.questions, KEYS = 'exam_' + (data.submission_id || 'p' + data.id);
  let ans = qs.map(q => isTfg(q) ? q.sts.map(() => null) : null);
  try { const sv = JSON.parse(localStorage.getItem(KEYS) || 'null'); if (sv && sv.length === qs.length) ans = sv; } catch (e) { /* bỏ qua */ }
  const m = modal('', 1, true), b = m.b;
  let left = data.remaining, tick = null, sent = false;
  const answered = () => ans.filter(a => a != null && a !== '' && !(Array.isArray(a) && a.every(x => x == null))).length;
  const persist = () => { try { localStorage.setItem(KEYS, JSON.stringify(ans)); } catch (e) { /* bỏ qua */ } };
  const lbl = (q, j, t) => `<b>${q.opts && q.opts.length === 2 ? '' : 'ABCD'[j] + '.'}</b> ${optText(q, t) || ''}`;
  const qHTML = (q, i) => {
    let ctl;
    if (isTfg(q)) ctl = q.sts.map((st, k) => `<div style="display:flex;gap:8px;align-items:center;margin:6px 0"><b>${'abcd'[k]})</b><span style="flex:1;font-size:13px">${imgq(q) ? '' : esc(st)}</span>
        ${[0, 1].map(v => `<button type="button" class="lb-opt ${ans[i] && ans[i][k] === v ? 'sel' : ''}" data-i="${i}" data-k="${k}" data-v="${v}" style="width:auto;margin:0;padding:6px 14px">${v ? 'Sai' : 'Đúng'}</button>`).join('')}</div>`).join('');
    else if (q.opts) ctl = q.opts.map((t, j) => `<div class="ans-opt ${ans[i] === j ? 'sel' : ''}" data-i="${i}" data-v="${j}">${lbl(q, j, t)}</div>`).join('');
    else if (q.t === 'short') ctl = `<input data-i="${i}" data-txt="1" value="${esc(ans[i] || '')}" placeholder="Nhập đáp án" style="padding:10px;border:1px solid var(--line);border-radius:8px;width:260px">`;
    else ctl = `<textarea data-i="${i}" data-txt="1" placeholder="Trình bày bài làm của bạn (giáo viên sẽ chấm)" style="width:100%;min-height:90px;padding:10px;border:1px solid var(--line);border-radius:8px;font:inherit">${esc(ans[i] || '')}</textarea>`;
    return `<div class="q-item"><div class="qn">Câu ${i + 1}. ${qBody(q)}</div>${ctl}</div>`;
  };
  const fmtT = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  b.innerHTML = `<h2>${esc(data.title)} · ${esc(data.code)}</h2>
    <div class="timer" id="tm"><span id="tl">${left == null ? 'Không giới hạn thời gian' : '⏱ ' + fmtT(left)}</span><span id="tp"></span></div>
    <div id="ql" style="max-height:62vh;overflow:auto;padding-right:4px">${qs.map(qHTML).join('')}</div>
    <div class="lb-row" style="margin-top:12px"><button class="btn btn-blue" id="sb">📨 Nộp bài</button><span style="font-size:11px;color:#667085">Bài làm được lưu tạm trên máy này; đóng trình duyệt vẫn có thể mở lại để làm tiếp.</span></div>`;
  const progress = () => { $('#tp', b).textContent = `Đã làm ${answered()}/${qs.length}`; };
  progress();
  b.addEventListener('click', e => {
    const t = e.target.closest('[data-v]'); if (!t || sent) return;
    const i = +t.dataset.i, v = +t.dataset.v;
    if (t.dataset.k !== undefined) { ans[i] = ans[i].slice(); ans[i][+t.dataset.k] = v; $$('[data-i="' + i + '"][data-k="' + t.dataset.k + '"]', b).forEach(x => x.classList.toggle('sel', x === t)); }
    else { ans[i] = v; $$('.ans-opt[data-i="' + i + '"]', b).forEach(x => x.classList.toggle('sel', x === t)); }
    persist(); progress();
  });
  b.addEventListener('input', e => { const t = e.target; if (t.dataset.txt) { ans[+t.dataset.i] = t.value; persist(); progress(); } });
  const submit = async auto => {
    if (sent) return;
    if (!auto) {
      const miss = qs.length - answered();
      if (miss && !confirm(`Bạn còn ${miss} câu chưa làm. Vẫn nộp bài?`)) return;
    }
    sent = true; clearInterval(tick); $('#sb', b).disabled = true;
    let res;
    try { res = await LB.api.post(o.submitUrl || `/api/assignments/${o.assignmentId}/submit`, {answers: ans}); }
    catch (e) { sent = false; $('#sb', b).disabled = false; return toast(e.message); }
    try { localStorage.removeItem(KEYS); } catch (e) { /* bỏ qua */ }
    showResult(res, auto);
  };
  const showResult = (res, auto) => {
    const rv = res.details ? reviewHTML(res.questions, res.details) : `<div class="lb-note">${esc(res.reveal_note || 'Giáo viên chưa cho xem đáp án chi tiết. Kết quả sẽ được thông báo sau.')} Bạn có thể xem lại bài làm bất cứ lúc nào ở mục <b>Bài của tôi → 📖 Xem lại bài</b>.</div>`;
    b.innerHTML = `<h2>Kết quả · ${esc(data.title)}</h2>${auto ? '<div class="lb-note">⏰ Hết giờ — bài của bạn đã được nộp tự động.</div>' : ''}
      <div style="text-align:center;margin:8px 0 14px">${res.points ? `<div class="res-big">${String(res.score).replace('.', ',')}<small style="font-size:16px;color:#667085"> / ${String(res.max).replace('.', ',')} điểm</small></div>
      <div style="font-size:13px;color:#475467">Quy ra thang 10: <b>${res.score10 == null ? '—' : String(res.score10).replace('.', ',')}</b> · thời gian làm bài <b>${fmtT(res.spent_sec || 0)}</b>${res.duration_min ? ` / ${res.duration_min} phút` : ''}${res.overtime ? ' · <b style="color:#b91c1c">quá giờ</b>' : ''}</div>`
      : `<div class="res-big">${res.score10 == null ? '—' : String(res.score10).replace('.', ',')}<small style="font-size:16px;color:#667085"> / 10</small></div>
      <div style="font-size:13px;color:#475467">Đúng ${String(res.score).replace('.', ',')}/${res.max} câu chấm tự động${res.essay ? ` · ${res.essay} câu tự luận chờ giáo viên chấm` : ''}${res.late ? ' · <b style="color:#b91c1c">nộp trễ</b>' : ''}</div>`}</div>
      ${res.bonus ? bonusHTML(res.bonus) : ''}
      <div style="max-height:50vh;overflow:auto">${rv}</div><div class="lb-row" style="margin-top:12px"><button class="btn btn-blue" id="cl">Đóng</button></div>`;
    $('#cl', b).onclick = () => { m.close(); o.after && o.after(); };
  };
  $('#sb', b).onclick = () => submit(false);
  if (left != null) {
    const upd = () => { $('#tl', b).textContent = '⏱ ' + fmtT(Math.max(0, left)); $('#tm', b).classList.toggle('low', left <= 60); };
    tick = setInterval(() => { left--; upd(); if (left <= 0) submit(true); }, 1000);
  }
}

function printPage(html) {
  let p = $('#lb-print');
  if (!p) { p = document.createElement('div'); p.id = 'lb-print'; document.body.append(p); }
  p.innerHTML = html;
  const go = () => window.print();
  // đợi ảnh câu hỏi tải xong rồi mới mở hộp thoại in
  const imgs = [...p.querySelectorAll('img')].filter(i => !i.complete);
  if (!imgs.length) return go();
  let left = imgs.length; const done = () => { if (--left <= 0) go(); };
  imgs.forEach(i => { i.onload = i.onerror = done; });
  setTimeout(go, 6000);
}
function printExam(title, qs, ans) { printPage(examPrintHTML(title, qs, ans)); }
/* In nhiều mã đề một lúc; mỗi mã đề kết thúc bằng PHIẾU TRẢ LỜI (có 4 mốc góc để chấm bằng ảnh) */
function printExams(items, o) {
  o = o || {};
  printPage(items.map(it => {
    const t = `${it.title} — ${it.code}`;
    return `<div class="print-exam">${examPrintHTML(t, it.questions, !!o.ans)}${o.sheet && !o.ans ? `<div class="print-sheet">${OMR.sheetSVG(OMR.layout(it.questions), {title: t, code: it.code})}</div>` : ''}</div>`;
  }).join(''));
}

/* ---------- Chấm bài bằng ảnh phiếu trả lời ---------- */
function openScan(vars, title) {
  const Ls = vars.map(v => OMR.layout(v.questions)), codes = vars.map(v => v.code);
  const m = modal(`<h2>📷 Chấm bài bằng ảnh phiếu trả lời</h2>
    <div class="lb-note">Chụp hoặc scan phiếu trả lời đã in từ hệ thống (trang cuối mỗi mã đề). Ảnh cần thấy đủ <b>4 ô vuông đen ở góc</b>, đủ sáng, không bị gấp nhăn. Chọn được nhiều ảnh cùng lúc; máy tự nhận mã đề, đọc các ô được tô và chấm điểm.</div>
    <div class="lb-row" style="margin:10px 0"><input type="file" id="sc-f" accept="image/*" multiple><span style="font-size:11px;color:#667085">${vars.length} mã đề · ${esc(title || '')}</span></div>
    <div id="sc-out"></div>`, true);
  const out = $('#sc-out', m.b), rows = [];
  const loadImg = f => new Promise((ok, no) => { const u = URL.createObjectURL(f), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => no(new Error('Không mở được ảnh')); im.src = u; });
  const draw = () => {
    out.innerHTML = rows.length ? `<div style="max-height:52vh;overflow:auto"><table class="tbl"><tr><th>Ảnh</th><th>Học sinh</th><th>Mã đề</th><th>Điểm (10)</th><th>Đúng/Tổng</th><th>Ghi chú</th></tr>
      ${rows.map((r, i) => r.err ? `<tr><td>${esc(r.name)}</td><td colspan="4"><span class="pill bad">Không đọc được</span> ${esc(r.err)}</td><td></td></tr>` :
      `<tr><td>${esc(r.name)}</td><td><input data-n="${i}" value="${esc(r.student)}" placeholder="Họ tên" style="padding:5px;border:1px solid #cbd5e1;border-radius:6px;width:150px"></td><td>${esc(codes[r.vi])}</td>
        <td><b style="font-size:15px">${String(r.g.score10).replace('.', ',')}</b></td><td>${String(r.g.score).replace('.', ',')}/${r.g.max}</td>
        <td style="font-size:11px">${r.issues.length ? `<span class="pill warn">${r.issues.length} lưu ý</span> ` : ''}<button class="btn btn-outline sm" data-d="${i}">Chi tiết</button></td></tr>`).join('')}</table></div>
      <div class="lb-row" style="margin-top:10px"><button class="btn btn-blue" id="sc-csv">⬇ Xuất CSV</button></div>` : '';
    $$('[data-n]', out).forEach(inp => inp.oninput = () => { rows[+inp.dataset.n].student = inp.value; });
    $$('[data-d]', out).forEach(b => b.onclick = () => detail(rows[+b.dataset.d]));
    const csv = $('#sc-csv', out); if (csv) csv.onclick = () => LB.download('ket-qua-cham-anh.csv', 'Ảnh,Học sinh,Mã đề,Điểm (thang 10),Số câu đúng,Số câu chấm,Lưu ý\n' +
      rows.filter(r => !r.err).map(r => [r.name, r.student, codes[r.vi], r.g.score10, r.g.score, r.g.max, r.issues.join('; ')].map(LB.csvCell).join(',')).join('\n'));
  };
  const detail = r => {
    const qs = vars[r.vi].questions, show = (q, a) => a == null ? '<i>(trống)</i>' : Array.isArray(a) ? a.map((v, k) => 'abcd'[k] + ':' + (v === 0 ? 'Đ' : v === 1 ? 'S' : '?')).join(' ') : q.opts ? (q.opts.length === 2 ? q.opts[a] : 'ABCDEF'[a]) : esc(a);
    const d = modal(`<h2>Chi tiết · ${esc(r.name)} · ${esc(codes[r.vi])}</h2>${r.issues.length ? `<div class="lb-note">⚠ ${r.issues.map(esc).join(' · ')}</div>` : ''}
      <div style="max-height:56vh;overflow:auto"><table class="tbl"><tr><th>Câu</th><th>HS chọn</th><th>Đáp án</th><th>Kết quả</th></tr>${qs.map((q, i) => r.g.per[i] == null ? '' :
      `<tr><td>${i + 1}</td><td>${show(q, r.answers[i])}</td><td>${esc(ansText(q))}</td><td>${r.g.per[i] === 1 ? '<span class="pill ok">Đúng</span>' : r.g.per[i] > 0 ? `<span class="pill warn">${r.g.per[i]}</span>` : '<span class="pill bad">Sai</span>'}</td></tr>`).join('')}</table></div>`, true);
    void d;
  };
  $('#sc-f', m.b).onchange = async e => {
    const files = [...e.target.files]; e.target.value = '';
    for (const f of files) {
      out.insertAdjacentHTML('afterbegin', `<div class="lb-note" id="sc-wait">Đang đọc ${esc(f.name)}...</div>`);
      await new Promise(r => setTimeout(r, 30));
      try {
        const im = await loadImg(f), cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
        cv.getContext('2d').drawImage(im, 0, 0);
        const res = OMR.decode(cv, Ls, codes);
        if (!res.ok) rows.push({name: f.name, err: res.error});
        else rows.push({name: f.name, student: '', vi: res.vi, answers: res.answers, issues: res.issues, g: OMR.grade(vars[res.vi].questions, res.answers)});
      } catch (err) { rows.push({name: f.name, err: err.message}); }
      const w = $('#sc-wait', out); if (w) w.remove();
      draw();
    }
  };
}

/* ---------- Xuất cho các trang khác (manage.js, student.js) ---------- */
window.LBX = {printExam, printExams, openScan, downloadExam, examHTML, qBody, ansText, esc, isTfg, imgq, runExam, reviewHTML, solBody,
  varPickerHTML, bindVarPicker, balancedPick};

/* ---------- Khởi động ---------- */
LB.ready.then(async () => {
  if (PAGE === 'teacher-builder.html') { await loadBank(); initBuilder(); }
});
})();
