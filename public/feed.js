/* feed.js — bảng tin dùng dữ liệu thật từ máy chủ: đăng bài (kèm file), thích, bình luận, lưu, theo dõi. */
(() => {
'use strict';
const {$, $$, esc, toast, modal, api} = LB;

const timeAgo = ts => { const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60)); return m < 1 ? 'Vừa xong' : m < 60 ? m + ' phút trước' : m < 1440 ? Math.round(m / 60) + ' giờ trước' : Math.round(m / 1440) + ' ngày trước'; };
const AV = {admin: 'teacher-av', teacher: 'teacher-av', student: 'student-av', parent: 'parent-av'};
const fsize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const isImg = n => /\.(png|jpe?g|gif|webp)$/i.test(n);

function card(p, me) {
  const mine = p.author.id === me.id, a = p.author;
  const file = p.file ? (isImg(p.file.name) ? `<a href="/api/files/${p.file.id}" target="_blank"><img src="/api/files/${p.file.id}" alt="${esc(p.file.name)}" style="max-width:100%;border-radius:10px;margin:8px 0"></a>`
    : `<a class="post-file" href="/api/files/${p.file.id}" target="_blank" rel="noopener"><div class="resource-icon">${esc((p.file.name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4))}</div><div><b>${esc(p.file.name)}</b><div style="font-size:10px;color:#667085">${fsize(p.file.size)} · bấm để mở / tải về</div></div></a>`) : '';
  return `<article class="feed-post card" data-id="${p.id}" id="post-${p.id}">
    <div class="post-head"><div class="mini-avatar ${AV[a.role] || ''}">${esc(LB.initials(a.name))}</div>
      <div class="post-author"><b><a href="teachers.html?id=${a.id}" style="color:inherit;text-decoration:none">${esc(a.name)}</a> · ${LB.ROLE_VN[a.role] || ''}</b><span>${timeAgo(p.created_at)} · ${esc(p.kind)} · ${esc(p.visibility)}</span></div>
      ${!mine ? `<button class="small-action" data-a="follow" style="margin-left:auto">${p.followed ? '✓ Đang theo dõi' : '+ Theo dõi'}</button>` : ''}
      ${mine || me.role === 'admin' ? `<button class="post-more" data-a="del" title="Xóa bài đăng" style="${mine ? 'margin-left:auto' : ''}">🗑</button>` : ''}</div>
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
      else if (b.dataset.a === 'del' && confirm('Xóa bài đăng này?')) { await api.del('/api/posts/' + id); el.remove(); toast('Đã xóa bài đăng'); }
    } catch (er) { toast(er.message); }
  };
}

function composer(me, done) {
  const kinds = me.role === 'student' || me.role === 'parent' ? ['Bài viết', 'Project học tập'] : ['Bài viết', 'Video bài giảng', 'Tài liệu', 'Project học tập'];
  const m = modal(`<h2>Tạo bài đăng</h2>
    <label class="lb-field"><span>LOẠI NỘI DUNG</span><select id="ck">${kinds.map(k => `<option>${k}</option>`).join('')}</select></label>
    <label class="lb-field"><span>TIÊU ĐỀ (TUỲ CHỌN)</span><input id="ct" maxlength="120"></label>
    <label class="lb-field"><span>NỘI DUNG</span><textarea id="cx" maxlength="5000" placeholder="Bạn muốn chia sẻ điều gì về giáo dục?"></textarea></label>
    <label class="lb-field"><span>THẺ (CÁCH NHAU BẰNG DẤU PHẨY)</span><input id="cg" placeholder="Toán 9, Worksheet"></label>
    <label class="lb-field"><span>FILE ĐÍNH KÈM (PDF, Word, PowerPoint, Excel, ảnh, video MP4 · tối đa 15 MB)</span><input id="cf" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.mp4,.txt,.zip"></label>
    <label class="lb-field"><span>AI XEM ĐƯỢC</span><select id="cv"><option>Công khai</option><option>Người theo dõi</option></select></label>
    <p class="lb-note">Không đăng thông tin cá nhân của học sinh (họ tên đầy đủ, điểm số, ảnh) lên bảng tin công khai.</p>
    <div class="lb-row"><button class="btn btn-blue" id="cs">Đăng</button></div>`);
  $('#cs', m.b).onclick = async () => {
    const text = $('#cx', m.b).value.trim(); if (!text) return toast('Hãy nhập nội dung bài đăng');
    const f = $('#cf', m.b).files[0]; let file = null;
    if (f) {
      if (f.size > 15 * 1048576) return toast('File lớn hơn 15 MB');
      file = {name: f.name, data: await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = no; r.readAsDataURL(f); })};
    }
    $('#cs', m.b).disabled = true;
    try {
      await api.post('/api/posts', {kind: $('#ck', m.b).value, title: $('#ct', m.b).value.trim(), text, file,
        tags: $('#cg', m.b).value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5), visibility: $('#cv', m.b).value});
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
    host.innerHTML = posts.length ? posts.map(p => card(p, me)).join('') : '<div class="card empty">Chưa có bài đăng nào ở đây.</div>';
    if (location.hash.startsWith('#post-')) { const t = $(location.hash); if (t) t.scrollIntoView(); }
  };
  bind(host, me, load);
  await load();
  return load;
}
window.LBFeed = {mount, composer, card};
})();
