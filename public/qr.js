/* qr.js — tạo mã QR ngay trên trình duyệt, không cần thư viện ngoài hay Internet.
   Hỗ trợ chế độ byte (UTF-8), mức sửa lỗi M, phiên bản 1–10 (tối đa 213 byte — đủ cho địa chỉ đăng nhập).
   QR.svg(text, {px}) → chuỗi <svg>; QR.matrix(text) → mảng 2 chiều true = ô đen. */
(function (root) {
'use strict';
// mức M: [tổng codeword, codeword sửa lỗi mỗi khối, [[số khối, codeword dữ liệu mỗi khối], ...]]
const VER = [null,
  [26, 10, [[1, 16]]], [44, 16, [[1, 28]]], [70, 26, [[1, 44]]], [100, 18, [[2, 32]]], [134, 24, [[2, 43]]],
  [172, 16, [[4, 27]]], [196, 18, [[4, 31]]], [242, 22, [[2, 38], [2, 39]]], [292, 22, [[3, 36], [2, 37]]], [346, 26, [[4, 43], [1, 44]]]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// Trường GF(256), đa thức 0x11D
const EXP = new Array(512), LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsEc(data, n) {   // codeword sửa lỗi Reed–Solomon
  let g = [1];
  for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); g.forEach((c, j) => { ng[j] ^= c; ng[j + 1] ^= mul(c, EXP[i]); }); g = ng; }
  const r = data.concat(new Array(n).fill(0));
  for (let i = 0; i < data.length; i++) { const c = r[i]; if (c) for (let j = 0; j < g.length; j++) r[i + j] ^= mul(g[j], c); }
  return r.slice(data.length);
}

function codewords(bytes) {
  let v = 1;
  for (; v <= 10; v++) {
    const cap = VER[v][2].reduce((s, [n, k]) => s + n * k, 0);
    if (4 + (v < 10 ? 8 : 16) + 8 * bytes.length <= cap * 8) break;
  }
  if (v > 10) throw new Error('Nội dung quá dài để tạo mã QR');
  const [, ecn, groups] = VER[v], cap = groups.reduce((s, [n, k]) => s + n * k, 0), bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
  put(0, Math.min(4, cap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let p = 0; data.length < cap; p ^= 1) data.push(p ? 0x11 : 0xec);
  const blocks = []; let off = 0;
  groups.forEach(([n, k]) => { for (let i = 0; i < n; i++) { const d = data.slice(off, off + k); off += k; blocks.push({d, e: rsEc(d, ecn)}); } });
  const out = [], maxK = Math.max(...blocks.map(b => b.d.length));
  for (let i = 0; i < maxK; i++) blocks.forEach(b => { if (i < b.d.length) out.push(b.d[i]); });
  for (let i = 0; i < ecn; i++) blocks.forEach(b => out.push(b.e[i]));
  return {v, cw: out};
}

const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];

function build(v, cw, mask) {
  const n = 17 + 4 * v, M = [], F = [];   // M[y][x]: ô đen; F[y][x]: ô thuộc mẫu cố định
  for (let y = 0; y < n; y++) { M.push(new Array(n).fill(false)); F.push(new Array(n).fill(false)); }
  const set = (x, y, d) => { M[y][x] = d; F[y][x] = true; };
  for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy)); if (x >= 0 && x < n && y >= 0 && y < n) set(x, y, d !== 2 && d !== 4); } };
  finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
  const al = ALIGN[v], last = al.length - 1;
  al.forEach((ay, i) => al.forEach((ax, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  // thông tin định dạng (mức M = 00) + mặt nạ
  const fd = mask; let rem = fd; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const fb = ((fd << 10) | rem) ^ 0x5412, bit = (b, i) => ((b >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(fb, i));
  set(8, 7, bit(fb, 6)); set(8, 8, bit(fb, 7)); set(7, 8, bit(fb, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(fb, i));
  for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(fb, i));
  for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(fb, i));
  set(8, n - 8, true);
  if (v >= 7) {   // thông tin phiên bản
    let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const vb = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const a = n - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, bit(vb, i)); set(b, a, bit(vb, i)); }
  }
  // xếp dữ liệu theo đường zigzag từ góc dưới phải
  let k = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? n - 1 - vert : vert;
      if (!F[y][x] && k < cw.length * 8) { M[y][x] = ((cw[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; }
    }
  }
  const mf = MASKS[mask];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!F[y][x] && mf(x, y)) M[y][x] = !M[y][x];
  return M;
}

function penalty(M) {
  const n = M.length; let p = 0, dark = 0;
  const line = get => {
    let s = 0, run = 1, str = '';
    for (let i = 0; i < n; i++) {
      const c = get(i); str += c ? '1' : '0';
      if (i && c === get(i - 1)) run++; else { if (run >= 5) s += run - 2; run = 1; }
    }
    if (run >= 5) s += run - 2;
    const w = '0000' + str + '0000';
    for (let i = w.indexOf('1011101'); i >= 0; i = w.indexOf('1011101', i + 1)) if (w.slice(i - 4, i) === '0000' || w.slice(i + 7, i + 11) === '0000') s += 40;
    return s;
  };
  for (let i = 0; i < n; i++) { p += line(j => M[i][j]); p += line(j => M[j][i]); }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3; }
  M.forEach(r => r.forEach(c => { if (c) dark++; }));
  return p + 10 * Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n));
}

function matrix(text) {
  const {v, cw} = codewords([...new TextEncoder().encode(String(text))]);
  let best = null, bp = Infinity;
  for (let m = 0; m < 8; m++) { const M = build(v, cw, m), s = penalty(M); if (s < bp) { bp = s; best = M; } }
  return best;
}

// Mã QR luôn đen trên nền trắng (kể cả giao diện tối) để camera điện thoại đọc được; viền trắng 4 ô theo chuẩn
function svg(text, o) {
  o = o || {};
  const M = matrix(text), n = M.length, q = 4, size = n + 2 * q, px = o.px || 220;
  let d = '';
  M.forEach((r, y) => r.forEach((c, x) => { if (c) d += `M${x + q},${y + q}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="${String(o.label || 'Mã QR').replace(/[<>&"]/g, '')}" style="background:#fff;display:block"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

const QR = {matrix, svg, _rsEc: rsEc};
if (typeof module !== 'undefined' && module.exports) module.exports = QR; else root.QR = QR;
})(typeof window !== 'undefined' ? window : globalThis);
