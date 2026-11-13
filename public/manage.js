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

const draw = () => ({classes: drawClasses, practice: drawPractice, assign: drawAssign, parents: drawParents, teachers: drawTeachers})[tab]();
if (location.hash === '#practice') { tab = 'practice'; $$('#tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === 'practice')); }
const fail = e => toast(e.message || 'Có lỗi xảy ra');

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
    w.document.write(`<html><head><meta charset="utf-8"><title>Phiếu tài khoản</title><style>body{font-family:Arial,sans-serif}.c{border:1px dashed #666;border-radius:8px;padding:10px 14px;margin:6px;display:inline-block;width:46%;vertical-align:top;font-size:13px;break-inside:avoid}code{font-size:15px;font-weight:bold}</style></head><body>${accounts.map(a => `<div class="c"><b>${esc(a.name)}</b><br>Tên đăng nhập: <code>${esc(a.username)}</code><br>Mật khẩu: <code>${esc(a.password)}</code><br><small>Đăng nhập tại: ${esc(location.origin)}/login.html</small></div>`).join('')}</body></html>`);
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
    const list = body();
    view.innerHTML = `<div class="lb-note" style="margin-bottom:12px"><b>Cách hoạt động:</b> (1) chọn lớp, (2) tick chuyên đề trong ngân hàng câu hỏi, (3) bấm <b>Lưu và mở</b>. Học sinh vào <b>Bài của tôi → 🎯 Tự luyện tập</b>, tự chọn chuyên đề, số câu, thời gian; nộp bài là có điểm, đáp án và lời giải ngay. Giáo viên xem kết quả ở bảng học sinh của lớp.</div>
      <div class="grid2" style="grid-template-columns:minmax(220px,300px) 1fr"><div class="card"><h2 style="margin:0 0 8px;font-size:15px">1. Chọn lớp</h2>
        ${cls.map(c => `<label style="display:flex;gap:8px;align-items:center;padding:6px 0;font-size:13px;border-bottom:1px solid var(--line)"><input type="checkbox" data-c="${c.id}" ${picked.has(c.id) ? 'checked' : ''}><span style="flex:1"><b>${esc(c.name)}</b> <small style="color:#667085">${c.students} HS</small></span><span class="pill ${openBy[c.id].size ? 'ok' : ''}" title="Số chuyên đề đang mở">${openBy[c.id].size} đang mở</span></label>`).join('')}</div>
      <div class="card"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><h2 style="margin:0;font-size:15px">2. Chọn chuyên đề được phép luyện</h2>
        <input id="pq" placeholder="Tìm chuyên đề..." value="${esc($('#pq') ? $('#pq').value : '')}" style="padding:7px 10px;border:1px solid var(--line);border-radius:8px;min-width:180px"></div>
        ${groups.length ? `<div style="max-height:50vh;overflow:auto"><table class="tbl"><tr><th style="width:30px"><input type="checkbox" id="pall" ${list.length && list.every(g => chosen.has(key(g))) ? 'checked' : ''} title="Chọn / bỏ chọn tất cả"></th><th>Môn · Khối</th><th>Chuyên đề</th><th>Số câu học sinh luyện được</th></tr>
        ${list.map(g => `<tr><td><input type="checkbox" data-g="${esc(key(g))}" ${chosen.has(key(g)) ? 'checked' : ''}></td><td>${esc(g.subject || '—')}${g.grade ? ' · ' + esc(g.grade) : ''}</td><td><b>${esc(g.topic || 'Chưa phân chuyên đề')}</b></td><td>${g.counts.mcq} TN · ${g.counts.tf} Đ/S · ${g.counts.short} TLN</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Không có chuyên đề khớp.</td></tr>'}</table></div>
        <div class="lb-row" style="margin-top:12px"><button class="btn btn-blue" id="psave">Lưu và mở cho ${picked.size} lớp đã chọn</button><span style="font-size:12px;color:#667085">${chosen.size} chuyên đề được chọn · bỏ tick rồi lưu để đóng lại</span></div>`
        : '<div class="empty">Ngân hàng của bạn chưa có câu nào có đáp án.<br>Vào <a href="teacher-builder.html">AI Copilot</a> bấm <b>📥 Import đề mẫu</b> hoặc import PDF kèm đáp án.</div>'}</div></div>`;
    $$('[data-c]', view).forEach(i => i.onchange = () => { const id = +i.dataset.c; i.checked ? picked.add(id) : picked.delete(id); syncChosen(); render(); });
    $$('[data-g]', view).forEach(i => i.onchange = () => { i.checked ? chosen.add(i.dataset.g) : chosen.delete(i.dataset.g); render(); });
    const all = $('#pall', view); if (all) all.onchange = () => { body().forEach(g => all.checked ? chosen.add(key(g)) : chosen.delete(key(g))); render(); };
    const pq = $('#pq', view); if (pq) { pq.oninput = () => { const pos = pq.selectionStart; render(); const n = $('#pq', view); n.focus(); n.setSelectionRange(pos, pos); }; }
    const sv = $('#psave', view); if (sv) sv.onclick = async () => {
      if (!picked.size) return toast('Hãy chọn ít nhất một lớp');
      const open = groups.filter(g => chosen.has(key(g))).map(g => ({subject: g.subject, grade: g.grade, topic: g.topic}));
      try {
        for (const id of picked) { await api.post(`/api/classes/${id}/practice`, {open}); openBy[id] = new Set(chosen); }
        toast(open.length ? `Đã mở ${open.length} chuyên đề cho ${picked.size} lớp` : `Đã đóng luyện tập tự do cho ${picked.size} lớp`); render();
      } catch (e) { fail(e); }
    };
  };
  render();
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
    ${list.length ? `<table class="tbl"><tr><th>Bài</th><th>Lớp</th><th>Hạn nộp</th><th>Thời gian</th><th>Đã nộp</th><th>Điểm TB</th><th>Trạng thái</th><th></th></tr>
    ${list.map(a => `<tr data-a="${a.id}"><td><b>${esc(a.title)}</b><br><small style="color:#667085">${fmtDate(a.created_at)}</small></td><td>${esc(a.class_name)}</td><td>${a.due_at ? fmtDate(a.due_at) : 'Không giới hạn'}</td>
      <td>${a.duration_min ? a.duration_min + ' phút' : 'Tự do'}</td><td>${a.submitted}/${a.total}</td><td>${fmtScore(a.avg)}</td><td>${statusPill(a)}</td>
      <td style="text-align:right;white-space:nowrap"><button class="btn btn-blue sm" data-x="res">Kết quả</button> <button class="btn btn-outline sm" data-x="print">In đề</button> <button class="btn btn-outline sm" data-x="edit">Gia hạn</button> <button class="btn btn-outline sm" data-x="close">${a.closed ? 'Mở lại' : 'Đóng'}</button> <button class="btn btn-outline sm" data-x="del" style="color:#b91c1c">Xóa</button></td></tr>`).join('')}</table>`
      : '<div class="empty">Chưa giao bài nào.<br>Vào <a href="teacher-builder.html">AI Copilot</a> để tạo đề từ ngân hàng câu hỏi rồi giao cho lớp.</div>'}</div>`;
  $$('[data-x]').forEach(b => b.onclick = async () => {
    const id = +b.closest('tr').dataset.a, a = list.find(x => x.id === id);
    try {
      if (b.dataset.x === 'res') await showResults(a);
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
    <button class="btn btn-blue" id="as2">Lưu</button>`);
  $('#as2', m.b).onclick = async () => {
    const v = $('#ad', m.b).value, due = v ? Math.floor(new Date(v).getTime() / 1000) : null;
    try { await api.patch('/api/assignments/' + a.id, {due_at: due, max_attempts: Math.min(10, Math.max(1, +$('#am', m.b).value || 1))}); m.close(); toast('Đã cập nhật bài giao'); drawAssign(); } catch (e) { fail(e); }
  };
}
async function showResults(a) {
  const rs = (await api.get(`/api/assignments/${a.id}/results`)).results;
  const st = {done: '<span class="pill ok">Đã nộp</span>', doing: '<span class="pill warn">Đang làm</span>', todo: '<span class="pill">Chưa làm</span>'};
  const m = modal(`<h2>Kết quả · ${esc(a.title)}</h2><p style="font-size:12px;color:#667085;margin:0 0 8px">Lớp ${esc(a.class_name)} · ${a.submitted}/${a.total} đã nộp · điểm TB ${fmtScore(a.avg)} (thang 10, chỉ tính câu chấm tự động; tự luận giáo viên chấm riêng)</p>
    <div style="max-height:52vh;overflow:auto"><table class="tbl"><tr><th>Học sinh</th><th>Mã đề</th><th>Trạng thái</th><th>Điểm (10)</th><th>Nộp lúc</th><th></th></tr>
    ${rs.map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.code || '—')}</td><td>${st[r.status]}${r.late ? ' <span class="pill bad">Trễ</span>' : ''}</td><td><b>${fmtScore(r.score10)}</b>${r.max ? ` <small style="color:#667085">(${fmtScore(r.score)}/${r.max} câu)</small>` : ''}</td><td>${fmtDate(r.submitted_at)}</td>
      <td>${r.sub_id ? `<button class="btn btn-outline sm" data-sub="${r.sub_id}">Xem bài</button>` : ''}</td></tr>`).join('')}</table></div>
    <div class="lb-row" style="margin-top:12px"><button class="btn btn-blue" id="rcsv">⬇ Xuất CSV</button></div>`, true);
  $('#rcsv', m.b).onclick = () => download(`ket-qua-${a.id}.csv`, 'Học sinh,Tên đăng nhập,Mã đề,Trạng thái,Điểm (thang 10),Số câu đúng,Số câu chấm,Nộp lúc\n' +
    rs.map(r => [r.name, r.username, r.code || '', r.status, r.score10 == null ? '' : r.score10, r.score == null ? '' : r.score, r.max == null ? '' : r.max, r.submitted_at ? fmtDate(r.submitted_at) : ''].map(csvCell).join(',')).join('\n'));
  $$('[data-sub]', m.b).forEach(b => b.onclick = () => viewSubmission(+b.dataset.sub, () => showResults(a).catch(fail)).catch(fail));
}
async function viewSubmission(id, onSaved) {
  const s = await api.get('/api/submissions/' + id), X = window.LBX;
  const given = (q, g) => g == null || g === '' ? '<i>(bỏ trống)</i>' : Array.isArray(g) ? g.map((v, i) => 'abcd'[i] + ':' + (v === 0 ? 'Đ' : v === 1 ? 'S' : '?')).join(' ') : q.t === 'essay' || q.t === 'short' ? esc(g) : (q.opts && q.opts.length === 2 ? q.opts[g] : 'ABCD'[g]);
  const manualN = s.details.filter(d => d.score == null).length;
  const m = modal(`<h2>Bài làm của ${esc(s.student)} · ${esc(s.code)}</h2><p style="font-size:12px;color:#667085" id="sscore">Điểm: <b>${fmtScore(s.score)}/${s.max}</b> câu${manualN ? ` · ${manualN} câu cần giáo viên chấm tay (mỗi câu tối đa 1 điểm)` : ''}</p><div style="max-height:60vh;overflow:auto">
    ${s.questions.map((q, i) => { const d = s.details[i] || {}, ok = d.score, man = s.manual[i];
      const grader = ok == null ? `<div style="margin-top:6px;font-size:12px">Điểm giáo viên chấm (0–1): <input type="number" min="0" max="1" step="0.25" data-g="${i}" value="${man == null ? '' : man}" style="width:80px;padding:5px;border:1px solid var(--line);border-radius:6px"></div>` : '';
      return `<div class="q-item"><div class="qn">Câu ${i + 1}. ${X.qBody(q)} ${ok == null ? (man == null ? '<span class="pill warn">Chờ chấm</span>' : `<span class="pill ok">${fmtScore(man)} điểm</span>`) : ok === 1 ? '<span class="pill ok">Đúng</span>' : ok > 0 ? `<span class="pill warn">${ok} điểm</span>` : '<span class="pill bad">Sai</span>'}</div>
      <div style="font-size:12px;white-space:pre-wrap">Học sinh trả lời: <b>${given(q, s.answers[i])}</b>${ok == null ? '' : ` · Đáp án: <b>${esc(X.ansText(q))}</b>`}</div>${grader}</div>`; }).join('')}</div>
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
  view.innerHTML = `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h2 style="margin:0;font-size:18px">Tài khoản giáo viên</h2><button class="btn btn-blue sm" id="nt">＋ Tạo tài khoản giáo viên</button></div>
    ${list.length ? `<table class="tbl"><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Đăng nhập gần nhất</th><th>Trạng thái</th><th></th></tr>${list.map(t => `<tr data-t="${t.id}"><td><b>${esc(t.name)}</b></td><td>${esc(t.username)}</td><td>${t.last_login ? fmtDate(t.last_login) : '—'}</td><td>${t.active ? '<span class="pill ok">Hoạt động</span>' : '<span class="pill bad">Vô hiệu</span>'}</td>
      <td style="text-align:right"><button class="btn btn-outline sm" data-a="pw">Cấp lại MK</button> <button class="btn btn-outline sm" data-a="act">${t.active ? 'Vô hiệu' : 'Kích hoạt'}</button></td></tr>`).join('')}</table>` : '<div class="empty">Chưa có giáo viên nào ngoài quản trị viên.</div>'}</div>`;
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
