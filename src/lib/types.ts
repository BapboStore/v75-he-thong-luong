/**
 * Kiểu dữ liệu chia sẻ giữa client và DB.
 * Đồng bộ với supabase/migrations/001_initial_schema.sql
 */

export type UserRole = 'user' | 'truong_phong' | 'admin_luong' | 'admin_he_thong'

export type EmployeeStatus =
  | 'dang_lam_viec'
  | 'luan_chuyen'
  | 'da_nghi_huu'
  | 'da_nghi_viec'

export type DepartmentSalaryType = 'hanh_chinh' | 'lai_xe' | 'bao_ve_ky_thuat'

export interface Department {
  id: string
  code: string
  name: string
  parent_id: string | null
  salary_type: DepartmentSalaryType
  is_active: boolean
}

export interface Employee {
  id: string
  cccd: string
  ho_ten: string
  department_id: string | null
  chuc_vu: string | null
  ngach_code: string | null
  bac: number | null
  status: EmployeeStatus
}

export interface AppUser {
  id: string
  cccd: string
  employee_id: string | null
  role: UserRole
  department_id: string | null
  must_change_password: boolean
  failed_attempts: number
  locked_until: string | null
  is_active: boolean
  last_login_at: string | null
}

export interface AuthProfile {
  user: AppUser
  employee: Employee | null
  department: Department | null
}

export const ROLE_LABEL: Record<UserRole, string> = {
  user: 'Nhân viên',
  truong_phong: 'Trưởng phòng',
  admin_luong: 'Quản trị Lương',
  admin_he_thong: 'Quản trị Hệ thống',
}

export const STATUS_LABEL: Record<EmployeeStatus, string> = {
  dang_lam_viec: 'Đang làm việc',
  luan_chuyen: 'Luân chuyển',
  da_nghi_huu: 'Đã nghỉ hưu',
  da_nghi_viec: 'Đã nghỉ việc',
}

export const DEPT_TYPE_LABEL: Record<DepartmentSalaryType, string> = {
  hanh_chinh: 'Hành chính',
  lai_xe: 'Lái xe',
  bao_ve_ky_thuat: 'Bảo vệ / Kỹ thuật',
}

// =============================================================
// Salary grade & config
// =============================================================

export interface SalaryGrade {
  id: string
  ngach_code: string
  ngach_name: string
  bac: number
  he_so: number
  is_bac_cuoi: boolean
  thoi_gian_cho_thang: number
  chu_ky_nang_bac_nam: number
}

export interface SalaryConfig {
  id: string
  effective_date: string
  luong_co_so: number
  tien_an_trua_max: number
  giam_tru_ban_than: number
  giam_tru_phu_thuoc: number
  ty_le_bh_nld: number
  ty_le_bh_dv: number
  ty_le_cong_doan_phi: number
  so_ngay_cong_chuan: number
  he_so_lam_dem: number
  don_gia_km_lai_xe: number
  don_gia_an_trua_ngay: number
  note: string | null
  created_by: string | null
  created_at: string
}

// Mở rộng Employee với toàn bộ trường có trong DB
export interface EmployeeFull extends Employee {
  ngay_sinh: string | null
  gioi_tinh: string | null
  dia_chi: string | null
  so_dien_thoai: string | null
  email: string | null
  ngay_huong_bac: string | null
  tnvk_percent: number
  he_so_pccv: number
  he_so_pctn: number
  so_nguoi_phu_thuoc: number
  so_tai_khoan: string | null
  ten_ngan_hang: string | null
  ngay_vao_lam: string | null
  ngay_thay_doi_status: string | null
  ghi_chu: string | null
}

// =============================================================
// Attendance
// =============================================================
export type AttendanceStatus = 'draft' | 'pending' | 'locked'

export const ATT_STATUS_LABEL: Record<AttendanceStatus, string> = {
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  locked: 'Đã chốt',
}

export interface AttendanceOffice {
  id: string
  employee_id: string
  department_id: string
  month_year: string
  cong_tg: number
  cong_t7cn: number
  ngoai_gio: number
  cong_vd: number
  le_tet_hoc_phep: number
  le_tet_di_lam: number
  status: AttendanceStatus
  ghi_chu: string | null
}

export interface AttendanceSecurity {
  id: string
  employee_id: string
  department_id: string
  month_year: string
  cong_ngay: number
  cong_dem: number
  cong_t7cn: number
  ngoai_gio: number
  le_tet_di_lam: number
  le_tet_hoc_phep: number
  status: AttendanceStatus
  ghi_chu: string | null
}

export interface AttendanceTechnician {
  id: string
  employee_id: string
  department_id: string
  month_year: string
  cong_tg: number
  cong_t7cn: number
  ngoai_gio: number
  le_tet_di_lam: number
  le_tet_hoc_phep: number
  status: AttendanceStatus
  ghi_chu: string | null
}

export type DriverSource = 'truong_phong' | 'admin_luong'

// =============================================================
// Salary records (Module 4)
// =============================================================
export type SalaryRecordStatus = 'draft' | 'pending' | 'approved' | 'cancelled'

export const SR_STATUS_LABEL: Record<SalaryRecordStatus, string> = {
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  cancelled: 'Đã huỷ',
}

export interface SalaryRecord {
  id: string
  employee_id: string
  department_id: string
  month_year: string
  // Snapshot identity
  cccd: string
  ho_ten: string
  chuc_vu: string | null
  ngach_code: string | null
  bac: number | null
  he_so_bac: number | null
  tnvk_percent: number | null
  he_so_pccv: number | null
  he_so_pctn: number | null
  // Snapshot config
  luong_co_so: number | null
  lcb_ngay: number | null
  // Chịu thuế
  tien_pccv_pctn: number | null
  tien_luong_ct: number | null
  thuong: number | null
  tong_chiu_thue: number | null
  // Không chịu thuế
  tien_luong_kct: number | null
  an_trua: number | null
  xang_xe: number | null
  dien_thoai: number | null
  tong_khong_ct: number | null
  // BH & thuế
  co_so_trich: number | null
  trich_nld: number | null
  don_vi_dong: number | null
  cdp: number | null
  thue_tncn: number | null
  truy_thu: number | null
  truy_linh: number | null
  thuc_linh: number | null
  // Banking
  so_tai_khoan: string | null
  ten_ngan_hang: string | null
  raw_data: Record<string, unknown> | null
  // Workflow
  status: SalaryRecordStatus
  approved_by: string | null
  approved_at: string | null
  cancelled_by: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface AttendanceDriver {
  id: string
  employee_id: string
  department_id: string
  month_year: string
  source: DriverSource
  s600: number
  xe_4_7: number
  xe_16_29: number
  cong_mia: number
  nhan_cong: number
  cong_cho: number
  so_km: number
  cong_t7cn: number
  ngoai_gio: number
  le_tet_di_lam: number
  le_tet_hoc_phep: number
  status: AttendanceStatus
  is_matched: boolean
  ghi_chu: string | null
}

// =============================================================
// Activity logs (Module 5 — phiên 8)
// =============================================================

export interface ActivityLog {
  id: string
  user_id: string | null
  user_cccd: string | null
  /** Định dạng `<op>.<table>`: insert.departments, update.users, delete.attendance_driver, ... */
  action: string
  entity_type: string | null
  entity_id: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  description: string | null
  created_at: string
}

/** Tách action `<op>.<table>` thành `{ op, table }`. Phòng trường hợp action không có dấu chấm. */
export function parseLogAction(action: string): { op: string; table: string } {
  const i = action.indexOf('.')
  if (i < 0) return { op: action, table: '' }
  return { op: action.slice(0, i), table: action.slice(i + 1) }
}

export const LOG_OP_LABEL: Record<string, string> = {
  insert: 'Thêm mới',
  update: 'Cập nhật',
  delete: 'Xoá',
  login: 'Đăng nhập',
  logout: 'Đăng xuất',
}

/** Bảng audit từ migration 005/006 phủ 9 bảng (users đã DROP). Dùng cho dropdown filter. */
export const LOG_ENTITY_TYPES = [
  'departments',
  'employees',
  'salary_config',
  'salary_grades',
  'attendance_office',
  'attendance_driver',
  'attendance_security',
  'attendance_technician',
  'salary_records',
] as const
