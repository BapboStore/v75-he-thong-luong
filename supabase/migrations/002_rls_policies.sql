-- =====================================================================
-- V75 SALARY SYSTEM - ROW LEVEL SECURITY (RLS)
-- File: 002_rls_policies.sql
-- Mô tả: Phân quyền 4 role tại DB (RULE-01, RULE-09 #4)
--   - user            : chỉ xem dữ liệu của chính mình
--   - truong_phong    : nhập/sửa bảng công phòng mình; xem lương cả phòng
--   - admin_luong     : nhập/sửa công & lương mọi phòng; duyệt
--   - admin_he_thong  : toàn quyền
-- =====================================================================

-- =====================================================================
-- HELPER FUNCTIONS – đặt trong schema public, SECURITY DEFINER để
-- tránh đệ quy RLS khi đọc bảng users từ trong policy.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_dept()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT department_id FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT employee_id FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin_he_thong()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin_he_thong' AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_luong()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role IN ('admin_luong','admin_he_thong')
      AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_truong_phong_of(dept UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role = 'truong_phong'
      AND department_id = dept
      AND is_active = TRUE
  );
$$;

-- =====================================================================
-- ENABLE RLS TRÊN TẤT CẢ BẢNG
-- =====================================================================
ALTER TABLE public.departments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_grades          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_config          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_office      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_driver      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_security    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_technician  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_records         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs          ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- DEPARTMENTS – ai cũng đọc được; chỉ admin_he_thong sửa
-- =====================================================================
DROP POLICY IF EXISTS dept_select_all ON public.departments;
CREATE POLICY dept_select_all ON public.departments
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS dept_admin_write ON public.departments;
CREATE POLICY dept_admin_write ON public.departments
  FOR ALL USING (public.is_admin_he_thong())
  WITH CHECK (public.is_admin_he_thong());

-- =====================================================================
-- SALARY_GRADES – ai cũng đọc; chỉ admin_he_thong sửa
-- =====================================================================
DROP POLICY IF EXISTS grades_select_all ON public.salary_grades;
CREATE POLICY grades_select_all ON public.salary_grades
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS grades_admin_write ON public.salary_grades;
CREATE POLICY grades_admin_write ON public.salary_grades
  FOR ALL USING (public.is_admin_he_thong())
  WITH CHECK (public.is_admin_he_thong());

-- =====================================================================
-- SALARY_CONFIG – ai cũng đọc; chỉ admin_he_thong sửa
-- =====================================================================
DROP POLICY IF EXISTS config_select_all ON public.salary_config;
CREATE POLICY config_select_all ON public.salary_config
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS config_admin_write ON public.salary_config;
CREATE POLICY config_admin_write ON public.salary_config
  FOR ALL USING (public.is_admin_he_thong())
  WITH CHECK (public.is_admin_he_thong());

-- =====================================================================
-- EMPLOYEES
-- =====================================================================
DROP POLICY IF EXISTS emp_select ON public.employees;
CREATE POLICY emp_select ON public.employees
  FOR SELECT USING (
    public.is_admin_luong()
    OR (public.current_user_role() = 'truong_phong' AND department_id = public.current_user_dept())
    OR (public.current_user_role() = 'user' AND id = public.current_employee_id())
  );

DROP POLICY IF EXISTS emp_admin_write ON public.employees;
CREATE POLICY emp_admin_write ON public.employees
  FOR ALL USING (public.is_admin_he_thong() OR public.current_user_role() = 'admin_luong')
  WITH CHECK (public.is_admin_he_thong() OR public.current_user_role() = 'admin_luong');

-- =====================================================================
-- USERS
-- =====================================================================
DROP POLICY IF EXISTS users_select_self ON public.users;
CREATE POLICY users_select_self ON public.users
  FOR SELECT USING (
    id = auth.uid()
    OR public.is_admin_he_thong()
    OR (public.current_user_role() = 'admin_luong')
    OR (public.current_user_role() = 'truong_phong' AND department_id = public.current_user_dept())
  );

DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self ON public.users
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS users_admin_all ON public.users;
CREATE POLICY users_admin_all ON public.users
  FOR ALL USING (public.is_admin_he_thong())
  WITH CHECK (public.is_admin_he_thong());

-- =====================================================================
-- ATTENDANCE_OFFICE
-- =====================================================================
DROP POLICY IF EXISTS att_off_select ON public.attendance_office;
CREATE POLICY att_off_select ON public.attendance_office
  FOR SELECT USING (
    public.is_admin_luong()
    OR (public.current_user_role() = 'truong_phong' AND department_id = public.current_user_dept())
    OR (public.current_user_role() = 'user' AND employee_id = public.current_employee_id())
  );

DROP POLICY IF EXISTS att_off_tp_write ON public.attendance_office;
CREATE POLICY att_off_tp_write ON public.attendance_office
  FOR INSERT WITH CHECK (
    public.is_admin_luong()
    OR (public.is_truong_phong_of(department_id) AND status IN ('draft','pending'))
  );

DROP POLICY IF EXISTS att_off_tp_update ON public.attendance_office;
CREATE POLICY att_off_tp_update ON public.attendance_office
  FOR UPDATE USING (
    public.is_admin_luong()
    OR (public.is_truong_phong_of(department_id) AND status IN ('draft','pending'))
  )
  WITH CHECK (
    public.is_admin_luong()
    OR (public.is_truong_phong_of(department_id) AND status IN ('draft','pending'))
  );

-- =====================================================================
-- ATTENDANCE_DRIVER
-- =====================================================================
DROP POLICY IF EXISTS att_drv_select ON public.attendance_driver;
CREATE POLICY att_drv_select ON public.attendance_driver
  FOR SELECT USING (
    public.is_admin_luong()
    OR (public.current_user_role() = 'truong_phong' AND department_id = public.current_user_dept())
    OR (public.current_user_role() = 'user' AND employee_id = public.current_employee_id())
  );

DROP POLICY IF EXISTS att_drv_write ON public.attendance_driver;
CREATE POLICY att_drv_write ON public.attendance_driver
  FOR ALL USING (
    public.is_admin_luong()
    OR (public.is_truong_phong_of(department_id) AND status IN ('draft','pending'))
  )
  WITH CHECK (
    public.is_admin_luong()
    OR (public.is_truong_phong_of(department_id) AND status IN ('draft','pending'))
  );

-- =====================================================================
-- ATTENDANCE_SECURITY & TECHNICIAN – tương tự office
-- =====================================================================
DROP POLICY IF EXISTS att_sec_select ON public.attendance_security;
CREATE POLICY att_sec_select ON public.attendance_security
  FOR SELECT USING (
    public.is_admin_luong()
    OR (public.current_user_role() = 'truong_phong' AND department_id = public.current_user_dept())
    OR (public.current_user_role() = 'user' AND employee_id = public.current_employee_id())
  );

DROP POLICY IF EXISTS att_sec_write ON public.attendance_security;
CREATE POLICY att_sec_write ON public.attendance_security
  FOR ALL USING (
    public.is_admin_luong()
    OR (public.is_truong_phong_of(department_id) AND status IN ('draft','pending'))
  )
  WITH CHECK (
    public.is_admin_luong()
    OR (public.is_truong_phong_of(department_id) AND status IN ('draft','pending'))
  );

DROP POLICY IF EXISTS att_tech_select ON public.attendance_technician;
CREATE POLICY att_tech_select ON public.attendance_technician
  FOR SELECT USING (
    public.is_admin_luong()
    OR (public.current_user_role() = 'truong_phong' AND department_id = public.current_user_dept())
    OR (public.current_user_role() = 'user' AND employee_id = public.current_employee_id())
  );

DROP POLICY IF EXISTS att_tech_write ON public.attendance_technician;
CREATE POLICY att_tech_write ON public.attendance_technician
  FOR ALL USING (
    public.is_admin_luong()
    OR (public.is_truong_phong_of(department_id) AND status IN ('draft','pending'))
  )
  WITH CHECK (
    public.is_admin_luong()
    OR (public.is_truong_phong_of(department_id) AND status IN ('draft','pending'))
  );

-- =====================================================================
-- SALARY_RECORDS
-- =====================================================================
DROP POLICY IF EXISTS sr_select ON public.salary_records;
CREATE POLICY sr_select ON public.salary_records
  FOR SELECT USING (
    public.is_admin_luong()
    OR (public.current_user_role() = 'truong_phong' AND department_id = public.current_user_dept())
    OR (public.current_user_role() = 'user' AND employee_id = public.current_employee_id())
  );

DROP POLICY IF EXISTS sr_admin_write ON public.salary_records;
CREATE POLICY sr_admin_write ON public.salary_records
  FOR ALL USING (public.is_admin_luong())
  WITH CHECK (public.is_admin_luong());

-- =====================================================================
-- ACTIVITY_LOGS – chỉ admin_he_thong xem; user thường không truy cập
-- INSERT cho phép mọi user authenticated (để client log hoạt động)
-- =====================================================================
DROP POLICY IF EXISTS logs_admin_select ON public.activity_logs;
CREATE POLICY logs_admin_select ON public.activity_logs
  FOR SELECT USING (public.is_admin_he_thong());

DROP POLICY IF EXISTS logs_insert_self ON public.activity_logs;
CREATE POLICY logs_insert_self ON public.activity_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());
