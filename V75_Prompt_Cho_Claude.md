# PROMPT GIAO CHO CLAUDE TRIỂN KHAI HỆ THỐNG V75

> **Cách dùng:** Copy toàn bộ nội dung file này, paste vào Claude (Projects hoặc chat mới), sau đó yêu cầu Claude triển khai từng module.

---

## SYSTEM CONTEXT

Bạn là senior full-stack developer được giao xây dựng hệ thống **Quản lý Tiền lương V75**.

**Stack bắt buộc:**
- Frontend: SPA (React hoặc Next.js), deploy Netlify
- Backend/DB: Supabase (PostgreSQL), Row-Level Security (RLS)
- Auth: Supabase Auth, ID = CCCD (9–12 số)

**Nguyên tắc làm việc:**
- Không hardcode tham số lương — luôn đọc từ bảng `salary_config`
- Không xoá vật lý bất kỳ bản ghi nào — chỉ soft delete (đổi status)
- Phân quyền tại DB (RLS), không chỉ dựa vào frontend
- Mọi thay đổi dữ liệu quan trọng phải ghi `activity_logs`
- Khi duyệt lương: snapshot toàn bộ vào `salary_records`

---

## RULE-01: PHÂN QUYỀN

Hệ thống có 4 role:

| Role | Quyền |
|------|-------|
| `user` | Chỉ xem bảng lương & phiếu lương của chính mình |
| `truong_phong` | Nhập/sửa bảng công phòng mình; xem bảng lương toàn phòng; xuất PDF bảng công phòng mình |
| `admin_luong` | Nhập/sửa công & lương mọi phòng; xuất PDF; quản lý phòng ban; duyệt bảng công |
| `admin_he_thong` | Toàn quyền: CRUD user, phân quyền, reset password, xem log, cấu hình |

- ID đăng nhập = CCCD (9–12 số)
- Password mặc định = `8888V75`, buộc đổi lần đầu đăng nhập
- Khoá tài khoản 5 phút sau 5 lần sai liên tiếp
- Soft delete: không xoá user, chỉ đổi trạng thái "Đã nghỉ việc"

---

## RULE-02: NGẠCH – BẬC – HỆ SỐ LƯƠNG

Lưu vào bảng `salary_grades`. Tra cứu theo `(ngach_code, bac)`.

### Bảng hệ số đầy đủ:

| Ngạch | B1 | B2 | B3 | B4 | B5 | B6 | B7 | B8 | B9 | B10 | B11 | B12 | Chu kỳ |
|-------|----|----|----|----|----|----|----|----|-----|-----|-----|-----|--------|
| Cán sự (01.004) | 1.86 | 2.06 | 2.26 | 2.46 | 2.66 | 2.86 | 3.06 | 3.26 | 3.46 | 3.66 | 3.86 | 4.06 | 2 năm |
| Chuyên viên (01.003) | 2.34 | 2.67 | 3.00 | 3.33 | 3.66 | 3.99 | 4.32 | 4.65 | 4.98 | — | — | — | 3 năm |
| Chuyên viên chính (01.002) | 4.40 | 4.74 | 5.08 | 5.42 | 5.76 | 6.10 | 6.44 | 6.78 | — | — | — | — | 3 năm |
| Lái xe (HĐ111-01.010) | 2.05 | 2.23 | 2.41 | 2.59 | 2.77 | 2.95 | 3.13 | 3.31 | 3.49 | 3.67 | 3.85 | 4.03 | 2 năm |
| Bảo vệ / Tạp vụ (C3) | 1.50 | 1.68 | 1.86 | 2.04 | 2.22 | 2.40 | 2.58 | 2.76 | 2.94 | 3.12 | 3.30 | 3.48 | 2 năm |
| NV Kỹ thuật (HĐ111-01.007) | 1.65 | 1.83 | 2.01 | 2.19 | 2.37 | 2.55 | 2.73 | 2.91 | 3.09 | 3.27 | 3.45 | 3.63 | 2 năm |

**Ngày nâng bậc tiếp theo** = ngày hưởng bậc hiện tại + chu kỳ (2 hoặc 3 năm). Cron job cảnh báo 30 ngày trước.

---

## RULE-03: THÂM NIÊN VƯỢT KHUNG (TNVK)

Chỉ áp dụng khi NV đang ở **bậc cuối cùng** của ngạch.

```
Nếu số_tháng_ở_bậc_cuối < thời_gian_chờ  → tnvk_percent = 0
Nếu số_tháng_ở_bậc_cuối >= thời_gian_chờ → tnvk_percent = 5 + floor((số_tháng - thời_gian_chờ) / 12)
```

| Ngạch | Bậc cuối | Hệ số bậc cuối | Thời gian chờ |
|-------|----------|----------------|---------------|
| Cán sự (01.004) | 12 | 4.06 | 24 tháng |
| Chuyên viên (01.003) | 9 | 4.98 | 36 tháng |
| Chuyên viên chính (01.002) | 8 | 6.78 | 36 tháng |
| Lái xe | 12 | 4.03 | 24 tháng |
| Bảo vệ / Tạp vụ | 12 | 3.48 | 24 tháng |
| NV Kỹ thuật | 12 | 3.63 | 24 tháng |

Cron job chạy đầu mỗi tháng: tính lại `tnvk_percent` cho tất cả NV ở bậc cuối.

---

## RULE-04: THAM SỐ CẤU HÌNH (salary_config)

Luôn lấy bản ghi có `effective_date <= ngày tính lương` (lấy bản mới nhất).

| Tham số | Giá trị hiện hành |
|---------|-------------------|
| Lương cơ sở (LCS) | 2.340.000 đ/tháng |
| Tiền ăn trưa tối đa | 730.000 đ/tháng |
| Giảm trừ bản thân TNCN | 15.500.000 đ/tháng |
| Giảm trừ người phụ thuộc | 6.200.000 đ/người/tháng |
| Tỷ lệ BH NLĐ | 10.5% (BHXH 8% + BHYT 1.5% + BHTN 1%) |
| Tỷ lệ BH đơn vị | 21.5% (BHXH 17.5% + BHYT 3% + BHTN 1%) |
| Công đoàn phí | 0.5% |
| Số ngày công chuẩn | 22 ngày/tháng |

**Lương cơ bản/ngày:**
```
LCB_ngay = (LCS × he_so_bac × (1 + tnvk_percent/100)) / 22
```

---

## RULE-05: CÔNG THỨC BẢNG LƯƠNG HÀNH CHÍNH

### A. Chịu thuế TNCN
```
tien_pccv_pctn     = (he_so_pccv + he_so_pctn) × LCS
tien_luong_ct      = (cong_tg + cong_t7cn) × LCB_ngay
                   + ngoai_gio × LCB_ngay / 8
                   + cong_vd × luong_vd_ngay
                   + le_tet_hoc_phep × LCB_ngay
tong_chiu_thue     = tien_pccv_pctn + tien_luong_ct + thuong
```

### B. Không chịu thuế TNCN
```
tien_luong_kct     = cong_t7cn × LCB_ngay
                   + le_tet_di_lam × LCB_ngay × 3
                   + ngoai_gio × LCB_ngay / 8 × 50%
an_trua            = MIN((cong_tg + cong_vd) × don_gia_an_trua_ngay, 730000)
tong_khong_ct      = tien_luong_kct + an_trua + xang_xe + dien_thoai
```

### C. Trích nộp BH
```
co_so_trich = LCS × (he_so_bac × (1 + tnvk/100) + he_so_pccv)
trich_nld   = co_so_trich × 10.5%
don_vi_dong = co_so_trich × 21.5%
cdp         = co_so_trich × 0.5%
```

### D. Thuế TNCN (luỹ tiến từng phần)
```
TNTT = tong_chiu_thue − trich_nld − 15_500_000 − (6_200_000 × so_nguoi_phu_thuoc)

if TNTT <= 0:          thue = 0
elif TNTT <= 10M:      thue = TNTT × 5%
elif TNTT <= 30M:      thue = 500_000 + (TNTT - 10M) × 10%
elif TNTT <= 60M:      thue = 2_500_000 + (TNTT - 30M) × 20%
elif TNTT <= 100M:     thue = 8_500_000 + (TNTT - 60M) × 30%
else:                  thue = 20_500_000 + (TNTT - 100M) × 35%
```

### E. Thực lĩnh
```
thuc_linh = tong_chiu_thue + tong_khong_ct − trich_nld − cdp − thue_TNCN ± truy_thu ± truy_linh
```

---

## RULE-06: CHẤM CÔNG

### Quy trình chung
`draft → pending (gửi duyệt) → locked (admin lương xác nhận) → tự động đẩy vào bảng lương`

Chỉ được chỉnh sửa khi status = draft hoặc pending.

### Lái xe – kiểm tra chéo (2 bên nhập độc lập)
- Nếu **khớp** → tự động locked
- Nếu **chưa khớp** → cảnh báo đỏ, chặn tính lương
- Bảng lương lái xe **chỉ tính được sau khi locked**

### Cột đặc thù lái xe
```
tong_cong_vd  = S600 + xe_4_7 + xe_16_29 + cong_Mia + nhan_cong
cong_cho      = MIN(22 − tong_cong_vd, 10)   # nếu âm → 0
tien_km_phu   = so_km × don_gia_km  (từ salary_config)
```

### Bảo vệ
- Công làm đêm: hệ số đêm = 1.3 (cấu hình trong salary_config)

---

## RULE-07: TRẠNG THÁI NHÂN VIÊN

| Trạng thái | Màu | Hiện bảng lương? |
|-----------|-----|-----------------|
| Đang làm việc | 🟢 Xanh | CÓ |
| Luân chuyển / công tác dài hạn | 🟡 Vàng | KHÔNG – bảng riêng |
| Đã nghỉ hưu | ⚫ Xám | KHÔNG |
| Đã nghỉ việc | 🔴 Đỏ | KHÔNG |

---

## RULE-08: XUẤT FILE

| File | Điều kiện | Format |
|------|-----------|--------|
| PDF bảng công | Bảng công locked | A4 ngang, tiêu đề + chữ ký duyệt |
| PDF bảng lương | Bảng lương duyệt | A3/A4 ngang, chữ ký 3 bên: Kế toán – TP – GĐ |
| PDF phiếu lương | Bảng lương duyệt | A5, 1 phiếu/NV |
| Excel chuyển khoản | Bảng lương duyệt | Cột: Họ tên, STK, Tên NH, Thực lĩnh |

---

## RULE-09: QUY TẮC DB

1. **Soft delete** – không xoá vật lý bất kỳ bản ghi nào
2. **Snapshot lương** – khi duyệt: lưu đầy đủ vào `salary_records`
3. **Versioning config** – mỗi lần đổi tham số tạo record mới có `effective_date`
4. **RLS Supabase** – phân quyền tại DB, không chỉ dựa frontend
5. **Activity log** – ghi: user_id, action, timestamp, IP, old/new value
6. **Cron job** – đầu tháng: cập nhật TNVK, kiểm tra ngày nâng bậc, gửi cảnh báo

---

## CÁC BẢNG DB CHÍNH

```
departments       – cây phòng ban (8 đơn vị mặc định)
employees         – hồ sơ NV (FK: departments, salary_grades)
salary_grades     – bảng ngạch-bậc-hệ số (lookup)
users             – tài khoản (1-1 với employees)
attendance_office – chấm công VP (FK: employees, month_year)
attendance_driver – chấm công lái xe (2 nguồn nhập)
attendance_security – chấm công bảo vệ
attendance_technician – chấm công kỹ thuật
salary_records    – bảng lương đã duyệt (snapshot)
salary_config     – tham số lương (versioned)
activity_logs     – nhật ký hành động
```

---

## DANH SÁCH PHÒNG BAN MẶC ĐỊNH

1. Phòng Tổ chức Hành chính – Văn phòng → Bảng lương HC
2. Phòng Tổ chức Hành chính – Bảo vệ → Bảng lương BV/KT
3. Phòng Kế toán Tài chính → Bảng lương HC
4. Phòng Kế hoạch Kinh doanh → Bảng lương HC
5. Quản lý 02 Đội xe → Bảng lương HC
6. Trạm Kỹ thuật – Sửa chữa → Bảng lương BV/KT
7. Đội xe Nghĩa Đô → Bảng lương Lái xe
8. Đội xe Ngô Quyền → Bảng lương Lái xe

---

## GỢI Ý TRIỂN KHAI THEO MODULE

Khi giao Claude triển khai, paste prompt này vào đầu, sau đó yêu cầu cụ thể, ví dụ:

```
→ "Viết Supabase schema SQL cho toàn bộ hệ thống, bao gồm RLS policies"
→ "Viết hàm tính lương cho khối hành chính theo RULE-05"
→ "Viết component React bảng chấm công lái xe với logic kiểm tra chéo RULE-06"
→ "Viết cron job tính TNVK theo RULE-03"
→ "Tạo seed data cho bảng salary_grades theo RULE-02"
```

---

*V75 – Business Rules Prompt v1.0 – 2025*
