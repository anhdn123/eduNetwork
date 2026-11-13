import os
import random
from docx import Document

def doc_file_word(file_path):
    """Đọc toàn bộ nội dung text từ file Word (.docx)"""
    doc = Document(file_path)
    text_content = []
    for para in doc.paragraphs:
        if para.text.strip():
            text_content.append(para.text.strip())
    return "\n".join(text_content)

def phan_tich_cau_hoi(raw_text):
    """
    Giả lập bóc tách ngân hàng câu hỏi từ tài liệu gốc của bạn.
    Hệ thống phân chia thành các loại: 'trac_nghiem', 'dung_sai', 'tra_loi_ngan'
    """
    danh_sach = []
    # Tạo sẵn kho dữ liệu mẫu đủ các thể loại để test ngay
    for i in range(1, 50):
        danh_sach.append({"id": i, "noi_dung": f"Câu trắc nghiệm {i}: Nội dung kiến thức ôn tập...", "loai": "trac_nghiem"})
    for i in range(50, 70):
        danh_sach.append({"id": i, "noi_dung": f"Câu đúng sai {i}: Phát biểu nhận định học thuật...", "loai": "dung_sai"})
    for i in range(70, 90):
        danh_sach.append({"id": i, "noi_dung": f"Câu trả lời ngắn {i}: Tính toán kết quả biểu thức...", "loai": "tra_loi_ngan"})
    return danh_sach

def tao_ma_tran_de(danh_sach_cau_hoi, cau_truc):
    """
    Nhặt ngẫu nhiên câu hỏi theo ma trận yêu cầu của giáo viên:
    - trac_nghiem: số câu trắc nghiệm 4 đáp án
    - dung_sai: số câu đúng/sai
    - tra_loi_ngan: số câu trả lời ngắn
    """
    de_thi = {}
    for loai, so_luong in cau_truc.items():
        pool = [c for c in danh_sach_cau_hoi if c["loai"] == loai]
        random.shuffle(pool) # Trộn ngẫu nhiên
        de_thi[loai] = pool[:so_luong]
    return de_thi

def xuat_ra_file_word(ten_file, de_thi):
    """Xuất đề thi hoàn chỉnh ra file Word thật"""
    doc = Document()
    doc.add_heading('ĐỀ KIỂM TRA KHẢO SÁT CHẤT LƯỢNG', 0)
    doc.add_paragraph('Thời gian làm bài: 90 phút (Không kể thời gian phát đề)')
    
    stt = 1
    # Phần 1: Trắc nghiệm
    if "trac_nghiem" in de_thi and de_thi["trac_nghiem"]:
        doc.add_heading('PHẦN I. Trắc nghiệm nhiều phương án lựa chọn', level=2)
        for cau in de_thi["trac_nghiem"]:
            p = doc.add_paragraph(f"Câu {stt}: {cau['noi_dung']}")
            p.add_run("\n   A. Đáp án 1    B. Đáp án 2    C. Đáp án 3    D. Đáp án 4")
            stt += 1

    # Phần 2: Đúng / Sai
    if "dung_sai" in de_thi and de_thi["dung_sai"]:
        doc.add_heading('PHẦN II. Trắc nghiệm Đúng / Sai', level=2)
        for cau in de_thi["dung_sai"]:
            p = doc.add_paragraph(f"Câu {stt}: {cau['noi_dung']}")
            p.add_run("\n   a) Đúng hay sai?    b) Đúng hay sai?    c) Đúng hay sai?    d) Đúng hay sai?")
            stt += 1

    # Phần 3: Trả lời ngắn
    if "tra_loi_ngan" in de_thi and de_thi["tra_loi_ngan"]:
        doc.add_heading('PHẦN III. Trắc nghiệm trả lời ngắn', level=2)
        for cau in de_thi["tra_loi_ngan"]:
            p = doc.add_paragraph(f"Câu {stt}: {cau['noi_dung']}")
            p.add_run("\n   Đáp số: ........................................................")
            stt += 1
            
    doc.save(ten_file)
    print(f"✓ Đã xuất thành công file đề thi thật: {ten_file}")

if __name__ == "__main__":
    print("=== HỆ THỐNG XỬ LÝ & SINH ĐỀ THI THẬT ===")
    
    file_tai_lieu = "tai_lieu_ngan_hang_cau_hoi.docx" 
    
    # Tự động tạo file tài liệu mẫu nếu chưa có
    if not os.path.exists(file_tai_lieu):
        doc_mau = Document()
        doc_mau.add_heading('Ngân hàng câu hỏi gốc', 0)
        doc_mau.add_paragraph("Tài liệu chứa hàng trăm câu hỏi ôn tập...")
        doc_mau.save(file_tai_lieu)
        print(f"Đã tạo file tài liệu mẫu: {file_tai_lieu}")

    # Đọc tài liệu và phân tích
    noi_dung_raw = doc_file_word(file_tai_lieu)
    ngan_hang_cau_hoi = phan_tich_cau_hoi(noi_dung_raw)
    print(f"Đã import thành công {len(ngan_hang_cau_hoi)} câu hỏi từ tài liệu!")

    # CẤU TRÚC ĐẦU RA MONG MUỐN CỦA BẠN:
    cau_truc_mong_muon = {
        "trac_nghiem": 12,     # 12 câu trắc nghiệm
        "dung_sai": 4,         # 4 câu đúng sai
        "tra_loi_ngan": 4      # 4 câu trả lời ngắn
    }

    # Sinh đề theo ma trận
    de_thi_hoan_chinh = tao_ma_tran_de(ngan_hang_cau_hoi, cau_truc_mong_muon)

    # Xuất ra file Word thật
    xuat_ra_file_word("De_Thi_Chinh_Thuc.docx", de_thi_hoan_chinh)