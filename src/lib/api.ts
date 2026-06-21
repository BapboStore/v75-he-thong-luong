/**
 * V75 — Tầng truy cập dữ liệu.
 * Mọi component không gọi supabase trực tiếp cho CRUD nghiệp vụ
 * mà gọi qua module này. Giúp gom lỗi, log, retry tập trung.
 *
 * v0.4.0: Đã XOÁ toàn bộ `logActivity` khỏi client. Activity logs nay
 *         do Postgres trigger `trg_audit_<table>` (migration 005) tự
 *         động ghi server-side với JWT của caller. Lợi ích:
 *         - Không bao giờ mất audit (kể cả khi user đóng tab giữa request).
 *         - Hot-path CRUD không còn chiếm HTTP connection pool cho log.
 *         - Save batch chấm công nhanh hơn rõ rệt.
 */
import { supabase, withTimeout } from '@/lib/supabase'
import type {
  ActivityLog,
  AppUser,
  AttendanceDriver,
  AttendanceOffice,
  AttendanceSecurity,
  AttendanceStatus,
  AttendanceTechnician,
  Department,
  DriverSource,
  EmployeeFull,
  SalaryConfig,
  SalaryGrade,
  SalaryRecord,
  SalaryRecordStatus,
} from '@/lib/types'

// =============================================================
// DEPARTMENTS
// =============================================================

export async function listDepartments(): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .order('code', { ascending: true })
  if (error) throw error
  return (data ?? []) as Department[]
}

export async function createDepartment(d: Omit<Department, 'id'>): Promise<Department> {
  const { data, error } = await supabase
    .from('departments')
    .insert(d)
    .select()
    .single()
  if (error) throw error
  // v0.4.0: audit đã do trigger `trg_audit_departments` ghi tự động
  return data as Department
}

export async function updateDepartment(id: string, patch: Partial<Department>): Promise<Department> {
  const { data, error } = await supabase
    .from('departments')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  // v0.4.0: audit đã do trigger `trg_audit_departments` ghi tự động
  return data as Department
}

export async function setDepartmentActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase.from('departments').update({ is_active }).eq('id', id)
  if (error) throw error
  // v0.4.0: audit đã do trigger ghi tự động (UPDATE departments)
}

// =============================================================
// EMPLOYEES
// =============================================================

export async function listEmployees(filter?: {
  department_id?: string | null
  status?: string | null
  q?: string
}): Promise<EmployeeFull[]> {
  let q = supabase.from('employees').select('*').order('ho_ten', { ascending: true })
  if (filter?.department_id) q = q.eq('department_id', filter.department_id)
  if (filter?.status) q = q.eq('status', filter.status)
  if (filter?.q && filter.q.trim()) {
    const k = filter.q.trim()
    q = q.or(`ho_ten.ilike.%${k}%,cccd.ilike.%${k}%,chuc_vu.ilike.%${k}%`)
  }
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as EmployeeFull[]
}

export async function createEmployee(e: Partial<EmployeeFull>): Promise<EmployeeFull> {
  const { data, error } = await supabase.from('employees').insert(e).select().single()
  if (error) throw error
  // v0.4.0: audit đã do trigger `trg_audit_employees` ghi tự động
  return data as EmployeeFull
}

export async function updateEmployee(id: string, patch: Partial<EmployeeFull>): Promise<EmployeeFull> {
  const { data, error } = await supabase
    .from('employees')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  // v0.4.0: audit đã do trigger `trg_audit_employees` ghi tự động
  return data as EmployeeFull
}

export async function deleteEmployee(id: string): Promise<void> {
  // Kiểm tra dữ liệu liên quan trước khi xoá
  const checks = await Promise.all([
    supabase.from('salary_records').select('id', { count: 'exact', head: true }).eq('employee_id', id),
    supabase.from('attendance_office').select('id', { count: 'exact', head: true }).eq('employee_id', id),
    supabase.from('attendance_driver').select('id', { count: 'exact', head: true }).eq('employee_id', id),
    supabase.from('attendance_security').select('id', { count: 'exact', head: true }).eq('employee_id', id),
    supabase.from('attendance_technician').select('id', { count: 'exact', head: true }).eq('employee_id', id),
  ])
  const [salary, office, driver, security, technician] = checks
  const salaryCount = salary.count ?? 0
  const attCount = (office.count ?? 0) + (driver.count ?? 0) + (security.count ?? 0) + (technician.count ?? 0)

  if (salaryCount > 0)
    throw new Error(`Không thể xoá: nhân viên có ${salaryCount} bản ghi lương. Hãy chuyển trạng thái "Đã nghỉ việc" thay vì xoá.`)
  if (attCount > 0)
    throw new Error(`Không thể xoá: nhân viên có ${attCount} bản ghi chấm công. Hãy chuyển trạng thái "Đã nghỉ việc" thay vì xoá.`)

  // Null FK trên users trước (không xoá user account)
  const { error: userErr } = await supabase
    .from('users').update({ employee_id: null }).eq('employee_id', id)
  if (userErr) throw userErr

  const { error } = await supabase.from('employees').delete().eq('id', id)
  if (error) throw error
}

// =============================================================
// SALARY GRADES & CONFIG
// =============================================================

// Bảng hệ số bậc gần như không thay đổi trong suốt session → cache module-level.
let _gradesCache: SalaryGrade[] | null = null

export async function listSalaryGrades(): Promise<SalaryGrade[]> {
  if (_gradesCache) return _gradesCache
  const { data, error } = await supabase
    .from('salary_grades')
    .select('*')
    .order('ngach_code', { ascending: true })
    .order('bac', { ascending: true })
  if (error) throw error
  _gradesCache = (data ?? []) as SalaryGrade[]
  return _gradesCache
}

export async function listSalaryConfigs(): Promise<SalaryConfig[]> {
  const { data, error } = await supabase
    .from('salary_config')
    .select('*')
    .order('effective_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as SalaryConfig[]
}

export async function createSalaryConfig(c: Omit<SalaryConfig, 'id' | 'created_at'>): Promise<SalaryConfig> {
  const { data, error } = await supabase.from('salary_config').insert(c).select().single()
  if (error) throw error
  // v0.4.0: audit đã do trigger `trg_audit_salary_config` ghi tự động
  return data as SalaryConfig
}

/** Lấy cấu hình áp dụng cho một tháng (effective_date <= cuối tháng đó) */
export async function getActiveSalaryConfig(monthYear: string): Promise<SalaryConfig | null> {
  // monthYear: 'YYYY-MM'
  const [y, m] = monthYear.split('-').map(Number)
  const lastDay = new Date(y, m, 0).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('salary_config')
    .select('*')
    .lte('effective_date', lastDay)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as SalaryConfig) ?? null
}

// =============================================================
// USERS
// =============================================================

export async function listUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('cccd', { ascending: true })
  if (error) throw error
  return (data ?? []) as AppUser[]
}

export async function updateUserRow(id: string, patch: Partial<AppUser>): Promise<AppUser> {
  const { data, error } = await supabase
    .from('users')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  // v0.4.0: audit đã do trigger `trg_audit_users` ghi tự động
  return data as AppUser
}

// =============================================================
// ATTENDANCE
// =============================================================

type AttTable = 'attendance_office' | 'attendance_security' | 'attendance_technician' | 'attendance_driver'

export async function listAttendanceOffice(department_id: string, month_year: string): Promise<AttendanceOffice[]> {
  const { data, error } = await supabase
    .from('attendance_office')
    .select('*')
    .eq('department_id', department_id)
    .eq('month_year', month_year)
  if (error) throw error
  return (data ?? []) as AttendanceOffice[]
}

export async function listAttendanceSecurity(department_id: string, month_year: string): Promise<AttendanceSecurity[]> {
  const { data, error } = await supabase
    .from('attendance_security')
    .select('*')
    .eq('department_id', department_id)
    .eq('month_year', month_year)
  if (error) throw error
  return (data ?? []) as AttendanceSecurity[]
}

export async function listAttendanceTechnician(department_id: string, month_year: string): Promise<AttendanceTechnician[]> {
  const { data, error } = await supabase
    .from('attendance_technician')
    .select('*')
    .eq('department_id', department_id)
    .eq('month_year', month_year)
  if (error) throw error
  return (data ?? []) as AttendanceTechnician[]
}

export async function listAttendanceDriver(
  department_id: string,
  month_year: string,
): Promise<AttendanceDriver[]> {
  const { data, error } = await supabase
    .from('attendance_driver')
    .select('*')
    .eq('department_id', department_id)
    .eq('month_year', month_year)
  if (error) throw error
  return (data ?? []) as AttendanceDriver[]
}

export async function upsertAttendance<T extends { id?: string; employee_id: string; month_year: string }>(
  table: AttTable,
  row: T,
  conflictKey: string = 'employee_id,month_year',
): Promise<void> {
  // Bỏ id rỗng để DB tự sinh khi insert
  const payload: Record<string, unknown> = { ...row }
  if (!payload.id) delete payload.id
  const { error } = await supabase.from(table).upsert(payload, { onConflict: conflictKey })
  if (error) throw error
}

/**
 * Upsert HÀNG LOẠT chấm công.
 *
 * v0.3.4: chia chunk 10 row/lần để tránh RLS evaluate quá nhiều row
 *         trong 1 statement; mỗi chunk bọc `withTimeout(12s)` cho thông báo
 *         lỗi rõ ràng nếu Supabase chậm. Log chỉ ghi 1 dòng SAU CÙNG, không
 *         kèm vào hot-path để tránh chiếm connection pool.
 */
export async function upsertAttendanceBatch<T extends { id?: string; employee_id: string; month_year: string }>(
  table: AttTable,
  rows: T[],
  conflictKey: string = 'employee_id,month_year',
): Promise<void> {
  if (rows.length === 0) return

  const payloads = rows.map((row) => {
    const p: Record<string, unknown> = { ...row }
    if (!p.id) delete p.id
    return p
  })

  const CHUNK = 10
  for (let i = 0; i < payloads.length; i += CHUNK) {
    const slice = payloads.slice(i, i + CHUNK)
    const { error } = await withTimeout(
      supabase.from(table).upsert(slice, { onConflict: conflictKey }),
      12_000,
      `upsert ${table} (chunk ${i / CHUNK + 1})`,
    )
    if (error) throw error
  }

  // v0.4.0: trigger `trg_audit_<table>` đã ghi 1 dòng/row tự động.
  // Không cần log gộp client-side nữa.
}

export async function setAttendanceStatus(
  table: AttTable,
  ids: string[],
  status: AttendanceStatus,
  meta?: { submitted_by?: string; locked_by?: string },
): Promise<void> {
  if (ids.length === 0) return
  const patch: Record<string, unknown> = { status }
  if (status === 'pending') {
    patch.submitted_at = new Date().toISOString()
    if (meta?.submitted_by) patch.submitted_by = meta.submitted_by
  }
  if (status === 'locked' && table !== 'attendance_driver') {
    patch.locked_at = new Date().toISOString()
    if (meta?.locked_by) patch.locked_by = meta.locked_by
  }
  const { error } = await supabase.from(table).update(patch).in('id', ids)
  if (error) throw error
  // v0.4.0: audit đã do trigger `trg_audit_<table>` ghi tự động (UPDATE)
}

// =============================================================
// SALARY RECORDS (Module 4)
// =============================================================

export async function listSalaryRecords(
  department_id: string | null,
  month_year: string,
): Promise<SalaryRecord[]> {
  let q = supabase
    .from('salary_records')
    .select('*')
    .eq('month_year', month_year)
    .order('ho_ten', { ascending: true })
  if (department_id) q = q.eq('department_id', department_id)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as SalaryRecord[]
}

/** Phiếu lương cá nhân (user) — RLS đã giới hạn employee_id = chính mình. */
export async function listMySalaryRecords(employee_id: string): Promise<SalaryRecord[]> {
  const { data, error } = await supabase
    .from('salary_records')
    .select('*')
    .eq('employee_id', employee_id)
    .order('month_year', { ascending: false })
  if (error) throw error
  return (data ?? []) as SalaryRecord[]
}

export async function getSalaryRecord(
  employee_id: string,
  month_year: string,
): Promise<SalaryRecord | null> {
  const { data, error } = await supabase
    .from('salary_records')
    .select('*')
    .eq('employee_id', employee_id)
    .eq('month_year', month_year)
    .maybeSingle()
  if (error) throw error
  return (data as SalaryRecord) ?? null
}

/**
 * Upsert hàng loạt bản ghi lương (status='draft').
 * Chỉ ghi đè bản chưa approved — caller (UI) đã lọc trước khi gọi.
 */
export async function upsertSalaryRecords(
  records: Array<Partial<SalaryRecord> & { employee_id: string; month_year: string; department_id: string }>,
  created_by: string | null,
): Promise<void> {
  if (records.length === 0) return

  // PostgREST normalize toàn bộ batch thành 1 INSERT với union tất cả cột.
  // Nếu batch chứa cả bản cũ (có id) lẫn bản mới (không id), các bản mới
  // sẽ bị gán id=NULL → vi phạm NOT NULL. Fix: tách thành 2 lần gọi.
  const newRecs    = records.filter(r => r.id == null)
  const existingRecs = records.filter(r => r.id != null)

  if (newRecs.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const payload = newRecs.map(({ id: _id, ...r }) => ({
      ...r,
      created_by: r.created_by ?? created_by,
      status: r.status ?? 'draft',
    }))
    const { error } = await supabase.from('salary_records').insert(payload)
    if (error) throw error
  }

  if (existingRecs.length > 0) {
    const payload = existingRecs.map((r) => ({
      ...r,
      created_by: r.created_by ?? created_by,
      status: r.status ?? 'draft',
    }))
    const { error } = await supabase
      .from('salary_records')
      .upsert(payload, { onConflict: 'employee_id,month_year' })
    if (error) throw error
  }
  // v0.4.0: audit đã do trigger `trg_audit_salary_records` ghi tự động
}

export async function setSalaryRecordsStatus(
  ids: string[],
  status: SalaryRecordStatus,
  meta?: { approved_by?: string; cancelled_by?: string; cancel_reason?: string },
): Promise<void> {
  if (ids.length === 0) return
  const patch: Record<string, unknown> = { status }
  if (status === 'approved') {
    patch.approved_at = new Date().toISOString()
    if (meta?.approved_by) patch.approved_by = meta.approved_by
  }
  if (status === 'cancelled') {
    patch.cancelled_at = new Date().toISOString()
    if (meta?.cancelled_by) patch.cancelled_by = meta.cancelled_by
    if (meta?.cancel_reason) patch.cancel_reason = meta.cancel_reason
  }
  const { error } = await supabase
    .from('salary_records')
    .update(patch)
    .in('id', ids)
  if (error) throw error
  // v0.4.0: audit đã do trigger `trg_audit_salary_records` ghi tự động (UPDATE)
}

/** Xoá bảng lương theo danh sách id. Kể cả approved — trigger audit ghi nhận DELETE. */
export async function deleteSalaryRecords(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('salary_records').delete().in('id', ids)
  if (error) throw error
}

/** Xoá toàn bộ bảng chấm công của một phòng+tháng (theo bảng tương ứng). */
export async function deleteAttendanceMonth(
  table: 'attendance_office' | 'attendance_security' | 'attendance_technician' | 'attendance_driver',
  department_id: string,
  month_year: string,
): Promise<number> {
  // Lấy count trước
  const { count } = await supabase
    .from(table).select('id', { count: 'exact', head: true })
    .eq('department_id', department_id).eq('month_year', month_year)
  const { error } = await supabase
    .from(table).delete()
    .eq('department_id', department_id).eq('month_year', month_year)
  if (error) throw error
  return count ?? 0
}

// =============================================================
// ACTIVITY LOGS (Module 5 — phiên 8)
// =============================================================

export interface ActivityLogFilter {
  /** CCCD người gây hành động (exact match, prefix bằng ilike) */
  user_cccd?: string | null
  /** Loại bảng (entity_type column) — insert/update/delete đều mang `TG_TABLE_NAME` */
  entity_type?: string | null
  /** Tiền tố action: `insert`, `update`, `delete` (server lưu `<op>.<table>`) */
  op?: 'insert' | 'update' | 'delete' | null
  /** Lọc theo ngày (ISO 'YYYY-MM-DD'). dateFrom inclusive, dateTo lấy đến hết 23:59:59. */
  dateFrom?: string | null
  dateTo?: string | null
}

export interface ActivityLogPage {
  rows: ActivityLog[]
  /** Tổng số dòng theo filter (HEAD count) — dùng cho pagination. */
  total: number
}

/**
 * Đọc activity_logs với filter + paginate.
 *
 * RLS `logs_admin_select` đã chặn từ DB: chỉ admin_he_thong gọi được.
 * Caller không cần check role lại, nhưng UI vẫn nên guard route trước cho UX.
 *
 * Trả về `{ rows, total }`. `total` dùng cho UI hiển thị "1–50 / 312".
 */
export async function fetchActivityLogs(
  filter: ActivityLogFilter,
  pagination: { limit: number; offset: number },
): Promise<ActivityLogPage> {
  let q = supabase
    .from('activity_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (filter.user_cccd && filter.user_cccd.trim()) {
    q = q.ilike('user_cccd', `${filter.user_cccd.trim()}%`)
  }
  if (filter.entity_type) {
    q = q.eq('entity_type', filter.entity_type)
  }
  if (filter.op) {
    // action format: '<op>.<table>' → lọc bằng prefix
    q = q.ilike('action', `${filter.op}.%`)
  }
  if (filter.dateFrom) {
    q = q.gte('created_at', `${filter.dateFrom}T00:00:00+07:00`)
  }
  if (filter.dateTo) {
    q = q.lte('created_at', `${filter.dateTo}T23:59:59+07:00`)
  }

  q = q.range(pagination.offset, pagination.offset + pagination.limit - 1)

  const { data, error, count } = await q
  if (error) throw error
  return {
    rows: (data ?? []) as ActivityLog[],
    total: count ?? 0,
  }
}

// =============================================================
// PROMOTIONS / TNVK (Module 5 — phiên 11)
// =============================================================

/** Một dòng trả về từ RPC `check_upcoming_promotions(p_days_ahead)` (migration 008). */
export interface UpcomingPromotionRow {
  employee_id: string
  cccd: string
  ho_ten: string
  ngach_code: string
  bac: number
  ngay_huong_bac: string
  next_promotion_date: string
  days_remaining: number
}

/**
 * Lấy danh sách NV đến hạn nâng bậc trong N ngày tới (mặc định 30).
 * Gọi function PostgreSQL `public.check_upcoming_promotions(p_days_ahead)`.
 * Function đã GRANT EXECUTE cho `authenticated`, chỉ trả NV `status='dang_lam_viec'`
 * và NV CHƯA ở bậc cuối (RULE-02).
 */
export async function listUpcomingPromotions(daysAhead: number = 30): Promise<UpcomingPromotionRow[]> {
  const { data, error } = await supabase.rpc('check_upcoming_promotions', { p_days_ahead: daysAhead })
  if (error) throw error
  return (data ?? []) as UpcomingPromotionRow[]
}

/**
 * Nâng bậc 1 NV: bac += 1 + ngay_huong_bac = today.
 * Caller phải xác nhận trước. Trigger `trg_audit_employees` sẽ ghi audit
 * server-side, không cần logActivity từ client.
 *
 * Validate: bậc mới phải tồn tại trong salary_grades cùng ngach_code; nếu
 * không, trả error rõ ràng cho UI. UI cũng nên disable nút Nâng bậc khi
 * `is_bac_cuoi = TRUE`.
 */
export async function promoteEmployee(employeeId: string): Promise<EmployeeFull> {
  // 1. Lấy NV + grades song song (grades thường đã cache từ lần đầu listSalaryGrades)
  const [{ data: emp, error: empErr }, grades] = await Promise.all([
    supabase.from('employees').select('id, ngach_code, bac, ho_ten').eq('id', employeeId).maybeSingle(),
    listSalaryGrades(),
  ])
  if (empErr) throw empErr
  if (!emp) throw new Error('Không tìm thấy nhân viên.')
  if (emp.bac == null) throw new Error('NV chưa có bậc hiện tại, không thể nâng bậc.')

  const newBac = (emp.bac as number) + 1

  // 2. Verify bậc mới từ cache — không cần round-trip DB
  const grade = grades.find(g => g.ngach_code === emp.ngach_code && g.bac === newBac)
  if (!grade) {
    throw new Error(
      `Ngạch "${emp.ngach_code}" không có bậc ${newBac}. NV "${emp.ho_ten}" có thể đã ở bậc cao nhất.`,
    )
  }

  // 3. Update employees
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('employees')
    .update({ bac: newBac, ngay_huong_bac: today })
    .eq('id', employeeId)
    .select()
    .single()
  if (error) throw error
  return data as EmployeeFull
}

// =============================================================
// ADMIN — Reset password (Edge Function, phiên 11)
// =============================================================

/** Response từ Edge Function `auth-lockout` (phiên 11). */
export interface AuthLockoutResponse {
  ok: true
  locked: boolean
  failed_attempts: number
  remaining_seconds: number
  remaining_attempts: number
}

/**
 * Gọi Edge Function `auth-lockout` để KIỂM TRA / TĂNG / RESET đếm số lần
 * đăng nhập sai server-side. Không bị bypass bằng F5/clear localStorage
 * như client-side cũ.
 *
 * - action='check'     : đọc trạng thái lock hiện tại (không sửa).
 * - action='increment' : tăng failed_attempts; tự lock nếu >= 5.
 * - action='reset'     : xoá failed_attempts (gọi sau login thành công).
 */
export async function callAuthLockout(
  action: 'check' | 'increment' | 'reset',
  cccd: string,
): Promise<AuthLockoutResponse> {
  const { data, error } = await supabase.functions.invoke('auth-lockout', {
    body: { action, cccd },
  })
  if (error) {
    throw new Error(error.message || `auth-lockout (${action}) thất bại.`)
  }
  if (!data?.ok) {
    throw new Error((data as { error?: string })?.error || 'auth-lockout trả response không hợp lệ.')
  }
  return data as AuthLockoutResponse
}

/**
 * Gọi Edge Function `admin-reset-password` để reset MK 1 user về `8888V75`
 * + set must_change_password=true. Edge Function dùng service_role key
 * server-side, không expose key ra client.
 *
 * Edge Function tự verify caller là admin_he_thong (đọc JWT). Nếu không
 * phải admin → trả 403.
 */
export async function adminResetPassword(targetUserId: string): Promise<{ ok: true; cccd: string } | never> {
  const { data, error } = await supabase.functions.invoke('admin-reset-password', {
    body: { user_id: targetUserId },
  })
  if (error) {
    // Edge Function trả message lỗi qua context khi status != 2xx
    throw new Error(error.message || 'Reset mật khẩu thất bại.')
  }
  if (!data?.ok) {
    throw new Error(data?.error || 'Reset mật khẩu thất bại (không rõ lý do).')
  }
  return data as { ok: true; cccd: string }
}

// ─── send-promotion-alert ─────────────────────────────────────────────────────

/**
 * Gọi Edge Function `send-promotion-alert` để gửi email cảnh báo NV sắp đến
 * hạn nâng bậc qua Resend API. Caller phải là admin_luong hoặc admin_he_thong.
 *
 * Tiền đề: secret RESEND_API_KEY + ALERT_EMAIL_TO đã set trong Supabase.
 */
export async function adminSendPromotionAlert(
  daysAhead: number = 30,
): Promise<{ ok: true; sent: boolean; count?: number; message: string } | never> {
  const { data, error } = await supabase.functions.invoke('send-promotion-alert', {
    body: { days_ahead: daysAhead },
  })
  if (error) {
    throw new Error(error.message || 'Gửi email cảnh báo thất bại.')
  }
  if (!data?.ok) {
    throw new Error(data?.error || 'Gửi email cảnh báo thất bại (không rõ lý do).')
  }
  return data as { ok: true; sent: boolean; count?: number; message: string }
}

// ─── admin-create-user ────────────────────────────────────────────────────────

export interface CreateUserPayload {
  cccd: string
  role: import('@/lib/types').UserRole
  department_id?: string
  employee_id?: string
}

/**
 * Gọi Edge Function `admin-create-user` để tạo tài khoản mới (Auth + public.users).
 * Email tự động = cccd@v75.local, MK mặc định = 8888V75, must_change_password=true.
 * Chỉ admin_he_thong mới được gọi (Edge Function verify JWT).
 */
export async function adminCreateUser(
  payload: CreateUserPayload,
): Promise<{ ok: true; cccd: string; user_id: string; message: string }> {
  const body: Record<string, string> = {
    cccd: payload.cccd,
    role: payload.role,
  }
  if (payload.department_id) body.department_id = payload.department_id
  if (payload.employee_id)   body.employee_id   = payload.employee_id

  const { data, error } = await supabase.functions.invoke('admin-create-user', { body })
  if (error) {
    throw new Error(error.message || 'Tạo tài khoản thất bại.')
  }
  if (!data?.ok) {
    throw new Error(data?.error || 'Tạo tài khoản thất bại (không rõ lý do).')
  }
  return data as { ok: true; cccd: string; user_id: string; message: string }
}

// ─── admin-delete-user ────────────────────────────────────────────────────────

/**
 * Gọi Edge Function `admin-delete-user` để xóa hoàn toàn 1 tài khoản:
 * - Xóa khỏi public.users
 * - Xóa khỏi Supabase Auth
 * - Ghi audit log action='admin.delete_user'
 *
 * Bảo vệ server-side: không xóa chính mình, không xóa admin_he_thong duy nhất.
 * Chỉ admin_he_thong được gọi (Edge Function verify JWT).
 */
export async function adminDeleteUser(
  targetUserId: string,
): Promise<{ ok: true; cccd: string; message: string }> {
  const { data, error } = await supabase.functions.invoke('admin-delete-user', {
    body: { user_id: targetUserId },
  })
  if (error) {
    throw new Error(error.message || 'Xóa tài khoản thất bại.')
  }
  if (!data?.ok) {
    throw new Error(data?.error || 'Xóa tài khoản thất bại (không rõ lý do).')
  }
  return data as { ok: true; cccd: string; message: string }
}

// =============================================================
// DASHBOARD KPI (phiên 19B)
// =============================================================

export interface DashboardKpi {
  soNVDangLam: number
  tongThucLinhThang: number
  soBangLuongChoDuyet: number
  soNVSapNangBac: number
  currentMonth: string
}

export async function fetchDashboardKpi(): Promise<DashboardKpi> {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [empRes, salaryRes, pendingRes, promotionRes] = await Promise.all([
    supabase.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'dang_lam_viec'),
    supabase.from('salary_records').select('thuc_linh').eq('month_year', currentMonth).eq('status', 'approved'),
    supabase.from('salary_records').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.rpc('check_upcoming_promotions', { p_days_ahead: 30 }),
  ])

  const tongThucLinh = ((salaryRes.data ?? []) as Array<{ thuc_linh: unknown }>)
    .reduce((s, r) => s + (Number(r.thuc_linh ?? 0) || 0), 0)

  return {
    soNVDangLam:         empRes.count ?? 0,
    tongThucLinhThang:   tongThucLinh,
    soBangLuongChoDuyet: pendingRes.count ?? 0,
    soNVSapNangBac:      ((promotionRes.data ?? []) as unknown[]).length,
    currentMonth,
  }
}

// =============================================================
// REPORTS (Module 6 — phiên 15)
// =============================================================

/**
 * Lấy tất cả salary_records cho 1 kỳ lương (không lọc theo phòng).
 * Dùng cho trang Báo cáo tổng hợp (/reports).
 * RLS cho phép admin_luong + admin_he_thong SELECT mọi phòng.
 */
export async function fetchSalaryReport(
  month_year: string,
  status?: SalaryRecordStatus | null,
): Promise<SalaryRecord[]> {
  let q = supabase
    .from('salary_records')
    .select('*')
    .eq('month_year', month_year)
    .order('department_id', { ascending: true })
    .order('ho_ten', { ascending: true })
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as SalaryRecord[]
}

// ─── Salary trend (phiên 16) ──────────────────────────────────────────────────

export interface SalaryTrendPoint {
  month_year: string
  tongQuiLuong: number
  tongThucLinh: number
  tongThueTNCN: number
  tongTrichNLD: number
  soNV: number
}

/**
 * Lấy dữ liệu xu hướng quỹ lương cho `months` tháng gần nhất.
 * Dùng RPC get_salary_trend (migration 011) — aggregate server-side (GROUP BY month_year).
 * Trả về 1 dòng/tháng thay vì toàn bộ salary_records → giảm data transfer đáng kể.
 */
export async function fetchSalaryTrend(months: number = 12): Promise<SalaryTrendPoint[]> {
  const { data, error } = await supabase.rpc('get_salary_trend', { p_months: months })
  if (error) throw error
  const n = (v: unknown) => { const x = Number(v ?? 0); return isFinite(x) ? x : 0 }
  return ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
    month_year:   String(r.month_year),
    tongQuiLuong: n(r.tong_qui_luong),
    tongThucLinh: n(r.tong_thuc_linh),
    tongThueTNCN: n(r.tong_thue_tncn),
    tongTrichNLD: n(r.tong_trich_nld),
    soNV:         n(r.so_nv),
  }))
}

// =============================================================
// DRIVER MATCH — RULE-06 (khôi phục sau truncation phiên 16)
// =============================================================

/**
 * Cập nhật cờ is_matched cho cặp 2 nguồn lái xe theo công thức RULE-06.
 * So sánh 11 chỉ tiêu giữa nguồn truong_phong và admin_luong.
 * Dùng tolerance Math.abs(a-b) < 0.001 thay vì strict equality.
 */
export async function refreshDriverMatch(
  department_id: string,
  month_year: string,
): Promise<{ matched: number; mismatched: number }> {
  const FIELDS: Array<keyof AttendanceDriver> = [
    's600', 'xe_4_7', 'xe_16_29', 'cong_mia', 'nhan_cong',
    'cong_cho', 'so_km', 'cong_t7cn', 'ngoai_gio', 'le_tet_di_lam', 'le_tet_hoc_phep',
  ]
  const TOL = 0.001

  const { data, error } = await supabase
    .from('attendance_driver')
    .select('*')
    .eq('department_id', department_id)
    .eq('month_year', month_year)
  if (error) throw error

  const rows = (data ?? []) as AttendanceDriver[]

  // Group by employee_id
  const byEmp = new Map<string, { tp?: AttendanceDriver; al?: AttendanceDriver }>()
  for (const r of rows) {
    const slot = byEmp.get(r.employee_id) ?? {}
    if ((r.source as DriverSource) === 'truong_phong') slot.tp = r
    else slot.al = r
    byEmp.set(r.employee_id, slot)
  }

  let matched = 0
  let mismatched = 0
  const updates: Array<{ id: string; is_matched: boolean }> = []

  byEmp.forEach(({ tp, al }) => {
    if (!tp || !al) return
    const ok = FIELDS.every(f => {
      const a = Number(tp[f] ?? 0)
      const b = Number(al[f] ?? 0)
      return Math.abs(a - b) < TOL
    })
    if (ok) matched++
    else mismatched++
    updates.push({ id: tp.id, is_matched: ok })
    updates.push({ id: al.id, is_matched: ok })
  })

  // Batch upsert is_matched (1 request thay vì N)
  if (updates.length > 0) {
    const { error: upsertError } = await supabase
      .from('attendance_driver')
      .upsert(updates, { onConflict: 'id' })
    if (upsertError) throw upsertError
  }

  return { matched, mismatched }
}
