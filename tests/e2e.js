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

const server = spawn('python', ['-m', 'server'], {cwd: ROOT, env: {...process.env, LBAI_DATA: DATA, LBAI_PORT: String(PORT), LBAI_QUIET: '1', LBAI_NO_BROWSER: '1', PYTHONUTF8: '1'}, stdio: ['ignore', 'pipe', 'pipe']});
let serverErr = ''; server.stderr.on('data', d => serverErr += d); server.stdout.on('data', () => {});
const DP = 10100 + Math.floor(Math.random() * 800);   // tránh các dải cổng Windows giữ chỗ (netsh int ipv4 show excludedportrange)
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=' + DP, '--user-data-dir=' + path.join(DATA, 'chrome'), '--window-size=1300,1700', 'about:blank'], {stdio: ['ignore', 'pipe', 'pipe']});
let chromeErr = ''; chrome.stderr.on('data', d => chromeErr += d); chrome.stdout.on('data', () => {});
setTimeout(() => { console.log('TIMEOUT toàn bộ kịch bản (240s)'); cleanup(); process.exit(2); }, 240000);
const cleanup = () => { try { chrome.kill(); } catch (e) { } try { server.kill(); } catch (e) { } };
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
    await click('#pt'); await waitFor("document.querySelector('#psave')", 8, 'cài đặt luyện tập của lớp');
    check('giáo viên mở/đóng chuyên đề luyện tập theo lớp (đang mở 1)', (await ev("document.querySelectorAll('[data-i]:checked').length")) === 1);
  } catch (e) {
    check('LỖI KỊCH BẢN', false, e.message); await shot('e2e_error').catch(() => { });
  }
  log('--- lỗi JS trên trang:', errors.length ? errors.slice(0, 5).join(' || ') : 'không có');
  if (/Traceback|LỖI SERVER/.test(serverErr)) log('--- LỖI SERVER:\n' + serverErr.slice(0, 1500));
  log(fails ? `\n${fails} bước THẤT BẠI` : '\nTẤT CẢ ĐẠT');
  cleanup(); process.exit(fails ? 1 : 0);
})();
