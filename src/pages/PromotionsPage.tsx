/**
 * /promotions — Quản lý nâng bậc TNVK (Module 5, phiên 11, v0.8.0).
 * v0.11.0: Thêm nâng bậc hàng loạt (checkbox chọn nhiều NV).
 *
 * Cho admin_luong + admin_he_thong:
 *  - Liệt kê NV sắp đến hạn nâng bậc trong N ngày tới (RULE-02).
 *    Nguồn: RPC `public.check_upcoming_promotions(p_days_ahead)` từ migration 008.
 *  - Slider chọn N (7 / 30 / 60 / 90 / 180 ngày).
 *  - Nút "Nâng bậc": confirm dialog → update employees.bac += 1 + ngay_huong_bac = today.
 *  - Badge màu theo độ khẩn: ≤7 ngày = đỏ; ≤30 = vàng; còn lại = xanh.
 *  - [v0.11.0] Checkbox chọn nhiều + nút "Nâng bậc đã chọn (N)" bulk action.
 *
 * RLS: function `check_upcoming_promotions` đã GRANT cho `authenticated`,
 *      bảng `employees` UPDATE đã có policy `employees_write_admin` (admin_luong + admin_he_thong).
 *      User thường không thấy menu này nhờ Sidebar filter; route guard cũng chặn.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowUp, Calendar, CheckSquare, RotateCw, TrendingUp } from 'lucide-react'
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

  // Single promote confirm dialog
  const [target, setTarget] = useState<UpcomingPromotionRow | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Bulk promote
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true); setError(null)
    setSelectedIds(new Set()) // reset selection on reload
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

  // ─── Checkbox helpers ───────────────────────────────────────────────────────

  const allSelected = rows.length > 0 && selectedIds.size === rows.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < rows.length

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map(r => r.employee_id)))
    }
  }

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Single promote ────────────────────────────────────────────────────────

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

  // ─── Bulk promote ──────────────────────────────────────────────────────────

  const selectedRows = useMemo(
    () => rows.filter(r => selectedIds.has(r.employee_id)),
    [rows, selectedIds],
  )

  const onConfirmBulkPromote = async () => {
    if (selectedRows.length === 0) return
    setBulkSubmitting(true); setError(null); setInfo(null)
    const ok: string[] = []
    const fail: string[] = []

    for (let i = 0; i < selectedRows.length; i++) {
      const r = selectedRows[i]
      setBulkProgress(`Đang xử lý ${i + 1}/${selectedRows.length}: ${r.ho_ten}…`)
      try {
        await promoteEmployee(r.employee_id)
        ok.push(r.ho_ten)
      } catch (err) {
        fail.push(`${r.ho_ten} (${err instanceof Error ? err.message : 'lỗi'})`)
      }
    }

    setBulkProgress(null)
    setBulkOpen(false)
    setBulkSubmitting(false)

    const parts: string[] = []
    if (ok.length > 0)   parts.push(`✓ Đã nâng bậc: ${ok.join(', ')}.`)
    if (fail.length > 0) parts.push(`✗ Thất bại: ${fail.join('; ')}.`)
    if (ok.length > 0) setInfo(parts.join('  '))
    else               setError(parts.join('  '))

    await reload()
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" /> Quản lý nâng bậc TNVK
        </h1>
        <p className="text-sm text-muted-foreground">
          Danh sách nhân viên đến hạn nâng bậc theo RULE-02 (<code>chu_ky_nang_bac_nam</code>{' '}
          của ngạch). Cron tự động chạy đầu mỗi tháng (job{' '}
          <code>v75_monthly_tnvk_promotion</code>) cảnh báo + recalc TNVK cho NV
          ở bậc cuối; trang này cho phép admin xử lý thủ công — từng NV hoặc hàng loạt.
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

        {/* Bulk promote button — chỉ hiện khi đã chọn ít nhất 1 */}
        {selectedIds.size > 0 && (
          <Button
            variant="default"
            onClick={() => setBulkOpen(true)}
            disabled={loading}
          >
            <CheckSquare className="mr-2 h-4 w-4" />
            Nâng bậc đã chọn ({selectedIds.size})
          </Button>
        )}

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
            {/* Checkbox chọn tất cả */}
            <TableHead className="w-10">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected }}
                onChange={toggleAll}
                disabled={loading || rows.length === 0}
                className="cursor-pointer"
                title={allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              />
            </TableHead>
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
            <TableEmpty colSpan={9}>Đang tải...</TableEmpty>
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={9}>
              Không có nhân viên nào đến hạn nâng bậc trong {daysAhead} ngày tới.
            </TableEmpty>
          ) : rows.map((r) => {
            const u = urgencyBadge(r.days_remaining)
            const checked = selectedIds.has(r.employee_id)
            return (
              <TableRow key={r.employee_id} className={checked ? 'bg-primary/5' : ''}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(r.employee_id)}
                    className="cursor-pointer"
                  />
                </TableCell>
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

      {/* Single confirm dialog */}
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

      {/* Bulk promote confirm dialog */}
      <Dialog open={bulkOpen} onOpenChange={(o) => { if (!o && !bulkSubmitting) setBulkOpen(false) }}>
        <DialogContent onClose={() => { if (!bulkSubmitting) setBulkOpen(false) }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              Xác nhận nâng bậc hàng loạt
            </DialogTitle>
            <DialogDescription>
              Hệ thống sẽ nâng bậc tuần tự cho {selectedRows.length} nhân viên đã chọn.
              Mỗi NV: <code>bac += 1</code>, <code>ngay_huong_bac = hôm nay</code>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Danh sách NV được chọn */}
            <div className="rounded-md border overflow-auto max-h-48">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b">
                    <th className="text-left px-3 py-1.5 font-medium">Họ tên</th>
                    <th className="text-left px-3 py-1.5 font-medium">Ngạch / Bậc hiện tại → Mới</th>
                    <th className="text-right px-3 py-1.5 font-medium">Còn lại</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRows.map((r) => (
                    <tr key={r.employee_id} className="border-b last:border-0">
                      <td className="px-3 py-1.5">{r.ho_ten}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {r.ngach_code} / bậc <strong>{r.bac}</strong>{' → '}
                        <span className="text-green-600 font-semibold">{r.bac + 1}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <span className={r.days_remaining <= 7 ? 'text-destructive font-bold' : ''}>
                          {r.days_remaining}d
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {bulkProgress && (
              <p className="text-sm text-muted-foreground animate-pulse">{bulkProgress}</p>
            )}

            <Alert variant="warning">
              <AlertTitle>Lưu ý</AlertTitle>
              <AlertDescription>
                Thao tác <strong>không thể hoàn tác qua UI</strong>. Nếu có NV nào thất bại
                (ví dụ đã ở bậc cuối), hệ thống sẽ bỏ qua NV đó và báo cáo sau khi hoàn tất.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkOpen(false)}
              disabled={bulkSubmitting}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              onClick={onConfirmBulkPromote}
              disabled={bulkSubmitting}
            >
              {bulkSubmitting
                ? 'Đang xử lý...'
                : `Xác nhận nâng bậc ${selectedRows.length} NV`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
