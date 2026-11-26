LEARNING BY AI — MẠNG XÃ HỘI GIÁO DỤC + TRỢ LÝ TẠO ĐỀ (có máy chủ, tài khoản, cơ sở dữ liệu)
==========================================================================================

1. CHẠY
-------
Cần Python 3.10 trở lên (không cần cài thêm thư viện nào).

  Windows:  nhấp đúp run.bat      (hoặc:  python -m server)

Trình duyệt tự mở trang đăng nhập, thường là http://localhost:5500 .
Nếu cổng 5500 bận hoặc bị Windows chặn, máy chủ tự thử cổng khác và in địa chỉ trong cửa sổ lệnh.

LẦN ĐẦU: trang đăng nhập hiện form "Thiết lập lần đầu" để tạo tài khoản QUẢN TRỊ VIÊN
(không có tài khoản mặc định, không có mật khẩu mặc định).

Biến môi trường (tuỳ chọn):
  LBAI_HOST=0.0.0.0     cho máy khác trong mạng LAN truy cập (mặc định chỉ máy này)
  LBAI_PORT=5500        cổng ưu tiên
  LBAI_DATA=D:\lbai     thư mục lưu dữ liệu. Mặc định: data/ cạnh mã nguồn; nếu mã nguồn nằm trong OneDrive thì
                        dùng %LOCALAPPDATA%\LearningByAI\data (tránh khóa/hỏng SQLite và tự đồng bộ dữ liệu học sinh lên đám mây)
  LBAI_COOKIE_SECURE=1  bật cờ Secure cho cookie khi chạy sau HTTPS

2. VAI TRÒ VÀ TÀI KHOẢN
-----------------------
  Quản trị viên : tạo tài khoản giáo viên (trang "Lớp & học sinh" → tab Giáo viên).
  Giáo viên     : tạo lớp; tạo tài khoản học sinh (từng em hoặc dán cả danh sách từ Excel);
                  tạo tài khoản phụ huynh liên kết với học sinh; cấp lại mật khẩu; vô hiệu hóa tài khoản.
  Học sinh      : đăng nhập, làm bài được giao, xem kết quả.
  Phụ huynh     : đăng nhập, chỉ xem kết quả của con mình.

Tên đăng nhập học sinh tạo tự động từ họ tên (Nguyễn Văn An → an.nv). Mật khẩu ngẫu nhiên 8 ký tự,
chỉ hiển thị MỘT lần lúc tạo (tải CSV hoặc in phiếu ngay). Lần đầu đăng nhập học sinh phải đổi mật khẩu.
Mật khẩu được băm bằng scrypt, không lưu dạng chữ thường.

3. QUY TRÌNH DẠY – GIAO – CHẤM
------------------------------
 1) AI Copilot → "Import đề mới (tự động)": chọn KHỐI, tải PDF/ảnh/TXT (đề + đáp án trong cùng file, hoặc file đáp án riêng
    đặt tên có chữ "đáp án"). Hệ thống tự cắt câu, tự phân dạng, tự đọc đáp án; trang scan được đọc bằng OCR cài sẵn
    (public/vendor/tesseract, chạy trên máy, không cần Internet). Nút "Cắt câu hỏi từ PDF / ảnh" dùng khi cần cắt tay.
    (mỗi giáo viên một kho riêng, lưu trên máy chủ).
    Câu hỏi được tách theo dạng: trắc nghiệm, đúng/sai (4 ý a-d), trả lời ngắn, tự luận; kèm ảnh cắt từ PDF.
 2) Gắn nhãn Môn · Khối · Chuyên đề; tick chọn NHIỀU chuyên đề; nhập số mã đề (1–30) và số câu mỗi dạng → Generate.
    LỜI GIẢI CHI TIẾT từng câu được đọc kèm khi import: viết ngay sau câu ("Lời giải: ..."), ở phần
    "HƯỚNG DẪN GIẢI" cuối đề, hoặc trong file lời giải riêng tải lên cùng lúc. Với PDF/ảnh, lời giải được cắt
    thành ảnh (giữ nguyên công thức, hình vẽ). Xem/sửa/gõ thêm lời giải trong "Quản lý & sửa đáp án" → 📘 Lời giải.
 3) Giao cho lớp (hạn nộp, thời gian làm, số lần làm) → học sinh làm online, MÁY CHỦ chấm điểm
    (học sinh không bao giờ nhận được đáp án trước khi nộp). Giáo viên xem kết quả tại "Lớp & học sinh".
    Cách phân mã đề: xen kẽ · ngẫu nhiên (chia đều số học sinh cho các mã) · học sinh tự chọn ·
    CHỈ ĐỊNH (chọn mã đề hoặc "không giao" cho từng học sinh). Sau khi giao vẫn đổi được ở
    "Bài đã giao → 🔀 Mã đề" (giao thêm, bỏ giao em chưa làm; em đang làm dở giữ mã đề của lượt đang làm).
    Học sinh xem đáp án & lời giải: ngay sau khi nộp · sau khi hết hạn nộp/đóng bài · không cho xem.
    Học sinh vào "Bài của tôi → 📖 Xem lại bài": từng câu đúng/sai, mình chọn gì, đáp án đúng, lời giải chi tiết.
 4) Hoặc IN nhiều mã đề cùng lúc, cuối mỗi đề có PHIẾU TRẢ LỜI; chụp ảnh phiếu học sinh đã tô →
    "Chấm bài bằng ảnh phiếu" tự nhận mã đề, đọc đáp án và chấm điểm (xuất CSV).
    Chụp đủ 4 ô vuông đen ở góc phiếu, đủ sáng; dùng bút đen tô kín ô.
 5) Bảng tin: đăng bài, tài liệu (đính kèm file), thích, bình luận, lưu, theo dõi giáo viên.
 6) TỰ LUYỆN TẬP: giáo viên vào "Lớp & học sinh" → chọn lớp → "📚 Luyện tập tự do" → tick các chuyên đề trong ngân hàng
    được phép luyện tập (chỉ tính câu đã có đáp án). Học sinh của lớp vào "Bài của tôi" → tab "🎯 Tự luyện tập":
    chọn chuyên đề, số câu từng dạng, thời gian → hệ thống bốc câu ngẫu nhiên tạo đề; nộp bài là có điểm, đáp án và lời giải ngay.
    Kết quả lưu ở máy chủ: học sinh xem lại lịch sử; giáo viên xem số lần/điểm TB trong bảng học sinh và mở từng bài;
    phụ huynh thấy thống kê tự luyện tập của con.
 7) ĐIỂM CỘNG TỰ LUYỆN TẬP: "Lớp & học sinh" → tab "⭐ Điểm cộng" → chọn lớp, đặt số điểm cộng cho mỗi câu làm đúng
    theo dạng câu (mặc định: trắc nghiệm 10, đúng/sai 40, trả lời ngắn 50; đặt 0 để không cộng). Học sinh được cộng dồn
    khi nộp bài tự luyện tập. Câu đúng/sai phải đúng cả 4 ý; mỗi câu hỏi chỉ được cộng lần đầu làm đúng trong tháng.
    Điểm tính theo tháng (giờ Việt Nam), ngày 1 hằng tháng tự về 0; các tháng trước vẫn chọn xem lại được.
    Bảng điểm cộng xếp hạng cả lớp, xem chi tiết từng học sinh, tải CSV. Học sinh thấy điểm cộng tháng này và hạng trong lớp
    ở tab "🎯 Tự luyện tập". Đổi mức điểm chỉ áp dụng cho các lần nộp bài sau.
 8) ĐIỂM DANH & HỌC PHÍ: "Lớp & học sinh" → tab "📋 Điểm danh".
    - "🗓 Lịch học các lớp": tick các thứ lớp có buổi học, ghi giờ học, học phí mỗi buổi và ngày bắt đầu áp dụng.
      Đổi lịch/học phí chỉ tính từ ngày áp dụng, các ngày trước giữ theo lịch cũ.
    - "✅ Điểm danh": hiện mọi học sinh của các lớp mình phụ trách theo ngày (mặc định hôm nay). Em có lịch hôm nay được
      tự tick "Đi học"; em nào nghỉ thì tick "Nghỉ" và ghi lý do. Em không có lịch đến học bù thì tick "Đi học".
      Lọc theo lớp để dùng nút "Lớp không học hôm nay" (nghỉ lễ, cô bận) hoặc "Trả về theo lịch". Thay đổi lưu ngay.
    - "📊 Thống kê tháng · học phí": lưới từng ngày trong tháng, số buổi có lịch / đi học / nghỉ và thành tiền
      (số buổi đi học × học phí mỗi buổi). Chỉ tính tới hôm nay. Tải CSV hoặc in bảng học phí có cột ký nhận.

MẠNG NỘI BỘ (WIFI/LAN, không cần Internet): chạy run-lan.bat trên máy chủ, máy khác mở địa chỉ IP được in ra.
MÃ QR ĐĂNG NHẬP: khi chạy run-lan.bat, trang "Lớp & học sinh" của quản trị viên hiện mã QR chứa địa chỉ đăng nhập
(mã tạo ngay trên máy, không cần Internet). Mọi người cùng mạng wifi mở camera quét là vào trang đăng nhập;
có nút phóng to để chiếu và nút in. Phiếu tài khoản in cho học sinh cũng kèm mã QR này.
Mọi kết quả (bài được giao, bài tự luyện tập) đều gửi về máy chủ nên giáo viên thấy ngay trên trang quản lý.
Nếu mất kết nối đúng lúc nộp bài, bài làm vẫn được giữ trên máy học sinh và có thể bấm nộp lại.

4. CẤU TRÚC DỰ ÁN
-----------------
  server/        máy chủ Python (app.py: API + file tĩnh · db.py: CSDL SQLite · security.py · grading.py)
  public/        giao diện (HTML/CSS/JS) — chỉ thư mục này được phục vụ ra ngoài
  data/          CSDL + file upload (tạo khi chạy; ĐÃ loại khỏi Git). SAO LƯU thư mục dữ liệu định kỳ.
                 Đường dẫn thực tế được in ra trong cửa sổ lệnh khi khởi động.
  tests/         test_api.py: kiểm thử API:  python -m unittest discover -s tests -v
                 e2e.js: kiểm thử trên trình duyệt thật (cần Node + Chrome):  node tests/e2e.js
  legacy_prototype/  giao diện prototype cũ (chạy bằng localStorage), giữ lại để tham khảo

5. BẢO MẬT & DỮ LIỆU CÁ NHÂN
----------------------------
  - Phiên đăng nhập bằng cookie HttpOnly + SameSite=Lax; chống CSRF (header X-Requested-With + kiểm tra Origin).
  - Khóa tạm khi đăng nhập sai nhiều lần; nhật ký thao tác nhạy cảm (đăng nhập, tạo/xóa tài khoản, đặt lại mật khẩu).
  - Phân quyền theo vai trò ở MÁY CHỦ: giáo viên chỉ thấy lớp/học sinh/ngân hàng của mình;
    học sinh chỉ thấy bài được giao cho mình; phụ huynh chỉ thấy con mình.
  - File tải lên giới hạn loại và dung lượng; loại MIME do máy chủ quyết định.
  - Điểm số và bài làm của học sinh không xuất hiện trên bảng tin.
  - Khi đưa ra Internet: BẮT BUỘC chạy sau HTTPS (nginx/Caddy...) và đặt LBAI_COOKIE_SECURE=1.
    Dữ liệu học sinh là dữ liệu cá nhân (Luật 91/2025/QH15, NĐ 356/2025/NĐ-CP): chỉ dùng đúng mục đích
    giáo dục đã thông báo, giới hạn người truy cập, sao lưu và xóa khi hết mục đích.

6. GHI CHÚ
----------
  - PDF được đọc bằng pdf.js và OCR (Tesseract.js) cài sẵn ở public/vendor, chạy ngay trên trình duyệt — không cần Internet.
  - Câu tự luận không chấm tự động.
  - Các file cũ (ai.py, setup_project.py, xuly.py, Learning_by_AI_FINAL/) là công cụ/bản prototype cũ, không dùng nữa.

7. ĐƯA LÊN MẠNG / CHẠY THỬ TRÊN RENDER
--------------------------------------
Biến môi trường dành cho chạy sau proxy / đám mây:
  PORT                  cổng do nền tảng cấp (Render, Railway...) — có PORT thì tự nghe ở 0.0.0.0 và chỉ dùng cổng đó
  LBAI_TRUST_PROXY=1    đứng sau proxy tin cậy: lấy IP thật từ X-Forwarded-For (khóa đăng nhập sai đúng người, không khóa chung cả lớp)
  LBAI_PROXY_HOPS=1     số lớp proxy (lấy địa chỉ thứ N từ bên phải của X-Forwarded-For; nếu ngoài Render còn Cloudflare thì đặt 2)
  LBAI_SETUP_CODE=...   mã bí mật bắt buộc nhập ở trang "Thiết lập lần đầu" → người lạ vào trước không chiếm được quyền quản trị
  LBAI_COOKIE_SECURE=1  bắt buộc khi chạy HTTPS
Chạy thử trên Render (file render.yaml có sẵn):
  1) Đẩy mã lên GitHub; trên Render chọn New + → Blueprint → chọn repo (repo private thì cấp quyền cho Render đọc repo).
  2) Khi được hỏi LBAI_SETUP_CODE, tự nhập một chuỗi bí mật (đừng ghi vào file).
  3) Mở địa chỉ https://<tên>.onrender.com → nhập mã thiết lập và tạo tài khoản quản trị NGAY, trước khi gửi link cho ai.
Gói free: đĩa tạm thời (khởi động lại là mất dữ liệu) và "ngủ" sau 15 phút không dùng → chỉ để chạy thử với dữ liệu giả.
Chạy thật: dùng gói trả phí có đĩa lưu bền (LBAI_DATA=/var/data) hoặc VPS, và sao lưu thư mục dữ liệu hằng ngày.

8. SAO LƯU TỰ ĐỘNG RA KHO NGOÀI (để bản free của Render không mất dữ liệu)
-------------------------------------------------------------------------
Ứng dụng tự đẩy bản sao (CSDL + file tải lên, nén zip) ra kho ngoài vài phút một lần khi có thay đổi, đẩy lần cuối khi bị tắt (SIGTERM),
và tự khôi phục khi khởi động lại mà chưa có CSDL cục bộ. Có đĩa lưu bền thì dữ liệu sẵn trên đĩa, không khôi phục đè.
  Cách A — Supabase Storage (miễn phí):
    1) Tạo một dự án Supabase RIÊNG chỉ để sao lưu (đừng dùng chung dự án khác, vì service key có toàn quyền với dự án đó).
    2) Lấy Project URL (https://xxxx.supabase.co) và service_role key ở Project Settings → API.
    3) Trên Render đặt LBAI_BACKUP_URL và LBAI_BACKUP_KEY. Ứng dụng tự tạo bucket riêng tư "lbai-backup".
    Gói free của Supabase giới hạn ~50 MB mỗi file: bản sao lưu lớn hơn LBAI_BACKUP_CHUNK_MB (mặc định 40) được tự chia thành nhiều phần và ghép lại khi khôi phục. Tổng một bản tối đa LBAI_BACKUP_MAX_MB (mặc định 900); kho Supabase free chỉ có 1 GB nên khi gần đầy hãy chuyển sang gói có đĩa lưu bền.
  Cách B — thư mục: LBAI_BACKUP_DIR=/duong/dan (ổ gắn ngoài / ổ mạng).
  LBAI_BACKUP_INTERVAL=300  giây giữa hai lần kiểm tra. Mỗi ngày có thêm bản riêng quay vòng 7 ngày (daily-0 … daily-6) để cứu khi dữ liệu bị hỏng.
An toàn: nếu khôi phục khi khởi động bị LỖI (mạng, sai khóa, file hỏng) thì ứng dụng TẠM DỪNG sao lưu để không ghi đè bản tốt bằng CSDL trống;
quản trị viên thấy cảnh báo đỏ và cần xử lý nguyên nhân rồi khởi động lại.
Giới hạn: nếu dịch vụ bị tắt đột ngột (mất điện/crash) có thể mất tối đa vài phút dữ liệu mới nhất. Dữ liệu học sinh lưu ở kho ngoài là dữ liệu cá nhân:
dùng bucket riêng tư, giữ khóa bí mật, và xem lại yêu cầu pháp lý về lưu trữ dữ liệu ngoài Việt Nam.

9) IMPORT HÀNG LOẠT CHUYÊN ĐỀ (tools/bulk_import.js)
  Dùng khi có cả thư mục PDF chuyên đề (ví dụ "TOÁN 9", 33 file). Chạy đúng đường import của giao diện web nên kết quả giống hệt khi bấm tay.
  File chuyên đề thường KHÔNG có đáp án: Claude giải từ ảnh các câu rồi nạp đáp án bằng lệnh apply.
  Cần Node.js và Chrome trên máy. Đặt thông tin đăng nhập giáo viên trong biến môi trường (KHÔNG gõ mật khẩu vào lệnh, KHÔNG ghi vào file):
      setx LBAI_USER "tên đăng nhập"      setx LBAI_PASS "mật khẩu"      (mở lại cửa sổ lệnh / VS Code sau khi đặt)
      LBAI_URL mặc định là https://learning-by-ai.onrender.com
  Lệnh:
      node tools/bulk_import.js status                              xem chuyên đề nào đã có, còn bao nhiêu câu thiếu đáp án
      node tools/bulk_import.js import "TOÁN 9" --only 05           import (bỏ --only để import cả thư mục; chuyên đề đã có thì bỏ qua, --again để ép)
      node tools/bulk_import.js sheets 05                           xuất ảnh các câu chưa có đáp án vào tools/_work/05 (Claude đọc và giải)
      node tools/bulk_import.js apply tools/answers/05.txt --dry    xem trước; bỏ --dry để ghi. --force để ghi đè đáp án đã có
  Thêm --local để chạy thử trên máy chủ tạm của máy này (không đụng web thật).
  Lưu ý: ảnh cắt và phân dạng do trình duyệt trên WEB THẬT thực hiện, nên web phải đang chạy bản code mới nhất.

10. AI GIẢI ĐÁP ÁN KHI IMPORT ĐỀ (tùy chọn; mặc định dùng Google Gemini gói MIỄN PHÍ)
   - Bật: lấy khóa miễn phí ở Google AI Studio, đặt biến môi trường GEMINI_API_KEY trên MÁY CHỦ (Render: Environment → GEMINI_API_KEY; chạy máy nhà: đặt biến
     môi trường rồi chạy lại). Không cần cài thêm gói nào. Không bao giờ dán khóa vào chat, mã nguồn hay file cấu hình trong repo.
   - Model mặc định gemini-3.8-flash; nếu Google đổi tên model thì đặt LBAI_AI_MODEL_GEMINI=<tên model hiện hành>.
   - Dùng: (a) Import đề mới → tick "Nhờ AI giải đáp án" (áp dụng cho câu chưa đọc được đáp án; đề chụp ảnh cũng được vì ảnh đi qua OCR + cắt từng câu);
     (b) Quản lý & sửa đáp án → "🤖 AI giải câu chưa có đáp án" cho các câu đang chọn/đang lọc.
   - Đáp án AI luôn có nhãn 🤖 kèm mức tin cậy tới khi giáo viên bấm "Đã kiểm tra" (hoặc tự sửa đáp án). Lọc "Đáp án AI chưa xác nhận" để rà lại.
     Khi giao bài mà còn đáp án AI chưa xác nhận, hệ thống hỏi lại. AI miễn phí có thể sai, nhất là câu khó — câu cần độ chính xác cao hãy tự giải/duyệt kỹ.
   - Quyền riêng tư: chỉ ảnh/chữ của câu hỏi được gửi đi (không có tên, lớp hay thông tin học sinh). Ở gói miễn phí, Google ghi rõ nội dung gửi lên CÓ THỂ được
     dùng để cải thiện sản phẩm của Google → đừng gửi đề còn mật; hệ thống luôn hỏi xác nhận trước khi gửi.
   - Giới hạn: gói miễn phí có giới hạn số yêu cầu mỗi phút/ngày (Google quy định và có thể thay đổi): hệ thống gửi từng câu một, tự thử lại khi chạm giới hạn
     theo phút, và báo rõ khi hết hạn mức ngày. Ngoài ra có giới hạn LBAI_AI_HOURLY=400 câu/giờ/giáo viên.
   - Tùy chọn trả phí chính xác hơn: LBAI_AI_PROVIDER=claude + ANTHROPIC_API_KEY + pip install -r requirements.txt (model mặc định claude-opus-5-5, đổi bằng
     LBAI_AI_MODEL_CLAUDE, ví dụ claude-haiku-5-5 cho rẻ).

11. BĂNG THÔNG RENDER (gói Hobby/free chỉ có 5 GB lưu lượng RA mỗi tháng cho cả workspace; vượt thì toàn bộ dịch vụ bị khóa tới đầu tháng sau)
   - Lưu lượng đẩy lên kho sao lưu (Supabase) cũng bị tính. Vì vậy sao lưu đã được làm TIẾT KIỆM: ảnh/file tải lên nằm ở các gói bất biến (img-…, up-…) chỉ gửi một lần,
     còn `latest.zip` chỉ chứa CSDL đã bỏ ảnh (nhỏ); chu kỳ mặc định 30 phút (LBAI_BACKUP_INTERVAL). Bản sao lưu kiểu cũ (một zip chứa cả ảnh) vẫn khôi phục được;
     lần sao lưu đầu tiên sau khi nâng cấp sẽ chuyển sang kiểu mới (gửi các gói ảnh một lần duy nhất).
   - Giao diện được nén gzip, trình duyệt giữ đệm (ETag → 304), ảnh theo mã giữ 1 năm → người dùng quay lại gần như không tốn băng thông.
   - Muốn chạy ngay khi Render đang bị khóa: chạy run-public.bat trên máy cá nhân (cần cloudflared): hệ thống chạy tại máy, Cloudflare Quick Tunnel đưa ra Internet
     miễn phí; đường dẫn trycloudflare.com ĐỔI MỖI LẦN CHẠY và không có cam kết hoạt động liên tục. Trước khi Render chạy lại hãy TẮT máy chủ trên máy cá nhân
     (chỉ một nơi được ghi vào kho sao lưu), để Render khôi phục đúng bản mới nhất.


12. CHUYỂN SANG FLY.IO (phương án dự phòng khi Render không đủ; chi phí ước tính khoảng 3–5 USD/tháng, cần thẻ thanh toán)
   Đã có sẵn Dockerfile, fly.toml, .dockerignore. Dữ liệu nằm ở đĩa bền (/data) nên không phải khôi phục mỗi lần khởi động; vẫn nên giữ sao lưu Supabase.
   Các bước (chạy ở thư mục dự án, cần cài flyctl và đăng nhập `fly auth login`):
     1) fly apps create learning-by-ai          (đổi tên nếu trùng, nhớ sửa dòng app trong fly.toml)
     2) fly volumes create lbai_data --region sin --size 1
     3) fly secrets set LBAI_SETUP_CODE=...  LBAI_BACKUP_URL=...  LBAI_BACKUP_KEY=...  GEMINI_API_KEY=...     (tự nhập giá trị, không ghi vào file hay gửi vào chat)
        Lần đầu muốn lấy lại dữ liệu hiện có: giữ LBAI_BACKUP_URL/KEY trỏ tới kho Supabase đang dùng, hệ thống tự khôi phục khi đĩa còn trống.
     4) fly deploy
     5) fly status / fly logs để kiểm tra; đường dẫn dạng https://learning-by-ai.fly.dev
   Lưu ý: CHỈ MỘT nơi được ghi vào kho sao lưu. Trước khi bật Fly, hãy tắt dịch vụ Render (hoặc xóa LBAI_BACKUP_KEY ở Render), và ngược lại.
   Chạy 1 máy duy nhất (SQLite không chia sẻ giữa nhiều máy): `fly scale count 1`.

13. PHẠT BÀI ĐƯỢC GIAO KHÔNG LÀM + HỌC SINH TỰ XEM ĐIỂM
   - Mỗi bài giáo viên giao CÓ HẠN NỘP mà đến hạn học sinh vẫn chưa nộp → bị trừ 5.000 điểm (mặc định) cho mỗi bài. Trừ vào tháng của hạn nộp.
   - Bài không đặt hạn nộp thì không bị trừ (hệ thống không biết lúc nào là quá hạn). Gia hạn bài thì điểm bị trừ được tính lại (hết trừ).
   - Giáo viên đổi mức phạt ở tab "Điểm danh" > "Phạt đi muộn · Thưởng điểm" (ô "Phạt không làm bài"; áp dụng từ tháng đặt trở đi; 0 = tắt).
     Thống kê đi học có thêm cột "Phạt không làm bài" và điểm ròng đã trừ khoản này.
   - Học sinh xem ở trang "Bài của tôi" > tab "Điểm của tôi": điểm ròng từng tháng, chi tiết thưởng bài kiểm tra, thưởng luyện tập, phạt đi muộn, các bài quá hạn chưa nộp.

14. TAB "QUẢN LÝ ĐIỂM" (giáo viên / quản trị, trang Lớp & học sinh)
   - Bảng cả lớp (hoặc tất cả lớp bạn quản lý): điểm cộng, điểm trừ, điểm hiện tại (ròng), xếp hạng cao → thấp. Học sinh âm điểm bị bôi đỏ.
   - Chọn "Từ trước đến nay" (mặc định) hoặc từng tháng. Bấm "Chi tiết" (hoặc bấm vào hàng) xem lịch sử từng khoản: thưởng bài kiểm tra, thưởng tự luyện tập,
     phạt đi muộn, phạt bài quá hạn không làm; có số dư lũy kế và tổng hợp theo tháng. Có nút tải CSV.
   - Điểm cộng = thưởng bài kiểm tra + thưởng tự luyện tập. Điểm trừ = phạt đi muộn + phạt không làm bài. Điểm hiện tại = cộng − trừ (cùng cách tính với tab "Điểm của tôi" của học sinh).

15. GIÁO VIÊN ĐIỀU CHỈNH ĐIỂM
   - Trong tab "Quản lý điểm" > "Chi tiết" của học sinh: ô "Điều chỉnh điểm" (số dương = cộng, số âm = trừ, bắt buộc ghi lý do, có thể chọn ngày).
   - Khoản phạt tự động (đi muộn, không làm bài) có nút "Miễn": hoàn lại đúng số điểm bị trừ (vd. học sinh nghỉ học có phép), ghi thành một khoản điều chỉnh.
   - Khoản điều chỉnh có nút "Xóa" để hủy. Mọi thao tác được ghi nhật ký. Học sinh thấy khoản điều chỉnh (kèm lý do) ở tab "Điểm của tôi".
   - Lưu ý: khoản "Miễn" là khoản cộng riêng, không xóa khoản phạt gốc. Nếu sau đó gia hạn bài (phạt gốc tự mất) thì nên xóa khoản miễn để điểm không dư.

16. BÀI NÀO ĐƯỢC CỘNG ĐIỂM / BỊ TRỪ ĐIỂM
   - Mỗi bài giao có HAI ô tick riêng: "Cộng điểm" (học sinh đạt mức thưởng thì được cộng, mục "Thưởng bài kiểm tra") và "Trừ điểm" (quá hạn nộp mà chưa nộp thì bị trừ).
     Đặt khi tạo bài (mặc định cả hai đều có) và đổi bất kỳ lúc nào ở tab "Bài đã giao" (cột "Tính điểm": ＋ Cộng, − Trừ).
   - Ví dụ: bài chỉ để khuyến khích → tick Cộng, bỏ Trừ; bài bắt buộc phải nộp → tick Trừ, bỏ Cộng; bài chỉ để luyện → bỏ cả hai.
   - Đổi tick là điểm tính lại ngay (điểm không lưu cứng). Bài đã giao từ trước mặc định có cả hai. Điểm cộng luyện tập tự do không phụ thuộc các ô tick này.

17. VI PHẠM TRONG BUỔI HỌC (mất trật tự · dùng điện thoại · ăn quà vặt)
   - Tab "Điểm danh" > "Điểm danh": ba cột nhập SỐ LẦN trong buổi học (chỉ nhập được khi học sinh đi học). Mỗi lần trừ 5.000 điểm (mặc định).
   - Đổi mức phạt mỗi lần ở "Phạt đi muộn · Thưởng điểm" (ô "Vi phạm trong buổi học", áp dụng từ tháng đặt trở đi; 0 = tắt).
   - Điểm trừ vào "Điểm hiện tại": hiện trong thống kê tháng (cột "Vi phạm (lần)" và "Phạt vi phạm", có trong CSV), tab "Quản lý điểm" (lịch sử từng ngày) và tab "Điểm của tôi" của học sinh.
   - Học sinh nghỉ học thì số lần vi phạm bị xóa. Nhập sai (âm, quá 99, không phải số nguyên) bị từ chối. Muốn miễn một khoản: "Miễn" trong lịch sử điểm của học sinh.

18. IMPORT ĐỀ CÓ KÈM LỜI GIẢI TRONG CÙNG FILE
   - Dạng file: vài trang đầu là đề (PHẦN I / II / III), các trang sau là lời giải bắt đầu lại bằng chữ "PHẦN I" lần thứ hai; mỗi câu được in lại, có dòng "Lời giải" và đáp án ngay sau đó
     (Phần I: "Chọn D"; Phần II: "a) Đúng. b) Sai. …"; Phần III: "Đáp án: …").
   - Khi import (nút "Import đề" > chọn file) có ô tick "📘 File đề có kèm lời giải". Tick thì hệ thống ép tách đề / lời giải theo thứ tự trong file:
     lấy đáp án sau chữ "Lời giải" của từng câu, cắt ảnh lời giải từng câu gắn vào đúng câu trong đề (Phần I, II, III khớp theo số câu của từng phần).
   - Không tick vẫn tự nhận ra khi dấu hiệu rõ (PHẦN I lặp lại hoặc số câu quay về 1 và câu đầu in lại đúng câu 1 của đề, có nhiều dòng "Lời giải").
     Hai đề nối nhau không có lời giải thì không bị cắt nhầm.
   - File có tiêu đề riêng ("HƯỚNG DẪN GIẢI", "ĐÁP ÁN") hoặc có bảng đáp án cuối đề vẫn đọc như trước.

19. HỌC SINH BÁO ĐÁP ÁN SAI · GIÁO VIÊN / QUẢN TRỊ DUYỆT
   - Học sinh xem lại bài (bài kiểm tra khi đã được xem đáp án, hoặc bài tự luyện): mỗi câu chấm tự động có nút "🚩 Báo đáp án sai". Học sinh chọn đáp án mình cho là đúng
     (có thể bỏ trống), ghi lý do và đính kèm tối đa 3 ảnh (ảnh được thu nhỏ trước khi gửi). Mỗi câu chỉ báo một lần khi đang chờ duyệt; tối đa 30 báo cáo chờ duyệt mỗi học sinh.
   - Giáo viên / quản trị: tab "🚩 Báo đáp án sai" (số chờ duyệt hiện trên tab) xem câu hỏi, đáp án hiện tại, đề xuất, ghi chú và ảnh của học sinh; chọn đáp án đúng rồi
     "Duyệt và sửa đáp án" hoặc "Từ chối". Giáo viên chỉ thấy báo cáo của bài / ngân hàng của mình; quản trị thấy tất cả.
   - Khi duyệt: đáp án được sửa ở ngân hàng câu hỏi, mọi đề đã giao có câu đó (mã đề đã đảo phương án được đối chiếu theo nội dung phương án) và bài tự luyện của lớp;
     các bài kiểm tra đã nộp được CHẤM LẠI nên điểm kiểm tra và điểm thưởng tự cập nhật. Học sinh thấy trạng thái (chờ duyệt / đã duyệt / từ chối kèm lời giáo viên) ngay trong màn xem lại.
   - Lưu ý: điểm cộng của bài tự luyện đã được cộng trước đó (điểm thưởng theo từng câu) không tính lại; chỉ điểm số của bài luyện tập được chấm lại.
