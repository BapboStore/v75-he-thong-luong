# Supabase – V75

## Thứ tự chạy migration (SQL Editor hoặc `supabase db push`)

1. `migrations/001_initial_schema.sql`
   - 11 bảng: departments, salary_grades, salary_config, employees, users, attendance_office, attendance_driver, attendance_security, attendance_technician, salary_records, activity_logs.
   - Enum: `user_role`, `employee_status`, `department_salary_type`, `attendance_status`, `salary_record_status`.
   - Trigger `set_updated_at` cho các bảng có `updated_at`.

2. `migrations/002_rls_policies.sql`
   - Helper functions `current_user_role`, `current_user_dept`, `current_employee_id`, `is_admin_he_thong`, `is_admin_luong`, `is_truong_phong_of` (SECURITY DEFINER, tránh đệ quy RLS).
   - Bật RLS cho tất cả 11 bảng + policies cho 4 role.

3. `migrations/003_seed_data.sql`
   - 8 phòng ban mặc định, đầy đủ ngạch-bậc (RULE-02), `salary_config` hiện hành (RULE-04).

4. `scripts/seed-users.mjs`
   - Tạo 8 demo user (đủ 4 role) qua Auth Admin API.
   - Yêu cầu env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
   - Mật khẩu mặc định: `8888V75`.

## Lưu ý phân quyền

- **Bảng `users` và `employees`**: ghi đè được bằng `admin_he_thong` (users) và `admin_he_thong/admin_luong` (employees).
- **Soft delete**: không xoá; đổi `users.is_active = false` hoặc `employees.status = 'da_nghi_viec'`.
- **Versioning `salary_config`**: thêm bản ghi mới với `effective_date`, không sửa bản cũ.
- **Activity logs**: client tự `INSERT` (RLS chỉ cho phép `user_id = auth.uid()`); chỉ `admin_he_thong` đọc được.

## Khi mở rộng

- Tạo Edge Function (`supabase/functions/...`) cho:
  - Khoá tài khoản phía server (đếm `failed_attempts` chuẩn xác).
  - Cron TNVK & nâng bậc (RULE-02, RULE-03).
  - Ghi `activity_logs` từ DB trigger trên các bảng quan trọng.
