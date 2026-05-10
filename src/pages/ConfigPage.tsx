import { useEffect, useState } from 'react'
import { Calculator, Plus, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { createSalaryConfig, listSalaryConfigs } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { fmtVND, formatDateTime } from '@/lib/utils'
import type { SalaryConfig } from '@/lib/types'

interface FormState {
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
  note: string
}

const DEFAULT_FORM: FormState = {
  effective_date: new Date().toISOString().slice(0, 10),
  luong_co_so: 2340000,
  tien_an_trua_max: 730000,
  giam_tru_ban_than: 11000000,
  giam_tru_phu_thuoc: 4400000,
  ty_le_bh_nld: 10.5,
  ty_le_bh_dv: 21.5,
  ty_le_cong_doan_phi: 1,
  so_ngay_cong_chuan: 22,
  he_so_lam_dem: 1.30,
  don_gia_km_lai_xe: 1500,
  don_gia_an_trua_ngay: 35000,
  note: '',
}

export default function ConfigPage() {
  const { hasRole, profile } = useAuth()
  const canEdit = hasRole('admin_he_thong')

  const [items, setItems] = useState<SalaryConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openForm, setOpenForm] = useState(false)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [submitting, setSubmitting] = useState(false)

  const reload = async () => {
    setLoading(true); setError(null)
    try {
      const data = await listSalaryConfigs()
      setItems(data)
      // Prefill form từ bản mới nhất
      if (data.length > 0) {
        const latest = data[0]
        setForm(prev => ({
          ...prev,
          luong_co_so: Number(latest.luong_co_so),
          tien_an_trua_max: Number(latest.tien_an_trua_max),
          giam_tru_ban_than: Number(latest.giam_tru_ban_than),
          giam_tru_phu_thuoc: Number(latest.giam_tru_phu_thuoc),
          ty_le_bh_nld: Number(latest.ty_le_bh_nld),
          ty_le_bh_dv: Number(latest.ty_le_bh_dv),
          ty_le_cong_doan_phi: Number(latest.ty_le_cong_doan_phi),
          so_ngay_cong_chuan: latest.so_ngay_cong_chuan,
          he_so_lam_dem: Number(latest.he_so_lam_dem),
          don_gia_km_lai_xe: Number(latest.don_gia_km_lai_xe),
          don_gia_an_trua_ngay: Number(latest.don_gia_an_trua_ngay),
        }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được cấu hình.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true); setError(null)
    try {
      if (!form.effective_date) throw new Error('Ngày hiệu lực là bắt buộc.')
      // Cảnh báo nếu effective_date trùng version cũ
      if (items.some(c => c.effective_date === form.effective_date)) {
        if (!confirm('Đã có bản cấu hình cùng ngày hiệu lực. Vẫn thêm bản mới?')) {
          setSubmitting(false); return
        }
      }
      await createSalaryConfig({
        ...form,
        note: form.note || null,
        created_by: profile?.user.id ?? null,
      })
      setOpenForm(false)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lưu cấu hình thất bại.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" /> Cấu hình lương (versioned)
          </h1>
          <p className="text-sm text-muted-foreground">
            RULE-04: lưu lịch sử mọi lần thay đổi tham số. Version áp dụng = bản có effective_date lớn nhất ≤ tháng tính.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setOpenForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Thêm bản cấu hình
          </Button>
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
            <TableHead>Hiệu lực</TableHead>
            <TableHead>Lương cơ sở</TableHead>
            <TableHead>Ăn trưa max</TableHead>
            <TableHead>GT bản thân / phụ thuộc</TableHead>
            <TableHead>BH NLĐ / ĐV / CĐ</TableHead>
            <TableHead>Đơn giá KM</TableHead>
            <TableHead>Tạo lúc</TableHead>
            <TableHead>Ghi chú</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableEmpty colSpan={8}>Đang tải...</TableEmpty>
          ) : items.length === 0 ? (
            <TableEmpty colSpan={8} />
          ) : items.map((c, idx) => (
            <TableRow key={c.id}>
              <TableCell className="font-mono text-xs">
                {c.effective_date}
                {idx === 0 && <Badge className="ml-2" variant="success">Mới nhất</Badge>}
              </TableCell>
              <TableCell className="font-mono text-xs">{fmtVND(Number(c.luong_co_so))}</TableCell>
              <TableCell className="font-mono text-xs">{fmtVND(Number(c.tien_an_trua_max))}</TableCell>
              <TableCell className="font-mono text-xs">
                {fmtVND(Number(c.giam_tru_ban_than))} / {fmtVND(Number(c.giam_tru_phu_thuoc))}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {Number(c.ty_le_bh_nld)}% / {Number(c.ty_le_bh_dv)}% / {Number(c.ty_le_cong_doan_phi)}%
              </TableCell>
              <TableCell className="font-mono text-xs">
                {fmtVND(Number(c.don_gia_km_lai_xe))}/km
              </TableCell>
              <TableCell className="text-xs">{formatDateTime(c.created_at)}</TableCell>
              <TableCell className="text-xs max-w-xs truncate">{c.note ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent onClose={() => setOpenForm(false)} className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" /> Thêm bản cấu hình lương
            </DialogTitle>
            <DialogDescription>
              Tạo bản mới — không sửa bản cũ (audit trail). Hệ thống sẽ áp dụng từ effective_date trở đi.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2 md:col-span-1">
                <Label htmlFor="effective_date">Ngày hiệu lực *</Label>
                <Input id="effective_date" type="date" value={form.effective_date}
                  onChange={e => setForm({ ...form, effective_date: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="luong_co_so">Lương cơ sở (VNĐ)</Label>
                <Input id="luong_co_so" type="number" min={0} value={form.luong_co_so}
                  onChange={e => setForm({ ...form, luong_co_so: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tien_an_trua_max">Tiền ăn trưa max</Label>
                <Input id="tien_an_trua_max" type="number" min={0} value={form.tien_an_trua_max}
                  onChange={e => setForm({ ...form, tien_an_trua_max: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="giam_tru_ban_than">Giảm trừ bản thân</Label>
                <Input id="giam_tru_ban_than" type="number" min={0} value={form.giam_tru_ban_than}
                  onChange={e => setForm({ ...form, giam_tru_ban_than: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="giam_tru_phu_thuoc">Giảm trừ phụ thuộc</Label>
                <Input id="giam_tru_phu_thuoc" type="number" min={0} value={form.giam_tru_phu_thuoc}
                  onChange={e => setForm({ ...form, giam_tru_phu_thuoc: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="so_ngay_cong_chuan">Số ngày công chuẩn</Label>
                <Input id="so_ngay_cong_chuan" type="number" min={1} value={form.so_ngay_cong_chuan}
                  onChange={e => setForm({ ...form, so_ngay_cong_chuan: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ty_le_bh_nld">% BH NLĐ</Label>
                <Input id="ty_le_bh_nld" type="number" step="0.01" value={form.ty_le_bh_nld}
                  onChange={e => setForm({ ...form, ty_le_bh_nld: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ty_le_bh_dv">% BH đơn vị</Label>
                <Input id="ty_le_bh_dv" type="number" step="0.01" value={form.ty_le_bh_dv}
                  onChange={e => setForm({ ...form, ty_le_bh_dv: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ty_le_cong_doan_phi">% Công đoàn phí</Label>
                <Input id="ty_le_cong_doan_phi" type="number" step="0.01" value={form.ty_le_cong_doan_phi}
                  onChange={e => setForm({ ...form, ty_le_cong_doan_phi: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="he_so_lam_dem">Hệ số làm đêm</Label>
                <Input id="he_so_lam_dem" type="number" step="0.01" value={form.he_so_lam_dem}
                  onChange={e => setForm({ ...form, he_so_lam_dem: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="don_gia_km_lai_xe">Đơn giá KM lái xe</Label>
                <Input id="don_gia_km_lai_xe" type="number" step="1" value={form.don_gia_km_lai_xe}
                  onChange={e => setForm({ ...form, don_gia_km_lai_xe: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="don_gia_an_trua_ngay">Đơn giá ăn trưa/ngày</Label>
                <Input id="don_gia_an_trua_ngay" type="number" step="1" value={form.don_gia_an_trua_ngay}
                  onChange={e => setForm({ ...form, don_gia_an_trua_ngay: Number(e.target.value) })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Ghi chú</Label>
              <Textarea id="note" value={form.note}
                onChange={e => setForm({ ...form, note: e.target.value })}
                placeholder="Lý do điều chỉnh, văn bản căn cứ..." />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenForm(false)}>Huỷ</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Đang lưu...' : 'Tạo bản mới'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
