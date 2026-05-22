-- =====================================================================
-- V75 — Migration 006: TỐI ƯU AUDIT TRIGGERS (phiên 7, v0.4.1)
-- =====================================================================
-- Vấn đề phát hiện ở v0.4.0:
--   Sau khi apply migration 005, các thao tác CRUD chậm rõ rệt và
--   F5 trang đôi khi treo ở "Đang kiểm tra phiên đăng nhập..."
--   (AuthProvider init không thoát vì loadProfile() chậm vì Supabase
--   đang xử lý audit log dồn dập).
--
-- Nguyên nhân (giả thuyết chính):
--   1) Trigger `trg_audit_users` fire mỗi lần login (signInWithCccd
--      update last_login_at + failed_attempts=0). Mỗi user
--      login → 1 INSERT activity_logs với JSONB của row users
--      → spam audit + làm chậm flow login.
--   2) UPDATE no-op (cùng giá trị) cũng fire trigger → log rác.
--
-- Tối ưu trong file này:
--   A) DROP trigger trên bảng `users` (audit user changes có thể
--      làm thủ công ở /users page sau, hoặc add lại sau khi tinh
--      chỉnh khi cần).
--   B) Thêm WHEN clause cho các trigger UPDATE còn lại để bỏ
--      no-op (`OLD.* IS DISTINCT FROM NEW.*`).
--   C) Giữ INSERT/DELETE không filter (vì luôn có sự kiện thực sự).
--
-- Idempotent: drop trước, create lại.
-- =====================================================================

-- =====================================================================
-- A) Drop trigger trên users (nguồn chính của spam)
-- =====================================================================
DROP TRIGGER IF EXISTS trg_audit_users ON public.users;

-- =====================================================================
-- B) Re-create 9 trigger còn lại với 3 trigger riêng INSERT/UPDATE/DELETE,
--    trong đó UPDATE có WHEN clause bỏ no-op.
-- =====================================================================
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

    -- Re-create 3 trigger tách riêng để UPDATE có WHEN clause
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
-- KHÔNG có trigger nào trên users:
-- SELECT tgname FROM pg_trigger
-- WHERE tgrelid = 'public.users'::regclass AND tgname LIKE 'trg_audit_%';
-- → 0 dòng.
