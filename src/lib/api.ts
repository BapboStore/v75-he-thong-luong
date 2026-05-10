/**
 * V75 — Tầng truy cập dữ liệu.
 * Mọi component không gọi supabase trực tiếp cho CRUD nghiệp vụ
 * mà gọi qua module này. Giúp gom lỗi, log, retry tập trung.
 */
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/log'
import type {
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
  await logActivity({
    action: 'department.create',
    entity_type: 'departments',
    entity_id: (data as Department).id,
    new_value: data,
    description: `Tạo phòng ban ${(data as Department).code} - ${(data as Department).name}`,
  })
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
  await logActivity({
    action: 'department.update',
    entity_type: 'departments',
    entity_id: id,
    new_value: patch,
    description: `Cập nhật phòng ban ${(data as Department).code}`,
  })
  return data as Department
}

export async function setDepartmentActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase.from('departments').update({ is_active }).eq('id', id)
  if (error) throw error
  await logActivity({
    action: is_active ? 'department.activate' : 'department.deactivate',
    entity_type: 'departments',
    entity_id: id,
    description: is_active ? 'Kích hoạt phòng ban' : 'Vô hiệu hoá phòng ban',
  })
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
  await logActivity({
    action: 'employee.create',
    entity_type: 'employees',
    entity_id: (data as EmployeeFull).id,
    new_value: data,
    description: `Tạo nhân viên ${(data as EmployeeFull).ho_ten} (${(data as EmployeeFull).cccd})`,
  })
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
  await logActivity({
    action: 'employee.update',
    entity_type: 'employees',
    entity_id: id,
    new_value: patch,
    description: `Cập nhật nhân viên ${(data as EmployeeFull).ho_ten}`,
  })
  return data as EmployeeFull
}

// =============================================================
// SALARY GRADES & CONFIG
// =============================================================

export async function listSalaryGrades(): Promise<SalaryGrade[]> {
  const { data, error } = await supabase
    .from('salary_grades')
    .select('*')
    .order('ngach_code', { ascending: true })
    .order('bac', { ascending: true })
  if (error) throw error
  return (data ?? []) as SalaryGrade[]
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
  await logActivity({
    action: 'salary_config.create',
    entity_type: 'salary_config',
    entity_id: (data as SalaryConfig).id,
    new_value: data,
    description: `Tạo cấu hình lương hiệu lực ${(data as SalaryConfig).effective_date}`,
  })
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
  await logActivity({
    action: 'user.update',
    entity_type: 'users',
    entity_id: id,
    new_value: patch,
    description: `Cập nhật user ${(data as AppUser).cccd}`,
  })
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
  await logActivity({
    action: `${table}.set_status_${status}`,
    entity_type: table,
    description: `Đổi trạng thái ${ids.length} bản ghi sang ${status}`,
  })
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
  const payload = records.map((r) => ({
    ...r,
    created_by: r.created_by ?? created_by,
    status: r.status ?? 'draft',
  }))
  const { error } = await supabase
    .from('salary_records')
    .upsert(payload, { onConflict: 'employee_id,month_year' })
  if (error) throw error
  await logActivity({
    action: 'salary_records.upsert',
    entity_type: 'salary_records',
    description: `Upsert ${records.length} bản ghi lương (status nháp/cập nhật)`,
  })
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
  await logActivity({
    action: `salary_records.set_status_${status}`,
    entity_type: 'salary_records',
    description: `Đổi trạng thái ${ids.length} bản ghi lương sang ${status}`,
  })
}

/** Cập nhật cờ is_matched cho cặp 2 nguồn lái xe theo công thức RULE-06 */
export async function refreshDriverMatch(department_id: string, month_year: string): Promise<{
  matched: number
  mismatched: number
}> {
  const rows = await listAttendanceDriver(department_id, month_year)
  // Group by employee_id
  const byEmp = new Map<string, AttendanceDriver[]>()
  for (const r of rows) {
    const arr = byEmp.get(r.employee_id) ?? []
    arr.push(r)
    byEmp.set(r.employee_id, arr)
  }
  let matched = 0
  let mismatched = 0
  for (const [, arr] of byEmp) {
    const tp = arr.find(r => r.source === ('truong_phong' as DriverSource))
    const al = arr.find(r => r.source === ('admin_luong' as DriverSource))
    if (!tp || !al) {
      // Thiếu nguồn => không match
      for (const r of arr) {
        if (r.is_matched) {
          await supabase.from('attendance_driver').update({ is_matched: false }).eq('id', r.id)
        }
      }
      mismatched++
      continue
    }
    const numFields: (keyof AttendanceDriver)[] = [
      's600', 'xe_4_7', 'xe_16_29', 'cong_mia', 'nhan_cong', 'cong_cho',
      'so_km', 'cong_t7cn', 'ngoai_gio', 'le_tet_di_lam', 'le_tet_hoc_phep',
    ]
    // So sánh sau khi ép kiểu (Supabase NUMERIC có thể trả string)
    const ok = numFields.every(f => Number(tp[f]) === Number(al[f]))
    if (tp.is_matched !== ok || al.is_matched !== ok) {
      await supabase.from('attendance_driver').update({ is_matched: ok }).in('id', [tp.id, al.id])
    }
    if (ok) matched++
    else mismatched++
  }
  return { matched, mismatched }
}
