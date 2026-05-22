/**
 * /promotions — Quản lý nâng bậc TNVK (Module 5, phiên 11, v0.8.0).
 *
 * Cho admin_luong + admin_he_thong:
 *  - Liệt kê NV sắp đến hạn nâng bậc trong N ngày tới (RULE-02).
 *    Nguồn: RPC `public.check_upcoming_promotions(p_days_ahead)` từ migration 008.
 *  - Slider chọn N (7 / 30 / 60 / 90 / 180 ngày).
 *  - Nút "Nâng bậc": confirm dialog → update employees.bac += 1 + ngay_huong_bac = today.
 *  - Badge màu theo độ khẩn: ≤7 ngày = đỏ; ≤30 = vàng; còn lại = xanh.
 *
 * RLS: function `check_upcoming_promotions` đã GRANT cho `authenticated`,
 *      bảng `employees` UPDATE đã có policy `employees_write_admin` (admin_luong + admin_he_thong).
 *      User thường không thấy menu này nhờ Sidebar filter; route guard cũng chặn.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowUp, Calendar, RotateCw, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  listUpcomingPromotions, promoteEmployee, type UpcomingPromotionRow,
} from '@/lib/api'

const DAYS_OPTIONS = [7, 30, 60, 90, 180] as const

function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('vi-VN')
}

function urgencyBadge(daysRemaining: number): { variant: 'destructive' | 'warning' | 'info'; label: string } {
  if (daysRemaining <= 7)  return { variant: 'destructive', label: 'Khẩn (≤7 ngày)' }
  if (daysRemaining <= 30) return { variant: 'warning',     label: 'Sắp đến (≤30 ngày)' }
  return { variant: 'info', label: 'Theo dõi' }
}

export default function PromotionsPage() {
  const [daysAhead, setDaysAhead] = useState<number>(30)
  const [rows, setRows] = useState<UpcomingPromotionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Confirm dialog
  const [target, setTarget] = useState<UpcomingPromotionRow | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await listUpcomingPromotions(daysAhead)
      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách nâng bậc.')
    } finally {
      setLoading(false)
    }
  }, [daysAhead])

  useEffect(() => { reload() }, [reload])

  const summary = useMemo(() => {
    const urgent = rows.filter(r => r.days_remaining <= 7).length
    const soon   = rows.filter(r => r.days_remaining > 7 && r.days_remaining <= 30).length
    const later  = rows.length - urgent - soon
    return { urgent, soon, later, total: rows.length }
  }, [rows])

  const onConfirmPromote = async () => {
    if (!target) return
    setSubmitting(true); setError(null); setInfo(null)
    try {
      const updated = await promoteEmployee(target.employee_id)
      setInfo(
        `Đã nâng bậc cho ${updated.ho_ten}: bậc ${target.bac} → ${updated.bac}. ` +
        `Ngày hưởng bậc mới = hôm nay.`,
      )
      setTarget(null)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nâng bậc thất bại.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" /> Quản lý nâng bậc TNVK
        </h1>
        <p className="text-sm text-muted-foreground">
          Danh sách nhân viên đến hạn nâng bậc theo RULE-02 (`chu_ky_nang_bac_nam`
          của ngạch). Cron tự động chạy đầu mỗi tháng (job{' '}
          <code>v75_monthly_tnvk_promotion</code>) cảnh báo + recalc TNVK cho NV
          ở bậc cuối; trang này cho phép admin xử lý thủ công.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Lỗi</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {info && (
        <Alert variant="success">
          <AlertTitle>Thành công</AlertTitle>
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      )}

      {/* Filter bar + summary */}
      <div className="flex flex-wrap items-end gap-4 rounded-md border bg-card p-4">
        <div className="space-y-1">
          <Label htmlFor="days_ahead">Khoảng thời gian cảnh báo</Label>
          <Select
            id="days_ahead"
            value={String(daysAhead)}
            onChange={(e) => setDaysAhead(Number(e.target.value))}
            className="w-48"
          >
            {DAYS_OPTIONS.map((d) => (
              <option key={d} value={d}>{d} ngày tới</option>
            ))}
          </Select>
        </div>

        <Button variant="outline" onClick={reload} disabled={loading}>
          <RotateCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Tải lại
        </Button>

        <div className="ml-auto flex items-center gap-2 text-sm">
          <Badge variant="destructive">Khẩn: {summary.urgent}</Badge>
          <Badge variant="warning">Sắp đến: {summary.soon}</Badge>
          <Badge variant="info">Theo dõi: {summary.later}</Badge>
          <span className="text-muted-foreground">Tổng {summary.total} NV</span>
        </div>
      </div>

      {/* Bảng */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>CCCD</TableHead>
            <TableHead>Họ tên</TableHead>
            <TableHead>Ngạch / Bậc</TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Bắt đầu bậc hiện tại
              </span>
            </TableHead>
            <TableHead>Đến hạn nâng bậc</TableHead>
            <TableHead className="text-center">Còn lại</TableHead>
            <TableHead className="text-center">Trạng thái</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableEmpty colSpan={8}>Đang tải...</TableEmpty>
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={8}>
              Không có nhân viên nào đến hạn nâng bậc trong {daysAhead} ngày tới.
            </TableEmpty>
          ) : rows.map((r) => {
            const u = urgencyBadge(r.days_remaining)
            return (
              <TableRow key={r.employee_id}>
                <TableCell className="font-mono text-xs">{r.cccd}</TableCell>
                <TableCell className="font-medium">{r.ho_ten}</TableCell>
                <TableCell className="text-sm">
                  {r.ngach_code} / <span className="font-semibold">bậc {r.bac}</span>
                </TableCell>
                <TableCell className="text-sm">{formatDate(r.ngay_huong_bac)}</TableCell>
                <TableCell className="text-sm font-medium">{formatDate(r.next_promotion_date)}</TableCell>
                <TableCell className="text-center">
                  <span className={r.days_remaining <= 7 ? 'text-destructive font-bold' : 'font-medium'}>
                    {r.days_remaining} ngày
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={u.variant}>{u.label}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" onClick={() => setTarget(r)} title="Nâng bậc cho NV này">
                    <ArrowUp className="mr-1 h-3 w-3" />
                    Nâng bậc
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {/* Confirm dialog */}
      <Dialog open={target !== null} onOpenChange={(o) => { if (!o) setTarget(null) }}>
        <DialogContent onClose={() => setTarget(null)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUp className="h-5 w-5 text-primary" /> Xác nhận nâng bậc
            </DialogTitle>
            <DialogDescription>
              Hệ thống sẽ cập nhật bậc mới và ngày hưởng bậc cho NV này.
              Hành động được ghi vào nhật ký (audit trigger).
            </DialogDescription>
          </DialogHeader>

          {target && (
            <div className="space-y-3 py-2">
              <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                <div><span className="text-muted-foreground">Họ tên:</span> <strong>{target.ho_ten}</strong></div>
                <div><span className="text-muted-foreground">CCCD:</span> <code>{target.cccd}</code></div>
                <div><span className="text-muted-foreground">Ngạch:</span> {target.ngach_code}</div>
                <div>
                  <span className="text-muted-foreground">Bậc:</span>{' '}
                  <Badge variant="secondary">{target.bac}</Badge>
                  {' → '}
                  <Badge variant="success">{target.bac + 1}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Ngày hưởng bậc mới:</span>{' '}
                  <strong>{new Date().toLocaleDateString('vi-VN')}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Bậc cũ bắt đầu:</span>{' '}
                  {formatDate(target.ngay_huong_bac)} ({target.days_remaining} ngày trước hạn)
                </div>
              </div>

              <Alert variant="warning">
                <AlertTitle>Lưu ý</AlertTitle>
                <AlertDescription>
                  Việc nâng bậc <strong>không thể hoàn tác qua UI</strong>.
                  Nếu nhầm, phải sửa trực tiếp ở trang Nhân viên hoặc Supabase SQL Editor.
                </AlertDescription>
              </Alert>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTarget(null)} disabled={submitting}>
              Huỷ
            </Button>
            <Button type="button" onClick={onConfirmPromote} disabled={submitting}>
              {submitting ? 'Đang nâng bậc...' : 'Xác nhận nâng bậc'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
