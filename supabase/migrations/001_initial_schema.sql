-- =====================================================================
-- V75 SALARY SYSTEM - INITIAL SCHEMA
-- File: 001_initial_schema.sql
-- Mô tả: Tạo toàn bộ bảng cốt lõi theo RULE-09 (soft delete, versioning,
--        snapshot lương). KHÔNG xoá vật lý, mọi xoá đều đổi status.
-- =====================================================================

-- Bật extension cần thiết
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- ENUM TYPES
-- =====================================================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'truong_phong', 'admin_luong', 'admin_he_thong');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE employee_status AS ENUM ('dang_lam_viec', 'luan_chuyen', 'da_nghi_huu', 'da_nghi_viec');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE department_salary_type AS ENUM ('hanh_chinh', 'lai_xe', 'bao_ve_ky_thuat');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('draft', 'pending', 'locked');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE salary_record_status AS ENUM ('draft', 'pending', 'approved', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================================
-- 1. DEPARTMENTS – Cây phòng ban
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.departments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            VARCHAR(20)  UNIQUE NOT NULL,
  name            VARCHAR(255) NOT NULL,
  parent_id       UUID REFERENCES public.departments(id),
  salary_type     department_salary_type NOT NULL DEFAULT 'hanh_chinh',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_departments_parent ON public.departments(parent_id);

-- =====================================================================
-- 2. SALARY_GRADES – Bảng ngạch-bậc-hệ số (RULE-02)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.salary_grades (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ngach_code      VARCHAR(20)  NOT NULL,
  ngach_name      VARCHAR(100) NOT NULL,
  bac             INTEGER      NOT NULL CHECK (bac BETWEEN 1 AND 12),
  he_so           NUMERIC(5,2) NOT NULL,
  is_bac_cuoi     BOOLEAN      NOT NULL DEFAULT FALSE,
  thoi_gian_cho_thang INTEGER  NOT NULL DEFAULT 0,
  chu_ky_nang_bac_nam INTEGER  NOT NULL DEFAULT 2,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ngach_code, bac)
);
CREATE INDEX IF NOT EXISTS idx_grades_ngach ON public.salary_grades(ngach_code);

-- =====================================================================
-- 3. SALARY_CONFIG – Tham số lương versioned (RULE-04)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.salary_config (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  effective_date  DATE NOT NULL,
  luong_co_so                 NUMERIC(15,2) NOT NULL,
  tien_an_trua_max            NUMERIC(15,2) NOT NULL,
  giam_tru_ban_than           NUMERIC(15,2) NOT NULL,
  giam_tru_phu_thuoc          NUMERIC(15,2) NOT NULL,
  ty_le_bh_nld                NUMERIC(5,2)  NOT NULL,
  ty_le_bh_dv                 NUMERIC(5,2)  NOT NULL,
  ty_le_cong_doan_phi         NUMERIC(5,2)  NOT NULL,
  so_ngay_cong_chuan          INTEGER       NOT NULL DEFAULT 22,
  he_so_lam_dem               NUMERIC(5,2)  NOT NULL DEFAULT 1.30,
  don_gia_km_lai_xe           NUMERIC(15,2) NOT NULL DEFAULT 0,
  don_gia_an_trua_ngay        NUMERIC(15,2) NOT NULL DEFAULT 35000,
  note                        TEXT,
  created_by                  UUID,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_config_effective ON public.salary_config(effective_date DESC);

-- =====================================================================
-- 4. EMPLOYEES – Hồ sơ nhân viên
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.employees (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cccd            VARCHAR(12) UNIQUE NOT NULL CHECK (cccd ~ '^[0-9]{9,12}$'),
  ho_ten          VARCHAR(255) NOT NULL,
  ngay_sinh       DATE,
  gioi_tinh       VARCHAR(10),
  dia_chi         TEXT,
  so_dien_thoai   VARCHAR(20),
  email           VARCHAR(255),
  department_id   UUID REFERENCES public.departments(id),
  chuc_vu         VARCHAR(100),
  ngach_code      VARCHAR(20),
  bac             INTEGER,
  ngay_huong_bac  DATE,
  tnvk_percent    NUMERIC(5,2) DEFAULT 0,
  he_so_pccv      NUMERIC(5,2) DEFAULT 0,
  he_so_pctn      NUMERIC(5,2) DEFAULT 0,
  so_nguoi_phu_thuoc INTEGER   DEFAULT 0,
  so_tai_khoan    VARCHAR(30),
  ten_ngan_hang   VARCHAR(100),
  ngay_vao_lam    DATE,
  status          employee_status NOT NULL DEFAULT 'dang_lam_viec',
  ngay_thay_doi_status DATE,
  ghi_chu         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (ngach_code, bac) REFERENCES public.salary_grades(ngach_code, bac)
);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON public.employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON public.employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_cccd ON public.employees(cccd);

-- =====================================================================
-- 5. USERS – Tài khoản (1-1 với employees, mở rộng auth.users của Supabase)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cccd                VARCHAR(12) UNIQUE NOT NULL CHECK (cccd ~ '^[0-9]{9,12}$'),
  employee_id         UUID UNIQUE REFERENCES public.employees(id),
  role                user_role NOT NULL DEFAULT 'user',
  department_id       UUID REFERENCES public.departments(id),
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts     INTEGER NOT NULL DEFAULT 0,
  locked_until        TIMESTAMPTZ,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at       TIMESTAMPTZ,
  last_login_ip       VARCHAR(45),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_dept ON public.users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_cccd ON public.users(cccd);

-- =====================================================================
-- 6. ATTENDANCE_OFFICE – Chấm công khối hành chính
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.attendance_office (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id     UUID NOT NULL REFERENCES public.employees(id),
  department_id   UUID NOT NULL REFERENCES public.departments(id),
  month_year      VARCHAR(7) NOT NULL CHECK (month_year ~ '^\d{4}-\d{2}$'),
  cong_tg         NUMERIC(5,2) DEFAULT 0,
  cong_t7cn       NUMERIC(5,2) DEFAULT 0,
  ngoai_gio       NUMERIC(6,2) DEFAULT 0,
  cong_vd         NUMERIC(5,2) DEFAULT 0,
  le_tet_hoc_phep NUMERIC(5,2) DEFAULT 0,
  le_tet_di_lam   NUMERIC(5,2) DEFAULT 0,
  status          attendance_status NOT NULL DEFAULT 'draft',
  submitted_by    UUID,
  submitted_at    TIMESTAMPTZ,
  locked_by       UUID,
  locked_at       TIMESTAMPTZ,
  ghi_chu         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, month_year)
);
CREATE INDEX IF NOT EXISTS idx_att_off_dept_month ON public.attendance_office(department_id, month_year);

-- =====================================================================
-- 7. ATTENDANCE_DRIVER – Chấm công lái xe (kiểm tra chéo 2 nguồn)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.attendance_driver (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id     UUID NOT NULL REFERENCES public.employees(id),
  department_id   UUID NOT NULL REFERENCES public.departments(id),
  month_year      VARCHAR(7) NOT NULL CHECK (month_year ~ '^\d{4}-\d{2}$'),
  source          VARCHAR(20) NOT NULL CHECK (source IN ('truong_phong','admin_luong')),
  s600            NUMERIC(5,2) DEFAULT 0,
  xe_4_7          NUMERIC(5,2) DEFAULT 0,
  xe_16_29        NUMERIC(5,2) DEFAULT 0,
  cong_mia        NUMERIC(5,2) DEFAULT 0,
  nhan_cong       NUMERIC(5,2) DEFAULT 0,
  cong_cho        NUMERIC(5,2) DEFAULT 0,
  so_km           NUMERIC(10,2) DEFAULT 0,
  cong_t7cn       NUMERIC(5,2) DEFAULT 0,
  ngoai_gio       NUMERIC(6,2) DEFAULT 0,
  le_tet_di_lam   NUMERIC(5,2) DEFAULT 0,
  le_tet_hoc_phep NUMERIC(5,2) DEFAULT 0,
  status          attendance_status NOT NULL DEFAULT 'draft',
  is_matched      BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_by    UUID,
  submitted_at    TIMESTAMPTZ,
  ghi_chu         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, month_year, source)
);
CREATE INDEX IF NOT EXISTS idx_att_drv_dept_month ON public.attendance_driver(department_id, month_year);

-- =====================================================================
-- 8. ATTENDANCE_SECURITY – Chấm công bảo vệ
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.attendance_security (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id     UUID NOT NULL REFERENCES public.employees(id),
  department_id   UUID NOT NULL REFERENCES public.departments(id),
  month_year      VARCHAR(7) NOT NULL CHECK (month_year ~ '^\d{4}-\d{2}$'),
  cong_ngay       NUMERIC(5,2) DEFAULT 0,
  cong_dem        NUMERIC(5,2) DEFAULT 0,
  cong_t7cn       NUMERIC(5,2) DEFAULT 0,
  ngoai_gio       NUMERIC(6,2) DEFAULT 0,
  le_tet_di_lam   NUMERIC(5,2) DEFAULT 0,
  le_tet_hoc_phep NUMERIC(5,2) DEFAULT 0,
  status          attendance_status NOT NULL DEFAULT 'draft',
  submitted_by    UUID,
  submitted_at    TIMESTAMPTZ,
  locked_by       UUID,
  locked_at       TIMESTAMPTZ,
  ghi_chu         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, month_year)
);
CREATE INDEX IF NOT EXISTS idx_att_sec_dept_month ON public.attendance_security(department_id, month_year);

-- =====================================================================
-- 9. ATTENDANCE_TECHNICIAN – Chấm công kỹ thuật
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.attendance_technician (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id     UUID NOT NULL REFERENCES public.employees(id),
  department_id   UUID NOT NULL REFERENCES public.departments(id),
  month_year      VARCHAR(7) NOT NULL CHECK (month_year ~ '^\d{4}-\d{2}$'),
  cong_tg         NUMERIC(5,2) DEFAULT 0,
  cong_t7cn       NUMERIC(5,2) DEFAULT 0,
  ngoai_gio       NUMERIC(6,2) DEFAULT 0,
  le_tet_di_lam   NUMERIC(5,2) DEFAULT 0,
  le_tet_hoc_phep NUMERIC(5,2) DEFAULT 0,
  status          attendance_status NOT NULL DEFAULT 'draft',
  submitted_by    UUID,
  submitted_at    TIMESTAMPTZ,
  locked_by       UUID,
  locked_at       TIMESTAMPTZ,
  ghi_chu         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, month_year)
);
CREATE INDEX IF NOT EXISTS idx_att_tech_dept_month ON public.attendance_technician(department_id, month_year);

-- =====================================================================
-- 10. SALARY_RECORDS – Bảng lương đã duyệt (snapshot toàn bộ - RULE-09)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.salary_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id     UUID NOT NULL REFERENCES public.employees(id),
  department_id   UUID NOT NULL REFERENCES public.departments(id),
  month_year      VARCHAR(7) NOT NULL,
  -- Snapshot identity
  cccd            VARCHAR(12) NOT NULL,
  ho_ten          VARCHAR(255) NOT NULL,
  chuc_vu         VARCHAR(100),
  ngach_code      VARCHAR(20),
  bac             INTEGER,
  he_so_bac       NUMERIC(5,2),
  tnvk_percent    NUMERIC(5,2),
  he_so_pccv      NUMERIC(5,2),
  he_so_pctn      NUMERIC(5,2),
  -- Snapshot config
  luong_co_so     NUMERIC(15,2),
  lcb_ngay        NUMERIC(15,2),
  -- Chịu thuế TNCN
  tien_pccv_pctn  NUMERIC(15,2) DEFAULT 0,
  tien_luong_ct   NUMERIC(15,2) DEFAULT 0,
  thuong          NUMERIC(15,2) DEFAULT 0,
  tong_chiu_thue  NUMERIC(15,2) DEFAULT 0,
  -- Không chịu thuế
  tien_luong_kct  NUMERIC(15,2) DEFAULT 0,
  an_trua         NUMERIC(15,2) DEFAULT 0,
  xang_xe         NUMERIC(15,2) DEFAULT 0,
  dien_thoai      NUMERIC(15,2) DEFAULT 0,
  tong_khong_ct   NUMERIC(15,2) DEFAULT 0,
  -- BH & thuế
  co_so_trich     NUMERIC(15,2) DEFAULT 0,
  trich_nld       NUMERIC(15,2) DEFAULT 0,
  don_vi_dong     NUMERIC(15,2) DEFAULT 0,
  cdp             NUMERIC(15,2) DEFAULT 0,
  thue_tncn       NUMERIC(15,2) DEFAULT 0,
  truy_thu        NUMERIC(15,2) DEFAULT 0,
  truy_linh       NUMERIC(15,2) DEFAULT 0,
  thuc_linh       NUMERIC(15,2) DEFAULT 0,
  -- Banking
  so_tai_khoan    VARCHAR(30),
  ten_ngan_hang   VARCHAR(100),
  -- Snapshot raw đầy đủ để audit
  raw_data        JSONB,
  -- Workflow
  status          salary_record_status NOT NULL DEFAULT 'draft',
  approved_by     UUID,
  approved_at     TIMESTAMPTZ,
  cancelled_by    UUID,
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, month_year)
);
CREATE INDEX IF NOT EXISTS idx_salary_records_dept_month ON public.salary_records(department_id, month_year);
CREATE INDEX IF NOT EXISTS idx_salary_records_status ON public.salary_records(status);

-- =====================================================================
-- 11. ACTIVITY_LOGS – Nhật ký hành động
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID,
  user_cccd       VARCHAR(12),
  action          VARCHAR(100) NOT NULL,
  entity_type     VARCHAR(50),
  entity_id       UUID,
  old_value       JSONB,
  new_value       JSONB,
  ip_address      VARCHAR(45),
  user_agent      TEXT,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logs_user ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_action ON public.activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_logs_created ON public.activity_logs(created_at DESC);

-- =====================================================================
-- TRIGGER: Tự động cập nhật updated_at
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'departments','employees','users',
      'attendance_office','attendance_driver',
      'attendance_security','attendance_technician',
      'salary_records'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;
       CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;
