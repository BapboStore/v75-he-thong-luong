-- =====================================================================
-- V75 SALARY SYSTEM - SEED DATA
-- File: 003_seed_data.sql
-- Mô tả: Khởi tạo dữ liệu tĩnh: 8 phòng ban, ngạch-bậc, salary_config.
--        User auth (CCCD/password) sẽ được tạo qua script Node ở
--        scripts/seed-users.mjs (cần SUPABASE_SERVICE_ROLE_KEY).
-- =====================================================================

-- =====================================================================
-- 1. DEPARTMENTS – 8 phòng ban mặc định
-- =====================================================================
INSERT INTO public.departments (code, name, salary_type) VALUES
  ('TCHC_VP',  'Phòng Tổ chức Hành chính - Văn phòng', 'hanh_chinh'),
  ('TCHC_BV',  'Phòng Tổ chức Hành chính - Bảo vệ',    'bao_ve_ky_thuat'),
  ('KTTC',     'Phòng Kế toán Tài chính',              'hanh_chinh'),
  ('KHKD',     'Phòng Kế hoạch Kinh doanh',            'hanh_chinh'),
  ('QL_DOIXE', 'Quản lý 02 Đội xe',                    'hanh_chinh'),
  ('TKT_SC',   'Trạm Kỹ thuật - Sửa chữa',             'bao_ve_ky_thuat'),
  ('DX_NGHIADO',  'Đội xe Nghĩa Đô',                   'lai_xe'),
  ('DX_NGOQUYEN', 'Đội xe Ngô Quyền',                  'lai_xe')
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- 2. SALARY_GRADES – Ngạch-Bậc-Hệ số (RULE-02)
-- =====================================================================
-- Cán sự (01.004) – 12 bậc, chu kỳ 2 năm, bậc cuối thời gian chờ 24 tháng
INSERT INTO public.salary_grades (ngach_code, ngach_name, bac, he_so, is_bac_cuoi, thoi_gian_cho_thang, chu_ky_nang_bac_nam) VALUES
  ('01.004', 'Cán sự',  1, 1.86, FALSE, 0,  2),
  ('01.004', 'Cán sự',  2, 2.06, FALSE, 0,  2),
  ('01.004', 'Cán sự',  3, 2.26, FALSE, 0,  2),
  ('01.004', 'Cán sự',  4, 2.46, FALSE, 0,  2),
  ('01.004', 'Cán sự',  5, 2.66, FALSE, 0,  2),
  ('01.004', 'Cán sự',  6, 2.86, FALSE, 0,  2),
  ('01.004', 'Cán sự',  7, 3.06, FALSE, 0,  2),
  ('01.004', 'Cán sự',  8, 3.26, FALSE, 0,  2),
  ('01.004', 'Cán sự',  9, 3.46, FALSE, 0,  2),
  ('01.004', 'Cán sự', 10, 3.66, FALSE, 0,  2),
  ('01.004', 'Cán sự', 11, 3.86, FALSE, 0,  2),
  ('01.004', 'Cán sự', 12, 4.06, TRUE,  24, 2)
ON CONFLICT (ngach_code, bac) DO NOTHING;

-- Chuyên viên (01.003) – 9 bậc, chu kỳ 3 năm, bậc cuối thời gian chờ 36 tháng
INSERT INTO public.salary_grades (ngach_code, ngach_name, bac, he_so, is_bac_cuoi, thoi_gian_cho_thang, chu_ky_nang_bac_nam) VALUES
  ('01.003', 'Chuyên viên', 1, 2.34, FALSE, 0,  3),
  ('01.003', 'Chuyên viên', 2, 2.67, FALSE, 0,  3),
  ('01.003', 'Chuyên viên', 3, 3.00, FALSE, 0,  3),
  ('01.003', 'Chuyên viên', 4, 3.33, FALSE, 0,  3),
  ('01.003', 'Chuyên viên', 5, 3.66, FALSE, 0,  3),
  ('01.003', 'Chuyên viên', 6, 3.99, FALSE, 0,  3),
  ('01.003', 'Chuyên viên', 7, 4.32, FALSE, 0,  3),
  ('01.003', 'Chuyên viên', 8, 4.65, FALSE, 0,  3),
  ('01.003', 'Chuyên viên', 9, 4.98, TRUE,  36, 3)
ON CONFLICT (ngach_code, bac) DO NOTHING;

-- Chuyên viên chính (01.002) – 8 bậc, chu kỳ 3 năm, bậc cuối thời gian chờ 36
INSERT INTO public.salary_grades (ngach_code, ngach_name, bac, he_so, is_bac_cuoi, thoi_gian_cho_thang, chu_ky_nang_bac_nam) VALUES
  ('01.002', 'Chuyên viên chính', 1, 4.40, FALSE, 0,  3),
  ('01.002', 'Chuyên viên chính', 2, 4.74, FALSE, 0,  3),
  ('01.002', 'Chuyên viên chính', 3, 5.08, FALSE, 0,  3),
  ('01.002', 'Chuyên viên chính', 4, 5.42, FALSE, 0,  3),
  ('01.002', 'Chuyên viên chính', 5, 5.76, FALSE, 0,  3),
  ('01.002', 'Chuyên viên chính', 6, 6.10, FALSE, 0,  3),
  ('01.002', 'Chuyên viên chính', 7, 6.44, FALSE, 0,  3),
  ('01.002', 'Chuyên viên chính', 8, 6.78, TRUE,  36, 3)
ON CONFLICT (ngach_code, bac) DO NOTHING;

-- Lái xe (HĐ111-01.010) – 12 bậc
INSERT INTO public.salary_grades (ngach_code, ngach_name, bac, he_so, is_bac_cuoi, thoi_gian_cho_thang, chu_ky_nang_bac_nam) VALUES
  ('HD111-01.010', 'Lái xe',  1, 2.05, FALSE, 0,  2),
  ('HD111-01.010', 'Lái xe',  2, 2.23, FALSE, 0,  2),
  ('HD111-01.010', 'Lái xe',  3, 2.41, FALSE, 0,  2),
  ('HD111-01.010', 'Lái xe',  4, 2.59, FALSE, 0,  2),
  ('HD111-01.010', 'Lái xe',  5, 2.77, FALSE, 0,  2),
  ('HD111-01.010', 'Lái xe',  6, 2.95, FALSE, 0,  2),
  ('HD111-01.010', 'Lái xe',  7, 3.13, FALSE, 0,  2),
  ('HD111-01.010', 'Lái xe',  8, 3.31, FALSE, 0,  2),
  ('HD111-01.010', 'Lái xe',  9, 3.49, FALSE, 0,  2),
  ('HD111-01.010', 'Lái xe', 10, 3.67, FALSE, 0,  2),
  ('HD111-01.010', 'Lái xe', 11, 3.85, FALSE, 0,  2),
  ('HD111-01.010', 'Lái xe', 12, 4.03, TRUE,  24, 2)
ON CONFLICT (ngach_code, bac) DO NOTHING;

-- Bảo vệ / Tạp vụ (C3) – 12 bậc
INSERT INTO public.salary_grades (ngach_code, ngach_name, bac, he_so, is_bac_cuoi, thoi_gian_cho_thang, chu_ky_nang_bac_nam) VALUES
  ('C3', 'Bảo vệ - Tạp vụ',  1, 1.50, FALSE, 0,  2),
  ('C3', 'Bảo vệ - Tạp vụ',  2, 1.68, FALSE, 0,  2),
  ('C3', 'Bảo vệ - Tạp vụ',  3, 1.86, FALSE, 0,  2),
  ('C3', 'Bảo vệ - Tạp vụ',  4, 2.04, FALSE, 0,  2),
  ('C3', 'Bảo vệ - Tạp vụ',  5, 2.22, FALSE, 0,  2),
  ('C3', 'Bảo vệ - Tạp vụ',  6, 2.40, FALSE, 0,  2),
  ('C3', 'Bảo vệ - Tạp vụ',  7, 2.58, FALSE, 0,  2),
  ('C3', 'Bảo vệ - Tạp vụ',  8, 2.76, FALSE, 0,  2),
  ('C3', 'Bảo vệ - Tạp vụ',  9, 2.94, FALSE, 0,  2),
  ('C3', 'Bảo vệ - Tạp vụ', 10, 3.12, FALSE, 0,  2),
  ('C3', 'Bảo vệ - Tạp vụ', 11, 3.30, FALSE, 0,  2),
  ('C3', 'Bảo vệ - Tạp vụ', 12, 3.48, TRUE,  24, 2)
ON CONFLICT (ngach_code, bac) DO NOTHING;

-- NV Kỹ thuật (HĐ111-01.007) – 12 bậc
INSERT INTO public.salary_grades (ngach_code, ngach_name, bac, he_so, is_bac_cuoi, thoi_gian_cho_thang, chu_ky_nang_bac_nam) VALUES
  ('HD111-01.007', 'Nhân viên kỹ thuật',  1, 1.65, FALSE, 0,  2),
  ('HD111-01.007', 'Nhân viên kỹ thuật',  2, 1.83, FALSE, 0,  2),
  ('HD111-01.007', 'Nhân viên kỹ thuật',  3, 2.01, FALSE, 0,  2),
  ('HD111-01.007', 'Nhân viên kỹ thuật',  4, 2.19, FALSE, 0,  2),
  ('HD111-01.007', 'Nhân viên kỹ thuật',  5, 2.37, FALSE, 0,  2),
  ('HD111-01.007', 'Nhân viên kỹ thuật',  6, 2.55, FALSE, 0,  2),
  ('HD111-01.007', 'Nhân viên kỹ thuật',  7, 2.73, FALSE, 0,  2),
  ('HD111-01.007', 'Nhân viên kỹ thuật',  8, 2.91, FALSE, 0,  2),
  ('HD111-01.007', 'Nhân viên kỹ thuật',  9, 3.09, FALSE, 0,  2),
  ('HD111-01.007', 'Nhân viên kỹ thuật', 10, 3.27, FALSE, 0,  2),
  ('HD111-01.007', 'Nhân viên kỹ thuật', 11, 3.45, FALSE, 0,  2),
  ('HD111-01.007', 'Nhân viên kỹ thuật', 12, 3.63, TRUE,  24, 2)
ON CONFLICT (ngach_code, bac) DO NOTHING;

-- =====================================================================
-- 3. SALARY_CONFIG – Tham số lương hiện hành (RULE-04)
-- =====================================================================
INSERT INTO public.salary_config (
  effective_date,
  luong_co_so,
  tien_an_trua_max,
  giam_tru_ban_than,
  giam_tru_phu_thuoc,
  ty_le_bh_nld,
  ty_le_bh_dv,
  ty_le_cong_doan_phi,
  so_ngay_cong_chuan,
  he_so_lam_dem,
  don_gia_km_lai_xe,
  don_gia_an_trua_ngay,
  note
) VALUES (
  '2024-07-01',
  2340000,    -- LCS hiện hành
  730000,     -- Ăn trưa max
  15500000,   -- Giảm trừ bản thân
  6200000,    -- Giảm trừ phụ thuộc
  10.5,       -- BH NLĐ
  21.5,       -- BH đơn vị
  0.5,        -- CĐP
  22,
  1.30,
  3500,       -- đơn giá km lái xe (VD)
  35000,      -- đơn giá ăn trưa/ngày (VD)
  'Cấu hình mặc định khởi tạo hệ thống'
)
ON CONFLICT DO NOTHING;
