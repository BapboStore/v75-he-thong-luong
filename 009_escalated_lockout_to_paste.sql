-- Migration 009: Escalated lockout — paste vào SQL Editor Supabase
-- Thêm cột lockout_count vào bảng users

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS lockout_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.users.lockout_count IS
  'Số lần bị khoá lũy tích. Dùng bởi Edge Function auth-lockout để escalate thời gian khoá (lần 1→5p, lần 2→15p, lần 3+→60p). Reset về 0 khi login thành công.';

-- Verify:
-- SELECT id, cccd, failed_attempts, locked_until, lockout_count FROM public.users;
