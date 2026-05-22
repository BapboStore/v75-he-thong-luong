-- =============================================================
-- Migration 007 — pg_cron dọn activity_logs cũ hơn 6 tháng
-- (PASTE INTO Supabase SQL Editor → project qvcqkciobetttltlqqjq)
-- =============================================================
-- Mục đích:
--   Tránh phình bảng `activity_logs` theo thời gian. Audit trail giữ 6 tháng
--   gần nhất là đủ cho 8 demo user; vượt quá tự động bị xoá lúc 03:15 UTC
--   hằng đêm (~10:15 sáng VN).
--
-- Yêu cầu:
--   * Supabase đã enable extension `pg_cron`. Nếu báo "extension is not
--     available" → vào Project Settings → Database → Extensions → bật pg_cron.
--   * Job chạy bằng quyền `postgres` (đăng ký bởi role superuser của project).
--
-- Idempotent:
--   * Trước khi schedule mới, unschedule job cũ nếu trùng tên — tránh chạy
--     2 lần khi re-apply migration.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Hủy lịch cũ (nếu đã tồn tại) rồi tạo mới — đảm bảo idempotent.
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'v75_cleanup_activity_logs';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
    RAISE NOTICE 'Đã unschedule job cũ id=%', jid;
  END IF;
END $$;

-- Lịch chạy: 03:15 sáng UTC mỗi ngày (~10:15 sáng VN giờ ít tải nhất).
SELECT cron.schedule(
  'v75_cleanup_activity_logs',
  '15 3 * * *',
  $$DELETE FROM public.activity_logs WHERE created_at < (NOW() - INTERVAL '6 months')$$
);

-- =============================================================
-- VERIFY (chạy ngay sau khi paste để xác nhận job đã đăng ký):
--
--   SELECT jobid, jobname, schedule, command, active
--   FROM cron.job WHERE jobname = 'v75_cleanup_activity_logs';
--
-- Lịch sử thực thi (rỗng nếu chưa tới giờ chạy):
--
--   SELECT jobid, runid, status, return_message, start_time, end_time
--   FROM cron.job_run_details
--   WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname = 'v75_cleanup_activity_logs')
--   ORDER BY start_time DESC LIMIT 10;
--
-- Test thủ công 1 lần (xoá ngay log > 6 tháng nếu có):
--
--   DELETE FROM public.activity_logs WHERE created_at < (NOW() - INTERVAL '6 months');
--
-- ROLLBACK (gỡ lịch):
--
--   SELECT cron.unschedule(jobid)
--   FROM cron.job WHERE jobname = 'v75_cleanup_activity_logs';
-- =============================================================
