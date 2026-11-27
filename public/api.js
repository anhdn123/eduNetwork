/* api.js — lớp nền dùng chung cho mọi trang: gọi API, kiểm tra đăng nhập, thanh điều hướng theo vai trò. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- toast & modal ---------- */
function toast(msg) {
  $$('.lb-toast').forEach(x => x.remove());
  const t = document.createElement('div'); t.className = 'lb-toast'; t.textContent = msg; document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}
function modal(html, wide, locked) {
  $$('.lb-overlay').forEach(x => x.remove());
  const o = document.createElement('div'); o.className = 'lb-overlay'; if (locked) o.dataset.locked = '1';
  o.innerHTML = `<div class="lb-modal ${wide ? 'wide' : ''}">${locked ? '' : '<button class="lb-x" aria-label="Đóng">×</button>'}<div class="lb-body">${html}</div></div>`;
  const close = () => o.remove();
  if (!locked) { o.addEventListener('mousedown', e => { if (e.target === o) close(); }); $('.lb-x', o).onclick = close; }
  document.body.append(o);
  return {b: $('.lb-body', o), close};
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.lb-overlay:not([data-locked])').forEach(x => x.remove()); });

/* ---------- gọi API ---------- */
async function call(method, path, body) {
  const opt = {method, credentials: 'same-origin', headers: {'X-Requested-With': 'fetch'}};
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let r;
  try { r = await fetch(path, opt); } catch (e) { throw new Error('Không kết nối được máy chủ — hãy kiểm tra lại mạng / server'); }
  let data = null; try { data = await r.json(); } catch (e) { /* không phải JSON */ }
  if (r.status === 401 && !LB.publicPage && path !== '/api/login') {
    location.href = 'login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search);
    await new Promise(() => {});
  }
  if (!r.ok) { const err = new Error((data && data.error) || 'Lỗi ' + r.status); err.status = r.status; throw err; }
  return data;
}
const api = {get: p => call('GET', p), post: (p, b) => call('POST', p, b === undefined ? {} : b), patch: (p, b) => call('PATCH', p, b), del: p => call('DELETE', p)};

/* ---------- tiện ích ---------- */
const pad = n => String(n).padStart(2, '0');
const fmtDate = ts => { if (!ts) return '—'; const d = new Date(ts * 1000); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtScore = v => v == null ? '—' : String(v).replace('.', ',');
const initials = name => { const p = String(name || '?').trim().split(/\s+/); return ((p.length > 1 ? p[0][0] : '') + p[p.length - 1][0]).toUpperCase(); };
const ROLE_VN = {admin: 'Quản trị', teacher: 'Giáo viên', student: 'Học sinh', parent: 'Phụ huynh'};
const HOME = {admin: 'manage.html', teacher: 'manage.html', student: 'students.html', parent: 'parents.html'};
function download(filename, text, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿', text], {type: (mime || 'text/csv') + ';charset=utf-8'}));
  a.download = filename; document.body.append(a); a.click(); a.remove();
}
const csvCell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

/* ---------- điều hướng & tài khoản ---------- */
const NAV = {
  teacher: [['index.html', 'Bảng tin'], ['teachers.html', 'Giáo viên'], ['manage.html', 'Lớp & học sinh'], ['teacher-builder.html', 'AI Copilot'], ['about.html', 'Về dự án']],
  student: [['index.html', 'Bảng tin'], ['students.html', 'Bài của tôi'], ['teachers.html', 'Giáo viên'], ['about.html', 'Về dự án']],
  parent: [['index.html', 'Bảng tin'], ['parents.html', 'Con của tôi'], ['teachers.html', 'Giáo viên'], ['about.html', 'Về dự án']]
};
function changePasswordModal(forced) {
  const m = modal(`<h2>${forced ? 'Đặt mật khẩu mới' : 'Đổi mật khẩu'}</h2>${forced ? '<p style="font-size:12px;color:#667085">Đây là lần đầu bạn đăng nhập bằng mật khẩu được cấp. Hãy đặt mật khẩu riêng (tối thiểu 8 ký tự).</p>' : ''}
    <label class="lb-field"><span>MẬT KHẨU HIỆN TẠI</span><input id="pw0" type="password" autocomplete="current-password"></label>
    <label class="lb-field"><span>MẬT KHẨU MỚI (≥ 8 ký tự)</span><input id="pw1" type="password" autocomplete="new-password"></label>
    <label class="lb-field"><span>NHẬP LẠI MẬT KHẨU MỚI</span><input id="pw2" type="password" autocomplete="new-password"></label>
    <div id="pwerr" style="color:#b91c1c;font-size:12px;min-height:16px"></div>
    <div class="lb-row"><button class="btn btn-blue" id="pws">Lưu mật khẩu</button>${forced ? '<button class="btn btn-outline" id="pwo">Đăng xuất</button>' : ''}</div>`, false, forced);
  const err = t => { $('#pwerr', m.b).textContent = t; };
  $('#pws', m.b).onclick = async () => {
    const a = $('#pw0', m.b).value, b = $('#pw1', m.b).value, c = $('#pw2', m.b).value;
    if (b !== c) return err('Hai mật khẩu mới không khớp');
    try { await api.post('/api/password', {old: a, new: b}); m.close(); toast('Đã đổi mật khẩu'); LB.me.must_change = false; }
    catch (e) { err(e.message); }
  };
  if (forced) $('#pwo', m.b).onclick = logout;
}
async function logout() { try { await api.post('/api/logout'); } catch (e) { /* bỏ qua */ } location.href = 'login.html'; }
function renderHeader(me) {
  const nav = $('.nav'), act = $('.header-actions');
  const page = location.pathname.split('/').pop() || 'index.html';
  if (nav) nav.innerHTML = (NAV[me.role === 'admin' ? 'teacher' : me.role] || []).map(([h, t]) => `<a href="${h}" class="${h === page ? 'active' : ''}">${t}</a>`).join('');
  // ô tìm kiếm chung: ở Bảng tin lọc ngay bài viết, ở trang khác thì chuyển về Bảng tin kèm từ khóa
  if (nav && !$('#hdr-q')) {
    nav.insertAdjacentHTML('afterend', `<form class="hdr-search" id="hdr-q" role="search"><span class="hs-ic">⌕</span><input type="search" placeholder="Tìm bài viết, tài liệu, thẻ..." autocomplete="off" value="${esc(page === 'index.html' ? (new URLSearchParams(location.search).get('q') || '') : '')}"></form>`);
    const fire = v => { if (page === 'index.html') window.dispatchEvent(new CustomEvent('lb-search', {detail: v})); else location.href = 'index.html' + (v ? '?q=' + encodeURIComponent(v) : ''); };
    let t; $('#hdr-q input').oninput = e => { if (page !== 'index.html') return; clearTimeout(t); t = setTimeout(() => fire(e.target.value.trim()), 300); };
    $('#hdr-q').onsubmit = e => { e.preventDefault(); fire($('#hdr-q input').value.trim()); };
  }
  if (act) {
    act.innerHTML = `<div class="bell-wrap"><button class="icon-btn bell" id="bell" aria-label="Thông báo" title="Thông báo">🔔<i class="bell-n" hidden></i></button><div class="bell-menu" id="bellm" hidden></div></div>
      <div class="user-chip"><button class="avatar" id="uchip" aria-label="Tài khoản">${esc(initials(me.name))}</button>
      <div class="user-menu" id="umenu" hidden><div class="um-name">${esc(me.name)}</div><div class="um-role">${ROLE_VN[me.role]}${me.class_name ? ' · Lớp ' + esc(me.class_name) : ''} · @${esc(me.username)}</div>
      <button id="um-pw">Đổi mật khẩu</button><button id="um-out">Đăng xuất</button></div></div>`;
    $('#uchip').onclick = e => { e.stopPropagation(); $('#umenu').hidden = !$('#umenu').hidden; };
    document.addEventListener('click', () => { const m = $('#umenu'); if (m) m.hidden = true; });
    $('#um-pw').onclick = () => changePasswordModal(false);
    $('#um-out').onclick = logout;
    $('#bell').onclick = e => { e.stopPropagation(); $('#bellm').hidden = !$('#bellm').hidden; };
    document.addEventListener('click', e => { const m = $('#bellm'); if (m && !m.contains(e.target)) m.hidden = true; });
    loadBell(me);
  }
}
/* Chuông thông báo: giáo viên → báo đáp án sai chờ duyệt; học sinh → bài cần làm. Chưa có gì thì hiện “Chưa có thông báo mới”. */
async function loadBell(me) {
  const items = [];
  try {
    if (me.role === 'teacher' || me.role === 'admin') {
      const r = await api.get('/api/reports?status=none');
      if (r.pending) items.push([`🚩 ${r.pending} báo đáp án sai đang chờ duyệt`, 'manage.html#reports', r.pending]);
    } else if (me.role === 'student') {
      const r = await api.get('/api/assignments'), now = Date.now() / 1000;
      const n = r.assignments.filter(a => !a.closed && a.attempts < a.max_attempts && !(a.due_at && a.due_at < now)).length;
      if (n) items.push([`📝 ${n} bài đang chờ bạn làm`, 'students.html', n]);
    }
  } catch (e) { /* không tải được thông báo: bỏ qua */ }
  const total = items.reduce((s, x) => s + x[2], 0), b = $('#bell .bell-n'), m = $('#bellm');
  if (b && total) { b.textContent = total > 9 ? '9+' : total; b.hidden = false; }
  if (m) m.innerHTML = '<div class="bm-title">Thông báo</div>' + (items.length ? items.map(([t, h]) => `<a href="${h}">${t}</a>`).join('') : '<div class="bm-empty">Chưa có thông báo mới</div>');
}

const LB = {$, $$, esc, toast, modal, api, fmtDate, fmtScore, initials, download, csvCell, ROLE_VN, HOME, me: null, publicPage: false, logout, changePasswordModal};
window.LB = LB;

/* Mỗi trang khai báo quyền truy cập bằng <body data-roles="teacher,admin"> hoặc <body data-public>. */
LB.ready = (async () => {
  const body = document.body;
  LB.publicPage = body.hasAttribute('data-public');
  let me = null;
  try { me = (await api.get('/api/me')).user; } catch (e) { if (!LB.publicPage) throw e; }
  LB.me = me;
  if (me) {
    const roles = (body.dataset.roles || '').split(',').filter(Boolean);
    if (roles.length && !roles.includes(me.role)) { location.href = HOME[me.role]; await new Promise(() => {}); }
    renderHeader(me);
    if (me.must_change) changePasswordModal(true);
  }
  return me;
})();
})();
