-- =====================================================================
-- Migration 008 — Cron TNVK + cảnh báo nâng bậc (phiên 10, v0.7.0)
-- Copy toàn bộ file này → Supabase Dashboard → SQL Editor → Run.
-- File này GIỐNG HỆT supabase/migrations/008_tnvk_promotion_cron.sql,
-- đặt ở root cho tiện copy như các migration 005-007 trước.
-- =====================================================================
-- Mục đích:
--   * RULE-03: Đầu mỗi tháng tự động tính lại `tnvk_percent` cho NV đang
--     ở bậc cuối của ngạch (chỉ NV ở bậc cuối + đã qua thời_gian_chờ mới
--     bắt đầu hưởng TNVK = 5% + 1%/năm tiếp theo).
--   * RULE-02: Cảnh báo 30 ngày trước khi NV đến hạn nâng bậc — ghi vào
--     activity_logs để admin theo dõi (action = 'system.tnvk_promotion_job').
--
-- Tiền đề:
--   * pg_cron đã enable từ migration 007.
--   * employees.tnvk_percent, ngay_huong_bac, salary_grades.is_bac_cuoi,
--     salary_grades.thoi_gian_cho_thang, salary_grades.chu_ky_nang_bac_nam
--     đã có sẵn từ 001 + 003.
--
-- Idempotent:
--   * CREATE OR REPLACE cho 3 functions.
--   * DROP & cron.schedule lại job nếu trùng tên.
-- =====================================================================

-- =====================================================================
-- 1. FUNCTION: recalc_tnvk_for_top_grade()
--    Trả về danh sách NV có TNVK thay đổi sau khi recalc (audit-friendly).
--    Công thức RULE-03:
--      months = số tháng từ ngay_huong_bac đến hiện tại
--      if months < thoi_gian_cho_thang: tnvk = 0
--      else: tnvk = 5 + floor((months - thoi_gian_cho_thang) / 12)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.recalc_tnvk_for_top_grade()
RETURNS TABLE(
  employee_id    UUID,
  cccd           VARCHAR,
  ho_ten         VARCHAR,
  old_tnvk       NUMERIC,
  new_tnvk       NUMERIC,
  months_at_top  INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec      RECORD;
  v_months INTEGER;
  v_new    NUMERIC;
BEGIN
  FOR rec IN
    SELECT
      e.id,
      e.cccd,
      e.ho_ten,
      e.tnvk_percent,
      e.ngay_huong_bac,
      sg.thoi_gian_cho_thang
    FROM public.employees e
    JOIN public.salary_grades sg
      ON sg.ngach_code = e.ngach_code AND sg.bac = e.bac
    WHERE e.status = 'dang_lam_viec'
      AND sg.is_bac_cuoi = TRUE
      AND e.ngay_huong_bac IS NOT NULL
  LOOP
    v_months := (
      EXTRACT(YEAR  FROM age(CURRENT_DATE, rec.ngay_huong_bac))::INTEGER * 12
    + EXTRACT(MONTH FROM age(CURRENT_DATE, rec.ngay_huong_bac))::INTEGER
    );

    IF v_months < COALESCE(rec.thoi_gian_cho_thang, 0) THEN
      v_new := 0;
    ELSE
      v_new := 5 + FLOOR((v_months - rec.thoi_gian_cho_thang) / 12.0);
    END IF;

    IF v_new IS DISTINCT FROM rec.tnvk_percent THEN
      UPDATE public.employees
         SET tnvk_percent = v_new
       WHERE id = rec.id;

      employee_id   := rec.id;
      cccd          := rec.cccd;
      ho_ten        := rec.ho_ten;
      old_tnvk      := rec.tnvk_percent;
      new_tnvk      := v_new;
      months_at_top := v_months;
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

-- =====================================================================
-- 2. FUNCTION: check_upcoming_promotions(days_ahead)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.check_upcoming_promotions(
  p_days_ahead INTEGER DEFAULT 30
)
RETURNS TABLE(
  employee_id          UUID,
  cccd                 VARCHAR,
  ho_ten               VARCHAR,
  ngach_code           VARCHAR,
  bac                  INTEGER,
  ngay_huong_bac       DATE,
  next_promotion_date  DATE,
  days_remaining       INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.cccd,
    e.ho_ten,
    e.ngach_code,
    e.bac,
    e.ngay_huong_bac,
    (e.ngay_huong_bac + (sg.chu_ky_nang_bac_nam || ' years')::INTERVAL)::DATE
      AS next_promotion_date,
    ((e.ngay_huong_bac + (sg.chu_ky_nang_bac_nam || ' years')::INTERVAL)::DATE
     - CURRENT_DATE)::INTEGER AS days_remaining
  FROM public.employees e
  JOIN public.salary_grades sg
    ON sg.ngach_code = e.ngach_code AND sg.bac = e.bac
  WHERE e.status = 'dang_lam_viec'
    AND sg.is_bac_cuoi = FALSE
    AND e.ngay_huong_bac IS NOT NULL
    AND (e.ngay_huong_bac + (sg.chu_ky_nang_bac_nam || ' years')::INTERVAL)::DATE
        BETWEEN CURRENT_DATE
            AND (CURRENT_DATE + (p_days_ahead || ' days')::INTERVAL)
  ORDER BY days_remaining ASC, e.cccd ASC;
END;
$$;

-- =====================================================================
-- 3. FUNCTION: run_monthly_tnvk_promotion_job()
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
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb), COUNT(*)
    INTO v_tnvk_summary, v_tnvk_count
    FROM public.recalc_tnvk_for_top_grade() AS t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb), COUNT(*)
    INTO v_promo_summary, v_promo_count
    FROM public.check_upcoming_promotions(30) AS t;

  INSERT INTO public.activity_logs (
    user_id, user_cccd, action, entity_type,
    new_value, description
  ) VALUES (
    NULL, NULL,
    'system.tnvk_promotion_job',
    'system',
    jsonb_build_object(
      'tnvk_updated',          v_tnvk_count,
      'promotions_upcoming_30d', v_promo_count,
      'tnvk_changes',          v_tnvk_summary,
      'promotions',            v_promo_summary,
      'run_date',              CURRENT_DATE
    ),
    format(
      'Cron TNVK + nang bac: %s NV co TNVK thay doi, %s NV den han nang bac trong 30 ngay toi',
      v_tnvk_count, v_promo_count
    )
  );

  RETURN format(
    'OK: %s TNVK updated, %s upcoming promotions in 30d',
    v_tnvk_count, v_promo_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalc_tnvk_for_top_grade()         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_upcoming_promotions(INTEGER)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_monthly_tnvk_promotion_job()    TO service_role;

-- =====================================================================
-- 4. CRON JOB — 00:30 UTC ngày 1 hàng tháng (~07:30 VN ngày 1)
-- =====================================================================
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job
   WHERE jobname = 'v75_monthly_tnvk_promotion';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
    RAISE NOTICE 'Da unschedule job cu id=%', jid;
  END IF;
END $$;

SELECT cron.schedule(
  'v75_monthly_tnvk_promotion',
  '30 0 1 * *',
  $$SELECT public.run_monthly_tnvk_promotion_job()$$
);

-- =====================================================================
-- SMOKE TEST (paste tiếp các block dưới sau khi Run xong trên):
--
--   -- 1) Job đã đăng ký?
--   SELECT jobid, jobname, schedule, command, active
--     FROM cron.job WHERE jobname = 'v75_monthly_tnvk_promotion';
--
--   -- 2) Chạy thủ công ngay (không đợi ngày 1):
--   SELECT public.run_monthly_tnvk_promotion_job();
--
--   -- 3) Xem log tổng kết vừa ghi:
--   SELECT created_at, description, new_value
--     FROM public.activity_logs
--    WHERE action = 'system.tnvk_promotion_job'
--    ORDER BY created_at DESC LIMIT 5;
--
--   -- 4) List NV sắp đến hạn nâng bậc trong 60 ngày:
--   SELECT * FROM public.check_upcoming_promotions(60);
-- =====================================================================
