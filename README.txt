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
  - Đọc PDF bằng pdf.js tải từ cdnjs: cần Internet khi import PDF lần đầu.
  - Câu tự luận không chấm tự động.
  - Các file cũ (ai.py, setup_project.py, xuly.py, Learning_by_AI_FINAL/) là công cụ/bản prototype cũ, không dùng nữa.
