/* manage.js — giáo viên: lớp, tài khoản học sinh/phụ huynh, bài đã giao, kết quả. */
(async () => {
'use strict';
const {$, $$, esc, toast, modal, api, fmtDate, fmtScore, download, csvCell} = LB;
await LB.ready;
const me = LB.me;
const view = $('#view');
let tab = 'classes', classes = [], curClass = null;

if (me.role === 'admin') $('#tab-teachers').hidden = false;
$$('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; $$('#tabs button').forEach(x => x.classList.toggle('on', x === b)); draw(); });

const draw = () => ({classes: drawClasses, attend: drawAttend, practice: drawPractice, bonus: drawBonus, points: drawPoints, reports: drawReports, help: drawHelp, assign: drawAssign, parents: drawParents, teachers: drawTeachers})[tab]();
const hashTab = () => { if (['#practice', '#bonus', '#attend', '#points', '#reports', '#help'].includes(location.hash)) { tab = location.hash.slice(1); $$('#tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === tab)); return true; } };
hashTab();
window.addEventListener('hashchange', () => { if (hashTab()) draw(); });
const fail = e => toast(e.message || 'Có lỗi xảy ra');
setTimeout(() => { refreshReportBadge(); refreshHelpBadge(); }, 0);   // số báo cáo chờ duyệt hiện ngay trên tab

/* ---------- Mã QR đăng nhập: máy khác cùng mạng wifi/LAN quét để vào hệ thống, không phải gõ địa chỉ ---------- */
let SERVER = {lan: false, urls: []}, qrIdx = 0;
const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(location.hostname);
// địa chỉ dùng cho QR: đang mở bằng IP mạng nội bộ thì dùng luôn; mở bằng localhost thì lấy IP máy chủ báo về
const loginUrls = () => LOCAL ? SERVER.urls : [`${location.origin}/login.html`, ...SERVER.urls.filter(u => !u.startsWith(location.origin + '/'))];
const loginUrl = () => loginUrls()[qrIdx] || loginUrls()[0] || `${location.origin}/login.html`;
const qrPref = (k, v) => { try { if (v === undefined) return localStorage.getItem('lbai_qr_' + k); localStorage.setItem('lbai_qr_' + k, v); } catch (e) { return null; } };
async function drawQrCard() {
  const box = $('#qr-card'); if (!box || !window.QR) return;
  try { SERVER = await api.get('/api/server-info'); } catch (e) { /* giữ mặc định */ }
  const urls = loginUrls();
  const open = qrPref('open') == null ? me.role === 'admin' : qrPref('open') === '1';
  if (!urls.length) {
    box.innerHTML = SERVER.lan
      ? '<div class="lb-note" style="margin:0">📱 <b>Mã QR đăng nhập chưa dùng được:</b> máy chủ chưa có địa chỉ mạng nội bộ. Hãy kết nối máy này vào wifi/LAN rồi tải lại trang.</div>'
      : '<div class="lb-note" style="margin:0">📱 <b>Mã QR đăng nhập chưa dùng được:</b> máy chủ đang chạy chế độ <b>chỉ máy này</b> (run.bat), điện thoại và máy khác không vào được. Hãy tắt cửa sổ máy chủ rồi chạy <b>run-lan.bat</b> — mã QR sẽ hiện ở đây để mọi người quét vào hệ thống.</div>';
    return;
  }
  qrIdx = Math.min(qrIdx, urls.length - 1);
  const url = loginUrl();
  if (!open) {
    box.innerHTML = `<div class="card" style="padding:10px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span style="font-size:13px">📱 <b>Mã QR đăng nhập</b> · <span style="color:#667085">${esc(url)}</span></span><button class="btn btn-outline sm" id="qr-open" style="margin-left:auto">Hiện mã QR</button></div>`;
    $('#qr-open').onclick = () => { qrPref('open', '1'); drawQrCard(); };
    return;
  }
  box.innerHTML = `<div class="card" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
    <div title="Quét bằng camera điện thoại" style="border:1px solid var(--line);border-radius:12px;padding:6px;background:#fff">${QR.svg(url, {px: 170, label: 'Mã QR đăng nhập ' + url})}</div>
    <div style="flex:1;min-width:240px">
      <h2 style="margin:0 0 4px;font-size:18px">📱 Quét mã để vào hệ thống</h2>
      <p style="font-size:12px;color:#475467;margin:0 0 8px">Học sinh, giáo viên, phụ huynh <b>dùng chung mạng wifi/LAN với máy này</b> mở camera điện thoại quét mã là vào trang đăng nhập, không cần gõ địa chỉ.</p>
      <div style="font-size:13px;margin-bottom:8px">Địa chỉ: <b id="qr-url" style="color:#2a2b86;word-break:break-all">${esc(url)}</b></div>
      ${urls.length > 1 ? `<label style="font-size:11px;color:#667085;display:block;margin-bottom:8px">Máy chủ có nhiều card mạng — chọn địa chỉ cùng mạng wifi với học sinh:
        <select id="qr-sel" style="display:block;margin-top:3px;padding:6px;border:1px solid var(--line);border-radius:8px">${urls.map((u, i) => `<option value="${i}" ${i === qrIdx ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label>` : ''}
      <div class="lb-row"><button class="btn btn-blue sm" id="qr-big">⛶ Phóng to để chiếu</button><button class="btn btn-outline sm" id="qr-copy">📋 Sao chép địa chỉ</button><button class="btn btn-outline sm" id="qr-print">🖨 In mã QR</button><button class="btn btn-outline sm" id="qr-hide">Thu gọn</button></div>
    </div></div>`;
  const sel = $('#qr-sel'); if (sel) sel.onchange = () => { qrIdx = +sel.value; drawQrCard(); };
  $('#qr-hide').onclick = () => { qrPref('open', '0'); drawQrCard(); };
  $('#qr-copy').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Đã sao chép địa chỉ'); } catch (e) { toast('Không sao chép được — hãy bôi đen địa chỉ để sao chép'); } };
  $('#qr-big').onclick = () => modal(`<div style="text-align:center"><h2 style="font-size:24px">📱 Quét mã để vào Learning by AI</h2>
    <div style="display:inline-block;padding:10px;background:#fff;border-radius:12px">${QR.svg(url, {px: Math.max(220, Math.min(520, Math.floor(window.innerHeight * 0.62))), label: 'Mã QR đăng nhập'})}</div>
    <div style="font-size:22px;font-weight:700;margin-top:10px;word-break:break-all">${esc(url)}</div>
    <p style="font-size:14px;color:#475467">Kết nối cùng mạng wifi → mở camera → quét mã → đăng nhập bằng tài khoản thầy cô đã phát.</p></div>`, true);
  $('#qr-print').onclick = () => {
    const w = window.open('', '_blank'); if (!w) return toast('Trình duyệt đang chặn cửa sổ in — hãy cho phép pop-up');
    w.document.write(`<html><head><meta charset="utf-8"><title>Mã QR đăng nhập</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:30px}svg{margin:20px auto}</style></head><body>
      <h1>Quét mã để vào Learning by AI</h1>${QR.svg(url, {px: 380})}<div style="font-size:22px;font-weight:bold">${esc(url)}</div>
      <p style="font-size:16px">Kết nối cùng mạng wifi của trường → mở camera điện thoại → quét mã → đăng nhập bằng tài khoản được phát.</p></body></html>`);
    w.document.close(); w.focus(); w.print();
  };
}
drawQrCard();

/* ---------- phiếu tài khoản (mật khẩu chỉ hiện một lần) ---------- */
function showCredentials(title, accounts, errors) {
  const m = modal(`<h2>${esc(title)}</h2>
    <div class="lb-note">⚠ <b>Mật khẩu chỉ hiển thị một lần.</b> Hãy tải file CSV hoặc in phiếu ngay để phát cho học sinh. Lần đầu đăng nhập, học sinh sẽ được yêu cầu đổi mật khẩu.</div>
    <div style="max-height:46vh;overflow:auto"><table class="tbl"><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Mật khẩu</th></tr>
    ${accounts.map(a => `<tr><td>${esc(a.name)}</td><td><b>${esc(a.username)}</b></td><td><code style="font-size:13px;background:#f1f5f9;padding:2px 6px;border-radius:5px">${esc(a.password)}</code></td></tr>`).join('')}</table></div>
    ${errors && errors.length ? `<div class="lb-note" style="background:#fef2f2;border-color:#fecaca;color:#991b1b;margin-top:8px">Không tạo được ${errors.length} dòng: ${errors.slice(0, 5).map(e => `dòng ${e.row} (${esc(e.error)})`).join('; ')}</div>` : ''}
    <div class="lb-row" style="margin-top:12px"><button class="btn btn-blue" id="c-csv">⬇ Tải CSV</button><button class="btn btn-outline" id="c-print">🖨 In phiếu tài khoản</button><button class="btn btn-outline" id="c-ok">Đã lưu, đóng</button></div>`, true);
  $('#c-csv', m.b).onclick = () => download('tai-khoan.csv', 'Họ tên,Tên đăng nhập,Mật khẩu\n' + accounts.map(a => [a.name, a.username, a.password].map(csvCell).join(',')).join('\n'));
  $('#c-print', m.b).onclick = () => {
    const w = window.open('', '_blank'); if (!w) return toast('Trình duyệt đang chặn cửa sổ in — hãy cho phép pop-up');
    // địa chỉ đăng nhập trên phiếu: địa chỉ mạng nội bộ (không phải localhost) + mã QR để học sinh quét
    const url = loginUrl(), qr = window.QR && !/\/\/(localhost|127\.)/.test(url) ? QR.svg(url, {px: 92}) : '';
    w.document.write(`<html><head><meta charset="utf-8"><title>Phiếu tài khoản</title><style>body{font-family:Arial,sans-serif}.c{border:1px dashed #666;border-radius:8px;padding:10px 14px;margin:6px;display:inline-flex;gap:10px;align-items:center;width:46%;vertical-align:top;font-size:13px;break-inside:avoid;box-sizing:border-box}code{font-size:15px;font-weight:bold}</style></head><body>${accounts.map(a => `<div class="c">${qr}<div><b>${esc(a.name)}</b><br>Tên đăng nhập: <code>${esc(a.username)}</code><br>Mật khẩu: <code>${esc(a.password)}</code><br><small>${qr ? 'Quét mã QR hoặc vào' : 'Đăng nhập tại'}: ${esc(url)}</small></div></div>`).join('')}</body></html>`);
    w.document.close(); w.focus(); w.print();
  };
  $('#c-ok', m.b).onclick = m.close;
}

/* ---------- TAB: lớp & học sinh ---------- */
async function drawClasses() {
  try { classes = (await api.get('/api/classes')).classes; } catch (e) { return fail(e); }
  if (!curClass || !classes.find(c => c.id === curClass)) curClass = classes[0] ? classes[0].id : null;
  view.innerHTML = `<div class="grid2"><div>
      <button class="btn btn-blue" id="nc" style="width:100%;margin:0 0 10px">＋ Tạo lớp mới</button>
      ${classes.length ? classes.map(c => `<div class="cls-item ${c.id === curClass ? 'on' : ''}" data-c="${c.id}"><span>${esc(c.name)}${c.grade ? ' <small style="color:#667085">· Khối ' + esc(c.grade) + '</small>' : ''}</span><span class="pill">${c.students} HS</span></div>`).join('') : '<div class="empty">Chưa có lớp nào.<br>Hãy tạo lớp đầu tiên.</div>'}
    </div><div id="cpane"></div></div>`;
  $('#nc').onclick = classForm;
  $$('[data-c]').forEach(el => el.onclick = () => { curClass = +el.dataset.c; drawClasses(); });
  if (curClass) drawStudents();
  else $('#cpane').innerHTML = '<div class="card empty">Tạo lớp để bắt đầu thêm học sinh và giao đề.</div>';
}
function classForm(edit) {
  const c = edit && edit.id ? edit : null;
  const m = modal(`<h2>${c ? 'Sửa lớp' : 'Tạo lớp mới'}</h2>
    <label class="lb-field"><span>TÊN LỚP (ví dụ 9A1)</span><input id="cn" maxlength="60" value="${esc(c ? c.name : '')}"></label>
    <label class="lb-field"><span>KHỐI</span><select id="cg"><option value="">—</option>${[6, 7, 8, 9, 10, 11, 12].map(g => `<option ${c && c.grade == g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
    <button class="btn btn-blue" id="cs">Lưu</button>`);
  $('#cs', m.b).onclick = async () => {
    const name = $('#cn', m.b).value.trim(); if (!name) return toast('Hãy nhập tên lớp');
    try {
      if (c) await api.patch('/api/classes/' + c.id, {name, grade: $('#cg', m.b).value});
      else curClass = (await api.post('/api/classes', {name, grade: $('#cg', m.b).value})).id;
      m.close(); drawClasses();
    } catch (e) { fail(e); }
  };
}
async function drawStudents() {
  const cls = classes.find(c => c.id === curClass), pane = $('#cpane');
  let students = [];
  try { students = (await api.get('/api/students?class_id=' + curClass)).students; } catch (e) { return fail(e); }
  pane.innerHTML = `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
      <h2 style="margin:0;font-size:18px">Lớp ${esc(cls.name)} <small style="color:#667085;font-weight:400">· ${students.filter(s => s.active).length} học sinh</small></h2>
      <div class="lb-row"><button class="btn btn-blue sm" id="as">＋ Thêm học sinh</button><button class="btn btn-blue sm" id="ab">＋ Thêm nhiều học sinh</button>
      <button class="btn btn-outline sm" id="pt">📚 Luyện tập tự do</button><button class="btn btn-outline sm" id="ec">Sửa lớp</button><button class="btn btn-outline sm" id="dc" style="color:#b91c1c">Xóa lớp</button></div></div>
    ${students.length ? `<table class="tbl"><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Đăng nhập gần nhất</th><th>Tự luyện tập</th><th>Trạng thái</th><th></th></tr>
    ${students.map(s => `<tr data-s="${s.id}"><td><b>${esc(s.name)}</b></td><td>${esc(s.username)}</td><td>${s.last_login ? fmtDate(s.last_login) : '<span class="pill">Chưa đăng nhập</span>'}</td>
      <td>${s.practice && s.practice.n ? `<a href="#" data-pr="1">${s.practice.n} lần · TB ${fmtScore(s.practice.avg)}</a>` : '<span style="color:#98a2b3">—</span>'}</td>
      <td>${!s.active ? '<span class="pill bad">Vô hiệu</span>' : s.must_change ? '<span class="pill warn">Chưa đổi MK</span>' : '<span class="pill ok">Hoạt động</span>'}</td>
      <td style="text-align:right;white-space:nowrap"><button class="btn btn-outline sm" data-a="pw">Cấp lại MK</button> <button class="btn btn-outline sm" data-a="ed">Sửa / chuyển lớp</button> <button class="btn btn-outline sm" data-a="ph">+ Phụ huynh</button> <button class="btn btn-outline sm" data-a="act">${s.active ? 'Vô hiệu' : 'Kích hoạt'}</button></td></tr>`).join('')}</table>`
      : '<div class="empty">Lớp chưa có học sinh.<br>Bấm “Thêm học sinh” hoặc “Thêm nhiều học sinh” (dán danh sách từ Excel).</div>'}</div>`;
  $('#as').onclick = () => studentForm(cls);
  $('#ab').onclick = () => bulkForm(cls);
  $('#ec').onclick = () => classForm(cls);
  $('#pt').onclick = () => practiceSettings(cls).catch(fail);
  $$('[data-pr]', pane).forEach(a => a.onclick = e => { e.preventDefault(); showPractice(students.find(x => x.id === +a.closest('tr').dataset.s)).catch(fail); });
  $('#dc').onclick = async () => { if (!confirm(`Xóa lớp ${cls.name}?`)) return; try { await api.del('/api/classes/' + cls.id); curClass = null; drawClasses(); } catch (e) { fail(e); } };
  $$('[data-a]', pane).forEach(b => b.onclick = async () => {
    const id = +b.closest('tr').dataset.s, s = students.find(x => x.id === id);
    try {
      if (b.dataset.a === 'pw') {
        if (!confirm(`Cấp lại mật khẩu cho ${s.name}? Mật khẩu cũ sẽ không dùng được nữa.`)) return;
        showCredentials('Mật khẩu mới', [(await api.post(`/api/users/${id}/reset-password`)).account]);
      } else if (b.dataset.a === 'act') {
        await api.post(`/api/users/${id}/active`, {active: !s.active}); drawStudents();
      } else if (b.dataset.a === 'ed') editStudent(s);
      else parentForm(s);
    } catch (e) { fail(e); }
  });
}
function editStudent(s) {
  const m = modal(`<h2>Sửa học sinh</h2>
    <label class="lb-field"><span>HỌ VÀ TÊN</span><input id="en" maxlength="80" value="${esc(s.name)}"></label>
    <label class="lb-field"><span>CHUYỂN SANG LỚP</span><select id="ec2">${classes.map(c => `<option value="${c.id}" ${c.id === s.class_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <p style="font-size:11px;color:#667085;margin:0 0 8px">Bài đã giao cho lớp cũ vẫn giữ nguyên; bài mới của lớp mới sẽ giao cho em sau khi chuyển.</p>
    <button class="btn btn-blue" id="ev2">Lưu</button>`);
  $('#ev2', m.b).onclick = async () => {
    const name = $('#en', m.b).value.trim(); if (!name) return toast('Hãy nhập họ tên');
    try { await api.patch('/api/students/' + s.id, {name, class_id: +$('#ec2', m.b).value}); m.close(); drawClasses(); } catch (e) { fail(e); }
  };
}
/* ---------- TAB: mở luyện tập tự do (chọn nhiều lớp + nhiều chuyên đề trong một màn hình) ---------- */
async function drawPractice() {
  let cls = [], groups = [];
  try {
    cls = (await api.get('/api/classes')).classes;
    if (cls.length) groups = (await api.get(`/api/classes/${cls[0].id}/practice`)).groups;
  } catch (e) { return fail(e); }
  if (!cls.length) { view.innerHTML = '<div class="card empty">Bạn chưa có lớp nào.<br>Hãy vào tab “Lớp & học sinh” tạo lớp và thêm học sinh trước.</div>'; return; }
  // trạng thái mở của từng lớp: {classId: Set(khóa chuyên đề)}
  const key = g => [g.subject, g.grade, g.topic].join('|||');
  const openBy = {};
  await Promise.all(cls.map(async c => { openBy[c.id] = new Set((await api.get(`/api/classes/${c.id}/practice`)).groups.filter(g => g.open).map(key)); }));
  const picked = new Set(cls.map(c => c.id)), chosen = new Set();
  const syncChosen = () => { chosen.clear(); const first = [...picked][0]; if (first) groups.forEach(g => { if (openBy[first].has(key(g))) chosen.add(key(g)); }); };
  syncChosen();
  const body = () => {
    const q = ($('#pq') ? $('#pq').value : '').trim().toLowerCase();
    return groups.filter(g => !q || (g.topic + ' ' + g.subject).toLowerCase().includes(q));
  };
  const render = () => {
    const list = body(), box0 = $('#pbox', view), keep = box0 ? box0.scrollTop : 0, pageY = window.scrollY;   // giữ vị trí cuộn khi vẽ lại
    view.innerHTML = `<div class="lb-note" style="margin-bottom:12px"><b>Cách hoạt động:</b> (1) chọn lớp, (2) tick chuyên đề trong ngân hàng câu hỏi, (3) bấm <b>Lưu và mở</b>. Học sinh vào <b>Bài của tôi → 🎯 Tự luyện tập</b>, tự chọn chuyên đề, số câu, thời gian; nộp bài là có điểm, đáp án và lời giải ngay. Giáo viên xem kết quả ở bảng học sinh của lớp.</div>
      <div class="grid2" style="grid-template-columns:minmax(220px,300px) 1fr"><div class="card"><h2 style="margin:0 0 8px;font-size:15px">1. Chọn lớp</h2>
        ${cls.map(c => `<label style="display:flex;gap:8px;align-items:center;padding:6px 0;font-size:13px;border-bottom:1px solid var(--line)"><input type="checkbox" data-c="${c.id}" ${picked.has(c.id) ? 'checked' : ''}><span style="flex:1"><b>${esc(c.name)}</b> <small style="color:#667085">${c.students} HS</small></span><span class="pill ${openBy[c.id].size ? 'ok' : ''}" title="Số chuyên đề đang mở">${openBy[c.id].size} đang mở</span></label>`).join('')}</div>
      <div class="card"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><h2 style="margin:0;font-size:15px">2. Chọn chuyên đề được phép luyện</h2>
        <input id="pq" placeholder="Tìm chuyên đề..." value="${esc($('#pq') ? $('#pq').value : '')}" style="padding:7px 10px;border:1px solid var(--line);border-radius:8px;min-width:180px"></div>
        ${groups.length ? `<div id="pbox" style="max-height:50vh;overflow:auto"><table class="tbl"><tr><th style="width:30px"><input type="checkbox" id="pall" ${list.length && list.every(g => chosen.has(key(g))) ? 'checked' : ''} title="Chọn / bỏ chọn tất cả"></th><th>Môn · Khối</th><th>Chuyên đề</th><th>Số câu học sinh luyện được</th></tr>
        ${list.map(g => `<tr><td><input type="checkbox" data-g="${esc(key(g))}" ${chosen.has(key(g)) ? 'checked' : ''}></td><td>${esc(g.subject || '—')}${g.grade ? ' · ' + esc(g.grade) : ''}</td><td><b>${esc(g.topic || 'Chưa phân chuyên đề')}</b></td><td>${g.counts.mcq} TN · ${g.counts.tf} Đ/S · ${g.counts.short} TLN</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Không có chuyên đề khớp.</td></tr>'}</table></div>
        <div class="lb-row" style="margin-top:12px"><button class="btn btn-blue" id="psave">Lưu và mở cho ${picked.size} lớp đã chọn</button><span style="font-size:12px;color:#667085"><span id="pn">${chosen.size}</span> chuyên đề được chọn · bỏ tick rồi lưu để đóng lại</span></div>`
        : '<div class="empty">Ngân hàng của bạn chưa có câu nào có đáp án.<br>Vào <a href="teacher-builder.html">AI Copilot</a> bấm <b>📥 Import đề mẫu</b> hoặc import PDF kèm đáp án.</div>'}</div></div>`;
    $$('[data-c]', view).forEach(i => i.onchange = () => { const id = +i.dataset.c; i.checked ? picked.add(id) : picked.delete(id); syncChosen(); render(); });
    // tick từng chuyên đề / tick tất cả: chỉ cập nhật ô đã bấm + bộ đếm, KHÔNG vẽ lại danh sách (vẽ lại làm thanh cuộn nhảy về đầu)
    const all = $('#pall', view), sync = () => {
      $('#pn', view).textContent = chosen.size;
      if (all) all.checked = body().length > 0 && body().every(g => chosen.has(key(g)));
    };
    $$('[data-g]', view).forEach(i => i.onchange = () => { i.checked ? chosen.add(i.dataset.g) : chosen.delete(i.dataset.g); sync(); });
    if (all) all.onchange = () => { body().forEach(g => all.checked ? chosen.add(key(g)) : chosen.delete(key(g))); $$('[data-g]', view).forEach(i => { i.checked = chosen.has(i.dataset.g); }); sync(); };
    const pq = $('#pq', view); if (pq) { pq.oninput = () => { const pos = pq.selectionStart; render(); const n = $('#pq', view); n.focus(); n.setSelectionRange(pos, pos); }; }
    const sv = $('#psave', view); if (sv) sv.onclick = async () => {
      if (!picked.size) return toast('Hãy chọn ít nhất một lớp');
      const open = groups.filter(g => chosen.has(key(g))).map(g => ({subject: g.subject, grade: g.grade, topic: g.topic}));
      try {
        for (const id of picked) { await api.post(`/api/classes/${id}/practice`, {open}); openBy[id] = new Set(chosen); }
        toast(open.length ? `Đã mở ${open.length} chuyên đề cho ${picked.size} lớp` : `Đã đóng luyện tập tự do cho ${picked.size} lớp`); render();
      } catch (e) { fail(e); }
    };
    const box = $('#pbox', view); if (box) box.scrollTop = keep;
    window.scrollTo(0, pageY);
  };
  render();
}
/* ---------- TAB: điểm danh (lịch học từng lớp · điểm danh theo ngày · thống kê tháng để thu học phí) ---------- */
const WD = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const WD_S = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const vnd = n => Number(n || 0).toLocaleString('vi-VN') + ' VNĐ';
const pts = n => Number(n || 0).toLocaleString('vi-VN');   // điểm thưởng/phạt (1 điểm = 1 đồng), vd 5.000
const dmy = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
const isoShift = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const DISC = [['noisy', 'Mất trật tự'], ['phone', 'Dùng điện thoại'], ['snack', 'Ăn quà vặt']];
const att = {sub: 'day', date: null, cls: '', q: '', month: null, scls: ''};
async function drawAttend() {
  view.innerHTML = `<div class="lb-row" style="margin-bottom:12px">${[['day', '✅ Điểm danh'], ['sched', '🗓 Lịch học các lớp'], ['stats', '📊 Thống kê tháng · học phí'], ['rules', '⚙ Phạt đi muộn · Thưởng điểm']].map(([k, l]) => `<button class="btn ${att.sub === k ? 'btn-blue' : 'btn-outline'} sm" data-asub="${k}">${l}</button>`).join('')}</div><div id="apane"><div class="card empty">Đang tải...</div></div>`;
  $$('[data-asub]', view).forEach(b => b.onclick = () => { att.sub = b.dataset.asub; drawAttend(); });
  try { await ({day: attDay, sched: attSched, stats: attStats, rules: attRules})[att.sub]($('#apane')); } catch (e) { fail(e); }
}
async function attDay(pane) {
  const r = await api.get('/api/attendance?' + (att.date ? 'date=' + att.date : ''));
  att.date = r.date;
  if (!r.classes.length) { pane.innerHTML = '<div class="card empty">Bạn chưa có lớp nào. Hãy tạo lớp ở tab “Lớp & học sinh”.</div>'; return; }
  const noSched = r.classes.filter(c => !c.has_schedule);
  const render = () => {
    const q = att.q.trim().toLowerCase();
    const list = r.students.filter(s => (!att.cls || s.class_id === +att.cls) && (!q || (s.name + ' ' + s.username).toLowerCase().includes(q)))
      .sort((a, b) => (b.scheduled - a.scheduled) || a.class_name.localeCompare(b.class_name, 'vi', {numeric: true}) || a.name.localeCompare(b.name, 'vi'));
    const cnt = st => list.filter(s => s.status === st).length, sch = list.filter(s => s.scheduled).length;
    const todayCls = r.classes.filter(c => c.scheduled && (!att.cls || c.id === +att.cls));
    const scope = r.classes.filter(c => (!att.cls || c.id === +att.cls) && (c.scheduled || r.students.some(s => s.class_id === c.id && s.marked)));   // lớp sẽ được chốt
    const isClosed = id => (r.classes.find(c => c.id === id) || {}).closed;
    const allClosed = scope.length > 0 && scope.every(c => c.closed), canClose = r.date <= r.today;
    const closedAt = (scope.find(c => c.closed) || {}).closed_at;
    pane.innerHTML = `<div class="card">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <button class="btn btn-outline sm" id="ad-prev" title="Ngày trước">◀</button>
        <input type="date" id="ad-date" value="${r.date}" style="padding:7px;border:1px solid var(--line);border-radius:8px">
        <button class="btn btn-outline sm" id="ad-next" title="Ngày sau">▶</button>
        ${r.date !== r.today ? '<button class="btn btn-outline sm" id="ad-today">Hôm nay</button>' : ''}
        <h2 style="margin:0 8px;font-size:18px">${r.weekday}, ${dmy(r.date)}${r.date === r.today ? ' <span class="pill ok" style="font-size:11px">hôm nay</span>' : ''}</h2>
        <select id="ad-cls" style="margin-left:auto;padding:7px;border:1px solid var(--line);border-radius:8px"><option value="">Tất cả lớp</option>${r.classes.map(c => `<option value="${c.id}" ${+att.cls === c.id ? 'selected' : ''}>${esc(c.name)}${c.scheduled ? ' · có lịch' : ''}</option>`).join('')}</select>
        <input id="ad-q" placeholder="Tìm học sinh..." value="${esc(att.q)}" style="padding:7px 10px;border:1px solid var(--line);border-radius:8px;min-width:160px">
      </div>
      <div style="font-size:13px;margin-bottom:10px">Lớp có lịch hôm nay: ${todayCls.length ? todayCls.map(c => `<b>${esc(c.name)}</b>${c.time ? ` (${esc(c.time)})` : ''}`).join(', ') : '<span style="color:#667085">không có</span>'}
        · <span class="pill ok">${cnt('present')} đi học</span> <span class="pill bad">${cnt('absent')} nghỉ</span> <span class="pill">${sch} có lịch</span></div>
      ${noSched.length ? `<div class="lb-note" style="margin-bottom:10px">Lớp chưa đặt lịch học: ${noSched.map(c => esc(c.name)).join(', ')}. Vào <a href="#" id="ad-go-sched">🗓 Lịch học các lớp</a> để đặt — ngày có lịch, học sinh sẽ tự được tick đi học.</div>` : ''}
      <div class="lb-note" style="margin-bottom:10px;font-size:12px">Học sinh có lịch hôm nay được <b>tự tick đi học</b>. Em nào nghỉ thì tick <b>Nghỉ</b> (ghi lý do nếu cần). Em đi học muộn thì ghi <b>số phút muộn</b> (bị phạt theo quy tắc ở tab “Phạt đi muộn · Thưởng điểm”). Em <b>mất trật tự / dùng điện thoại / ăn quà vặt</b> thì ghi <b>số lần</b> trong buổi vào 3 cột tương ứng (mỗi lần trừ điểm). Em không có lịch nhưng đến học bù thì tick <b>Đi học</b>. Mọi thay đổi được lưu ngay; cuối buổi bấm <b>Chốt điểm danh</b>.</div>
      <div class="lb-row" style="margin-bottom:10px;align-items:center">
        ${allClosed ? `<span class="pill ok">🔒 Đã chốt${closedAt ? ' lúc ' + fmtDate(closedAt) : ''}</span><button class="btn btn-outline sm" id="ad-reopen">↺ Mở lại để sửa</button>`
          : `<button class="btn btn-blue sm" id="ad-close" ${canClose && scope.length ? '' : 'disabled'} title="${canClose ? '' : 'Chưa tới ngày này'}">🔒 Chốt điểm danh${att.cls ? '' : ' (' + scope.length + ' lớp)'}</button>${scope.some(c => c.closed) ? '<span class="pill warn">một số lớp đã chốt</span>' : ''}`}
        ${att.cls && todayCls.length && !isClosed(+att.cls) ? `<button class="btn btn-outline sm" id="ad-off">🚫 Lớp ${esc(r.classes.find(c => c.id === +att.cls).name)} không học hôm nay</button><button class="btn btn-outline sm" id="ad-reset">↺ Trả về theo lịch</button>` : ''}</div>
      ${list.length ? `<div style="max-height:62vh;overflow:auto"><table class="tbl"><tr><th>Họ tên</th><th>Lớp</th><th>Lịch hôm nay</th><th style="text-align:center">Đi học</th><th style="text-align:center">Nghỉ</th><th style="text-align:center">Muộn (phút)</th>${DISC.map(([k, l]) => `<th style="text-align:center" title="Số lần ${l.toLowerCase()} trong buổi học, mỗi lần trừ ${pts(r.discipline_fee)} điểm">${l}<br><small style="font-weight:400;color:#b91c1c">−${pts(r.discipline_fee)}/lần</small></th>`).join('')}<th>Ghi chú / lý do nghỉ</th></tr>
        ${list.map(s => { const lock = isClosed(s.class_id) ? 'disabled' : ''; return `<tr data-s="${s.id}" style="${s.status === 'absent' ? 'background:#fef2f2' : s.status === 'present' ? '' : 'color:#98a2b3'}"><td><b>${esc(s.name)}</b><br><small style="color:#667085">${esc(s.username)}</small></td><td>${esc(s.class_name)}</td>
          <td>${s.scheduled ? `<span class="pill ok">Có lịch</span>${s.time ? ' <small>' + esc(s.time) + '</small>' : ''}` : '<span style="color:#98a2b3">Không có lịch</span>'}${s.marked ? ' <small title="Giáo viên đã điểm danh" style="color:#2a2b86">✎</small>' : ''}</td>
          <td style="text-align:center"><input type="checkbox" data-st="present" ${s.status === 'present' ? 'checked' : ''} ${lock} style="width:20px;height:20px"></td>
          <td style="text-align:center"><input type="checkbox" data-st="absent" ${s.status === 'absent' ? 'checked' : ''} ${lock} style="width:20px;height:20px;accent-color:#dc2626"></td>
          <td style="text-align:center"><input type="number" data-late min="0" max="600" step="1" value="${s.late_min || ''}" placeholder="0" ${s.status === 'present' && !lock ? '' : 'disabled'} title="Số phút đi muộn của buổi này" style="width:64px;padding:5px;border:1px solid ${s.late_min ? '#f59e0b' : 'var(--line)'};border-radius:6px;text-align:center"></td>
          ${DISC.map(([k, l]) => `<td style="text-align:center"><input type="number" data-disc="${k}" min="0" max="99" step="1" value="${s[k] || ''}" placeholder="0" ${s.status === 'present' && !lock ? '' : 'disabled'} title="Số lần ${l.toLowerCase()} trong buổi học này" style="width:56px;padding:5px;border:1px solid ${s[k] ? '#dc2626' : 'var(--line)'};border-radius:6px;text-align:center"></td>`).join('')}
          <td><input data-note maxlength="200" value="${esc(s.note)}" ${lock} placeholder="${s.status === 'absent' ? 'Lý do nghỉ (ốm, việc gia đình...)' : ''}" style="width:100%;min-width:140px;padding:5px 8px;border:1px solid var(--line);border-radius:6px"></td></tr>`; }).join('')}</table></div>`
        : '<div class="empty">Không có học sinh nào khớp.</div>'}</div>`;
    const go = d => { att.date = d; attDay(pane).catch(fail); };
    $('#ad-prev', pane).onclick = () => go(isoShift(r.date, -1));
    $('#ad-next', pane).onclick = () => go(isoShift(r.date, 1));
    $('#ad-date', pane).onchange = e => e.target.value && go(e.target.value);
    const td = $('#ad-today', pane); if (td) td.onclick = () => go(r.today);
    $('#ad-cls', pane).onchange = e => { att.cls = e.target.value; render(); };
    const qi = $('#ad-q', pane); qi.oninput = () => { att.q = qi.value; const p = qi.selectionStart; render(); const n = $('#ad-q', pane); n.focus(); n.setSelectionRange(p, p); };
    const gs = $('#ad-go-sched', pane); if (gs) gs.onclick = e => { e.preventDefault(); att.sub = 'sched'; drawAttend(); };
    const save = async (items, msg) => {
      try { await api.post('/api/attendance', {date: r.date, items}); toast(msg || 'Đã lưu điểm danh'); attDay(pane).catch(fail); } catch (e) { fail(e); render(); }
    };
    $$('[data-st]', pane).forEach(cb => cb.onchange = () => {
      const s = r.students.find(x => x.id === +cb.closest('tr').dataset.s), note = $('[data-note]', cb.closest('tr')).value;
      // bỏ tick "Nghỉ" → trả về theo lịch; bỏ tick "Đi học" ở ngày có lịch → buổi này em không học (không tính tiền)
      const st = cb.checked ? cb.dataset.st : (cb.dataset.st === 'present' && s.scheduled ? 'none' : 'auto');
      save([{student_id: s.id, status: st, note}], cb.checked ? (st === 'absent' ? `Đã ghi nhận ${s.name} nghỉ` : `Đã ghi nhận ${s.name} đi học`) : `Đã bỏ đánh dấu ${s.name}`);
    });
    $$('[data-note]', pane).forEach(inp => inp.onchange = () => {
      const s = r.students.find(x => x.id === +inp.closest('tr').dataset.s);
      save([{student_id: s.id, status: s.status, note: inp.value}], 'Đã lưu ghi chú');
    });
    $$('[data-late]', pane).forEach(inp => inp.onchange = () => {
      const s = r.students.find(x => x.id === +inp.closest('tr').dataset.s), v = Math.max(0, Math.min(600, Math.floor(+inp.value || 0)));
      save([{student_id: s.id, status: 'present', note: $('[data-note]', inp.closest('tr')).value, late_min: v}], v ? `Đã ghi ${s.name} đi muộn ${v} phút` : `Đã bỏ số phút muộn của ${s.name}`);
    });
    $$('[data-disc]', pane).forEach(inp => inp.onchange = () => {   // số lần mất trật tự / dùng điện thoại / ăn quà vặt: mỗi lần trừ điểm theo quy tắc
      const tr = inp.closest('tr'), s = r.students.find(x => x.id === +tr.dataset.s), body = {student_id: s.id, status: 'present', note: $('[data-note]', tr).value};
      $$('[data-disc]', tr).forEach(i => { body[i.dataset.disc] = Math.max(0, Math.min(99, Math.floor(+i.value || 0))); });
      const n = body.noisy + body.phone + body.snack;
      save([body], n ? `Đã ghi ${s.name}: ${n} lần vi phạm (−${pts(n * r.discipline_fee)} điểm)` : `Đã bỏ ghi vi phạm của ${s.name}`);
    });
    const cl = $('#ad-close', pane); if (cl) cl.onclick = async () => {
      if (!confirm(`Chốt điểm danh ngày ${dmy(r.date)} cho: ${scope.map(c => c.name).join(', ')}?\n\nHọc sinh có lịch mà chưa đánh dấu sẽ được ghi cố định là đi học. Sau khi chốt không sửa được (bấm “Mở lại để sửa” nếu cần).`)) return;
      try { for (const c of scope) await api.post('/api/attendance/close', {date: r.date, class_id: c.id}); toast('🔒 Đã chốt điểm danh'); attDay(pane).catch(fail); } catch (e) { fail(e); }
    };
    const ro = $('#ad-reopen', pane); if (ro) ro.onclick = async () => {
      if (!confirm('Mở lại điểm danh ngày này để sửa?')) return;
      try { for (const c of scope.filter(x => x.closed)) await api.post('/api/attendance/close', {date: r.date, class_id: c.id, closed: false}); toast('Đã mở lại điểm danh'); attDay(pane).catch(fail); } catch (e) { fail(e); }
    };
    const off = $('#ad-off', pane); if (off) off.onclick = () => {
      const ids = r.students.filter(s => s.class_id === +att.cls && s.scheduled);
      if (confirm(`Đánh dấu lớp không học ngày ${dmy(r.date)}? Buổi này sẽ không tính cho ${ids.length} học sinh.`)) save(ids.map(s => ({student_id: s.id, status: 'none', note: 'Lớp nghỉ'})), 'Đã đánh dấu lớp không học');
    };
    const rs = $('#ad-reset', pane); if (rs) rs.onclick = () => {
      const ids = r.students.filter(s => s.class_id === +att.cls);
      if (confirm('Xóa mọi đánh dấu của lớp trong ngày này và trả về theo lịch học?')) save(ids.map(s => ({student_id: s.id, status: 'auto'})), 'Đã trả về theo lịch');
    };
  };
  render();
}
async function attSched(pane) {
  const cls = (await api.get('/api/classes')).classes;
  if (!cls.length) { pane.innerHTML = '<div class="card empty">Bạn chưa có lớp nào.</div>'; return; }
  const all = await Promise.all(cls.map(c => api.get(`/api/classes/${c.id}/schedule`)));
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  pane.innerHTML = `<div class="lb-note" style="margin-bottom:12px">Tick các thứ lớp có buổi học, ghi giờ học (không bắt buộc) và học phí mỗi buổi. <b>Ngày áp dụng</b>: lịch mới tính từ ngày này; các ngày trước vẫn theo lịch cũ nên thống kê các tháng đã qua không bị thay đổi.</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px">${cls.map((c, i) => { const s = all[i]; return `<div class="card" data-sc="${c.id}">
      <h2 style="margin:0 0 4px;font-size:16px">Lớp ${esc(c.name)} <small style="color:#667085;font-weight:400">· ${c.students} HS</small></h2>
      <div style="font-size:12px;color:${s.has ? '#166534' : '#b45309'};margin-bottom:8px">${s.has ? `Đang áp dụng${s.from ? ' từ ' + dmy(s.from) : ''}: ${Object.keys(s.days).map(k => WD_S[k]).join(', ') || 'không có buổi'} · ${vnd(s.fee)}/buổi` : '⚠ Chưa có lịch học'}</div>
      ${WD.map((w, k) => `<label style="display:flex;gap:8px;align-items:center;font-size:13px;padding:3px 0"><input type="checkbox" data-wd="${k}" ${k in s.days ? 'checked' : ''}><span style="width:70px">${w}</span><input data-tm="${k}" maxlength="40" placeholder="giờ học, vd 18:00–19:30" value="${esc(s.days[k] || '')}" style="flex:1;padding:5px 8px;border:1px solid var(--line);border-radius:6px"></label>`).join('')}
      <label style="font-size:12px;color:#475467;display:block;margin-top:8px">Học phí mỗi buổi (VNĐ)<input type="number" min="0" step="1000" data-fee value="${s.fee || 0}" style="display:block;width:100%;padding:7px;border:1px solid var(--line);border-radius:8px;margin-top:3px"></label>
      <label style="font-size:12px;color:#475467;display:block;margin-top:8px">Áp dụng từ ngày<input type="date" data-from value="${s.has ? today : today.slice(0, 8) + '01'}" style="display:block;padding:7px;border:1px solid var(--line);border-radius:8px;margin-top:3px"></label>
      <div class="lb-row" style="margin-top:10px"><button class="btn btn-blue sm" data-save>Lưu lịch học</button></div>
      ${s.history.length > 1 ? `<details style="margin-top:8px;font-size:11px;color:#667085"><summary>Lịch các giai đoạn trước</summary>${s.history.map(h => `<div>Từ ${dmy(h.from)}: ${Object.keys(h.days).map(k => WD_S[k]).join(', ') || 'không có buổi'} · ${vnd(h.fee)}/buổi</div>`).join('')}</details>` : ''}
    </div>`; }).join('')}</div>`;
  $$('[data-sc]', pane).forEach(card => {
    $$('[data-tm]', card).forEach(t => t.oninput = () => { if (t.value.trim()) $(`[data-wd="${t.dataset.tm}"]`, card).checked = true; });
    $('[data-save]', card).onclick = async () => {
      const days = {}; $$('[data-wd]:checked', card).forEach(cb => { days[cb.dataset.wd] = $(`[data-tm="${cb.dataset.wd}"]`, card).value.trim(); });
      const fee = Math.floor(+$('[data-fee]', card).value || 0);
      if (fee < 0) return toast('Học phí không hợp lệ');
      try { await api.post(`/api/classes/${card.dataset.sc}/schedule`, {days, fee, from: $('[data-from]', card).value}); toast('Đã lưu lịch học'); attSched(pane).catch(fail); } catch (e) { fail(e); }
    };
  });
}
/* Quy tắc phạt đi muộn + thưởng điểm: đặt theo tháng (áp dụng từ tháng đặt trở đi), mỗi học sinh có thể có mức điểm được thưởng riêng */
async function attRules(pane) {
  const now = new Date(Date.now() + 7 * 3600e3), months = [];
  for (let i = -1; i < 12; i++) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); months.push(d.toISOString().slice(0, 7)); }
  if (!att.rmonth) att.rmonth = months[1];
  const r = await api.get('/api/att-rules?month=' + att.rmonth), ru = r.rules, mlabel = x => x.slice(5) + '/' + x.slice(0, 4);
  const fld = 'padding:8px;border:1px solid var(--line);border-radius:8px;width:120px;margin:0 6px';
  pane.innerHTML = `<div class="card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <h2 style="margin:0;font-size:18px">⚙ Phạt đi muộn · Thưởng điểm</h2>
      <select id="ar-m" style="margin-left:auto;padding:7px;border:1px solid var(--line);border-radius:8px">${months.map(x => `<option value="${x}" ${x === r.month ? 'selected' : ''}>Tháng ${mlabel(x)}</option>`).join('')}</select></div>
    <div class="lb-note" style="margin-bottom:12px">Quy tắc đặt cho một tháng sẽ <b>áp dụng từ tháng đó trở đi</b> cho tới khi bạn đặt lại ở tháng sau — nên mỗi tháng đều đổi được mà các tháng cũ vẫn giữ nguyên số liệu.
      ${ru.from ? `Tháng ${mlabel(r.month)} đang theo quy tắc đặt từ tháng <b>${mlabel(ru.from)}</b>.` : 'Chưa đặt quy tắc nào — đang dùng mặc định.'}</div>
    <div style="display:flex;flex-direction:column;gap:12px;font-size:14px">
      <div>⏰ <b>Phạt đi muộn:</b> mỗi phút muộn trừ <input type="number" id="ar-fee" min="0" max="1000000" step="100" value="${ru.late_fee}" style="${fld}"> điểm (mặc định ${pts(r.default.late_fee)} điểm = 1.000đ/phút)</div>
      <div>🏆 <b>Thưởng bài kiểm tra:</b> điểm từ <input type="number" id="ar-min" min="0" max="10" step="0.25" value="${ru.reward_min}" style="${fld};width:90px"> /10 trở lên được cộng <input type="number" id="ar-amt" min="0" max="100000000" step="500" value="${ru.reward_amount}" style="${fld}"> điểm cho <b>mỗi bài</b> (cộng dồn qua các bài; mặc định ≥ ${r.default.reward_min} → +${pts(r.default.reward_amount)})</div>
      <div>🚫 <b>Vi phạm trong buổi học</b> (mất trật tự, dùng điện thoại, ăn quà vặt): mỗi lần trừ <input type="number" id="ar-disc" min="0" max="100000000" step="500" value="${ru.discipline_fee}" style="${fld}"> điểm (mặc định ${pts(r.default.discipline_fee)}; giáo viên ghi số lần ở tab Điểm danh)</div>
      <div>⛔ <b>Phạt không làm bài:</b> mỗi bài được giao có hạn nộp mà quá hạn vẫn chưa nộp trừ <input type="number" id="ar-miss" min="0" max="100000000" step="500" value="${ru.missed_penalty}" style="${fld}"> điểm (mặc định ${pts(r.default.missed_penalty)}; chỉ tính bài có hạn nộp, trừ vào tháng của hạn nộp; gia hạn thì hết bị trừ)</div>
      <div><button class="btn btn-blue" id="ar-save">Lưu quy tắc từ tháng ${mlabel(r.month)}</button></div></div>
    <h3 style="margin:20px 0 6px;font-size:15px">Mức điểm được thưởng của từng học sinh</h3>
    <p style="font-size:12px;color:#667085;margin:0 0 8px">Để trống = dùng mức chung (${String(ru.reward_min).replace('.', ',')}). Nhập mức riêng nếu em cần ngưỡng cao hơn hoặc thấp hơn; áp dụng từ tháng ${mlabel(r.month)} trở đi. Lưu ngay khi đổi.</p>
    ${r.students.length ? `<div style="max-height:50vh;overflow:auto"><table class="tbl"><tr><th>Học sinh</th><th>Lớp</th><th>Mức điểm được thưởng (/10)</th><th></th></tr>
      ${r.students.map(s => `<tr data-s="${s.id}"><td><b>${esc(s.name)}</b></td><td>${esc(s.class_name)}</td><td><input type="number" data-sm min="0" max="10" step="0.25" value="${s.custom ? s.reward_min : ''}" placeholder="${String(ru.reward_min).replace('.', ',')} (chung)" style="width:150px;padding:6px;border:1px solid ${s.custom ? '#2a2b86' : 'var(--line)'};border-radius:6px"></td>
        <td>${s.custom ? '<a href="#" data-sr>Đặt lại mức chung</a>' : ''}</td></tr>`).join('')}</table></div>` : '<div class="empty">Chưa có học sinh.</div>'}</div>`;
  $('#ar-m', pane).onchange = e => { att.rmonth = e.target.value; attRules(pane).catch(fail); };
  $('#ar-save', pane).onclick = async () => {
    const body = {month: r.month, late_fee: Math.max(0, Math.floor(+$('#ar-fee', pane).value || 0)), reward_min: +$('#ar-min', pane).value, reward_amount: Math.max(0, Math.floor(+$('#ar-amt', pane).value || 0)), missed_penalty: Math.max(0, Math.floor(+$('#ar-miss', pane).value || 0)), discipline_fee: Math.max(0, Math.floor(+$('#ar-disc', pane).value || 0))};
    if (!(body.reward_min >= 0 && body.reward_min <= 10)) return toast('Mức điểm được thưởng phải từ 0 đến 10');
    try { await api.post('/api/att-rules', body); toast(`Đã lưu quy tắc từ tháng ${mlabel(r.month)}`); attRules(pane).catch(fail); } catch (e) { fail(e); }
  };
  const setStu = async (sid, v) => { try { await api.post('/api/att-rules/student', {student_id: sid, month: r.month, reward_min: v}); toast('Đã lưu mức điểm thưởng'); attRules(pane).catch(fail); } catch (e) { fail(e); } };
  $$('[data-sm]', pane).forEach(i => i.onchange = () => { const v = i.value === '' ? null : +i.value; if (v !== null && !(v >= 0 && v <= 10)) return toast('Mức điểm phải từ 0 đến 10'); setStu(+i.closest('tr').dataset.s, v); });
  $$('[data-sr]', pane).forEach(a => a.onclick = e => { e.preventDefault(); setStu(+a.closest('tr').dataset.s, null); });
}
async function attStats(pane) {
  const now = new Date(Date.now() + 7 * 3600e3), months = [];
  for (let i = 0; i < 12; i++) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); months.push(d.toISOString().slice(0, 7)); }
  if (!att.month) att.month = months[0];
  const r = await api.get(`/api/attendance/stats?month=${att.month}${att.scls ? '&class_id=' + att.scls : ''}`);
  const [y, m] = r.month.split('-').map(Number);
  const dayHead = [...Array(r.days)].map((_, i) => { const wd = (r.first_weekday + i) % 7; return `<th style="padding:4px 2px;text-align:center;font-size:10px;min-width:22px;${wd >= 5 ? 'color:#b45309' : ''}">${i + 1}<br><span style="font-weight:400">${WD_S[wd]}</span></th>`; }).join('');
  const CELL = {P: ['✓', '#dcfce7', '#166534', 'Đi học (đã điểm danh)'], p: ['✓', '#f0fdf4', '#16a34a', 'Đi học (theo lịch)'], A: ['✗', '#fee2e2', '#b91c1c', 'Nghỉ'], x: ['–', '#f1f5f9', '#64748b', 'Có lịch nhưng không học'], '.': ['', '', '', ''], ' ': ['', '#fafafa', '', 'Chưa tới']};
  const cell = ch => { const [t, bg, fg, tip] = CELL[ch] || CELL['.']; return `<td title="${tip}" style="padding:3px 2px;text-align:center;font-size:11px;font-weight:700;background:${bg};color:${fg};border:1px solid #f1f5f9">${t}</td>`; };
  pane.innerHTML = `<div class="card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      <h2 style="margin:0;font-size:18px">📊 Thống kê đi học tháng ${String(m).padStart(2, '0')}/${y}</h2>
      <select id="as-m" style="margin-left:auto;padding:7px;border:1px solid var(--line);border-radius:8px">${months.map(x => `<option value="${x}" ${x === r.month ? 'selected' : ''}>Tháng ${x.slice(5)}/${x.slice(0, 4)}</option>`).join('')}</select>
      <select id="as-c" style="padding:7px;border:1px solid var(--line);border-radius:8px"><option value="">Tất cả lớp</option>${r.classes.map(c => `<option value="${c.id}" ${+att.scls === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <button class="btn btn-outline sm" id="as-csv">⬇ Tải CSV</button><button class="btn btn-outline sm" id="as-print">🖨 In bảng học phí</button></div>
    <p style="font-size:12px;color:#667085;margin:0 0 8px">Tính đến hết ngày ${dmy(r.today < r.month + '-' + String(r.days).padStart(2, '0') ? r.today : r.month + '-' + String(r.days).padStart(2, '0'))}. Thành tiền = số buổi đi học × học phí mỗi buổi của lớp (theo lịch đang áp dụng ngày đó). ${r.students.length} học sinh · tổng <b style="color:#2a2b86">${vnd(r.total)}</b> · phạt muộn <b style="color:#b91c1c">−${pts(r.total_late_fine)}</b> · phạt vi phạm <b style="color:#b91c1c">−${pts(r.total_disc_fine)}</b> · phạt không làm bài <b style="color:#b91c1c">−${pts(r.total_missed_fine)}</b> · thưởng <b style="color:#166534">+${pts(r.total_reward)}</b> điểm. Điểm ròng = thưởng bài kiểm tra + thưởng luyện tập − phạt đi muộn − phạt vi phạm trong buổi − phạt bài quá hạn không làm (quy tắc đặt ở tab “Phạt đi muộn · Thưởng điểm”).</p>
    <div style="font-size:11px;color:#475467;margin-bottom:8px;display:flex;gap:12px;flex-wrap:wrap">${['P', 'p', 'A', 'x'].map(k => `<span><span style="display:inline-block;width:18px;text-align:center;background:${CELL[k][1]};color:${CELL[k][2]};font-weight:700;border-radius:3px">${CELL[k][0]}</span> ${CELL[k][3]}</span>`).join('')}</div>
    ${r.students.length ? `<div style="max-height:64vh;overflow:auto"><table class="tbl" style="font-size:12px"><tr><th style="position:sticky;left:0;background:#fff;z-index:1">Học sinh</th><th>Lớp</th>${dayHead}<th style="text-align:center">Có lịch</th><th style="text-align:center">Đi học</th><th style="text-align:center">Nghỉ</th><th style="text-align:right">Thành tiền</th><th style="text-align:center" title="Tổng số phút đi muộn trong tháng">Phút muộn</th><th style="text-align:right">Phạt muộn</th><th style="text-align:center" title="Số lần mất trật tự · dùng điện thoại · ăn quà vặt trong tháng">Vi phạm (lần)</th><th style="text-align:right">Phạt vi phạm</th><th style="text-align:right" title="Bài được giao đã quá hạn nộp mà chưa nộp">Phạt không làm bài</th><th style="text-align:right">Thưởng bài KT</th><th style="text-align:right">Thưởng luyện tập</th><th style="text-align:right" title="Thưởng bài kiểm tra + thưởng luyện tập − phạt đi muộn − phạt không làm bài">Điểm ròng</th></tr>
      ${r.students.map(s => `<tr><td style="position:sticky;left:0;background:#fff;white-space:nowrap" ${s.notes.length ? `title="${esc(s.notes.join('\n'))}"` : ''}><b>${esc(s.name)}</b>${s.notes.length ? ' <small style="color:#b91c1c">ⓘ</small>' : ''}</td><td>${esc(s.class_name)}</td>${[...s.marks].map(cell).join('')}
        <td style="text-align:center">${s.planned}</td><td style="text-align:center"><b style="color:#166534">${s.present}</b></td><td style="text-align:center">${s.absent ? `<b style="color:#b91c1c">${s.absent}</b>` : 0}</td><td style="text-align:right;white-space:nowrap"><b>${vnd(s.amount)}</b></td>
        <td style="text-align:center">${s.late_min ? `<b style="color:#b45309">${s.late_min}</b>` : 0}</td><td style="text-align:right;color:#b91c1c;white-space:nowrap">${s.late_fine ? '−' + pts(s.late_fine) : 0}</td>
        <td style="text-align:center;white-space:nowrap" ${s.disc_times ? `title="${DISC.map(([k, l]) => l + ': ' + s.disc[k]).join(' · ')}"` : ''}>${s.disc_times ? `<b style="color:#b91c1c">${s.disc_times}</b> <small style="color:#667085">(${DISC.map(([k]) => s.disc[k]).join('·')})</small>` : 0}</td><td style="text-align:right;color:#b91c1c;white-space:nowrap">${s.disc_fine ? '−' + pts(s.disc_fine) : 0}</td>
        <td style="text-align:right;color:#b91c1c;white-space:nowrap" ${s.missed.length ? `title="${esc(s.missed.map(t => t.title).join('\n'))}"` : ''}>${s.missed_fine ? '−' + pts(s.missed_fine) + (s.missed.length > 1 ? ` <small>(${s.missed.length} bài)</small>` : '') : 0}</td>
        <td style="text-align:right;color:#166534;white-space:nowrap" ${s.tests.length ? `title="${esc(s.tests.map(t => t.title + ': ' + String(t.score10).replace('.', ',') + ' điểm → +' + t.amount).join('\n'))}"` : ''}>${s.test_reward ? '+' + pts(s.test_reward) + (s.tests.length > 1 ? ` <small>(${s.tests.length} bài)</small>` : '') : 0}</td>
        <td style="text-align:right;color:#166534">${s.practice_bonus ? '+' + pts(s.practice_bonus) : 0}</td>
        <td style="text-align:right;white-space:nowrap"><b style="color:${s.net_points < 0 ? '#b91c1c' : '#2a2b86'}">${s.net_points > 0 ? '+' : s.net_points < 0 ? '−' : ''}${pts(Math.abs(s.net_points))}</b></td></tr>`).join('')}</table></div>`
      : '<div class="empty">Chưa có học sinh.</div>'}</div>`;
  $('#as-m', pane).onchange = e => { att.month = e.target.value; attStats(pane).catch(fail); };
  $('#as-c', pane).onchange = e => { att.scls = e.target.value; attStats(pane).catch(fail); };
  const fee = s => (r.classes.find(c => c.id === s.class_id) || {}).fee || 0;
  $('#as-csv', pane).onclick = () => download(`diem-danh-${r.month}.csv`, ['Họ tên', 'Tên đăng nhập', 'Lớp', ...[...Array(r.days)].map((_, i) => String(i + 1)), 'Buổi có lịch', 'Buổi đi học', 'Buổi nghỉ', 'Thành tiền (VNĐ)', 'Phút muộn', 'Phạt muộn', 'Mất trật tự (lần)', 'Dùng điện thoại (lần)', 'Ăn quà vặt (lần)', 'Phạt vi phạm', 'Phạt không làm bài', 'Thưởng bài KT', 'Thưởng luyện tập', 'Điểm ròng', 'Ghi chú nghỉ'].join(',') + '\n'
    + r.students.map(s => [s.name, s.username, s.class_name, ...[...s.marks].map(ch => ({P: 'x', p: 'x', A: 'N', x: '-'})[ch] || ''), s.planned, s.present, s.absent, s.amount, s.late_min, s.late_fine, s.disc.noisy, s.disc.phone, s.disc.snack, s.disc_fine, s.missed_fine, s.test_reward, s.practice_bonus, s.net_points, s.notes.join('; ')].map(csvCell).join(',')).join('\n'));
  $('#as-print', pane).onclick = () => {
    const w = window.open('', '_blank'); if (!w) return toast('Trình duyệt đang chặn cửa sổ in — hãy cho phép pop-up');
    w.document.write(`<html><head><meta charset="utf-8"><title>Học phí tháng ${r.month.slice(5)}/${r.month.slice(0, 4)}</title><style>body{font-family:Arial,sans-serif;font-size:13px;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:5px 8px}th{background:#eee}td.n{text-align:right}</style></head><body>
      <h2>Bảng học phí tháng ${r.month.slice(5)}/${r.month.slice(0, 4)}${att.scls ? ' · lớp ' + esc(r.classes.find(c => c.id === +att.scls).name) : ''}</h2>
      <table><tr><th>STT</th><th>Họ tên</th><th>Lớp</th><th>Số buổi đi học</th><th>Số buổi nghỉ</th><th>Học phí/buổi</th><th>Thành tiền</th><th>Ký nhận</th></tr>
      ${r.students.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s.class_name)}</td><td class="n">${s.present}</td><td class="n">${s.absent}</td><td class="n">${vnd(fee(s))}</td><td class="n"><b>${vnd(s.amount)}</b></td><td style="width:90px"></td></tr>`).join('')}
      <tr><th colspan="6" style="text-align:right">Tổng cộng</th><th class="n">${vnd(r.total)}</th><th></th></tr></table></body></html>`);
    w.document.close(); w.focus(); w.print();
  };
}
/* ---------- TAB: điểm cộng tự luyện tập (cộng dồn theo tháng, sang tháng mới tự về 0) ---------- */
const fmtMonth = m => m ? m.slice(5) + '/' + m.slice(0, 4) : '';
const BONUS_VN = {mcq: 'Trắc nghiệm', tf: 'Đúng/Sai', short: 'Trả lời ngắn'};
let bonusClass = null, bonusMonth = null;
async function drawBonus() {
  let cls = [];
  try { cls = (await api.get('/api/classes')).classes; } catch (e) { return fail(e); }
  if (!cls.length) { view.innerHTML = '<div class="card empty">Bạn chưa có lớp nào.<br>Hãy vào tab “Lớp & học sinh” tạo lớp trước.</div>'; return; }
  if (!cls.find(c => c.id === bonusClass)) bonusClass = (cls.find(c => c.id === curClass) || cls[0]).id;
  let r;
  try { r = await api.get(`/api/classes/${bonusClass}/bonus` + (bonusMonth ? '?month=' + bonusMonth : '')); } catch (e) { return fail(e); }
  bonusMonth = r.month;
  const cur = r.month === r.current, top = r.students.filter(s => s.points > 0).length;
  const cfgIn = t => `<label style="font-size:11px;color:#475467">${BONUS_VN[t]}<span style="display:flex;align-items:center;gap:4px;margin-top:3px"><input type="number" min="0" max="10000" step="1" value="${r.config[t]}" data-bc="${t}" style="width:90px;padding:7px;border:1px solid var(--line);border-radius:8px"> điểm / câu đúng</span></label>`;
  view.innerHTML = `<div class="grid2" style="grid-template-columns:minmax(240px,320px) 1fr">
    <div>
      <div class="card"><h2 style="margin:0 0 8px;font-size:15px">Lớp</h2>
        ${cls.map(c => `<div class="cls-item ${c.id === bonusClass ? 'on' : ''}" data-bcl="${c.id}"><span>${esc(c.name)}</span><span class="pill">${c.students} HS</span></div>`).join('')}</div>
      <div class="card" style="margin-top:12px"><h2 style="margin:0 0 4px;font-size:15px">⚙ Cài đặt điểm cộng · lớp ${esc(r.class)}</h2>
        <p style="font-size:11px;color:#667085;margin:0 0 10px">Áp dụng cho <b>bài tự luyện tập</b> của học sinh. Đặt 0 để không cộng điểm cho dạng câu đó. Thay đổi chỉ áp dụng cho các lần nộp bài sau, điểm đã cộng giữ nguyên.</p>
        <div style="display:flex;flex-direction:column;gap:8px">${['mcq', 'tf', 'short'].map(cfgIn).join('')}</div>
        <div class="lb-row" style="margin-top:12px"><button class="btn btn-blue sm" id="bc-save">Lưu cài đặt</button><button class="btn btn-outline sm" id="bc-def" title="Trắc nghiệm ${r.default.mcq} · Đúng/Sai ${r.default.tf} · Trả lời ngắn ${r.default.short}">Về mặc định</button></div>
        <div class="lb-note" style="margin:12px 0 0;font-size:11px"><b>Quy tắc tính:</b><br>• Câu đúng/sai chỉ được cộng khi đúng <b>cả 4 ý</b>.<br>• Mỗi câu hỏi chỉ được cộng <b>một lần trong tháng</b> (lần đầu làm đúng); luyện lại câu đã làm đúng không được cộng thêm.<br>• Điểm cộng tính theo tháng (giờ Việt Nam); <b>ngày 1 hằng tháng tự về 0</b>, các tháng trước vẫn xem lại được.</div>
      </div>
    </div>
    <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <h2 style="margin:0;font-size:18px">⭐ Bảng điểm cộng · lớp ${esc(r.class)} · tháng ${fmtMonth(r.month)}${cur ? ' <span class="pill ok" style="font-size:11px">tháng này</span>' : ''}</h2>
        <div class="lb-row"><select id="bm" style="padding:7px;border:1px solid var(--line);border-radius:8px">${r.months.map(m => `<option value="${m}" ${m === r.month ? 'selected' : ''}>Tháng ${fmtMonth(m)}${m === r.current ? ' (hiện tại)' : ''}</option>`).join('')}</select>
        <button class="btn btn-outline sm" id="b-csv">⬇ Tải CSV</button></div></div>
      <p style="font-size:12px;color:#667085;margin:0 0 8px">${top}/${r.students.length} học sinh có điểm cộng · tổng ${r.students.reduce((n, s) => n + s.points, 0).toLocaleString('vi-VN')} điểm</p>
      ${r.students.length ? `<div style="max-height:60vh;overflow:auto"><table class="tbl"><tr><th>Hạng</th><th>Họ tên</th><th style="text-align:right">Điểm cộng</th><th>Câu đúng được cộng (TN · Đ/S · TLN)</th><th>Số bài luyện</th><th>Lần gần nhất</th><th></th></tr>
        ${r.students.map(s => `<tr data-s="${s.id}"><td>${s.points ? (s.rank <= 3 ? ['🥇', '🥈', '🥉'][s.rank - 1] : s.rank) : '—'}</td><td><b>${esc(s.name)}</b><br><small style="color:#667085">${esc(s.username)}</small></td>
          <td style="text-align:right;font-size:16px"><b style="color:${s.points ? '#b45309' : '#98a2b3'}">${s.points.toLocaleString('vi-VN')}</b></td>
          <td>${s.mcq} · ${s.tf} · ${s.short}</td><td>${s.sessions}</td><td>${s.last ? fmtDate(s.last) : '<span style="color:#98a2b3">—</span>'}</td>
          <td>${s.sessions ? '<button class="btn btn-outline sm" data-bd="1">Chi tiết</button>' : ''}</td></tr>`).join('')}</table></div>`
        : '<div class="empty">Lớp chưa có học sinh.</div>'}
    </div></div>`;
  $$('[data-bcl]', view).forEach(el => el.onclick = () => { bonusClass = +el.dataset.bcl; drawBonus(); });
  $('#bm', view).onchange = e => { bonusMonth = e.target.value; drawBonus(); };
  const save = async cfg => { try { await api.post(`/api/classes/${bonusClass}/bonus-config`, cfg); toast('Đã lưu cài đặt điểm cộng'); drawBonus(); } catch (e) { fail(e); } };
  $('#bc-save', view).onclick = () => {
    const cfg = Object.fromEntries($$('[data-bc]', view).map(i => [i.dataset.bc, Math.floor(+i.value)]));
    if (Object.values(cfg).some(v => !(v >= 0 && v <= 10000))) return toast('Điểm cộng mỗi câu từ 0 đến 10.000');
    save(cfg);
  };
  $('#bc-def', view).onclick = () => save(r.default);
  $('#b-csv', view).onclick = () => download(`diem-cong-${r.class}-${r.month}.csv`, 'Hạng,Họ tên,Tên đăng nhập,Điểm cộng,Câu TN đúng,Câu Đ/S đúng,Câu TLN đúng,Số bài luyện\n'
    + r.students.map(s => [s.points ? s.rank : '', s.name, s.username, s.points, s.mcq, s.tf, s.short, s.sessions].map(csvCell).join(',')).join('\n'));
  $$('[data-bd]', view).forEach(b => b.onclick = async () => {
    try {
      const d = await api.get(`/api/students/${b.closest('tr').dataset.s}/bonus?month=${r.month}`);
      modal(`<h2>⭐ Điểm cộng · ${esc(d.student)}</h2><p style="font-size:13px;margin:0 0 8px">Tháng ${fmtMonth(d.month)} · tổng <b style="color:#b45309">${d.total.toLocaleString('vi-VN')}</b> điểm</p>
        <div style="max-height:56vh;overflow:auto"><table class="tbl"><tr><th>Bài luyện tập</th><th>Đúng/Tổng</th><th>Câu được cộng (TN · Đ/S · TLN)</th><th>Câu làm lại</th><th style="text-align:right">Điểm cộng</th><th>Lúc</th></tr>
        ${d.sessions.map(x => `<tr><td>${esc(x.title)}</td><td>${fmtScore(x.score)}/${x.max}</td><td>${x.mcq} · ${x.tf} · ${x.short}</td><td>${x.repeat ? `<span title="Câu đã làm đúng trước đó trong tháng, không cộng thêm">${x.repeat}</span>` : '—'}</td><td style="text-align:right"><b>+${x.points.toLocaleString('vi-VN')}</b></td><td>${fmtDate(x.at)}</td></tr>`).join('')}</table></div>`, true);
    } catch (e) { fail(e); }
  });
}
/* ---------- TAB: hỏi bài — học sinh gửi đề (ảnh / chữ); AI giải trước, giáo viên của lớp xem, trả lời hoặc xác nhận lời giải AI ---------- */
const hv = {status: 'waiting'};
async function refreshHelpBadge() {
  try { const r = await api.get('/api/help?status=none'); const b = $('#tab-help'); if (b) b.textContent = r.waiting ? `🙋 Hỏi bài (${r.waiting})` : '🙋 Hỏi bài'; return r.waiting; } catch (e) { return 0; }
}
async function drawHelp() {
  view.innerHTML = '<div class="card empty">Đang tải...</div>';
  let r;
  try { r = await api.get('/api/help?status=' + hv.status); } catch (e) { return fail(e); }
  const tb = $('#tab-help'); if (tb) tb.textContent = r.waiting ? `🙋 Hỏi bài (${r.waiting})` : '🙋 Hỏi bài';
  const ST = {ai: ['🤖 AI đã giải', 'ok'], waiting: ['⏳ Chờ giáo viên', 'warn'], answered: ['✅ Đã trả lời', 'ok'], closed: ['Học sinh đã hiểu', '']};
  const chips = [['waiting', `⏳ Chờ giáo viên${r.waiting ? ' (' + r.waiting + ')' : ''}`], ['ai', '🤖 AI đã giải'], ['answered', '✅ Đã trả lời'], ['closed', 'Đã hiểu'], ['all', 'Tất cả']];
  const card = x => { const [lb, cl] = ST[x.status] || ['', ''];
    return `<div class="card" style="margin-bottom:12px" data-h="${x.id}">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>${esc(x.student)}</b> <span class="muted" style="font-size:12px">· Lớp ${esc(x.class_name || '—')} · ${esc(x.subject)} · ${fmtDate(x.created_at)}</span></div><span class="pill ${cl}">${lb}</span></div>
      ${x.text ? `<p style="white-space:pre-wrap;margin:8px 0;font-size:13px">${esc(x.text)}</p>` : ''}
      ${x.images.length ? `<div class="lb-row" style="margin:6px 0">${x.images.map(i => `<a href="/api/img/${i}" target="_blank"><img src="/api/img/${i}" style="max-height:150px;border-radius:8px;border:1px solid var(--line)"></a>`).join('')}</div>` : ''}
      ${x.ai ? `<details ${x.status === 'waiting' ? 'open' : ''} style="background:#f5f6ff;border:1px solid #d9dcfb;border-radius:10px;padding:10px;margin:8px 0"><summary style="cursor:pointer;font-weight:700;font-size:13px">🤖 AI: ${x.ai.answer ? esc(x.ai.answer) : '<span style="color:#b42318">không có đáp án</span>'} <small style="color:${x.ai.conf === 'high' ? '#067647' : '#b45309'}">(độ tin cậy: ${{high: 'cao', medium: 'vừa', low: 'thấp'}[x.ai.conf] || x.ai.conf})</small></summary>${x.ai.solution ? `<div style="white-space:pre-wrap;font-size:13px;margin-top:8px;line-height:1.6">${esc(x.ai.solution)}</div>` : ''}${x.ai.note ? `<div class="muted" style="font-size:12px;margin-top:6px">💡 ${esc(x.ai.note)}</div>` : ''}</details>` : (x.ai_error ? `<div class="muted" style="font-size:12px;margin:6px 0">⚠ ${esc(x.ai_error)}</div>` : '')}
      ${x.asked_teacher ? '<div style="font-size:12px;color:#b45309;margin:4px 0">🙋 Học sinh chủ động nhờ giáo viên giúp.</div>' : ''}
      ${x.verified ? `<div style="font-size:12px;color:#067647;margin:4px 0">✅ ${esc(x.teacher_name || 'Giáo viên')} đã xác nhận lời giải của AI.</div>` : ''}
      <textarea data-t rows="3" maxlength="4000" placeholder="Viết lời giải / hướng dẫn cho học sinh..." style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;font-size:13px;margin-top:6px">${esc(x.teacher_answer)}</textarea>
      <div class="lb-row" style="margin-top:6px"><button class="btn btn-blue sm" data-send>Gửi lời giải cho học sinh</button>${x.ai && x.ai.answer && !x.verified ? '<button class="btn btn-outline sm" data-approve>✓ Xác nhận lời giải AI là đúng</button>' : ''}<button class="btn btn-outline sm" data-del style="color:#b42318">Xóa</button></div></div>`; };
  view.innerHTML = `<h3 style="margin:0 0 4px">Học sinh hỏi bài</h3><p class="section-sub" style="margin:0 0 10px">Học sinh gửi đề (ảnh hoặc chữ) và được AI giải trước. Câu nào AI không chắc chắn hoặc học sinh nhờ thêm sẽ nằm ở “Chờ giáo viên”. Bạn viết lời giải, hoặc xác nhận lời giải của AI là đúng.</p>
    <div class="lb-tabs" style="margin-bottom:10px">${chips.map(([k, t]) => `<button data-hs="${k}" class="${hv.status === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    ${r.requests.length ? r.requests.map(card).join('') : '<div class="card empty">Không có câu hỏi nào.</div>'}`;
  $$('[data-hs]', view).forEach(b => b.onclick = () => { hv.status = b.dataset.hs; drawHelp(); });
  $$('[data-h]', view).forEach(el => { const id = +el.dataset.h;
    const send = o => api.post(`/api/help/${id}/answer`, o).then(() => { toast('Đã gửi cho học sinh'); drawHelp(); }).catch(fail);
    $('[data-send]', el).onclick = () => { const t = $('[data-t]', el).value.trim(); if (!t) return toast('Hãy viết lời giải / hướng dẫn'); send({text: t}); };
    const ap = $('[data-approve]', el); if (ap) ap.onclick = () => send({approve_ai: true, text: $('[data-t]', el).value.trim()});
    $('[data-del]', el).onclick = () => { if (confirm('Xóa câu hỏi này?')) api.del('/api/help/' + id).then(() => { toast('Đã xóa'); drawHelp(); }).catch(fail); };
  });
}
/* ---------- TAB: báo đáp án sai — học sinh báo (kèm ảnh), giáo viên / quản trị duyệt: sửa đáp án + chấm lại bài đã nộp ---------- */
const rpv = {status: 'pending'};
async function refreshReportBadge() {
  try { const r = await api.get('/api/reports?status=none'); const b = $('#tab-reports'); if (b) b.textContent = r.pending ? `🚩 Báo đáp án sai (${r.pending})` : '🚩 Báo đáp án sai'; return r.pending; } catch (e) { return 0; }
}
async function drawReports() {
  view.innerHTML = '<div class="card empty">Đang tải...</div>';
  let r;
  try { r = await api.get('/api/reports?status=' + rpv.status); } catch (e) { return fail(e); }
  const tb = $('#tab-reports'); if (tb) tb.textContent = r.pending ? `🚩 Báo đáp án sai (${r.pending})` : '🚩 Báo đáp án sai';
  const LET = 'ABCD', tfs = v => Array.isArray(v) ? v.map((x, k) => `${'abcd'[k]}) ${x === 0 ? 'Đúng' : 'Sai'}`).join(' · ') : '';
  const ansText = (sn, a) => a == null ? '' : sn.sts ? tfs(a) : sn.t === 'short' ? esc(a) : (a && typeof a === 'object' ? `${LET[a.idx]}${a.text && !sn.img ? '. ' + esc(a.text) : ''}` : Number.isInteger(a) ? LET[a] + (sn.opts && !sn.img ? '. ' + esc(sn.opts[a]) : '') : '');
  const NAME = {pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối'};
  const card = x => { const sn = x.snapshot, tf = !!sn.sts, done = x.status !== 'pending';
    const pick = tf ? `<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center">${sn.sts.map((s, k) => `<b>${'abcd'[k]})</b><select data-tf="${k}" style="padding:6px;border:1px solid var(--line);border-radius:8px"><option value="0" ${x.proposed && x.proposed[k] === 0 ? 'selected' : ''}>Đúng</option><option value="1" ${x.proposed && x.proposed[k] === 1 ? 'selected' : (!x.proposed && sn.ans[k] === 1 ? 'selected' : '')}>Sai</option></select>`).join('')}</div>`
      : sn.t === 'short' ? `<input data-short maxlength="60" value="${esc(x.proposed != null ? x.proposed : sn.ans != null ? sn.ans : '')}" style="padding:8px;border:1px solid var(--line);border-radius:8px;width:240px">`
      : `<div style="display:flex;flex-direction:column;gap:5px">${(sn.opts || []).map((o, j) => `<label style="display:flex;gap:8px;cursor:pointer"><input type="radio" name="o${x.id}" value="${j}" ${x.proposed && x.proposed.idx === j ? 'checked' : ''}><span><b>${LET[j]}.</b> ${sn.img ? '' : esc(o)}${sn.ans === j ? ' <span class="pill bad" style="font-size:10px">đáp án hiện tại</span>' : ''}${x.proposed && x.proposed.idx === j ? ' <span class="pill warn" style="font-size:10px">học sinh đề xuất</span>' : ''}</span></label>`).join('')}</div>`;
    return `<div class="card" data-r="${x.id}" style="margin-bottom:14px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><b>${esc(x.student)}</b><span class="muted" style="font-size:12px">${esc(x.class_name)} · ${esc(x.title)} · câu ${x.qi + 1} · ${fmtDate(x.created_at)}</span>
        <span class="pill ${x.status === 'approved' ? 'ok' : x.status === 'rejected' ? 'bad' : 'warn'}" style="margin-left:auto">${NAME[x.status]}</span></div>
      <div style="border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:13px;max-height:34vh;overflow:auto">${LBX.qBody(sn)}${sn.opts && !sn.img ? `<div style="margin-top:6px">${sn.opts.map((o, j) => `<div><b>${LET[j]}.</b> ${esc(o)}</div>`).join('')}</div>` : ''}${tf && !sn.img ? `<div style="margin-top:6px">${sn.sts.map((s, k) => `<div><b>${'abcd'[k]})</b> ${esc(s)}</div>`).join('')}</div>` : ''}</div>
      <div style="margin:8px 0;font-size:13px">Đáp án hiện tại: <b style="color:#b91c1c">${ansText(sn, sn.ans) || '—'}</b>${x.proposed != null ? ` · Học sinh đề xuất: <b style="color:#166534">${ansText(sn, x.proposed)}</b>` : ' · <span class="muted">học sinh không đề xuất đáp án</span>'}</div>
      ${x.note ? `<div class="lb-note" style="margin:0 0 8px"><b>Học sinh ghi:</b> ${esc(x.note)}</div>` : ''}
      ${x.images.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">${x.images.map(i => `<a href="/api/img/${i}" target="_blank" rel="noopener"><img src="/api/img/${i}" style="height:90px;border-radius:8px;border:1px solid var(--line)" alt="Ảnh học sinh đính kèm"></a>`).join('')}</div>` : ''}
      ${done ? `<div style="font-size:12px;color:#475467">${x.status === 'approved' ? `Đáp án mới: <b>${ansText(sn, x.new_ans)}</b> · ` : ''}${esc(x.resolution)} · ${fmtDate(x.resolved_at)}${x.status === 'approved' && x.affected && x.affected.submissions != null ? ` · chấm lại ${x.affected.submissions} bài kiểm tra (${x.affected.changed} bài đổi điểm)${x.affected.practice ? `, ${x.affected.practice} bài luyện tập` : ''}` : ''}</div>`
      : `<b style="font-size:13px">Đáp án đúng là:</b><div style="margin:6px 0 8px">${pick}</div>
        <input data-note maxlength="500" placeholder="Ghi chú gửi học sinh (tùy chọn)" style="padding:7px 10px;border:1px solid var(--line);border-radius:8px;width:100%;margin-bottom:8px">
        <div class="lb-row"><button class="btn btn-blue sm" data-ok="1" title="Sửa đáp án ở ngân hàng, mọi đề đã giao và chấm lại các bài đã nộp có câu này">✓ Duyệt và sửa đáp án</button><button class="btn btn-outline sm" data-no="1">✗ Từ chối (giữ đáp án)</button></div>`}</div>`; };
  view.innerHTML = `<div class="card"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px"><h2 style="margin:0;font-size:18px">🚩 Báo đáp án sai của học sinh</h2>
      <div class="lb-row" style="margin-left:auto">${[['pending', `Chờ duyệt (${r.pending})`], ['approved', 'Đã duyệt'], ['rejected', 'Đã từ chối'], ['all', 'Tất cả']].map(([k, l]) => `<button class="btn ${rpv.status === k ? 'btn-blue' : 'btn-outline'} sm" data-rs="${k}">${l}</button>`).join('')}</div></div>
      <p style="font-size:12px;color:#667085;margin:0">Khi duyệt, đáp án được sửa ở ngân hàng câu hỏi và mọi đề đã giao có câu đó; các bài đã nộp được <b>chấm lại</b> nên điểm kiểm tra và điểm thưởng tự cập nhật. Phương án trắc nghiệm đã bị đảo thứ tự ở từng mã đề được đối chiếu theo nội dung.</p></div>
    <div style="margin-top:12px">${r.reports.length ? r.reports.map(card).join('') : '<div class="card empty">Không có báo cáo nào.</div>'}</div>`;
  $$('[data-rs]', view).forEach(b => b.onclick = () => { rpv.status = b.dataset.rs; drawReports(); });
  $$('[data-r]', view).forEach(el => {
    const id = +el.dataset.r, x = r.reports.find(z => z.id === id), sn = x.snapshot;
    const body = approve => {
      const o = {approve, note: ($('[data-note]', el) || {}).value || ''};
      if (approve) {
        if (sn.sts) o.answer = $$('[data-tf]', el).map(s => +s.value);
        else if (sn.t === 'short') o.answer = ($('[data-short]', el).value || '').trim();
        else { const c = $(`input[name=o${id}]:checked`, el); if (!c) return null; o.answer = {idx: +c.value}; }
      }
      return o;
    };
    const ok = $('[data-ok]', el), no = $('[data-no]', el);
    if (ok) ok.onclick = async () => {
      const o = body(true); if (!o) return toast('Hãy chọn đáp án đúng');
      if (!confirm('Sửa đáp án ở ngân hàng và các đề đã giao, rồi chấm lại các bài đã nộp có câu này?')) return;
      ok.disabled = true;
      try { const res = await api.post(`/api/reports/${id}/resolve`, o), f = res.affected; toast(`Đã sửa đáp án. Chấm lại ${f.submissions} bài kiểm tra (${f.changed} bài đổi điểm).`); drawReports(); } catch (e) { ok.disabled = false; fail(e); }
    };
    if (no) no.onclick = async () => {
      if (!confirm('Từ chối báo cáo này và giữ nguyên đáp án?')) return;
      try { await api.post(`/api/reports/${id}/resolve`, body(false)); toast('Đã từ chối báo cáo'); drawReports(); } catch (e) { fail(e); }
    };
  });
}
/* ---------- TAB: quản lý điểm — điểm cộng, điểm trừ, điểm hiện tại của cả lớp, xếp hạng, lịch sử từng học sinh ---------- */
const ptv = {cls: '', month: 'all'};
const PT_KIND = {tests: ['🏆', 'Thưởng bài kiểm tra'], practice: ['🎯', 'Thưởng tự luyện tập'], late: ['⏰', 'Phạt đi muộn'], missed: ['⛔', 'Phạt không làm bài'], discipline: ['🚫', 'Phạt vi phạm trong buổi'], adjust: ['✏️', 'Giáo viên điều chỉnh']};
const ptN = v => Math.abs(v).toLocaleString('vi-VN'), ptS = v => (v > 0 ? '+' : v < 0 ? '−' : '') + ptN(v);
async function drawPoints() {
  view.innerHTML = '<div class="card empty">Đang tải...</div>';
  let r;
  try { r = await api.get(`/api/points/board?month=${ptv.month}${ptv.cls ? '&class_id=' + ptv.cls : ''}`); } catch (e) { return fail(e); }
  const ml = x => x.slice(5) + '/' + x.slice(0, 4), T = r.totals;
  const chip = (label, val, color, sub) => `<div class="card" style="box-shadow:none;padding:12px 16px;flex:1;min-width:150px"><div style="font-size:11px;color:#667085">${label}</div><div style="font-size:24px;font-weight:800;color:${color}">${val}</div>${sub ? `<div style="font-size:11px;color:#667085">${sub}</div>` : ''}</div>`;
  const brk = (x, kinds, sign) => kinds.filter(k => x.parts[k] * sign > 0).map(k => `${PT_KIND[k][0]} ${ptN(x.parts[k])}`).join(' · ');
  view.innerHTML = `<div class="card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      <h2 style="margin:0;font-size:18px">🏅 Quản lý điểm</h2>
      <select id="pt-c" style="margin-left:auto;padding:7px;border:1px solid var(--line);border-radius:8px"><option value="">Tất cả lớp</option>${r.classes.map(c => `<option value="${c.id}" ${+ptv.cls === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <select id="pt-m" style="padding:7px;border:1px solid var(--line);border-radius:8px"><option value="all" ${r.month === 'all' ? 'selected' : ''}>Từ trước đến nay</option>${r.months.map(m => `<option value="${m}" ${m === r.month ? 'selected' : ''}>Tháng ${ml(m)}${m === r.current ? ' (hiện tại)' : ''}</option>`).join('')}</select>
      <button class="btn btn-outline sm" id="pt-csv">⬇ Tải CSV</button></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${chip('Tổng điểm cộng', '+' + ptN(T.plus), '#166534', 'thưởng bài kiểm tra + luyện tập + điều chỉnh cộng')}
      ${chip('Tổng điểm trừ', '−' + ptN(T.minus), '#b91c1c', 'phạt đi muộn + vi phạm + không làm bài + điều chỉnh trừ')}
      ${chip('Điểm hiện tại (ròng)', ptS(T.net), T.net < 0 ? '#b91c1c' : '#2a2b86', `${T.students} học sinh`)}
      ${chip('Học sinh âm điểm', T.negative, T.negative ? '#b91c1c' : '#667085', T.negative ? 'đang bôi đỏ trong bảng' : 'không có')}</div>
    ${r.students.length ? `<div style="max-height:62vh;overflow:auto"><table class="tbl"><tr><th>Hạng</th><th>Học sinh</th><th>Lớp</th><th style="text-align:right">Điểm cộng</th><th style="text-align:right">Điểm trừ</th><th style="text-align:right">Điểm hiện tại</th><th></th></tr>
      ${r.students.map(x => { const neg = x.net < 0; return `<tr data-s="${x.id}" style="${neg ? 'background:#fef2f2' : ''}">
        <td>${neg ? '<span title="Âm điểm">⚠</span>' : x.net > 0 && x.rank <= 3 ? ['🥇', '🥈', '🥉'][x.rank - 1] : x.rank}</td>
        <td><b style="${neg ? 'color:#b91c1c' : ''}">${esc(x.name)}</b><br><small style="color:#667085">${esc(x.username)}</small></td><td>${esc(x.class_name)}</td>
        <td style="text-align:right;white-space:nowrap"><b style="color:${x.plus ? '#166534' : '#98a2b3'}">${x.plus ? '+' + ptN(x.plus) : 0}</b><div style="font-size:10px;color:#667085">${brk(x, ['tests', 'practice', 'adjust'], 1)}</div></td>
        <td style="text-align:right;white-space:nowrap"><b style="color:${x.minus ? '#b91c1c' : '#98a2b3'}">${x.minus ? '−' + ptN(x.minus) : 0}</b><div style="font-size:10px;color:#667085">${brk(x, ['late', 'discipline', 'missed', 'adjust'], -1)}</div></td>
        <td style="text-align:right;font-size:17px;white-space:nowrap"><b style="color:${neg ? '#b91c1c' : x.net > 0 ? '#2a2b86' : '#667085'}">${ptS(x.net)}</b></td>
        <td><button class="btn btn-outline sm" data-pd="1">Chi tiết</button></td></tr>`; }).join('')}</table></div>
      <p style="font-size:11px;color:#667085;margin:8px 0 0">Điểm hiện tại = điểm cộng − điểm trừ. Xếp hạng từ cao xuống thấp; hàng đỏ là học sinh đang âm điểm. Bấm “Chi tiết” để xem lịch sử từng khoản.</p>`
      : '<div class="empty">Chưa có học sinh.</div>'}</div>`;
  $('#pt-c', view).onchange = e => { ptv.cls = e.target.value; drawPoints(); };
  $('#pt-m', view).onchange = e => { ptv.month = e.target.value; drawPoints(); };
  $('#pt-csv', view).onclick = () => download(`diem-lop-${r.month}.csv`, 'Hạng,Họ tên,Tên đăng nhập,Lớp,Điểm cộng,Điểm trừ,Điểm hiện tại\n'
    + r.students.map(x => [x.rank, x.name, x.username, x.class_name, x.plus, -x.minus, x.net].map(csvCell).join(',')).join('\n'));
  $$('[data-pd]', view).forEach(b => b.onclick = () => pointDetail(+b.closest('tr').dataset.s).catch(fail));
  $$('tr[data-s]', view).forEach(tr => tr.style.cursor = 'pointer');
  $$('tr[data-s]', view).forEach(tr => tr.onclick = e => { if (e.target.closest('button')) return; pointDetail(+tr.dataset.s).catch(fail); });
}
async function pointDetail(id) {
  const d = await api.get('/api/points/student/' + id), ml = x => x.slice(5) + '/' + x.slice(0, 4), ev = d.events.slice().reverse();
  const col = v => v < 0 ? '#b91c1c' : v > 0 ? '#166534' : '#667085';
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const m = modal(`<h2>🏅 Lịch sử điểm · ${esc(d.student.name)} <small style="font-weight:400;color:#667085">· lớp ${esc(d.student.class_name)}</small></h2>
    <div style="display:flex;gap:18px;flex-wrap:wrap;margin:6px 0 12px;font-size:13px">
      <span>Điểm cộng <b style="color:#166534;font-size:18px">+${ptN(d.plus)}</b></span><span>Điểm trừ <b style="color:#b91c1c;font-size:18px">−${ptN(d.minus)}</b></span>
      <span>Điểm hiện tại <b style="font-size:20px;color:${d.net < 0 ? '#b91c1c' : '#2a2b86'}">${ptS(d.net)}</b></span></div>
    ${d.net < 0 ? '<div class="lb-note" style="background:#fef2f2;border-color:#fecaca;color:#991b1b">Học sinh này đang âm điểm.</div>' : ''}
    <div class="card" style="box-shadow:none;background:#f8fafc;padding:10px 12px;margin:0 0 12px"><b style="font-size:13px">✏️ Điều chỉnh điểm</b>
      <div style="font-size:11px;color:#667085;margin:2px 0 8px">Cộng thêm hoặc trừ bớt điểm cho đúng thực tế, ví dụ học sinh nghỉ học có lý do thì bấm “Miễn” ở khoản phạt bên dưới, hoặc nhập số dương để hoàn điểm, số âm để trừ thêm. Có ghi lại lịch sử.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input id="pa-amt" placeholder="Số điểm (vd +5000 hoặc -2000)" style="padding:7px 9px;border:1px solid var(--line);border-radius:8px;width:200px">
        <input id="pa-reason" maxlength="200" placeholder="Lý do (bắt buộc), vd: Nghỉ học có phép" style="padding:7px 9px;border:1px solid var(--line);border-radius:8px;flex:1;min-width:220px">
        <input id="pa-date" type="date" max="${today}" title="Ngày áp dụng (để trống = hôm nay)" style="padding:6px 8px;border:1px solid var(--line);border-radius:8px">
        <button class="btn btn-blue sm" id="pa-save">Lưu điều chỉnh</button></div></div>
    ${d.months.length ? `<b style="font-size:13px">Theo tháng</b><table class="tbl" style="margin:4px 0 14px;font-size:12px"><tr><th>Tháng</th><th style="text-align:right">Cộng</th><th style="text-align:right">Trừ</th><th style="text-align:right">Ròng</th></tr>
      ${d.months.map(m => `<tr><td>${ml(m.month)}</td><td style="text-align:right;color:#166534">${m.plus ? '+' + ptN(m.plus) : 0}</td><td style="text-align:right;color:#b91c1c">${m.minus ? '−' + ptN(m.minus) : 0}</td><td style="text-align:right"><b style="color:${col(m.net)}">${ptS(m.net)}</b></td></tr>`).join('')}</table>` : ''}
    <b style="font-size:13px">Từng khoản (mới nhất trước)</b>
    ${ev.length ? `<div style="max-height:46vh;overflow:auto"><table class="tbl" style="font-size:12px"><tr><th>Lúc</th><th>Loại</th><th>Nội dung</th><th style="text-align:right">Điểm</th><th style="text-align:right">Số dư</th><th></th></tr>
      ${ev.map((e, i) => `<tr><td style="white-space:nowrap">${e.at ? fmtDate(e.at) : ''}</td><td style="white-space:nowrap">${PT_KIND[e.kind][0]} ${PT_KIND[e.kind][1]}</td><td>${esc(e.title)}<div style="font-size:10px;color:#667085">${esc(e.detail || '')}</div></td>
        <td style="text-align:right;white-space:nowrap"><b style="color:${col(e.amount)}">${ptS(e.amount)}</b></td><td style="text-align:right;white-space:nowrap;color:${col(e.balance)}">${ptS(e.balance)}</td>
        <td style="white-space:nowrap">${e.kind === 'adjust' ? `<button class="btn btn-outline sm" data-adel="${e.adj_id}">Xóa</button>` : e.amount < 0 ? `<button class="btn btn-outline sm" data-waive="${i}" title="Hoàn lại điểm bị trừ (ghi thành một khoản điều chỉnh)">Miễn</button>` : ''}</td></tr>`).join('')}</table></div>`
      : '<div class="empty">Chưa có khoản cộng hay trừ nào.</div>'}`, true);
  const after = () => { m.close(); drawPoints(); pointDetail(id).catch(fail); };
  const parseAmt = v => { const t = String(v).replace(/[−–]/g, '-').replace(/[\s.,]/g, ''); return /^[+-]?\d+$/.test(t) ? parseInt(t, 10) : NaN; };
  const send = async body => { try { await api.post('/api/points/adjust', {student_id: id, ...body}); toast('Đã lưu điều chỉnh điểm'); after(); } catch (e) { fail(e); } };
  $('#pa-save', m.b).onclick = () => {
    const amount = parseAmt($('#pa-amt', m.b).value), reason = $('#pa-reason', m.b).value.trim(), date = $('#pa-date', m.b).value;
    if (!Number.isFinite(amount) || amount === 0) return toast('Hãy nhập số điểm khác 0, ví dụ +5000 hoặc -2000');
    if (!reason) return toast('Hãy ghi lý do điều chỉnh');
    send({amount, reason, ...(date ? {date} : {})});
  };
  $$('[data-waive]', m.b).forEach(b => b.onclick = () => {
    const e = ev[+b.dataset.waive], day = e.at ? new Date(e.at * 1000 + 7 * 3600e3).toISOString().slice(0, 10) : today;   // ghi vào đúng ngày của khoản phạt
    if (confirm(`Miễn khoản “${e.title}” (${ptS(e.amount)} điểm)?
Hệ thống sẽ cộng lại ${ptN(e.amount)} điểm cho học sinh.`)) send({amount: -e.amount, reason: 'Miễn: ' + e.title, date: day <= today ? day : today});
  });
  $$('[data-adel]', m.b).forEach(b => b.onclick = async () => {
    if (!confirm('Xóa khoản điều chỉnh này? Điểm của học sinh sẽ được tính lại.')) return;
    try { await api.del('/api/points/adjust/' + b.dataset.adel); toast('Đã xóa khoản điều chỉnh'); after(); } catch (e) { fail(e); }
  });
}
/* Giáo viên mở các chuyên đề trong ngân hàng của mình cho lớp để học sinh tự tạo đề luyện tập */
async function practiceSettings(cls) {
  const groups = (await api.get(`/api/classes/${cls.id}/practice`)).groups;
  const m = modal(`<h2>📚 Luyện tập tự do · lớp ${esc(cls.name)}</h2>
    <p style="font-size:12px;color:#667085;margin:0 0 8px">Tick các chuyên đề cho phép học sinh của lớp <b>tự tạo đề luyện tập</b> (hệ thống chấm và cho học sinh xem đáp án ngay). Chỉ tính các câu đã có đáp án; học sinh không xem được câu hỏi ngoài lúc làm bài. Kết quả luyện tập hiện trong bảng học sinh của lớp và ở trang phụ huynh.</p>
    ${groups.length ? `<div style="max-height:46vh;overflow:auto"><table class="tbl"><tr><th style="width:30px"><input type="checkbox" id="pall"></th><th>Môn · Khối</th><th>Chuyên đề</th><th>TN</th><th>Đ/S</th><th>TLN</th></tr>
    ${groups.map((g, i) => `<tr><td><input type="checkbox" data-i="${i}" ${g.open ? 'checked' : ''}></td><td>${esc(g.subject || '—')}${g.grade ? ' · ' + esc(g.grade) : ''}</td><td><b>${esc(g.topic || 'Chưa phân chuyên đề')}</b></td><td>${g.counts.mcq}</td><td>${g.counts.tf}</td><td>${g.counts.short}</td></tr>`).join('')}</table></div>
    <div class="lb-row" style="margin-top:12px"><button class="btn btn-blue" id="psave">Lưu</button></div>`
      : '<div class="empty">Ngân hàng câu hỏi của bạn chưa có câu nào có đáp án.<br>Hãy import đề và nhập đáp án ở trang <a href="teacher-builder.html">AI Copilot</a>.</div>'}`, true);
  const all = $('#pall', m.b); if (all) all.onchange = () => $$('[data-i]', m.b).forEach(c => { c.checked = all.checked; });
  const sv = $('#psave', m.b); if (sv) sv.onclick = async () => {
    const open = $$('[data-i]:checked', m.b).map(c => { const g = groups[+c.dataset.i]; return {subject: g.subject, grade: g.grade, topic: g.topic}; });
    try { const r = await api.post(`/api/classes/${cls.id}/practice`, {open}); m.close(); toast(`Đã mở ${r.open} chuyên đề cho lớp ${cls.name}`); } catch (e) { fail(e); }
  };
}
/* Giáo viên xem các bài tự luyện tập của một học sinh */
async function showPractice(s) {
  const r = await api.get(`/api/students/${s.id}/practice`);
  const m = modal(`<h2>Tự luyện tập · ${esc(r.student)}</h2><p style="font-size:12px;color:#667085;margin:0 0 8px">${r.sessions.length} bài · điểm trung bình ${fmtScore(r.avg)}</p>
    <div style="max-height:52vh;overflow:auto">${r.sessions.length ? `<table class="tbl"><tr><th>Bài</th><th>Điểm (10)</th><th>Đúng/Tổng</th><th>Lúc</th><th></th></tr>${r.sessions.map(x => `<tr data-id="${x.id}"><td>${esc(x.title)}</td><td><b>${fmtScore(x.score10)}</b></td><td>${fmtScore(x.score)}/${x.max}</td><td>${fmtDate(x.at)}</td><td><button class="btn btn-outline sm" data-v="1">Xem bài</button></td></tr>`).join('')}</table>` : '<div class="empty">Chưa có bài luyện tập nào.</div>'}</div>`, true);
  $$('[data-v]', m.b).forEach(b => b.onclick = async () => {
    try {
      const d = await api.get(`/api/students/${s.id}/practice/${b.closest('tr').dataset.id}`);
      modal(`<h2>${esc(d.title)}</h2><p style="font-size:13px">${esc(d.student)} · điểm <b>${fmtScore(d.score10)}</b>/10 · đúng ${fmtScore(d.score)}/${d.max} câu</p><div style="max-height:60vh;overflow:auto">${window.LBX.reviewHTML(d.questions, d.details, 'Học sinh chọn')}</div>`, true);
    } catch (e) { fail(e); }
  });
}
function studentForm(cls) {
  const m = modal(`<h2>Thêm học sinh · lớp ${esc(cls.name)}</h2>
    <label class="lb-field"><span>HỌ VÀ TÊN</span><input id="sn" maxlength="80"></label>
    <label class="lb-field"><span>TÊN ĐĂNG NHẬP (bỏ trống = tự tạo từ họ tên)</span><input id="su" maxlength="32" autocapitalize="off"></label>
    <label class="lb-field"><span>MẬT KHẨU (bỏ trống = tự tạo ngẫu nhiên, khuyên dùng)</span><input id="sp" maxlength="100"></label>
    <button class="btn btn-blue" id="sv">Tạo tài khoản</button>`);
  $('#sv', m.b).onclick = async () => {
    const name = $('#sn', m.b).value.trim(); if (!name) return toast('Hãy nhập họ tên');
    try { const r = await api.post('/api/students', {class_id: cls.id, name, username: $('#su', m.b).value.trim(), password: $('#sp', m.b).value});
      showCredentials('Đã tạo tài khoản học sinh', [r.account]); drawStudents(); drawClassesCountOnly(); } catch (e) { fail(e); }
  };
}
function bulkForm(cls) {
  const m = modal(`<h2>Thêm nhiều học sinh · lớp ${esc(cls.name)}</h2>
    <p style="font-size:12px;color:#667085;margin:0 0 6px">Mỗi dòng một học sinh. Có thể dán thẳng cột “Họ tên” từ Excel. Tên đăng nhập và mật khẩu được tạo tự động (tối đa 200 dòng).</p>
    <textarea id="bl" style="width:100%;min-height:200px;padding:10px;border:1px solid var(--line);border-radius:8px;font:inherit" placeholder="Nguyễn Văn An&#10;Trần Thị Bình&#10;Lê Minh Châu"></textarea>
    <div class="lb-row" style="margin-top:10px"><button class="btn btn-blue" id="bv">Tạo tài khoản</button><span id="bc" style="font-size:12px;color:#667085"></span></div>`, true);
  const names = () => $('#bl', m.b).value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  $('#bl', m.b).oninput = () => { $('#bc', m.b).textContent = names().length + ' học sinh'; };
  $('#bv', m.b).onclick = async () => {
    const rows = names().map(n => ({name: n})); if (!rows.length) return toast('Hãy dán danh sách học sinh');
    try { const r = await api.post('/api/students/bulk', {class_id: cls.id, rows}); showCredentials(`Đã tạo ${r.accounts.length} tài khoản học sinh`, r.accounts, r.errors); drawStudents(); drawClassesCountOnly(); } catch (e) { fail(e); }
  };
}
async function drawClassesCountOnly() { try { classes = (await api.get('/api/classes')).classes; $$('[data-c]').forEach(el => { const c = classes.find(x => x.id === +el.dataset.c); if (c) el.lastElementChild.textContent = c.students + ' HS'; }); } catch (e) { /* bỏ qua */ } }
function parentForm(s) {
  const m = modal(`<h2>Tạo tài khoản phụ huynh cho ${esc(s.name)}</h2>
    <p style="font-size:12px;color:#667085;margin:0 0 6px">Phụ huynh đăng nhập để xem kết quả học tập của con.</p>
    <label class="lb-field"><span>HỌ TÊN PHỤ HUYNH</span><input id="pn" maxlength="80"></label>
    <button class="btn btn-blue" id="pv">Tạo tài khoản</button>`);
  $('#pv', m.b).onclick = async () => {
    const name = $('#pn', m.b).value.trim(); if (!name) return toast('Hãy nhập họ tên phụ huynh');
    try { showCredentials('Tài khoản phụ huynh', [(await api.post('/api/parents', {name, student_id: s.id})).account]); } catch (e) { fail(e); }
  };
}

/* ---------- TAB: bài đã giao ---------- */
const statusPill = a => a.closed ? '<span class="pill bad">Đã đóng</span>' : (a.due_at && a.due_at * 1000 < Date.now() ? '<span class="pill warn">Quá hạn</span>' : '<span class="pill ok">Đang mở</span>');
async function drawAssign() {
  let list = [];
  try { list = (await api.get('/api/assignments')).assignments; } catch (e) { return fail(e); }
  view.innerHTML = `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h2 style="margin:0;font-size:18px">Bài đã giao</h2><a class="btn btn-blue sm" href="teacher-builder.html">＋ Tạo đề & giao bài</a></div>
    ${list.length ? `<table class="tbl"><tr><th>Bài</th><th>Lớp</th><th>Hạn nộp</th><th>Thời gian</th><th>Đã nộp</th><th>Điểm TB</th><th title="Bài này có được cộng điểm thưởng và/hoặc bị trừ điểm phạt không">Tính điểm</th><th>Trạng thái</th><th></th></tr>
    ${list.map(a => `<tr data-a="${a.id}"><td><b>${esc(a.title)}</b><br><small style="color:#667085">${fmtDate(a.created_at)}</small></td><td>${esc(a.class_name)}</td><td>${a.due_at ? fmtDate(a.due_at) : 'Không giới hạn'}</td>
      <td>${a.duration_min ? a.duration_min + ' phút' : 'Tự do'}</td><td>${a.submitted}/${a.total}</td><td>${fmtScore(a.avg)}</td><td style="white-space:nowrap;font-size:12px"><label title="Tick: học sinh đạt mức thưởng thì được cộng điểm ở bài này" style="cursor:pointer;display:block"><input type="checkbox" data-cp="count_bonus" ${a.count_bonus ? 'checked' : ''}> <span style="color:${a.count_bonus ? '#166534' : '#98a2b3'}">＋ Cộng</span></label><label title="Tick: quá hạn nộp mà chưa nộp bài này thì bị trừ điểm" style="cursor:pointer;display:block;margin-top:2px"><input type="checkbox" data-cp="count_penalty" ${a.count_penalty ? 'checked' : ''}> <span style="color:${a.count_penalty ? '#b91c1c' : '#98a2b3'}">− Trừ</span></label></td><td>${statusPill(a)}</td>
      <td style="text-align:right;white-space:nowrap"><button class="btn btn-blue sm" data-x="res">Kết quả</button> <button class="btn btn-outline sm" data-x="vars" title="Chỉ định / đổi mã đề, giao thêm hoặc bỏ giao cho từng học sinh">🔀 Mã đề</button> <button class="btn btn-outline sm" data-x="print">In đề</button> <button class="btn btn-outline sm" data-x="edit">Gia hạn</button> <button class="btn btn-outline sm" data-x="close">${a.closed ? 'Mở lại' : 'Đóng'}</button> <button class="btn btn-outline sm" data-x="del" style="color:#b91c1c">Xóa</button></td></tr>`).join('')}</table>`
      : '<div class="empty">Chưa giao bài nào.<br>Vào <a href="teacher-builder.html">AI Copilot</a> để tạo đề từ ngân hàng câu hỏi rồi giao cho lớp.</div>'}</div>`;
  $$('[data-cp]').forEach(i => i.onchange = async () => {   // tick / bỏ tick: bài này có cộng điểm / trừ điểm hay không
    const id = +i.closest('tr').dataset.a, a = list.find(x => x.id === id);
    const k = i.dataset.cp, lab = k === 'count_bonus' ? 'cộng điểm' : 'trừ điểm';
    try { await api.patch('/api/assignments/' + id, {[k]: i.checked}); toast(`Bài “${a.title}”: ${i.checked ? 'CÓ' : 'KHÔNG'} ${lab}`); drawAssign(); }
    catch (e) { i.checked = !i.checked; fail(e); }
  });
  $$('[data-x]').forEach(b => b.onclick = async () => {
    const id = +b.closest('tr').dataset.a, a = list.find(x => x.id === id);
    try {
      if (b.dataset.x === 'res') await showResults(a);
      else if (b.dataset.x === 'vars') await editVariations(a);
      else if (b.dataset.x === 'print') await printAssignment(a);
      else if (b.dataset.x === 'edit') editAssignment(a);
      else if (b.dataset.x === 'close') { await api.post(`/api/assignments/${id}/close`, {closed: !a.closed}); drawAssign(); }
      else if (confirm(`Xóa bài “${a.title}” và toàn bộ bài làm của học sinh?`)) { await api.del('/api/assignments/' + id); drawAssign(); }
    } catch (e) { fail(e); }
  });
}
function editAssignment(a) {
  const toLocal = ts => { if (!ts) return ''; const d = new Date(ts * 1000), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const m = modal(`<h2>Gia hạn · ${esc(a.title)}</h2>
    <label class="lb-field"><span>HẠN NỘP MỚI (để trống = không giới hạn)</span><input id="ad" type="datetime-local" value="${toLocal(a.due_at)}"></label>
    <label class="lb-field"><span>SỐ LẦN LÀM TỐI ĐA (1–10)</span><input id="am" type="number" min="1" max="10" value="${a.max_attempts || 1}"></label>
    <label class="lb-field"><span>HỌC SINH XEM ĐÁP ÁN & LỜI GIẢI</span><select id="ash">${[[1, 'Ngay sau khi nộp bài'], [2, 'Sau khi hết hạn nộp (hoặc khi đóng bài)'], [0, 'Không cho xem']].map(([v, t]) => `<option value="${v}" ${a.show_result === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <button class="btn btn-blue" id="as2">Lưu</button>`);
  $('#as2', m.b).onclick = async () => {
    const v = $('#ad', m.b).value, due = v ? Math.floor(new Date(v).getTime() / 1000) : null;
    try { await api.patch('/api/assignments/' + a.id, {due_at: due, max_attempts: Math.min(10, Math.max(1, +$('#am', m.b).value || 1)), show_result: +$('#ash', m.b).value}); m.close(); toast('Đã cập nhật bài giao'); drawAssign(); } catch (e) { fail(e); }
  };
}
/* Chỉ định / đổi mã đề cho từng học sinh của bài đã giao; giao thêm cho em chưa được giao hoặc bỏ giao em chưa làm */
async function editVariations(a) {
  const r = await api.get(`/api/assignments/${a.id}/students`), X = window.LBX, vs = r.variations, roster = r.students;
  const pick = {}, orig = {};
  roster.forEach(s => { pick[s.id] = orig[s.id] = !s.assigned ? 'none' : (s.variation == null ? 'free' : s.variation); });
  const lock = s => s.doing ? 'Đang làm dở: giữ mã đề của lượt đang làm, mã đề mới áp dụng từ lượt sau' : s.started ? 'Đã nộp bài: không bỏ giao được; mã đề mới áp dụng nếu em còn lượt làm lại' : '';
  const m = modal('', true);
  const draw = () => {
    const changed = roster.filter(s => String(pick[s.id]) !== String(orig[s.id]));
    const cnt = vs.map((_, i) => roster.filter(s => pick[s.id] === i).length);
    m.b.innerHTML = `<h2>🔀 Mã đề từng học sinh · ${esc(a.title)}</h2>
      <p style="font-size:12px;color:#667085;margin:0 0 8px">Chọn mã đề cho từng em, giao thêm cho em chưa được giao, hoặc chọn “Không giao”. Các nút chia nhanh chỉ đổi học sinh <b>chưa làm bài</b>; em đã làm vẫn đổi tay được (áp dụng từ lượt làm sau).</p>
      ${X.varPickerHTML(vs, roster, pick, 'ev', lock)}
      <div style="font-size:11px;color:#475467;margin-top:6px">${vs.map((v, i) => `<b>${esc(v.code)}</b>: ${cnt[i]} HS`).join(' · ')}</div>
      <div class="lb-row" style="margin-top:10px"><button class="btn btn-blue" id="ev-save" ${changed.length ? '' : 'disabled'}>💾 Lưu ${changed.length} thay đổi</button><button class="btn btn-outline" id="ev-x">Đóng</button></div>`;
    X.bindVarPicker(m.b, vs, roster, pick, 'ev', draw, s => !s.started);
    $('#ev-x', m.b).onclick = m.close;
    $('#ev-save', m.b).onclick = async () => {
      const bad = changed.filter(s => s.started && pick[s.id] === 'none');
      if (bad.length) return toast(`${bad.map(s => s.name).join(', ')} đã làm bài nên không bỏ giao được`);
      try {
        const res = await api.post(`/api/assignments/${a.id}/students`, {variation_map: Object.fromEntries(changed.map(s => [s.id, pick[s.id]]))});
        m.close(); toast(`Đã cập nhật mã đề cho ${res.changed} học sinh`); drawAssign();
      } catch (e) { fail(e); }
    };
  };
  draw();
}
const fmtDur = sec => { if (sec == null) return '—'; const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; };   // thời gian làm bài: m:ss hoặc h:mm:ss
async function showResults(a) {
  const R = await api.get(`/api/assignments/${a.id}/results`), rs = R.results;
  const st = {done: '<span class="pill ok">Đã nộp</span>', doing: '<span class="pill warn">Đang làm</span>', todo: '<span class="pill">Chưa làm</span>'};
  const m = modal(`<h2>Kết quả · ${esc(a.title)}</h2><p style="font-size:12px;color:#667085;margin:0 0 8px">Lớp ${esc(a.class_name)} · ${a.submitted}/${a.total} đã nộp · điểm TB ${fmtScore(a.avg)} (thang 10, chỉ tính câu chấm tự động; tự luận giáo viên chấm riêng)${R.median_sec != null ? ` · thời gian làm trung vị <b>${fmtDur(R.median_sec)}</b>` : ''}</p>
    <label style="display:flex;gap:6px;align-items:center;font-size:12px;margin:0 0 8px;cursor:pointer"><input type="checkbox" id="rfast"> Chỉ hiện bài làm <b style="color:#b45309">quá nhanh</b> (nghi khoanh bừa: dưới ${R.fast_sec_per_q} giây/câu hoặc chưa bằng 35% thời gian trung vị của lớp) — ${R.fast_n} bài</label>
    <div style="max-height:52vh;overflow:auto"><table class="tbl"><tr><th>Học sinh</th><th>Mã đề</th><th>Trạng thái</th><th>Điểm (10)</th><th title="Từ lúc bấm Bắt đầu làm bài đến lúc nộp">Thời gian làm</th><th>Nộp lúc</th><th></th></tr>
    ${rs.map(r => `<tr data-fast="${r.fast ? 1 : 0}" style="${r.fast ? 'background:#fff7ed' : ''}"><td><b>${esc(r.name)}</b></td><td>${esc(r.code || '—')}</td><td>${st[r.status]}${r.late ? ' <span class="pill bad">Trễ</span>' : ''}</td><td><b>${fmtScore(r.score10)}</b>${r.max ? ` <small style="color:#667085">(${fmtScore(r.score)}/${r.max} câu)</small>` : ''}</td>
      <td style="white-space:nowrap">${r.spent_sec == null ? '<span style="color:#98a2b3">—</span>' : `<b>${fmtDur(r.spent_sec)}</b><div style="font-size:10px;color:#667085">${r.sec_per_q} giây/câu</div>`}${r.fast ? ` <span class="pill bad" title="${esc(r.fast_why)}">⚠ Quá nhanh</span>` : ''}</td><td>${fmtDate(r.submitted_at)}</td>
      <td>${r.sub_id ? `<button class="btn btn-outline sm" data-sub="${r.sub_id}">Xem bài</button>` : ''}</td></tr>`).join('')}</table></div>
    <div class="lb-row" style="margin-top:12px"><button class="btn btn-blue" id="rcsv">⬇ Xuất CSV</button></div>`, true);
  $('#rfast', m.b).onchange = e => $$('tr[data-fast]', m.b).forEach(tr => { tr.hidden = e.target.checked && tr.dataset.fast !== '1'; });
  $('#rcsv', m.b).onclick = () => download(`ket-qua-${a.id}.csv`, 'Học sinh,Tên đăng nhập,Mã đề,Trạng thái,Điểm (thang 10),Số câu đúng,Số câu chấm,Thời gian làm (giây),Giây mỗi câu,Làm quá nhanh,Nộp lúc\n' +
    rs.map(r => [r.name, r.username, r.code || '', r.status, r.score10 == null ? '' : r.score10, r.score == null ? '' : r.score, r.max == null ? '' : r.max, r.spent_sec == null ? '' : r.spent_sec, r.sec_per_q == null ? '' : r.sec_per_q, r.fast ? 'có' : '', r.submitted_at ? fmtDate(r.submitted_at) : ''].map(csvCell).join(',')).join('\n'));
  $$('[data-sub]', m.b).forEach(b => b.onclick = () => viewSubmission(+b.dataset.sub, () => showResults(a).catch(fail)).catch(fail));
}
async function viewSubmission(id, onSaved) {
  const s = await api.get('/api/submissions/' + id), X = window.LBX;
  const given = (q, g) => g == null || g === '' ? '<i>(bỏ trống)</i>' : Array.isArray(g) ? g.map((v, i) => 'abcd'[i] + ':' + (v === 0 ? 'Đ' : v === 1 ? 'S' : '?')).join(' ') : q.t === 'essay' || q.t === 'short' ? esc(g) : (q.opts && q.opts.length === 2 ? q.opts[g] : 'ABCD'[g]);
  const manualN = s.details.filter(d => d.score == null).length;
  const m = modal(`<h2>Bài làm của ${esc(s.student)} · ${esc(s.code)}</h2><p style="font-size:12px;color:#667085" id="sscore">${s.spent_sec != null ? `⏱ Làm trong <b>${fmtDur(s.spent_sec)}</b> (${s.sec_per_q} giây/câu)${s.fast ? ' <span class="pill bad">⚠ Quá nhanh — nghi khoanh bừa</span>' : ''} · ` : ''}Điểm: <b>${fmtScore(s.score)}/${s.max}</b> câu${manualN ? ` · ${manualN} câu cần giáo viên chấm tay (mỗi câu tối đa 1 điểm)` : ''}</p><div style="max-height:60vh;overflow:auto">
    ${s.questions.map((q, i) => { const d = s.details[i] || {}, ok = d.score, man = s.manual[i];
      const grader = ok == null ? `<div style="margin-top:6px;font-size:12px">Điểm giáo viên chấm (0–1): <input type="number" min="0" max="1" step="0.25" data-g="${i}" value="${man == null ? '' : man}" style="width:80px;padding:5px;border:1px solid var(--line);border-radius:6px"></div>` : '';
      return `<div class="q-item"><div class="qn">Câu ${i + 1}. ${X.qBody(q)} ${ok == null ? (man == null ? '<span class="pill warn">Chờ chấm</span>' : `<span class="pill ok">${fmtScore(man)} điểm</span>`) : ok === 1 ? '<span class="pill ok">Đúng</span>' : ok > 0 ? `<span class="pill warn">${ok} điểm</span>` : '<span class="pill bad">Sai</span>'}</div>
      <div style="font-size:12px;white-space:pre-wrap">Học sinh trả lời: <b>${given(q, s.answers[i])}</b>${ok == null ? '' : ` · Đáp án: <b>${esc(X.ansText(q))}</b>`}</div>${grader}
      ${q.solImg || q.sol ? `<details style="margin-top:6px;font-size:12px"><summary style="cursor:pointer;color:#166534;font-weight:700">📘 Lời giải chi tiết</summary><div class="sol" style="margin-top:4px">${X.solBody(q)}</div></details>` : ''}</div>`; }).join('')}</div>
    ${manualN ? '<div class="lb-row" style="margin-top:12px"><button class="btn btn-blue" id="gsave">Lưu điểm chấm tay</button></div>' : ''}`, true);
  const sv = $('#gsave', m.b); if (sv) sv.onclick = async () => {
    const grades = {}; $$('[data-g]', m.b).forEach(inp => { grades[inp.dataset.g] = inp.value === '' ? null : Math.min(1, Math.max(0, +inp.value)); });
    try { const r = await api.post(`/api/submissions/${id}/grade`, {grades}); toast(`Đã lưu — điểm mới ${fmtScore(r.score10)}/10`); m.close(); if (onSaved) onSaved(); } catch (e) { fail(e); }
  };
}
async function printAssignment(a) {
  const r = await api.get('/api/assignments/' + a.id), X = window.LBX, vs = r.exam.variations;
  const m = modal(`<h2>In đề · ${esc(a.title)}</h2>
    <label class="lb-field"><span>MÃ ĐỀ</span><select id="pv">${vs.map((v, i) => `<option value="${i}">${esc(v.code)} · ${v.questions.length} câu</option>`).join('')}</select></label>
    <label style="display:flex;gap:6px;font-size:12px;margin:6px 0"><input type="checkbox" id="psheet" checked> Kèm phiếu trả lời ở cuối mỗi đề</label>
    <div class="lb-row"><button class="btn btn-blue" id="p1">🖨 In mã đề này</button><button class="btn btn-blue" id="p4">🖨 In tất cả ${vs.length} mã đề</button><button class="btn btn-outline" id="p2">🖨 In đáp án</button><button class="btn btn-outline" id="p3">⬇ Tải .doc</button><button class="btn btn-outline" id="p5">📷 Chấm bài bằng ảnh phiếu</button></div>`);
  const cur = () => { const v = vs[+$('#pv', m.b).value]; return [`${a.title} — ${v.code}`, v.questions]; };
  const sheet = () => $('#psheet', m.b).checked;
  $('#p1', m.b).onclick = () => { const v = vs[+$('#pv', m.b).value]; X.printExams([{title: a.title, code: v.code, questions: v.questions}], {sheet: sheet()}); };
  $('#p4', m.b).onclick = () => X.printExams(vs.map(v => ({title: a.title, code: v.code, questions: v.questions})), {sheet: sheet()});
  $('#p2', m.b).onclick = () => X.printExam(...cur(), true);
  $('#p3', m.b).onclick = () => X.downloadExam(...cur(), false);
  $('#p5', m.b).onclick = () => X.openScan(vs, a.title);
}

/* ---------- TAB: phụ huynh ---------- */
async function drawParents() {
  let list = []; try { list = (await api.get('/api/parents')).parents; } catch (e) { return fail(e); }
  view.innerHTML = `<div class="card"><h2 style="margin:0 0 6px;font-size:18px">Tài khoản phụ huynh</h2><p class="section-sub" style="margin:0 0 10px">Tạo từ danh sách học sinh (nút “+ Phụ huynh”). Phụ huynh chỉ xem được kết quả của con mình.</p>
    ${list.length ? `<table class="tbl"><tr><th>Phụ huynh</th><th>Tên đăng nhập</th><th>Con</th><th>Trạng thái</th><th></th></tr>${list.map(p => `<tr data-p="${p.id}" data-sid="${p.sid}"><td><b>${esc(p.name)}</b></td><td>${esc(p.username)}</td><td>${esc(p.sname)}</td><td>${p.active ? '<span class="pill ok">Hoạt động</span>' : '<span class="pill bad">Vô hiệu</span>'}</td>
      <td style="text-align:right;white-space:nowrap"><button class="btn btn-outline sm" data-a="link">+ Liên kết thêm con</button> <button class="btn btn-outline sm" data-a="unlink">Gỡ liên kết</button> <button class="btn btn-outline sm" data-a="pw">Cấp lại MK</button> <button class="btn btn-outline sm" data-a="act">${p.active ? 'Vô hiệu' : 'Kích hoạt'}</button></td></tr>`).join('')}</table>` : '<div class="empty">Chưa có tài khoản phụ huynh.</div>'}</div>`;
  $$('[data-a]').forEach(b => b.onclick = async () => {
    const tr = b.closest('tr'), id = +tr.dataset.p, sid = +tr.dataset.sid, p = list.find(x => x.id === id && x.sid === sid);
    try {
      if (b.dataset.a === 'pw') { if (confirm(`Cấp lại mật khẩu cho ${p.name}?`)) showCredentials('Mật khẩu mới', [(await api.post(`/api/users/${id}/reset-password`)).account]); }
      else if (b.dataset.a === 'link') linkChild(p);
      else if (b.dataset.a === 'unlink') { if (confirm(`Gỡ liên kết ${p.name} với em ${p.sname}? Phụ huynh sẽ không còn xem được kết quả của em này.`)) { await api.post(`/api/parents/${id}/unlink`, {student_id: sid}); drawParents(); } }
      else { await api.post(`/api/users/${id}/active`, {active: !p.active}); drawParents(); }
    } catch (e) { fail(e); }
  });
}
async function linkChild(p) {
  const students = (await api.get('/api/students')).students.filter(s => s.active);
  const cname = id => (classes.find(c => c.id === id) || {}).name || '';
  if (!classes.length) classes = (await api.get('/api/classes')).classes;
  const m = modal(`<h2>Liên kết thêm con cho ${esc(p.name)}</h2>
    <label class="lb-field"><span>CHỌN HỌC SINH</span><select id="ls">${students.map(s => `<option value="${s.id}">${esc(s.name)} · lớp ${esc(cname(s.class_id))}</option>`).join('')}</select></label>
    <button class="btn btn-blue" id="lv">Liên kết</button>`);
  $('#lv', m.b).onclick = async () => {
    try { await api.post(`/api/parents/${p.id}/link`, {student_id: +$('#ls', m.b).value}); m.close(); toast('Đã liên kết'); drawParents(); } catch (e) { fail(e); }
  };
}

/* ---------- TAB: giáo viên (chỉ quản trị) ---------- */
async function drawTeachers() {
  let list = []; try { list = (await api.get('/api/teachers')).teachers; } catch (e) { return fail(e); }
  let bk = {enabled: false}; try { bk = await api.get('/api/backup/status'); } catch (e) { /* bỏ qua */ }
  const bkHTML = `<div class="card" style="margin-bottom:12px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h2 style="margin:0;font-size:16px">💾 Sao lưu dữ liệu ra kho ngoài</h2>
      ${!bk.enabled ? '<span class="pill warn">Chưa bật</span>' : bk.blocked ? '<span class="pill bad">Đang chặn để bảo vệ bản sao lưu</span>' : bk.last_ok ? `<span class="pill ok">Lần sao lưu gần nhất: ${fmtDate(bk.last_ok)}</span>` : '<span class="pill warn">Chưa có bản sao lưu nào từ lúc khởi động</span>'}
      ${bk.enabled ? `<button class="btn btn-blue sm" id="bk-run" style="margin-left:auto" ${bk.blocked ? 'disabled' : ''}>Sao lưu ngay</button>` : ''}</div>
    <p style="font-size:12px;color:#667085;margin:8px 0 0">${bk.enabled ? `Kho: <b>${esc(bk.provider)}</b> · tự sao lưu mỗi ${Math.round(bk.interval / 60)} phút khi có thay đổi${bk.last_size ? ` · bản gần nhất ${(bk.last_size / 1048576).toFixed(1).replace('.', ',')} MB` : ''}${bk.restored === 'ok' ? ' · lần khởi động này đã khôi phục dữ liệu từ kho' : ''}.` : 'Chưa cấu hình. Trên nền tảng có đĩa tạm thời (như gói free của Render), dữ liệu sẽ mất khi khởi động lại nếu không bật sao lưu. Xem mục 7 trong README (biến LBAI_BACKUP_URL, LBAI_BACKUP_KEY).'}${bk.last_error ? `<br><span style="color:#b91c1c">Lỗi: ${esc(bk.last_error)}</span>` : ''}</p></div>`;
  view.innerHTML = bkHTML + `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h2 style="margin:0;font-size:18px">Tài khoản giáo viên</h2><button class="btn btn-blue sm" id="nt">＋ Tạo tài khoản giáo viên</button></div>
    ${list.length ? `<table class="tbl"><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Đăng nhập gần nhất</th><th>Trạng thái</th><th></th></tr>${list.map(t => `<tr data-t="${t.id}"><td><b>${esc(t.name)}</b></td><td>${esc(t.username)}</td><td>${t.last_login ? fmtDate(t.last_login) : '—'}</td><td>${t.active ? '<span class="pill ok">Hoạt động</span>' : '<span class="pill bad">Vô hiệu</span>'}</td>
      <td style="text-align:right"><button class="btn btn-outline sm" data-a="pw">Cấp lại MK</button> <button class="btn btn-outline sm" data-a="act">${t.active ? 'Vô hiệu' : 'Kích hoạt'}</button></td></tr>`).join('')}</table>` : '<div class="empty">Chưa có giáo viên nào ngoài quản trị viên.</div>'}</div>`;
  const bkr = $('#bk-run'); if (bkr) bkr.onclick = async () => { bkr.disabled = true; bkr.textContent = 'Đang sao lưu...'; try { await api.post('/api/backup/run'); toast('Đã sao lưu dữ liệu'); } catch (e) { fail(e); } drawTeachers(); };
  $('#nt').onclick = () => {
    const m = modal(`<h2>Tạo tài khoản giáo viên</h2><label class="lb-field"><span>HỌ TÊN</span><input id="tn" maxlength="80"></label>
      <label class="lb-field"><span>TÊN ĐĂNG NHẬP (bỏ trống = tự tạo)</span><input id="tu" maxlength="32" autocapitalize="off"></label>
      <label class="lb-field"><span>MÔN GIẢNG DẠY</span><input id="ts" maxlength="60" placeholder="Toán"></label><button class="btn btn-blue" id="tv">Tạo tài khoản</button>`);
    $('#tv', m.b).onclick = async () => {
      const name = $('#tn', m.b).value.trim(); if (!name) return toast('Hãy nhập họ tên');
      try { const r = await api.post('/api/teachers', {name, username: $('#tu', m.b).value.trim(), subject: $('#ts', m.b).value.trim()}); showCredentials('Tài khoản giáo viên', [r.account]); drawTeachers(); } catch (e) { fail(e); }
    };
  };
  $$('[data-a]').forEach(b => b.onclick = async () => {
    const id = +b.closest('tr').dataset.t, t = list.find(x => x.id === id);
    try {
      if (b.dataset.a === 'pw') { if (confirm(`Cấp lại mật khẩu cho ${t.name}?`)) showCredentials('Mật khẩu mới', [(await api.post(`/api/users/${id}/reset-password`)).account]); }
      else { await api.post(`/api/users/${id}/active`, {active: !t.active}); drawTeachers(); }
    } catch (e) { fail(e); }
  });
}

draw();
})();
