-- =====================================================================
-- Migration 010: Cron email alert via pg_net (V75, phiên 16, v0.12.0)
-- ---------------------------------------------------------------------
-- Mục đích:
--   Cập nhật `run_monthly_tnvk_promotion_job()` để sau khi chạy xong
--   recalc TNVK + tổng hợp NV sắp đến hạn, tự động gọi Edge Function
--   `send-promotion-alert` qua pg_net để gửi email cảnh báo.
--
-- Tiền đề:
--   * pg_net extension đã có sẵn trên Supabase (không cần enable).
--   * Edge Function `send-promotion-alert` đã deploy.
--   * Supabase secrets RESEND_API_KEY + ALERT_EMAIL_TO + ALERT_EMAIL_FROM đã set.
--   * DBA PHẢI chạy 1 lần:
--       ALTER DATABASE postgres SET app.service_role_key = '<SERVICE_ROLE_KEY>';
--     Sau đó reload cấu hình:
--       SELECT pg_reload_conf();
--     (SERVICE_ROLE_KEY lấy từ Supabase → Project Settings → API → service_role)
--     ⚠ Không commit key này lên Git!
--
-- Idempotent: CREATE OR REPLACE, an toàn khi chạy lại nhiều lần.
-- =====================================================================

-- =====================================================================
-- 1. Cập nhật run_monthly_tnvk_promotion_job() — thêm pg_net call
-- =====================================================================
CREATE OR REPLACE FUNCTION public.run_monthly_tnvk_promotion_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tnvk_count    INTEGER := 0;
  v_promo_count   INTEGER := 0;
  v_tnvk_summary  JSONB;
  v_promo_summary JSONB;
  v_service_key   TEXT;
  v_net_id        BIGINT;
BEGIN
  -- Recalc TNVK + collect summary
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb), COUNT(*)
    INTO v_tnvk_summary, v_tnvk_count
    FROM public.recalc_tnvk_for_top_grade() AS t;

  -- Collect promotion warnings (30 ngày)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb), COUNT(*)
    INTO v_promo_summary, v_promo_count
    FROM public.check_upcoming_promotions(30) AS t;

  -- Ghi log tổng kết (user_id = NULL → system action)
  INSERT INTO public.activity_logs (
    user_id, user_cccd, action, entity_type,
    new_value, description
  ) VALUES (
    NULL, NULL,
    'system.tnvk_promotion_job',
    'system',
    jsonb_build_object(
      'tnvk_updated',            v_tnvk_count,
      'promotions_upcoming_30d', v_promo_count,
      'tnvk_changes',            v_tnvk_summary,
      'promotions',              v_promo_summary,
      'run_date',                CURRENT_DATE
    ),
    format(
      'Cron TNVK + nang bac: %s NV co TNVK thay doi, %s NV den han nang bac trong 30 ngay toi',
      v_tnvk_count, v_promo_count
    )
  );

  -- ──────────────────────────────────────────────────────────────────
  -- Gọi Edge Function send-promotion-alert qua pg_net (fire-and-forget)
  -- Chỉ gửi khi có NV sắp đến hạn
  -- ──────────────────────────────────────────────────────────────────
  IF v_promo_count > 0 THEN
    BEGIN
      -- Lấy service_role_key đã set bởi DBA (xem hướng dẫn tiền đề)
      v_service_key := current_setting('app.service_role_key', true);

      IF v_service_key IS NOT NULL AND v_service_key <> '' THEN
        SELECT net.http_post(
          url     := 'https://qvcqkciobetttltlqqjq.supabase.co/functions/v1/send-promotion-alert',
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_service_key
          ),
          body    := jsonb_build_object('days_ahead', 30)
        ) INTO v_net_id;
        RAISE NOTICE 'pg_net request id=% — email alert đang được gửi', v_net_id;
      ELSE
        RAISE NOTICE 'app.service_role_key chưa set — bỏ qua bước gửi email (xem migration 010)';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Không để lỗi pg_net làm fail toàn bộ job
      RAISE NOTICE 'pg_net gọi thất bại: % — job vẫn thành công', SQLERRM;
    END;
  END IF;

  RETURN format(
    'OK: %s TNVK updated, %s upcoming promotions in 30d',
    v_tnvk_count, v_promo_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_monthly_tnvk_promotion_job() TO service_role;

-- =====================================================================
-- SETUP (chạy 1 lần bởi DBA, KHÔNG bao gồm trong migration tự động):
--
--   -- Lấy SERVICE_ROLE_KEY từ: Supabase → Project Settings → API → service_role
--   ALTER DATABASE postgres SET app.service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
--   SELECT pg_reload_conf();
--
--   -- Verify:
--   SELECT current_setting('app.service_role_key', true) != '' AS key_set;
--
-- VERIFY sau migration:
--
--   -- Chạy job thủ công và xem kết quả:
--   SELECT public.run_monthly_tnvk_promotion_job();
--
--   -- Xem pg_net request có được gửi chưa:
--   SELECT id, method, url, status_code, timed_out, created
--     FROM net._http_response
--    ORDER BY created DESC LIMIT 5;
--
--   -- Xem log email:
--   SELECT created_at, description
--     FROM public.activity_logs
--    WHERE action = 'system.promotion_email_alert'
--    ORDER BY created_at DESC LIMIT 5;
--
-- ROLLBACK (quay lại bản không gửi email):
--   Chạy lại nội dung CREATE OR REPLACE FUNCTION từ migration 008.
-- =====================================================================
