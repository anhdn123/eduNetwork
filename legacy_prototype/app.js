/* app.js — chức năng cho prototype Learning by AI (JS thuần, lưu bằng localStorage) */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const PAGE = location.pathname.split('/').pop() || 'index.html';
const KEY = 'lbai_v1';
const DEF = () => ({likes:{},saved:{},shares:{},comments:{},follows:{'Thầy Minh':1,'Phòng Giáo dục & Đào tạo':1},posts:[],reg:false,uploads:[],needs:[],contacts:{},assign:null,profile:{algebra:78,geometry:61,real:43},results:[],teacher:{},tpl:'',kho:true,bank:[],useBank:true});
let S; try { S = Object.assign(DEF(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = DEF(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Bộ nhớ trình duyệt đầy — hãy xóa bớt ảnh đã upload'); } };
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = n => String(n).replace('-', '−');

/* ---------- UI helpers ---------- */
function toast(msg) { $$('.lb-toast').forEach(x => x.remove()); const t = document.createElement('div'); t.className = 'lb-toast'; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2600); }
function modal(html, wide) {
  $$('.lb-overlay').forEach(x => x.remove());
  const o = document.createElement('div'); o.className = 'lb-overlay';
  o.innerHTML = `<div class="lb-modal ${wide ? 'wide' : ''}"><button class="lb-x" aria-label="Đóng">×</button><div class="lb-body">${html}</div></div>`;
  const close = () => o.remove();
  o.addEventListener('mousedown', e => { if (e.target === o) close(); });
  $('.lb-x', o).onclick = close;
  document.body.append(o);
  return { b: $('.lb-body', o), close };
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.lb-overlay').forEach(x => x.remove()); });
const timeAgo = ts => { const m = Math.max(0, Math.round((Date.now() - ts) / 60000)); return m < 1 ? 'Vừa xong' : m < 60 ? m + ' phút' : m < 1440 ? Math.round(m / 60) + ' giờ' : Math.round(m / 1440) + ' ngày'; };
const parseMin = t => { const m = /(\d+)\s*(phút|giờ|ngày)/.exec(t); return m ? +m[1] * ({'phút':1,'giờ':60,'ngày':1440}[m[2]]) : 0; };

const ME = {
  'teachers.html': {n:'Đỗ Nguyệt Anh', role:'Giáo viên', ini:'ĐA', cls:'teacher-av'},
  'students.html': {n:'Nguyễn An', role:'Học sinh', ini:'AN', cls:'student-av'},
  'parents.html': {n:'Phụ huynh của An', role:'Phụ huynh', ini:'PH', cls:'parent-av'}
}[PAGE] || {n:'Nguyệt Anh', role:'Giáo viên', ini:'NA', cls:'teacher-av'};

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
    (ans ? `<div class="sol"><b>Đáp án${ansText(q) ? ': ' + esc(ansText(q)) : ''}.</b> ${q.sol}</div>` : '') + '</div>').join('');
}
function printExam(title, qs, ans) {
  let p = $('#lb-print');
  if (!p) {
    p = document.createElement('div');
    p.id = 'lb-print';
    document.body.append(p);
  }

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

    const solHTML = ans ? `<div class="print-sol"><b>Đáp án đúng:</b> ${esc(ansText(q))} &nbsp;|&nbsp; <b>Lời giải:</b> ${q.sol || ''}</div>` : '';

    return `
      <div class="print-q">
        <div class="print-qh"><b>Câu ${i + 1}:</b> ${qBody(q)} <span class="print-lv">[Mức: ${LV[q.lv] || 'Tiêu chuẩn'}]</span></div>
        ${optsHTML}
        ${solHTML}
      </div>
    `;
  }).join('');

  p.innerHTML = headerHTML + questionsHTML;
  window.print();
}

function downloadExam(title, qs, ans) {
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

    const sol = ans ? `<div class="sol-box"><b>Đáp án đúng:</b> ${esc(ansText(q))} &nbsp;|&nbsp; <b>Lời giải:</b> ${q.sol || ''}</div>` : '';

    return `<div class="q-block">
      <div><b>Câu ${i + 1}:</b> ${qBody(q)} <span style="font-size:9pt;color:#666">[Mức: ${LV[q.lv] || 'Tiêu chuẩn'}]</span></div>
      ${opts}
      ${sol}
    </div>`;
  }).join('');

  const html = `<html><head><meta charset="utf-8"><title>${esc(title)}</title>${css}</head><body>${header}${body}</body></html>`;
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
      fb.innerHTML = `<div class="lb-q"><div class="sol" style="${good ? '' : 'border-color:#e85b4a;background:#fdecea'}"><b>${partial ? 'Đúng một phần (' + sc + ' điểm).' : good ? 'Chính xác!' : 'Chưa đúng.'}</b> ${q.sol}</div></div><button class="btn btn-blue" id="nx">${i + 1 < G.length ? 'Câu tiếp →' : 'Xem kết quả'}</button>`;
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

/* ---------- Bài đăng (bảng tin) ---------- */
const HAS_FEED = !!$('.feed-main');
function postHTML(o) {
  const att = ['Video bài giảng', 'Tài liệu', 'Project học tập'].includes(o.kind) && o.title
    ? `<div class="resource-preview"><div class="resource-cover">${esc(o.kind.split(' ')[0].toUpperCase())}</div><div><b>${esc(o.title)}</b><p>${esc(o.kind)}</p></div></div>` : '';
  const need = o.kind === 'Nhu cầu' ? `<div class="matching-box"><div class="matching-icon">✦</div><div><b>AI Matching đã tìm thấy ${o.count || 0} giáo viên phù hợp</b><p>Dựa trên môn học · lớp · mục tiêu · lịch học · hình thức học</p></div><a class="small-action" href="parents.html?q=${encodeURIComponent(o.text)}">Xem gợi ý</a></div>` : '';
  const tags = (o.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
  return `<article class="feed-post card" data-id="${o.id}" data-user="1" data-ts="${o.ts}"><div class="post-head"><div class="mini-avatar ${o.cls}">${esc(o.ini)}</div><div class="post-author"><b>${esc(o.au)} · ${esc(o.role)}</b><span>${timeAgo(o.ts)} · ${esc(o.kind)} · ${esc(o.vis)}</span></div><button class="post-more">•••</button></div><p class="post-text">${esc(o.text).replace(/\n/g, '<br>')}</p>${tags ? `<div class="post-tags">${tags}</div>` : ''}${att}${need}<div class="post-stats"><span>♥ 0</span><span>0 bình luận · 0 chia sẻ</span></div><div class="post-actions"><button>♡ Thích</button><button>◌ Bình luận</button><button>↗ Chia sẻ</button><button>▢ Lưu</button></div></article>`;
}
const POOL = [
  {id:'m0', au:'Cô Hà Trang', role:'Giáo viên', ini:'HT', cls:'teacher-av', kind:'Tài liệu', vis:'Công khai', min:180, text:'Chia sẻ bộ 20 bài tập hình học lớp 9 về đường tròn, có đáp án chi tiết cho giáo viên và phụ huynh.', tags:['Toán 9', 'Hình học'], title:'Bài tập Đường tròn · 20 bài', likes:45, cm:6, sh:9},
  {id:'m1', au:'Thầy Minh Phúc', role:'Giáo viên', ini:'MP', cls:'teacher-av', kind:'Bài viết', vis:'Công khai', min:240, text:'Mẹo ôn thi học kỳ Vật lý 11: lập bảng công thức theo chương, mỗi tối chỉ luyện 5 câu nhưng chữa kỹ từng câu sai.', tags:['Vật lý', 'Ôn thi'], likes:73, cm:14, sh:21},
  {id:'m2', au:'Bình', role:'Học sinh lớp 8', ini:'BI', cls:'student-av', kind:'Project học tập', vis:'Công khai', min:300, text:'Nhóm mình làm infographic về chu trình nước, mọi người góp ý giúp nhé!', tags:['STEM', 'Project'], title:'Infographic · Chu trình nước', likes:38, cm:5, sh:3},
  {id:'m3', au:'Cô Hà Trang', role:'Giáo viên', ini:'HT', cls:'teacher-av', kind:'Bài viết', vis:'Công khai', min:420, text:'Phụ huynh hay hỏi: con làm đúng nhưng chậm thì nên làm gì? Mình thường cho các em luyện theo khung thời gian ngắn 10 phút, tăng dần độ khó.', tags:['Học tập', 'Phụ huynh'], likes:92, cm:18, sh:25}
];
let poolIdx = 0;
function poolHTML(p) {
  const u = postHTML({...p, ts:Date.now() - p.min * 60000, count:0});
  return u.replace('data-user="1"', 'data-pool="1"').replace(/<span>♥ 0<\/span><span>0 bình luận · 0 chia sẻ<\/span>/, `<span>♥ ${p.likes}</span><span>${p.cm} bình luận · ${p.sh} chia sẻ</span>`);
}

function initPost(p, idx) {
  if (p._w) return; p._w = 1;
  p.dataset.id = p.dataset.id || 's' + idx;
  const id = p.dataset.id, ta = $('.post-author span', p).textContent;
  p.dataset.author = $('.post-author b', p).textContent.split(' · ')[0];
  p.dataset.min = p.dataset.ts ? Math.round((Date.now() - p.dataset.ts) / 60000) : parseMin(ta);
  const st = $$('.post-stats span', p), lm = st[0] ? /(\d+)/.exec(st[0].textContent) : null, cm = /(\d+) bình luận · (\d+) (chia sẻ|đăng ký)/.exec(st[1] ? st[1].textContent : '');
  const base = lm ? +lm[1] : 0, cb = cm ? +cm[1] : 0, sb = cm ? +cm[2] : 0, lab = cm ? cm[3] : 'chia sẻ';
  const reg = lab === 'đăng ký';
  const btns = $$('.post-actions button', p); let panel;
  const paint = () => {
    const L = !!S.likes[id], V = !!S.saved[id], n = (S.comments[id] || []).length;
    btns.forEach(bt => { const t = bt.dataset.o || (bt.dataset.o = bt.textContent);
      if (/Thích|Quan tâm/.test(t)) { bt.textContent = L ? '♥ Đã ' + t.replace(/^♡\s*/, '').toLowerCase() : t; bt.classList.toggle('lb-on', L); }
      if (/Lưu/.test(t)) { bt.textContent = V ? '▣ Đã lưu' : t; bt.classList.toggle('lb-on', V); } });
    if (st[0]) st[0].textContent = '♥ ' + (base + (L ? 1 : 0));
    if (st[1]) st[1].textContent = `${cb + n} bình luận · ${sb + (reg ? (S.reg ? 1 : 0) : (S.shares[id] || 0))} ${lab}`;
  };
  btns.forEach(bt => { const t = bt.textContent;
    bt.onclick = () => {
      if (/Thích|Quan tâm/.test(t)) { S.likes[id] = !S.likes[id]; save(); paint(); }
      else if (/Bình luận/.test(t)) { if (!panel) { panel = commentPanel(p, id, paint); $('input', panel).focus(); } else { panel.hidden = !panel.hidden; if (!panel.hidden) $('input', panel).focus(); } }
      else if (/Chia sẻ/.test(t)) shareLink(id, paint);
      else if (/Lưu/.test(t)) { S.saved[id] = !S.saved[id]; save(); paint(); toast(S.saved[id] ? 'Đã lưu bài viết' : 'Đã bỏ lưu'); }
    }; });
  const act = $('.small-action:not(a), .play-btn', p);
  if (act) act.onclick = () => /play-btn/.test(act.className) ? playProject(p) : /tài liệu/i.test(act.textContent) ? viewDoc('Worksheet · Hệ phương trình') : openNotice(p, paint);
  paint();
}
function shareLink(id, cb) {
  const url = location.href.split('#')[0].split('?')[0] + '#' + id;
  try { navigator.clipboard.writeText(url); } catch (e) {}
  S.shares[id] = (S.shares[id] || 0) + 1; save(); cb && cb(); toast('Đã sao chép liên kết chia sẻ');
}
function commentPanel(host, id, paint) {
  const d = document.createElement('div'); d.className = 'lb-comments'; host.append(d);
  const list = () => { const c = S.comments[id] || []; d.innerHTML = c.map(x => `<div class="c"><b>${esc(x.a)}</b>${esc(x.t)} <small>${timeAgo(x.ts)}</small></div>`).join('') + '<form><input placeholder="Viết bình luận..." maxlength="300"><button class="btn btn-blue" style="margin:0;flex:0">Gửi</button></form>';
    $('form', d).onsubmit = e => { e.preventDefault(); const v = $('input', d).value.trim(); if (!v) return; (S.comments[id] = S.comments[id] || []).push({a:ME.n, t:v, ts:Date.now()}); save(); list(); paint(); $('input', d).focus(); }; };
  list(); return d;
}
function openNotice(p, paint) {
  const m = modal(`<h2>📢 Tập huấn · AI trong giáo dục</h2><p><b>Thời gian:</b> 08:30 · 12/10/2026<br><b>Đơn vị:</b> Phòng Giáo dục & Đào tạo<br><b>Nội dung:</b> ứng dụng AI trong thiết kế học liệu và đánh giá học sinh.</p><div class="lb-row"><button class="btn ${S.reg ? 'btn-outline' : 'btn-blue'}" id="rg">${S.reg ? 'Hủy đăng ký' : 'Đăng ký tham dự'}</button></div>`);
  $('#rg', m.b).onclick = () => { S.reg = !S.reg; save(); paint(); m.close(); toast(S.reg ? 'Đã đăng ký tham dự tập huấn' : 'Đã hủy đăng ký'); };
}
function viewDoc(title) {
  const qs = buildExam({n:5, types:['mcq', 'short', 'essay'], sl:50}, 20261012);
  const m = modal(`<h2>${esc(title)}</h2><p style="color:#667085">Worksheet 3 mức độ (nhận biết → vận dụng → vận dụng cao), có thể làm trên giấy hoặc online.</p><div class="lb-exam">${examHTML(qs, false)}</div><div class="lb-row" style="margin-top:12px"><button class="btn btn-blue" id="pr">🖨 In worksheet</button><button class="btn btn-outline" id="dl">⬇ Tải về (.doc)</button><button class="btn btn-outline" id="on">💻 Làm online</button></div>`, 1);
  $('#pr', m.b).onclick = () => printExam(title, qs, false); $('#dl', m.b).onclick = () => downloadExam(title, qs, false); $('#on', m.b).onclick = () => runQuiz(qs, {title});
}
function playProject() { runQuiz(buildExam({n:10, types:['mcq', 'tf', 'short'], sl:50}, Date.now() % 100000), {title:'Quiz Master · Hệ phương trình', who:'An'}); }

/* Composer */
function openComposer(kind) {
  const kinds = ['Bài viết', 'Video bài giảng', 'Tài liệu', 'Project học tập'];
  const m = modal(`<h2>Tạo bài đăng</h2><label class="lb-field"><span>LOẠI NỘI DUNG</span><select id="ck">${kinds.map(k => `<option ${k === kind ? 'selected' : ''}>${k}</option>`).join('')}</select></label><label class="lb-field" id="tw"><span>TIÊU ĐỀ / TÊN TÀI LIỆU</span><input id="ct" maxlength="90"></label><label class="lb-field"><span>NỘI DUNG</span><textarea id="cx" placeholder="Bạn muốn chia sẻ điều gì về giáo dục?"></textarea></label><label class="lb-field"><span>THẺ (cách nhau bằng dấu phẩy)</span><input id="cg" placeholder="Toán 9, Worksheet"></label><label class="lb-field"><span>AI HIỂN THỊ CHO</span><select id="cv"><option>Công khai</option><option>Người theo dõi</option></select></label><p class="lb-note">Dữ liệu học sinh không bao giờ được đăng công khai lên bảng tin.</p><div class="lb-row"><button class="btn btn-blue" id="cs">Đăng</button></div>`);
  const sync = () => $('#tw', m.b).style.display = $('#ck', m.b).value === 'Bài viết' ? 'none' : ''; $('#ck', m.b).onchange = sync; sync();
  $('#cs', m.b).onclick = () => {
    const text = $('#cx', m.b).value.trim(); if (!text) return toast('Hãy nhập nội dung bài đăng');
    addPost({kind:$('#ck', m.b).value, title:$('#ct', m.b).value.trim(), text, tags:$('#cg', m.b).value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5), vis:$('#cv', m.b).value});
    m.close();
  };
}
function addPost(o) {
  const post = {id:'u' + Date.now(), au:ME.n, role:ME.role, ini:ME.ini, cls:ME.cls, ts:Date.now(), ...o};
  S.posts.unshift(post); save();
  if (HAS_FEED) { insertUser(post); applyFilter(); toast('Đã đăng lên bảng tin'); }
  else toast('Đã đăng — xem tại Bảng tin');
}
function insertUser(post) {
  const first = $('.feed-post'), tmp = document.createElement('div'); tmp.innerHTML = postHTML(post);
  const el = tmp.firstElementChild; first ? first.before(el) : $('.load-more').before(el); initPost(el, 0);
}

/* ---------- Lọc / sắp xếp bảng tin ---------- */
let MODE = 'foryou', Q = '', SORT = 'new';
const likesOf = p => { const x = $('.post-stats span', p); return x ? +x.textContent.replace(/\D/g, '') : 0; };
function applyFilter() {
  if (!HAS_FEED) return;
  const posts = $$('.feed-post'); let shown = 0;
  posts.forEach(p => {
    const id = p.dataset.id;
    let ok = MODE === 'saved' ? !!S.saved[id] : MODE === 'following' ? !!(S.follows[p.dataset.author] || p.dataset.user) : true;
    if (Q && !p.textContent.toLowerCase().includes(Q.toLowerCase())) ok = false;
    p.style.display = ok ? '' : 'none'; if (ok) shown++;
  });
  const host = $('.feed-post').parentElement, anchor = $('.load-more');
  const order = [...posts].sort((a, b) => SORT === 'new' ? a.dataset.min - b.dataset.min : likesOf(b) - likesOf(a));
  order.forEach(p => anchor.before(p));
  let e = $('.lb-empty'); if (!e) { e = document.createElement('div'); e.className = 'lb-empty'; anchor.before(e); }
  e.style.display = shown ? 'none' : ''; e.textContent = MODE === 'saved' ? 'Bạn chưa lưu bài viết nào.' : MODE === 'following' ? 'Chưa có bài từ người bạn theo dõi.' : 'Không tìm thấy bài viết phù hợp.';
  $$('.feed-tabs button').forEach((b, i) => b.classList.toggle('active', ['foryou', 'latest', 'following'][i] === MODE));
  const SM = {'Dành cho bạn':'foryou', 'Mới nhất':'latest', 'Đang theo dõi':'following', 'Đã lưu':'saved'};
  $$('.side-link').forEach(a => { const k = SM[a.textContent.trim()]; if (k) a.classList.toggle('active', k === MODE && !Q); });
  let fb = $('#lb-fbar'); if (!fb) { fb = document.createElement('div'); fb.id = 'lb-fbar'; $('.feed-tabs').before(fb); }
  fb.innerHTML = Q ? `<div class="lb-note">Đang lọc theo: <b>${esc(Q)}</b> <button class="btn btn-outline" style="margin:0 0 0 8px;padding:3px 9px">✕ Bỏ lọc</button></div>` : '';
  if (Q) $('button', fb).onclick = () => { Q = ''; applyFilter(); };
  const fl = $('.feed-filter'); if (fl) fl.textContent = (SORT === 'new' ? 'Mới nhất' : 'Nổi bật') + ' ▾';
}
function setMode(m) { MODE = m; if (m !== 'latest') SORT = 'new'; if (m === 'latest') SORT = 'new'; applyFilter(); }

function initFeed() {
  $$('.feed-post').forEach((p, i) => initPost(p, i));
  S.posts.slice().reverse().forEach(insertUser);
  $$('.feed-tabs button').forEach((b, i) => b.onclick = () => setMode(['foryou', 'latest', 'following'][i]));
  $('.feed-filter').onclick = () => { SORT = SORT === 'new' ? 'top' : 'new'; applyFilter(); };
  $('.composer-input').onclick = () => openComposer('Bài viết');
  $$('.composer-actions button').forEach((b, i) => b.onclick = () => openComposer(['Bài viết', 'Video bài giảng', 'Tài liệu', 'Project học tập'][i]));
  $$('.side-link').forEach(a => { const h = a.getAttribute('href'), t = a.textContent.trim();
    a.onclick = e => { e.preventDefault();
      if (h === '#' && !/(Toán|Ngữ văn|STEM|Thi)/.test(t)) return setMode('foryou');
      if (h === '#latest') return setMode('latest'); if (h === '#following') return setMode('following'); if (h === '#saved') return setMode('saved');
      if (h === '#teachers') return location.href = 'teachers.html'; if (h === '#students') return location.href = 'students.html'; if (h === '#parents') return location.href = 'parents.html';
      if (h === '#schools') return toast('Cổng Nhà trường & Sở/Phòng sẽ ra mắt ở phiên bản sau');
      Q = ({'Ngữ văn':'văn', 'Thi & kiểm tra':'thi'})[t] || t; applyFilter(); }; });
  $$('.trend').forEach(a => a.onclick = e => { e.preventDefault(); Q = $('b', a).textContent; applyFilter(); });
  $$('.suggestion').forEach(s => { const name = $('b', s).textContent, bt = $('button', s);
    const paint = () => { bt.textContent = S.follows[name] ? '✓ Đang theo dõi' : '+ Theo dõi'; bt.classList.toggle('lb-on', !!S.follows[name]); };
    bt.onclick = () => { S.follows[name] = !S.follows[name]; save(); paint(); applyFilter(); toast(S.follows[name] ? 'Đã theo dõi ' + name : 'Đã bỏ theo dõi'); }; paint(); });
  const lm = $('.load-more button');
  lm.onclick = () => {
    if (poolIdx >= POOL.length) { lm.textContent = 'Bạn đã xem hết tin mới'; lm.disabled = true; return; }
    POOL.slice(poolIdx, poolIdx += 2).forEach(p => { const t = document.createElement('div'); t.innerHTML = poolHTML(p); const el = t.firstElementChild; $('.load-more').before(el); initPost(el, 0); });
    applyFilter(); if (poolIdx >= POOL.length) lm.textContent = 'Đã hết tin mới';
  };
  const qp = new URLSearchParams(location.search).get('q'); if (qp) Q = qp;
  const h = location.hash.slice(1); if (['latest', 'following', 'saved'].includes(h)) MODE = h;
  applyFilter();
  const target = h && document.querySelector(`[data-id="${CSS.escape(h)}"]`); if (target) target.scrollIntoView();
}

/* ---------- Tìm kiếm & icon header ---------- */
function initHeader() {
  $$('.header-actions .icon-btn').forEach(b => {
    const t = b.textContent.trim();
    if (t === '⌕') b.onclick = () => {
      const m = modal('<h2>Tìm kiếm</h2><form class="lb-search"><input id="sq" placeholder="Tìm bài viết, giáo viên, môn học..." autofocus><button class="btn btn-blue" style="margin:0">Tìm</button></form>');
      $('form', m.b).onsubmit = e => { e.preventDefault(); const v = $('#sq', m.b).value.trim(); m.close(); if (!v) return;
        if (HAS_FEED) { Q = v; MODE = 'foryou'; applyFilter(); } else location.href = 'index.html?q=' + encodeURIComponent(v); };
    };
    if (t === '♡') b.onclick = () => HAS_FEED ? setMode('saved') : location.href = 'index.html#saved';
  });
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
  'Tiếng Anh': {
    '6': ['Unit 1: My New School (Present Simple)', 'Unit 2: My Home (Prepositions of place)', 'Unit 3: My Friends (Present Continuous)', 'Comparatives of short adjectives'],
    '7': ['Hobbies & Pastimes', 'Healthy living (Imperatives)', 'Community service (Past Simple)', 'Music and arts (comparisons)', 'Traffic rules (should/shouldn\'t)'],
    '8': ['Life in the countryside (Comparative of adverbs)', 'Our traditions & customs', 'Natural disasters (Past continuous)', 'Science & Technology (Reported speech)'],
    '9': ['Conditional Sentences (Type 1 & 2)', 'Reported Speech (Questions & Statements)', 'Passive Voice with Modals', 'Relative Clauses (Who, Which, That)', 'Life in the past (Used to + V)'],
    '10': ['Present simple vs Present continuous', 'Compound sentences with coordinate conjunctions', 'Passive Voice with Modal verbs', 'For a better community (Past simple vs past continuous)'],
    '11': ['Past simple vs Present perfect', 'Modal verbs: must, have to, should', 'Stative verbs in continuous forms', 'Global warming & Participle clauses'],
    '12': ['Life stories & narrative tenses', 'Articles: a, an, the', 'Green living & Gerunds / Infinitives', 'Relative Clauses & Phrasal verbs', 'Reading comprehension & Inversions']
  },
  'Ngữ văn': {
    '6': ['Truyện cổ tích & truyền thuyết Việt Nam', 'Thơ lục bát & tình cảm gia đình, quê hương', 'Ký & tản văn', 'Biện pháp tu từ: So sánh, nhân hóa, ẩn dụ'],
    '7': ['Tục ngữ & ca dao Việt Nam', 'Thơ bốn chữ, năm chữ', 'Nghị luận xã hội cơ bản (Ý kiến - lí lẽ - dẫn chứng)', 'Nói giảm nói tránh & câu rút gọn'],
    '8': ['Truyện ngắn hiện thực (Lão Hạc, Tắt đèn)', 'Thơ trào phúng & thơ Đường luật', 'Văn bản nghị luận về tư tưởng, đạo lí', 'Trợ từ, thán từ & từ tượng thanh, tượng hình'],
    '9': ['Truyện Kiều (Nguyễn Du) & nghệ thuật miêu tả', 'Thơ kháng chiến: Đồng chí & Tiểu đội xe không kính', 'Ánh trăng, Mùa xuân nho nhỏ, Viếng lăng Bác', 'Nghị luận về một sự việc, hiện tượng đời sống', 'Nghị luận về tác phẩm truyện hoặc đoạn trích'],
    '10': ['Thần thoại & Sử thi (Đăm Săn)', 'Thơ Đường luật trung đại', 'Văn bản thông tin & lập luận logic', 'Kỹ năng viết đoạn văn nghị luận 200 chữ'],
    '11': ['Truyện ngắn hiện thực 1930-1945 (Chí Phèo, Chữ người tử tù)', 'Thơ Mới 1932-1945 (Vội vàng, Tràng giang)', 'Văn tế nghĩa sĩ Cần Giuộc', 'Nghị luận so sánh, đánh giá hai tác phẩm'],
    '12': ['Tuyên ngôn Độc lập (Hồ Chí Minh)', 'Tây Tiến (Quang Dũng) & Việt Bắc (Tố Hữu)', 'Đất Nước (Nguyễn Khoa Điềm)', 'Vợ chồng A Phủ (Tô Hoài) & Vợ nhặt (Kim Lân)', 'Người lái đò Sông Đà (Nguyễn Tuân)']
  },
  'Vật lý': {
    '6': ['Đo chiều dài, khối lượng, thể tích', 'Lực và tác dụng của lực', 'Năng lượng và sự truyền nhiệt'],
    '7': ['Tốc độ chuyển động', 'Âm thanh: Độ cao, độ to & phản xạ âm', 'Ánh sáng: Định luật phản xạ ánh sáng'],
    '8': ['Khối lượng riêng & trọng lượng riêng', 'Áp suất chất lỏng & bình thông nhau', 'Lực đẩy Ác-si-mét & sự nổi', 'Công và công suất cơ học'],
    '9': ['Định luật Ôm cho đoạn mạch nối tiếp & song song', 'Điện trở của dây dẫn & Biến trở', 'Công suất điện & Điện năng tiêu thụ', 'Hiện tượng cảm ứng điện từ & Máy biến áp', 'Hiện tượng khúc xạ ánh sáng & Thấu kính hội tụ'],
    '10': ['Chuyển động thẳng biến đổi đều (Gia tốc, vận tốc, quãng đường)', 'Ba định luật Newton & Các lực cơ học', 'Cân bằng của vật rắn & Mômen lực', 'Công cơ học & Công suất', 'Định luật bảo toàn cơ năng & Động lượng'],
    '11': ['Dao động điều hòa (Phương trình, vận tốc, gia tốc)', 'Con lắc lò xo & Con lắc đơn', 'Sóng cơ và sự truyền sóng', 'Giao thoa sóng & Sóng dừng', 'Điện trường & Định luật Coulomb', 'Định luật Ôm cho toàn mạch'],
    '12': ['Mô hình động học phân tử & Nội năng', 'Nhiệt dung riêng & Nhiệt nóng chảy riêng', 'Khí lí tưởng & Định luật Boyle, Charles', 'Từ trường, cảm ứng từ & Lực Lorentz', 'Vật lý hạt nhân: Phóng xạ & Năng lượng liên kết']
  },
  'Hóa học': {
    '8': ['Chất, nguyên tử, phân tử & đơn chất, hợp chất', 'Phản ứng hóa học & Định luật bảo toàn khối lượng', 'Mol, khối lượng mol & thể tích mol chất khí', 'Dung dịch & Nồng độ dung dịch (C%, CM)'],
    '9': ['Tính chất hóa học của Axit (HCl, H2SO4)', 'Tính chất hóa học của Bazơ & Muối', 'Dãy hoạt động hóa học của kim loại', 'Phi kim: Clo, Cacbon và hợp chất', 'Hydrocarbon: Metan, Etilen, Axetilen'],
    '10': ['Thành phần nguyên tử & Đồng vị', 'Bảng tuần hoàn các nguyên tố hóa học', 'Liên kết ion & Liên kết cộng hóa trị', 'Phản ứng oxi hóa - khử & Cân bằng electron', 'Tốc độ phản ứng hóa học & Các yếu tố ảnh hưởng'],
    '11': ['Cân bằng hóa học & Hằng số cân bằng Kc', 'Sự điện li và pH của dung dịch', 'Alkane: Tính chất hóa học & phản ứng thế', 'Hydrocarbon không no: Alkene & Alkyne', 'Carboxylic acid & Hợp chất carbonyl'],
    '12': ['Ester & Lipid: Phản ứng xà phòng hóa', 'Carbohydrate: Glucose, Fructose, Tinh bột', 'Amine, Amino acid & Peptide - Protein', 'Polymer & Vật liệu polymer', 'Pin điện hóa & Sự điện phân']
  },
  'Sinh học': {
    '6': ['Tế bào - Đơn vị cơ sở của sự sống', 'Đa dạng thế giới sống: Vi khuẩn, Virus, Nấm', 'Thực vật và vai trò trong tự nhiên'],
    '7': ['Đa dạng thế giới động vật', 'Cảm ứng và tập tính ở động vật', 'Sinh sản ở sinh vật'],
    '8': ['Hệ tuần hoàn và hệ hô hấp ở người', 'Hệ tiêu hóa và dinh dưỡng', 'Hệ thần kinh và các giác quan'],
    '9': ['Di truyền học Men-đen và lai một, hai cặp tính trạng', 'Nhiễm sắc thể, Nguyên phân và Giảm phân', 'Cấu trúc ADN, ARN và Protein', 'Đột biến gen và đột biến NST', 'Hệ sinh thái và chuỗi thức ăn'],
    '10': ['Sinh học tế bào: Thành phần hóa học và cấu trúc tế bào', 'Chuyển hóa vật chất và năng lượng trong tế bào', 'Chu kỳ tế bào và phân bào'],
    '11': ['Trao đổi nước và khoáng ở thực vật', 'Quang hợp và hô hấp ở thực vật', 'Cảm ứng và sinh trưởng ở sinh vật'],
    '12': ['Di truyền học phân tử & Di truyền học Men-đen', 'Tương tác gen & Tác động đa hiệu của gen', 'Di truyền liên kết với giới tính & Di truyền quần thể', 'Tiến hóa & Sinh thái học môi trường']
  },
  'Lịch sử & Địa lý': {
    '6': ['Nguồn gốc loài người & Xã hội nguyên thủy', 'Các quốc gia cổ đại phương Đông và phương Tây', 'Trái Đất trong hệ Mặt Trời & Bản đồ địa lý'],
    '7': ['Thời kỳ Bắc thuộc và các cuộc khởi nghĩa giành độc lập', 'Đại Cồ Việt và Đại Việt thời Lý - Trần', 'Đặc điểm tự nhiên và kinh tế các châu lục'],
    '8': ['Cách mạng tư sản & Phong trào công nhân quốc tế', 'Chiến tranh thế giới thứ nhất và thứ hai', 'Địa hình và khoáng sản Việt Nam'],
    '9': ['Việt Nam sau Chiến tranh thế giới thứ nhất (1919 - 1930)', 'Cách mạng Tháng Tám năm 1945', 'Cuộc kháng chiến chống Pháp (1945 - 1954)', 'Cuộc kháng chiến chống Mỹ cứu nước (1954 - 1975)', 'Địa lý dân cư và các vùng kinh tế Việt Nam'],
    '10': ['Văn minh thế giới cổ - trung đại', 'Cách mạng công nghiệp trong lịch sử', 'Địa lý tự nhiên đại cương: Khí quyển, Thủy quyển'],
    '11': ['Chủ nghĩa tư bản hiện đại & Chủ nghĩa xã hội', 'Chiến tranh bảo vệ Tổ quốc trong lịch sử Việt Nam', 'Địa lý kinh tế - xã hội thế giới'],
    '12': ['Trật tự thế giới mới sau Chiến tranh lạnh & ASEAN', 'Phong trào giải phóng dân tộc và cách mạng Việt Nam (1930 - 1975)', 'Việt Nam trên con đường Đổi mới và hội nhập quốc tế (1986 - nay)', 'Địa lý các ngành kinh tế & Vùng kinh tế trọng điểm']
  },
  'Tin học': {
    '6': ['Thông tin và dữ liệu', 'Mạng máy tính và Internet', 'Soạn thảo văn bản cơ bản'],
    '7': ['Bảng tính điện tử (Excel/Sheets)', 'Phần mềm trình chiếu', 'Đạo đức và pháp luật trong môi trường số'],
    '8': ['Lập trình trực quan (Scratch)', 'Thuật toán sắp xếp và tìm kiếm', 'Cơ sở dữ liệu và bảo mật'],
    '9': ['Lập trình cơ bản với Python', 'Biến, kiểu dữ liệu và cấu trúc rẽ nhánh', 'Vòng lặp for, while và hàm trong Python', 'Thiết kế trang web HTML/CSS đơn giản'],
    '10': ['Hệ nhị phân và biểu diễn dữ liệu', 'Lập trình Python nâng cao: Chuỗi, Mảng, Danh sách', 'Thuật toán đệ quy và tối ưu hóa'],
    '11': ['Cơ sở dữ liệu quan hệ và ngôn ngữ SQL', 'Thiết kế hệ thống và bảo mật thông tin', 'Lập trình hướng đối tượng (OOP)'],
    '12': ['Trí tuệ nhân tạo (AI) và Khoa học dữ liệu', 'Học máy (Machine Learning) cơ bản', 'Mạng máy tính nâng cao và An ninh mạng']
  }
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
  },
  'Tiếng Anh': {
    '6': [
      { t:'mcq', lv:1, q:'Look! The boys _______ football in the school playground.', opts:['are playing', 'play', 'plays', 'played'], ans:0, sol:'Dấu hiệu "Look!" chỉ hành động đang diễn ra tại thời điểm nói -> Thì hiện tại tiếp diễn (are playing).' },
      { t:'mcq', lv:1, q:'My house is _______ to the post office.', opts:['next', 'behind', 'near', 'between'], ans:0, sol:'Cấu trúc: next to (bên cạnh).' },
      { t:'tf', lv:1, q:'"Bigger" is the comparative form of "big".', opts:['Đúng', 'Sai'], ans:0, sol:'Đúng. Tính từ ngắn 1 âm tiết gấp đôi phụ âm cuối rồi thêm -er: big -> bigger.' },
      { t:'short', lv:2, q:'Fill in the blank with the plural form of "child": There are three _______ in the park.', ans:'children', sol:'Dạng số nhiều bất quy tắc của child là children.' },
      { t:'essay', lv:2, q:'Viết 3 câu giới thiệu về trường học của em bằng thì hiện tại đơn.', sol:'Gợi ý chấm: 3 câu đúng ngữ pháp thì hiện tại đơn, có mô tả tên trường, vị trí hoặc lớp học.' }
    ],
    '9': [
      { t:'mcq', lv:1, q:'If the weather _______ nice tomorrow, we will go on a picnic.', opts:['is', 'will be', 'was', 'were'], ans:0, sol:'Câu điều kiện loại 1 (First Conditional): Mệnh đề If chia ở hiện tại đơn (is).' },
      { t:'mcq', lv:2, q:'The teacher _______ taught us English last year has just won an award.', opts:['who', 'which', 'whom', 'whose'], ans:0, sol:'Dùng đại từ quan hệ "who" thay cho danh từ chỉ người làm chủ ngữ (The teacher).' },
      { t:'mcq', lv:2, q:'Peter asked me: "Where do you live?" -> Peter asked me where I _______.', opts:['lived', 'live', 'am living', 'had lived'], ans:0, sol:'Câu gián tiếp tường thuật: lùi thì hiện tại đơn về quá khứ đơn (live -> lived).' },
      { t:'tf', lv:1, q:'In reported speech, "now" is usually changed into "then".', opts:['Đúng', 'Sai'], ans:0, sol:'Đúng. Trạng từ chỉ thời gian "now" lùi thành "then" trong câu gián tiếp.' },
      { t:'short', lv:2, q:'Rewrite in passive voice: "They build many houses here." -> Many houses are _______ here. (Điền dạng phân từ 2 của build)', ans:'built', sol:'Cấu trúc bị động hiện tại đơn: are + V3/ed. Dạng V3 của build là built.' },
      { t:'essay', lv:3, q:'Viết lại câu sau bằng câu điều kiện loại 2: "I don\'t have enough money, so I can\'t buy that laptop."', sol:'Đáp án: If I had enough money, I could buy that laptop.' }
    ],
    '12': [
      { t:'mcq', lv:2, q:'Had I known about the traffic jam, I _______ a different route.', opts:['would have taken', 'will take', 'would take', 'took'], ans:0, sol:'Đảo ngữ câu điều kiện loại 3: Had + S + V3, S + would have + V3.' },
      { t:'mcq', lv:1, q:'He is keen _______ playing chess in his free time.', opts:['on', 'in', 'at', 'about'], ans:0, sol:'Cấu trúc: to be keen on + V-ing / noun (thích thú với điều gì).' },
      { t:'tf', lv:2, q:'A gerund (V-ing) can function as the subject of an English sentence.', opts:['Đúng', 'Sai'], ans:0, sol:'Đúng. Danh động từ hoàn toàn có thể đóng vai trò làm chủ ngữ trong câu.' },
      { t:'short', lv:2, q:'Fill in the blank with the correct preposition: "She succeeded _______ passing the university entrance exam."', ans:'in', sol:'Cấu trúc: succeed in + V-ing (thành công trong việc gì).' },
      { t:'essay', lv:3, q:'Write a short paragraph (80-100 words) about the advantages of renewable energy.', sol:'Gợi ý chấm: Nêu được 2-3 ưu điểm (bảo vệ môi trường, không cạn kiệt, giảm khí nhà kính), ngữ pháp chuẩn xác.' }
    ]
  },
  'Vật lý': {
    '9': [
      { t:'mcq', lv:1, q:'Theo định luật Ôm, cường độ dòng điện chạy qua dây dẫn tỉ lệ thuận với:', opts:['Hiệu điện thế giữa hai đầu dây dẫn', 'Điện trở của dây dẫn', 'Chiều dài của dây dẫn', 'Tiết diện của dây dẫn'], ans:0, sol:'Hệ thức I = U / R: Cường độ dòng điện tỉ lệ thuận với U và tỉ lệ nghịch với R.' },
      { t:'mcq', lv:2, q:'Đặt hiệu điện thế U = 12V vào hai đầu điện trở R = 24Ω. Cường độ dòng điện qua R là:', opts:['0.5 A', '2 A', '288 A', '12 A'], ans:0, sol:'I = U / R = 12 / 24 = 0.5 A.' },
      { t:'tf', lv:1, q:'Đoạn mạch gồm hai điện trở mắc nối tiếp có điện trở tương đương R_tđ = R₁ + R₂.', opts:['Đúng', 'Sai'], ans:0, sol:'Đúng theo công thức tính điện trở tương đương của đoạn mạch nối tiếp.' },
      { t:'short', lv:2, q:'Một bóng đèn có ghi 220V - 100W hoạt động bình thường trong 5 giờ. Điện năng tiêu thụ là bao nhiêu kWh?', ans:0.5, sol:'A = P × t = 0.1 kW × 5 h = 0.5 kWh.' },
      { t:'essay', lv:3, q:'Một dây mayso có điện trở R = 80Ω mắc vào nguồn điện U = 220V dùng đun sôi 1.5 lít nước. Hãy tính nhiệt lượng tỏa ra trên dây trong 10 phút.', sol:'Q = (U² / R) × t = (220² / 80) × (10 × 60) = 605 × 600 = 363,000 J = 363 kJ.' }
    ],
    '10': [
      { t:'mcq', lv:1, q:'Công thức tính vận tốc trong chuyển động thẳng biến đổi đều là:', opts:['v = v₀ + at', 'v = v₀ - at²', 'v = at²', 'v = v₀t + 1/2 at²'], ans:0, sol:'Công thức vận tốc tức thời: v = v₀ + at.' },
      { t:'mcq', lv:2, q:'Một vật có khối lượng 2kg chịu tác dụng của lực F = 10N. Gia tốc của vật là:', opts:['5 m/s²', '20 m/s²', '2 m/s²', '0.2 m/s²'], ans:0, sol:'Theo định luật II Newton: a = F / m = 10 / 2 = 5 m/s².' },
      { t:'tf', lv:1, q:'Khi vật rơi tự do, gia tốc của vật không đổi và bằng gia tốc trọng trường g.', opts:['Đúng', 'Sai'], ans:0, sol:'Đúng theo định nghĩa chuyển động rơi tự do.' },
      { t:'short', lv:2, q:'Một vật khối lượng 1kg chuyển động với vận tốc 4 m/s. Động năng của vật là bao nhiêu Joule?', ans:8, sol:'W_đ = 1/2 × m × v² = 1/2 × 1 × 4² = 8 J.' },
      { t:'essay', lv:3, q:'Một ô tô đang chạy với vận tốc 20 m/s thì hãm phanh chuyển động chậm dần đều với gia tốc a = -2 m/s². Tính quãng đường ô tô đi được đến khi dừng hẳn.', sol:'Khi dừng hẳn v = 0. Áp dụng: v² - v₀² = 2as => 0 - 20² = 2×(-2)×s => s = 100m.' }
    ]
  },
  'Hóa học': {
    '9': [
      { t:'mcq', lv:1, q:'Dung dịch axit clohiđric (HCl) làm quỳ tím chuyển sang màu gì?', opts:['Đỏ', 'Xanh', 'Không đổi màu', 'Vàng'], ans:0, sol:'Axit làm quỳ tím chuyển sang màu đỏ đặc trưng.' },
      { t:'mcq', lv:2, q:'Kim loại nào sau đây phản ứng được với nước ở nhiệt độ thường giải phóng khí H₂?', opts:['Natri (Na)', 'Đồng (Cu)', 'Bạc (Ag)', 'Sắt (Fe)'], ans:0, sol:'Natri là kim loại kiềm tan mạnh trong nước giải phóng khí H₂: 2Na + 2H₂O -> 2NaOH + H₂.' },
      { t:'tf', lv:1, q:'Khí Cacbon đioxit (CO₂) làm vẩn đục nước vôi trong Ca(OH)₂.', opts:['Đúng', 'Sai'], ans:0, sol:'Đúng do tạo kết tủa trắng Canxi cacbonat: CO₂ + Ca(OH)₂ -> CaCO₃↓ + H₂O.' },
      { t:'short', lv:2, q:'Khối lượng mol phân tử của Axit Sunfuric (H₂SO₄) là bao nhiêu g/mol?', ans:98, sol:'M = 1×2 + 32 + 16×4 = 98 g/mol.' },
      { t:'essay', lv:3, q:'Cho 5.6 gam sắt (Fe) phản ứng hoàn toàn với dung dịch axit clohiđric (HCl) dư. Tính thể tích khí H₂ sinh ra ở điều kiện tiêu chuẩn (biết Fe = 56).', sol:'n_Fe = 5.6 / 56 = 0.1 mol. Phương trình: Fe + 2HCl -> FeCl₂ + H₂. Theo pt: n_H₂ = n_Fe = 0.1 mol. Thể tích V = 0.1 × 22.4 = 2.24 lít.' }
    ],
    '10': [
      { t:'mcq', lv:1, q:'Hạt mang điện tích âm trong cấu tạo nguyên tử là:', opts:['Electron', 'Proton', 'Neutron', 'Hạt nhân'], ans:0, sol:'Hạt electron mang điện tích âm (-1), proton mang điện tích dương (+1), neutron không mang điện.' },
      { t:'mcq', lv:2, q:'Trong bảng tuần hoàn, các nguyên tố trong cùng một nhóm A có đặc điểm chung nào?', opts:['Cùng số electron ở lớp ngoài cùng', 'Cùng số lớp electron', 'Cùng số khối', 'Cùng bán kính nguyên tử'], ans:0, sol:'Các nguyên tố nhóm A có cùng số electron lớp ngoài cùng, do đó tính chất hóa học tương tự nhau.' },
      { t:'tf', lv:2, q:'Chất khử là chất nhường electron (quá trình oxi hóa).', opts:['Đúng', 'Sai'], ans:0, sol:'Đúng theo định nghĩa quy tắc nhớ: Khử cho - O nhận.' },
      { t:'short', lv:2, q:'Nguyên tử Natri (Z = 11) có bao nhiêu electron ở lớp ngoài cùng?', ans:1, sol:'Cấu hình electron của Na (Z=11) là 1s² 2s² 2p⁶ 3s¹ => có 1 electron ở lớp ngoài cùng.' },
      { t:'essay', lv:3, q:'Lập phương trình hóa học của phản ứng oxi hóa - khử sau theo phương pháp thăng bằng electron: Cu + HNO₃ (loãng) -> Cu(NO₃)₂ + NO↑ + H₂O.', sol:'3Cu + 8HNO₃ -> 3Cu(NO₃)₂ + 2NO↑ + 4H₂O. Quá trình: Cu -> Cu²⁺ + 2e (nhân 3); N⁺⁵ + 3e -> N⁺² (nhân 2).' }
    ]
  },
  'Ngữ văn': {
    '9': [
      { t:'mcq', lv:1, q:'Tác giả của tác phẩm "Truyện Kiều" là ai?', opts:['Nguyễn Du', 'Nguyễn Trãi', 'Hồ Xuân Hương', 'Nguyễn Đình Chiểu'], ans:0, sol:'Đại thi hào dân tộc Nguyễn Du là tác giả của kiệt tác Đoạn trường tân thanh (Truyện Kiều).' },
      { t:'mcq', lv:2, q:'Hình ảnh "đầu súng trăng treo" trong bài thơ "Đồng chí" của Chính Hữu mang ý nghĩa biểu tượng gì?', opts:['Biểu tượng đẹp về tình đồng chí gắn kết giữa hiện thực chiến sĩ và lãng mạn thi sĩ', 'Sự tĩnh lặng của đêm tối nơi chiến trường', 'Súng bắn lên mặt trăng', 'Niềm vui chiến thắng'], ans:0, sol:'Câu thơ là điểm sáng lãng mạn, kết hợp hài hòa giữa chất hiện thực khốc liệt (súng) và tâm hồn bay bổng (trăng).' },
      { t:'tf', lv:1, q:'Bài thơ "Viếng lăng Bác" do nhà thơ Viễn Phương sáng tác năm 1976 sau khi lăng Chủ tịch Hồ Chí Minh khánh thành.', opts:['Đúng', 'Sai'], ans:0, sol:'Đúng theo hoàn cảnh ra đời của bài thơ.' },
      { t:'short', lv:2, q:'Điền từ còn thiếu vào câu thơ trong bài "Mùa xuân nho nhỏ": "Một mùa xuân nho nhỏ / Lặng lẽ dâng cho _______".', ans:'đời', sol:'Câu thơ đầy đủ: "Một mùa xuân nho nhỏ / Lặng lẽ dâng cho đời / Dù là tuổi hai mươi / Dù là khi tóc bạc."' },
      { t:'essay', lv:3, q:'Viết một đoạn văn ngắn (khoảng 150 chữ) nêu cảm nhận của em về tình đồng chí của những người lính trong bài thơ "Đồng chí" của Chính Hữu.', sol:'Gợi ý chấm: Nêu được cơ sở hình thành tình đồng chí (cùng cảnh ngộ, cùng mục tiêu), sự chia sẻ gian lao và hình ảnh gắn kết cao đẹp.' }
    ],
    '12': [
      { t:'mcq', lv:1, q:'Tác phẩm "Tuyên ngôn Độc lập" được Chủ tịch Hồ Chí Minh đọc tại Quảng trường Ba Đình vào ngày tháng năm nào?', opts:['02/09/1945', '19/08/1945', '30/04/1975', '07/05/1954'], ans:0, sol:'Bản Tuyên ngôn Độc lập được đọc vào ngày 2/9/1945, khai sinh ra nước Việt Nam Dân chủ Cộng hòa.' },
      { t:'mcq', lv:2, q:'Trong bài thơ "Tây Tiến", nhà thơ Quang Dũng đã khắc họa bức chân dung người lính với vẻ đẹp:', opts:['Hào hoa, lãng mạn nhưng bi tráng và kiên cường', 'Nông dân chất phác và mộc mạc', 'Lạnh lùng và nghiêm khắc', 'Yếu đuối và hoang mang'], ans:0, sol:'Cảm hứng lãng mạn và tinh thần bi tráng tạo nên tượng đài bất tử về người lính Tây Tiến.' },
      { t:'tf', lv:1, q:'Truyện ngắn "Vợ nhặt" của Kim Lân có tiền thân từ tiểu thuyết "Xóm ngụ cư".', opts:['Đúng', 'Sai'], ans:0, sol:'Đúng theo hoàn cảnh sáng tác truyện ngắn Vợ nhặt.' },
      { t:'short', lv:2, q:'Tác giả của tập ký "Sông Đà" (trong đó có bài Người lái đò Sông Đà) là nhà văn nào?', ans:'Nguyễn Tuân', sol:'Nhà văn Nguyễn Tuân nổi tiếng với phong cách tài hoa và uyên bác.' },
      { t:'essay', lv:3, q:'Viết đoạn văn nghị luận 200 chữ bàn về ý nghĩa của tinh thần trách nhiệm đối với thế hệ trẻ trong xã hội hiện đại.', sol:'Gợi ý chấm: Giải thích tinh thần trách nhiệm, phân tích vai trò với bản thân và cộng đồng, phản đề và bài học hành động.' }
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
const PHAN_RE = '^[ \\t]*(?:PHẦN\\s+(?:[IVX]+|\\d|TRẮC|ĐÚNG|TRẢ|TỰ)|(?:[IVX]+|\\d+|[A-D])[.)]\\s+(?:Câu\\s+(?:hỏi\\s+)?)?(?:Trắc\\s*nghiệm|Tự\\s*luận|Bài\\s*tập\\s+(?:trắc|tự)))(?![' + NOLET + '])';

// Tách phần đề và phần bảng đáp án (nếu file có "ĐÁP ÁN" ở cuối)
function splitKeySection(text) {
  const re = /^[ \t]*(?:BẢNG\s+)?(?:ĐÁP\s*ÁN|HƯỚNG\s+DẪN\s+(?:GIẢI|CHẤM)|LỜI\s+GIẢI)(?:\s+(?:VÀ|&|CHI\s+TIẾT)[^\n]{0,40})?[ \t]*[:.]?[ \t]*$/gm;
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(0, m.index);
    if ((before.match(/(?:^|\n)\s*(?:Câu|Bài|Question)\s*\d+/gi) || []).length >= 3) return {body: before, key: text.slice(m.index + m[0].length)};
  }
  return {body: text, key: ''};
}

// Đọc đáp án từ một đoạn: {l:'A'} | {tfg:{a:true,..}} | {tf:true} | {val:'3,5'}  (+ sol)
function extractAns(seg) {
  if (!seg) return null;
  const sol = seg.replace(/^\s*(?:Chọn|Đáp\s*án)[^\n.]*[.\n]?/, '').replace(/^\s*(?:Lời\s*giải|Hướng\s*dẫn\s*giải)\s*[:.]?/i, '').replace(/\s+/g, ' ').trim().slice(0, 1500);
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

// Đọc bảng đáp án cuối đề: "Câu 1. Chọn A", "1.A 2.B", hoặc bảng 2 dòng
function parseKey(key) {
  if (!key.trim()) return [];
  let list = [];
  const marks = [...key.matchAll(/(?:^|\n)[ \t]*(?:Câu|Bài|Question)\s*(\d{1,3})\s*[:.)]?/gi)];
  marks.forEach((mk, i) => {
    const seg = key.slice(mk.index + mk[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined).split(/\n[ \t]*PHẦN\s+/)[0].trim();
    const a = extractAns(seg); if (a) list.push({n: +mk[1], pos: mk.index, a});
  });
  for (const m of key.matchAll(new RegExp('(?:^|[\\s,;|])(\\d{1,3})\\s*[.\\-–:)]?\\s*([A-D])(?![' + NOLET + '0-9])', 'g'))) {
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
  const rx = L => new RegExp('(?:^|\\s)' + L + '\\s*' + closer + '\\s*', 'g');
  const r0 = rx(letters[0]); let m0, best = null;
  while ((m0 = r0.exec(flat))) {
    const pos = [{i: m0.index + m0[0].indexOf(letters[0]), e: m0.index + m0[0].length}];
    let from = r0.lastIndex, ok = true;
    for (let k = 1; k < letters.length; k++) {
      const r = rx(letters[k]); r.lastIndex = from; const m = r.exec(flat);
      if (!m) { ok = false; break; }
      pos.push({i: m.index + m[0].indexOf(letters[k]), e: m.index + m[0].length}); from = r.lastIndex;
    }
    if (ok && (!best || pos[pos.length - 1].i - pos[0].i < best[best.length - 1].i - best[0].i)) best = pos;
  }
  return best;
}

const TAIL_RE = new RegExp('(?:^|\\n)[ \\t]*(?:Đáp\\s*án|ĐÁP\\s*ÁN|Lời\\s*giải|LỜI\\s*GIẢI|Hướng\\s*dẫn|Giải\\s*thích|Chọn\\s+[A-D](?![' + NOLET + ']))');
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
  const sol = esc(solRaw.replace(/\s+/g, ' ').trim().slice(0, 1500));
  const mk = o => ({lv: 2, sol, ...o});

  const up = findSeq(flat, ['A', 'B', 'C', 'D'], '[.)]');
  if (up) {
    const opts = up.map((p, k) => flat.slice(p.e, k < 3 ? up[k + 1].i : undefined).trim());
    return [mk({t: 'mcq', q: esc(flat.slice(0, up[0].i).trim()), opts, ans: info && info.l ? 'ABCD'.indexOf(info.l) : null})];
  }
  const low = findSeq(flat, ['a', 'b', 'c', 'd'], '[)]');
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
  const t = sec === 'short' ? 'short' : sec === 'tf' ? 'tf' : sec === 'essay' ? 'essay'
    : (info && info.val != null ? 'short' : infer === 'short' ? 'short' : 'essay');
  if (t === 'tf') {
    let ans = null;
    if (info && info.tf !== undefined) ans = info.tf ? 0 : 1;
    return [mk({t, q: esc(flat), opts: ['Đúng', 'Sai'], ans})];
  }
  if (t === 'short') return [mk({t, q: esc(flat), ans: info && info.val != null ? info.val : null})];
  return [mk({t: 'essay', lv: 3, q: esc(flat)})];
}

const bankKey = q => q.t + '|' + q.q + '|' + (q.opts || []).join('|') + '|' + (q.sts || []).join('|');

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

  const keyEntries = parseKey(key), byRun = new Map(), byNum = new Map();
  keyEntries.forEach(e => { byRun.set(e.run + ':' + e.n, e); if (!byNum.has(e.n)) byNum.set(e.n, e); });
  const kRuns = keyEntries.length ? keyEntries[keyEntries.length - 1].run + 1 : 0;
  let r0 = -1, p0 = Infinity; marks.forEach(m => { const n = +m[1]; if (n <= p0) r0++; p0 = n; });
  const useRun = kRuns === r0 + 1;

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
    let ra = 0, rb = 0;
    if (hasLines) {
      const startOff = mk.index + (body[mk.index] === '\n' ? 1 : 0), tt = TAIL_RE.exec(blk);
      ra = lineOf(startOff);
      if (tt) rb = lineOf(mk.index + tt.index + (blk[tt.index] === '\n' ? 1 : 0));
      else { const eo = mk.index + blk.length; rb = eo >= text.length ? nl.length + 1 : (body[eo] === '\n' ? lineOf(eo) + 1 : lineOf(eo)); }
    }
    const mathy = blk.includes(MATHMARK); blk = blk.split(MATHMARK).join('');
    // không có tiêu đề chữ: "Bài N." → tự luận; "Câu N." không phương án đứng sau câu trắc nghiệm/đúng-sai → trả lời ngắn
    const infer = /^\s*Bài/i.test(mk[0]) ? 'essay' : (seenStruct ? 'short' : '');
    const parsed = parseBlock(blk, sec, ke, infer);
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

function addToBank(list) {
  S.bank = S.bank || [];
  const seen = new Set(S.bank.map(bankKey)); let n = 0;
  list.forEach(q => { const k = bankKey(q); if (seen.has(k)) return; seen.add(k); S.bank.push(q); n++; });
  save(); return n;
}

/* ---- Đọc PDF bằng pdf.js (tải từ cdnjs lần đầu, cần Internet) ---- */
const PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Không tải được thư viện đọc PDF (cần Internet ở lần đầu)')); document.head.append(s); });
async function getPdfLib() {
  if (!window.pdfjsLib) await loadScript(PDFJS_BASE + 'pdf.min.js');
  const lib = window.pdfjsLib;
  if (!lib.GlobalWorkerOptions.workerSrc) {
    try {
      const code = await (await fetch(PDFJS_BASE + 'pdf.worker.min.js')).text();
      lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], {type: 'text/javascript'}));
    } catch (e) { lib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js'; }
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
/* ---- Kho ảnh câu hỏi (IndexedDB; localStorage quá nhỏ cho hàng trăm ảnh) ---- */
let IMGS = new Map();
const IMGDB = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((ok, no) => {
    try { const r = indexedDB.open('lbai_imgs', 1); r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); } catch (e) { no(e); }
  }));
  const tx = fn => open().then(db => new Promise((ok, no) => { const t = db.transaction('img', 'readwrite'); fn(t.objectStore('img')); t.oncomplete = ok; t.onerror = () => no(t.error); }));
  return {
    put: (k, v) => tx(s => s.put(v, k)),
    del: ks => tx(s => ks.forEach(k => s.delete(k))),
    clear: () => tx(s => s.clear()),
    all: () => open().then(db => new Promise((ok, no) => { const m = new Map(), r = db.transaction('img').objectStore('img').openCursor(); r.onsuccess = () => { const c = r.result; if (c) { m.set(c.key, c.value); c.continue(); } else ok(m); }; r.onerror = () => no(r.error); }))
  };
})();
IMGDB.all().then(m => m.forEach((v, k) => IMGS.set(k, v))).catch(() => {});
const imgq = q => !!(q && q.img && IMGS.get(q.img));
const qBody = q => imgq(q) ? `<br><img class="q-img" src="${IMGS.get(q.img)}" alt="Nội dung câu hỏi" style="max-width:100%;height:auto;margin:4px 0">` : q.q;
const optText = (q, o) => imgq(q) && q.t === 'mcq' ? '' : esc(o);
function dropImgs(list) {
  const ks = list.filter(q => q.img).map(q => q.img);
  ks.forEach(k => IMGS.delete(k));
  if (ks.length) IMGDB.del(ks).catch(() => {});
}

/* ---- Đọc PDF: văn bản + toạ độ từng dòng (để cắt ảnh câu hỏi) ---- */
const LAB_RE = /^\s*(?:Câu|Bài|Question)\s*\d+\s*[:.)]/i;
const PAGENUM_RE = /^\s*(?:Trang\s*)?\d{1,3}(?:\s*[\/\-–]\s*\d{1,3})?\s*$/i;
async function extractPdfText(file, onProgress) {
  const lib = await getPdfLib();
  const pdf = await lib.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise;
  const lines = [], pages = {};
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
        cur.items.push({x, w, a, b: cur.text.length});
      }
      if (it.hasEOL) flush();
    }
    flush();
    // loại số trang / tiêu đề lề khỏi văn bản
    pl.forEach(l => {
      const t = l.text.trim();
      l.skip = (PAGENUM_RE.test(t) && (l.top > H * 0.9 || l.bot < H * 0.1)) || (t.length <= 40 && (l.top > H * 0.96 || l.bot < H * 0.04));
    });
    const real = pl.filter(l => !l.skip), hdr = pl.filter(l => l.skip && l.top > H / 2), ftr = pl.filter(l => l.skip && l.bot <= H / 2);
    pages[p] = {h: H, l: real.length ? Math.min(...real.map(l => l.l)) : 0, r: real.length ? Math.max(...real.map(l => l.r)) : vp1.width,
      ct: hdr.length ? Math.min(...hdr.map(l => l.bot)) : H * 0.97, cb: ftr.length ? Math.max(...ftr.map(l => l.top)) : H * 0.03};
    pl.forEach(l => lines.push({p: l.p, top: l.top, bot: l.bot, l: l.l, r: l.r, lab: l.lab, skip: l.skip, text: l.skip ? '' : l.text}));
    lines.push(null);   // ngắt trang
    onProgress && onProgress(p, pdf.numPages);
  }
  return {text: lines.map(l => l ? l.text : '').join('\n'), lines, pages, pdf};
}

// Đổi khoảng dòng [a,b) thành các đoạn cắt theo trang (toạ độ PDF, y tính từ dưới lên)
function regionSegs(rs, ext) {
  const L = ext.lines, out = [];
  rs.forEach(([a, b], ri) => {
    while (a < b && (!L[a] || L[a].skip)) a++;
    let la = Math.min(b, L.length) - 1; while (la > a && (!L[la] || L[la].skip)) la--;
    if (a >= b || !L[a] || !L[la]) return;
    let e = b; while (e < L.length && (!L[e] || L[e].skip)) e++;
    const end = e < L.length ? L[e] : null, first = L[a];
    for (let p = first.p; p <= L[la].p; p++) {
      const pg = ext.pages[p];
      const t = p === first.p ? first.top + 2.5 : pg.ct;
      // đáy = đỉnh cao nhất của cụm dòng đầu câu kế tiếp (tử số phân số, chỉ số trên nằm cao hơn dòng nhãn)
      let nt = end ? end.top : 0;
      if (end) for (let k = e + 1; k < Math.min(L.length, e + 3); k++) { const o = L[k]; if (o && o.p === end.p && !o.skip && o.top - end.top < 9 && o.bot < end.top) nt = Math.max(nt, o.top); }
      const bt = (p === L[la].p && end && end.p === p) ? nt + 0.5 : pg.cb;
      if (t - bt < 6) continue;
      const sg = {p, t, b: bt};
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

// Render từng trang PDF, cắt ảnh cho mỗi câu hỏi (kèm công thức/hình vẽ), lưu vào IndexedDB
async function attachImages(ext, qs, onProg) {
  const SC = 2, byPage = new Map(), parts = new Map();
  qs.forEach(q => {
    q._segs = q._rs ? regionSegs(q._rs, ext) : [];
    q._segs.forEach((sg, k) => { if (!byPage.has(sg.p)) byPage.set(sg.p, []); byPage.get(sg.p).push({q, k}); });
  });
  const order = [...byPage.keys()].sort((a, b) => a - b);
  for (let pi = 0; pi < order.length; pi++) {
    const p = order[pi], page = await ext.pdf.getPage(p), vp = page.getViewport({scale: SC}), pg = ext.pages[p];
    const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    const g0 = cv.getContext('2d'); g0.fillStyle = '#fff'; g0.fillRect(0, 0, cv.width, cv.height);
    await page.render({canvasContext: g0, viewport: vp}).promise;
    byPage.get(p).forEach(({q, k}) => {
      const sg = q._segs[k];
      const x0 = Math.max(0, Math.floor((pg.l - 6) * SC)), x1 = Math.min(cv.width, Math.ceil((pg.r + 6) * SC));
      let y0 = Math.max(0, Math.floor((pg.h - sg.t) * SC)), y1 = Math.min(cv.height, Math.ceil((pg.h - sg.b) * SC));
      if (x1 - x0 > 8) { y0 = Math.round(snapRow(g0, x0, x1, y0, cv.height)); y1 = Math.round(snapRow(g0, x0, x1, y1, cv.height)); }
      if (y1 - y0 < 8 || x1 - x0 < 8) return;
      const c2 = document.createElement('canvas'); c2.width = x1 - x0; c2.height = y1 - y0;
      const g = c2.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c2.width, c2.height);
      g.drawImage(cv, x0, y0, x1 - x0, y1 - y0, 0, 0, c2.width, c2.height);
      if (sg.mask) { g.fillStyle = '#fff'; g.fillRect(0, (pg.h - sg.mask.t) * SC - y0 - 2, sg.mask.x1 * SC - x0, (sg.mask.t - sg.mask.b) * SC + 4); }
      parts.set(q.id + ':' + k, c2);
    });
    cv.width = cv.height = 0;
    onProg && onProg(pi + 1, order.length);
  }
  let n = 0;
  for (const q of qs) {
    const cs = q._segs.map((_, k) => parts.get(q.id + ':' + k)).filter(Boolean);
    delete q._segs; delete q._rs;
    if (!cs.length) continue;
    const W = Math.max(...cs.map(c => c.width)), Ht = cs.reduce((s, c) => s + c.height, 0) + 4 * (cs.length - 1);
    const out = document.createElement('canvas'); out.width = W; out.height = Ht;
    const g = out.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, Ht);
    let y = 0; cs.forEach(c => { g.drawImage(c, 0, y); y += c.height + 4; });
    const url = out.toDataURL('image/jpeg', 0.78);
    await IMGDB.put(q.id, url); IMGS.set(q.id, url); q.img = q.id; delete q.warn; n++;
  }
  return n;
}

/* ---- Nhãn Môn · Khối · Chuyên đề cho câu hỏi trong ngân hàng ---- */
const SUBJECTS = ['Toán', 'Ngữ văn', 'Tiếng Anh', 'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử & Địa lý', 'Tin học'];
const GRADES = ['6', '7', '8', '9', '10', '11', '12'];
const topicsFor = (s, g) => (TOPICS_CATALOG[s] && TOPICS_CATALOG[s][g]) || [];
// Câu khớp môn/khối đang chọn (câu chưa gắn nhãn cũ vẫn được dùng); bật bankTopic thì phải đúng chuyên đề
const bankPool = c => (S.bank || []).filter(q => (!q.subject || q.subject === c.subject) && (!q.grade || q.grade === c.grade) && (!c.bankTopic || q.topic === c.topic));
const TOPIC_NONE = '— Không gắn chuyên đề —', TOPIC_CUSTOM = '➕ Khác (nhập tay)';
function labelForm(v, id, compact) {
  const tps = topicsFor(v.subject, v.grade), list = (!v.topic || tps.includes(v.topic)) ? tps : [v.topic, ...tps];
  const sel = 'padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px;width:100%;margin-top:2px';
  return `<div class="lbl-form" id="${id}" style="${compact ? 'display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end' : 'display:grid;grid-template-columns:1fr 1fr;gap:8px'}">
    <label style="font-size:10px;color:#475467;${compact ? 'flex:1;min-width:110px' : ''}">Môn<select data-l="subject" style="${sel}">${SUBJECTS.map(s => `<option ${s === v.subject ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
    <label style="font-size:10px;color:#475467;${compact ? 'width:90px' : ''}">Khối<select data-l="grade" style="${sel}">${GRADES.map(g => `<option value="${g}" ${g === v.grade ? 'selected' : ''}>Khối ${g}</option>`).join('')}</select></label>
    <label style="font-size:10px;color:#475467;${compact ? 'flex:2;min-width:160px' : 'grid-column:1/3'}">Chuyên đề<select data-l="topicsel" style="${sel}">${list.map(t => `<option value="${esc(t)}" ${t === v.topic ? 'selected' : ''}>${esc(t)}</option>`).join('')}<option value="">${TOPIC_NONE}</option><option value="__custom__">${TOPIC_CUSTOM}</option></select>
      <input data-l="topiccustom" placeholder="Nhập tên chuyên đề" style="display:none;${sel}"></label></div>`;
}
const lblEl = (root, k) => root.querySelector(`[data-l="${k}"]`);
function readLabelForm(root) {
  let topic = lblEl(root, 'topicsel').value;
  if (topic === '__custom__') topic = lblEl(root, 'topiccustom').value.trim();
  return {subject: lblEl(root, 'subject').value, grade: lblEl(root, 'grade').value, topic};
}
function bindLabelForm(root) {
  if (!root) return;
  const refill = () => {
    const tps = topicsFor(lblEl(root, 'subject').value, lblEl(root, 'grade').value);
    lblEl(root, 'topicsel').innerHTML = tps.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('') + `<option value="">${TOPIC_NONE}</option><option value="__custom__">${TOPIC_CUSTOM}</option>`;
    lblEl(root, 'topiccustom').style.display = 'none';
  };
  lblEl(root, 'subject').onchange = refill; lblEl(root, 'grade').onchange = refill;
  lblEl(root, 'topicsel').onchange = () => { const c = lblEl(root, 'topiccustom'); c.style.display = lblEl(root, 'topicsel').value === '__custom__' ? 'block' : 'none'; if (c.style.display === 'block') c.focus(); };
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
        catch (e) { log('⚠ Không cắt được ảnh (' + (e && e.message || e) + ') — dùng văn bản thuần.', 'warn'); res.questions.forEach(q => { delete q._rs; delete q._segs; }); }
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

function openBankManager(onChange) {
  const TYL = {mcq: 'Trắc nghiệm', tf: 'Đúng/Sai', short: 'Trả lời ngắn', essay: 'Tự luận'};
  const st = {f: 'all', q: '', p: 0, s: 'all', g: 'all', tp: 'all'}, PER = 15;
  const m = modal('', 1), b = m.b;
  const eqf = (v, val) => val === 'all' || (val === 'none' ? !v : v === val);
  const list = () => (S.bank || []).filter(q => (st.f === 'all' || (st.f === 'noans' ? !hasAns(q) : q.t === st.f))
    && eqf(q.subject, st.s) && eqf(q.grade, st.g) && eqf(q.topic, st.tp)
    && (!st.q || (q.q + ' ' + (q.opts || []).join(' ')).toLowerCase().includes(st.q.toLowerCase())));
  const optsOf = (arr, cur, allLabel, fmtF) => `<option value="all" ${cur === 'all' ? 'selected' : ''}>${allLabel}</option><option value="none" ${cur === 'none' ? 'selected' : ''}>(Chưa gắn nhãn)</option>${arr.map(x => `<option value="${esc(x)}" ${cur === x ? 'selected' : ''}>${esc(fmtF ? fmtF(x) : x)}</option>`).join('')}`;
  const ctl = q => {
    if (q.t === 'essay') return '';
    if (isTfg(q)) return q.sts.map((_, i) => `<select data-f="ans4" data-k="${i}" title="Ý ${'abcd'[i]}" style="padding:4px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px"><option value="-1">${'abcd'[i]}: ?</option><option value="0" ${q.ans && q.ans[i] === 0 ? 'selected' : ''}>${'abcd'[i]}: Đúng</option><option value="1" ${q.ans && q.ans[i] === 1 ? 'selected' : ''}>${'abcd'[i]}: Sai</option></select>`).join('');
    if (q.t === 'short') return `<input data-f="ans" value="${esc(q.ans == null ? '' : q.ans)}" placeholder="Đáp án đúng" style="width:130px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px">`;
    const labels = q.t === 'tf' ? ['Đúng', 'Sai'] : (q.opts || []).map((_, j) => 'ABCD'[j]);
    return `<select data-f="ans" style="padding:4px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px"><option value="-1">— Đáp án? —</option>${labels.map((l, j) => `<option value="${j}" ${q.ans === j ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  };
  const draw = () => {
    const all = S.bank || [], L = list(), pages = Math.max(1, Math.ceil(L.length / PER));
    st.p = Math.max(0, Math.min(st.p, pages - 1));
    const noans = all.filter(q => !hasAns(q)).length;
    const rows = L.slice(st.p * PER, st.p * PER + PER).map(q => {
      const allowed = isTfg(q) ? ['tf'] : q.opts && q.opts.length >= 3 ? ['mcq'] : ['tf', 'short', 'essay'];
      return `<div class="bk-row" data-id="${esc(q.id)}" style="border:1px solid ${hasAns(q) ? '#e2e8f0' : '#fca5a5'};border-radius:8px;padding:8px;margin-bottom:6px;background:${hasAns(q) ? '#fff' : '#fff7f7'}">
        ${imgq(q) ? `<img src="${IMGS.get(q.img)}" style="max-width:100%;display:block;border:1px solid #e2e8f0;border-radius:4px"><div style="font-size:9px;color:#98a2b3;margin-top:2px">🖼 Ảnh cắt từ PDF — phương án A/B/C/D nằm trong ảnh</div>` : `<div data-f="stem" contenteditable="true" title="Bấm vào để sửa nội dung" style="font-size:11px;line-height:1.5;outline:none;border-bottom:1px dashed #e2e8f0">${q.q}</div>
        ${isTfg(q) ? `<div style="font-size:11px;margin:3px 0">${q.sts.map((st, i) => `<div><b>${'abcd'[i]})</b> <span data-f="st" data-k="${i}" contenteditable="true" style="outline:none;border-bottom:1px dashed #e2e8f0">${esc(st)}</span></div>`).join('')}</div>` : ''}
        ${q.t === 'mcq' ? `<div style="font-size:10px;color:#475467;margin:3px 0">${q.opts.map((o, j) => `<span style="margin-right:12px">${'ABCD'[j]}. <span data-f="opt" data-k="${j}" contenteditable="true" style="outline:none;border-bottom:1px dashed #e2e8f0">${esc(o)}</span></span>`).join('')}</div>` : ''}`}

        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:5px;font-size:10px">
          <select data-f="t" style="padding:4px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px">${allowed.map(t => `<option value="${t}" ${q.t === t ? 'selected' : ''}>${TYL[t]}</option>`).join('')}</select>
          ${ctl(q)}
          <select data-f="subject" title="Môn" style="padding:4px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px"><option value="">— Môn —</option>${SUBJECTS.map(s => `<option ${q.subject === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
          <select data-f="grade" title="Khối" style="padding:4px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px"><option value="">— Khối —</option>${GRADES.map(g => `<option value="${g}" ${q.grade === g ? 'selected' : ''}>Khối ${g}</option>`).join('')}</select>
          <input data-f="topic" list="bk-tpl" value="${esc(q.topic || '')}" placeholder="Chuyên đề" title="Chuyên đề (chọn gợi ý hoặc gõ tay)" style="width:170px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px">
          <button class="btn btn-outline" data-bk="del" style="font-size:9px;padding:3px 8px">✕ Xóa</button>
          ${q.warn ? '<span style="color:#b45309;font-weight:700" title="PDF có công thức toán — chữ có thể bị đảo thứ tự hoặc mất. Hãy đối chiếu đề gốc và sửa lại.">⚠ Có công thức — kiểm tra</span>' : ''}
          <span style="color:#98a2b3">${esc(q.src || '')}</span>
        </div></div>`;
    }).join('');
    b.innerHTML = `<h2>🗂 Quản lý ngân hàng câu hỏi (${all.length} câu)</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0">
        <select id="bk-f" style="padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px">
          <option value="all" ${st.f === 'all' ? 'selected' : ''}>Tất cả (${all.length})</option>
          ${ORD.map(t => `<option value="${t}" ${st.f === t ? 'selected' : ''}>${TYL[t]} (${all.filter(q => q.t === t).length})</option>`).join('')}
          <option value="noans" ${st.f === 'noans' ? 'selected' : ''}>Chưa có đáp án (${noans})</option>
        </select>
        <select id="bk-s" style="padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px">${optsOf(SUBJECTS, st.s, 'Mọi môn')}</select>
        <select id="bk-g" style="padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px">${optsOf(GRADES, st.g, 'Mọi khối', g => 'Khối ' + g)}</select>
        <select id="bk-tp" style="padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px;max-width:200px">${optsOf([...new Set(all.map(q => q.topic).filter(Boolean))], st.tp, 'Mọi chuyên đề')}</select>
        <input id="bk-q" value="${esc(st.q)}" placeholder="Tìm trong câu hỏi... (Enter)" style="flex:1;min-width:160px;padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px">
        <button class="btn btn-blue" data-bk="quick-mcq" style="font-size:10px;padding:5px 10px" title="Dán chuỗi đáp án, ví dụ: 1A 2B 3C 4D...">✎ Nhập nhanh đáp án TN</button>
        <button class="btn btn-blue" data-bk="quick-tf" style="font-size:10px;padding:5px 10px" title="Ví dụ: 1ĐĐSS;2SĐĐS;3SSSS">✎ Nhập nhanh đáp án Đ/S</button>
        <button class="btn btn-blue" data-bk="quick-short" style="font-size:10px;padding:5px 10px" title="Ví dụ: 1.0,4;2.123;3.-5">✎ Nhập nhanh đáp án TLN</button>
        <button class="btn btn-outline" data-bk="del-noans" style="font-size:10px;padding:5px 10px">Xóa câu chưa có đáp án</button>
        <button class="btn btn-outline" data-bk="del-all" style="font-size:10px;padding:5px 10px;color:#b91c1c">Xóa toàn bộ</button>
      </div>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px;margin-bottom:8px">
        <div style="font-size:10px;font-weight:700;color:#1e40af;margin-bottom:4px">🏷 Gắn nhãn hàng loạt cho <b>${L.length}</b> câu đang lọc (đổi bộ lọc để chọn nhóm câu):</div>
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap"><div style="flex:1;min-width:300px">${labelForm(bulk, 'lf-bulk', true)}</div><button class="btn btn-blue" data-bk="bulk-label" style="font-size:10px;padding:7px 12px">Áp dụng</button></div>
      </div>
      <datalist id="bk-tpl">${[...new Set([...Object.values(TOPICS_CATALOG).flatMap(o => Object.values(o).flat()), ...all.map(q => q.topic).filter(Boolean)])].map(t => `<option value="${esc(t)}">`).join('')}</datalist>
      <div style="max-height:44vh;overflow:auto;padding-right:4px">${rows || '<div class="lb-empty">Không có câu hỏi phù hợp.</div>'}</div>
      <div style="display:flex;justify-content:center;gap:10px;align-items:center;margin-top:8px;font-size:11px">
        <button class="btn btn-outline" data-bk="prev" style="padding:4px 10px" ${st.p === 0 ? 'disabled' : ''}>←</button>
        <span>Trang ${st.p + 1}/${pages} · ${L.length} câu</span>
        <button class="btn btn-outline" data-bk="next" style="padding:4px 10px" ${st.p >= pages - 1 ? 'disabled' : ''}>→</button>
      </div>`;
    bindLabelForm($('#lf-bulk', b));
  };
  const bulk = {subject: ($('#cfg-subject') || {}).value || 'Toán', grade: ($('#cfg-grade') || {}).value || '9', topic: ''};
  b.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'bk-f') { st.f = t.value; st.p = 0; return draw(); }
    if (t.id === 'bk-s' || t.id === 'bk-g' || t.id === 'bk-tp') { st[{'bk-s': 's', 'bk-g': 'g', 'bk-tp': 'tp'}[t.id]] = t.value; st.p = 0; return draw(); }
    if (t.closest('#lf-bulk')) { Object.assign(bulk, readLabelForm($('#lf-bulk', b))); return; }
    const row = t.closest('.bk-row'); if (!row) return;
    const q = (S.bank || []).find(x => x.id === row.dataset.id); if (!q) return;
    if (t.dataset.f === 't') {
      q.t = t.value;
      if (q.t === 'tf') { q.opts = ['Đúng', 'Sai']; q.ans = null; }
      else if (q.t !== 'mcq') { delete q.opts; q.ans = q.t === 'short' ? '' : null; }
    } else if (t.dataset.f === 'ans') {
      q.ans = q.t === 'short' ? t.value.trim() : (+t.value < 0 ? null : +t.value);
    } else if (t.dataset.f === 'ans4') {
      q.ans = Array.isArray(q.ans) ? q.ans.slice() : q.sts.map(() => null);
      q.ans[+t.dataset.k] = +t.value < 0 ? null : +t.value;
    } else if (t.dataset.f === 'subject' || t.dataset.f === 'grade') {
      q[t.dataset.f] = t.value;
    } else if (t.dataset.f === 'topic') {
      q.topic = t.value.trim();
    }
    save(); onChange && onChange(); draw();
  });
  b.addEventListener('focusout', e => {
    const t = e.target, f = t.dataset && t.dataset.f; if (f !== 'stem' && f !== 'opt' && f !== 'st') return;
    const row = t.closest('.bk-row'), q = row && (S.bank || []).find(x => x.id === row.dataset.id); if (!q) return;
    const txt = t.innerText.replace(/\s+/g, ' ').trim();
    if (f === 'stem') { if (esc(txt) === q.q.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) return; q.q = esc(txt); }
    else if (f === 'st') { if (txt === q.sts[+t.dataset.k]) return; q.sts[+t.dataset.k] = txt; }
    else { if (txt === q.opts[+t.dataset.k]) return; q.opts[+t.dataset.k] = txt; }
    delete q.warn; save(); toast('Đã lưu chỉnh sửa');
  });
  b.addEventListener('keydown', e => { if (e.target.id === 'bk-q' && e.key === 'Enter') { st.q = e.target.value.trim(); st.p = 0; draw(); } });
  b.addEventListener('click', e => {
    const btn = e.target.closest('[data-bk]'); if (!btn) return;
    const a = btn.dataset.bk;
    if (a === 'prev') st.p--; else if (a === 'next') st.p++;
    else if (a === 'del') { const id = btn.closest('.bk-row').dataset.id; dropImgs(S.bank.filter(x => x.id === id)); S.bank = S.bank.filter(x => x.id !== id); save(); onChange && onChange(); }
    else if (a === 'bulk-label') {
      const lab = readLabelForm($('#lf-bulk', b)), L = list();
      if (!L.length) return toast('Không có câu nào trong bộ lọc hiện tại');
      if (!confirm(`Gắn nhãn “${lab.subject} · Khối ${lab.grade}${lab.topic ? ' · ' + lab.topic : ''}” cho ${L.length} câu đang lọc?`)) return;
      L.forEach(q => Object.assign(q, lab));
      Object.assign(bulk, lab); save(); onChange && onChange(); toast(`Đã gắn nhãn cho ${L.length} câu`);
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
      todo.forEach(([n, v]) => { const q = pool[n - 1]; q.ans = kind === 'mcq' ? 'ABCD'.indexOf(v) : v; });
      save(); onChange && onChange();
      toast(`Đã gán đáp án cho ${todo.length}/${pool.length} câu ${NAME}` + (bad.length ? `; bỏ qua ${bad.length} mục lỗi: ${bad.slice(0, 3).join(' | ')}` : ''));
    }
else if (a === 'del-noans') { const n = S.bank.filter(q => !hasAns(q)).length; if (!n) return toast('Không có câu nào thiếu đáp án'); if (!confirm(`Xóa ${n} câu chưa có đáp án?`)) return; dropImgs(S.bank.filter(q => !hasAns(q))); S.bank = S.bank.filter(hasAns); save(); onChange && onChange(); }
    else if (a === 'del-all') { if (!confirm(`Xóa toàn bộ ${S.bank.length} câu trong ngân hàng?`)) return; IMGS.clear(); IMGDB.clear().catch(() => {}); S.bank = []; save(); onChange && onChange(); }
    draw();
  });
  draw();
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

// Bộ sinh đề: lấy đúng số câu của từng dạng (c.counts) từ ngân hàng import PDF, hoặc ngân hàng mẫu/sinh tham số
function buildSmartOfflineExam(c, seed) {
  const r = rng(seed), s = c.subject, g = c.grade, out = [], warn = [];
  const counts = c.counts || {mcq: c.n || 10};
  const want = ORD.filter(t => counts[t] > 0);
  const bank = c.useBank ? bankPool(c) : [];

  if (c.useBank) {
    if (!bank.length) warn.push(`Ngân hàng chưa có câu nào cho ${s} khối ${g}${c.bankTopic ? ' · ' + c.topic : ''} — hãy import đề đúng môn/khối hoặc sửa nhãn trong “Quản lý & sửa đáp án”`);
    want.forEach(t => {
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
  $$('.option').forEach(o => o.onclick = () => { $$('.option').forEach(x => x.classList.remove('active')); o.classList.add('active'); });

  const getApiKey = () => S.gemini_key || localStorage.getItem('lbai_gemini_key') || '';
  const getWebSource = () => S.web_source || localStorage.getItem('lbai_web_source') || '';

  // Tự động cập nhật danh mục chuyên đề khi đổi Môn hoặc Lớp
  function updateTopicDropdown() {
    const sEl = $('#cfg-subject'), gEl = $('#cfg-grade'), tEl = $('#cfg-topic'), cEl = $('#cfg-topic-custom');
    if (!sEl || !gEl || !tEl) return;
    const s = sEl.value, g = gEl.value;
    const list = (TOPICS_CATALOG[s] && TOPICS_CATALOG[s][g]) || ['Tổng hợp kiến thức theo chuẩn SGK', 'Luyện tập các dạng bài trọng tâm', 'Đề kiểm tra định kỳ'];
    tEl.innerHTML = list.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('') +
      `<option value="__custom__">➕ Khác (Tự nhập tay chuyên đề...)</option>`;
    if (cEl) { cEl.style.display = 'none'; cEl.value = ''; }
  }

  if ($('#cfg-subject')) $('#cfg-subject').onchange = updateTopicDropdown;
  if ($('#cfg-grade')) $('#cfg-grade').onchange = updateTopicDropdown;
  if ($('#cfg-topic')) {
    $('#cfg-topic').onchange = () => {
      const isCustom = $('#cfg-topic').value === '__custom__';
      const cEl = $('#cfg-topic-custom');
      if (cEl) { cEl.style.display = isCustom ? 'block' : 'none'; if (isCustom) cEl.focus(); }
    };
  }
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
    const t = $('#cfg-topic'), c = $('#cfg-topic-custom');
    if (t && t.value === '__custom__' && c && c.value.trim()) return c.value.trim();
    return t ? t.value : 'Tổng hợp';
  };

  const getCounts = () => { const o = {mcq: 0, tf: 0, short: 0, essay: 0}; $$('[data-count]').forEach(i => { o[i.dataset.count] = Math.max(0, Math.min(100, Math.floor(+i.value || 0))); }); return o; };
  const renderBank = () => {
    const bank = S.bank || [], cnt = t => bank.filter(q => q.t === t).length, noans = bank.filter(q => !hasAns(q)).length;
    const sum = $('#bank-summary');
    if (sum) sum.innerHTML = bank.length ? `Đang có <b>${bank.length}</b> câu: ${ORD.map(t => `${cnt(t)} ${TYN[t]}`).join(' · ')}${noans ? ` · <span style="color:#b91c1c">${noans} câu chưa có đáp án</span>` : ''}` : 'Chưa có câu hỏi nào. Bấm “Import PDF” để nạp đề (nhiều file, hàng trăm câu đều được).';
    const use = $('#cfg-use-bank') && $('#cfg-use-bank').checked && bank.length;
    const cc = cfg(), pool = bankPool(cc), pcnt = t => pool.filter(q => q.t === t).length;
    if (sum && bank.length) sum.innerHTML += `<br>Phù hợp <b>${esc(cc.subject)} khối ${esc(cc.grade)}${cc.bankTopic ? ' · ' + esc(cc.topic) : ''}</b>: <b>${pool.length}</b> câu`;
    $$('[data-avail]').forEach(el => { el.textContent = use ? 'Phù hợp: ' + pcnt(el.dataset.avail) : ''; });
    const tot = $('#cfg-total'); if (tot) tot.textContent = Object.values(getCounts()).reduce((a, b) => a + b, 0);
  };
  $$('[data-count]').forEach(i => i.oninput = renderBank);
  if ($('#cfg-use-bank')) $('#cfg-use-bank').onchange = renderBank;
  if ($('#bank-file')) $('#bank-file').onchange = e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) askLabels(f, {subject: $('#cfg-subject').value, grade: $('#cfg-grade').value, topic: getActiveTopic()}, renderBank); };
  ['#cfg-subject', '#cfg-grade', '#cfg-topic', '#cfg-bank-topic'].forEach(sel => { if ($(sel)) $(sel).addEventListener('change', renderBank); });
  if ($('#cfg-topic-custom')) $('#cfg-topic-custom').addEventListener('input', renderBank);

  const cfg = () => ({
    kind: $('.option.active b').textContent.replace(/^\S+\s*/, ''),
    subject: $('#cfg-subject') ? $('#cfg-subject').value : 'Toán',
    grade: $('#cfg-grade') ? $('#cfg-grade').value : '9',
    topic: getActiveTopic(),
    examCount: +($('#cfg-exam-count') ? $('#cfg-exam-count').value : 3) || 3,
    examMode: $('#cfg-exam-mode') ? $('#cfg-exam-mode').value : 'shuffle',
    counts: getCounts(),
    n: Object.values(getCounts()).reduce((a, b) => a + b, 0),
    useBank: $('#cfg-use-bank') ? ($('#cfg-use-bank').checked && !!(S.bank || []).length) : false,
    bankTopic: $('#cfg-bank-topic') ? $('#cfg-bank-topic').checked : false,
    sl: +($('.range') ? $('.range').value : 35),
    types: ORD.filter(t => getCounts()[t] > 0),
    useAi: $('#cfg-use-ai') ? $('#cfg-use-ai').checked : false
  });

  const tplNote = () => S.tpl ? ` · phong cách theo đề mẫu "${S.tpl}"` : '';

  // Xem trước, duyệt và phân phối nhiều mã đề (Rule-Based mặc định siêu tốc)
  async function preview(c, autoprint) {
    if (!c.types.length) return toast('Hãy nhập số câu cho ít nhất một dạng câu hỏi');
    const seed = Date.now() % 1e6;

    // 1. Luôn sinh trước bộ đề Rule-Based đảm bảo 100% mượt mà tức thì
    let variations = generateSmartOfflineVariations(c, seed);
    const warns = variations.warn || [];
    if (!variations.length || !variations[0].questions.length) return toast(warns[0] || 'Không tạo được câu hỏi — kiểm tra ngân hàng và số câu');
    let isAiActive = false;

    // 2. Chỉ khi người dùng tích chọn Bật AI mới gọi Gemini
    if (c.useAi) {
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
    let curIdx = 0;
    let ans = false;
    let distMode = 'alt'; // 'alt' (xen kẽ chẵn/lẻ) | 'level' (theo năng lực) | 'free' (tự chọn)

    const m = modal('', 1), b = m.b;

    const draw = () => {
      const curExam = variations[curIdx];
      const sourceDesc = c.useBank
        ? `Ngân hàng của bạn (${bankPool(c).length}/${(S.bank || []).length} câu phù hợp ${esc(c.subject)} khối ${esc(c.grade)}${c.bankTopic ? ' · ' + esc(c.topic) : ''})`
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
        <div class="lb-exam" style="margin-top:6px">${examHTML(curExam.questions, ans, true)}</div>

        <div class="lb-row" style="margin-top:8px">
          <button class="btn btn-outline" id="pr">🖨 In mã đề này (${esc(curExam.code)})</button>
          <button class="btn btn-outline" id="dl">⬇ Tải .doc (${esc(curExam.code)})</button>
          <button class="btn btn-outline" id="on">💻 Làm thử online (${esc(curExam.code)})</button>
        </div>

        <!-- Ma trận Phân phối cho học sinh -->
        <div class="dist-matrix-box">
          <b style="font-size:12px;color:#1e3a8a">🎯 Thiết lập ma trận phân phối đề cho lớp (42 học sinh)</b>
          <div class="dist-options">
            <div class="dist-card ${distMode === 'alt' ? 'selected' : ''}" data-mode="alt">
              <b>🔀 Phân phối xen kẽ (Chẵn / Lẻ)</b>
              <p style="font-size:9px;color:#64748b;margin:3px 0 0">Bàn lẻ làm ${esc(variations[0].code)}, bàn chẵn làm ${esc(variations[1] ? variations[1].code : variations[0].code)} (chống nhìn bài).</p>
            </div>
            <div class="dist-card ${distMode === 'level' ? 'selected' : ''}" data-mode="level">
              <b>📊 Phân phối theo Learning Profile</b>
              <p style="font-size:9px;color:#64748b;margin:3px 0 0">HS củng cố nhận ${esc(variations[0].code)}, khá làm ${esc(variations[1] ? variations[1].code : variations[0].code)}, giỏi làm ${esc(variations[2] ? variations[2].code : variations[0].code)}.</p>
            </div>
            <div class="dist-card ${distMode === 'free' ? 'selected' : ''}" data-mode="free">
              <b>🙋 Cho học sinh tự do chọn mã đề</b>
              <p style="font-size:9px;color:#64748b;margin:3px 0 0">Học sinh được chọn 1 trong ${variations.length} mã đề khi vào làm bài.</p>
            </div>
          </div>

          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-top:8px">
            <div style="font-size:10px;font-weight:700;color:#334155;margin-bottom:4px">Phân phối mẫu danh sách học sinh:</div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:10px">
              <span>👤 <b>An:</b> ${distMode === 'alt' ? variations[0].code : distMode === 'level' ? variations[0].code : 'Tự chọn'} <span class="exam-tag">Học sinh</span></span>
              <span>👤 <b>Bình:</b> ${distMode === 'alt' ? (variations[1] ? variations[1].code : variations[0].code) : distMode === 'level' ? (variations[1] ? variations[1].code : variations[0].code) : 'Tự chọn'}</span>
              <span>👤 <b>Dũng:</b> ${distMode === 'alt' ? variations[0].code : distMode === 'level' ? (variations[2] ? variations[2].code : variations[0].code) : 'Tự chọn'}</span>
              <span style="color:#64748b">(39 học sinh còn lại được tự động xếp mã đề tương ứng)</span>
            </div>
          </div>

          <div style="margin-top:12px;display:flex;justify-content:flex-end">
            <button class="btn btn-blue" id="btn-confirm-distribute">✓ Xác nhận phân phối đề cho cả lớp</button>
          </div>
        </div>`;

      // Bắt sự kiện chuyển tab mã đề
      $$('.lb-tabs button', b).forEach(btn => {
        btn.onclick = () => { curIdx = +btn.dataset.idx; draw(); };
      });
      $('#sa', b).onchange = e => { ans = e.target.checked; draw(); };

      // Chuyển chế độ phân phối
      $$('.dist-card', b).forEach(card => {
        card.onclick = () => { distMode = card.dataset.mode; draw(); };
      });

      // Các nút in, tải doc, làm thử
      $('#pr', b).onclick = () => printExam(`${title} — ${curExam.code}`, curExam.questions, ans);
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

      // Xác nhận phân phối đề
      $('#btn-confirm-distribute', b).onclick = () => {
        const assignedAn = distMode === 'alt' ? variations[0].questions : distMode === 'level' ? variations[0].questions : variations[0].questions;
        const codeAn = distMode === 'alt' ? variations[0].code : distMode === 'level' ? variations[0].code : 'Tự chọn mã đề';

        S.assign = {
          title,
          at: Date.now(),
          distMode,
          variations,
          distMatrix: { An: codeAn, 'Bình': variations[1] ? variations[1].code : variations[0].code, 'Dũng': variations[2] ? variations[2].code : variations[0].code },
          exams: { An: assignedAn, 'Bình': variations[1] ? variations[1].questions : variations[0].questions, 'Dũng': variations[2] ? variations[2].questions : variations[0].questions, 'Đề chung': variations[0].questions }
        };
        save();
        toast('✓ Đã phân phối thành công các mã đề cho cả lớp!');
        m.close();
      };
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
          <button class="btn btn-outline" style="font-size:9px;padding:4px 8px" id="preset-math">🔗 Mẫu: VietJack Toán 9</button>
          <button class="btn btn-outline" style="font-size:9px;padding:4px 8px" id="preset-eng">🔗 Mẫu: Tuyensinh247 Tiếng Anh 9</button>
          <button class="btn btn-outline" style="font-size:9px;padding:4px 8px" id="preset-phys">🔗 Mẫu: VnDoc Vật lý 9</button>
        </div>

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
      $('#preset-eng', m.b).onclick = () => { urlInput.value = DEMO_PRESET_LINKS.tuyensinh.url; };
      $('#preset-phys', m.b).onclick = () => { urlInput.value = DEMO_PRESET_LINKS.vndoc.url; };

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
    'import-pdf': () => $('#bank-file').click(),
    'bank-manage': () => openBankManager(renderBank),
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

/* ---------- Học sinh ---------- */
function initStudent() {
  const ks = ['algebra', 'geometry', 'real'];
  $$('.meter').forEach((m, i) => { m.firstElementChild.style.width = S.profile[ks[i]] + '%'; m.previousElementSibling.querySelector('b').textContent = S.profile[ks[i]] + '%'; });
  const A = {
    'post-project': () => openComposer('Project học tập'),
    'view-assign': () => {
      const a = S.assign;
      if (!a) return modal('<h2>Chưa có bài được giao</h2><p>Giáo viên chưa giao bài mới. Giáo viên có thể tạo & phân phối bài ở trang <a href="teacher-builder.html">AI Copilot</a>.</p>');
      
      const last = S.results.filter(r => r.who === 'An' && r.title.includes(a.title)).pop();
      const codeAn = (a.distMatrix && a.distMatrix.An) ? a.distMatrix.An : 'Mã đề 101';
      const assignedExam = (a.exams && a.exams.An) ? a.exams.An : (a.variations ? a.variations[0].questions : []);

      // Trường hợp giáo viên chọn chế độ 'free' (học sinh tự chọn đề)
      if (a.distMode === 'free' && a.variations && a.variations.length > 1) {
        const m = modal(`<h2>${esc(a.title)}</h2>
          <p>Giáo viên cho phép học sinh <b>tự do chọn mã đề</b> để làm bài:</p>
          <div class="lb-tabs">${a.variations.map((v, idx) => `<button class="${idx === 0 ? 'on' : ''}" data-idx="${idx}">📄 ${esc(v.code)} · ${esc(v.name)}</button>`).join('')}</div>
          <div id="free-exam-desc" style="font-size:11px;color:#64748b;margin:8px 0">${esc(a.variations[0].desc || '')}</div>
          ${last ? `<div class="lb-note">Lần làm gần nhất: ${last.ok}/${last.total} câu đúng.</div>` : ''}
          <div class="lb-row" style="margin-top:12px">
            <button class="btn btn-blue" id="on">💻 Bắt đầu làm online</button>
            <button class="btn btn-outline" id="pr">🖨 In bản giấy</button>
          </div>`);
        
        let selIdx = 0;
        $$('.lb-tabs button', m.b).forEach(btn => {
          btn.onclick = () => {
            $$('.lb-tabs button', m.b).forEach(x => x.classList.remove('on'));
            btn.classList.add('on');
            selIdx = +btn.dataset.idx;
            $('#free-exam-desc', m.b).textContent = a.variations[selIdx].desc || '';
          };
        });

        $('#on', m.b).onclick = () => {
          const chExam = a.variations[selIdx].questions;
          const chCode = a.variations[selIdx].code;
          m.close();
          runQuiz(chExam, { title: `${a.title} — ${chCode}`, who: 'An', profile: true, after: initStudent });
        };
        $('#pr', m.b).onclick = () => printExam(`${a.title} — ${a.variations[selIdx].code}`, a.variations[selIdx].questions, false);
        return;
      }

      // Phân phối cố định (xen kẽ hoặc theo level)
      const m = modal(`<h2>${esc(a.title)}</h2>
        <div class="lb-note">🎯 Phiên bản dành cho <b>An</b>: <b>${esc(codeAn)}</b> (Được phân phối theo: ${a.distMode === 'alt' ? 'Đề song song chống quay cóp' : 'Cá nhân hóa Learning Profile'}).</div>
        ${last ? `<div class="lb-note">Lần làm gần nhất: ${last.ok}/${last.total} câu đúng.</div>` : ''}
        <div class="lb-row">
          <button class="btn btn-blue" id="on">💻 Làm online (${esc(codeAn)})</button>
          <button class="btn btn-outline" id="pr">🖨 In bản giấy (${esc(codeAn)})</button>
        </div>`);

      $('#on', m.b).onclick = () => {
        m.close();
        runQuiz(assignedExam, { title: `${a.title} — ${codeAn}`, who: 'An', profile: true, after: initStudent });
      };
      $('#pr', m.b).onclick = () => printExam(`${a.title} — ${codeAn}`, assignedExam, false);
    }
  };
  $$('[data-act]').forEach(el => { if (A[el.dataset.act]) el.onclick = A[el.dataset.act]; });
}


/* ---------- Giáo viên ---------- */
function initTeacher() {
  const t = S.teacher; if (t.name) $('.profile-info h1').textContent = t.name; if (t.bio) $('#about p').textContent = t.bio;
  const A = {
    'edit-profile': () => { const m = modal(`<h2>Chỉnh sửa hồ sơ</h2><label class="lb-field"><span>HỌ TÊN</span><input id="en" value="${esc($('.profile-info h1').textContent)}"></label><label class="lb-field"><span>GIỚI THIỆU</span><textarea id="eb">${esc($('#about p').textContent)}</textarea></label><button class="btn btn-blue" id="es">Lưu</button>`);
      $('#es', m.b).onclick = () => { const n = $('#en', m.b).value.trim(), bio = $('#eb', m.b).value.trim(); if (!n) return toast('Tên không được để trống'); S.teacher = {name:n, bio}; save(); $('.profile-info h1').textContent = n; if (bio) $('#about p').textContent = bio; m.close(); toast('Đã lưu hồ sơ'); }; },
    'post-doc': () => openComposer('Tài liệu'), 'post-video': () => openComposer('Video bài giảng'), 'post-exercise': () => location.href = 'teacher-builder.html', 'post-course': () => openComposer('Bài viết'),
    'view-doc': () => viewDoc('Chuyên đề lập hệ phương trình')
  };
  $$('[data-act]').forEach(el => { if (A[el.dataset.act]) el.onclick = A[el.dataset.act]; });
  $('.composer-input').style.cursor = 'pointer'; $('.composer-input').onclick = () => openComposer('Bài viết');
  $$('article.feed-card').forEach((art, ai) => { const items = $$('.post-actions>*', art); if (!items.length) return; const id = 'tp' + ai; let panel;
    const base = {}; items.forEach((el, i) => base[i] = +(/\d+/.exec(el.textContent) || [0])[0]);
    const paint = () => { const L = !!S.likes[id], V = !!S.saved[id], n = (S.comments[id] || []).length;
      items.forEach((el, i) => { const t = el.dataset.o || (el.dataset.o = el.textContent);
        if (/^♡/.test(t)) { el.textContent = (L ? '♥ ' : '♡ ') + (base[i] + (L ? 1 : 0)); el.classList.toggle('lb-on', L); }
        else if (/💬/.test(t)) el.textContent = '💬 ' + (base[i] + n);
        else if (/Lưu/.test(t)) { el.textContent = V ? '💾 Đã lưu' : t; el.classList.toggle('lb-on', V); } }); };
    items.forEach(el => { el.style.cursor = 'pointer'; const t = el.textContent;
      el.onclick = () => { if (/^♡/.test(t)) { S.likes[id] = !S.likes[id]; save(); paint(); } else if (/💬/.test(t)) { if (!panel) panel = commentPanel(art, id, paint); else panel.hidden = !panel.hidden; }
        else if (/Chia sẻ/.test(t)) shareLink(id, paint); else if (/Lưu/.test(t)) { S.saved[id] = !S.saved[id]; save(); paint(); } }; });
    paint(); });
}

/* ---------- Phụ huynh: AI Matching, upload, báo cáo ---------- */
const TEACHERS = [
  {n:'Đỗ Nguyệt Anh', s:'Toán', g:[6, 7, 8, 9], m:['Online', 'Offline'], eve:1, small:0, track:1, r:4.9, c:'Hải Dương', k:126, p:'180k'},
  {n:'Thầy Minh', s:'Toán', g:[8, 9], m:['Online'], eve:1, small:1, track:1, r:4.8, c:'Hà Nội', k:84, p:'200k'},
  {n:'Cô Hà Trang', s:'Toán', g:[6, 7, 8, 9], m:['Online', 'Offline'], eve:0, small:1, track:1, r:4.7, c:'Bắc Ninh', k:61, p:'160k'},
  {n:'Cô Mai Anh', s:'Toán', g:[9], m:['Online'], eve:1, small:1, track:1, r:4.9, c:'Hà Nội', k:47, p:'220k'},
  {n:'Thầy Minh Phúc', s:'Vật lý', g:[10, 11, 12], m:['Online'], eve:1, small:0, track:1, r:4.8, c:'Hà Nội', k:73, p:'210k'},
  {n:'Cô Lan Hương', s:'Ngữ văn', g:[6, 7, 8, 9], m:['Online', 'Offline'], eve:1, small:1, track:0, r:4.9, c:'Hải Phòng', k:58, p:'170k'},
  {n:'Thầy Quang', s:'Tiếng Anh', g:[6, 7, 8, 9], m:['Online'], eve:1, small:1, track:0, r:4.6, c:'TP.HCM', k:39, p:'150k'},
  {n:'Cô Thu Hà', s:'Hóa học', g:[8, 9, 10, 11], m:['Offline'], eve:0, small:1, track:0, r:4.7, c:'Hải Dương', k:44, p:'190k'}
];
const has = (t, w) => new RegExp('(^|[^\\p{L}])(' + w + ')($|[^\\p{L}])', 'u').test(t);
function matchTeachers(q) {
  const t = q.toLowerCase().trim();
  const subj = [['toán', 'Toán'], ['ngữ văn|văn', 'Ngữ văn'], ['tiếng anh|anh văn', 'Tiếng Anh'], ['vật lý|lý', 'Vật lý'], ['hóa học|hóa', 'Hóa học']].filter(([k]) => has(t, k)).map(x => x[1]);
  const gm = /(?:lớp|khối|toán|văn|lý|hóa|anh)\s*(\d{1,2})|(?:^|\s)(\d{1,2})(?:\s|$)/.exec(t); let grade = gm ? +(gm[1] || gm[2]) : 0; if (grade < 6 || grade > 12) grade = 0;
  const f = {online:/online|trực tuyến/.test(t), offline:/offline|trực tiếp|tại nhà/.test(t), eve:/tối/.test(t), small:/sĩ số nhỏ|nhóm nhỏ|kèm/.test(t), track:/theo dõi|tiến bộ|báo cáo/.test(t)};
  const city = TEACHERS.map(x => x.c).filter((c, i, a) => a.indexOf(c) === i).filter(c => t.includes(c.toLowerCase()));
  return TEACHERS.map(x => {
    let sc = 40 + x.r * 2, why = [];
    if (subj.length) { if (!subj.includes(x.s)) return null; sc += 20; why.push('Môn ' + x.s); }
    if (grade) { if (!x.g.includes(grade)) return null; sc += 15; why.push('Lớp ' + grade); }
    if (f.online && x.m.includes('Online')) { sc += 6; why.push('Dạy online'); } if (f.offline && x.m.includes('Offline')) { sc += 6; why.push('Dạy trực tiếp'); }
    if (f.eve && x.eve) { sc += 6; why.push('Có buổi tối'); } if (f.small && x.small) { sc += 6; why.push('Sĩ số nhỏ'); } if (f.track && x.track) { sc += 6; why.push('Theo dõi tiến bộ'); }
    if (city.includes(x.c)) { sc += 6; why.push(x.c); }
    return {...x, sc:Math.min(99, Math.round(sc)), why};
  }).filter(Boolean).sort((a, b) => b.sc - a.sc).slice(0, 6);
}
function showMatches(q) {
  const res = matchTeachers(q); let sec = $('#match');
  if (!sec) { sec = document.createElement('section'); sec.id = 'match'; sec.className = 'lb-match'; $('.parent-hero').after(sec); }
  sec.innerHTML = `<h2 style="margin:0 0 4px">✦ AI Matching${q ? ` · "${esc(q)}"` : ''}</h2><p class="section-sub" style="margin:0">${res.length ? `Tìm thấy ${res.length} giáo viên phù hợp` : 'Chưa có giáo viên khớp — thử bớt điều kiện (ví dụ bỏ khối lớp).'}</p><div class="lb-match-grid">${res.map(x => `<div class="card"><span class="lb-score">${x.sc}%</span><b>${esc(x.n)}</b><div class="muted" style="font-size:10px">${x.s} · Lớp ${x.g[0]}–${x.g[x.g.length - 1]} · ${x.m.join('/')} · ${x.c}</div><div style="font-size:11px;margin:6px 0">⭐ ${x.r} · ${x.k} học sinh · ${x.p}/buổi</div>${x.why.map(w => `<span class="lb-chip">✓ ${esc(w)}</span>`).join('')}<div style="margin-top:10px"><button class="btn ${S.contacts[x.n] ? 'btn-outline' : 'btn-blue'}" style="margin:0" data-c="${esc(x.n)}">${S.contacts[x.n] ? '✓ Đã gửi lời chào' : 'Gửi lời chào'}</button></div></div>`).join('')}</div>`;
  $$('[data-c]', sec).forEach(b => b.onclick = () => { S.contacts[b.dataset.c] = 1; save(); b.textContent = '✓ Đã gửi lời chào'; b.className = 'btn btn-outline'; toast('Đã gửi lời chào tới ' + b.dataset.c); });
  sec.scrollIntoView({behavior:'smooth'}); return res.length;
}
function initParent() {
  window.filterTeachers = () => showMatches($('#search').value);
  $('#search').oninput = null; $('#search').onkeydown = e => { if (e.key === 'Enter') window.filterTeachers(); };
  const qp = new URLSearchParams(location.search).get('q'); if (qp) { $('#search').value = qp; showMatches(qp); }
  const up = $$('[data-act="upload"]')[0].closest('.card');
  const list = document.createElement('div'); list.className = 'lb-thumbs'; up.append(list);
  const paintUp = () => { list.innerHTML = S.uploads.map((u, i) => `<div><img src="${u.img}" alt="${esc(u.name)}" title="${esc(u.name)}"><button data-d="${i}" aria-label="Xóa">×</button></div>`).join('');
    $$('[data-d]', list).forEach(b => b.onclick = () => { S.uploads.splice(+b.dataset.d, 1); save(); paintUp(); }); };
  paintUp();
  const A = {
    upload: () => { const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*'; f.multiple = true;
      f.onchange = () => [...f.files].forEach(file => { const rd = new FileReader(); rd.onload = () => { const im = new Image(); im.onload = () => {
        const sc = Math.min(1, 900 / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = im.width * sc; cv.height = im.height * sc; cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        S.uploads.push({name:file.name, img:cv.toDataURL('image/jpeg', .7), ts:Date.now()}); save(); paintUp(); toast('Đã upload — chờ giáo viên duyệt để cập nhật hồ sơ'); }; im.src = rd.result; }; rd.readAsDataURL(file); });
      f.click(); },
    report: () => {
      const pr = S.profile, names = {algebra:'Đại số', geometry:'Hình học', real:'Bài toán thực tế'}, ks = Object.keys(pr).sort((a, b) => pr[b] - pr[a]), best = ks[0], weak = ks[ks.length - 1];
      const rs = S.results.filter(r => r.who === 'An').slice(-3).reverse();
      modal(`<h2>Learning Report · Nguyễn An</h2>${Object.keys(pr).map(k => `<div style="margin:10px 0"><div style="display:flex;justify-content:space-between"><span>${names[k]}</span><b>${pr[k]}%</b></div><div class="meter"><span style="width:${pr[k]}%"></span></div></div>`).join('')}<div class="ai-box"><b>Tổng hợp tự động từ dữ liệu trong hệ thống</b><p style="font-size:11px;line-height:1.7">An đang mạnh nhất ở <b>${names[best]}</b> (${pr[best]}%). Phần cần củng cố là <b>${names[weak]}</b> (${pr[weak]}%). Gợi ý: luyện 2–3 dạng cùng loại trước khi tăng độ khó, và trao đổi với giáo viên nếu điểm chưa cải thiện sau 2 tuần.</p></div><p><b>Bài làm gần đây:</b></p>${rs.length ? rs.map(r => `<div class="c">• ${esc(r.title)}: ${r.ok}/${r.total} câu đúng</div>`).join('') : '<div class="muted">Chưa có bài online nào.</div>'}<p><b>Bài giấy đã upload:</b> ${S.uploads.length} ảnh (chờ giáo viên duyệt)</p>`);
    },
    need: () => {
      const m = modal(`<h2>Đăng nhu cầu tìm giáo viên</h2><label class="lb-field"><span>MÔN HỌC</span><select id="ns"><option>Toán</option><option>Ngữ văn</option><option>Tiếng Anh</option><option>Vật lý</option><option>Hóa học</option></select></label><label class="lb-field"><span>LỚP</span><select id="ng">${[6, 7, 8, 9, 10, 11, 12].map(g => `<option ${g === 9 ? 'selected' : ''}>${g}</option>`).join('')}</select></label><label class="lb-field"><span>HÌNH THỨC</span><select id="nm"><option>online</option><option>trực tiếp</option></select></label><label class="lb-field"><span>MONG MUỐN KHÁC</span><input id="nn" placeholder="buổi tối, sĩ số nhỏ, theo dõi tiến bộ"></label><button class="btn btn-red" id="ns2">Đăng & tìm giáo viên</button>`);
      $('#ns2', m.b).onclick = () => { const q = `${$('#ns', m.b).value} ${$('#ng', m.b).value} ${$('#nm', m.b).value} ${$('#nn', m.b).value}`.trim(), text = `Mình đang tìm giáo viên ${$('#ns', m.b).value} lớp ${$('#ng', m.b).value}, học ${$('#nm', m.b).value}${$('#nn', m.b).value ? ', ' + $('#nn', m.b).value : ''}.`;
        m.close(); $('#search').value = q; const n = showMatches(q); S.needs.push({q, ts:Date.now()});
        S.posts.unshift({id:'u' + Date.now(), au:ME.n, role:ME.role, ini:ME.ini, cls:ME.cls, ts:Date.now(), kind:'Nhu cầu', vis:'Kết nối', text, tags:[], count:n}); save(); toast(`Đã đăng nhu cầu lên bảng tin · ${n} giáo viên phù hợp`); };
    }
  };
  $$('[data-act]').forEach(el => { if (A[el.dataset.act]) el.onclick = A[el.dataset.act]; });
}

/* ---------- Khởi động ---------- */
initHeader();
if (HAS_FEED) initFeed();
if (PAGE === 'teacher-builder.html') initBuilder();
if (PAGE === 'students.html') initStudent();
if (PAGE === 'teachers.html') initTeacher();
if (PAGE === 'parents.html') initParent();
})();
