import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3, Calculator, CheckCircle2, Download, FileSpreadsheet, Pencil, RotateCcw, Save, Send, Trash2, XCircle,
} from 'lucide-react'
import { exportSalaryToExcel } from '@/lib/excel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  deleteSalaryRecords, getActiveSalaryConfig, listAttendanceDriver, listAttendanceOffice,
  listAttendanceSecurity, listAttendanceTechnician, listDepartments, listEmployees,
  listSalaryGrades, listSalaryRecords, setSalaryRecordsStatus, upsertSalaryRecords,
} from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { fmtVND } from '@/lib/utils'
import {
  SR_STATUS_LABEL,
  type AttendanceDriver, type AttendanceOffice, type AttendanceSecurity,
  type AttendanceTechnician, type Department, type EmployeeFull, type SalaryConfig,
  type SalaryGrade, type SalaryRecord, type SalaryRecordStatus,
} from '@/lib/types'
import {
  computePayroll, defaultKhoi, type Khoi, type PayrollAdjustments, type PayrollRecord,
} from '@/lib/payroll'

interface AdjMap { [employeeId: string]: PayrollAdjustments }

/** Trích message từ Error hoặc PostgrestError (không phải instanceof Error). */
function extractMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return fallback
}

function thisMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}`
}

function StatusBadge({ status }: { status: SalaryRecordStatus }) {
  const variant: 'secondary' | 'warning' | 'success' | 'destructive' = (
    status === 'draft' ? 'secondary' :
    status === 'pending' ? 'warning' :
    status === 'approved' ? 'success' : 'destructive'
  )
  return <Badge variant={variant}>{SR_STATUS_LABEL[status]}</Badge>
}

export default function SalaryPage() {
  const { profile, hasRole } = useAuth()
  const [departments, setDepartments] = useState<Department[]>([])
  const [employees, setEmployees] = useState<EmployeeFull[]>([])
  const [grades, setGrades] = useState<SalaryGrade[]>([])
  const [config, setConfig] = useState<SalaryConfig | null>(null)
  const [records, setRecords] = useState<SalaryRecord[]>([])

  const [deptId, setDeptId] = useState<string>('')
  const [monthYear, setMonthYear] = useState<string>(thisMonth())
  const [khoi, setKhoi] = useState<Khoi>('office')
  const [adj, setAdj] = useState<AdjMap>({})

  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editEmp, setEditEmp] = useState<EmployeeFull | null>(null)
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; ids: string[]; reason: string }>({
    open: false, ids: [], reason: '',
  })
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; ids: string[]; label: string }>({
    open: false, ids: [], label: '',
  })

  // truong_phong tự khoá phòng ban của họ
  const lockedDept = profile?.user.role === 'truong_phong' ? profile.user.department_id : null

  // Quyền hạn:
  //   - truong_phong  : chỉ đọc, không tính / không duyệt
  //   - admin_luong   : tính, lưu nháp, gửi duyệt, duyệt, huỷ
  //   - admin_he_thong: như admin_luong
  const canCalc    = hasRole('admin_luong', 'admin_he_thong')
  const canApprove = hasRole('admin_luong', 'admin_he_thong')

  // ----- Load danh mục cố định -----
  useEffect(() => {
    (async () => {
      try {
        const [d, e, g] = await Promise.all([
          listDepartments(),
          listEmployees({ status: 'dang_lam_viec' }),
          listSalaryGrades(),
        ])
        setDepartments(d)
        setEmployees(e)
        setGrades(g)
        if (lockedDept) setDeptId(lockedDept)
        else if (d.length > 0 && !deptId) setDeptId(d[0].id)
      } catch (err) {
        console.error('[SalaryPage/initLoad]', err)
        setError(extractMsg(err, 'Không tải được danh mục.'))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tự đổi khối theo phòng
  useEffect(() => {
    const d = departments.find(x => x.id === deptId)
    if (!d) return
    if (d.salary_type === 'hanh_chinh') setKhoi('office')
    else if (d.salary_type === 'lai_xe') setKhoi('driver')
    else setKhoi(prev => (prev === 'security' || prev === 'technician') ? prev : 'security')
  }, [deptId, departments])

  // Reload config + records mỗi khi đổi tháng / phòng
  const reload = async () => {
    if (!deptId || !monthYear) return
    setError(null); setInfo(null); setBusy(true)
    try {
      const [cfg, recs] = await Promise.all([
        getActiveSalaryConfig(monthYear),
        listSalaryRecords(deptId, monthYear),
      ])
      setConfig(cfg)
      setRecords(recs)
      // Khôi phục adjustments từ raw_data nếu có
      const m: AdjMap = {}
      for (const r of recs) {
        const raw = r.raw_data as { adjustments?: PayrollAdjustments } | null
        if (raw?.adjustments) m[r.employee_id] = raw.adjustments
      }
      setAdj(m)
    } catch (e) {
      console.error('[SalaryPage/reload]', e)
      setError(extractMsg(e, 'Không tải được dữ liệu.'))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptId, monthYear])

  const empOfDept = useMemo(
    () => employees.filter(e => !deptId || e.department_id === deptId),
    [employees, deptId],
  )

  // Map nhanh ngạch+bậc → he_so
  const heSoOf = (ngachCode: string | null, bac: number | null): number => {
    if (!ngachCode || !bac) return 0
    const g = grades.find(x => x.ngach_code === ngachCode && x.bac === bac)
    return g ? Number(g.he_so) : 0
  }

  // Map record by employee
  const recByEmp = useMemo(() => {
    const m = new Map<string, SalaryRecord>()
    for (const r of records) m.set(r.employee_id, r)
    return m
  }, [records])

  // Tính lương live cho hiển thị (không lưu)
  const computeForEmp = async (emp: EmployeeFull): Promise<PayrollRecord | null> => {
    if (!config) return null
    // Lấy chấm công từ DB (đã lưu) — không bắt buộc phải locked
    let attendance:
      | AttendanceOffice | AttendanceSecurity | AttendanceTechnician | AttendanceDriver | null = null
    try {
      if (khoi === 'office') {
        const arr = await listAttendanceOffice(deptId, monthYear)
        attendance = arr.find(a => a.employee_id === emp.id) ?? null
      } else if (khoi === 'security') {
        const arr = await listAttendanceSecurity(deptId, monthYear)
        attendance = arr.find(a => a.employee_id === emp.id) ?? null
      } else if (khoi === 'technician') {
        const arr = await listAttendanceTechnician(deptId, monthYear)
        attendance = arr.find(a => a.employee_id === emp.id) ?? null
      } else {
        const arr = await listAttendanceDriver(deptId, monthYear)
        // Nguồn admin_luong là nguồn chính thức để tính lương (đã đối soát)
        attendance = arr.find(a => a.employee_id === emp.id && a.source === 'admin_luong') ?? null
      }
    } catch { /* attendance giữ null */ }
    return computePayroll({
      employee: emp,
      department: departments.find(d => d.id === emp.department_id) ?? null,
      config,
      attendance,
      khoi,
      monthYear,
      he_so_bac: heSoOf(emp.ngach_code, emp.bac),
      adj: adj[emp.id] ?? {},
    })
  }

  // ========== ACTIONS ==========

  const calcAndSaveAll = async (asPending: boolean) => {
    if (!canCalc) return
    if (!config) { setError('Chưa có cấu hình lương cho tháng này.'); return }
    if (empOfDept.length === 0) { setError('Phòng ban chưa có nhân viên đang làm việc.'); return }
    if (!confirm(asPending
      ? `Tính lương + GỬI DUYỆT cho ${empOfDept.length} nhân viên tháng ${monthYear}?`
      : `Tính lương (lưu nháp) cho ${empOfDept.length} nhân viên tháng ${monthYear}?`)) return

    setBusy(true); setError(null); setInfo(null)
    try {
      // Xác định khối phù hợp cho từng nhân viên (có thể trong 1 phòng vẫn có
      // các trường hợp đặc biệt, nhưng theo nghiệp vụ V75 phòng ban quyết định)
      const dept = departments.find(d => d.id === deptId) ?? null
      const khoiUse = dept?.salary_type === 'bao_ve_ky_thuat' ? khoi : defaultKhoi(dept)

      // Lấy hết chấm công 1 lần
      const [off, sec, tec, drv] = await Promise.all([
        khoiUse === 'office'    ? listAttendanceOffice(deptId, monthYear)     : Promise.resolve([] as AttendanceOffice[]),
        khoiUse === 'security'  ? listAttendanceSecurity(deptId, monthYear)   : Promise.resolve([] as AttendanceSecurity[]),
        khoiUse === 'technician'? listAttendanceTechnician(deptId, monthYear) : Promise.resolve([] as AttendanceTechnician[]),
        khoiUse === 'driver'    ? listAttendanceDriver(deptId, monthYear)     : Promise.resolve([] as AttendanceDriver[]),
      ])

      const recs: Array<Partial<SalaryRecord> & { employee_id: string; month_year: string; department_id: string }> = []
      let skipped = 0
      for (const emp of empOfDept) {
        // Bỏ qua nhân viên đã có bản approved
        const existed = recByEmp.get(emp.id)
        if (existed && existed.status === 'approved') { skipped++; continue }

        let attendance:
          | AttendanceOffice | AttendanceSecurity | AttendanceTechnician | AttendanceDriver | null = null
        if (khoiUse === 'office')        attendance = off.find(a => a.employee_id === emp.id) ?? null
        else if (khoiUse === 'security') attendance = sec.find(a => a.employee_id === emp.id) ?? null
        else if (khoiUse === 'technician') attendance = tec.find(a => a.employee_id === emp.id) ?? null
        else                              attendance = drv.find(a => a.employee_id === emp.id && a.source === 'admin_luong') ?? null

        const r = computePayroll({
          employee: emp,
          department: dept,
          config,
          attendance,
          khoi: khoiUse,
          monthYear,
          he_so_bac: heSoOf(emp.ngach_code, emp.bac),
          adj: adj[emp.id] ?? {},
        })
        // PayrollRecord và Partial<SalaryRecord> tương đương về tên cột;
        // PayrollRecord có các trường numeric non-null, nên hợp lệ khi gán.
        const row = r as unknown as Partial<SalaryRecord> & {
          employee_id: string; month_year: string; department_id: string
        }
        recs.push({
          ...row,
          id: existed?.id,
          department_id: emp.department_id ?? deptId,
          status: asPending ? 'pending' : 'draft',
        })
      }

      await upsertSalaryRecords(recs, profile?.user.id ?? null)
      setInfo(`Đã ${asPending ? 'tính + gửi duyệt' : 'tính + lưu nháp'} ${recs.length} bảng lương${skipped ? ` (bỏ qua ${skipped} bản đã duyệt)` : ''}.`)
      await reload()
    } catch (e) {
      console.error('[SalaryPage/calcAndSaveAll]', e)
      setError(extractMsg(e, 'Tính lương thất bại.'))
    } finally { setBusy(false) }
  }

  const approveAllPending = async () => {
    if (!canApprove) return
    const ids = records.filter(r => r.status === 'pending').map(r => r.id)
    if (ids.length === 0) { setInfo('Không có bản nào ở trạng thái Chờ duyệt.'); return }
    if (!confirm(`Duyệt ${ids.length} bảng lương đang chờ duyệt?`)) return
    setBusy(true); setError(null); setInfo(null)
    try {
      await setSalaryRecordsStatus(ids, 'approved', { approved_by: profile?.user.id })
      setInfo(`Đã duyệt ${ids.length} bảng lương.`)
      await reload()
    } catch (e) {
      console.error('[SalaryPage/approveAll]', e)
      setError(extractMsg(e, 'Duyệt thất bại.'))
    } finally { setBusy(false) }
  }

  const openCancel = (ids: string[]) => setCancelDialog({ open: true, ids, reason: '' })
  const submitCancel = async () => {
    if (!canApprove) return
    if (cancelDialog.ids.length === 0) return
    setBusy(true); setError(null); setInfo(null)
    try {
      await setSalaryRecordsStatus(cancelDialog.ids, 'cancelled', {
        cancelled_by: profile?.user.id,
        cancel_reason: cancelDialog.reason || undefined,
      })
      setInfo(`Đã huỷ ${cancelDialog.ids.length} bảng lương.`)
      setCancelDialog({ open: false, ids: [], reason: '' })
      await reload()
    } catch (e) {
      console.error('[SalaryPage/submitCancel]', e)
      setError(extractMsg(e, 'Huỷ thất bại.'))
    } finally { setBusy(false) }
  }

  const openDelete = (ids: string[], label: string) =>
    setDeleteDialog({ open: true, ids, label })
  const submitDelete = async () => {
    if (deleteDialog.ids.length === 0) return
    setBusy(true); setError(null); setInfo(null)
    try {
      await deleteSalaryRecords(deleteDialog.ids)
      setInfo(`Đã xoá ${deleteDialog.ids.length} bản ghi lương.`)
      setDeleteDialog({ open: false, ids: [], label: '' })
      await reload()
    } catch (e) {
      setError(extractMsg(e, 'Xoá thất bại.'))
    } finally { setBusy(false) }
  }

  // Tính tổng các cột để hiển thị footer
  const totals = useMemo(() => {
    return records.reduce((s, r) => ({
      tong_chiu_thue: s.tong_chiu_thue + Number(r.tong_chiu_thue ?? 0),
      tong_khong_ct: s.tong_khong_ct + Number(r.tong_khong_ct ?? 0),
      trich_nld: s.trich_nld + Number(r.trich_nld ?? 0),
      thue_tncn: s.thue_tncn + Number(r.thue_tncn ?? 0),
      thuc_linh: s.thuc_linh + Number(r.thuc_linh ?? 0),
    }), { tong_chiu_thue: 0, tong_khong_ct: 0, trich_nld: 0, thue_tncn: 0, thuc_linh: 0 })
  }, [records])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Bảng lương
        </h1>
        <p className="text-sm text-muted-foreground">
          Module 4 — RULE-04/05. Tính lương từ chấm công, snapshot vào salary_records (không sửa được sau khi đã duyệt).
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
          <Label htmlFor="khoi">Khối tính lương</Label>
          <Select id="khoi" value={khoi} onChange={e => setKhoi(e.target.value as Khoi)}>
            {(['office','security','technician','driver'] as Khoi[]).map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="month">Tháng</Label>
          <Input id="month" type="month" value={monthYear} onChange={e => setMonthYear(e.target.value)} />
        </div>
        <div className="space-y-2 flex items-end text-xs text-muted-foreground">
          {empOfDept.length} nhân viên — config:&nbsp;
          {config ? <span className="font-mono">{config.effective_date}</span> : <span className="text-destructive">chưa có</span>}
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

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => calcAndSaveAll(false)} disabled={busy || !canCalc || !config}>
          <Calculator className="h-4 w-4 mr-1" /> Tính + Lưu nháp
        </Button>
        <Button onClick={() => calcAndSaveAll(true)} disabled={busy || !canCalc || !config} variant="secondary">
          <Send className="h-4 w-4 mr-1" /> Tính + Gửi duyệt
        </Button>
        <Button onClick={approveAllPending} disabled={busy || !canApprove} variant="default">
          <CheckCircle2 className="h-4 w-4 mr-1" /> Duyệt tất cả Chờ duyệt
        </Button>
        <Button
          onClick={() => openCancel(records.filter(r => r.status === 'approved').map(r => r.id))}
          disabled={busy || !canApprove || records.every(r => r.status !== 'approved')}
          variant="destructive"
        >
          <RotateCcw className="h-4 w-4 mr-1" /> Huỷ duyệt (toàn bộ đã duyệt)
        </Button>
        <Button onClick={reload} disabled={busy} variant="outline">
          <FileSpreadsheet className="h-4 w-4 mr-1" /> Tải lại
        </Button>
        {canApprove && records.length > 0 && (
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10"
            disabled={busy}
            onClick={() => openDelete(
              records.map(r => r.id),
              `${records.length} bản lương tháng ${monthYear} của phòng đã chọn`,
            )}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Xoá cả tháng
          </Button>
        )}
        <Button
          onClick={() => {
            try {
              exportSalaryToExcel({
                records,
                department: departments.find(d => d.id === deptId) ?? null,
                monthYear,
              })
              setInfo(`Đã xuất Excel ${records.length} bản lương tháng ${monthYear}.`)
            } catch (e) {
              console.error('[SalaryPage/exportExcel]', e)
              setError(extractMsg(e, 'Xuất Excel thất bại.'))
            }
          }}
          disabled={busy || records.length === 0}
          variant="outline"
          title="Xuất file .xlsx của bảng lương đang hiển thị"
        >
          <Download className="h-4 w-4 mr-1" /> Xuất Excel
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nhân viên</TableHead>
            <TableHead>Ngạch/Bậc</TableHead>
            <TableHead className="text-right">LCB tháng</TableHead>
            <TableHead className="text-right">Tổng chịu thuế</TableHead>
            <TableHead className="text-right">Không chịu thuế</TableHead>
            <TableHead className="text-right">Trích NLĐ</TableHead>
            <TableHead className="text-right">Thuế TNCN</TableHead>
            <TableHead className="text-right">Thực lĩnh</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.length === 0 && empOfDept.length === 0 ? (
            <TableEmpty colSpan={10}>Phòng ban chưa có nhân viên.</TableEmpty>
          ) : records.length === 0 ? (
            <TableEmpty colSpan={10}>
              Chưa có bảng lương cho tháng này. Bấm "Tính + Lưu nháp" để khởi tạo.
            </TableEmpty>
          ) : records.map(r => {
            const lcbThang = (Number(r.he_so_bac ?? 0)) * Number(r.luong_co_so ?? 0)
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium whitespace-nowrap">
                  <div>{r.ho_ten}</div>
                  <div className="text-xs text-muted-foreground font-mono">{r.cccd}</div>
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {r.ngach_code} / Bậc {r.bac} <span className="text-muted-foreground">(HS {Number(r.he_so_bac)})</span>
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{fmtVND(lcbThang)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{fmtVND(Number(r.tong_chiu_thue ?? 0))}</TableCell>
                <TableCell className="text-right font-mono text-xs">{fmtVND(Number(r.tong_khong_ct ?? 0))}</TableCell>
                <TableCell className="text-right font-mono text-xs">{fmtVND(Number(r.trich_nld ?? 0))}</TableCell>
                <TableCell className="text-right font-mono text-xs">{fmtVND(Number(r.thue_tncn ?? 0))}</TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold">{fmtVND(Number(r.thuc_linh ?? 0))}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell>
                  {r.status !== 'approved' && (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => setEditEmp(empOfDept.find(e => e.id === r.employee_id) ?? null)}
                      disabled={!canCalc}
                    >
                      <Pencil className="h-3 w-3 mr-1" /> Điều chỉnh
                    </Button>
                  )}
                  {r.status === 'approved' && canApprove && (
                    <Button
                      size="sm" variant="ghost" className="text-destructive"
                      onClick={() => openCancel([r.id])}
                    >
                      <XCircle className="h-3 w-3 mr-1" /> Huỷ
                    </Button>
                  )}
                  {canApprove && (
                    <Button
                      size="sm" variant="ghost"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => openDelete([r.id], `bản lương của ${r.ho_ten} tháng ${monthYear}`)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        {records.length > 0 && (
          <tfoot className="border-t bg-muted/30">
            <tr>
              <td className="p-3 font-semibold" colSpan={3}>Tổng cộng ({records.length} bản)</td>
              <td className="p-3 text-right font-mono text-xs font-semibold">{fmtVND(totals.tong_chiu_thue)}</td>
              <td className="p-3 text-right font-mono text-xs font-semibold">{fmtVND(totals.tong_khong_ct)}</td>
              <td className="p-3 text-right font-mono text-xs font-semibold">{fmtVND(totals.trich_nld)}</td>
              <td className="p-3 text-right font-mono text-xs font-semibold">{fmtVND(totals.thue_tncn)}</td>
              <td className="p-3 text-right font-mono text-xs font-bold">{fmtVND(totals.thuc_linh)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        )}
      </Table>

      {/* Adjustment dialog */}
      {editEmp && (
        <AdjustmentDialog
          emp={editEmp}
          value={adj[editEmp.id] ?? {}}
          onClose={() => setEditEmp(null)}
          onSave={(v) => {
            setAdj(prev => ({ ...prev, [editEmp.id]: v }))
            setEditEmp(null)
            setInfo('Đã ghi nhận điều chỉnh. Bấm "Tính + Lưu nháp" để áp dụng vào bảng lương.')
          }}
          preview={async () => {
            const r = await computeForEmp(editEmp)
            return r
          }}
        />
      )}

      {/* Delete salary records dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(o) => setDeleteDialog(s => ({ ...s, open: o }))}>
        <DialogContent onClose={() => setDeleteDialog({ open: false, ids: [], label: '' })}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Xác nhận xoá bảng lương
            </DialogTitle>
            <DialogDescription>
              Thao tác này <strong>không thể hoàn tác</strong>. Dữ liệu sẽ bị xoá vĩnh viễn khỏi database (audit log vẫn giữ lại).
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-3 text-sm">
            Sẽ xoá: <strong>{deleteDialog.label}</strong>
            {deleteDialog.ids.length > 1 && (
              <div className="mt-1 text-xs text-muted-foreground">
                Bao gồm cả bản lương đã duyệt (nếu có). Hệ thống sẽ xoá toàn bộ.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, ids: [], label: '' })} disabled={busy}>Huỷ</Button>
            <Button variant="destructive" onClick={submitDelete} disabled={busy}>
              <Trash2 className="h-4 w-4 mr-1" /> {busy ? 'Đang xoá...' : 'Xoá vĩnh viễn'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel approved dialog */}
      <Dialog open={cancelDialog.open} onOpenChange={(o) => setCancelDialog(s => ({ ...s, open: o }))}>
        <DialogContent onClose={() => setCancelDialog({ open: false, ids: [], reason: '' })}>
          <DialogHeader>
            <DialogTitle>Huỷ duyệt bảng lương</DialogTitle>
            <DialogDescription>
              Sẽ chuyển {cancelDialog.ids.length} bảng lương đã duyệt sang trạng thái "Đã huỷ".
              Bản ghi snapshot không bị xoá (audit trail).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Lý do *</Label>
            <Textarea id="reason" value={cancelDialog.reason}
              onChange={e => setCancelDialog(s => ({ ...s, reason: e.target.value }))}
              placeholder="Lý do huỷ duyệt..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog({ open: false, ids: [], reason: '' })}>Đóng</Button>
            <Button variant="destructive" onClick={submitCancel} disabled={busy || !cancelDialog.reason.trim()}>
              <XCircle className="h-4 w-4 mr-1" /> Xác nhận huỷ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// =============================================================
// AdjustmentDialog
// =============================================================
interface AdjDialogProps {
  emp: EmployeeFull
  value: PayrollAdjustments
  onClose: () => void
  onSave: (v: PayrollAdjustments) => void
  preview: () => Promise<PayrollRecord | null>
}
function AdjustmentDialog({ emp, value, onClose, onSave, preview }: AdjDialogProps) {
  const [v, setV] = useState<PayrollAdjustments>(value)
  const [pv, setPv] = useState<PayrollRecord | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try { setPv(await preview()) } finally { setLoading(false) }
  }
  useEffect(() => { refresh() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [v])

  const N = (k: keyof PayrollAdjustments) => Number(v[k] ?? 0)
  const set = (k: keyof PayrollAdjustments, n: number) => setV(prev => ({ ...prev, [k]: n }))

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent onClose={onClose} className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" /> Điều chỉnh — {emp.ho_ten}
          </DialogTitle>
          <DialogDescription>
            Các khoản điều chỉnh thủ công. Sau khi lưu, bấm "Tính + Lưu nháp" ở trang bảng lương để áp dụng vào DB.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>Thưởng (chịu thuế)</Label>
            <Input type="number" min={0} value={N('thuong')} onChange={e => set('thuong', Number(e.target.value || 0))} />
          </div>
          <div className="space-y-2">
            <Label>Truy lĩnh</Label>
            <Input type="number" min={0} value={N('truy_linh')} onChange={e => set('truy_linh', Number(e.target.value || 0))} />
          </div>
          <div className="space-y-2">
            <Label>Truy thu</Label>
            <Input type="number" min={0} value={N('truy_thu')} onChange={e => set('truy_thu', Number(e.target.value || 0))} />
          </div>
          <div className="space-y-2">
            <Label>Phụ cấp xăng xe (KCT)</Label>
            <Input type="number" min={0} value={N('xang_xe')} onChange={e => set('xang_xe', Number(e.target.value || 0))} />
          </div>
          <div className="space-y-2">
            <Label>Phụ cấp điện thoại (KCT)</Label>
            <Input type="number" min={0} value={N('dien_thoai')} onChange={e => set('dien_thoai', Number(e.target.value || 0))} />
          </div>
          <div className="space-y-2">
            <Label>Số ngày tính ăn trưa</Label>
            <Input type="number" min={0} step="0.5" value={N('so_ngay_an_trua')}
              onChange={e => set('so_ngay_an_trua', Number(e.target.value || 0))}
              placeholder="Bỏ trống = lấy theo công thực tế" />
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>Phần lương không chịu thuế tách riêng (KCT)</Label>
            <Input type="number" min={0} value={N('tien_luong_kct')} onChange={e => set('tien_luong_kct', Number(e.target.value || 0))} />
          </div>
        </div>

        <div className="rounded border p-3 bg-muted/30 text-xs space-y-1">
          <div className="font-semibold mb-1">Xem trước (chưa lưu DB)</div>
          {loading ? 'Đang tính...' : !pv ? '—' : (
            <>
              <div>LCB ngày: <span className="font-mono">{fmtVND(Number(pv.lcb_ngay))}</span></div>
              <div>Tổng chịu thuế: <span className="font-mono">{fmtVND(Number(pv.tong_chiu_thue))}</span></div>
              <div>Tổng KCT: <span className="font-mono">{fmtVND(Number(pv.tong_khong_ct))}</span></div>
              <div>BH NLĐ + CĐP: <span className="font-mono">{fmtVND(Number(pv.trich_nld) + Number(pv.cdp))}</span></div>
              <div>Thuế TNCN: <span className="font-mono">{fmtVND(Number(pv.thue_tncn))}</span></div>
              <div className="text-sm font-semibold border-t pt-1 mt-1">
                Thực lĩnh: <span className="font-mono">{fmtVND(Number(pv.thuc_linh))}</span>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hỷy</Button>
          <Button onClick={() => onSave(v)}>
            <Save className="h-4 w-4 mr-1" /> Lưu điều chỉnh
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
