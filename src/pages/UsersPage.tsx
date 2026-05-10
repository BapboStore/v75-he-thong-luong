import { useEffect, useMemo, useState } from 'react'
import { Pencil, RotateCcw, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  listDepartments, listEmployees, listUsers, updateUserRow,
} from '@/lib/api'
import {
  ROLE_LABEL,
  type AppUser, type Department, type EmployeeFull, type UserRole,
} from '@/lib/types'

const ROLES: UserRole[] = ['user', 'truong_phong', 'admin_luong', 'admin_he_thong']

interface FormState {
  id: string
  cccd: string
  role: UserRole
  department_id: string
  is_active: boolean
  must_change_password: boolean
}

interface UserEditFormProps {
  form: FormState
  setForm: (f: FormState) => void
  departments: Department[]
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
  submitting: boolean
}

function UserEditForm({ form, setForm, departments, onClose, onSubmit, submitting }: UserEditFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Select id="role" value={form.role}
          onChange={e => setForm({ ...form, role: e.target.value as UserRole })}>
          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="department_id">Phòng ban (cho truong_phong / user)</Label>
        <Select id="department_id" value={form.department_id}
          onChange={e => setForm({ ...form, department_id: e.target.value })}>
          <option value="">—</option>
          {departments.filter(d => d.is_active).map(d => (
            <option key={d.id} value={d.id}>{d.code} – {d.name}</option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <input id="is_active" type="checkbox" checked={form.is_active}
          onChange={e => setForm({ ...form, is_active: e.target.checked })} />
        <Label htmlFor="is_active" className="cursor-pointer">Tài khoản hoạt động</Label>
      </div>

      <div className="flex items-center gap-2">
        <input id="must_change_password" type="checkbox" checked={form.must_change_password}
          onChange={e => setForm({ ...form, must_change_password: e.target.checked })} />
        <Label htmlFor="must_change_password" className="cursor-pointer">Bắt đổi mật khẩu lần đăng nhập kế tiếp</Label>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Huỷ</Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Đang lưu...' : 'Cập nhật'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [employees, setEmployees] = useState<EmployeeFull[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openForm, setOpenForm] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const reload = async () => {
    setLoading(true); setError(null)
    try {
      const [u, e, d] = await Promise.all([
        listUsers(),
        listEmployees({}),
        listDepartments(),
      ])
      setUsers(u); setEmployees(e); setDepartments(d)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách user.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const empByCccd = useMemo(() => {
    const m = new Map<string, EmployeeFull>()
    for (const e of employees) m.set(e.cccd, e)
    return m
  }, [employees])

  const deptMap = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments])

  const onEdit = (u: AppUser) => {
    setForm({
      id: u.id,
      cccd: u.cccd,
      role: u.role,
      department_id: u.department_id ?? '',
      is_active: u.is_active,
      must_change_password: u.must_change_password,
    })
    setOpenForm(true)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setSubmitting(true); setError(null)
    try {
      await updateUserRow(form.id, {
        role: form.role,
        department_id: form.department_id || null,
        is_active: form.is_active,
        must_change_password: form.must_change_password,
      })
      setOpenForm(false)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lưu user thất bại.')
    } finally {
      setSubmitting(false)
    }
  }

  const onResetLockout = async (u: AppUser) => {
    try {
      await updateUserRow(u.id, { failed_attempts: 0, locked_until: null })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset khoá thất bại.')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Tài khoản &amp; Phân quyền
        </h1>
        <p className="text-sm text-muted-foreground">
          Chỉ admin_he_thong. Reset mật khẩu / tạo user mới chạy qua script <code>supabase/scripts/seed-users.mjs</code> ở phía server.
        </p>
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
            <TableHead>CCCD</TableHead>
            <TableHead>Họ tên</TableHead>
            <TableHead>Phòng ban</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Đăng nhập sai</TableHead>
            <TableHead>Bắt đổi MK</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableEmpty colSpan={8}>Đang tải...</TableEmpty>
          ) : users.length === 0 ? (
            <TableEmpty colSpan={8} />
          ) : users.map(u => {
            const emp = empByCccd.get(u.cccd)
            const lockText = u.locked_until && new Date(u.locked_until) > new Date()
              ? `Khoá đến ${new Date(u.locked_until).toLocaleTimeString('vi-VN')}`
              : `${u.failed_attempts} lần`
            return (
              <TableRow key={u.id}>
                <TableCell className="font-mono text-xs">{u.cccd}</TableCell>
                <TableCell className="font-medium">{emp?.ho_ten ?? '—'}</TableCell>
                <TableCell className="text-sm">
                  {u.department_id ? (deptMap.get(u.department_id)?.name ?? '—') : '—'}
                </TableCell>
                <TableCell>
                  <Badge variant={u.role === 'admin_he_thong' ? 'destructive' : 'info'}>
                    {ROLE_LABEL[u.role]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {u.is_active
                    ? <Badge variant="success">Hoạt động</Badge>
                    : <Badge variant="secondary">Vô hiệu</Badge>}
                </TableCell>
                <TableCell className="text-xs">{lockText}</TableCell>
                <TableCell>
                  {u.must_change_password
                    ? <Badge variant="warning">Có</Badge>
                    : <Badge variant="secondary">Không</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {(u.failed_attempts > 0 || u.locked_until) && (
                      <Button size="sm" variant="outline" onClick={() => onResetLockout(u)} title="Reset khoá tài khoản">
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => onEdit(u)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent onClose={() => setOpenForm(false)}>
          <DialogHeader>
            <DialogTitle>Cập nhật tài khoản {form?.cccd}</DialogTitle>
            <DialogDescription>
              Đổi role, phòng ban, kích hoạt/vô hiệu hoá hoặc bắt buộc đổi mật khẩu lần sau.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <UserEditForm
              form={form}
              setForm={setForm as (f: FormState) => void}
              departments={departments}
              onClose={() => setOpenForm(false)}
              onSubmit={onSubmit}
              submitting={submitting}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
