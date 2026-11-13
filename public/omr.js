/* omr.js — phiếu trả lời + chấm bài bằng ảnh chụp/scan (Optical Mark Recognition, chạy hoàn toàn trên trình duyệt).
 *
 * Phiếu có 4 mốc đen ở bốn góc để máy nắn lại ảnh bị nghiêng/xiên, 3 cột “mã đề” được in sẵn,
 * và các ô tròn để học sinh tô: trắc nghiệm A-B-C-D, đúng/sai 4 ý (Đ/S), trả lời ngắn (4 cột chữ số, dấu − và ,).
 * layout() cho toạ độ (mm) và được dùng chung cho cả việc VẼ phiếu lẫn ĐỌC ảnh nên hai bên luôn khớp nhau.
 */
(() => {
'use strict';
const W = 190, MK = 10;              // bề rộng phiếu (mm), cạnh mốc (mm)
const R = 1.9;                        // bán kính ô tròn (mm)
const SHORT_ROWS = ['−', ',', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const isTfg = q => Array.isArray(q.sts);
const kindOf = q => q.t === 'essay' ? null : isTfg(q) ? 'tfg' : q.t === 'short' ? 'short' : (q.opts && q.opts.length >= 2 ? 'mcq' : null);

/* ---------- bố cục ---------- */
function layout(qs) {
  const L = {W, H: 0, items: [], code: [], sections: [], labels: []};
  const lab = (x, y, t, sz, anchor, bold) => L.labels.push({x, y, t, sz: sz || 3, anchor: anchor || 'middle', bold: !!bold});
  let y = 76;                                             // vùng tiêu đề + mã đề chiếm 0..76
  for (let c = 0; c < 3; c++) for (let d = 0; d < 10; d++) L.code.push({col: c, digit: d, x: 152 + c * 9, y: 17 + d * 5.2});
  for (let d = 0; d < 10; d++) lab(147, 17 + d * 5.2 + 1, d, 2.6);   // số 0-9 bên trái cột mã đề
  const groups = {mcq: [], tfg: [], short: []};
  qs.forEach((q, i) => { const k = kindOf(q); if (k) groups[k].push(i); });

  if (groups.mcq.length) {
    const n = groups.mcq.length, rows = Math.ceil(n / 4), top = y;
    L.sections.push({y, title: 'PHẦN TRẮC NGHIỆM — mỗi câu tô MỘT ô'});
    const usedCols = Math.min(4, Math.ceil(n / rows));
    for (let col = 0; col < usedCols; col++) {
      const no = qs[groups.mcq[col * rows]].opts.length;
      for (let j = 0; j < no; j++) lab(6 + col * 46.5 + 14 + j * 7.4, top + 9.2, no === 2 ? 'ĐS'[j] : 'ABCDEF'[j], 2.8, 'middle', true);
    }
    groups.mcq.forEach((qi, t) => {
      const col = Math.floor(t / rows), row = t % rows, q = qs[qi], no = q.opts.length;
      const bx = 6 + col * 46.5, by = top + 13 + row * 5.4;
      lab(bx + 6, by + 1.1, qi + 1, 3, 'end', true);
      L.items.push({qi, kind: 'mcq', no: qi + 1, bubbles: Array.from({length: no}, (_, j) => ({opt: j, x: bx + 14 + j * 7.4, y: by}))});
    });
    y = top + 13 + rows * 5.4 + 2;
  }
  if (groups.tfg.length) {
    const top = y + 2;
    L.sections.push({y: top, title: 'PHẦN ĐÚNG / SAI — mỗi ý a, b, c, d tô Đ (đúng) HOẶC S (sai)'});
    groups.tfg.forEach((qi, t) => {
      const col = t % 2, row = Math.floor(t / 2), bx = 5 + col * 92, by = top + 17 + row * 11.5;
      lab(bx + 11, by + 1.1, 'Câu ' + (qi + 1), 3, 'end', true);
      const stmts = Array.from({length: 4}, (_, p) => {
        const sx = bx + 13 + p * 19;
        lab(sx, by + 1.1, 'abcd'[p] + ')', 3, 'start', true);
        lab(sx + 9, by - 2.8, 'Đ', 2.4); lab(sx + 15.5, by - 2.8, 'S', 2.4);
        return {p, d: {x: sx + 9, y: by}, s: {x: sx + 15.5, y: by}};
      });
      L.items.push({qi, kind: 'tfg', no: qi + 1, stmts});
    });
    y = top + 17 + Math.ceil(groups.tfg.length / 2) * 11.5 + 1;
  }
  if (groups.short.length) {
    const top = y + 2, per = 5;
    L.sections.push({y: top, title: 'PHẦN TRẢ LỜI NGẮN — viết đáp án vào ô, rồi tô từng cột (− dấu âm · , dấu phẩy)'});
    groups.short.forEach((qi, t) => {
      const col = t % per, row = Math.floor(t / per), bx = 5 + col * 34, by = top + 21 + row * 64;
      lab(bx, by - 12.5, 'Câu ' + (qi + 1), 3, 'start', true);
      for (let r = 0; r < SHORT_ROWS.length; r++) lab(bx + 3.5, by + r * 4.4 + 1, SHORT_ROWS[r], 2.4);
      L.items.push({qi, kind: 'short', no: qi + 1, box: {x: bx + 8, y: by - 10, w: 25, h: 6.5},
        cols: Array.from({length: 4}, (_, c) => ({c, rows: SHORT_ROWS.map((ch, r) => ({ch, x: bx + 11 + c * 6.2, y: by + r * 4.4}))}))});
    });
    y = top + 21 + Math.ceil(groups.short.length / per) * 64 - 8;
  }
  L.H = Math.max(y + 4, 120);
  L.markers = [[MK / 2, MK / 2], [W - MK / 2, MK / 2], [MK / 2, L.H - MK / 2], [W - MK / 2, L.H - MK / 2]];
  return L;
}

/* ---------- vẽ phiếu (SVG) ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
function sheetSVG(L, info) {
  info = info || {};
  const circ = (x, y, fill) => `<circle cx="${x}" cy="${y}" r="${R}" fill="${fill || '#fff'}" stroke="#000" stroke-width=".3"/>`;
  const txt = (x, y, t, sz, anchor, bold) => `<text x="${x}" y="${y}" font-size="${sz || 3}" font-family="Arial,sans-serif" text-anchor="${anchor || 'start'}"${bold ? ' font-weight="bold"' : ''}>${esc(t)}</text>`;
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.W} ${L.H}" width="${L.W}mm" height="${L.H}mm" class="omr-sheet-svg" style="display:block;margin:0 auto;max-height:277mm">`;
  o += `<rect x="0" y="0" width="${L.W}" height="${L.H}" fill="#fff"/>`;
  L.markers.forEach(([cx, cy]) => { o += `<rect x="${cx - MK / 2}" y="${cy - MK / 2}" width="${MK}" height="${MK}" fill="#000"/>`; });
  o += txt(L.W / 2 - 14, 19, 'PHIẾU TRẢ LỜI', 6, 'middle', true);
  o += txt(L.W / 2 - 14, 26, info.title || '', 3.2, 'middle');
  o += txt(14, 37, 'Họ và tên: ...........................................................', 3.4);
  o += txt(14, 46, 'Lớp: ...................   Ngày: .............................', 3.4);
  o += txt(14, 55, 'Trường: ................................................................', 3.4);
  o += txt(14, 66, 'Dùng bút mực đen hoặc bút chì đen tô kín ô tròn; không gấp, làm nhăn phiếu; không tô vào 4 ô vuông đen ở góc.', 2.5);
  o += txt(161, 13, 'MÃ ĐỀ (in sẵn)', 2.8, 'middle', true);
  const digits = String(info.code || '').replace(/\D/g, '').padStart(3, '0').slice(-3);
  L.code.forEach(b => { o += circ(b.x, b.y, digits[b.col] === String(b.digit) ? '#000' : '#fff'); });
  L.sections.forEach(s => { o += `<line x1="5" y1="${s.y}" x2="${L.W - 5}" y2="${s.y}" stroke="#000" stroke-width=".3"/>` + txt(6, s.y + 5, s.title, 3, 'start', true); });
  L.labels.forEach(l => { o += txt(l.x, l.y, l.t, l.sz, l.anchor, l.bold); });
  L.items.forEach(it => {
    if (it.kind === 'mcq') it.bubbles.forEach(b => { o += circ(b.x, b.y); });
    else if (it.kind === 'tfg') it.stmts.forEach(s => { o += circ(s.d.x, s.d.y) + circ(s.s.x, s.s.y); });
    else {
      o += `<rect x="${it.box.x}" y="${it.box.y}" width="${it.box.w}" height="${it.box.h}" fill="none" stroke="#000" stroke-width=".3"/>`;
      it.cols.forEach(col => col.rows.forEach(r => { o += circ(r.x, r.y); }));
    }
  });
  return o + '</svg>';
}

/* ---------- đọc ảnh ---------- */
function solve8(A, b) {                      // Gauss: giải hệ 8×8
  const n = 8, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function homography(src, dst) {              // src (mm) → dst (pixel)
  const A = [], b = [];
  src.forEach(([x, y], i) => {
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  });
  const h = solve8(A, b); if (!h) return null;
  return (x, y) => { const d = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d]; };
}
function binarize(cv, maxDim) {
  const sc = Math.min(1, maxDim / Math.max(cv.width, cv.height)), w = Math.round(cv.width * sc), h = Math.round(cv.height * sc);
  const t = document.createElement('canvas'); t.width = w; t.height = h;
  const g = t.getContext('2d', {willReadFrequently: true}); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(cv, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2];
  // ngưỡng thích nghi bằng ảnh tích phân (chịu được ánh sáng không đều)
  const iw = w + 1, I = new Float64Array(iw * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += gray[y * w + x]; I[(y + 1) * iw + x + 1] = I[y * iw + x + 1] + row; } }
  const s = Math.max(15, Math.round(w / 12)) | 1, hs = s >> 1, bin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - hs), y1 = Math.min(h, y + hs + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - hs), x1 = Math.min(w, x + hs + 1);
      const mean = (I[y1 * iw + x1] - I[y0 * iw + x1] - I[y1 * iw + x0] + I[y0 * iw + x0]) / ((x1 - x0) * (y1 - y0));
      bin[y * w + x] = gray[y * w + x] < mean * 0.78 || gray[y * w + x] < 55 ? 1 : 0;
    }
  }
  return {bin, w, h};
}
function components(bin, w, h) {            // gom các điểm đen liền nhau
  const lab = new Int32Array(w * h), out = [], stack = [];
  for (let i = 0; i < w * h; i++) {
    if (!bin[i] || lab[i]) continue;
    const id = out.length + 1; let minx = w, maxx = 0, miny = h, maxy = 0, n = 0, sx = 0, sy = 0;
    stack.push(i); lab[i] = id;
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p - x) / w;
      n++; sx += x; sy += y; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (x > 0 && bin[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack.push(p - 1); }
      if (x < w - 1 && bin[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && bin[p - w] && !lab[p - w]) { lab[p - w] = id; stack.push(p - w); }
      if (y < h - 1 && bin[p + w] && !lab[p + w]) { lab[p + w] = id; stack.push(p + w); }
    }
    out.push({n, minx, maxx, miny, maxy, cx: sx / n, cy: sy / n, w: maxx - minx + 1, h: maxy - miny + 1});
  }
  return out;
}
function findMarkers(comps, w, h) {
  const c = comps.filter(k => k.w >= 10 && k.w <= w / 4 && k.h >= 10 && k.h <= h / 4 && k.w / k.h > .6 && k.w / k.h < 1.65 && k.n / (k.w * k.h) > .8)
    .sort((a, b) => b.n - a.n).slice(0, 4);
  if (c.length < 4) return null;
  c.sort((a, b) => a.cy - b.cy);
  const top = c.slice(0, 2).sort((a, b) => a.cx - b.cx), bot = c.slice(2).sort((a, b) => a.cx - b.cx);
  return [top[0], top[1], bot[0], bot[1]].map(k => [k.cx, k.cy]);
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function readSheet(img, L, rot180) {
  const {bin, w, h} = img;
  let pts = img.markers;
  if (rot180) pts = [pts[3], pts[2], pts[1], pts[0]];
  const P = homography(L.markers, pts); if (!P) return null;
  const scale = dist(pts[0], pts[1]) / (L.W - MK);
  const rr = R * scale * 0.62;
  const frac = (x, y) => {
    const [px, py] = P(x, y); let dark = 0, n = 0;
    for (let dy = -rr; dy <= rr; dy += 1) for (let dx = -rr; dx <= rr; dx += 1) {
      if (dx * dx + dy * dy > rr * rr) continue;
      const ix = Math.round(px + dx), iy = Math.round(py + dy); if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue;
      n++; dark += bin[iy * w + ix];
    }
    return n ? dark / n : 0;
  };
  return {frac, scale};
}
// chọn 1 ô trong nhóm: trả {i, multi}; i = -1 nếu bỏ trống
function pick(fs) {
  const TH = 0.42, idx = fs.map((f, i) => [f, i]).sort((a, b) => b[0] - a[0]);
  if (idx[0][0] < TH) return {i: -1, multi: false};
  if (idx[1] && idx[1][0] >= TH && idx[1][0] > idx[0][0] * 0.7) return {i: -1, multi: true};
  return {i: idx[0][1], multi: false};
}

/* decode: nhận canvas ảnh chụp + danh sách bố cục của các mã đề (Ls) và mã đề tương ứng (codes: '101', '102'...)
   → {ok, vi, code, answers, issues}; answers căn theo thứ tự câu của mã đề vi. */
function decode(canvas, Ls, codes) {
  Ls = Array.isArray(Ls) ? Ls : [Ls];
  const img = binarize(canvas, 1700);
  const comps = components(img.bin, img.w, img.h);
  img.markers = findMarkers(comps, img.w, img.h);
  if (!img.markers) return {ok: false, error: 'Không thấy đủ 4 ô vuông đen ở góc phiếu. Hãy chụp rõ cả 4 góc, đủ sáng, không bị cắt.'};
  const L0 = Ls[0], sides = [dist(img.markers[0], img.markers[1]), dist(img.markers[0], img.markers[2])];
  const ratio = sides[0] / sides[1], want = (L0.W - MK) / (L0.H - MK);
  if (Math.abs(ratio - want) / want > 0.4 && Math.abs(1 / ratio - want) / want > 0.4)
    return {ok: false, error: 'Tỉ lệ phiếu trong ảnh không khớp (có thể ảnh bị cắt mất góc hoặc không phải phiếu của đề này).'};
  // thử từng nhóm bố cục (khác chiều cao phiếu) × hai chiều (phiếu có thể bị xoay 180°); chọn cách đọc ra mã đề hợp lệ
  let best = null; const tried = new Set();
  Ls.forEach((L, li) => {
    if (tried.has(L.H.toFixed(2))) return; tried.add(L.H.toFixed(2));
    for (const rot of [false, true]) {
      const rd = readSheet(img, L, rot); if (!rd) continue;
      const digs = [0, 1, 2].map(c => pick(L.code.filter(b => b.col === c).map(b => rd.frac(b.x, b.y))));
      const valid = digs.filter(d => d.i >= 0 && !d.multi).length, code = digs.map(d => d.i >= 0 ? d.i : '?').join('');
      const hit = codes ? Ls.findIndex((x, j) => Math.abs(x.H - L.H) < 0.01 && String(codes[j]).replace(/\D/g, '').padStart(3, '0').slice(-3) === code) : 0;
      const score = valid * 10 + (hit >= 0 ? 5 : 0);
      if (!best || score > best.score) best = {rd, rot, valid, code, hit, score};
    }
  });
  if (!best || best.valid < 3) return {ok: false, error: 'Không đọc được mã đề (có thể không phải phiếu của hệ thống hoặc ảnh quá mờ).'};
  const vi = best.hit >= 0 ? best.hit : 0, L = Ls[vi], {rd} = best, issues = [], answers = [];
  if (best.hit < 0) issues.push(`Mã đề đọc được (${best.code}) không khớp mã đề nào trong bộ đề — đang chấm theo ${codes ? codes[0] : 'mã đề đầu'}`);
  L.items.forEach(it => {
    if (it.kind === 'mcq') {
      const r = pick(it.bubbles.map(b => rd.frac(b.x, b.y)));
      answers[it.qi] = r.i >= 0 ? r.i : null; if (r.multi) issues.push(`Câu ${it.no}: tô nhiều ô`);
    } else if (it.kind === 'tfg') {
      answers[it.qi] = it.stmts.map(s => { const r = pick([rd.frac(s.d.x, s.d.y), rd.frac(s.s.x, s.s.y)]); if (r.multi) issues.push(`Câu ${it.no}${'abcd'[s.p]}: tô cả Đ và S`); return r.i >= 0 ? r.i : null; });
    } else {
      let str = '';
      it.cols.forEach(col => { const r = pick(col.rows.map(x => rd.frac(x.x, x.y))); if (r.multi) issues.push(`Câu ${it.no}: cột ${col.c + 1} tô nhiều ô`); if (r.i >= 0) str += col.rows[r.i].ch === '−' ? '-' : col.rows[r.i].ch; });
      answers[it.qi] = str === '' ? null : str;
    }
  });
  return {ok: true, vi, code: best.code, rotated: best.rot, answers, issues};
}

/* chấm điểm như server (để xem kết quả ngay trên trình duyệt) */
const TFG = [0, 0.1, 0.25, 0.5, 1];
const norm = s => String(s).trim().toLowerCase().replace(/−/g, '-').replace(/\s+/g, '').replace(',', '.').replace(/\.$/, '');
function sameShort(a, b) { const x = norm(a), y = norm(b); if (x === y) return true; const fx = Number(x), fy = Number(y); return x !== '' && y !== '' && isFinite(fx) && isFinite(fy) && Math.abs(fx - fy) < 1e-9; }
function hasKey(q) {
  if (q.t === 'essay') return false;
  if (isTfg(q)) return Array.isArray(q.ans) && q.ans.length === q.sts.length && q.ans.every(v => v === 0 || v === 1);
  if (q.t === 'short') return q.ans != null && String(q.ans).trim() !== '';
  return Number.isInteger(q.ans) && q.ans >= 0 && !!q.opts && q.ans < q.opts.length;
}
function grade(qs, answers) {
  let score = 0, max = 0; const per = [];
  qs.forEach((q, i) => {
    if (!hasKey(q)) { per.push(null); return; }
    const g = answers[i]; let sc;
    if (isTfg(q)) sc = TFG[Math.min(4, Array.isArray(g) ? q.ans.filter((k, j) => g[j] === k).length : 0)];
    else if (q.t === 'short') sc = g != null && g !== '' && sameShort(g, q.ans) ? 1 : 0;
    else sc = Number.isInteger(g) && g === q.ans ? 1 : 0;
    score += sc; max++; per.push(sc);
  });
  return {score: Math.round(score * 100) / 100, max, score10: max ? Math.round(score / max * 1000) / 100 : null, per};
}

window.OMR = {layout, sheetSVG, decode, grade, kindOf};
})();
