/* sample_exam.js — đề mẫu có sẵn (đã phân dạng, có đáp án) để import vào ngân hàng câu hỏi bằng một nút.
   Nguồn: Đề tuyển sinh lớp 10 THPT môn Toán, Hải Phòng, năm học 2026–2027, mã đề 230 (đáp án theo MATHX.vn).
   Quy ước dữ liệu giống ngân hàng câu hỏi:
     mcq   : opts (4 phương án), ans = chỉ số 0–3
     tf    : sts (4 ý a–d), ans = [0|1 ...] với 0 = Đúng, 1 = Sai
     short : ans = chuỗi đáp án
   Hình vẽ trong đề gốc được mô tả bằng chữ trong phần dẫn của câu. */
(() => {
'use strict';
const SRC = 'Đề mẫu · Tuyển sinh 10 Hải Phòng 2026-2027 (mã đề 230)';
const T_CIRCLE = 'Đường tròn & góc với đường tròn', T_EQ = 'Phương trình & bất phương trình bậc nhất', T_ROOT = 'Căn bậc hai & căn bậc ba',
  T_SYS = 'Hệ hai phương trình bậc nhất hai ẩn', T_VIETE = 'Phương trình bậc hai & Định lý Viète', T_TRIG = 'Hệ thức lượng trong tam giác vuông',
  T_STAT = 'Thống kê & xác suất', T_SOLID = 'Hình trụ, hình nón, hình cầu', T_FUNC = 'Hàm số bậc nhất & bài toán thực tế';

const mcq = (n, topic, q, opts, ans, lv) => ({id: `sm230_tn${n}`, t: 'mcq', lv: lv || 1, topic, q, opts, ans});
const tf = (n, topic, q, sts, ans, sol) => ({id: `sm230_ds${n}`, t: 'tf', lv: 2, topic, q, sts, ans, sol});
const sh = (n, topic, q, ans, sol) => ({id: `sm230_tln${n}`, t: 'short', lv: 3, topic, q, ans, sol});

const EXAMS = [{
  id: 'hp-toan-9-2026-230',
  title: 'Toán 9 · Tuyển sinh lớp 10 Hải Phòng 2026–2027 (mã đề 230)',
  subject: 'Toán', grade: '9',
  questions: [
    /* PHẦN I — trắc nghiệm nhiều phương án lựa chọn */
    mcq(1, T_CIRCLE, 'Cho tứ giác ABCD nội tiếp đường tròn. Nếu số đo cung BAD = 70° thì số đo cung BCD bằng', ['90°', '70°', '20°', '110°'], 3),
    mcq(2, T_EQ, 'Nghiệm của phương trình 2(x + 2) − 3 = 3x − 10 là', ['x = 10', 'x = −10', 'x = 7', 'x = 11'], 3),
    mcq(3, T_CIRCLE, 'Cho lục giác đều ABCDEF nội tiếp đường tròn tâm O (các đỉnh A, B, C, D, E, F lần lượt theo chiều ngược kim đồng hồ; O là giao của các đường chéo chính). Số đo của góc ABC bằng', ['90°', '60°', '150°', '120°'], 3),
    mcq(4, T_ROOT, 'Với hai số thực a ≥ 0, b ≥ 0, thì √(a·b) bằng', ['√a · √b', 'a · b', 'a · √b', '√a · b'], 0),
    mcq(5, T_SYS, 'Gọi (x₀; y₀) là nghiệm của hệ phương trình { x + 3y = 4 ; 2x − y = 1 }. Giá trị của biểu thức A = 3x₀ + 5y₀ là', ['−2', '2', '8', '−8'], 2),
    mcq(6, T_VIETE, 'Tổng hai nghiệm của phương trình 2x² − 7x − 3 = 0 bằng', ['3/2', '−3/2', '−7/2', '7/2'], 3),
    mcq(7, T_ROOT, 'Điều kiện xác định của biểu thức A = 1/√(x − 3) là', ['x > 3', 'x ≥ 3', 'x ≠ 3', 'x < 3'], 0),
    mcq(8, T_CIRCLE, 'Cho đường tròn (O; 10 cm) và dây cung AB. Biết khoảng cách từ O đến AB là 8 cm. Độ dài đoạn thẳng AB là', ['8 cm', '6 cm', '12 cm', '10 cm'], 2),
    mcq(9, T_STAT, 'Gieo một con xúc xắc sáu mặt (số chấm ở các mặt khác nhau và là một số tự nhiên từ 1 đến 6) cân đối và đồng chất 2 lần liên tiếp. Xác suất để tổng số chấm xuất hiện trong 2 lần gieo bằng 7 là', ['7/36', '1/12', '1/6', '1/3'], 2, 2),
    mcq(10, T_SOLID, 'Một hình cầu có bán kính là 3 cm. Diện tích của mặt cầu đó bằng', ['24π cm²', '9π cm²', '27π cm²', '36π cm²'], 3),
    mcq(11, T_STAT, 'Một nhóm gồm 8 học sinh được kiểm tra môn Toán đạt các điểm số sau: 6; 7; 7; 8; 8; 8; 9; 10. Tần số của dữ liệu điểm 8 là', ['8', '2', '3', '1'], 2),
    mcq(12, T_TRIG, 'Cho tam giác ABC vuông tại A, biết AB = 2 cm và góc ABC = 60°. Khẳng định nào sau đây là đúng?', ['AC = √3 cm', 'BC = 2√3 cm', 'AC = 2√3 cm', 'BC = 2√5 cm'], 2, 2),

    /* PHẦN II — trắc nghiệm đúng sai (mỗi câu 4 ý a–d; 0 = Đúng, 1 = Sai) */
    tf(1, T_STAT, 'Biểu đồ hình quạt tròn biểu diễn tỉ lệ phần trăm các loại trái cây được yêu thích nhất của 200 học sinh khối 9. Trong đó: 40% học sinh thích Xoài, 25% thích Cam, 20% thích Táo và 15% thích Ổi; mỗi học sinh chỉ thích đúng một loại trái cây.',
      ['Loại trái cây được yêu thích nhất là Xoài.', 'Số học sinh thích Cam là 40 học sinh.', 'Số học sinh thích Xoài gấp đôi số học sinh thích Táo.', 'Chọn ngẫu nhiên một học sinh từ nhóm học sinh thích Cam và Ổi. Xác suất để chọn được một bạn thích Cam là 2/5.'], [0, 1, 0, 1]),
    tf(2, T_CIRCLE, 'Cho tam giác ABC (AC < BC) nội tiếp đường tròn (O) có AB là đường kính. Từ tâm O vẽ đường thẳng vuông góc với BC tại điểm H. Vẽ tiếp tuyến của đường tròn (O) tại B, tiếp tuyến này cắt đường thẳng OH tại M.',
      ['Đường thẳng AC song song với đường thẳng OH.', 'Góc MCB < góc MBC.', 'Tứ giác MBOC là tứ giác nội tiếp.', 'Nếu cho AB = 5 cm và MO = 8 cm thì MH = 4,88 cm.'], [0, 1, 0, 1]),
    tf(3, T_ROOT, 'Cho biểu thức A = 3/(√x + 3) − (2√x − 12)/(x − 9) + 4/(√x − 3).',
      ['Điều kiện xác định của biểu thức A là x > 0, x ≠ 9.', 'Với điều kiện xác định, kết quả rút gọn biểu thức A là 3/(√x − 3).',
        'Cho biểu thức B = 2/(√x − 2). Gọi x₀ = a/b (với a ∈ ℤ, b ∈ ℕ* và a/b là phân số tối giản) sao cho A = B. Khi đó a + b = 25.', 'Có tất cả 7 giá trị nguyên của x để A ≥ 5.'], [1, 1, 0, 0]),
    tf(4, T_FUNC, 'Một nhà cung cấp dịch vụ Internet đưa ra hai gói cước (dung lượng dữ liệu tính bằng GB, giá tiền tính bằng nghìn đồng). Gói A: cước cố định hàng tháng 100 nghìn đồng và mỗi GB đã sử dụng phải trả thêm 2 nghìn đồng. Gói B: cước cố định hàng tháng 50 nghìn đồng và mỗi GB đã sử dụng phải trả thêm 3 nghìn đồng. Gọi x (x ≥ 0) là số GB dữ liệu sử dụng trong một tháng và y (y ≥ 0) là tổng số tiền khách hàng phải trả hàng tháng (nghìn đồng).',
      ['Nếu dùng gói cước A, tổng số tiền khách hàng phải trả trong một tháng là y = 2x + 100 (nghìn đồng).', 'Một gia đình dùng cố định đúng 60 GB mỗi tháng. Nếu chọn gói cước rẻ hơn (thay vì gói đắt hơn) thì một năm tiết kiệm được 120 nghìn đồng.',
        'Nếu khách hàng dùng đúng 200 nghìn đồng mỗi tháng cho dịch vụ Internet, thì dung lượng (GB) mua được từ gói cước A sẽ lớn hơn dung lượng mua được từ gói cước B.', 'Nếu một khách hàng chỉ dùng đúng 40 GB mỗi tháng thì chọn gói cước B sẽ tiết kiệm chi phí hơn gói cước A.'], [0, 0, 1, 0]),

    /* PHẦN III — trắc nghiệm trả lời ngắn */
    sh(1, T_CIRCLE, 'Từ điểm A nằm ngoài đường tròn (O) bán kính R (cm), kẻ hai tiếp tuyến AB, AC với đường tròn (B, C là các tiếp điểm). Biết tam giác ABC là tam giác đều và diện tích của tứ giác ABOC là S = kR² (cm²). Tìm k⁶.', '27',
      'ABC đều nên góc BAO = 30°, AB = OB / tan 30° = √3·R. S(ABOC) = 2·S(ABO) = AB·OB = √3·R². Suy ra k = √3, k⁶ = 27.'),
    sh(2, T_STAT, 'Lớp 9A có 40 học sinh. Bài kiểm tra thường xuyên môn Toán có 5 bạn đạt điểm 7, có 12 bạn đạt điểm 8, có 14 bạn đạt điểm 9, số còn lại đạt điểm 10. Tần số tương đối của dữ liệu điểm 10 là bao nhiêu phần trăm?', '22,5',
      'Số học sinh đạt điểm 10: 40 − 5 − 12 − 14 = 9. Tần số tương đối: 9/40 · 100% = 22,5%.'),
    sh(3, T_TRIG, 'Cho tam giác ABC vuông tại A, biết AB = 9 cm, BC = 15 cm. Đường phân giác trong góc B cắt cạnh AC tại D. Vẽ đường tròn tâm I nội tiếp tam giác BCD. Tổng diện tích phần hình phẳng tô đậm (giới hạn bởi ba cạnh của tam giác BCD và đường tròn (I)) bằng bao nhiêu cm²? (Kết quả làm tròn đến hàng phần mười, lấy π = 3,14.)', '20,3',
      'AC = 12 cm; DA/DC = 3/5 nên DA = 9/2, DC = 15/2; BD = 9√5/2. S(BDC) = 135/4. Bán kính nội tiếp r = 3(5 − √5)/4. S tô đậm = S(BDC) − πr² ≈ 20,3 cm².'),
    sh(4, T_SYS, 'Một ô tô dự định đi từ vị trí A đến vị trí B trong một thời gian nhất định với một vận tốc xác định. Nếu ô tô tăng vận tốc thêm 10 km/h thì sẽ đến B sớm hơn 40 phút so với dự định. Nếu ô tô giảm vận tốc đi 10 km/h thì sẽ đến B muộn 1 giờ so với dự định. Hỏi chiều dài quãng đường AB là bao nhiêu km?', '200',
      'Gọi vận tốc dự định x (km/h), thời gian dự định y (giờ): xy = (x + 10)(y − 2/3) = (x − 10)(y + 1). Giải ra x = 50, y = 4 nên AB = 50 · 4 = 200 km.'),
    sh(5, T_VIETE, 'Cho phương trình x² − 4x − 26 = 0 có hai nghiệm phân biệt x₁, x₂ với x₁ < x₂. Giá trị của biểu thức P = (x₁² + 4x₂ − 27)² − x₁³ + x₂³ có dạng a + b√30 với a, b ∈ ℕ*. Tính tổng a + b.', '309',
      'Viète: x₁ + x₂ = 4, x₁x₂ = −26. x₁² + 4x₂ − 27 = 15; x₁ − x₂ = −2√30; x₁³ − x₂³ = −84√30. P = 225 + 84√30 nên a + b = 309.'),
    sh(6, T_EQ, 'Tìm nghiệm nguyên lớn nhất của bất phương trình x(x + 11) < (x + 3)(x + 6).', '8',
      'x² + 11x < x² + 9x + 18 ⇔ 2x < 18 ⇔ x < 9. Vì x là số nguyên nên nghiệm nguyên lớn nhất là x = 8.')
  ]
}];

window.LB_SAMPLES = {SRC, EXAMS};
})();
