import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  createEmployee, deleteEmployee, listDepartments, listEmployees, listSalaryGrades, updateEmployee,
} from '@/lib/api'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import {
  STATUS_LABEL,
  type Department, type EmployeeFull, type EmployeeStatus, type SalaryGrade,
} from '@/lib/types'

const STATUS_OPTIONS: EmployeeStatus[] = ['dang_lam_viec','luan_chuyen','da_nghi_huu','da_nghi_viec']

interface FormState {
  id?: string
  cccd: string
  ho_ten: string
  ngay_sinh: string
  gioi_tinh: string
  so_dien_thoai: string
  email: string
  dia_chi: string
  department_id: string
  chuc_vu: string
  ngach_code: string
  bac: number | ''
  ngay_huong_bac: string
  tnvk_percent: number | ''
  he_so_pccv: number | ''
  he_so_pctn: number | ''
  so_nguoi_phu_thuoc: number | ''
  so_tai_khoan: string
  ten_ngan_hang: string
  ngay_vao_lam: string
  status: EmployeeStatus
  ghi_chu: string
}

const EMPTY: FormState = {
  cccd: '', ho_ten: '', ngay_sinh: '', gioi_tinh: '', so_dien_thoai: '', email: '',
  dia_chi: '', department_id: '', chuc_vu: '', ngach_code: '', bac: '', ngay_huong_bac: '',
  tnvk_percent: '', he_so_pccv: '', he_so_pctn: '', so_nguoi_phu_thuoc: '',
  so_tai_khoan: '', ten_ngan_hang: '', ngay_vao_lam: '',
  status: 'dang_lam_viec', ghi_chu: '',
}

export default function EmployeesPage() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('admin_luong', 'admin_he_thong')

  const [items, setItems] = useState<EmployeeFull[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [grades, setGrades] = useState<SalaryGrade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterDept, setFilterDept] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('dang_lam_viec')
  const [q, setQ] = useState('')

  const [openForm, setOpenForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitting, setSubmitting] = useState(false)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<EmployeeFull | null>(null)
  const [deleting, setDeleting] = useState(false)

  const reload = async () => {
    setLoading(true); setError(null)
    try {
      const data = await listEmployees({
        department_id: filterDept || null,
        status: filterStatus || null,
        q,
      })
      setItems(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được nhân viên.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const [ds, gs] = await Promise.all([listDepartments(), listSalaryGrades()])
        setDepartments(ds)
        setGrades(gs)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Không tải được tham chiếu.')
      }
    })()
  }, [])

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDept, filterStatus])

  const deptMap = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments])

  const ngachOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const g of grades) seen.set(g.ngach_code, g.ngach_name)
    return Array.from(seen, ([code, name]) => ({ code, name }))
  }, [grades])

  const bacOptions = useMemo(() => {
    if (!form.ngach_code) return []
    return grades.filter(g => g.ngach_code === form.ngach_code).sort((a, b) => a.bac - b.bac)
  }, [grades, form.ngach_code])

  const onAdd = () => { setForm(EMPTY); setOpenForm(true) }
  const onEdit = (e: EmployeeFull) => {
    setForm({
      id: e.id,
      cccd: e.cccd,
      ho_ten: e.ho_ten,
      ngay_sinh: e.ngay_sinh ?? '',
      gioi_tinh: e.gioi_tinh ?? '',
      so_dien_thoai: e.so_dien_thoai ?? '',
      email: e.email ?? '',
      dia_chi: e.dia_chi ?? '',
      department_id: e.department_id ?? '',
      chuc_vu: e.chuc_vu ?? '',
      ngach_code: e.ngach_code ?? '',
      bac: e.bac ?? '',
      ngay_huong_bac: e.ngay_huong_bac ?? '',
      tnvk_percent: e.tnvk_percent ?? '',
      he_so_pccv: e.he_so_pccv ?? '',
      he_so_pctn: e.he_so_pctn ?? '',
      so_nguoi_phu_thuoc: e.so_nguoi_phu_thuoc ?? '',
      so_tai_khoan: e.so_tai_khoan ?? '',
      ten_ngan_hang: e.ten_ngan_hang ?? '',
      ngay_vao_lam: e.ngay_vao_lam ?? '',
      status: e.status,
      ghi_chu: e.ghi_chu ?? '',
    })
    setOpenForm(true)
  }

  const onConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true); setError(null)
    try {
      await deleteEmployee(deleteTarget.id)
      setDeleteTarget(null)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xoá nhân viên thất bại.')
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const num = (v: number | ''): number => (v === '' ? 0 : Number(v))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true); setError(null)
    try {
      if (!/^[0-9]{9,12}$/.test(form.cccd)) throw new Error('CCCD phải là 9–12 chữ số.')
      if (!form.ho_ten.trim()) throw new Error('Họ tên là bắt buộc.')
      if (form.ngach_code && !form.bac) throw new Error('Đã chọn ngạch thì phải chọn bậc.')

      const payload: Partial<EmployeeFull> = {
        cccd: form.cccd,
        ho_ten: form.ho_ten.trim(),
        ngay_sinh: form.ngay_sinh || null,
        gioi_tinh: form.gioi_tinh || null,
        so_dien_thoai: form.so_dien_thoai || null,
        email: form.email || null,
        dia_chi: form.dia_chi || null,
        department_id: form.department_id || null,
        chuc_vu: form.chuc_vu || null,
        ngach_code: form.ngach_code || null,
        bac: form.bac === '' ? null : Number(form.bac),
        ngay_huong_bac: form.ngay_huong_bac || null,
        tnvk_percent: num(form.tnvk_percent),
        he_so_pccv: num(form.he_so_pccv),
        he_so_pctn: num(form.he_so_pctn),
        so_nguoi_phu_thuoc: num(form.so_nguoi_phu_thuoc),
        so_tai_khoan: form.so_tai_khoan || null,
        ten_ngan_hang: form.ten_ngan_hang || null,
        ngay_vao_lam: form.ngay_vao_lam || null,
        status: form.status,
        ghi_chu: form.ghi_chu || null,
      }

      if (form.id) await updateEmployee(form.id, payload)
      else await createEmployee(payload)

      setOpenForm(false)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lưu nhân viên thất bại.')
    } finally {
      setSubmitting(false)
    }
  }

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Nhân viên
          </h1>
          <p className="text-sm text-muted-foreground">Quản lý hồ sơ nhân viên (RULE-09 soft delete bằng status).</p>
        </div>
        {canEdit && (
          <Button onClick={onAdd}><Plus className="h-4 w-4 mr-1" /> Thêm nhân viên</Button>
        )}
      </div>

      <form onSubmit={submitSearch} className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Select value={filterDept} onChange={e => setFilterDept(e.target.value)}>
          <option value="">Tất cả phòng ban</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.code} – {d.name}</option>)}
        </Select>
        <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Tìm theo họ tên, CCCD, chức vụ..."
            value={q}
            onChange={e => setQ(e.target.value)}
            className="pl-10"
          />
        </div>
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Lỗi</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>CCCD</TableHead>
            <TableHead>Họ tên</TableHead>
            <TableHead>Phòng ban</TableHead>
            <TableHead>Chức vụ</TableHead>
            <TableHead>Ngạch / Bậc</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRowSkeleton cols={7} rows={6} />
          ) : items.length === 0 ? (
            <TableEmpty colSpan={7} />
          ) : items.map(emp => (
            <TableRow key={emp.id}>
              <TableCell className="font-mono text-xs">{emp.cccd}</TableCell>
              <TableCell className="font-medium">{emp.ho_ten}</TableCell>
              <TableCell className="text-sm">
                {emp.department_id ? (deptMap.get(emp.department_id)?.name ?? '—') : '—'}
              </TableCell>
              <TableCell className="text-sm">{emp.chuc_vu ?? '—'}</TableCell>
              <TableCell className="text-sm font-mono">
                {emp.ngach_code ? `${emp.ngach_code} / ${emp.bac ?? '—'}` : '—'}
              </TableCell>
              <TableCell>
                <Badge variant={emp.status === 'dang_lam_viec' ? 'success' : 'secondary'}>
                  {STATUS_LABEL[emp.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {canEdit && (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => onEdit(emp)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(emp)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Delete confirm dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <DialogContent onClose={() => setDeleteTarget(null)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Xác nhận xoá nhân viên
            </DialogTitle>
            <DialogDescription>
              Thao tác này <strong>không thể hoàn tác</strong>. Dữ liệu nhân viên sẽ bị xoá vĩnh viễn khỏi database.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-md bg-muted p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">Họ tên:</span> <strong>{deleteTarget.ho_ten}</strong></div>
              <div><span className="text-muted-foreground">CCCD:</span> <code>{deleteTarget.cccd}</code></div>
              {deleteTarget.ngach_code && (
                <div><span className="text-muted-foreground">Ngạch/Bậc:</span> {deleteTarget.ngach_code} / {deleteTarget.bac}</div>
              )}
              <div className="text-xs text-muted-foreground mt-2">
                Nếu nhân viên có bản ghi lương hoặc chấm công, hệ thống sẽ từ chối xoá và thông báo.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Huỷ</Button>
            <Button variant="destructive" onClick={onConfirmDelete} disabled={deleting}>
              {deleting ? 'Đang xoá...' : 'Xoá vĩnh viễn'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent onClose={() => setOpenForm(false)} className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Cập nhật nhân viên' : 'Thêm nhân viên'}</DialogTitle>
            <DialogDescription>
              CCCD là khoá định danh; ngạch-bậc tham chiếu salary_grades (RULE-02).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cccd">CCCD *</Label>
                <Input
                  id="cccd"
                  value={form.cccd}
                  onChange={e => setForm({ ...form, cccd: e.target.value.replace(/\D/g, '').slice(0,12) })}
                  required
                  disabled={!!form.id}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ho_ten">Họ tên *</Label>
                <Input
                  id="ho_ten"
                  value={form.ho_ten}
                  onChange={e => setForm({ ...form, ho_ten: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ngay_sinh">Ngày sinh</Label>
                <Input id="ngay_sinh" type="date" value={form.ngay_sinh}
                  onChange={e => setForm({ ...form, ngay_sinh: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gioi_tinh">Giới tính</Label>
                <Select id="gioi_tinh" value={form.gioi_tinh}
                  onChange={e => setForm({ ...form, gioi_tinh: e.target.value })}>
                  <option value="">—</option>
                  <option value="Nam">Nam</option>
                  <option value="Nữ">Nữ</option>
                  <option value="Khác">Khác</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="so_dien_thoai">Điện thoại</Label>
                <Input id="so_dien_thoai" value={form.so_dien_thoai}
                  onChange={e => setForm({ ...form, so_dien_thoai: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="dia_chi">Địa chỉ</Label>
                <Input id="dia_chi" value={form.dia_chi}
                  onChange={e => setForm({ ...form, dia_chi: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="department_id">Phòng ban</Label>
                <Select id="department_id" value={form.department_id}
                  onChange={e => setForm({ ...form, department_id: e.target.value })}>
                  <option value="">—</option>
                  {departments.filter(d => d.is_active).map(d => (
                    <option key={d.id} value={d.id}>{d.code} – {d.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="chuc_vu">Chức vụ</Label>
                <Input id="chuc_vu" value={form.chuc_vu}
                  onChange={e => setForm({ ...form, chuc_vu: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ngach_code">Ngạch</Label>
                <Select id="ngach_code" value={form.ngach_code}
                  onChange={e => setForm({ ...form, ngach_code: e.target.value, bac: '' })}>
                  <option value="">—</option>
                  {ngachOptions.map(n => (
                    <option key={n.code} value={n.code}>{n.code} – {n.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bac">Bậc</Label>
                <Select id="bac" value={form.bac}
                  onChange={e => setForm({ ...form, bac: e.target.value === '' ? '' : Number(e.target.value) })}>
                  <option value="">—</option>
                  {bacOptions.map(g => (
                    <option key={g.id} value={g.bac}>Bậc {g.bac} (HS {g.he_so})</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ngay_huong_bac">Ngày hưởng bậc</Label>
                <Input id="ngay_huong_bac" type="date" value={form.ngay_huong_bac}
                  onChange={e => setForm({ ...form, ngay_huong_bac: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tnvk_percent">% TNVK</Label>
                <Input id="tnvk_percent" type="number" step="0.01" value={form.tnvk_percent}
                  onChange={e => setForm({ ...form, tnvk_percent: e.target.value === '' ? '' : Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="he_so_pccv">Hệ số PCCV</Label>
                <Input id="he_so_pccv" type="number" step="0.01" value={form.he_so_pccv}
                  onChange={e => setForm({ ...form, he_so_pccv: e.target.value === '' ? '' : Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="he_so_pctn">Hệ số PCTN</Label>
                <Input id="he_so_pctn" type="number" step="0.01" value={form.he_so_pctn}
                  onChange={e => setForm({ ...form, he_so_pctn: e.target.value === '' ? '' : Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="so_nguoi_phu_thuoc">Số người phụ thuộc</Label>
                <Input id="so_nguoi_phu_thuoc" type="number" min={0} value={form.so_nguoi_phu_thuoc}
                  onChange={e => setForm({ ...form, so_nguoi_phu_thuoc: e.target.value === '' ? '' : Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="so_tai_khoan">Số tài khoản</Label>
                <Input id="so_tai_khoan" value={form.so_tai_khoan}
                  onChange={e => setForm({ ...form, so_tai_khoan: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ten_ngan_hang">Ngân hàng</Label>
                <Input id="ten_ngan_hang" value={form.ten_ngan_hang}
                  onChange={e => setForm({ ...form, ten_ngan_hang: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ngay_vao_lam">Ngày vào làm</Label>
                <Input id="ngay_vao_lam" type="date" value={form.ngay_vao_lam}
                  onChange={e => setForm({ ...form, ngay_vao_lam: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Trạng thái</Label>
                <Select id="status" value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value as EmployeeStatus })}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ghi_chu">Ghi chú</Label>
              <Textarea id="ghi_chu" value={form.ghi_chu}
                onChange={e => setForm({ ...form, ghi_chu: e.target.value })} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenForm(false)}>Huỷ</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Đang lưu...' : (form.id ? 'Cập nhật' : 'Tạo mới')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
