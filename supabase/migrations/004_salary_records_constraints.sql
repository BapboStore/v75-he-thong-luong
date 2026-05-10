-- =====================================================================
-- V75 SALARY SYSTEM - SALARY RECORDS CONSTRAINTS (MODULE 4)
-- File: 004_salary_records_constraints.sql
-- Mô tả:
--   1. Trigger chặn cập nhật các trường tính toán khi salary_records đã
--      ở trạng thái 'approved'. Chỉ cho phép đổi status sang 'cancelled'
--      kèm cancelled_by / cancelled_at / cancel_reason.
--   2. Index hỗ trợ truy vấn theo employee_id + month_year (đã có
--      UNIQUE chung; thêm index riêng cho employee_id để query payslip
--      cá nhân theo nhiều tháng nhanh).
--   3. RPC giúp user thường (role 'user') đọc bảng lương của chính mình
--      qua employee_id (RLS đã cho phép, chỉ là hàm tiện dụng).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. INDEX
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_salary_records_emp_month
  ON public.salary_records(employee_id, month_year DESC);

-- ---------------------------------------------------------------------
-- 2. TRIGGER: lock các trường tính toán khi đã approved
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_approved_salary_records()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  -- Chỉ những thay đổi sau là HỢP LỆ trên bản đã approved:
  --   status: 'approved' -> 'cancelled'
  --   cancelled_by, cancelled_at, cancel_reason: null -> giá trị
  -- Mọi thay đổi cột tính toán khác đều bị chặn để bảo toàn snapshot.
  immutable_changed BOOLEAN := FALSE;
BEGIN
  IF OLD.status = 'approved' THEN
    -- Cho phép cancel
    IF NEW.status IN ('approved','cancelled') THEN
      -- Kiểm tra mọi cột số / snapshot không đổi
      IF (NEW.cccd IS DISTINCT FROM OLD.cccd)
        OR (NEW.ho_ten IS DISTINCT FROM OLD.ho_ten)
        OR (NEW.chuc_vu IS DISTINCT FROM OLD.chuc_vu)
        OR (NEW.ngach_code IS DISTINCT FROM OLD.ngach_code)
        OR (NEW.bac IS DISTINCT FROM OLD.bac)
        OR (NEW.he_so_bac IS DISTINCT FROM OLD.he_so_bac)
        OR (NEW.tnvk_percent IS DISTINCT FROM OLD.tnvk_percent)
        OR (NEW.he_so_pccv IS DISTINCT FROM OLD.he_so_pccv)
        OR (NEW.he_so_pctn IS DISTINCT FROM OLD.he_so_pctn)
        OR (NEW.luong_co_so IS DISTINCT FROM OLD.luong_co_so)
        OR (NEW.lcb_ngay IS DISTINCT FROM OLD.lcb_ngay)
        OR (NEW.tien_pccv_pctn IS DISTINCT FROM OLD.tien_pccv_pctn)
        OR (NEW.tien_luong_ct IS DISTINCT FROM OLD.tien_luong_ct)
        OR (NEW.thuong IS DISTINCT FROM OLD.thuong)
        OR (NEW.tong_chiu_thue IS DISTINCT FROM OLD.tong_chiu_thue)
        OR (NEW.tien_luong_kct IS DISTINCT FROM OLD.tien_luong_kct)
        OR (NEW.an_trua IS DISTINCT FROM OLD.an_trua)
        OR (NEW.xang_xe IS DISTINCT FROM OLD.xang_xe)
        OR (NEW.dien_thoai IS DISTINCT FROM OLD.dien_thoai)
        OR (NEW.tong_khong_ct IS DISTINCT FROM OLD.tong_khong_ct)
        OR (NEW.co_so_trich IS DISTINCT FROM OLD.co_so_trich)
        OR (NEW.trich_nld IS DISTINCT FROM OLD.trich_nld)
        OR (NEW.don_vi_dong IS DISTINCT FROM OLD.don_vi_dong)
        OR (NEW.cdp IS DISTINCT FROM OLD.cdp)
        OR (NEW.thue_tncn IS DISTINCT FROM OLD.thue_tncn)
        OR (NEW.truy_thu IS DISTINCT FROM OLD.truy_thu)
        OR (NEW.truy_linh IS DISTINCT FROM OLD.truy_linh)
        OR (NEW.thuc_linh IS DISTINCT FROM OLD.thuc_linh)
      THEN
        immutable_changed := TRUE;
      END IF;

      IF immutable_changed THEN
        RAISE EXCEPTION 'Không thể sửa các trường tính toán của bảng lương đã duyệt. Phải huỷ duyệt trước khi tính lại.'
          USING ERRCODE = '23505';
      END IF;
    ELSE
      RAISE EXCEPTION 'Bảng lương đã duyệt chỉ có thể chuyển sang trạng thái cancelled.'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_approved_salary ON public.salary_records;
CREATE TRIGGER trg_protect_approved_salary
  BEFORE UPDATE ON public.salary_records
  FOR EACH ROW EXECUTE FUNCTION public.protect_approved_salary_records();

-- ---------------------------------------------------------------------
-- 3. VIEW tổng hợp số bảng lương theo phòng / tháng (cho dashboard sau)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_salary_summary AS
SELECT
  department_id,
  month_year,
  COUNT(*) FILTER (WHERE status = 'draft')      AS so_nhap,
  COUNT(*) FILTER (WHERE status = 'pending')    AS so_cho_duyet,
  COUNT(*) FILTER (WHERE status = 'approved')   AS so_da_duyet,
  COUNT(*) FILTER (WHERE status = 'cancelled')  AS so_huy,
  COALESCE(SUM(thuc_linh) FILTER (WHERE status = 'approved'), 0) AS tong_thuc_linh_da_duyet
FROM public.salary_records
GROUP BY department_id, month_year;

GRANT SELECT ON public.v_salary_summary TO authenticated;
