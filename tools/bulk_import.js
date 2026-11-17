#!/usr/bin/env node
/* Công cụ import hàng loạt chuyên đề vào ngân hàng câu hỏi của Learning by AI.

   Dùng đúng đường import của giao diện web (đọc PDF, cắt ảnh từng câu, phân dạng) nên kết quả giống hệt khi bấm tay, nhưng tự chạy cho cả thư mục.
   File chuyên đề thường KHÔNG có đáp án → đáp án do Claude giải từ ảnh các câu rồi nạp lại bằng lệnh `apply` (thay cho "Nhập nhanh đáp án").

   Lệnh:
     status                                  chuyên đề nào đã có trên web, bao nhiêu câu, bao nhiêu câu còn thiếu đáp án
     import <thư mục|file.pdf ...>           import tự động. Tùy chọn: --only 05,06  --again (import lại cả chuyên đề đã có)
                                             --subject Toán  --grade 9  (mặc định Toán / 9)
     sheets <số chuyên đề>                   xuất ảnh tổng hợp các câu CHƯA có đáp án (--all: cả câu đã có) vào --out <thư mục> để Claude đọc & giải
     apply <file đáp án>                     nạp đáp án (định dạng xem dưới). Tùy chọn: --dry (chỉ xem trước)  --force (ghi đè đáp án đã có)

   Kết nối (KHÔNG ghi mật khẩu vào lệnh hay mã — đặt trong biến môi trường của máy):
     LBAI_URL    địa chỉ web (mặc định https://learning-by-ai.onrender.com)
     LBAI_USER   tên đăng nhập giáo viên / quản trị
     LBAI_PASS   mật khẩu
   --local       chạy trên một máy chủ tạm của máy này với dữ liệu thử (không đụng web thật) — dùng để kiểm tra công cụ.

   File đáp án (.txt), mỗi dòng một dạng; số thứ tự tính theo từng dạng trong chuyên đề, đúng như ảnh `sheets` đã đánh số:
     CHUYEN-DE: 05
     TN: 1A;2B;3C;4D
     DS: 1ĐĐSS;2SĐĐS
     TLN: 1.0,4;2.123;3.-5
*/
'use strict';
const {spawn} = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');

// ---------- tham số ----------
const argv = process.argv.slice(2), cmd = argv.shift();
const flag = (n, d) => { const i = argv.indexOf('--' + n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, v && !v.startsWith('--') ? 2 : 1); return v && !v.startsWith('--') ? v : true; };
const bool = n => { const i = argv.indexOf('--' + n); if (i < 0) return false; argv.splice(i, 1); return true; };
const LOCAL = bool('local'), AGAIN = bool('again'), FORCE = bool('force'), DRY = bool('dry'), ALL = bool('all');
const ONLY = (flag('only', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const SUBJECT = flag('subject', 'Toán'), GRADE = String(flag('grade', '9')), OUT = flag('out', path.join(__dirname, '_work'));
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const die = m => { console.error('LỖI: ' + m); process.exit(1); };

let BASE = (flag('url', process.env.LBAI_URL) || 'https://learning-by-ai.onrender.com').replace(/\/$/, '');
let USER = process.env.LBAI_USER || '', PASS = process.env.LBAI_PASS || '';
const cleanup = [];
process.on('exit', () => cleanup.forEach(f => { try { f(); } catch (e) { /* bỏ qua */ } }));

// ---------- máy chủ tạm (--local) ----------
async function startLocal() {
  // dữ liệu thử giữ nguyên giữa các lần chạy (để thử cả chuỗi import → sheets → apply); nằm ở thư mục tạm, KHÔNG nằm trong dự án
  const dir = path.join(os.tmpdir(), 'lbai_bulk_local'), pwFile = path.join(dir, 'pw'), fresh = !fs.existsSync(pwFile);
  fs.mkdirSync(path.join(dir, 'data'), {recursive: true});
  if (fresh) fs.writeFileSync(pwFile, 'Aa1-' + crypto.randomBytes(9).toString('base64url'));
  const port = 5300 + Math.floor(Math.random() * 300);
  const env = {...process.env, LBAI_DATA: path.join(dir, 'data'), LBAI_PORT: String(port), LBAI_QUIET: '1', LBAI_NO_BROWSER: '1'};
  Object.keys(env).filter(k => k.startsWith('LBAI_BACKUP')).forEach(k => delete env[k]);   // chế độ thử không bao giờ chạm kho sao lưu thật
  const srv = spawn('python', ['-m', 'server'], {cwd: ROOT, env, stdio: 'ignore'});
  cleanup.push(() => srv.kill());
  BASE = `http://localhost:${port}`; USER = 'giaovien'; PASS = fs.readFileSync(pwFile, 'utf8');
  for (let i = 0; i < 80; i++) { try { await fetch(BASE + '/api/status'); break; } catch (e) { await sleep(250); } }
  if (fresh) {
    const r = await fetch(BASE + '/api/setup', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Requested-With': 'fetch'}, body: JSON.stringify({name: 'GV thử', username: USER, password: PASS})});
    if (!r.ok) die('không tạo được tài khoản thử: ' + r.status);
  }
}

// ---------- API ----------
class Api {
  constructor() { this.cookie = ''; }
  async call(method, p, body) {
    const r = await fetch(BASE + p, {method, headers: {'Content-Type': 'application/json', 'X-Requested-With': 'fetch', ...(this.cookie ? {Cookie: this.cookie} : {})}, body: body === undefined ? undefined : JSON.stringify(body)});
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    if (sc.length) this.cookie = sc.map(c => c.split(';')[0]).join('; ');
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) { /* không phải JSON */ }
    if (!r.ok) throw new Error(`${r.status} ${(j && j.error) || txt.slice(0, 120)}`);
    return j;
  }
  async wake() {   // gói free của Render "ngủ" khi không có người dùng: chờ máy chủ dậy (tối đa ~2 phút)
    for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE + '/api/status'); if (r.ok) return; } catch (e) { /* chưa dậy */ } await sleep(2000); }
    die('máy chủ không phản hồi: ' + BASE);
  }
  async login() {
    await this.wake();
    try { await this.call('POST', '/api/login', {username: USER, password: PASS}); }
    catch (e) { die('đăng nhập thất bại (' + e.message.replace(PASS, '***') + '). Kiểm tra LBAI_USER / LBAI_PASS.'); }
  }
  bank() { return this.call('GET', '/api/bank').then(r => r.questions); }
}
function needCreds() {
  if (!USER || !PASS) die('chưa có thông tin đăng nhập. Hãy đặt biến môi trường LBAI_USER và LBAI_PASS (không gõ mật khẩu vào lệnh):\n  PowerShell:  setx LBAI_USER "tên"   rồi   setx LBAI_PASS "mật khẩu"   → mở lại cửa sổ dòng lệnh / VS Code.');
}

// ---------- trình duyệt (Chrome không giao diện, điều khiển qua CDP) ----------
async function browser() {
  const chromePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
  if (!chromePath) die('không tìm thấy Chrome (đặt biến CHROME_PATH).');
  const dp = 10100 + Math.floor(Math.random() * 800), ud = fs.mkdtempSync(path.join(os.tmpdir(), 'lbai_chr_'));
  const ch = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + dp, '--user-data-dir=' + ud, '--window-size=1300,1000', 'about:blank'], {stdio: 'ignore'});
  cleanup.push(() => ch.kill());
  let tabs;
  for (let i = 0; i < 100; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${dp}/json`)).json(); if (tabs.length) break; } catch (e) { /* chưa sẵn sàng */ } await sleep(300); }
  if (!tabs) die('Chrome không khởi động.');
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {};
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({id: i, method, params})); });
  const b = {
    send,
    async ev(expr) { const r = await send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true}); if (r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || r.result.exceptionDetails.text).slice(0, 300)); return r.result.result.value; },
    async nav(p) { await send('Page.navigate', {url: BASE + p}); await sleep(1200); },
    async waitFor(expr, sec, what) { for (let i = 0; i < sec * 2; i++) { if (await b.ev(expr)) return; await sleep(500); } throw new Error('quá thời gian chờ: ' + what); },
    async files(sel, list) { const doc = (await send('DOM.getDocument')).result.root.nodeId; const n = (await send('DOM.querySelector', {nodeId: doc, selector: sel})).result.nodeId; await send('DOM.setFileInputFiles', {nodeId: n, files: list}); }
  };
  await send('Page.enable'); await send('Runtime.enable');
  await b.nav('/login.html');
  const ok = await b.ev(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'fetch'},body:JSON.stringify(${JSON.stringify({username: USER, password: PASS})})}).then(r=>r.ok)`);
  if (!ok) die('trình duyệt không đăng nhập được.');
  return b;
}

// ---------- chuyên đề ----------
const stemOf = f => path.basename(f).replace(/\.pdf$/i, '').trim();
const numOf = s => { const m = /^\s*0*(\d{1,3})\b/.exec(s); return m ? +m[1] : null; };
const hasAns = q => { const a = q.ans; return a !== null && a !== undefined && a !== '' && !(Array.isArray(a) && a.some(v => v === null || v === undefined)); };
const isTfg = q => Array.isArray(q.sts) && q.sts.length === 4;
const KINDS = {TN: q => q.t === 'mcq', DS: isTfg, TLN: q => q.t === 'short'};
function chapterOf(bank, id) {
  const n = numOf(String(id));
  if (n === null) die('hãy nhập số chuyên đề, ví dụ 05');
  const srcs = [...new Set(bank.filter(q => numOf(q.src || q.topic || '') === n).map(q => q.src || q.topic))];
  if (!srcs.length) die(`trên web chưa có chuyên đề ${id}. Hãy chạy import trước.`);
  if (srcs.length > 1) die(`có nhiều nguồn khớp số ${id}: ${srcs.join(' | ')}`);
  return {src: srcs[0], qs: bank.filter(q => (q.src || q.topic) === srcs[0])};
}

// ---------- lệnh: status ----------
async function cStatus(api) {
  const bank = await api.bank(), g = new Map();
  bank.forEach(q => { const k = q.topic || q.src || '(chưa có chuyên đề)'; const s = g.get(k) || {n: 0, tn: 0, ds: 0, tln: 0, other: 0, miss: 0}; s.n++; s.miss += hasAns(q) ? 0 : 1; if (q.t === 'mcq') s.tn++; else if (isTfg(q)) s.ds++; else if (q.t === 'short') s.tln++; else s.other++; g.set(k, s); });
  console.log(`Ngân hàng trên ${BASE}: ${bank.length} câu\n`);
  console.log('Chuyên đề'.padEnd(64) + 'Tổng  TN  ĐS  TLN  Thiếu đáp án');
  [...g].sort((a, b) => a[0].localeCompare(b[0], 'vi', {numeric: true})).forEach(([k, s]) => console.log(k.slice(0, 62).padEnd(64) + `${String(s.n).padStart(4)} ${String(s.tn).padStart(3)} ${String(s.ds).padStart(3)} ${String(s.tln).padStart(4)}  ${s.miss ? s.miss : '-'}`));
}

// ---------- lệnh: import ----------
async function cImport(api, inputs) {
  let files = [];
  for (const p of inputs) { const st = fs.statSync(p); files.push(...(st.isDirectory() ? fs.readdirSync(p).filter(f => /\.pdf$/i.test(f)).map(f => path.join(p, f)) : [p])); }
  files = files.map(f => path.resolve(f)).sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'vi', {numeric: true}));
  if (ONLY.length) files = files.filter(f => ONLY.some(o => numOf(path.basename(f)) === numOf(o)));
  if (!files.length) die('không có file PDF nào phù hợp.');
  const bank = await api.bank(), have = new Map();
  bank.forEach(q => have.set(q.src, (have.get(q.src) || 0) + 1));
  const b = await browser(), report = [];
  for (const [i, f] of files.entries()) {
    const name = path.basename(f), tag = `[${i + 1}/${files.length}] ${name}`;
    if (have.get(name) && !AGAIN) { console.log(`${tag}: đã có ${have.get(name)} câu trên web — bỏ qua (thêm --again để import lại; câu trùng vẫn không bị nhân đôi)`); report.push({file: name, skipped: have.get(name)}); continue; }
    try {
      console.log(`${tag}: đang import...`);
      await b.nav('/teacher-builder.html');
      await b.waitFor(`!!document.querySelector('[data-act=import-pdf]')`, 60, 'trang xây đề');
      await b.ev(`document.querySelector('[data-act=import-pdf]').click(),1`);
      await b.waitFor(`!!document.querySelector('#si-f')`, 20, 'hộp import');
      await b.ev(`(()=>{const s=document.querySelector('#si-s'),g=document.querySelector('#si-g');s.value=${JSON.stringify(SUBJECT)};g.value=${JSON.stringify(GRADE)};document.querySelector('#si-tp').value=${JSON.stringify(stemOf(f))};return [s.value,g.value]})()`);
      await b.files('#si-f', [f]); await sleep(500);
      await b.ev(`document.querySelector('#si-go').click(),1`);
      const t0 = Date.now();
      await b.waitFor(`!!(document.querySelector('#idone')||{}).innerHTML`, 900, 'import ' + name);
      const log = await b.ev(`document.querySelector('#il').innerText`), done = await b.ev(`document.querySelector('#idone').innerText`);
      const m = /✓ .*?: (\d+) câu — (\d+) trắc nghiệm · (\d+) đúng\/sai · (\d+) trả lời ngắn · (\d+) tự luận; thêm mới (\d+)/.exec(log), err = /✗ .*/.exec(log), na = /⚠ (\d+) câu chưa đọc được đáp án/.exec(done);
      const r = m ? {file: name, total: +m[1], tn: +m[2], ds: +m[3], tln: +m[4], essay: +m[5], added: +m[6], noAns: na ? +na[1] : 0, sec: Math.round((Date.now() - t0) / 1000)} : {file: name, error: err ? err[0] : 'không đọc được kết quả'};
      report.push(r);
      console.log(m ? `   ✓ ${r.total} câu (${r.tn} TN · ${r.ds} ĐS · ${r.tln} TLN${r.essay ? ' · ' + r.essay + ' tự luận' : ''}); thêm mới ${r.added}; chưa có đáp án ${r.noAns}; ${r.sec}s` : `   ✗ ${r.error}`);
    } catch (e) { report.push({file: name, error: e.message}); console.log('   ✗ ' + e.message); }
  }
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(path.join(OUT, 'import_report.json'), JSON.stringify(report, null, 1));
  const bad = report.filter(r => r.error);
  console.log(`\nXong: ${report.filter(r => r.added !== undefined).length} chuyên đề đã import, ${report.filter(r => r.skipped).length} bỏ qua, ${bad.length} lỗi. Báo cáo: ${path.join(OUT, 'import_report.json')}`);
  if (bad.length) process.exitCode = 1;
}

// ---------- lệnh: sheets ----------
async function cSheets(api, id) {
  const bank = await api.bank(), {src, qs} = chapterOf(bank, id);
  const items = [];
  for (const [kind, f] of Object.entries(KINDS)) qs.filter(f).forEach((q, k) => { if (ALL || !hasAns(q)) items.push({kind, n: k + 1, id: q.id, img: q.img || null, text: String(q.q || '').replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim(), sts: q.sts || null, opts: q.opts || null}); });
  if (!items.length) { console.log('Không còn câu nào thiếu đáp án trong chuyên đề này.'); return; }
  const b = await browser(), dir = path.join(OUT, String(numOf(src)).padStart(2, '0')); fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
  await b.nav('/login.html');
  const pages = JSON.parse(await b.ev(`(async()=>{
    const items=${JSON.stringify(items)}, W=1000, MAXH=2300, LAB={TN:'TRẮC NGHIỆM',DS:'ĐÚNG/SAI',TLN:'TRẢ LỜI NGẮN'}, pages=[]; let cur=null, y=0;
    const newPage=()=>{const c=document.createElement('canvas');c.width=W;c.height=MAXH;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,W,MAXH);cur={c,g,items:[]};y=0;pages.push(cur)};
    const wrap=(g,t,w)=>{const out=[];let l='';for(const word of t.split(' ')){const n=l?l+' '+word:word;if(g.measureText(n).width>w&&l){out.push(l);l=word}else l=n}if(l)out.push(l);return out};
    for(const it of items){
      let bmp=null, h=0, lines=[];
      if(it.img){const r=await fetch('/api/img/'+it.img,{credentials:'same-origin'});bmp=await createImageBitmap(await r.blob());const s=Math.min(1,(W-20)/bmp.width);it.w=bmp.width*s;h=bmp.height*s}
      else{const g0=document.createElement('canvas').getContext('2d');g0.font='18px sans-serif';lines=wrap(g0,[it.text,...(it.opts||[]).map((o,i)=>'ABCD'[i]+'. '+o),...(it.sts||[]).map((o,i)=>'abcd'[i]+') '+o)].join('  '),W-30);h=lines.length*26+10}
      const need=h+44; if(!cur||y+need>MAXH) newPage();
      cur.g.fillStyle='#1e3a8a';cur.g.fillRect(0,y,W,26);cur.g.fillStyle='#fff';cur.g.font='bold 16px sans-serif';cur.g.fillText(LAB[it.kind]+' · CÂU '+it.n,10,y+18);
      y+=30;
      if(bmp){cur.g.drawImage(bmp,10,y,it.w,h)}else{cur.g.fillStyle='#000';cur.g.font='18px sans-serif';lines.forEach((l,i)=>cur.g.fillText(l,15,y+22+i*26))}
      y+=h+14; cur.items.push({kind:it.kind,n:it.n,id:it.id});
      cur.g.strokeStyle='#cbd5e1';cur.g.beginPath();cur.g.moveTo(0,y-6);cur.g.lineTo(W,y-6);cur.g.stroke();
      cur.h=y;
    }
    return JSON.stringify(pages.map(p=>{const o=document.createElement('canvas');o.width=W;o.height=Math.ceil(p.h);o.getContext('2d').drawImage(p.c,0,0);return {items:p.items,data:o.toDataURL('image/jpeg',0.85)}}));
  })()`));
  const index = [];
  pages.forEach((p, i) => { const fn = `sheet${String(i + 1).padStart(2, '0')}.jpg`; fs.writeFileSync(path.join(dir, fn), Buffer.from(p.data.split(',')[1], 'base64')); index.push({sheet: fn, items: p.items}); });
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({chapter: src, items: index}, null, 1));
  const cnt = k => items.filter(i => i.kind === k).length;
  console.log(`Chuyên đề: ${src}\nCần đáp án: ${cnt('TN')} TN · ${cnt('DS')} ĐS · ${cnt('TLN')} TLN → ${pages.length} ảnh trong ${dir}`);
}

// ---------- lệnh: apply ----------
function parseKey(kind, raw) {   // cùng định dạng “Nhập nhanh đáp án” của giao diện
  const map = new Map(), bad = [];
  if (kind === 'TLN') {
    raw.split(/[;\n]+/).map(s => s.trim()).filter(Boolean).forEach(it => { const m = /^(\d+)\s*[.:)=]\s*(.+)$/.exec(it); if (!m) return bad.push(it); map.set(+m[1], m[2].trim()); });
    return {map, bad};
  }
  const txt = raw.toUpperCase().replace(/ĐÚNG/g, 'Đ').replace(/SAI/g, 'S');
  if (kind === 'TN') { for (const m of txt.matchAll(/(\d+)\s*[.:)\-]?\s*([A-D])(?![A-ZÀ-Ỵ])/g)) map.set(+m[1], 'ABCD'.indexOf(m[2])); return {map, bad}; }
  let items = txt.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
  if (items.length === 1) items = [...txt.replace(/\s+/g, '').matchAll(/\d+[.:)\-]?[ĐS]{4}/g)].map(m => m[0]);
  items.forEach(it => { const m = /^(\d+)\s*[.:)\-]?\s*(.*)$/.exec(it); if (!m) return bad.push(it); const cs = m[2].match(/[ĐS]/g) || []; if (cs.length !== 4) return bad.push(it); map.set(+m[1], cs.map(c => c === 'Đ' ? 0 : 1)); });
  return {map, bad};
}
async function cApply(api, file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  let chap = null; const raw = {TN: [], DS: [], TLN: []};
  for (const l of lines) {
    const m = /^\s*(CHUYEN-?DE|CHUYÊN ĐỀ)\s*:\s*(.+)$/i.exec(l); if (m) { chap = m[2].trim(); continue; }
    const k = /^\s*(TN|ĐS|DS|TLN)\s*:\s*(.*)$/i.exec(l); if (k) raw[k[1].toUpperCase().replace('Đ', 'D')].push(k[2]);
  }
  if (!chap) die('file đáp án thiếu dòng “CHUYEN-DE: <số>”.');
  const bank = await api.bank(), {src, qs} = chapterOf(bank, chap), changes = [], skipped = [], diff = [], problems = [];
  for (const kind of ['TN', 'DS', 'TLN']) {
    if (!raw[kind].length) continue;
    const pool = qs.filter(KINDS[kind]), {map, bad} = parseKey(kind, raw[kind].join(';'));
    bad.forEach(x => problems.push(`${kind}: mục sai định dạng “${x}”`));
    for (const [n, v] of map) {
      if (n < 1 || n > pool.length) { problems.push(`${kind}: câu ${n} nằm ngoài 1–${pool.length}`); continue; }
      const q = pool[n - 1], same = JSON.stringify(q.ans) === JSON.stringify(v);
      if (hasAns(q) && !same) diff.push(`${kind} ${n}: đang là ${JSON.stringify(q.ans)} → file đáp án: ${JSON.stringify(v)}`);
      if (hasAns(q) && !FORCE) { if (!same) skipped.push(`${kind} ${n}`); continue; }
      if (!same) changes.push({...q, ans: v, _k: kind + ' ' + n});
    }
    const miss = pool.map((_, i) => i + 1).filter(n => !map.has(n) && !hasAns(pool[n - 1]));
    if (miss.length) problems.push(`${kind}: còn thiếu đáp án câu ${miss.join(', ')}`);
    console.log(`${kind}: ${map.size}/${pool.length} đáp án trong file`);
  }
  console.log(`\nChuyên đề: ${src}\nSẽ ghi ${changes.length} đáp án mới${DRY ? ' (CHẠY THỬ — chưa ghi gì)' : ''}.`);
  if (diff.length) console.log(`${diff.length} câu đã có đáp án KHÁC với file này${FORCE ? ' (đã ghi đè do --force)' : ' (giữ nguyên, thêm --force để ghi đè)'}:\n  ` + diff.join('\n  '));
  if (problems.length) console.log('Lưu ý:\n  ' + problems.join('\n  '));
  if (DRY || !changes.length) return;
  for (let i = 0; i < changes.length; i += 200) await api.call('POST', '/api/bank/sync', {upsert: changes.slice(i, i + 200).map(({_k, ...q}) => q)});
  const after = chapterOf(await api.bank(), chap).qs;
  console.log(`Đã lưu. Chuyên đề này còn ${after.filter(q => !hasAns(q)).length}/${after.length} câu chưa có đáp án.`);
}

// ---------- chạy ----------
(async () => {
  if (!['status', 'import', 'sheets', 'apply'].includes(cmd)) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^[^]*?\/\*/, '')); process.exit(cmd ? 1 : 0); }
  if (LOCAL) await startLocal(); else needCreds();
  const api = new Api(); await api.login();
  console.log(`Đã đăng nhập ${LOCAL ? '(máy chủ thử)' : ''} ${BASE}\n`);
  if (cmd === 'status') await cStatus(api);
  else if (cmd === 'import') { if (!argv.length) die('thiếu thư mục / file PDF.'); await cImport(api, argv); }
  else if (cmd === 'sheets') { if (!argv.length) die('thiếu số chuyên đề.'); await cSheets(api, argv[0]); }
  else { if (!argv.length) die('thiếu file đáp án.'); await cApply(api, argv[0]); }
  process.exit(process.exitCode || 0);
})().catch(e => { console.error('LỖI: ' + (e && e.message || e)); process.exit(1); });
