-- =====================================================================
-- V75 — Migration 006: TỐI ƯU AUDIT TRIGGERS (paste vào SQL Editor)
-- =====================================================================
-- Mục tiêu: giải quyết chậm hệ thống + treo "Đang kiểm tra phiên đăng nhập..."
-- sau khi apply migration 005.
-- Cách dùng:
--   1) Mở SQL Editor: https://supabase.com/dashboard/project/qvcqkciobetttltlqqjq/sql/new
--   2) Paste toàn bộ file này → Run.
--   3) Verify (xem cuối file).
-- Idempotent: chạy lại nhiều lần đều an toàn.
-- =====================================================================

-- A) Bỏ trigger audit trên `users` (nguồn spam khi login)
DROP TRIGGER IF EXISTS trg_audit_users ON public.users;

-- B) Re-create 9 trigger còn lại, tách INSERT/UPDATE/DELETE để UPDATE
--    có WHEN (OLD.* IS DISTINCT FROM NEW.*) bỏ no-op
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'departments',
      'employees',
      'attendance_office',
      'attendance_driver',
      'attendance_security',
      'attendance_technician',
      'salary_records',
      'salary_config',
      'salary_grades'
    ])
  LOOP
    -- Drop the consolidated trigger from migration 005
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I;', t, t);

    EXECUTE format(
      'CREATE TRIGGER trg_audit_%I_ins
         AFTER INSERT ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.audit_row();',
      t, t
    );

    EXECUTE format(
      'CREATE TRIGGER trg_audit_%I_upd
         AFTER UPDATE ON public.%I
         FOR EACH ROW
         WHEN (OLD.* IS DISTINCT FROM NEW.*)
         EXECUTE FUNCTION public.audit_row();',
      t, t
    );

    EXECUTE format(
      'CREATE TRIGGER trg_audit_%I_del
         AFTER DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.audit_row();',
      t, t
    );
  END LOOP;
END $$;

-- =====================================================================
-- VERIFY
-- =====================================================================
-- Kỳ vọng 27 dòng (9 bảng × 3 trigger ins/upd/del):
-- SELECT tgname, tgrelid::regclass::text AS tablename
-- FROM pg_trigger
-- WHERE tgname LIKE 'trg_audit_%'
-- ORDER BY tablename, tgname;
--
-- users KHÔNG còn audit trigger:
-- SELECT tgname FROM pg_trigger
-- WHERE tgrelid = 'public.users'::regclass AND tgname LIKE 'trg_audit_%';
-- → 0 dòng.
