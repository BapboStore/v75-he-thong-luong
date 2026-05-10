import { useEffect, useMemo, useState } from 'react'
import { Building2, CheckCircle2, Pencil, Plus, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  createDepartment, listDepartments, setDepartmentActive, updateDepartment,
} from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import {
  DEPT_TYPE_LABEL, type Department, type DepartmentSalaryType,
} from '@/lib/types'

interface FormState {
  id?: string
  code: string
  name: string
  parent_id: string | ''
  salary_type: DepartmentSalaryType
}

const EMPTY: FormState = { code: '', name: '', parent_id: '', salary_type: 'hanh_chinh' }

export default function DepartmentsPage() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('admin_he_thong')

  const [items, setItems] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openForm, setOpenForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitting, setSubmitting] = useState(false)

  const reload = async () => {
    setLoading(true); setError(null)
    try {
      const data = await listDepartments()
      setItems(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được phòng ban.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const parentMap = useMemo(() => {
    const m = new Map<string, Department>()
    for (const d of items) m.set(d.id, d)
    return m
  }, [items])

  const onAdd = () => { setForm(EMPTY); setOpenForm(true) }
  const onEdit = (d: Department) => {
    setForm({
      id: d.id, code: d.code, name: d.name,
      parent_id: d.parent_id ?? '',
      salary_type: d.salary_type,
    })
    setOpenForm(true)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true); setError(null)
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        parent_id: form.parent_id || null,
        salary_type: form.salary_type,
        is_active: true,
      }
      if (!payload.code || !payload.name) throw new Error('Mã và tên phòng ban là bắt buộc.')
      if (form.id) {
        await updateDepartment(form.id, payload)
      } else {
        await createDepartment(payload)
      }
      setOpenForm(false)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lưu phòng ban thất bại.')
    } finally {
      setSubmitting(false)
    }
  }

  const onToggle = async (d: Department) => {
    if (!confirm(`Bạn có chắc muốn ${d.is_active ? 'vô hiệu hoá' : 'kích hoạt'} phòng ban "${d.name}"?`)) return
    try {
      await setDepartmentActive(d.id, !d.is_active)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đổi được trạng thái.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" /> Phòng ban
          </h1>
          <p className="text-sm text-muted-foreground">Quản lý cây phòng ban và loại bảng lương.</p>
        </div>
        {canEdit && (
          <Button onClick={onAdd}><Plus className="h-4 w-4 mr-1" /> Thêm phòng ban</Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Lỗi</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã</TableHead>
            <TableHead>Tên</TableHead>
            <TableHead>Phòng cha</TableHead>
            <TableHead>Loại lương</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableEmpty colSpan={6}>Đang tải...</TableEmpty>
          ) : items.length === 0 ? (
            <TableEmpty colSpan={6} />
          ) : items.map(d => (
            <TableRow key={d.id} className={d.is_active ? '' : 'opacity-60'}>
              <TableCell className="font-mono text-xs">{d.code}</TableCell>
              <TableCell className="font-medium">{d.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {d.parent_id ? (parentMap.get(d.parent_id)?.name ?? '—') : '—'}
              </TableCell>
              <TableCell>
                <Badge variant="info">{DEPT_TYPE_LABEL[d.salary_type]}</Badge>
              </TableCell>
              <TableCell>
                {d.is_active
                  ? <Badge variant="success">Hoạt động</Badge>
                  : <Badge variant="secondary">Đã ngừng</Badge>}
              </TableCell>
              <TableCell className="text-right">
                {canEdit && (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => onEdit(d)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant={d.is_active ? 'destructive' : 'secondary'}
                      onClick={() => onToggle(d)}
                    >
                      {d.is_active ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent onClose={() => setOpenForm(false)}>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Cập nhật phòng ban' : 'Thêm phòng ban'}</DialogTitle>
            <DialogDescription>
              Mã phòng ban viết HOA, không trùng. Loại lương quyết định mẫu chấm công áp dụng.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="code">Mã *</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value })}
                  required
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary_type">Loại lương *</Label>
                <Select
                  id="salary_type"
                  value={form.salary_type}
                  onChange={e => setForm({ ...form, salary_type: e.target.value as DepartmentSalaryType })}
                >
                  <option value="hanh_chinh">{DEPT_TYPE_LABEL.hanh_chinh}</option>
                  <option value="lai_xe">{DEPT_TYPE_LABEL.lai_xe}</option>
                  <option value="bao_ve_ky_thuat">{DEPT_TYPE_LABEL.bao_ve_ky_thuat}</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Tên phòng ban *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parent_id">Phòng ban cha</Label>
              <Select
                id="parent_id"
                value={form.parent_id}
                onChange={e => setForm({ ...form, parent_id: e.target.value })}
              >
                <option value="">— Không có —</option>
                {items
                  .filter(d => d.is_active && d.id !== form.id)
                  .map(d => <option key={d.id} value={d.id}>{d.code} – {d.name}</option>)}
              </Select>
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
