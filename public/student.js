/* student.js — học sinh xem bài được giao, làm bài online (server chấm), xem kết quả. */
(async () => {
'use strict';
const {$, $$, esc, toast, modal, api, fmtDate, fmtScore} = LB;
await LB.ready;
const me = LB.me;

async function draw() {
  let list, res;
  try { [list, res] = await Promise.all([api.get('/api/assignments'), api.get('/api/my-results')]); } catch (e) { return toast(e.message); }
  const A = list.assignments, now = Date.now() / 1000;
  const todo = A.filter(a => !a.closed && a.attempts < a.max_attempts && !(a.due_at && a.due_at < now));
  $('#prof').innerHTML = `<div class="post-head"><div class="mini-avatar student-av">${esc(LB.initials(me.name))}</div><div><div class="post-name">${esc(me.name)}</div><div class="post-time">${me.class_name ? 'Lớp ' + esc(me.class_name) + ' · ' : ''}tài khoản học sinh</div></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0"><div class="card" style="box-shadow:none;padding:12px;text-align:center"><b style="font-size:22px">${todo.length}</b><div class="muted" style="font-size:10px">bài cần làm</div></div>
    <div class="card" style="box-shadow:none;padding:12px;text-align:center"><b style="font-size:22px">${fmtScore(res.avg)}</b><div class="muted" style="font-size:10px">điểm trung bình</div></div></div>
    <b style="font-size:12px">Kết quả gần đây</b>${res.results.length ? res.results.slice(0, 8).map(r => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(r.title)}</span><b>${fmtScore(r.score10)}</b></div>`).join('') : '<div class="muted" style="font-size:12px;margin-top:6px">Chưa có bài nào được chấm.</div>'}`;
  $('#list').innerHTML = A.length ? A.map(a => {
    const over = a.due_at && a.due_at < now, left = a.max_attempts - a.attempts;
    const st = a.doing ? '<span class="pill warn">Đang làm dở</span>' : a.attempts && left <= 0 ? '<span class="pill ok">Đã nộp</span>' : a.closed || over ? '<span class="pill bad">Hết hạn</span>' : a.attempts ? '<span class="pill blue">Làm lại được</span>' : '<span class="pill blue">Chưa làm</span>';
    const can = !a.closed && !over && (a.doing || left > 0);
    return `<div class="card" style="margin-bottom:12px" data-a="${a.id}"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><b style="font-size:15px">${esc(a.title)}</b><div style="font-size:11px;color:#667085;margin-top:3px">${a.duration_min ? '⏱ ' + a.duration_min + ' phút' : '⏱ Không giới hạn thời gian'} · ${a.due_at ? 'Hạn nộp: ' + fmtDate(a.due_at) : 'Không có hạn nộp'} · Làm tối đa ${a.max_attempts} lần (đã làm ${a.attempts})</div></div><div>${st}</div></div>
      ${a.best != null ? `<div style="margin:8px 0;font-size:13px">Điểm cao nhất: <b style="font-size:18px">${fmtScore(a.best)}</b>/10</div>` : ''}
      <div class="lb-row" style="margin-top:10px">${can ? `<button class="btn btn-blue sm" data-go="1">${a.doing ? '▶ Làm tiếp' : '▶ Bắt đầu làm bài'}</button>` : ''}</div></div>`;
  }).join('') : '<div class="card empty">Giáo viên chưa giao bài nào cho bạn.<br>Khi có bài mới, bài sẽ hiện ở đây.</div>';
  $$('[data-go]').forEach(b => b.onclick = () => start(A.find(x => x.id === +b.closest('[data-a]').dataset.a)));
}

async function start(a) {
  try {
    let variation;
    if (a.free && !a.doing) {
      const vs = (await api.get(`/api/assignments/${a.id}/variations`)).variations;
      variation = await new Promise(ok => {
        const m = modal(`<h2>${esc(a.title)}</h2><p style="font-size:13px">Giáo viên cho phép bạn tự chọn mã đề. Sau khi bắt đầu sẽ không đổi được.</p>
          <div class="lb-tabs">${vs.map(v => `<button data-v="${v.idx}">📄 ${esc(v.code)} · ${v.count} câu</button>`).join('')}</div>`);
        $$('[data-v]', m.b).forEach(btn => btn.onclick = () => { m.close(); ok(+btn.dataset.v); });
      });
    }
    if (!confirm(a.doing ? 'Tiếp tục bài đang làm dở?' : `Bắt đầu làm bài “${a.title}”?${a.duration_min ? `\nĐồng hồ ${a.duration_min} phút sẽ chạy ngay và không dừng lại được.` : ''}`)) return;
    const data = await api.post(`/api/assignments/${a.id}/start`, variation === undefined ? {} : {variation});
    LBX.runExam({...data, title: a.title}, {assignmentId: a.id, after: draw});
  } catch (e) { toast(e.message); }
}
/* ---------- Tự luyện tập: học sinh tự tạo đề từ các chuyên đề giáo viên đã mở cho lớp ---------- */
const TYPE_VN = {mcq: 'Trắc nghiệm', tf: 'Đúng/Sai', short: 'Trả lời ngắn'};
async function drawPractice() {
  const host = $('#v-practice');
  host.innerHTML = '<div class="card empty">Đang tải...</div>';
  let tp, hist;
  try { [tp, hist] = await Promise.all([api.get('/api/practice/topics'), api.get('/api/practice')]); }
  catch (e) { host.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  const G = tp.groups;
  host.innerHTML = `<div class="grid2" style="grid-template-columns:minmax(300px,420px) 1fr"><div class="card">
      <h2 style="margin:0 0 4px;font-size:18px">🎯 Tự tạo đề luyện tập</h2>
      <p class="section-sub" style="margin:0 0 12px">Chọn chuyên đề và số câu, hệ thống tạo đề cho bạn. Nộp bài xong sẽ có điểm, đáp án và lời giải ngay.</p>
      ${G.length ? `<div style="font-size:11px;font-weight:700;margin-bottom:6px">1. Chọn khối, môn và chuyên đề</div>
        <div id="pf" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px"></div>
        <div id="pg" style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow:auto"></div>
        <div id="pcount" style="font-size:11px;color:#475467;margin-top:4px"></div>
        <div style="font-size:11px;font-weight:700;margin:14px 0 6px">2. Số câu mỗi dạng</div>
        <div class="lb-row">${['mcq', 'tf', 'short'].map(t => `<label style="font-size:11px;color:#667085">${TYPE_VN[t]}<input type="number" min="0" max="50" value="${t === 'mcq' ? 10 : 2}" data-c="${t}" style="display:block;width:92px;padding:7px;border:1px solid var(--line);border-radius:8px;margin-top:3px"></label>`).join('')}</div>
        <div id="avail" style="font-size:11px;color:#1e40af;margin:6px 0"></div>
        <div style="font-size:11px;font-weight:700;margin:12px 0 6px">3. Thời gian làm bài (phút, 0 = không giới hạn)</div>
        <input type="number" min="0" max="180" value="0" id="pmin" style="width:92px;padding:7px;border:1px solid var(--line);border-radius:8px">
        <div style="margin-top:16px"><button class="btn btn-blue" id="pstart">▶ Tạo đề và bắt đầu làm bài</button></div>`
      : '<div class="empty">Giáo viên chưa mở chuyên đề luyện tập cho lớp của bạn.<br>Khi giáo viên mở, chuyên đề sẽ hiện ở đây.</div>'}
    </div>
    <div class="card"><h2 style="margin:0 0 10px;font-size:18px">Lịch sử luyện tập${hist.avg != null ? ` <small style="font-weight:400;color:#667085">· điểm trung bình ${fmtScore(hist.avg)}</small>` : ''}</h2>
      ${hist.sessions.length ? `<table class="tbl"><tr><th>Bài</th><th>Điểm (10)</th><th>Đúng/Tổng</th><th>Lúc</th><th></th></tr>${hist.sessions.map(s => `<tr data-s="${s.id}"><td>${esc(s.title)}</td><td><b>${fmtScore(s.score10)}</b></td><td>${fmtScore(s.score)}/${s.max}</td><td>${fmtDate(s.at)}</td><td><button class="btn btn-outline sm" data-v="1">Xem lại</button></td></tr>`).join('')}</table>` : '<div class="empty">Bạn chưa luyện tập lần nào.</div>'}</div></div>`;

  // lọc theo khối / môn (mặc định: khối của lớp mình nếu có chuyên đề); các chuyên đề đã tick được giữ khi đổi bộ lọc
  const pick = new Set(), uniq = f => [...new Set(G.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi', {numeric: true}));
  const grades = uniq(g => g.grade), subjects = uniq(g => g.subject);
  const filt = {grade: grades.includes(String(me.class_grade)) ? String(me.class_grade) : 'all', subject: 'all'};
  const chips = (arr, cur, key, all) => ['all', ...arr].map(v => `<button type="button" data-f="${key}" data-v="${esc(v)}" class="btn ${cur === v ? 'btn-blue' : 'btn-outline'} sm" style="padding:4px 10px;font-size:11px">${v === 'all' ? all : (key === 'grade' ? 'Khối ' : '') + esc(v)}</button>`).join('');
  const shown = () => G.map((g, i) => [g, i]).filter(([g]) => (filt.grade === 'all' || g.grade === filt.grade) && (filt.subject === 'all' || g.subject === filt.subject));
  const drawList = () => {
    const pf = $('#pf', host); if (!pf) return;
    pf.innerHTML = `<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center"><small style="color:#667085;width:44px">Khối</small>${chips(grades, filt.grade, 'grade', 'Tất cả')}</div>${subjects.length > 1 ? `<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center"><small style="color:#667085;width:44px">Môn</small>${chips(subjects, filt.subject, 'subject', 'Tất cả')}</div>` : ''}`;
    $$('[data-f]', pf).forEach(b => b.onclick = () => { filt[b.dataset.f] = b.dataset.v; drawList(); });
    const rows = shown();
    $('#pg', host).innerHTML = rows.length ? rows.map(([g, i]) => `<label style="display:flex;gap:8px;align-items:center;font-size:12px;border:1px solid var(--line);border-radius:10px;padding:8px 10px;cursor:pointer"><input type="checkbox" data-g="${i}" ${pick.has(i) ? 'checked' : ''}><span>${esc(g.subject || '')}${g.grade ? ' · Khối ' + esc(g.grade) : ''} · <b>${esc(g.topic || 'Chưa phân chuyên đề')}</b></span><small style="margin-left:auto;color:#667085">${g.total} câu</small></label>`).join('') : '<div class="empty" style="padding:12px">Chưa có chuyên đề nào cho bộ lọc này — hãy chọn “Tất cả”.</div>';
    $$('[data-g]', host).forEach(c => c.onchange = () => { c.checked ? pick.add(+c.dataset.g) : pick.delete(+c.dataset.g); upd(); });
    upd();
  };
  const sel = () => [...pick].map(i => G[i]);
  const counts = () => Object.fromEntries($$('[data-c]', host).map(i => [i.dataset.c, Math.max(0, Math.min(50, Math.floor(+i.value || 0)))]));
  const upd = () => {
    const a = el => sel().reduce((n, g) => n + g.counts[el], 0), box = $('#avail', host); if (!box) return;
    box.textContent = sel().length ? `Có sẵn trong các chuyên đề đã chọn: ${['mcq', 'tf', 'short'].map(t => TYPE_VN[t] + ' ' + a(t)).join(' · ')}` : 'Hãy tick ít nhất một chuyên đề.';
  };
  $$('[data-c]', host).forEach(el => el.oninput = upd); drawList();
  const st = $('#pstart', host);
  if (st) st.onclick = async () => {
    const groups = sel(), c = counts();
    if (!groups.length) return toast('Hãy chọn ít nhất một chuyên đề');
    if (c.mcq + c.tf + c.short < 1) return toast('Hãy nhập số câu');
    st.disabled = true;
    try {
      const data = await api.post('/api/practice/start', {groups: groups.map(g => ({subject: g.subject, grade: g.grade, topic: g.topic})), counts: c, duration_min: +$('#pmin', host).value || 0});
      if (data.note) toast('Lưu ý — ' + data.note);
      LBX.runExam(data, {submitUrl: `/api/practice/${data.id}/submit`, after: drawPractice});
    } catch (e) { toast(e.message); st.disabled = false; }
  };
  $$('[data-v]', host).forEach(b => b.onclick = async () => {
    try {
      const r = await api.get('/api/practice/' + b.closest('tr').dataset.s);
      modal(`<h2>${esc(r.title)}</h2><p style="font-size:13px">Điểm: <b>${fmtScore(r.score10)}</b>/10 · đúng ${fmtScore(r.score)}/${r.max} câu</p><div style="max-height:60vh;overflow:auto">${LBX.reviewHTML(r.questions, r.details)}</div>`, true);
    } catch (e) { toast(e.message); }
  });
}

$$('#stabs button').forEach(b => b.onclick = () => {
  $$('#stabs button').forEach(x => x.classList.toggle('on', x === b));
  $('#v-assigned').hidden = b.dataset.t !== 'assigned'; $('#v-practice').hidden = b.dataset.t !== 'practice';
  if (b.dataset.t === 'practice') drawPractice();
});

draw();
if (location.hash === '#practice') { const b = $('#stabs [data-t="practice"]'); if (b) b.click(); }
})();
