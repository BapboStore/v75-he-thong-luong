-- =====================================================================
-- Migration 009: Escalated lockout (V75, phiên 16, v0.12.0)
-- ---------------------------------------------------------------------
-- Mục đích:
--   Thêm cột `lockout_count` vào bảng `users` để track số lần bị khoá
--   lũy tích (không reset khi hết lockout tự nhiên, chỉ reset khi login OK).
--   Edge Function auth-lockout dùng cột này để escalate thời gian khoá:
--     - Lần khoá 1 → 5 phút
--     - Lần khoá 2 → 15 phút
--     - Lần khoá 3+ → 60 phút (1 giờ)
--
-- Idempotent: an toàn khi chạy lại nhiều lần.
-- =====================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS lockout_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.users.lockout_count IS
  'Số lần bị khoá lũy tích. Dùng bởi Edge Function auth-lockout để escalate thời gian khoá (lần 1→5p, lần 2→15p, lần 3+→60p). Reset về 0 khi login thành công.';

-- =====================================================================
-- Verify:
--   SELECT id, cccd, failed_attempts, locked_until, lockout_count
--   FROM public.users;
--
-- Rollback (nếu cần):
--   ALTER TABLE public.users DROP COLUMN IF EXISTS lockout_count;
-- =====================================================================
