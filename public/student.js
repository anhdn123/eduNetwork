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
      ${over && !a.attempts && a.count_penalty ? '<div style="margin:8px 0;font-size:12px;color:#b91c1c"><b>⛔ Quá hạn mà chưa nộp</b> — bị trừ điểm (xem tab “⭐ Điểm của tôi”).</div>' : !over && a.due_at && !a.attempts && a.count_penalty ? '<div style="margin:6px 0 0;font-size:11px;color:#b45309">Nếu quá hạn nộp mà chưa làm bài này sẽ bị trừ điểm.</div>' : ''}
      ${a.best != null ? `<div style="margin:8px 0;font-size:13px">Điểm cao nhất: <b style="font-size:18px">${fmtScore(a.best)}</b>/10</div>` : ''}
      <div class="lb-row" style="margin-top:10px">${can ? `<button class="btn btn-blue sm" data-go="1">${a.doing ? '▶ Làm tiếp' : '▶ Bắt đầu làm bài'}</button>` : ''}
        ${a.attempts ? `<button class="btn btn-outline sm" data-rv="1">📖 Xem lại bài${a.reveal ? ' · đáp án & lời giải' : ''}</button>` : ''}
        ${a.attempts && !a.reveal && a.show_result === 2 ? '<span style="font-size:11px;color:#667085">Đáp án và lời giải sẽ mở sau khi hết hạn nộp.</span>' : ''}</div></div>`;
  }).join('') : '<div class="card empty">Giáo viên chưa giao bài nào cho bạn.<br>Khi có bài mới, bài sẽ hiện ở đây.</div>';
  $$('[data-go]').forEach(b => b.onclick = () => start(A.find(x => x.id === +b.closest('[data-a]').dataset.a)));
  $$('[data-rv]').forEach(b => b.onclick = () => review(A.find(x => x.id === +b.closest('[data-a]').dataset.a)).catch(e => toast(e.message)));
}

/* ---------- Báo đáp án sai: học sinh chọn đáp án mình cho là đúng, ghi lý do, đính kèm ảnh → giáo viên duyệt ---------- */
const shrinkImage = file => new Promise((ok, no) => {   // thu nhỏ ảnh chụp (cạnh dài tối đa 1600px, JPEG) cho nhẹ trước khi gửi
  const fr = new FileReader();
  fr.onerror = () => no(new Error('Không đọc được ảnh'));
  fr.onload = () => { const im = new Image(); im.onerror = () => no(new Error('Tệp không phải ảnh hợp lệ')); im.onload = () => {
    const k = Math.min(1, 1600 / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height); ok(cv.toDataURL('image/jpeg', 0.85)); }; im.src = fr.result; };
  fr.readAsDataURL(file);
});
function reportDialog({source, source_id, qi, q, d, onDone}) {
  const tf = LBX.isTfg(q), isImg = !!q.img, files = [];
  const given = d.given, mine = tf ? (Array.isArray(given) ? given.map(v => v === 0 ? 'Đúng' : v === 1 ? 'Sai' : '—').join(' · ') : '—') : q.opts ? (Number.isInteger(given) ? 'ABCD'[given] : '—') : (given == null || given === '' ? '—' : esc(given));
  const key = d.key, cur = tf ? (Array.isArray(key) ? key.map(v => v === 0 ? 'Đúng' : 'Sai').join(' · ') : '') : q.opts ? (Number.isInteger(key) ? 'ABCD'[key] : '') : esc(key == null ? '' : key);
  const pick = tf ? `<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center">${q.sts.map((s, k) => `<b>${'abcd'[k]})</b><select data-tf="${k}" style="padding:6px;border:1px solid var(--line);border-radius:8px"><option value="">— chưa chọn —</option><option value="0">Đúng</option><option value="1">Sai</option></select>`).join('')}</div>`
    : q.opts ? `<div style="display:flex;flex-direction:column;gap:6px">${q.opts.map((o, j) => `<label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer"><input type="radio" name="rp-opt" value="${j}" style="margin-top:3px"><span><b>${'ABCD'[j]}.</b> ${isImg ? '' : esc(o)}</span></label>`).join('')}</div>`
    : '<input id="rp-short" maxlength="60" placeholder="Đáp án bạn cho là đúng" style="padding:8px;border:1px solid var(--line);border-radius:8px;width:100%">';
  const m = modal(`<h2>🚩 Báo đáp án sai · Câu ${qi + 1}</h2>
    <div style="max-height:30vh;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-bottom:8px;font-size:13px">${LBX.qBody(q)}</div>
    <div style="font-size:12px;color:#475467;margin-bottom:10px">Bạn chọn: <b>${mine}</b>${cur ? ` · Đáp án hiện tại của hệ thống: <b>${cur}</b>` : ''}</div>
    <b style="font-size:13px">Đáp án bạn cho là đúng</b> <small style="color:#667085">(không biết thì bỏ trống, chỉ ghi lý do / gửi ảnh)</small>
    <div style="margin:6px 0 10px">${pick}</div>
    <label class="lb-field"><span>LÝ DO / GIẢI THÍCH (tối đa 1000 ký tự)</span><textarea id="rp-note" maxlength="1000" rows="3" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px" placeholder="Ví dụ: Theo bài giải trong sách giáo khoa trang 45 thì đáp án là B…"></textarea></label>
    <div style="margin:8px 0"><b style="font-size:13px">📎 Ảnh đính kèm</b> <small style="color:#667085">(tối đa 3 ảnh: chụp lời giải, sách, đề gốc…)</small>
      <div><input type="file" id="rp-f" accept="image/png,image/jpeg,image/*" multiple style="font-size:12px;margin-top:4px"></div><div id="rp-th" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"></div></div>
    <div class="lb-row"><button class="btn btn-blue" id="rp-go">Gửi báo cáo</button><button class="btn btn-outline" id="rp-x">Hủy</button></div>`, true);
  const th = $('#rp-th', m.b), draw = () => { th.innerHTML = files.map((f, i) => `<span style="position:relative"><img src="${f}" style="height:64px;border-radius:6px;border:1px solid var(--line)"><button data-rm="${i}" title="Bỏ ảnh" style="position:absolute;top:-6px;right:-6px;border:0;border-radius:50%;background:#dc2626;color:#fff;width:18px;height:18px;cursor:pointer;line-height:18px;padding:0">×</button></span>`).join(''); $$('[data-rm]', th).forEach(b => b.onclick = () => { files.splice(+b.dataset.rm, 1); draw(); }); };
  $('#rp-f', m.b).onchange = async e => {
    for (const f of [...e.target.files]) { if (files.length >= 3) { toast('Chỉ đính kèm tối đa 3 ảnh'); break; } try { files.push(await shrinkImage(f)); } catch (er) { toast(er.message); } }
    e.target.value = ''; draw();
  };
  $('#rp-x', m.b).onclick = m.close;
  $('#rp-go', m.b).onclick = async () => {
    let proposed = null;
    if (tf) { const v = $$('[data-tf]', m.b).map(s => s.value); if (v.some(x => x !== '') && v.some(x => x === '')) return toast('Hãy chọn Đúng/Sai cho cả 4 ý, hoặc bỏ trống hết'); if (v.every(x => x !== '')) proposed = v.map(Number); }
    else if (q.opts) { const r = $('input[name=rp-opt]:checked', m.b); if (r) proposed = +r.value; }
    else { const t = $('#rp-short', m.b).value.trim(); if (t) proposed = t; }
    const note = $('#rp-note', m.b).value.trim();
    if (proposed === null && !note && !files.length) return toast('Hãy chọn đáp án bạn cho là đúng, ghi lý do hoặc đính kèm ảnh');
    const btn = $('#rp-go', m.b); btn.disabled = true; btn.textContent = 'Đang gửi…';
    try {
      const ids = []; for (const f of files) ids.push((await api.post('/api/reports/image', {data: f})).id);
      await api.post('/api/reports', {source, source_id, qi, proposed, note, images: ids});
      m.close(); toast('Đã gửi báo cáo. Giáo viên sẽ kiểm tra và cập nhật đáp án nếu đúng.'); onDone && onDone();
    } catch (e) { btn.disabled = false; btn.textContent = 'Gửi báo cáo'; toast(e.message); }
  };
}
async function attachReports(box, {source, source_id, questions, details, redraw}) {
  $$('[data-rep]', box).forEach(b => b.onclick = () => reportDialog({source, source_id, qi: +b.dataset.rep, q: questions[+b.dataset.rep], d: details[+b.dataset.rep] || {}, onDone: redraw}));
}
async function reportMap(source, source_id) {
  try { const r = await api.get(`/api/reports/mine?source=${source}&source_id=${source_id}`); const map = {}; r.reports.forEach(x => { map[x.qi] = x; }); return {map}; } catch (e) { return {map: {}}; }
}

/* Xem lại bài đã nộp: bài làm của mình, đúng/sai từng câu, đáp án đúng và lời giải chi tiết (khi giáo viên cho xem) */
async function review(a, subId) {
  const subs = (await api.get(`/api/assignments/${a.id}/my`)).submissions;
  if (!subs.length) return toast('Bạn chưa nộp bài này');
  const id = subId || subs[0].id, r = await api.get(`/api/assignments/${a.id}/my/${id}`), rep = await reportMap('assignment', id);
  const m = modal(`<h2>📖 Xem lại · ${esc(r.title)} · ${esc(r.code)}</h2>
    ${subs.length > 1 ? `<div class="lb-tabs" style="margin-bottom:8px">${subs.slice().reverse().map(s => `<button data-sub="${s.id}" class="${s.id === id ? 'on' : ''}">Lần ${s.attempt} · ${fmtScore(s.score10)}</button>`).join('')}</div>` : ''}
    <div style="display:flex;gap:14px;align-items:baseline;flex-wrap:wrap;margin:4px 0 10px"><div class="res-big" style="font-size:34px">${r.score10 == null ? '—' : fmtScore(r.score10)}<small style="font-size:14px;color:#667085"> / 10</small></div>
      <div style="font-size:12px;color:#475467">Lần làm thứ ${r.attempt} · nộp lúc ${fmtDate(r.submitted_at)} · đúng ${fmtScore(r.score)}/${r.max} câu chấm tự động${r.late ? ' · <b style="color:#b91c1c">nộp trễ</b>' : ''}</div></div>
    ${r.reveal ? '<div class="lb-note">Câu <b style="color:#166534">viền xanh</b> là làm đúng, <b style="color:#b91c1c">viền đỏ</b> là làm sai. Đọc kỹ đáp án đúng và <b>📘 lời giải chi tiết</b> để biết mình sai ở đâu.</div>'
      : `<div class="lb-note" style="background:#fff7ed;border-color:#fed7aa;color:#9a3412">${esc(r.reveal_note || 'Giáo viên chưa cho xem đáp án.')} Hiện bạn xem được bài làm của mình và câu nào đúng/sai.</div>`}
    <div>${LBX.reviewHTML(r.questions, r.details, undefined, r.reveal ? rep : undefined)}</div>`, true);
  $$('[data-sub]', m.b).forEach(b => b.onclick = () => review(a, +b.dataset.sub).catch(e => toast(e.message)));
  if (r.reveal) attachReports(m.b, {source: 'assignment', source_id: id, questions: r.questions, details: r.details, redraw: () => { m.close(); review(a, id).catch(e => toast(e.message)); }});
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
const LVS = [[1, 'Nhận biết'], [2, 'Thông hiểu'], [3, 'Vận dụng'], [4, 'Vận dụng cao']], DEF = {mcq: [4, 4, 2, 0], tf: [0, 1, 1, 0], short: [0, 1, 1, 0]};
const mmss = sec => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
async function drawPractice() {
  const host = $('#v-practice');
  host.innerHTML = '<div class="card empty">Đang tải...</div>';
  let tp, hist, bn = null;
  try { [tp, hist] = await Promise.all([api.get('/api/practice/topics'), api.get('/api/practice')]); }
  catch (e) { host.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  try { bn = await api.get('/api/bonus/me'); } catch (e) { /* không có điểm cộng thì bỏ qua khung này */ }
  const G = tp.groups, R = tp.rules || {points: {mcq: 0.25, tf: 1, short: 1}, tf_steps: [0, 0.1, 0.25, 0.5, 1], minutes: {mcq: 2, tf: 7, short: 8}}, fmtM = m => m.slice(5) + '/' + m.slice(0, 4), cfg = bn && bn.config;
  const rule = cfg ? ['mcq', 'tf', 'short'].filter(t => cfg[t] > 0).map(t => `${TYPE_VN[t]} <b>+${cfg[t]}</b>`).join(' · ') : '';
  const prev = bn ? bn.history.filter(h => h.month !== bn.month).slice(0, 3) : [];
  host.innerHTML = (bn ? `<div class="card" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:14px;background:linear-gradient(90deg,#fffbeb,#fff)">
      <div style="font-size:34px">⭐</div>
      <div><div style="font-size:12px;color:#667085">Điểm cộng tháng ${fmtM(bn.month)}</div><div style="font-size:28px;font-weight:800;color:#b45309">${bn.points.toLocaleString('vi-VN')} <small style="font-size:13px;font-weight:400;color:#667085">điểm${bn.rank && bn.points ? ` · hạng ${bn.rank}/${bn.class_size} trong lớp` : ''}</small></div></div>
      <div style="flex:1;min-width:240px;font-size:12px;color:#475467">${rule ? `Mỗi câu làm đúng: ${rule}. ` : 'Giáo viên chưa bật điểm cộng cho lớp. '}Mỗi câu chỉ được cộng lần đầu làm đúng trong tháng; câu đúng/sai phải đúng cả 4 ý. Điểm cộng về 0 vào ngày 1 hằng tháng.
        ${prev.length ? `<div style="margin-top:4px;color:#667085">Các tháng trước: ${prev.map(h => `${fmtM(h.month)}: <b>${h.points.toLocaleString('vi-VN')}</b>`).join(' · ')}</div>` : ''}</div></div>` : '')
    + `<div class="grid2" style="grid-template-columns:minmax(300px,420px) 1fr"><div class="card">
      <h2 style="margin:0 0 4px;font-size:18px">🎯 Tự tạo đề luyện tập</h2>
      <p class="section-sub" style="margin:0 0 12px">Chọn chuyên đề và số câu, hệ thống tạo đề cho bạn. Nộp bài xong sẽ có điểm, đáp án và lời giải ngay.</p>
      ${G.length ? `<div style="font-size:11px;font-weight:700;margin-bottom:6px">1. Chọn khối, môn và chuyên đề</div>
        <div id="pf" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px"></div>
        <div id="pg" style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow:auto"></div>
        <div id="pcount" style="font-size:11px;color:#475467;margin-top:4px"></div>
        <div style="font-size:11px;font-weight:700;margin:14px 0 6px">2. Số câu theo dạng và mức độ${tp.matrix ? ' <span style="font-weight:400;color:#667085">(giáo viên đã gợi ý sẵn, bạn có thể sửa)</span>' : ''}</div>
        <table class="tbl" style="font-size:12px"><tr><th>Dạng câu</th>${LVS.map(([, n]) => `<th>${n}</th>`).join('')}<th>Điểm · giờ</th></tr>
          ${['mcq', 'tf', 'short'].map(t => `<tr><td><b>${TYPE_VN[t]}</b></td>${LVS.map(([lv], j) => `<td><input type="number" min="0" max="50" value="${(tp.matrix && tp.matrix[t] && tp.matrix[t][lv] != null ? tp.matrix[t][lv] : DEF[t][j])}" data-m="${t}:${lv}" style="width:50px;padding:6px;border:1px solid var(--line);border-radius:8px"><div data-a="${t}:${lv}" style="font-size:10px;color:#667085;margin-top:2px"></div></td>`).join('')}
            <td style="white-space:nowrap;font-size:11px;line-height:1.4">${t === 'tf' ? 'tối đa 1' : fmtScore(R.points[t])} điểm<br>${R.minutes[t]} phút</td></tr>`).join('')}</table>
        <div id="psum" style="font-size:12px;font-weight:700;color:#2a2b86;margin:8px 0 4px"></div>
        <div id="avail" style="font-size:11px;color:#2a2b86;margin:2px 0"></div>
        <div style="font-size:11px;color:#475467;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin-top:8px;line-height:1.5">
          <b>Cách tính điểm:</b> trắc nghiệm ${fmtScore(R.points.mcq)} điểm/câu · đúng/sai: đúng 1 ý ${fmtScore(R.tf_steps[1])}, 2 ý ${fmtScore(R.tf_steps[2])}, 3 ý ${fmtScore(R.tf_steps[3])}, đủ 4 ý ${fmtScore(R.tf_steps[4])} điểm · trả lời ngắn ${fmtScore(R.points.short)} điểm/câu.<br>
          <b>Thời gian:</b> tự tính theo số câu — trắc nghiệm ${R.minutes.mcq} phút/câu · đúng/sai ${R.minutes.tf} phút/câu · trả lời ngắn ${R.minutes.short} phút/câu. Đồng hồ chạy ngay khi bạn bắt đầu; hết giờ bài tự động nộp.</div>
        <div style="margin-top:16px"><button class="btn btn-blue" id="pstart">▶ Tạo đề và bắt đầu làm bài</button></div>`
      : '<div class="empty">Giáo viên chưa mở chuyên đề luyện tập cho lớp của bạn.<br>Khi giáo viên mở, chuyên đề sẽ hiện ở đây.</div>'}
    </div>
    <div class="card"><h2 style="margin:0 0 10px;font-size:18px">Lịch sử luyện tập${hist.avg != null ? ` <small style="font-weight:400;color:#667085">· điểm trung bình ${fmtScore(hist.avg)}</small>` : ''}</h2>
      ${hist.sessions.length ? `<table class="tbl"><tr><th>Bài</th><th>Điểm</th><th>Thời gian</th><th>Điểm cộng</th><th>Lúc</th><th></th></tr>${hist.sessions.map(s => `<tr data-s="${s.id}"><td>${esc(s.title)}</td><td>${s.points ? `<b>${fmtScore(s.score)}/${fmtScore(s.max)}</b><div style="font-size:10px;color:#667085">thang 10: ${fmtScore(s.score10)}</div>` : `<b>${fmtScore(s.score10)}</b>/10`}</td><td style="white-space:nowrap">${mmss(s.spent_sec || 0)}${s.duration_min ? ` / ${s.duration_min}'` : ''}</td><td>${s.bonus ? `<b style="color:#b45309">+${s.bonus.toLocaleString('vi-VN')}</b>` : '<span style="color:#98a2b3">0</span>'}</td><td>${fmtDate(s.at)}</td><td><button class="btn btn-outline sm" data-v="1">Xem lại</button></td></tr>`).join('')}</table>` : '<div class="empty">Bạn chưa luyện tập lần nào.</div>'}</div></div>`;

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
  const matrix = () => { const m = {mcq: {}, tf: {}, short: {}}; $$('[data-m]', host).forEach(i => { const [t, lv] = i.dataset.m.split(':'); m[t][lv] = Math.max(0, Math.min(50, Math.floor(+i.value || 0))); }); return m; };
  const upd = () => {
    const m = matrix(), g = sel(), tot = {mcq: 0, tf: 0, short: 0};
    $$('[data-a]', host).forEach(el => {
      const [t, lv] = el.dataset.a.split(':'), have = g.reduce((n, x) => n + (x.levels ? x.levels[t][lv - 1] : 0), 0);
      el.textContent = g.length ? `có ${have}` : ''; el.style.color = g.length && m[t][lv] > have ? '#b91c1c' : '#667085';
    });
    ['mcq', 'tf', 'short'].forEach(t => { tot[t] = Object.values(m[t]).reduce((x, y) => x + y, 0); });
    const n = tot.mcq + tot.tf + tot.short, pts = tot.mcq * R.points.mcq + tot.tf * R.points.tf + tot.short * R.points.short, min = tot.mcq * R.minutes.mcq + tot.tf * R.minutes.tf + tot.short * R.minutes.short;
    const sm = $('#psum', host); if (sm) sm.textContent = `Tổng ${n} câu · điểm tối đa ${fmtScore(Math.round(pts * 100) / 100)} · thời gian ${min} phút`;
    const box = $('#avail', host); if (!box) return;
    box.textContent = g.length ? '' : 'Hãy tick ít nhất một chuyên đề.';
  };
  $$('[data-m]', host).forEach(el => el.oninput = upd); drawList();
  const st = $('#pstart', host);
  if (st) st.onclick = async () => {
    const groups = sel(), m = matrix();
    if (!groups.length) return toast('Hãy chọn ít nhất một chuyên đề');
    if (Object.values(m).reduce((n, r) => n + Object.values(r).reduce((x, y) => x + y, 0), 0) < 1) return toast('Hãy nhập số câu');
    st.disabled = true;
    try {
      const data = await api.post('/api/practice/start', {groups: groups.map(g => ({subject: g.subject, grade: g.grade, topic: g.topic})), matrix: m});
      if (data.note) toast('Lưu ý — ' + data.note);
      LBX.runExam(data, {submitUrl: `/api/practice/${data.id}/submit`, after: drawPractice});
    } catch (e) { toast(e.message); st.disabled = false; }
  };
  $$('[data-v]', host).forEach(b => b.onclick = async () => {
    try {
      const pid = +b.closest('tr').dataset.s, r = await api.get('/api/practice/' + pid), rep = await reportMap('practice', pid);
      const m = modal(`<h2>${esc(r.title)}</h2><p style="font-size:13px">${r.points ? `Điểm: <b>${fmtScore(r.score)}</b>/${fmtScore(r.max)} (thang 10: ${fmtScore(r.score10)})` : `Điểm: <b>${fmtScore(r.score10)}</b>/10 · đúng ${fmtScore(r.score)}/${r.max} câu`} · thời gian ${mmss(r.spent_sec || 0)}${r.duration_min ? ` / ${r.duration_min} phút` : ''}</p><div style="max-height:60vh;overflow:auto">${LBX.reviewHTML(r.questions, r.details, undefined, rep)}</div>`, true);
      attachReports(m.b, {source: 'practice', source_id: pid, questions: r.questions, details: r.details, redraw: () => { m.close(); b.click(); }});
    } catch (e) { toast(e.message); }
  });
}

/* ---------- Điểm của tôi: thưởng/phạt trong tháng (bài kiểm tra, luyện tập, đi muộn, bài quá hạn không làm) ---------- */
let ptMonth = null;
async function drawPoints() {
  const host = $('#v-points');
  host.innerHTML = '<div class="card empty">Đang tải...</div>';
  let r;
  try { r = await api.get('/api/points/me' + (ptMonth ? '?month=' + ptMonth : '')); } catch (e) { host.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  ptMonth = r.month;
  const ml = m => m.slice(5) + '/' + m.slice(0, 4), n = v => Math.abs(v).toLocaleString('vi-VN'), sg = v => (v > 0 ? '+' : v < 0 ? '−' : '') + n(v), col = v => v < 0 ? '#b91c1c' : v > 0 ? '#166534' : '#667085';
  const P = r.parts, ru = r.rules;
  const row = (icon, label, val, note) => `<tr><td style="width:34px;font-size:20px">${icon}</td><td><b>${label}</b><div style="font-size:11px;color:#667085">${note}</div></td><td style="text-align:right;white-space:nowrap"><b style="color:${col(val)};font-size:16px">${sg(val)}</b></td></tr>`;
  host.innerHTML = `<div class="grid2" style="grid-template-columns:minmax(300px,420px) 1fr"><div class="card">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><h2 style="margin:0;font-size:18px">⭐ Điểm của tôi</h2>
        <select id="pt-m" style="margin-left:auto;padding:6px;border:1px solid var(--line);border-radius:8px">${r.history.map(h => `<option value="${h.month}" ${h.month === r.month ? 'selected' : ''}>Tháng ${ml(h.month)}</option>`).join('')}</select></div>
      <div style="font-size:12px;color:#667085">Điểm ròng tháng ${ml(r.month)}</div>
      <div style="font-size:38px;font-weight:800;color:${r.net < 0 ? '#b91c1c' : '#2a2b86'};line-height:1.2">${sg(r.net)} <small style="font-size:14px;font-weight:400;color:#667085">điểm</small></div>
      <table class="tbl" style="margin-top:10px;font-size:13px">
        ${row('🏆', 'Thưởng bài kiểm tra', P.tests, `Bài giáo viên giao đạt từ ${String(ru.reward_min).replace('.', ',')}/10: +${n(ru.reward_amount)} mỗi bài`)}
        ${row('🎯', 'Thưởng tự luyện tập', P.practice, 'Cộng khi làm đúng câu trong bài tự luyện')}
        ${row('⏰', 'Phạt đi muộn', P.late, r.late_min ? `${r.late_min} phút muộn × ${n(ru.late_fee)} điểm/phút` : 'Không đi muộn')}
        ${r.adjusts.length ? row('✏️', 'Giáo viên điều chỉnh', P.adjust, `${r.adjusts.length} khoản điều chỉnh (xem chi tiết bên cạnh)`) : ''}
        ${row('🚫', 'Phạt vi phạm trong buổi', P.discipline, r.discipline.length ? `${r.discipline.reduce((n, x) => n + x.times, 0)} lần × ${n(ru.discipline_fee)} điểm` : `Mất trật tự, dùng điện thoại, ăn quà vặt: mỗi lần trừ ${n(ru.discipline_fee)} điểm`)}
        ${row('⛔', 'Phạt không làm bài', P.missed, r.missed.length ? `${r.missed.length} bài quá hạn chưa nộp` : `Bài quá hạn mà chưa nộp bị trừ ${n(ru.missed_penalty)} điểm/bài`)}
      </table>
      <div style="font-size:11px;color:#475467;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin-top:10px;line-height:1.5">
        <b>Luật:</b> mỗi bài được giao có hạn nộp mà đến hạn bạn <b>chưa nộp</b> thì bị trừ <b>${n(ru.missed_penalty)} điểm</b>. Nộp đúng hạn thì không bị trừ; nếu giáo viên gia hạn, điểm bị trừ được tính lại. Điểm tính theo từng tháng.</div></div>
    <div class="card"><h2 style="margin:0 0 10px;font-size:18px">Chi tiết tháng ${ml(r.month)}</h2>
      ${r.missed.length ? `<b style="font-size:13px;color:#b91c1c">Bài quá hạn chưa nộp</b><table class="tbl" style="margin:4px 0 14px;font-size:12px"><tr><th>Bài</th><th>Hạn nộp</th><th style="text-align:right">Điểm</th></tr>${r.missed.map(m => `<tr><td>${esc(m.title)}</td><td>${fmtDate(m.due_at)}</td><td style="text-align:right;color:#b91c1c"><b>−${n(m.amount)}</b></td></tr>`).join('')}</table>` : ''}
      ${r.discipline.length ? `<b style="font-size:13px;color:#b91c1c">Vi phạm trong buổi học</b><table class="tbl" style="margin:4px 0 14px;font-size:12px"><tr><th>Ngày</th><th>Mất trật tự</th><th>Dùng điện thoại</th><th>Ăn quà vặt</th><th style="text-align:right">Điểm</th></tr>${r.discipline.map(x => `<tr><td>${x.date.slice(8, 10)}/${x.date.slice(5, 7)}</td><td>${x.noisy}</td><td>${x.phone}</td><td>${x.snack}</td><td style="text-align:right;color:#b91c1c"><b>−${n(x.amount)}</b></td></tr>`).join('')}</table>` : ''}
      ${r.adjusts.length ? `<b style="font-size:13px;color:#2a2b86">Giáo viên điều chỉnh</b><table class="tbl" style="margin:4px 0 14px;font-size:12px"><tr><th>Lý do</th><th>Lúc</th><th style="text-align:right">Điểm</th></tr>${r.adjusts.map(a => `<tr><td>${esc(a.reason)}</td><td>${fmtDate(a.at)}</td><td style="text-align:right;color:${col(a.amount)}"><b>${sg(a.amount)}</b></td></tr>`).join('')}</table>` : ''}
      ${r.tests.length ? `<b style="font-size:13px;color:#166534">Bài kiểm tra được thưởng</b><table class="tbl" style="margin:4px 0 14px;font-size:12px"><tr><th>Bài</th><th>Điểm</th><th style="text-align:right">Thưởng</th></tr>${r.tests.map(t => `<tr><td>${esc(t.title)}</td><td>${fmtScore(t.score10)}/10</td><td style="text-align:right;color:#166534"><b>+${n(t.amount)}</b></td></tr>`).join('')}</table>` : ''}
      ${r.practice.length ? `<b style="font-size:13px;color:#b45309">Điểm cộng luyện tập</b><table class="tbl" style="margin:4px 0 14px;font-size:12px"><tr><th>Bài</th><th>Lúc</th><th style="text-align:right">Thưởng</th></tr>${r.practice.map(p => `<tr><td>${esc(p.title)}</td><td>${fmtDate(p.at)}</td><td style="text-align:right;color:#b45309"><b>+${n(p.points)}</b></td></tr>`).join('')}</table>` : ''}
      ${!r.missed.length && !r.tests.length && !r.practice.length && !r.late_min && !r.adjusts.length && !r.discipline.length ? '<div class="empty">Tháng này chưa có điểm thưởng hay điểm phạt nào.</div>' : ''}
      <b style="font-size:13px">Các tháng gần đây</b><table class="tbl" style="margin-top:4px;font-size:12px">${r.history.map(h => `<tr><td>Tháng ${ml(h.month)}</td><td style="text-align:right"><b style="color:${col(h.net)}">${sg(h.net)}</b></td></tr>`).join('')}</table></div></div>`;
  $('#pt-m', host).onchange = e => { ptMonth = e.target.value; drawPoints(); };
}

$$('#stabs button').forEach(b => b.onclick = () => {
  $$('#stabs button').forEach(x => x.classList.toggle('on', x === b));
  $('#v-assigned').hidden = b.dataset.t !== 'assigned'; $('#v-practice').hidden = b.dataset.t !== 'practice'; $('#v-points').hidden = b.dataset.t !== 'points';
  if (b.dataset.t === 'practice') drawPractice();
  if (b.dataset.t === 'points') drawPoints();
});

draw();
const hashTab = () => { const t = location.hash.slice(1); if (t === 'practice' || t === 'points') { const b = $('#stabs [data-t="' + t + '"]'); if (b) b.click(); } };
hashTab();
window.addEventListener('hashchange', hashTab);
})();
