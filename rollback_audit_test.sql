-- =====================================================================
-- V75 — ROLLBACK AUDIT TRIGGER (CHỈ ĐỂ TEST CÔ LẬP NGUYÊN NHÂN)
-- =====================================================================
-- Cảnh báo:
--   Sau khi chạy file này, mọi audit trigger từ migration 005/006 sẽ
--   bị xoá. Activity logs sẽ KHÔNG còn được ghi tự động khi save
--   chấm công / lương / nhân viên. App vẫn chạy bình thường vì
--   client v0.4.0+ đã không còn gọi logActivity nữa.
--
-- Khi nào dùng:
--   - Test cô lập xem migration 005/006 có phải nguyên nhân treo không.
--   - Cần rollback khẩn cấp nếu trigger gây vấn đề khác.
--
-- Cách phục hồi sau test:
--   1) Apply lại `005_audit_triggers_to_paste.sql`
--   2) Apply lại `006_audit_optimize_to_paste.sql`
-- =====================================================================

DROP FUNCTION IF EXISTS public.audit_row() CASCADE;

-- Verify: 0 dòng kỳ vọng
SELECT tgname, tgrelid::regclass::text AS tablename
FROM pg_trigger
WHERE tgname LIKE 'trg_audit_%';
