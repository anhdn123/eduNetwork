/* feed.js — bảng tin dùng dữ liệu thật từ máy chủ: đăng bài (kèm file), thích, bình luận, lưu, theo dõi. */
(() => {
'use strict';
const {$, $$, esc, toast, modal, api} = LB;

const timeAgo = ts => { const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60)); return m < 1 ? 'Vừa xong' : m < 60 ? m + ' phút trước' : m < 1440 ? Math.round(m / 60) + ' giờ trước' : Math.round(m / 1440) + ' ngày trước'; };
const AV = {admin: 'teacher-av', teacher: 'teacher-av', student: 'student-av', parent: 'parent-av'};
const fsize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const isImg = n => /\.(png|jpe?g|gif|webp)$/i.test(n);

/* Chọn nơi chia sẻ cho bài RIÊNG TƯ: cả lớp (tick lớp) hoặc từng người (học sinh, phụ huynh, giáo viên). get() → {share_classes, share_users} */
async function sharePicker(host, init) {
  init = init || {classes: [], users: []};
  let T;
  try { T = await api.get('/api/share-targets'); } catch (e) { host.innerHTML = `<div class="lb-note">${esc(e.message)}</div>`; return {get: () => ({share_classes: [], share_users: []}), count: () => 0}; }
  const selC = new Set(init.classes.map(x => x.id)), selU = new Set(init.users.map(x => x.id));
  const people = [...T.students.map(x => ({id: x.id, name: x.name, tag: 'Học sinh · ' + x.class_name})), ...T.parents.map(x => ({id: x.id, name: x.name, tag: 'Phụ huynh'})), ...T.teachers.map(x => ({id: x.id, name: x.name, tag: 'Giáo viên'}))];
  const known = new Set(people.map(x => x.id)); init.users.forEach(x => { if (!known.has(x.id)) people.unshift({id: x.id, name: x.name, tag: LB.ROLE_VN[x.role] || ''}); });
  host.innerHTML = `<div class="sp"><div class="sp-t">Chia sẻ cho cả lớp</div><div class="sp-classes">${T.classes.map(k => `<label class="sp-chip"><input type="checkbox" data-c="${k.id}" ${selC.has(k.id) ? 'checked' : ''}> ${esc(k.name)} <small>${k.students} HS</small></label>`).join('') || '<small>Bạn chưa có lớp nào</small>'}</div>
    <div class="sp-t">Chia sẻ cho người cụ thể</div><input class="sp-q" placeholder="Tìm học sinh, phụ huynh, giáo viên..." autocomplete="off"><div class="sp-list"></div><div class="sp-sum"></div></div>`;
  const list = $('.sp-list', host), sum = $('.sp-sum', host);
  const draw = () => {
    const q = $('.sp-q', host).value.trim().toLowerCase();
    const rows = people.filter(x => !q || x.name.toLowerCase().includes(q));
    list.innerHTML = rows.slice(0, 300).map(x => `<label class="sp-row"><input type="checkbox" data-u="${x.id}" ${selU.has(x.id) ? 'checked' : ''}> <span>${esc(x.name)}</span><small>${esc(x.tag)}</small></label>`).join('') || '<small>Không có kết quả</small>';
    sum.textContent = `Đã chọn ${selC.size} lớp · ${selU.size} người`;
  };
  host.addEventListener('change', e => { const t = e.target; if (t.dataset.c) { t.checked ? selC.add(+t.dataset.c) : selC.delete(+t.dataset.c); } else if (t.dataset.u) { t.checked ? selU.add(+t.dataset.u) : selU.delete(+t.dataset.u); } sum.textContent = `Đã chọn ${selC.size} lớp · ${selU.size} người`; });
  $('.sp-q', host).oninput = draw; draw();
  return {get: () => ({share_classes: [...selC], share_users: [...selU]}), count: () => selC.size + selU.size};
}
const VIS_ICON = {'Công khai': '🌐', 'Người theo dõi': '👥', 'Riêng tư': '🔒'};
function visBadge(p) {
  const sh = p.shares, who = sh ? [...sh.classes.map(k => 'Lớp ' + k.name), ...sh.users.map(u => u.name)] : [];
  return `<span class="vis-badge ${p.visibility === 'Riêng tư' ? 'is-private' : ''}" title="${esc(p.visibility === 'Riêng tư' && who.length ? 'Chia sẻ cho: ' + who.join(', ') : p.visibility)}">${VIS_ICON[p.visibility] || ''} ${esc(p.visibility)}${who.length ? ` · ${esc(who.slice(0, 2).join(', '))}${who.length > 2 ? ' +' + (who.length - 2) : ''}` : ''}</span>`;
}
/* Hộp “Quyền xem” của một bài (tác giả / quản trị): công khai hay riêng tư + chia sẻ cho ai */
function visibilityDialog(p, done) {
  const m = modal(`<h2>Quyền xem bài đăng</h2>
    <label class="vis-opt"><input type="radio" name="vv" value="Công khai" ${p.visibility !== 'Riêng tư' ? 'checked' : ''}> <span><b>🌐 Công khai (publish)</b><small>Mọi người dùng hệ thống đều xem được trên bảng tin.</small></span></label>
    <label class="vis-opt"><input type="radio" name="vv" value="Riêng tư" ${p.visibility === 'Riêng tư' ? 'checked' : ''}> <span><b>🔒 Riêng tư</b><small>Chỉ những lớp / người bạn chọn bên dưới (và quản trị) xem được.</small></span></label>
    <div id="vv-share" ${p.visibility === 'Riêng tư' ? '' : 'hidden'}></div>
    <div class="lb-row" style="margin-top:12px"><button class="btn btn-blue" id="vv-ok">Lưu</button><button class="btn btn-outline" id="vv-x">Hủy</button></div>`, true);
  let picker = null;
  const ensure = async () => { if (!picker) picker = await sharePicker($('#vv-share', m.b), p.shares || {classes: [], users: []}); };
  const sync = async () => { const priv = $('input[name=vv]:checked', m.b).value === 'Riêng tư'; $('#vv-share', m.b).hidden = !priv; if (priv) await ensure(); };
  $$('input[name=vv]', m.b).forEach(r => r.onchange = sync); sync();
  $('#vv-x', m.b).onclick = m.close;
  $('#vv-ok', m.b).onclick = async () => {
    const vis = $('input[name=vv]:checked', m.b).value;
    try { await api.patch('/api/posts/' + p.id, vis === 'Riêng tư' ? {visibility: vis, ...picker.get()} : {visibility: vis}); m.close(); toast(vis === 'Riêng tư' ? 'Đã chuyển sang riêng tư' : 'Đã công khai bài đăng'); done(); } catch (e) { toast(e.message); }
  };
}

function card(p, me) {
  const mine = p.author.id === me.id, a = p.author;
  const file = p.file ? (isImg(p.file.name) ? `<a href="/api/files/${p.file.id}" target="_blank"><img src="/api/files/${p.file.id}" alt="${esc(p.file.name)}" style="max-width:100%;border-radius:10px;margin:8px 0"></a>`
    : `<a class="post-file" href="/api/files/${p.file.id}" target="_blank" rel="noopener"><div class="resource-icon">${esc((p.file.name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4))}</div><div><b>${esc(p.file.name)}</b><div style="font-size:10px;color:#667085">${fsize(p.file.size)} · bấm để mở / tải về</div></div></a>`) : '';
  return `<article class="feed-post card" data-id="${p.id}" id="post-${p.id}">
    <div class="post-head"><div class="mini-avatar ${AV[a.role] || ''}">${esc(LB.initials(a.name))}</div>
      <div class="post-author"><b><a href="teachers.html?id=${a.id}" style="color:inherit;text-decoration:none">${esc(a.name)}</a> · ${LB.ROLE_VN[a.role] || ''}</b><span>${timeAgo(p.created_at)} · ${esc(p.kind)} · ${visBadge(p)}</span></div>
      ${p.can_edit && me.role !== 'student' && me.role !== 'parent' ? '<button class="small-action" data-a="vis" title="Chọn công khai hay riêng tư, chia sẻ cho lớp / người cụ thể" style="margin-left:auto">🔒 Quyền xem</button>' : ''}
      ${!mine ? `<button class="small-action" data-a="follow" style="margin-left:auto">${p.followed ? '✓ Đang theo dõi' : '+ Theo dõi'}</button>` : ''}
      ${mine || me.role === 'admin' ? `<button class="post-more" data-a="del" title="Xóa bài đăng" style="${mine && !(p.can_edit && me.role !== 'student' && me.role !== 'parent') ? 'margin-left:auto' : ''}">🗑</button>` : ''}</div>
    ${p.title ? `<p class="post-text"><b>${esc(p.title)}</b></p>` : ''}
    <p class="post-text">${esc(p.text).replace(/\n/g, '<br>')}</p>
    ${p.tags.length ? `<div class="post-tags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}${file}
    <div class="post-stats"><span data-s="likes">♥ ${p.likes}</span><span data-s="cm">${p.comments} bình luận</span></div>
    <div class="post-actions"><button data-a="like" class="${p.liked ? 'lb-on' : ''}">${p.liked ? '♥ Đã thích' : '♡ Thích'}</button><button data-a="comment">◌ Bình luận</button><button data-a="share">↗ Chia sẻ</button><button data-a="save" class="${p.saved ? 'lb-on' : ''}">${p.saved ? '▣ Đã lưu' : '▢ Lưu'}</button></div>
    <div class="lb-comments" hidden></div></article>`;
}

async function commentsPanel(el, id) {
  const box = $('.lb-comments', el);
  const load = async () => {
    const list = (await api.get(`/api/posts/${id}/comments`)).comments;
    box.innerHTML = list.map(c => `<div class="c"><b>${esc(c.name)}</b>${esc(c.text)} <small>${timeAgo(c.at)}</small>${c.can_del ? ` <a href="#" data-cd="${c.id}" style="font-size:11px;color:#b91c1c;margin-left:6px">Xóa</a>` : ''}</div>`).join('') +
      '<form><input placeholder="Viết bình luận..." maxlength="600"><button class="btn btn-blue" style="margin:0;flex:0">Gửi</button></form>';
    $('[data-s=cm]', el).textContent = list.length + ' bình luận';
    $$('[data-cd]', box).forEach(a => a.onclick = async ev => { ev.preventDefault(); if (!confirm('Xóa bình luận này?')) return; try { await api.del('/api/comments/' + a.dataset.cd); await load(); } catch (er) { toast(er.message); } });
    $('form', box).onsubmit = async e => { e.preventDefault(); const v = $('input', box).value.trim(); if (!v) return; try { await api.post(`/api/posts/${id}/comments`, {text: v}); await load(); $('input', box).focus(); } catch (er) { toast(er.message); } };
  };
  box.hidden = !box.hidden;
  if (!box.hidden) await load();
}

function bind(host, me, reload) {
  host.onclick = async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const el = b.closest('.feed-post'), id = +el.dataset.id;
    try {
      if (b.dataset.a === 'like') { const r = await api.post(`/api/posts/${id}/like`); b.classList.toggle('lb-on', r.on); b.textContent = r.on ? '♥ Đã thích' : '♡ Thích'; $('[data-s=likes]', el).textContent = '♥ ' + r.count; }
      else if (b.dataset.a === 'save') { const r = await api.post(`/api/posts/${id}/save`); b.classList.toggle('lb-on', r.on); b.textContent = r.on ? '▣ Đã lưu' : '▢ Lưu'; toast(r.on ? 'Đã lưu bài viết' : 'Đã bỏ lưu'); }
      else if (b.dataset.a === 'comment') await commentsPanel(el, id);
      else if (b.dataset.a === 'share') { const url = location.origin + '/index.html#post-' + id; try { await navigator.clipboard.writeText(url); toast('Đã sao chép liên kết bài viết'); } catch (er) { prompt('Sao chép liên kết:', url); } }
      else if (b.dataset.a === 'follow') { const uid = +(el.querySelector('.post-author a').href.split('id=')[1]); const r = await api.post('/api/follow/' + uid); toast(r.on ? 'Đã theo dõi' : 'Đã bỏ theo dõi'); reload(); }
      else if (b.dataset.a === 'vis') { const post = (host.__posts || []).find(x => x.id === id); if (post) visibilityDialog(post, reload); }
      else if (b.dataset.a === 'del' && confirm('Xóa bài đăng này?')) { await api.del('/api/posts/' + id); el.remove(); toast('Đã xóa bài đăng'); }
    } catch (er) { toast(er.message); }
  };
}

function composer(me, done) {
  const kinds = me.role === 'student' || me.role === 'parent' ? ['Bài viết', 'Project học tập'] : ['Bài viết', 'Video bài giảng', 'Tài liệu', 'Project học tập'], teacher = me.role === 'teacher' || me.role === 'admin';
  const m = modal(`<h2>Tạo bài đăng</h2>
    <label class="lb-field"><span>LOẠI NỘI DUNG</span><select id="ck">${kinds.map(k => `<option>${k}</option>`).join('')}</select></label>
    <label class="lb-field"><span>TIÊU ĐỀ (TUỲ CHỌN)</span><input id="ct" maxlength="120"></label>
    <label class="lb-field"><span>NỘI DUNG</span><textarea id="cx" maxlength="5000" placeholder="Bạn muốn chia sẻ điều gì về giáo dục?"></textarea></label>
    <label class="lb-field"><span>THẺ (CÁCH NHAU BẰNG DẤU PHẨY)</span><input id="cg" placeholder="Toán 9, Worksheet"></label>
    <label class="lb-field"><span>FILE ĐÍNH KÈM (PDF, Word, PowerPoint, Excel, ảnh, video MP4 · tối đa 15 MB)</span><input id="cf" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.mp4,.txt,.zip"></label>
    <label class="lb-field"><span>AI XEM ĐƯỢC</span><select id="cv"><option value="Công khai">🌐 Công khai (publish) — mọi người xem được</option>${teacher ? '<option value="Riêng tư">🔒 Riêng tư — chỉ lớp / người được chia sẻ</option>' : '<option value="Người theo dõi">👥 Người theo dõi</option>'}</select></label>
    <div id="cshare" hidden></div>
    <p class="lb-note">Không đăng thông tin cá nhân của học sinh (họ tên đầy đủ, điểm số, ảnh) lên bảng tin công khai. Bài cần giữ riêng cho lớp hoặc người cụ thể thì chọn “Riêng tư”.</p>
    <div class="lb-row"><button class="btn btn-blue" id="cs">Đăng</button></div>`);
  let picker = null;
  $('#cv', m.b).onchange = async () => { const priv = $('#cv', m.b).value === 'Riêng tư'; $('#cshare', m.b).hidden = !priv; if (priv && !picker) picker = await sharePicker($('#cshare', m.b)); };
  $('#cs', m.b).onclick = async () => {
    const text = $('#cx', m.b).value.trim(); if (!text) return toast('Hãy nhập nội dung bài đăng');
    const priv = $('#cv', m.b).value === 'Riêng tư';
    if (priv && (!picker || !picker.count())) return toast('Bài riêng tư cần chọn ít nhất một lớp hoặc một người để chia sẻ');
    const f = $('#cf', m.b).files[0]; let file = null;
    if (f) {
      if (f.size > 15 * 1048576) return toast('File lớn hơn 15 MB');
      file = {name: f.name, data: await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = no; r.readAsDataURL(f); })};
    }
    $('#cs', m.b).disabled = true;
    try {
      await api.post('/api/posts', {kind: $('#ck', m.b).value, title: $('#ct', m.b).value.trim(), text, file,
        tags: $('#cg', m.b).value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5), visibility: $('#cv', m.b).value, ...(priv ? picker.get() : {})});
      m.close(); toast('Đã đăng bài'); done();
    } catch (e) { $('#cs', m.b).disabled = false; toast(e.message); }
  };
}

/* mount(host, {mode, author, q}) → vẽ danh sách bài đăng vào host */
async function mount(host, params) {
  const me = LB.me;
  const load = async () => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    let posts;
    try { posts = (await api.get('/api/posts?' + qs)).posts; } catch (e) { host.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
    host.__posts = posts;
    host.innerHTML = posts.length ? posts.map(p => card(p, me)).join('') : `<div class="card empty feed-empty"><div class="feed-empty-ic">▤</div><h3>Chưa có bài đăng nào ở đây</h3><p>Hãy là người đầu tiên chia sẻ bài viết, video bài giảng hay tài liệu với cộng đồng giáo viên.</p><div class="lb-row" style="justify-content:center"><button class="btn btn-blue" data-empty="write">Viết bài đầu tiên</button><a class="btn btn-outline" href="teachers.html">Khám phá giáo viên</a></div></div>`;
    const w = $('[data-empty=write]', host); if (w) w.onclick = () => composer(me, load);
    if (location.hash.startsWith('#post-')) { const t = $(location.hash); if (t) t.scrollIntoView(); }
  };
  bind(host, me, load);
  await load();
  return load;
}
window.LBFeed = {mount, composer, card, sharePicker, visibilityDialog};
})();
