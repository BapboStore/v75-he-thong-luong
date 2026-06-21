import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, Lock, Save, Send, Trash2, Truck } from 'lucide-react'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  deleteAttendanceMonth, listAttendanceDriver, listAttendanceOffice, listAttendanceSecurity,
  listAttendanceTechnician, listDepartments, listEmployees, refreshDriverMatch,
  setAttendanceStatus, upsertAttendanceBatch,
} from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import {
  ATT_STATUS_LABEL,
  type AttendanceDriver, type AttendanceOffice, type AttendanceSecurity, type AttendanceStatus,
  type AttendanceTechnician, type Department, type DriverSource, type EmployeeFull,
} from '@/lib/types'

type Khoi = 'office' | 'security' | 'technician' | 'driver'

const KHOI_LABEL: Record<Khoi, string> = {
  office: 'Hành chính',
  security: 'Bảo vệ',
  technician: 'Kỹ thuật',
  driver: 'Lái xe',
}

interface CommonRow {
  id?: string
  employee_id: string
  department_id: string
  month_year: string
  status: AttendanceStatus
  ghi_chu: string | null
}

interface OfficeRow extends CommonRow {
  cong_tg: number; cong_t7cn: number; ngoai_gio: number;
  cong_vd: number; le_tet_hoc_phep: number; le_tet_di_lam: number;
}
interface SecurityRow extends CommonRow {
  cong_ngay: number; cong_dem: number; cong_t7cn: number;
  ngoai_gio: number; le_tet_di_lam: number; le_tet_hoc_phep: number;
}
interface TechnicianRow extends CommonRow {
  cong_tg: number; cong_t7cn: number; ngoai_gio: number;
  le_tet_di_lam: number; le_tet_hoc_phep: number;
}
interface DriverRow extends CommonRow {
  source: DriverSource;
  s600: number; xe_4_7: number; xe_16_29: number;
  cong_mia: number; nhan_cong: number; cong_cho: number;
  so_km: number; cong_t7cn: number; ngoai_gio: number;
  le_tet_di_lam: number; le_tet_hoc_phep: number;
  is_matched: boolean;
}

function thisMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}`
}

export default function AttendancePage() {
  const { profile, hasRole } = useAuth()
  const [departments, setDepartments] = useState<Department[]>([])
  const [employees, setEmployees] = useState<EmployeeFull[]>([])
  const [khoi, setKhoi] = useState<Khoi>('office')
  const [deptId, setDeptId] = useState<string>('')
  const [monthYear, setMonthYear] = useState<string>(thisMonth())
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // truong_phong tự động khoá phòng ban của họ
  const lockedDept = profile?.user.role === 'truong_phong' ? profile.user.department_id : null

  useEffect(() => {
    (async () => {
      try {
        const [d, e] = await Promise.all([
          listDepartments(),
          listEmployees({ status: 'dang_lam_viec' }),
        ])
        setDepartments(d)
        setEmployees(e)
        if (lockedDept) setDeptId(lockedDept)
        else if (d.length > 0 && !deptId) setDeptId(d[0].id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không tải được danh mục.')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tự đổi khối dựa trên loại lương phòng ban đã chọn
  useEffect(() => {
    const d = departments.find(x => x.id === deptId)
    if (!d) return
    if (d.salary_type === 'hanh_chinh' && khoi !== 'office') setKhoi('office')
    else if (d.salary_type === 'lai_xe' && khoi !== 'driver') setKhoi('driver')
    else if (d.salary_type === 'bao_ve_ky_thuat' && khoi !== 'security' && khoi !== 'technician') setKhoi('security')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptId])

  const empOfDept = useMemo(
    () => employees.filter(e => !deptId || e.department_id === deptId),
    [employees, deptId],
  )

  const canEditAttendance = hasRole('truong_phong', 'admin_luong', 'admin_he_thong')
  const canDelete = hasRole('admin_luong', 'admin_he_thong')

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const tableOfKhoi = (k: Khoi): 'attendance_office' | 'attendance_security' | 'attendance_technician' | 'attendance_driver' => {
    if (k === 'security') return 'attendance_security'
    if (k === 'technician') return 'attendance_technician'
    if (k === 'driver') return 'attendance_driver'
    return 'attendance_office'
  }

  const submitDeleteAttendance = async () => {
    if (!deptId) return
    setDeleting(true); setError(null)
    try {
      const n = await deleteAttendanceMonth(tableOfKhoi(khoi), deptId, monthYear)
      setInfo(`Đã xoá ${n} bản ghi chấm công khối ${KHOI_LABEL[khoi]} tháng ${monthYear}.`)
      setDeleteOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xoá chấm công thất bại.')
    } finally { setDeleting(false) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-primary" /> Chấm công
        </h1>
        <p className="text-sm text-muted-foreground">
          Workflow: nháp → chờ duyệt → đã chốt. Khối Lái xe áp dụng kiểm tra chéo 2 nguồn (RULE-06).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="space-y-2">
          <Label htmlFor="dept">Phòng ban</Label>
          <Select id="dept" value={deptId} onChange={e => setDeptId(e.target.value)} disabled={!!lockedDept}>
            {departments.filter(d => d.is_active).map(d => (
              <option key={d.id} value={d.id}>{d.code} – {d.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="khoi">Khối chấm công</Label>
          <Select id="khoi" value={khoi} onChange={e => setKhoi(e.target.value as Khoi)}>
            {(['office','security','technician','driver'] as Khoi[]).map(k => (
              <option key={k} value={k}>{KHOI_LABEL[k]}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="month">Tháng</Label>
          <Input id="month" type="month" value={monthYear}
            onChange={e => setMonthYear(e.target.value)} />
        </div>
        <div className="space-y-2 flex items-end gap-3">
          <span className="text-xs text-muted-foreground">{empOfDept.length} nhân viên thuộc phòng ban này</span>
          {canDelete && deptId && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Xoá bảng công tháng này
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Lỗi</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {info && (
        <Alert variant="success">
          <AlertTitle>Thông tin</AlertTitle>
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      )}

      {!deptId ? (
        <p className="text-muted-foreground">Chọn phòng ban để hiển thị bảng công.</p>
      ) : khoi === 'office' ? (
        <OfficeGrid
          deptId={deptId} monthYear={monthYear}
          employees={empOfDept} canEdit={canEditAttendance} canUnlock={canDelete}
          onError={setError} onInfo={setInfo}
        />
      ) : khoi === 'security' ? (
        <SecurityGrid
          deptId={deptId} monthYear={monthYear}
          employees={empOfDept} canEdit={canEditAttendance} canUnlock={canDelete}
          onError={setError} onInfo={setInfo}
        />
      ) : khoi === 'technician' ? (
        <TechnicianGrid
          deptId={deptId} monthYear={monthYear}
          employees={empOfDept} canEdit={canEditAttendance} canUnlock={canDelete}
          onError={setError} onInfo={setInfo}
        />
      ) : (
        <DriverGrid
          deptId={deptId} monthYear={monthYear}
          employees={empOfDept} canEdit={canEditAttendance} canUnlock={canDelete}
          userRole={profile?.user.role ?? 'user'}
          onError={setError} onInfo={setInfo}
        />
      )}

      {/* Delete attendance confirm dialog */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { if (!deleting) setDeleteOpen(o) }}>
        <DialogContent onClose={() => setDeleteOpen(false)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Xác nhận xoá bảng chấm công
            </DialogTitle>
            <DialogDescription>
              Thao tác này <strong>không thể hoàn tác</strong>. Toàn bộ bản ghi chấm công sẽ bị xoá vĩnh viễn.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-3 text-sm space-y-1">
            <div><span className="text-muted-foreground">Khối:</span> <strong>{KHOI_LABEL[khoi]}</strong></div>
            <div><span className="text-muted-foreground">Tháng:</span> <strong>{monthYear}</strong></div>
            <div><span className="text-muted-foreground">Phòng ban:</span> <strong>{departments.find(d => d.id === deptId)?.name ?? deptId}</strong></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>Huỷ</Button>
            <Button variant="destructive" onClick={submitDeleteAttendance} disabled={deleting}>
              <Trash2 className="h-4 w-4 mr-1" /> {deleting ? 'Đang xoá...' : 'Xoá vĩnh viễn'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// =============================================================
// HELPERS
// =============================================================

function StatusBadge({ status }: { status: AttendanceStatus }) {
  const variant: 'secondary' | 'warning' | 'success' = (
    status === 'draft' ? 'secondary' :
    status === 'pending' ? 'warning' : 'success'
  )
  return <Badge variant={variant}>{ATT_STATUS_LABEL[status]}</Badge>
}

interface SubProps {
  deptId: string
  monthYear: string
  employees: EmployeeFull[]
  canEdit: boolean
  canUnlock: boolean
  onError: (m: string | null) => void
  onInfo: (m: string | null) => void
}

interface DriverProps extends SubProps {
  userRole: string
}

// =============================================================
// OFFICE
// =============================================================

const OFFICE_FIELDS: { key: keyof OfficeRow; label: string }[] = [
  { key: 'cong_tg', label: 'Công TG' },
  { key: 'cong_t7cn', label: 'Công T7/CN' },
  { key: 'ngoai_gio', label: 'Ngoài giờ (h)' },
  { key: 'cong_vd', label: 'Công VĐ' },
  { key: 'le_tet_hoc_phep', label: 'Lễ Tết/Phép' },
  { key: 'le_tet_di_lam', label: 'Lễ Tết đi làm' },
]

function buildBlankOfficeRow(emp: EmployeeFull, deptId: string, monthYear: string): OfficeRow {
  return {
    employee_id: emp.id, department_id: deptId, month_year: monthYear,
    status: 'draft', ghi_chu: null,
    cong_tg: 0, cong_t7cn: 0, ngoai_gio: 0, cong_vd: 0,
    le_tet_hoc_phep: 0, le_tet_di_lam: 0,
  }
}

function OfficeGrid({ deptId, monthYear, employees, canEdit, canUnlock, onError, onInfo }: SubProps) {
  const [rows, setRows] = useState<Record<string, OfficeRow>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    onError(null); onInfo(null)
    setLoading(true)
    try {
      const data = await listAttendanceOffice(deptId, monthYear)
      const byEmp: Record<string, OfficeRow> = {}
      for (const r of data as AttendanceOffice[]) {
        byEmp[r.employee_id] = { ...r, ghi_chu: r.ghi_chu ?? null }
      }
      // Add blank rows for employees without record
      for (const emp of employees) {
        if (!byEmp[emp.id]) byEmp[emp.id] = buildBlankOfficeRow(emp, deptId, monthYear)
      }
      setRows(byEmp)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Không tải được bảng công.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptId, monthYear, employees])

  const update = (empId: string, patch: Partial<OfficeRow>) => {
    setRows(prev => ({ ...prev, [empId]: { ...prev[empId], ...patch } }))
  }

  const saveAll = async (newStatus?: AttendanceStatus) => {
    setBusy(true); onError(null); onInfo(null)
    try {
      const toSave = Object.values(rows)
        .filter(r => r.status !== 'locked')
        .map(r => ({ ...r, status: newStatus ?? r.status }))
      await upsertAttendanceBatch('attendance_office', toSave)
      onInfo(newStatus
        ? `Đã chuyển ${toSave.length} bản ghi sang trạng thái ${ATT_STATUS_LABEL[newStatus]}.`
        : `Đã lưu ${toSave.length} bản ghi.`)
      await load()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Lưu thất bại.')
    } finally {
      setBusy(false)
    }
  }

  const lockAll = async () => {
    if (!confirm('Chốt toàn bộ bản ghi đang ở trạng thái Chờ duyệt? Hành động không thể hoàn tác từ giao diện này.')) return
    setBusy(true); onError(null)
    try {
      const ids = Object.values(rows).filter(r => r.status === 'pending' && r.id).map(r => r.id!) as string[]
      if (ids.length === 0) { onInfo('Không có bản ghi nào ở trạng thái Chờ duyệt.'); return }
      await setAttendanceStatus('attendance_office', ids, 'locked')
      onInfo(`Đã chốt ${ids.length} bản ghi.`)
      await load()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Chốt thất bại.')
    } finally {
      setBusy(false)
    }
  }

  const unlockAll = async () => {
    setBusy(true); onError(null)
    try {
      const ids = Object.values(rows).filter(r => r.status === 'locked' && r.id).map(r => r.id!) as string[]
      if (ids.length === 0) { onInfo('Không có bản ghi nào đang chốt.'); return }
      await setAttendanceStatus('attendance_office', ids, 'draft')
      onInfo(`Đã mở chốt ${ids.length} bản ghi — chuyển về Nháp.`)
      await load()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Mở chốt thất bại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <ActionsBar
        canEdit={canEdit} canUnlock={canUnlock}
        busy={busy}
        onSave={() => saveAll()}
        onSubmit={() => saveAll('pending')}
        onLock={lockAll}
        onUnlock={unlockAll}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nhân viên</TableHead>
            {OFFICE_FIELDS.map(f => <TableHead key={f.key} className="text-right">{f.label}</TableHead>)}
            <TableHead>Trạng thái</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRowSkeleton cols={OFFICE_FIELDS.length + 2} rows={5} />
          ) : employees.length === 0 ? (
            <TableEmpty colSpan={OFFICE_FIELDS.length + 2}>Phòng ban chưa có nhân viên đang làm việc.</TableEmpty>
          ) : employees.map(emp => {
            const r = rows[emp.id]
            if (!r) return null
            const locked = r.status === 'locked' || !canEdit
            return (
              <TableRow key={emp.id}>
                <TableCell className="font-medium whitespace-nowrap">
                  <div>{emp.ho_ten}</div>
                  <div className="text-xs text-muted-foreground font-mono">{emp.cccd}</div>
                </TableCell>
                {OFFICE_FIELDS.map(f => (
                  <TableCell key={f.key} className="text-right">
                    <Input
                      type="number" step="0.5" min={0} disabled={locked}
                      value={r[f.key] as number}
                      onChange={e => update(emp.id, { [f.key]: Number(e.target.value || 0) } as Partial<OfficeRow>)}
                      className="h-8 w-20 text-right ml-auto"
                    />
                  </TableCell>
                ))}
                <TableCell><StatusBadge status={r.status} /></TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// =============================================================
// SECURITY
// =============================================================

const SECURITY_FIELDS: { key: keyof SecurityRow; label: string }[] = [
  { key: 'cong_ngay', label: 'Công ngày' },
  { key: 'cong_dem', label: 'Công đêm' },
  { key: 'cong_t7cn', label: 'Công T7/CN' },
  { key: 'ngoai_gio', label: 'Ngoài giờ (h)' },
  { key: 'le_tet_di_lam', label: 'Lễ đi làm' },
  { key: 'le_tet_hoc_phep', label: 'Lễ/Phép' },
]

function buildBlankSecurityRow(emp: EmployeeFull, deptId: string, monthYear: string): SecurityRow {
  return {
    employee_id: emp.id, department_id: deptId, month_year: monthYear,
    status: 'draft', ghi_chu: null,
    cong_ngay: 0, cong_dem: 0, cong_t7cn: 0, ngoai_gio: 0,
    le_tet_di_lam: 0, le_tet_hoc_phep: 0,
  }
}

function SecurityGrid({ deptId, monthYear, employees, canEdit, canUnlock, onError, onInfo }: SubProps) {
  const [rows, setRows] = useState<Record<string, SecurityRow>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    onError(null); onInfo(null)
    setLoading(true)
    try {
      const data = await listAttendanceSecurity(deptId, monthYear) as AttendanceSecurity[]
      const map: Record<string, SecurityRow> = {}
      for (const r of data) map[r.employee_id] = { ...r, ghi_chu: r.ghi_chu ?? null }
      for (const emp of employees) if (!map[emp.id]) map[emp.id] = buildBlankSecurityRow(emp, deptId, monthYear)
      setRows(map)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Không tải được bảng công.')
    } finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptId, monthYear, employees])

  const update = (empId: string, patch: Partial<SecurityRow>) => {
    setRows(prev => ({ ...prev, [empId]: { ...prev[empId], ...patch } }))
  }

  const saveAll = async (newStatus?: AttendanceStatus) => {
    setBusy(true); onError(null); onInfo(null)
    try {
      const toSave = Object.values(rows)
        .filter(r => r.status !== 'locked')
        .map(r => ({ ...r, status: newStatus ?? r.status }))
      await upsertAttendanceBatch('attendance_security', toSave)
      onInfo(newStatus
        ? `Đã chuyển ${toSave.length} bản ghi sang ${ATT_STATUS_LABEL[newStatus]}.`
        : `Đã lưu ${toSave.length} bản ghi.`)
      await load()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Lưu thất bại.')
    } finally { setBusy(false) }
  }

  const lockAll = async () => {
    if (!confirm('Chốt toàn bộ bản ghi đang Chờ duyệt?')) return
    setBusy(true); onError(null)
    try {
      const ids = Object.values(rows).filter(r => r.status === 'pending' && r.id).map(r => r.id!) as string[]
      if (ids.length === 0) { onInfo('Không có bản ghi nào ở trạng thái Chờ duyệt.'); return }
      await setAttendanceStatus('attendance_security', ids, 'locked')
      onInfo(`Đã chốt ${ids.length} bản ghi.`)
      await load()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Chốt thất bại.')
    } finally { setBusy(false) }
  }

  const unlockAll = async () => {
    setBusy(true); onError(null)
    try {
      const ids = Object.values(rows).filter(r => r.status === 'locked' && r.id).map(r => r.id!) as string[]
      if (ids.length === 0) { onInfo('Không có bản ghi nào đang chốt.'); return }
      await setAttendanceStatus('attendance_security', ids, 'draft')
      onInfo(`Đã mở chốt ${ids.length} bản ghi — chuyển về Nháp.`)
      await load()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Mở chốt thất bại.')
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <ActionsBar canEdit={canEdit} canUnlock={canUnlock} busy={busy} onSave={() => saveAll()} onSubmit={() => saveAll('pending')} onLock={lockAll} onUnlock={unlockAll} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nhân viên</TableHead>
            {SECURITY_FIELDS.map(f => <TableHead key={f.key} className="text-right">{f.label}</TableHead>)}
            <TableHead>Trạng thái</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRowSkeleton cols={SECURITY_FIELDS.length + 2} rows={5} />
          ) : employees.length === 0 ? (
            <TableEmpty colSpan={SECURITY_FIELDS.length + 2} />
          ) : employees.map(emp => {
            const r = rows[emp.id]; if (!r) return null
            const locked = r.status === 'locked' || !canEdit
            return (
              <TableRow key={emp.id}>
                <TableCell className="font-medium">
                  <div>{emp.ho_ten}</div>
                  <div className="text-xs text-muted-foreground font-mono">{emp.cccd}</div>
                </TableCell>
                {SECURITY_FIELDS.map(f => (
                  <TableCell key={f.key} className="text-right">
                    <Input type="number" step="0.5" min={0} disabled={locked}
                      value={r[f.key] as number}
                      onChange={e => update(emp.id, { [f.key]: Number(e.target.value || 0) } as Partial<SecurityRow>)}
                      className="h-8 w-20 text-right ml-auto" />
                  </TableCell>
                ))}
                <TableCell><StatusBadge status={r.status} /></TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// =============================================================
// TECHNICIAN
// =============================================================

const TECH_FIELDS: { key: keyof TechnicianRow; label: string }[] = [
  { key: 'cong_tg', label: 'Công TG' },
  { key: 'cong_t7cn', label: 'Công T7/CN' },
  { key: 'ngoai_gio', label: 'Ngoài giờ (h)' },
  { key: 'le_tet_di_lam', label: 'Lễ đi làm' },
  { key: 'le_tet_hoc_phep', label: 'Lễ/Phép' },
]

function buildBlankTechRow(emp: EmployeeFull, deptId: string, monthYear: string): TechnicianRow {
  return {
    employee_id: emp.id, department_id: deptId, month_year: monthYear,
    status: 'draft', ghi_chu: null,
    cong_tg: 0, cong_t7cn: 0, ngoai_gio: 0,
    le_tet_di_lam: 0, le_tet_hoc_phep: 0,
  }
}

function TechnicianGrid({ deptId, monthYear, employees, canEdit, canUnlock, onError, onInfo }: SubProps) {
  const [rows, setRows] = useState<Record<string, TechnicianRow>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    onError(null); onInfo(null); setLoading(true)
    try {
      const data = await listAttendanceTechnician(deptId, monthYear) as AttendanceTechnician[]
      const map: Record<string, TechnicianRow> = {}
      for (const r of data) map[r.employee_id] = { ...r, ghi_chu: r.ghi_chu ?? null }
      for (const emp of employees) if (!map[emp.id]) map[emp.id] = buildBlankTechRow(emp, deptId, monthYear)
      setRows(map)
    } catch (e) { onError(e instanceof Error ? e.message : 'Không tải được bảng công.') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptId, monthYear, employees])

  const update = (empId: string, patch: Partial<TechnicianRow>) =>
    setRows(p => ({ ...p, [empId]: { ...p[empId], ...patch } }))

  const saveAll = async (newStatus?: AttendanceStatus) => {
    setBusy(true); onError(null); onInfo(null)
    try {
      const toSave = Object.values(rows)
        .filter(r => r.status !== 'locked')
        .map(r => ({ ...r, status: newStatus ?? r.status }))
      await upsertAttendanceBatch('attendance_technician', toSave)
      onInfo(newStatus
        ? `Đã chuyển ${toSave.length} bản ghi sang ${ATT_STATUS_LABEL[newStatus]}.`
        : `Đã lưu ${toSave.length} bản ghi.`)
      await load()
    } catch (e) { onError(e instanceof Error ? e.message : 'Lưu thất bại.') }
    finally { setBusy(false) }
  }

  const lockAll = async () => {
    if (!confirm('Chốt toàn bộ bản ghi đang Chờ duyệt?')) return
    setBusy(true); onError(null)
    try {
      const ids = Object.values(rows).filter(r => r.status === 'pending' && r.id).map(r => r.id!) as string[]
      if (ids.length === 0) { onInfo('Không có bản ghi nào ở trạng thái Chờ duyệt.'); return }
      await setAttendanceStatus('attendance_technician', ids, 'locked')
      onInfo(`Đã chốt ${ids.length} bản ghi.`)
      await load()
    } catch (e) { onError(e instanceof Error ? e.message : 'Chốt thất bại.') }
    finally { setBusy(false) }
  }

  const unlockAll = async () => {
    setBusy(true); onError(null)
    try {
      const ids = Object.values(rows).filter(r => r.status === 'locked' && r.id).map(r => r.id!) as string[]
      if (ids.length === 0) { onInfo('Không có bản ghi nào đang chốt.'); return }
      await setAttendanceStatus('attendance_technician', ids, 'draft')
      onInfo(`Đã mở chốt ${ids.length} bản ghi — chuyển về Nháp.`)
      await load()
    } catch (e) { onError(e instanceof Error ? e.message : 'Mở chốt thất bại.') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <ActionsBar canEdit={canEdit} canUnlock={canUnlock} busy={busy} onSave={() => saveAll()} onSubmit={() => saveAll('pending')} onLock={lockAll} onUnlock={unlockAll} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nhân viên</TableHead>
            {TECH_FIELDS.map(f => <TableHead key={f.key} className="text-right">{f.label}</TableHead>)}
            <TableHead>Trạng thái</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRowSkeleton cols={TECH_FIELDS.length + 2} rows={5} />
          ) : employees.length === 0 ? (
            <TableEmpty colSpan={TECH_FIELDS.length + 2} />
          ) : employees.map(emp => {
            const r = rows[emp.id]; if (!r) return null
            const locked = r.status === 'locked' || !canEdit
            return (
              <TableRow key={emp.id}>
                <TableCell className="font-medium">
                  <div>{emp.ho_ten}</div>
                  <div className="text-xs text-muted-foreground font-mono">{emp.cccd}</div>
                </TableCell>
                {TECH_FIELDS.map(f => (
                  <TableCell key={f.key} className="text-right">
                    <Input type="number" step="0.5" min={0} disabled={locked}
                      value={r[f.key] as number}
                      onChange={e => update(emp.id, { [f.key]: Number(e.target.value || 0) } as Partial<TechnicianRow>)}
                      className="h-8 w-20 text-right ml-auto" />
                  </TableCell>
                ))}
                <TableCell><StatusBadge status={r.status} /></TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// =============================================================
// DRIVER (cross-check)
// =============================================================

const DRIVER_FIELDS: { key: keyof DriverRow; label: string; step?: string }[] = [
  { key: 's600', label: 'S600' },
  { key: 'xe_4_7', label: 'Xe 4-7' },
  { key: 'xe_16_29', label: 'Xe 16-29' },
  { key: 'cong_mia', label: 'Công mía' },
  { key: 'nhan_cong', label: 'Nhận công' },
  { key: 'cong_cho', label: 'Công chờ' },
  { key: 'so_km', label: 'Số KM', step: '0.01' },
  { key: 'cong_t7cn', label: 'T7/CN' },
  { key: 'ngoai_gio', label: 'Ngoài giờ (h)' },
  { key: 'le_tet_di_lam', label: 'Lễ đi làm' },
  { key: 'le_tet_hoc_phep', label: 'Lễ/Phép' },
]

function buildBlankDriverRow(emp: EmployeeFull, deptId: string, monthYear: string, source: DriverSource): DriverRow {
  return {
    employee_id: emp.id, department_id: deptId, month_year: monthYear,
    source, status: 'draft', is_matched: false, ghi_chu: null,
    s600: 0, xe_4_7: 0, xe_16_29: 0, cong_mia: 0, nhan_cong: 0, cong_cho: 0,
    so_km: 0, cong_t7cn: 0, ngoai_gio: 0, le_tet_di_lam: 0, le_tet_hoc_phep: 0,
  }
}

function DriverGrid({
  deptId, monthYear, employees, canEdit, canUnlock, userRole, onError, onInfo,
}: DriverProps) {
  // Mỗi nhân viên có 2 dòng: source = truong_phong | admin_luong
  const [rows, setRows] = useState<Record<string, { tp: DriverRow; al: DriverRow }>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // truong_phong chỉ sửa nguồn của họ; admin_luong/admin_he_thong sửa nguồn admin_luong
  const editableSource: DriverSource = userRole === 'truong_phong' ? 'truong_phong' : 'admin_luong'

  const load = async () => {
    onError(null); onInfo(null); setLoading(true)
    try {
      const data = await listAttendanceDriver(deptId, monthYear) as AttendanceDriver[]
      const map: Record<string, { tp: DriverRow; al: DriverRow }> = {}
      for (const emp of employees) {
        map[emp.id] = {
          tp: buildBlankDriverRow(emp, deptId, monthYear, 'truong_phong'),
          al: buildBlankDriverRow(emp, deptId, monthYear, 'admin_luong'),
        }
      }
      for (const r of data) {
        const slot = map[r.employee_id]
        if (!slot) continue
        const row: DriverRow = { ...r, ghi_chu: r.ghi_chu ?? null }
        if (r.source === 'truong_phong') slot.tp = row
        else slot.al = row
      }
      setRows(map)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Không tải được bảng công.')
    } finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptId, monthYear, employees])

  const update = (empId: string, src: DriverSource, patch: Partial<DriverRow>) => {
    setRows(prev => {
      const slot = prev[empId]
      if (!slot) return prev
      return {
        ...prev,
        [empId]: src === 'truong_phong'
          ? { ...slot, tp: { ...slot.tp, ...patch } }
          : { ...slot, al: { ...slot.al, ...patch } },
      }
    })
  }

  const saveAll = async (newStatus?: AttendanceStatus) => {
    setBusy(true); onError(null); onInfo(null)
    try {
      const toSave: DriverRow[] = []
      for (const slot of Object.values(rows)) {
        // Chỉ lưu nguồn mà role hiện tại có quyền nhập (tránh ghi đè dữ liệu đối tác)
        const target = editableSource === 'truong_phong' ? slot.tp : slot.al
        if (target.status !== 'locked') {
          toSave.push({ ...target, status: newStatus ?? target.status })
        }
      }
      // Batch upsert 1 request — driver dùng conflict key đặc biệt (3 cột)
      await upsertAttendanceBatch('attendance_driver', toSave, 'employee_id,month_year,source')
      // Sau khi lưu, chạy đối chiếu chéo 2 nguồn
      const result = await refreshDriverMatch(deptId, monthYear)
      onInfo(`Đã lưu ${toSave.length} bản ghi nguồn ${editableSource}. Đối chiếu: khớp ${result.matched}, lệch ${result.mismatched}.`)
      await load()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Lưu thất bại.')
    } finally { setBusy(false) }
  }

  const lockMatched = async () => {
    if (!confirm('Chốt toàn bộ bản ghi đã KHỚP 2 nguồn? Các bản lệch sẽ không bị chốt.')) return
    setBusy(true); onError(null); onInfo(null)
    try {
      const ids: string[] = []
      for (const slot of Object.values(rows)) {
        if (slot.tp.is_matched && slot.al.is_matched) {
          if (slot.tp.id && slot.tp.status !== 'locked') ids.push(slot.tp.id)
          if (slot.al.id && slot.al.status !== 'locked') ids.push(slot.al.id)
        }
      }
      if (ids.length === 0) { onInfo('Không có bản ghi nào đã khớp.'); return }
      await setAttendanceStatus('attendance_driver', ids, 'locked')
      onInfo(`Đã chốt ${ids.length} bản ghi đã khớp 2 nguồn.`)
      await load()
    } catch (e) { onError(e instanceof Error ? e.message : 'Chốt thất bại.') }
    finally { setBusy(false) }
  }

  const unlockAll = async () => {
    setBusy(true); onError(null)
    try {
      const ids: string[] = []
      for (const slot of Object.values(rows)) {
        if (slot.tp.id && slot.tp.status === 'locked') ids.push(slot.tp.id)
        if (slot.al.id && slot.al.status === 'locked') ids.push(slot.al.id)
      }
      if (ids.length === 0) { onInfo('Không có bản ghi nào đang chốt.'); return }
      await setAttendanceStatus('attendance_driver', ids, 'draft')
      onInfo(`Đã mở chốt ${ids.length} bản ghi — chuyển về Nháp.`)
      await load()
    } catch (e) { onError(e instanceof Error ? e.message : 'Mở chốt thất bại.') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <Alert variant="warning">
        <Truck className="h-4 w-4" />
        <AlertTitle>Khối Lái xe — kiểm tra chéo 2 nguồn (RULE-06)</AlertTitle>
        <AlertDescription>
          Trưởng phòng nhập nguồn <code>truong_phong</code>. Admin Lương đối soát nguồn <code>admin_luong</code>.
          Hệ thống chỉ cho phép chốt khi 2 nguồn KHỚP toàn bộ chỉ tiêu.
        </AlertDescription>
      </Alert>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => saveAll()} disabled={busy || !canEdit}>
          <Save className="h-4 w-4 mr-1" /> {busy ? 'Đang lưu...' : `Lưu nháp (${editableSource})`}
        </Button>
        <Button onClick={() => saveAll('pending')} disabled={busy || !canEdit} variant="secondary">
          <Send className="h-4 w-4 mr-1" /> Gửi duyệt
        </Button>
        <Button onClick={lockMatched} disabled={busy || !canEdit} variant="destructive">
          <Lock className="h-4 w-4 mr-1" /> Chốt các bản ghi đã khớp
        </Button>
        {canUnlock && (
          <Button onClick={unlockAll} disabled={busy} variant="outline" className="text-amber-600 border-amber-300 hover:bg-amber-50">
            <Lock className="h-4 w-4 mr-1" /> Mở chốt
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nhân viên</TableHead>
            <TableHead>Nguồn</TableHead>
            {DRIVER_FIELDS.map(f => <TableHead key={f.key} className="text-right">{f.label}</TableHead>)}
            <TableHead>Khớp</TableHead>
            <TableHead>Trạng thái</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRowSkeleton cols={DRIVER_FIELDS.length + 4} rows={5} />
          ) : employees.length === 0 ? (
            <TableEmpty colSpan={DRIVER_FIELDS.length + 4} />
          ) : employees.flatMap(emp => {
            const slot = rows[emp.id]; if (!slot) return []
            const renderRow = (src: DriverSource, r: DriverRow) => {
              const editableThis = canEdit && r.status !== 'locked' && src === editableSource
              return (
                <TableRow key={`${emp.id}-${src}`} className={r.is_matched ? 'bg-green-50/50' : ''}>
                  {src === 'truong_phong' && (
                    <TableCell rowSpan={2} className="font-medium align-top">
                      <div>{emp.ho_ten}</div>
                      <div className="text-xs text-muted-foreground font-mono">{emp.cccd}</div>
                    </TableCell>
                  )}
                  <TableCell className="text-xs whitespace-nowrap">
                    <Badge variant={src === 'truong_phong' ? 'info' : 'secondary'}>
                      {src === 'truong_phong' ? 'TP' : 'AL'}
                    </Badge>
                  </TableCell>
                  {DRIVER_FIELDS.map(f => (
                    <TableCell key={f.key} className="text-right">
                      <Input
                        type="number"
                        step={f.step ?? '0.5'}
                        min={0}
                        disabled={!editableThis}
                        value={r[f.key] as number}
                        onChange={e => update(emp.id, src, { [f.key]: Number(e.target.value || 0) } as Partial<DriverRow>)}
                        className="h-8 w-20 text-right ml-auto"
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    {r.is_matched
                      ? <Badge variant="success">Khớp</Badge>
                      : <Badge variant="warning">Lệch</Badge>}
                  </TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                </TableRow>
              )
            }
            return [renderRow('truong_phong', slot.tp), renderRow('admin_luong', slot.al)]
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// =============================================================
// SHARED UI
// =============================================================

function ActionsBar({
  canEdit, canUnlock, busy, onSave, onSubmit, onLock, onUnlock,
}: {
  canEdit: boolean; canUnlock: boolean; busy: boolean;
  onSave: () => void; onSubmit: () => void; onLock: () => void; onUnlock: () => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      <Button onClick={onSave} disabled={busy || !canEdit}>
        <Save className="h-4 w-4 mr-1" /> {busy ? 'Đang lưu...' : 'Lưu nháp'}
      </Button>
      <Button onClick={onSubmit} disabled={busy || !canEdit} variant="secondary">
        <Send className="h-4 w-4 mr-1" /> Gửi duyệt
      </Button>
      <Button onClick={onLock} disabled={busy || !canEdit} variant="destructive">
        <Lock className="h-4 w-4 mr-1" /> Chốt (đã duyệt)
      </Button>
      {canUnlock && (
        <Button onClick={onUnlock} disabled={busy} variant="outline" className="text-amber-600 border-amber-300 hover:bg-amber-50">
          <Lock className="h-4 w-4 mr-1" /> Mở chốt
        </Button>
      )}
    </div>
  )
}
