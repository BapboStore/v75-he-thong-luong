-- =====================================================================
-- V75 SALARY SYSTEM - AUDIT TRIGGERS (Phiên 6, v0.4.0)
-- File: 005_audit_triggers.sql
--
-- Mục tiêu:
--   Chuyển toàn bộ activity_logs từ client (logActivity TS) sang
--   Postgres trigger server-side. Nhờ vậy:
--     1) Loại bỏ logActivity khỏi hot-path → save batch không còn bị
--        chiếm HTTP connection pool hay timeout 5s.
--     2) Đảm bảo audit không bao giờ mất (kể cả khi user đóng tab giữa
--        request).
--     3) Trigger chạy SECURITY DEFINER → bypass RLS `logs_insert_self`
--        nhưng vẫn lấy được auth.uid() từ JWT của caller.
--
-- Bảng được audit (10 bảng nghiệp vụ — tất cả đều có PK `id` UUID):
--   departments, employees, users,
--   attendance_office, attendance_driver,
--   attendance_security, attendance_technician,
--   salary_records, salary_config, salary_grades
--
-- Lưu ý:
--   * Không audit chính bảng `activity_logs` (đệ quy).
--   * `auth.uid()` có thể NULL (vd. seed script / supabase-admin) — cho
--     phép NULL trong INSERT.
--   * Trường `user_cccd` được điền từ bảng `users` nếu khớp uid; nếu
--     không (vd. system insert) thì NULL.
-- =====================================================================

-- =====================================================================
-- 1. FUNCTION: public.audit_row()
-- =====================================================================
CREATE OR REPLACE FUNCTION public.audit_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID;
  v_cccd   VARCHAR(12);
  v_target UUID;
BEGIN
  -- Lấy uid của caller (có thể NULL khi không có JWT — chấp nhận)
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  -- Tra cứu CCCD nhanh (1 row, có index unique) — bỏ qua nếu lỗi
  IF v_uid IS NOT NULL THEN
    BEGIN
      SELECT cccd INTO v_cccd FROM public.users WHERE id = v_uid;
    EXCEPTION WHEN OTHERS THEN
      v_cccd := NULL;
    END;
  END IF;

  -- ID của row đang được tác động
  IF TG_OP = 'DELETE' THEN
    v_target := OLD.id;
  ELSE
    v_target := NEW.id;
  END IF;

  INSERT INTO public.activity_logs (
    user_id, user_cccd, action, entity_type, entity_id,
    old_value, new_value, description
  )
  VALUES (
    v_uid,
    v_cccd,
    lower(TG_OP) || '.' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    v_target,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
    'audit ' || TG_OP || ' ' || TG_TABLE_NAME
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- =====================================================================
-- 2. ÁP TRIGGER CHO 10 BẢNG NGHIỆP VỤ
--    (idempotent: drop trước, create lại)
-- =====================================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'departments',
      'employees',
      'users',
      'attendance_office',
      'attendance_driver',
      'attendance_security',
      'attendance_technician',
      'salary_records',
      'salary_config',
      'salary_grades'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I;
       CREATE TRIGGER trg_audit_%I
         AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.audit_row();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- =====================================================================
-- 3. (TUỲ CHỌN) GRANT EXECUTE — supabase service_role + authenticated
-- =====================================================================
GRANT EXECUTE ON FUNCTION public.audit_row() TO authenticated, service_role;

-- =====================================================================
-- VERIFY
-- =====================================================================
-- SELECT tgname, tgrelid::regclass
-- FROM pg_trigger
-- WHERE tgname LIKE 'trg_audit_%'
-- ORDER BY tgrelid::regclass::text;
