-- =====================================================================
-- V75 — Migration 005: AUDIT TRIGGERS (phiên 7, v0.4.0)
-- =====================================================================
-- Mục tiêu:
--   Chuyển toàn bộ activity_logs từ client sang Postgres trigger
--   server-side. Sau khi chạy file này, mỗi INSERT/UPDATE/DELETE trên
--   10 bảng nghiệp vụ sẽ TỰ ĐỘNG ghi 1 dòng vào activity_logs với
--   JWT của caller (auth.uid()).
--
-- Cách dùng:
--   1) Mở SQL Editor của Supabase project qvcqkciobetttltlqqjq:
--      https://supabase.com/dashboard/project/qvcqkciobetttltlqqjq/sql/new
--   2) Paste toàn bộ file này → Run.
--   3) Verify (xem cuối file).
--
-- Idempotent: chạy lại nhiều lần đều an toàn (DROP TRIGGER IF EXISTS).
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
  -- Lấy uid caller (NULL nếu service-role / SQL Editor)
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  -- Tra CCCD từ users (nhanh, có index unique trên id)
  IF v_uid IS NOT NULL THEN
    BEGIN
      SELECT cccd INTO v_cccd FROM public.users WHERE id = v_uid;
    EXCEPTION WHEN OTHERS THEN
      v_cccd := NULL;
    END;
  END IF;

  -- ID của row bị tác động
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
-- 3. GRANT EXECUTE
-- =====================================================================
GRANT EXECUTE ON FUNCTION public.audit_row() TO authenticated, service_role;

-- =====================================================================
-- VERIFY (chạy riêng query bên dưới sau khi Run xong file này)
-- =====================================================================
-- SELECT tgname, tgrelid::regclass::text AS tablename
-- FROM pg_trigger
-- WHERE tgname LIKE 'trg_audit_%'
-- ORDER BY tablename;
-- → Kỳ vọng 10 dòng: attendance_driver, attendance_office,
--   attendance_security, attendance_technician, departments, employees,
--   salary_config, salary_grades, salary_records, users.
