-- Migration 011: RPC get_salary_trend — aggregate server-side thay vì client-side
-- Giảm data transfer từ N_employees × months rows → chỉ còn months rows.
-- SECURITY DEFINER để bypass RLS (function chỉ dùng cho admin_luong/admin_he_thong).

CREATE OR REPLACE FUNCTION public.get_salary_trend(p_months INT DEFAULT 12)
RETURNS TABLE (
  month_year     TEXT,
  tong_qui_luong NUMERIC,
  tong_thuc_linh NUMERIC,
  tong_thue_tncn NUMERIC,
  tong_trich_nld NUMERIC,
  so_nv          BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    month_year,
    SUM(COALESCE(tong_chiu_thue, 0) + COALESCE(tong_khong_ct, 0)) AS tong_qui_luong,
    SUM(COALESCE(thuc_linh, 0))                                     AS tong_thuc_linh,
    SUM(COALESCE(thue_tncn, 0))                                     AS tong_thue_tncn,
    SUM(COALESCE(trich_nld, 0))                                     AS tong_trich_nld,
    COUNT(*)                                                         AS so_nv
  FROM salary_records
  WHERE month_year >= TO_CHAR(
    DATE_TRUNC('month', NOW()) - ((p_months - 1) * INTERVAL '1 month'),
    'YYYY-MM'
  )
  GROUP BY month_year
  ORDER BY month_year ASC;
$$;

-- Cho phép authenticated users gọi function này
GRANT EXECUTE ON FUNCTION public.get_salary_trend(INT) TO authenticated;
