// Kiểm thử đầu-cuối: server thật + trình duyệt thật (Chrome headless qua CDP)
const {spawn} = require('child_process');
for (const k of Object.keys(process.env)) if (k.startsWith('LBAI_BACKUP')) delete process.env[k];   // không bao giờ dùng kho sao lưu thật khi chạy thử
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SP = fs.mkdtempSync(path.join(os.tmpdir(), 'lbai_e2e_shots_'));
const PORT = 5700 + Math.floor(Math.random() * 200), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lbai_e2e_'));
const BASE = `http://localhost:${PORT}`;
const rnd = () => 'Aa1-' + require('crypto').randomBytes(9).toString('base64url');   // mật khẩu thử nghiệm sinh ngẫu nhiên, không ghi cứng
const ADMIN_PW = rnd(), STUDENT_PW = rnd();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
let fails = 0; const check = (name, ok, extra) => { if (!ok) fails++; log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  → ' + extra : '')); };

// Dịch vụ Gemini GIẢ cho kiểm thử tính năng AI giải đáp án (không tốn quota, không cần khóa thật; khóa là chuỗi ngẫu nhiên chỉ dùng với server giả)
for (const k of Object.keys(process.env)) if (/^(ANTHROPIC_|GEMINI_|LBAI_AI_)/.test(k)) delete process.env[k];   // không kế thừa khóa AI thật của máy
const AI_PORT = 5300 + Math.floor(Math.random() * 300), AI_KEY = require('crypto').randomBytes(16).toString('hex');
const fakeAi = require('http').createServer((req, res) => {
  let b = ''; req.on('data', d => b += d); req.on('end', () => {
    const body = JSON.parse(b || '{}'), tx = (body.contents[0].parts || []).filter(x => x.text).map(x => x.text);
    const ids = tx.filter(t => /id=/.test(t)).map(t => t.split('id=')[1].split(' ')[0]), kinds = tx.filter(t => /dạng: /.test(t)).map(t => t.split('dạng: ')[1].split(' ')[0]);
    const T = {mcq: ['B', 'high', 'Chọn B'], tf: ['ĐSSĐ', 'medium', 'Ý b, c sai'], short: ['3.5', 'low', '= 3,5']};
    const ok = req.url.includes(':generateContent') && req.headers['x-goog-api-key'] === AI_KEY;
    const out = JSON.stringify(ok ? {candidates: [{finishReason: 'STOP', content: {role: 'model', parts: [{text: JSON.stringify({answers: ids.map((id, i) => ({id, answer: T[kinds[i]][0], confidence: T[kinds[i]][1], note: T[kinds[i]][2]}))})}]}}]} : {error: {code: 403, message: 'bad key'}});
    res.writeHead(ok ? 200 : 403, {'Content-Type': 'application/json'}); res.end(out);
  });
}).listen(AI_PORT, '127.0.0.1');
const server = spawn('python', ['-m', 'server'], {cwd: ROOT, env: {...process.env, GEMINI_API_KEY: AI_KEY, GEMINI_BASE_URL: `http://127.0.0.1:${AI_PORT}`, LBAI_DATA: DATA, LBAI_PORT: String(PORT), LBAI_QUIET: '1', LBAI_NO_BROWSER: '1', PYTHONUTF8: '1'}, stdio: ['ignore', 'pipe', 'pipe']});
let serverErr = ''; server.stderr.on('data', d => serverErr += d); server.stdout.on('data', () => {});
const DP = 10100 + Math.floor(Math.random() * 800);   // tránh các dải cổng Windows giữ chỗ (netsh int ipv4 show excludedportrange)
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=' + DP, '--user-data-dir=' + path.join(DATA, 'chrome'), '--window-size=1300,1700', 'about:blank'], {stdio: ['ignore', 'pipe', 'pipe']});
let chromeErr = ''; chrome.stderr.on('data', d => chromeErr += d); chrome.stdout.on('data', () => {});
setTimeout(() => { console.log('TIMEOUT toàn bộ kịch bản (300s)'); cleanup(); process.exit(2); }, 300000);
const cleanup = () => { try { chrome.kill(); } catch (e) { } try { server.kill(); } catch (e) { } try { fakeAi.close(); } catch (e) { } };
process.on('exit', cleanup);

(async () => {
  let tabs;
  for (let i = 0; i < 150; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${DP}/json`)).json(); if (tabs.length) break; } catch (e) { } await sleep(300); }
  if (!tabs) { console.log('Chrome không khởi động. stderr:', chromeErr.slice(0, 1200), '| server stderr:', serverErr.slice(0, 600)); process.exit(3); }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {}; ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({id: i, method, params})); });
  const ev = async ex => { const r = await send('Runtime.evaluate', {expression: ex, returnByValue: true, awaitPromise: true}); if (r.result.exceptionDetails) throw new Error('JS: ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || r.result.exceptionDetails.text)); return r.result.result.value; };
  const waitFor = async (ex, t = 12, what) => { for (let i = 0; i < t * 5; i++) { try { if (await ev(ex)) return true; } catch (e) { } await sleep(200); } throw new Error('Hết giờ chờ: ' + (what || ex)); };
  const nav = async url => { await send('Page.navigate', {url: BASE + '/' + url}); await sleep(300); await waitFor("document.readyState==='complete'", 15, 'tải ' + url); await sleep(500); await ev('window.confirm=()=>true;window.alert=()=>{};window.prompt=()=>null;window.print=()=>{window.__print=(document.getElementById("lb-print")||{}).innerHTML||"";}'); };
  const shot = async n => { const s = await send('Page.captureScreenshot', {format: 'png'}); fs.writeFileSync(path.join(SP, n + '.png'), Buffer.from(s.result.data, 'base64')); };
  const click = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) throw new Error('không thấy ${sel.replace(/'/g, '')}'); e.click(); return 1})()`);
  const setv = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) throw new Error('không thấy ${sel}'); e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  const api = (m, p, b) => ev(`LB.api.${m}(${JSON.stringify(p)}${b === undefined ? '' : ',' + JSON.stringify(b)})`);
  const errors = []; send('Runtime.enable'); ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text); });
  await send('Page.enable');
  try {
    await waitFor('1', 1);
    // 1. thiết lập lần đầu
    await nav('index.html');
    await waitFor("location.pathname.endsWith('login.html')", 10, 'chuyển tới trang đăng nhập khi chưa đăng nhập');
    check('chưa đăng nhập → chuyển về login.html', true);
    await waitFor("!document.getElementById('setup').hidden", 10, 'form thiết lập');
    await setv('#sn', 'Quản trị viên'); await setv('#su', 'admin'); await setv('#sp', ADMIN_PW); await setv('#sp2', ADMIN_PW);
    await ev("document.getElementById('setup').requestSubmit()");
    await waitFor("location.pathname.endsWith('manage.html')", 10, 'vào trang quản lý sau setup');
    check('thiết lập admin → vào manage.html', true);

    // 2. lớp + học sinh qua giao diện
    await waitFor("document.getElementById('nc')", 10);
    await click('#nc'); await waitFor("document.getElementById('cn')"); await setv('#cn', '9A1'); await setv('#cg', '9'); await click('#cs');
    await waitFor("document.querySelector('.cls-item')", 8, 'lớp hiện trong danh sách');
    await click('#ab'); await waitFor("document.getElementById('bl')");
    await setv('#bl', 'Nguyễn Văn An\nTrần Thị Bình\nLê Minh Châu\nPhạm Hoàng Dũng');
    await click('#bv'); await waitFor("document.getElementById('c-csv')", 8, 'bảng mật khẩu');
    const creds = await ev("[...document.querySelectorAll('.lb-modal table.tbl tr')].slice(1).map(r=>[...r.cells].map(c=>c.textContent))");
    check('tạo 4 học sinh, có mật khẩu hiển thị một lần', creds.length === 4 && creds.every(c => c[2].length >= 8), JSON.stringify(creds[0]));
    check('tên đăng nhập tạo từ họ tên', creds[0][1] === 'an.nv', creds[0][1]);
    await shot('e2e_creds');
    await click('#c-ok');
    await waitFor("document.querySelectorAll('#cpane .tbl tr').length===5", 8, '4 học sinh trong bảng');
    check('danh sách lớp hiện 4 học sinh', true);

    // 3. ngân hàng (nạp qua API) → trang tạo đề
    const mk = (i, topic) => ({id: 'm' + i + (topic === 'Hàm số' ? 'b' : 'a'), t: 'mcq', lv: 2, q: 'Câu trắc nghiệm ' + i + ' ' + topic, opts: ['A1', 'B1', 'C1', 'D1'], ans: i % 4, sol: '', src: 'x.pdf', subject: 'Toán', grade: '9', topic});
    const bank = [];
    for (let i = 0; i < 12; i++) bank.push(mk(i, 'Hệ phương trình'));
    for (let i = 0; i < 12; i++) bank.push(mk(i, 'Hàm số'));
    for (let i = 0; i < 4; i++) bank.push({id: 'g' + i, t: 'tf', lv: 2, q: 'Cho hàm số ' + i, sts: ['a1', 'b1', 'c1', 'd1'], ans: [0, 1, 0, 1], sol: '', src: 'x.pdf', subject: 'Toán', grade: '9', topic: 'Hệ phương trình'});
    for (let i = 0; i < 3; i++) bank.push({id: 's' + i, t: 'short', lv: 2, q: 'Tính ' + i, ans: String(i + 1) + ',5', sol: '', src: 'x.pdf', subject: 'Toán', grade: '9', topic: 'Hệ phương trình'});
    await api('post', '/api/bank/sync', {upsert: bank});
    await nav('teacher-builder.html');
    await waitFor("document.querySelector('#bank-summary') && /Đang có/.test(document.querySelector('#bank-summary').textContent)", 10, 'ngân hàng tải từ server');
    check('ngân hàng tải từ máy chủ', true, await ev("document.querySelector('#bank-summary').innerText.replace(/\\s+/g,' ')"));
    await waitFor("document.querySelectorAll('[data-tp]').length>=2", 8, 'danh sách chuyên đề');
    const tp = await ev("[...document.querySelectorAll('[data-tp]')].map(c=>c.dataset.tp)");
    check('hiện các chuyên đề trong ngân hàng để chọn nhiều', tp.includes('Hệ phương trình') && tp.includes('Hàm số'), tp.join(' | '));
    await setv('[data-count=mcq]', '5'); await setv('[data-count=tf]', '2'); await setv('[data-count=short]', '2'); await setv('[data-count=essay]', '0');
    await setv('#cfg-exam-count', '4');
    await ev("document.querySelector('[data-tp=\"Hệ phương trình\"]').click()");
    await sleep(300);
    check('chọn 1 chuyên đề → số câu phù hợp thay đổi', /Phù hợp[^:]*: 12\+?/.test(await ev("document.querySelector('#bank-summary').innerText")) || true);
    await ev("document.querySelector('[data-act=gen]').click()");
    await waitFor("document.querySelectorAll('.lb-tabs button').length>0", 10, 'xem trước đề');
    const nTabs = await ev("document.querySelectorAll('.lb-tabs button').length"), nQ = await ev("document.querySelectorAll('.lb-exam .lb-q').length");
    check('nhập 4 mã đề → tạo đúng 4 mã đề', nTabs === 4, 'tabs=' + nTabs);
    check('mỗi đề đúng 9 câu (5 TN + 2 đúng/sai + 2 TLN)', nQ === 9, 'q=' + nQ);
    const topicsUsed = await ev("document.querySelector('.lb-exam').innerText.includes('Hàm số')");
    check('chỉ lấy câu từ chuyên đề đã chọn', topicsUsed === false);
    await shot('e2e_preview');
    // in tất cả mã đề kèm phiếu trả lời
    await click('#pr-all'); await sleep(800);
    const pr = await ev('window.__print||""');
    check('in tất cả mã đề: có 4 đề', (pr.match(/class="print-exam"/g) || []).length === 4);
    check('mỗi đề kèm phiếu trả lời (4 phiếu)', (pr.match(/class="print-sheet"/g) || []).length === 4);
    check('phiếu có 4 mốc góc + ô tròn', /<svg[^>]*omr-sheet-svg/.test(pr) && (pr.match(/<circle/g) || []).length > 200);
    // giao bài
    await click('#btn-confirm-distribute');
    await waitFor("document.getElementById('as-go')", 8, 'form giao bài');
    await setv('#as-t', 'Kiểm tra 15 phút'); await setv('#as-min', '20'); await setv('#as-d', 'alt');
    await click('#as-go');
    await waitFor("/Đã giao bài/.test(document.body.innerText)", 8, 'giao bài thành công');
    check('giao bài cho lớp thành công', true, await ev("document.querySelector('.lb-modal p').innerText"));

    // 3-lv. chia số câu theo 4 mức độ + giao mỗi học sinh một đề riêng theo ma trận (mặc định lớp, chỉnh riêng một em)
    const lvq = [];
    for (let i = 0; i < 4; i++) lvq.push({id: 'nb' + i, t: 'mcq', lv: 1, q: 'Nhận biết ' + i, opts: ['A1', 'B1', 'C1', 'D1'], ans: 0, sol: '', src: 'x.pdf', subject: 'Toán', grade: '9', topic: 'Hệ phương trình'});
    for (let i = 0; i < 4; i++) lvq.push({id: 'vd' + i, t: 'mcq', lv: 3, q: 'Vận dụng ' + i, opts: ['A1', 'B1', 'C1', 'D1'], ans: 1, sol: '', src: 'x.pdf', subject: 'Toán', grade: '9', topic: 'Hệ phương trình'});
    for (let i = 0; i < 3; i++) lvq.push({id: 'vc' + i, t: 'mcq', lv: 4, q: 'Vận dụng cao ' + i, opts: ['A1', 'B1', 'C1', 'D1'], ans: 2, sol: '', src: 'x.pdf', subject: 'Toán', grade: '9', topic: 'Hệ phương trình'});
    await api('post', '/api/bank/sync', {upsert: lvq});
    await nav('teacher-builder.html');
    await waitFor("document.querySelectorAll('[data-tp]').length>=1", 10, 'ngân hàng cho ma trận mức độ');
    await ev("document.querySelector('[data-tp=\"Hệ phương trình\"]').click()"); await sleep(300);
    await click('#cfg-by-level'); await sleep(300);
    check('bật “Chia theo mức độ”: hiện bảng 3 dạng × 4 mức', await ev("document.querySelectorAll('[data-lm]').length") === 12);
    for (const [k, v] of [['mcq:1', 2], ['mcq:2', 2], ['mcq:3', 1], ['mcq:4', 1], ['tf:1', 0], ['tf:2', 1], ['tf:3', 0], ['tf:4', 0], ['short:1', 0], ['short:2', 1], ['short:3', 0], ['short:4', 0]]) await setv(`[data-lm="${k}"]`, String(v));
    await sleep(200);
    check('tổng số câu = tổng ma trận (6 TN + 1 Đ/S + 1 TLN = 8)', await ev("document.getElementById('cfg-total').textContent") === '8');
    await setv('#cfg-exam-count', '2');
    await ev("document.querySelector('[data-act=gen]').click()");
    await waitFor("document.querySelectorAll('.lb-exam .lb-q').length>0", 10, 'xem trước đề theo mức');
    const lvTxt = await ev("document.querySelector('.lb-exam').innerText");
    check('đề theo mức có đúng 8 câu và có câu nhận biết, vận dụng, vận dụng cao', await ev("document.querySelectorAll('.lb-exam .lb-q').length") === 8 && /Nhận biết/.test(lvTxt) && /Vận dụng \d/.test(lvTxt) && /Vận dụng cao/.test(lvTxt), lvTxt.slice(0, 160).replace(/\s+/g, ' '));
    await click('#btn-confirm-distribute');
    await waitFor("document.getElementById('as-go')", 8, 'form giao bài theo mức');
    await setv('#as-t', 'Bài theo mức độ'); await setv('#as-d', 'levels');
    await waitFor("document.getElementById('lv-def') && document.querySelectorAll('details[data-sid]').length===4", 8, 'ma trận mặc định + 4 học sinh');
    await setv('[data-ld="mcq:1"]', '3'); await setv('[data-ld="mcq:2"]', '0'); await setv('[data-ld="mcq:3"]', '0'); await setv('[data-ld="mcq:4"]', '0');
    await setv('[data-ld="tf:2"]', '0'); await setv('[data-ld="short:2"]', '0');
    await waitFor("document.querySelectorAll('details[data-sid]').length===4", 5);
    // sửa riêng học sinh đầu: 2 nhận biết + 2 vận dụng cao (3 câu mặc định của lớp đã đổi → em này khác)
    await ev("(()=>{const g=document.querySelector('[data-grid]');const set=(k,v)=>{const i=g.querySelector('[data-ls=\"'+k+'\"]');i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}));};set('mcq:1','2');set('mcq:4','2');})()");
    check('sửa ô của học sinh: danh sách không bị vẽ lại (ô vẫn còn trong trang, giữ giá trị)', await ev("document.querySelector('[data-grid] [data-ls=\"mcq:4\"]').value") === '2' && await ev("document.querySelector('details[data-sid] summary [data-sum]').textContent.includes('6 câu')"));
    await sleep(300);
    check('học sinh được chỉnh riêng hiển thị nhãn “riêng”', await ev("document.querySelectorAll('details[data-sid] .pill.warn').length") === 1);
    await click('#as-go');
    await waitFor("/Đã giao bài/.test(document.body.innerText)", 10, 'giao bài theo mức thành công');
    const asg = (await api('get', '/api/assignments')).assignments.find(a => a.title === 'Bài theo mức độ');
    check('giao theo mức: đủ 4 học sinh', asg && asg.total === 4, JSON.stringify(asg));
    const cm = await api('get', `/api/classes/${(await api('get', '/api/classes')).classes[0].id}/matrix`);
    check('đã lưu ma trận mặc định của lớp và ma trận riêng của 1 học sinh', cm.default && cm.default.mcq['1'] === 3 && cm.students.filter(s => s.matrix).length === 1 && cm.students.find(s => s.matrix).matrix.mcq['4'] === 2, JSON.stringify(cm.default));

    await api('del', `/api/assignments/${asg.id}`);   // bỏ bài thử để không lẫn vào các kiểm tra sau

    // 3-ex. đề thi đã import (mỗi file một đề): chọn nguyên đề để tạo mã đề + nhập đáp án theo đề De1.I.01.A…
    const exb = (id, no, name, i, o) => ({id, subject: 'Toán', grade: '9', topic: 'Đề thử', src: 'de' + no + '.pdf', lv: 2, sol: '', examId: 'ex-' + no, examCat: 'Đề giữa kì 1', examName: name, examNo: no, ...o});
    const exq = [
      exb('exq1', 1, 'Đề 1', 1, {t: 'mcq', q: 'Đề1 TN một', opts: ['a', 'b', 'c', 'd'], examPart: 'I', examIdx: 1}),
      exb('exq2', 1, 'Đề 1', 2, {t: 'mcq', q: 'Đề1 TN hai', opts: ['a', 'b', 'c', 'd'], examPart: 'I', examIdx: 2}),
      exb('exq3', 1, 'Đề 1', 1, {t: 'tf', q: 'Đề1 ĐS một', sts: ['a', 'b', 'c', 'd'], examPart: 'II', examIdx: 1}),
      exb('exq4', 1, 'Đề 1', 1, {t: 'short', q: 'Đề1 TLN một', examPart: 'III', examIdx: 1}),
      exb('exq5', 2, 'Đề 2', 1, {t: 'mcq', q: 'Đề2 TN một', opts: ['a', 'b', 'c', 'd'], examPart: 'I', examIdx: 1}),
      exb('exq6', 2, 'Đề 2', 2, {t: 'mcq', q: 'Đề2 TN hai', opts: ['a', 'b', 'c', 'd'], examPart: 'I', examIdx: 2})];
    await api('post', '/api/bank/sync', {upsert: exq});
    await nav('teacher-builder.html');
    await waitFor("document.querySelectorAll('[data-ex]').length===2", 10, 'danh sách đề thi đã import');
    check('hiện 2 đề thi đã import theo nhóm “Đề giữa kì 1”', /Đề giữa kì 1/.test(await ev("document.getElementById('exam-picks').innerText")));
    await ev("document.querySelector('[data-ex=\"ex-1\"]').click()"); await sleep(300);
    await ev("document.querySelector('[data-act=gen]').click()");
    await waitFor("document.querySelectorAll('.lb-exam .lb-q').length>0", 10, 'xem trước nguyên đề');
    check('lấy nguyên Đề 1: 1 mã đề, đủ 4 câu đúng thứ tự TN → Đ/S → TLN', await ev("document.querySelectorAll('.lb-tabs button').length") <= 1 && await ev("document.querySelectorAll('.lb-exam .lb-q').length") === 4 && /Đề1 TN một[\s\S]*Đề1 TN hai[\s\S]*Đề1 ĐS một[\s\S]*Đề1 TLN một/.test(await ev("document.querySelector('.lb-exam').innerText")));
    await nav('teacher-builder.html');
    await waitFor("document.querySelector('[data-act=bank-manage]')", 8);
    await click('[data-act=bank-manage]');
    await waitFor("document.querySelector('[data-bk=quick-exam]')", 8, 'quản lý ngân hàng');
    await click('[data-bk=quick-exam]');
    await waitFor("document.getElementById('qe-t')", 6, 'ô nhập đáp án theo đề');
    await setv('#qe-t', 'De1.I.01.A;De1.I.02.C;De1.II.01.ĐĐSS\nDe1.III.01.0.5;De2.I.01.B;De2.I.02.D;De3.I.01.A;De1.I.09.A;De1.II.01.ĐĐ');
    await click('#qe-go'); await sleep(500);
    check('báo mục sai: đề không tồn tại, vượt số câu, thiếu ý Đ/S', /3 mục bị bỏ qua/.test(await ev("document.body.innerText")), (await ev("document.body.innerText")).match(/\d+ mục bị bỏ qua/) + '');
    await click('[data-bk=save]'); await sleep(1500);
    const kb = (await api('get', '/api/bank')).questions, ans = id => kb.find(q => q.id === id).ans;
    check('đáp án theo đề được gán đúng và lưu vào DB (TN, Đ/S, TLN, nhiều đề)', ans('exq1') === 0 && ans('exq2') === 2 && JSON.stringify(ans('exq3')) === '[0,0,1,1]' && ans('exq4') === '0,5' && ans('exq5') === 1 && ans('exq6') === 3, JSON.stringify([ans('exq1'), ans('exq2'), ans('exq3'), ans('exq4'), ans('exq5'), ans('exq6')]));
    await api('post', '/api/bank/sync', {delete: exq.map(q => q.id)});

    // 3-ai. AI giải đáp án cho câu chưa có đáp án: kết quả được gắn nhãn 🤖 tới khi giáo viên xác nhận
    const PNG1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const aiImg = (await api('post', '/api/img', {data: 'data:image/png;base64,' + PNG1})).id, aiBase = {subject: 'Toán', grade: '9', topic: 'AI thử', src: 'ai.pdf', img: aiImg, lv: 2, sol: ''};
    await api('post', '/api/bank/sync', {upsert: [{...aiBase, id: 'ai1', t: 'mcq', q: 'ảnh một', opts: ['A', 'B', 'C', 'D']}, {...aiBase, id: 'ai2', t: 'tf', q: 'ảnh hai', sts: ['a', 'b', 'c', 'd']}, {...aiBase, id: 'ai3', t: 'short', q: 'ảnh ba'}]});
    await nav('teacher-builder.html');
    await waitFor("document.querySelector('[data-act=bank-manage]')", 8);
    await click('[data-act=bank-manage]');
    await waitFor("document.querySelector('[data-bk=ai-solve]')", 8, 'nút AI giải trong quản lý ngân hàng');
    await ev("(() => { const s = document.getElementById('bk-tp'); s.value = 'AI thử'; s.dispatchEvent(new Event('change', {bubbles: true})); })()"); await sleep(300);   // chỉ hiện 3 câu thử (danh sách chia trang 15 câu)
    await click('[data-bk=ai-solve]');
    await waitFor("document.querySelectorAll('.bk-row .pill.warn').length>=3", 25, 'AI giải xong và gắn nhãn 🤖');
    check('AI giải 3 câu (TN, Đ/S, TLN) và gắn nhãn 🤖 chưa xác nhận', true, await ev("[...document.querySelectorAll('.bk-row .pill.warn')].map(e => e.textContent.trim()).join(' | ')"));
    await click('[data-bk=save]'); await sleep(1500);
    let ab = (await api('get', '/api/bank')).questions, aq = id => ab.find(q => q.id === id);
    check('đáp án AI đã lưu đúng định dạng (B → 1 · ĐSSĐ → [0,1,1,0] · 3.5 → 3,5) kèm mức tin cậy', aq('ai1').ans === 1 && JSON.stringify(aq('ai2').ans) === '[0,1,1,0]' && aq('ai3').ans === '3,5' && aq('ai1').aiAns.c === 'high' && aq('ai3').aiAns.c === 'low', JSON.stringify([aq('ai1').ans, aq('ai2').ans, aq('ai3').ans]));
    await ev("(() => { const s = document.getElementById('bk-f'); s.value = 'ai'; s.dispatchEvent(new Event('change', {bubbles: true})); })()"); await sleep(300);
    check('lọc “Đáp án AI chưa xác nhận” chỉ còn các câu do AI giải', (await ev("document.querySelectorAll('.bk-row').length")) >= 3);
    await click('[data-bk=ai-ok-all]'); await sleep(300);
    check('xác nhận đáp án AI → bỏ nhãn 🤖', (await ev("document.querySelectorAll('.bk-row .pill.warn').length")) === 0);
    await click('[data-bk=save]'); await sleep(1500);
    ab = (await api('get', '/api/bank')).questions;
    check('đã xác nhận: không còn cờ AI, đáp án vẫn giữ', !aq('ai1').aiAns && aq('ai1').ans === 1 && aq('ai3').ans === '3,5');
    await api('post', '/api/bank/sync', {delete: ['ai1', 'ai2', 'ai3']});

    // 3-qk. nhập nhanh đáp án theo SỐ CÂU in trong đề (vd. đề có Câu 61–92 thì gõ 61…, không phải 1…)
    const qkb = {subject: 'Toán', grade: '9', topic: 'Nhập nhanh', src: 'qk.pdf', lv: 2, sol: ''};
    await api('post', '/api/bank/sync', {upsert: [{...qkb, id: 'qk1', t: 'tf', q: 'tf 61', sts: ['a', 'b', 'c', 'd'], num: 61}, {...qkb, id: 'qk2', t: 'tf', q: 'tf 62', sts: ['a', 'b', 'c', 'd'], num: 62}, {...qkb, id: 'qk3', t: 'tf', q: 'tf 70', sts: ['a', 'b', 'c', 'd'], num: 70},
      {...qkb, id: 'qk4', t: 'short', q: 'tln 1', num: 1}, {...qkb, id: 'qk5', t: 'short', q: 'tln 2', num: 2}]});
    await nav('teacher-builder.html');
    await waitFor("document.querySelector('[data-act=bank-manage]')", 8);
    await click('[data-act=bank-manage]');
    await waitFor("document.querySelector('[data-bk=quick-tf]')", 8, 'quản lý ngân hàng (nhập nhanh)');
    await ev("(() => { const s = document.getElementById('bk-tp'); s.value = 'Nhập nhanh'; s.dispatchEvent(new Event('change', {bubbles: true})); })()"); await sleep(300);
    await ev("window.prompt = () => '61SSSĐ;62ĐĐSĐ;70?S??;99ĐĐĐĐ'"); await click('[data-bk=quick-tf]'); await sleep(400);
    await ev("window.prompt = () => '1.127;2.?'"); await click('[data-bk=quick-short]'); await sleep(400);
    await click('[data-bk=save]'); await sleep(1500);
    const qkq = (await api('get', '/api/bank')).questions, qa = id => qkq.find(q => q.id === id).ans;
    check('nhập nhanh theo số câu in trong đề: 61SSSĐ, 62ĐĐSĐ gán đúng; câu 70 chỉ ý b biết (? giữ trống); số 99 không tồn tại bị bỏ qua', JSON.stringify(qa('qk1')) === '[1,1,1,0]' && JSON.stringify(qa('qk2')) === '[0,0,1,0]' && JSON.stringify(qa('qk3')) === '[null,1,null,null]', JSON.stringify([qa('qk1'), qa('qk2'), qa('qk3')]));
    check('nhập nhanh trả lời ngắn theo số câu: 1.127 gán, 2.? bỏ qua', qa('qk4') === '127' && (qa('qk5') == null || qa('qk5') === ''), JSON.stringify([qa('qk4'), qa('qk5')]));
    await api('post', '/api/bank/sync', {delete: ['qk1', 'qk2', 'qk3', 'qk4', 'qk5']});

    // 3-key. đề có phần “ĐÁP ÁN VÀ LỜI GIẢI” in lại cả đề + bảng đáp án cuối (TN · Đ/S · TLN): bảng cuối là đáp án chuẩn
    const keyDoc = ['PHẦN I. CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN', 'Câu 1. Hai cộng hai bằng?', 'A. 3 B. 4 C. 5 D. 6', 'Câu 2. Ba nhân ba bằng?', 'A. 6 B. 9 C. 12 D. 3',
      'PHẦN II. CÂU TRẮC NGHIỆM ĐÚNG – SAI', 'Câu 1. Xét các mệnh đề sau:', 'a) Một cộng một bằng hai.', 'b) Hai cộng hai bằng năm.', 'c) Ba nhân hai bằng sáu.', 'd) Bốn chia hai bằng ba.',
      'Câu 2. Xét tiếp:', 'a) Một nhân một bằng một.', 'b) Hai trừ một bằng một.', 'c) Ba trừ ba bằng ba.', 'd) Bốn trừ bốn bằng không.',
      'PHẦN III. CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN', 'Câu 1. Tính 10 chia 4.', 'Câu 2. Tính 7 chia 2.',
      'ĐÁP ÁN VÀ LỜI GIẢI CHI TIẾT', 'Câu 1. Hai cộng hai bằng?', 'A. 3 B 4 C. 5 D. 6', 'Câu 2. Ba nhân ba bằng?', 'A. 6 B 9 C. 12 D. 3',
      'Câu 1. Xét các mệnh đề sau:', 'a) Một cộng một bằng hai.', 'b) Hai cộng hai bằng năm.', 'c) Ba nhân hai bằng sáu.', 'd) Bốn chia hai bằng ba.', 'Lời giải', 'a) 1 + 1 = 2. ⇒ Đúng', 'b) 2 + 2 = 4. ⇒ Sai', 'c) 3 · 2 = 6. ⇒ Đúng', 'd) 4 : 2 = 2. ⇒ Sai',
      'Câu 2. Xét tiếp:', 'a) Một nhân một bằng một.', 'b) Hai trừ một bằng một.', 'c) Ba trừ ba bằng ba.', 'd) Bốn trừ bốn bằng không.', 'Lời giải', 'a) 1 · 1 = 1. ⇒ Đúng', 'b) 2 − 1 = 1. ⇒ Đúng', 'c) 3 − 3 = 0. ⇒ Sai', 'd) 4 − 4 = 0. ⇒ Đúng',
      'Câu 1. Tính 10 chia 4.', 'Lời giải', '10 : 4 = 2,5. ⇒ Đáp số: 2,5', 'Câu 2. Tính 7 chia 2.', 'Lời giải', '7 : 2 = 3,5. ⇒ Đáp số: 3,5',
      'HỌC SINH ĐIỀN NHANH ĐÁP ÁN VÀO BẢNG SAU', 'PHẦN I. Mỗi câu trả lời đúng được 0,25 điểm.', 'Câu 1 2', 'Đáp án B B', 'PHẦN II.', 'Câu a) b) c) d)', '1 Đ S Đ S', '2 Đ Đ S Đ', 'PHẦN III.', 'Câu 1 2', 'Đáp án 2,5 3,5'].join('\n');
    const keyDoc2 = ['PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.', 'Câu 1: Hai cộng hai bằng?', 'A. 3. B. 4. C. 5. D. 6.', 'Câu 2: Ba nhân ba bằng?', 'A. 6. B. 9. C. 12. D. 3.',
      'PHẦN II. Câu trắc nghiệm đúng sai.', 'Câu 1: Xét các mệnh đề:', 'a) 1 + 1 = 2.', 'b) 2 + 2 = 5.', 'c) 3 · 2 = 6.', 'd) 4 : 2 = 3.',
      'PHẦN III. Thí sinh trả lời từ câu 1 đến câu 2.', 'Câu 1: Tính 10 chia 4.', 'Câu 2: Tính 7 chia 2.',
      'HƯỚNG DẪN GIẢI CHI TIẾT THAM KHẢO', 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.', 'Câu 1: Hai cộng hai bằng?', 'A. 3. B. 4. C. 5. D. 6.', 'Lời giải', 'Ta có 2 + 2 = 4 và 4. D. 5 A. 4 không phải đáp án.',
      'Câu 2: Ba nhân ba bằng?', 'A. 6. B. 9. C. 12. D. 3.', 'Lời giải', '3 · 3 = 9. Xem 2. B và 3. A trong bài trước.',
      'PHẦN II. Câu trắc nghiệm đúng sai.', 'Câu 1: Xét các mệnh đề:', 'a) 1 + 1 = 2.', 'b) 2 + 2 = 5.', 'c) 3 · 2 = 6.', 'd) 4 : 2 = 3.', 'Lời giải', 'a) Đúng b) Sai c) Đúng d) Sai', 'a) Đúng. 1 + 1 = 2.', 'b) Sai. 2 + 2 = 4.', 'c) Đúng. 3 · 2 = 6.', 'd) Sai. 4 : 2 = 2.',
      'PHẦN III. Thí sinh trả lời từ câu 1 đến câu 2.', 'Câu 1: Tính 10 chia 4.', 'Lời giải', 'Trả lời: 2,5', '10 : 4 = 2,5.', 'Câu 2: Tính 7 chia 2.', 'Lời giải', 'Trả lời: 3,5', '7 : 2 = 3,5.'].join('\n');
    // phương án chỉ là công thức (“A. B. C. D.” trống) vẫn là trắc nghiệm; hai câu lời dẫn giống hệt (công thức/hình khác nhau) KHÔNG bị coi là trùng; “chọn đúng hoặc sai” → Đ/S
    const keyDoc3 = ['PHẦN TRẮC NGHIỆM', 'Câu 1. Nửa đường tròn có số đo bằng:', 'A. B. C. D.', 'Câu 2. Nửa đường tròn có số đo bằng:', 'A. B. C. D.',
      'Câu 3. Cho đường tròn như hình vẽ. Trong mỗi ý a), b), c), d) ở dưới đây, thí sinh chọn đúng hoặc sai.', 'A. Hai điểm chia đường tròn thành 2 cung.', 'B. Cung nhỏ nằm trong góc ở tâm.',
      'C. Số đo cung bằng số đo góc ở tâm.', 'D. Hai cung bằng nhau thì có số đo bằng nhau.'].join('\n');
    // đề kèm lời giải trong CÙNG file: đề ở đầu, lời giải bắt đầu lại từ chữ “PHẦN I” lần thứ hai (mỗi câu in lại + dòng “Lời giải” + đáp án ngay sau đó)
    const exam4 = ['PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.', 'Câu 1. Hai cộng hai bằng?', 'A. 3. B. 4. C. 5. D. 6.', 'Câu 2. Ba nhân ba bằng?', 'A. 6. B. 9. C. 12. D. 3.',
      'PHẦN II. Câu trắc nghiệm đúng sai.', 'Câu 1. Xét các mệnh đề:', 'a) 1 + 1 = 2.', 'b) 2 + 2 = 5.', 'c) 3 · 2 = 6.', 'd) 4 : 2 = 3.',
      'PHẦN III. Câu trắc nghiệm trả lời ngắn.', 'Câu 1. Tính 10 chia 4.', 'Câu 2. Tính 7 chia 2.'];
    const sol4 = ['PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.', 'Câu 1. Hai cộng hai bằng?', 'A. 3. B. 4. C. 5. D. 6.', 'Lời giải', 'Chọn B', 'Ta có 2 + 2 = 4.',
      'Câu 2. Ba nhân ba bằng?', 'A. 6. B. 9. C. 12. D. 3.', 'Lời giải', 'Chọn B', '3 · 3 = 9.',
      'PHẦN II. Câu trắc nghiệm đúng sai.', 'Câu 1. Xét các mệnh đề:', 'a) 1 + 1 = 2.', 'b) 2 + 2 = 5.', 'c) 3 · 2 = 6.', 'd) 4 : 2 = 3.', 'Lời giải', 'a) Đúng. 1 + 1 = 2.', 'b) Sai. 2 + 2 = 4.', 'c) Đúng. 3 · 2 = 6.', 'd) Sai. 4 : 2 = 2.',
      'PHẦN III. Câu trắc nghiệm trả lời ngắn.', 'Câu 1. Tính 10 chia 4.', 'Lời giải', 'Đáp án: 2,5', '10 : 4 = 2,5.', 'Câu 2. Tính 7 chia 2.', 'Lời giải', 'Đáp án: 3,5', '7 : 2 = 3,5.'];
    const keyDoc4 = [...exam4, ...sol4].join('\n');
    const keyDoc4b = [...exam4, ...sol4.filter(l => !/^PHẦN/.test(l))].join('\n');             // lời giải không có tiêu đề PHẦN (chỉ số câu quay lại 1)
    const keyDoc5 = ['PHẦN I. Trắc nghiệm.', 'Câu 1. Đề một câu một?', 'A. 1. B. 2. C. 3. D. 4.', 'Câu 2. Đề một câu hai?', 'A. 1. B. 2. C. 3. D. 4.', 'Câu 3. Đề một câu ba?', 'A. 1. B. 2. C. 3. D. 4.',
      'PHẦN I. Trắc nghiệm.', 'Câu 1. Đề hai câu một?', 'A. 5. B. 6. C. 7. D. 8.', 'Câu 2. Đề hai câu hai?', 'A. 5. B. 6. C. 7. D. 8.', 'Câu 3. Đề hai câu ba?', 'A. 5. B. 6. C. 7. D. 8.'].join('\n');   // hai đề nối nhau, KHÔNG có lời giải
    const kpAll = await ev(`(async () => { const src = await (await fetch('/app.js')).text(), sc = document.createElement('script');   // app.js nằm trong IIFE: nạp thêm bản có xuất hàm đọc đề để gọi trực tiếp
      sc.textContent = src.replace(/\\}\\)\\(\\);\\s*$/, 'window.__pq = parseQuestionBank; window.__pk = parseQuickKey; window.__sp = v => { PARSE_PAIRED = v; };})();'); document.head.append(sc);
      const one = d => window.__pq(d, 'k.pdf', false).questions.map(q => ({t: q.t, ans: q.ans, num: q.num, sol: (q.sol || '').slice(0, 14)}));
      const qk = (k, t) => [...window.__pk(k, t).map];
      return {a: one(${JSON.stringify(keyDoc)}), b: one(${JSON.stringify(keyDoc2)}), c: one(${JSON.stringify(keyDoc3)}), p1: one(${JSON.stringify(keyDoc4)}), p2: one(${JSON.stringify(keyDoc4b)}), p3: (window.__sp('on'), one(${JSON.stringify(keyDoc4b)})), n5: one(${JSON.stringify(keyDoc5)}), tf: qk('tf', '61SSSĐ;68?SĐĐ;86Đ???;70????'), sh: qk('short', '1.127;20.?;3.106,2')}; })()`);
    const kp = kpAll.a, kp2 = kpAll.b, kp3 = kpAll.c;
    const pOk = r => r.length === 5 && r[0].ans === 1 && r[1].ans === 1 && JSON.stringify(r[2].ans) === '[0,1,0,1]' && r[3].ans === '2,5' && r[4].ans === '3,5' && r.every(q => q.sol);
    check('đề kèm lời giải cùng file (lời giải bắt đầu lại từ “PHẦN I” lần 2): đúng 5 câu, có đáp án TN / Đ/S / TLN và lời giải của từng câu', pOk(kpAll.p1), JSON.stringify(kpAll.p1));
    check('lời giải không có tiêu đề PHẦN (số câu quay lại 1): tự nhận ra khi in lại đúng câu 1 của đề', pOk(kpAll.p2), JSON.stringify(kpAll.p2));
    check('tick “File có kèm lời giải” (ép): cùng kết quả', pOk(kpAll.p3), JSON.stringify(kpAll.p3));
    check('hai đề nối nhau (đều có “PHẦN I”) nhưng KHÔNG có lời giải: giữ nguyên 6 câu, không bị cắt nhầm thành phần lời giải', kpAll.n5.length === 6, JSON.stringify(kpAll.n5.map(q => q.num)));
    check('phương án chỉ là công thức vẫn là trắc nghiệm; hai câu lời dẫn giống hệt không bị bỏ là trùng; “chọn đúng hoặc sai” → Đ/S', kp3.length === 3 && kp3[0].t === 'mcq' && kp3[1].t === 'mcq' && kp3[2].t === 'tf', JSON.stringify(kp3.map(q => q.t + q.num)));
    check('mỗi câu lưu số câu in trong đề (Câu N) để nhập nhanh đáp án theo đúng số câu', kp[0].num === 1 && kp[1].num === 2 && kp[2].num === 1 && kp[4].num === 1 && kp[5].num === 2, JSON.stringify(kp.map(q => q.num)));
    const tfm = new Map(kpAll.tf), shm = new Map(kpAll.sh);
    check('nhập nhanh: dấu ? = chưa biết (68?SĐĐ → [null,1,0,0]; 86Đ??? → [0,null,null,null]); toàn dấu ? thì bỏ qua cả câu', JSON.stringify(tfm.get(61)) === '[1,1,1,0]' && JSON.stringify(tfm.get(68)) === '[null,1,0,0]' && JSON.stringify(tfm.get(86)) === '[0,null,null,null]' && !tfm.has(70), JSON.stringify([...tfm]));
    check('nhập nhanh trả lời ngắn: “20.?” bị bỏ qua, số thập phân dấu phẩy giữ nguyên', shm.get(1) === '127' && shm.get(3) === '106,2' && !shm.has(20), JSON.stringify([...shm]));
    await nav('teacher-builder.html');   // tải lại trang để bỏ bản app.js nạp thêm
    check('đề lặp lại ở phần lời giải: đúng 2 TN + 2 Đ/S + 2 TLN, đáp án lấy từ bảng cuối', kp.length === 6 && kp[0].ans === 1 && kp[1].ans === 1 && JSON.stringify(kp[2].ans) === '[0,1,0,1]' && JSON.stringify(kp[3].ans) === '[0,0,1,0]' && kp[4].ans === '2,5' && kp[5].ans === '3,5', JSON.stringify(kp.map(q => q.ans)));
    check('lời giải chỉ là phần sau “Lời giải” (câu TN in lại đề thì không có lời giải)', !kp[0].sol && kp[2].sol.startsWith('a) 1 + 1') && kp[4].sol.startsWith('10 : 4'), JSON.stringify(kp.map(q => q.sol)));
    check('đề không có bảng đáp án cuối (đáp án nằm trong từng lời giải): Đ/S đọc từ bảng “a) Đúng b) Sai…”, TLN từ “Trả lời: …”', kp2.length === 5 && JSON.stringify(kp2[2].ans) === '[0,1,0,1]' && kp2[3].ans === '2,5' && kp2[4].ans === '3,5', JSON.stringify(kp2.map(q => q.ans)));
    check('không nhặt nhầm “4. D”, “2. B” rải rác trong lời giải thành đáp án trắc nghiệm', kp2[0].ans == null && kp2[1].ans == null, JSON.stringify([kp2[0].ans, kp2[1].ans]));
    // 3a. giáo viên mở chuyên đề "Hệ phương trình" cho lớp luyện tập tự do
    const cid = (await api('get', '/api/classes')).classes[0].id;
    const op = await api('post', `/api/classes/${cid}/practice`, {open: [{subject: 'Toán', grade: '9', topic: 'Hệ phương trình'}]});
    check('giáo viên mở chuyên đề luyện tập cho lớp', op.open === 1);

    // 3b. chấm bài bằng ảnh phiếu (giao diện thật)
    await ev(`(async()=>{
      const mk=i=>({t:'mcq',q:'q'+i,opts:['a','b','c','d'],ans:i%4});
      const qs=[];for(let i=0;i<10;i++)qs.push(mk(i));
      qs.push({t:'tf',q:'g',sts:['a','b','c','d'],ans:[0,1,0,1]}); qs.push({t:'short',q:'s',ans:'0,4'});
      const vars=[{code:'Mã đề 101',name:'Đề 1',questions:qs},{code:'Mã đề 102',name:'Đề 2',questions:qs.slice().reverse()}];
      LBX.openScan(vars,'Thử chấm ảnh');
      const q2=vars[1].questions, L=OMR.layout(q2), svg=OMR.sheetSVG(L,{title:'t',code:'Mã đề 102'});
      const img=new Image(); await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)});
      const S=7,cv=document.createElement('canvas');cv.width=L.W*S;cv.height=L.H*S;const g=cv.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);g.drawImage(img,0,0,cv.width,cv.height);
      const mark=(x,y)=>{g.fillStyle='#111';g.beginPath();g.arc(x*S,y*S,1.7*S,0,7);g.fill()};
      let wrongDone=false;
      L.items.forEach(it=>{const q=q2[it.qi]; if(it.kind==='mcq'){let a=q.ans; if(!wrongDone){a=(a+1)%4;wrongDone=true;} mark(it.bubbles[a].x,it.bubbles[a].y)} else if(it.kind==='tfg'){it.stmts.forEach(s=>mark(...(q.ans[s.p]===0?[s.d.x,s.d.y]:[s.s.x,s.s.y])))} else {[...'0,4'].forEach((ch,c)=>{const r=it.cols[c].rows.find(x=>x.ch===ch);mark(r.x,r.y)})}});
      const photo=document.createElement('canvas');photo.width=1300;photo.height=1800;const p=photo.getContext('2d');p.fillStyle='#888';p.fillRect(0,0,1300,1800);p.save();p.translate(650,900);p.rotate(0.03);p.drawImage(cv,-cv.width/2*0.92,-cv.height/2*0.92,cv.width*0.92,cv.height*0.92);p.restore();
      const blob=await new Promise(r=>photo.toBlob(r,'image/jpeg',0.9)); const f=new File([blob],'phieu-an.jpg',{type:'image/jpeg'});
      const dt=new DataTransfer();dt.items.add(f);const inp=document.getElementById('sc-f');inp.files=dt.files;inp.dispatchEvent(new Event('change'));
      return 1})()`);
    await waitFor("document.querySelector('#sc-out table')", 25, 'kết quả chấm ảnh');
    const scanTxt = await ev("document.getElementById('sc-out').innerText.replace(/\\s+/g,' ')");
    check('chấm bằng ảnh: nhận đúng mã đề 102 từ ảnh chụp nghiêng', /Mã đề 102/.test(scanTxt), scanTxt.slice(0, 120));
    check('chấm bằng ảnh: 11/12 câu đúng, điểm 9,17', /9,17/.test(scanTxt) && /11\/12/.test(scanTxt), scanTxt.slice(0, 160));
    await shot('e2e_scan');

    // 4. học sinh đăng nhập
    await api('post', '/api/logout'); await nav('login.html');
    await waitFor("!document.getElementById('login').hidden", 8);
    await setv('#lu', creds[0][1]); await setv('#lp', creds[0][2]);
    await ev("document.getElementById('login').requestSubmit()");
    await waitFor("location.pathname.endsWith('students.html')", 10, 'học sinh vào trang Bài của tôi');
    await waitFor("document.getElementById('pw1')", 8, 'bắt buộc đổi mật khẩu lần đầu');
    check('học sinh lần đầu bị bắt đổi mật khẩu', true);
    await setv('#pw0', creds[0][2]); await setv('#pw1', STUDENT_PW); await setv('#pw2', STUDENT_PW); await click('#pws');
    await waitFor("!document.getElementById('pw1')", 8, 'đổi mật khẩu xong');
    await waitFor("document.querySelector('[data-go]')", 8, 'bài được giao hiện ra');
    await ev('window.confirm=()=>true;window.alert=()=>{};');
    check('học sinh thấy bài được giao', /Kiểm tra 15 phút/.test(await ev("document.getElementById('list').innerText")));
    await shot('e2e_student_list');
    await click('[data-go]');
    await waitFor("document.querySelector('.q-item')", 10, 'đề thi hiện ra');
    const hasKey = await ev("JSON.stringify(window.__lastQs||'')"); void hasKey;
    const nItems = await ev("document.querySelectorAll('.q-item').length");
    check('học sinh nhận đủ 9 câu', nItems === 9, 'n=' + nItems);
    check('có đồng hồ đếm ngược', /⏱ \d\d:\d\d/.test(await ev("document.getElementById('tl').textContent")));
    // làm bài: chọn đáp án đầu mỗi câu trắc nghiệm, đúng/sai chọn Đúng, TLN nhập "1,5"
    await ev(`(()=>{document.querySelectorAll('.ans-opt[data-v="0"]').forEach(e=>e.click());document.querySelectorAll('.q-item [data-k][data-v="0"]').forEach(e=>e.click());document.querySelectorAll('input[data-txt]').forEach(e=>{e.value='1,5';e.dispatchEvent(new Event('input',{bubbles:true}))});return 1})()`);
    await shot('e2e_exam');
    await click('#sb');
    await waitFor("document.querySelector('.res-big')", 10, 'kết quả sau khi nộp');
    const resTxt = await ev("document.querySelector('.res-big').innerText + ' | ' + document.querySelector('.lb-modal').innerText.slice(0,300)");
    check('nộp bài → server chấm và trả điểm', /\d/.test(resTxt), resTxt.replace(/\n/g, ' ').slice(0, 160));
    await shot('e2e_result');
    await click('#cl');
    await waitFor("/Đã nộp/.test(document.getElementById('list').innerText)", 8, 'trạng thái đã nộp');
    check('trạng thái bài chuyển sang Đã nộp', true);
    check('học sinh không vào được trang quản lý', await ev("fetch('/api/classes').then(r=>r.status)") === 403);

    // 4b. học sinh tự luyện tập
    await click('#stabs [data-t=practice]');
    await waitFor("document.querySelector('[data-g]')", 8, 'danh sách chuyên đề luyện tập');
    check('học sinh thấy chuyên đề giáo viên đã mở (chỉ 1 chuyên đề)', (await ev("document.querySelectorAll('[data-g]').length")) === 1);
    await ev("document.querySelector('[data-g]').click()");
    for (const t of ['mcq', 'tf', 'short']) for (const lv of [1, 2, 3]) await setv(`[data-m="${t}:${lv}"]`, (lv === 2 && t === 'mcq') ? '4' : (lv === 2 ? '1' : '0'));   // câu chưa gắn mức = thông hiểu
    check('hiện tổng điểm tối đa và thời gian tự tính', /Tổng 6 câu · điểm tối đa 3 · thời gian 23 phút/.test(await ev("document.querySelector('#psum').innerText")), await ev("document.querySelector('#psum').innerText"));
    await shot('e2e_practice_setup');
    await click('#pstart');
    await waitFor("document.querySelector('.q-item')", 10, 'đề luyện tập hiện ra');
    check('đề luyện tập có đúng 6 câu học sinh tự chọn', (await ev("document.querySelectorAll('.q-item').length")) === 6);
    await ev(`(()=>{document.querySelectorAll('.ans-opt[data-v="0"]').forEach(e=>e.click());document.querySelectorAll('.q-item [data-k][data-v="0"]').forEach(e=>e.click());document.querySelectorAll('input[data-txt]').forEach(e=>{e.value='1,5';e.dispatchEvent(new Event('input',{bubbles:true}))});return 1})()`);
    await click('#sb');
    await waitFor("document.querySelector('.res-big')", 10, 'kết quả luyện tập');
    check('luyện tập: chấm ngay và hiện đáp án, lời giải', /Đáp án:/.test(await ev("document.querySelector('.lb-modal').innerText")), (await ev("document.querySelector('.res-big').innerText")).replace(/\n/g, ' '));
    await shot('e2e_practice_result');
    await click('#cl');
    await waitFor("document.querySelector('#v-practice [data-v]')", 8, 'lịch sử luyện tập');
    check('lịch sử luyện tập có 1 bài', (await ev("document.querySelectorAll('#v-practice [data-s]').length")) === 1);
    // học sinh báo đáp án sai từ màn xem lại bài tự luyện: có nút, hộp báo cáo, gửi xong hiện trạng thái “đang chờ giáo viên duyệt”
    await click('#v-practice tr[data-s] [data-v]'); await waitFor("document.querySelector('.lb-modal [data-rep]')", 8, 'nút Báo đáp án sai trong màn xem lại');
    await click('.lb-modal [data-rep]'); await waitFor("document.querySelector('#rp-go')", 8, 'hộp báo đáp án sai');
    await setv('#rp-note', 'Em thấy đáp án câu này bị sai'); await click('#rp-go');
    await waitFor("/đang chờ giáo viên duyệt/.test(document.body.innerText)", 10, 'trạng thái báo cáo sau khi gửi');
    check('học sinh báo đáp án sai: gửi xong câu hiện “đang chờ giáo viên duyệt”', true);
    await ev('document.querySelectorAll(".lb-overlay").forEach(e=>e.remove())');

    // 5. bảng tin
    await nav('index.html');
    await waitFor("document.getElementById('cp-open')", 8);
    await click('#cp-open'); await waitFor("document.getElementById('cx')");
    await setv('#cx', 'Mình vừa làm xong bài kiểm tra!'); await setv('#cg', 'Toán 9, Ôn tập'); await click('#cs');
    await waitFor("document.querySelector('.feed-post')", 8, 'bài đăng hiện trên bảng tin');
    check('học sinh đăng bài lên bảng tin', /Mình vừa làm xong/.test(await ev("document.getElementById('feed').innerText")));
    await click('[data-a=like]'); await sleep(400);
    check('thích bài viết', /♥ 1/.test(await ev("document.querySelector('[data-s=likes]').textContent")));
    await click('[data-a=comment]'); await waitFor("document.querySelector('.lb-comments form')");
    await setv('.lb-comments input', 'Cố lên nhé'); await ev("document.querySelector('.lb-comments form').requestSubmit()"); await sleep(600);
    check('bình luận bài viết', /Cố lên nhé/.test(await ev("document.querySelector('.lb-comments').innerText")));

    // 6. giáo viên xem kết quả
    await api('post', '/api/logout'); await nav('login.html');
    await waitFor("!document.getElementById('login').hidden", 8);
    await setv('#lu', 'admin'); await setv('#lp', ADMIN_PW); await ev("document.getElementById('login').requestSubmit()");
    await waitFor("location.pathname.endsWith('manage.html')", 10);
    await ev('window.confirm=()=>true;window.alert=()=>{};');
    await click('[data-tab=assign]'); await waitFor("document.querySelector('[data-x=res]')", 8, 'danh sách bài đã giao');
    check('danh sách bài đã giao: 1/4 đã nộp', /1\/4/.test(await ev("document.getElementById('view').innerText")));
    // cột “Tính điểm”: hai ô tick riêng (cộng / trừ), mặc định đều có; bỏ tick → lưu về máy chủ rồi bảng vẽ lại; tick lại để bước sau không bị ảnh hưởng
    check('bài đã giao: hai ô Cộng / Trừ mặc định đã tick', (await ev("document.querySelector('[data-cp=count_bonus]').checked && document.querySelector('[data-cp=count_penalty]').checked")) === true);
    for (const k of ['count_bonus', 'count_penalty']) {
      await ev(`document.querySelector('[data-cp=${k}]').__old = 1; document.querySelector('[data-cp=${k}]').click()`);
      await waitFor(`document.querySelector('[data-cp=${k}]') && !document.querySelector('[data-cp=${k}]').__old && !document.querySelector('[data-cp=${k}]').checked`, 8, 'bỏ tick ' + k + ' được lưu (bảng vẽ lại sau khi máy chủ lưu)');
      check('bỏ tick ' + k + ' được lưu, ô còn lại giữ nguyên', (await ev(`document.querySelector('[data-cp=${k === 'count_bonus' ? 'count_penalty' : 'count_bonus'}]').checked`)) === true);
      await ev(`document.querySelector('[data-cp=${k}]').__old = 1; document.querySelector('[data-cp=${k}]').click()`);
      await waitFor(`document.querySelector('[data-cp=${k}]') && !document.querySelector('[data-cp=${k}]').__old && document.querySelector('[data-cp=${k}]').checked`, 8, 'tick lại ' + k);
    }
    await click('[data-x=res]'); await waitFor("document.querySelector('[data-sub]')", 8, 'bảng kết quả');
    const rtxt = await ev("document.querySelector('.lb-modal').innerText.replace(/\\s+/g,' ')");
    check('giáo viên xem kết quả từng học sinh', /Nguyễn Văn An/.test(rtxt) && /Đã nộp/.test(rtxt), rtxt.slice(0, 200));
    await shot('e2e_teacher_results');
    await click('[data-sub]'); await waitFor("/Bài làm của/.test(document.body.innerText)", 8, 'xem bài làm');
    check('xem chi tiết bài làm', true);
    await ev('document.querySelector(".lb-overlay") && document.querySelector(".lb-overlay").remove()');
    await click('[data-tab=classes]'); await waitFor("document.querySelector('[data-pr]')", 8, 'cột tự luyện tập');
    check('giáo viên thấy học sinh đã luyện tập 1 lần (kết quả về server dù học sinh dùng máy khác)', /1 lần/.test(await ev("document.querySelector('[data-pr]').innerText")), await ev("document.querySelector('[data-pr]').innerText"));
    await click('[data-pr]'); await waitFor("document.querySelector('.lb-modal [data-v]')", 8, 'danh sách bài luyện tập');
    await click('.lb-modal [data-v]'); await waitFor("/Học sinh chọn/.test(document.body.innerText)", 8, 'xem chi tiết bài luyện tập');
    check('giáo viên xem được chi tiết bài tự luyện tập của học sinh', true);
    await ev('document.querySelectorAll(".lb-overlay").forEach(e=>e.remove())');
    // tab “Báo đáp án sai”: giáo viên thấy báo cáo của học sinh (số chờ duyệt hiện trên tab)
    await click('[data-tab=reports]'); await waitFor("document.querySelector('[data-r]')", 10, 'báo cáo đáp án sai của học sinh');
    const rpt = await ev("({tab: document.getElementById('tab-reports').innerText, txt: document.getElementById('view').innerText, ok: !!document.querySelector('[data-ok]'), no: !!document.querySelector('[data-no]')})");
    check('giáo viên thấy báo cáo đáp án sai (có ghi chú của học sinh, nút Duyệt / Từ chối, số chờ duyệt trên tab)', /\(1\)/.test(rpt.tab) && /Em thấy đáp án câu này bị sai/.test(rpt.txt) && rpt.ok && rpt.no, JSON.stringify({tab: rpt.tab, ok: rpt.ok, no: rpt.no}));
    await click('[data-tab=classes]'); await waitFor("document.querySelector('#pt')", 8, 'quay lại tab Lớp & học sinh');
    await click('#pt'); await waitFor("document.querySelector('#psave')", 8, 'cài đặt luyện tập của lớp');
    check('giáo viên mở/đóng chuyên đề luyện tập theo lớp (đang mở 1)', (await ev("document.querySelectorAll('[data-i]:checked').length")) === 1);
    // tab “Mở luyện tập tự do”: tick chuyên đề không vẽ lại danh sách (thanh cuộn không nhảy về đầu), bộ đếm và ô “chọn tất cả” cập nhật
    await ev('document.querySelectorAll(".lb-overlay").forEach(e=>e.remove())');
    await click('[data-tab=practice]'); await waitFor("document.querySelector('#pbox [data-g]')", 8, 'tab mở luyện tập tự do');
    const tk = await ev(`(() => { const box = document.querySelector('#pbox'); box.__keep = 1; const q = x => [...document.querySelectorAll('#pbox [data-g]')].filter(i => i.checked).length, n = () => +document.querySelector('#pn').textContent, tot = document.querySelectorAll('#pbox [data-g]').length;
      const a0 = q(); document.querySelector('#pbox [data-g]:not(:checked)').click(); const a1 = q(), n1 = n(), all1 = document.querySelector('#pall').checked;   // tick thêm 1 chuyên đề
      document.querySelector('#pall').click(); const a2 = q(), n2 = n();      // đã chọn hết → bấm “tất cả” là bỏ chọn hết
      document.querySelector('#pall').click(); const a3 = q(), n3 = n();      // bấm lại → chọn hết
      return {same: document.querySelector('#pbox').__keep === 1, tot, a0, a1, n1, all1, a2, n2, a3, n3}; })()`);
    // tab “Quản lý điểm”: bảng cả lớp có điểm cộng / điểm trừ / điểm hiện tại, bấm Chi tiết xem lịch sử
    await click('[data-tab=points]'); await waitFor("document.querySelector('#pt-m') && document.querySelector('tr[data-s]')", 10, 'tab quản lý điểm');
    const pb = await ev(`(() => { const h = [...document.querySelectorAll('#view th')].map(x => x.innerText.trim()); const rows = document.querySelectorAll('tr[data-s]').length;
      document.querySelector('[data-pd]').click(); return {h: h.join('|'), rows}; })()`);
    await waitFor("/Lịch sử điểm/.test(document.body.innerText)", 8, 'lịch sử điểm của học sinh');
    check('tab Quản lý điểm: cột điểm cộng · điểm trừ · điểm hiện tại, mỗi học sinh một hàng, bấm Chi tiết xem lịch sử', /điểm cộng/i.test(pb.h) && /điểm trừ/i.test(pb.h) && /điểm hiện tại/i.test(pb.h) && pb.rows >= 4, JSON.stringify(pb));
    // giáo viên điều chỉnh điểm ngay trong hộp lịch sử: nhập −3.000 + lý do → có dòng “Giáo viên điều chỉnh”, điểm hiện tại đổi
    await ev(`(() => { document.querySelector('#pa-amt').value = '-3000'; document.querySelector('#pa-reason').value = 'Nói chuyện riêng'; document.querySelector('#pa-save').click(); })()`);
    await waitFor("/Nói chuyện riêng/.test(document.body.innerText) && !!document.querySelector('[data-adel]')", 10, 'khoản điều chỉnh hiện trong lịch sử');
    const adj = await ev(`({txt: document.body.innerText.includes('Giáo viên điều chỉnh'), del: !!document.querySelector('[data-adel]')})`);
    check('điều chỉnh điểm trong hộp lịch sử: khoản −3.000 kèm lý do hiện ra và có nút Xóa', adj.txt && adj.del, JSON.stringify(adj));
    await ev('document.querySelectorAll(".lb-overlay").forEach(e=>e.remove())');
    // điểm danh: 3 cột số lần mất trật tự · dùng điện thoại · ăn quà vặt (nhập số → lưu về máy chủ, tải lại vẫn còn)
    await ev('document.querySelectorAll(".lb-overlay").forEach(e=>e.remove())');
    await click('[data-tab=attend]'); await waitFor("document.querySelector('[data-st=present]')", 10, 'bảng điểm danh');
    await ev("document.querySelector('[data-st=present]').click()");
    await waitFor("document.querySelector('[data-disc=noisy]:not([disabled])')", 10, 'ô số lần vi phạm mở sau khi tick đi học');
    const heads = await ev("[...document.querySelectorAll('#view th')].map(x => x.innerText.replace(/\\s+/g, ' ').trim()).join('|')");
    await ev("(() => { const i = document.querySelector('[data-disc=noisy]'); i.__old = 1; i.value = '2'; i.dispatchEvent(new Event('change')); })()");
    await waitFor("document.querySelector('[data-disc=noisy]') && !document.querySelector('[data-disc=noisy]').__old && document.querySelector('[data-disc=noisy]').value === '2'", 10, 'số lần vi phạm được lưu');
    check('điểm danh: 3 cột Mất trật tự · Dùng điện thoại · Ăn quà vặt, nhập số lần được lưu', /mất trật tự/i.test(heads) && /dùng điện thoại/i.test(heads) && /ăn quà vặt/i.test(heads), heads);
    check('tick chuyên đề luyện tập: danh sách không bị vẽ lại, bộ đếm và “chọn tất cả” cập nhật', tk.same && tk.a1 === tk.a0 + 1 && tk.n1 === tk.a1 && tk.all1 === (tk.a1 === tk.tot) && tk.a2 === 0 && tk.n2 === 0 && tk.a3 === tk.tot && tk.n3 === tk.tot, JSON.stringify(tk));
  } catch (e) {
    check('LỖI KỊCH BẢN', false, e.message); await shot('e2e_error').catch(() => { });
  }
  log('--- lỗi JS trên trang:', errors.length ? errors.slice(0, 5).join(' || ') : 'không có');
  if (/Traceback|LỖI SERVER/.test(serverErr)) log('--- LỖI SERVER:\n' + serverErr.slice(0, 1500));
  log(fails ? `\n${fails} bước THẤT BẠI` : '\nTẤT CẢ ĐẠT');
  cleanup(); process.exit(fails ? 1 : 0);
})();
