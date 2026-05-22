/**
 * /logs — Nhật ký hoạt động (Module 5, phiên 8).
 *
 * Chỉ admin_he_thong xem được (RLS `logs_admin_select`). Trang liệt kê
 * activity_logs với filter (user CCCD, op insert/update/delete, entity_type,
 * range date) + paginate 50 dòng/lần + dialog xem chi tiết JSON old/new.
 *
 * Nguồn dữ liệu: trigger `trg_audit_<table>` từ migration 005/006 tự ghi
 * server-side, không có log nào từ client (v0.4.0).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Eye, History, RotateCw, Search, X } from 'lucide-react'
import { exportLogsToCsv } from '@/lib/excel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { fetchActivityLogs, type ActivityLogFilter } from '@/lib/api'
import {
  LOG_ENTITY_TYPES, LOG_OP_LABEL,
  parseLogAction, type ActivityLog,
} from '@/lib/types'

const PAGE_SIZE = 50

const OP_BADGE: Record<string, 'success' | 'info' | 'destructive' | 'secondary'> = {
  insert: 'success',
  update: 'info',
  delete: 'destructive',
}

const ENTITY_LABEL: Record<string, string> = {
  departments: 'Phòng ban',
  employees: 'Nhân viên',
  salary_config: 'Cấu hình lương',
  salary_grades: 'Ngạch / bậc',
  attendance_office: 'Chấm công VP',
  attendance_driver: 'Chấm công lái xe',
  attendance_security: 'Chấm công bảo vệ',
  attendance_technician: 'Chấm công kỹ thuật',
  salary_records: 'Bảng lương',
  users: 'Tài khoản',
}

interface FilterState {
  user_cccd: string
  entity_type: string
  op: '' | 'insert' | 'update' | 'delete'
  dateFrom: string
  dateTo: string
}

const EMPTY_FILTER: FilterState = {
  user_cccd: '',
  entity_type: '',
  op: '',
  dateFrom: '',
  dateTo: '',
}

function toApiFilter(f: FilterState): ActivityLogFilter {
  return {
    user_cccd: f.user_cccd.trim() || null,
    entity_type: f.entity_type || null,
    op: f.op || null,
    dateFrom: f.dateFrom || null,
    dateTo: f.dateTo || null,
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('vi-VN', { hour12: false })
}

function prettyJson(v: unknown): string {
  if (v === null || v === undefined) return '—'
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

export default function LogsPage() {
  // Filter "đang nhập" + "đã áp dụng" tách riêng để tránh re-fetch mỗi keystroke
  const [draftFilter, setDraftFilter] = useState<FilterState>(EMPTY_FILTER)
  const [appliedFilter, setAppliedFilter] = useState<FilterState>(EMPTY_FILTER)
  const [page, setPage] = useState(0) // 0-based
  const [rows, setRows] = useState<ActivityLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<ActivityLog | null>(null)
  const [exporting, setExporting] = useState(false)
  /** Trần số dòng xuất CSV trong 1 lần — tránh quá tải trình duyệt với DB lớn */
  const CSV_MAX_ROWS = 5000

  const load = useCallback(async (f: FilterState, p: number) => {
    setLoading(true)
    setError(null)
    try {
      const { rows: r, total: t } = await fetchActivityLogs(
        toApiFilter(f),
        { limit: PAGE_SIZE, offset: p * PAGE_SIZE },
      )
      setRows(r)
      setTotal(t)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được nhật ký.')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  // Lần đầu mở trang
  useEffect(() => {
    load(appliedFilter, page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Khi filter áp dụng hoặc page đổi
  useEffect(() => {
    load(appliedFilter, page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilter, page])

  const onApply = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(0)
    setAppliedFilter(draftFilter)
  }

  const onReset = () => {
    setDraftFilter(EMPTY_FILTER)
    setAppliedFilter(EMPTY_FILTER)
    setPage(0)
  }

  /**
   * Xuất CSV theo filter hiện đang ÁP DỤNG (không phụ thuộc vào trang đang xem).
   * Fetch tối đa CSV_MAX_ROWS dòng. Nếu total > limit, cảnh báo cho user biết
   * file chỉ chứa CSV_MAX_ROWS dòng mới nhất (vì query order DESC).
   */
  const onExportCsv = async () => {
    if (total === 0) {
      setError('Không có log phù hợp để xuất.')
      return
    }
    setExporting(true)
    setError(null)
    try {
      const limit = Math.min(total, CSV_MAX_ROWS)
      const { rows: all } = await fetchActivityLogs(
        toApiFilter(appliedFilter),
        { limit, offset: 0 },
      )
      exportLogsToCsv({
        rows: all,
        suffix: appliedFilter.entity_type
          || appliedFilter.op
          || (appliedFilter.user_cccd ? `cccd${appliedFilter.user_cccd}` : '')
          || 'all',
      })
      if (total > CSV_MAX_ROWS) {
        setError(`Đã xuất ${CSV_MAX_ROWS.toLocaleString('vi-VN')} log mới nhất (tổng filter: ${total.toLocaleString('vi-VN')}). Hãy thu hẹp filter để xuất phần còn lại.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xuất CSV thất bại.')
    } finally {
      setExporting(false)
    }
  }

  const lastPage = useMemo(() => Math.max(0, Math.ceil(total / PAGE_SIZE) - 1), [total])
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6 text-primary" /> Nhật ký hoạt động
        </h1>
        <p className="text-sm text-muted-foreground">
          Mọi thay đổi dữ liệu đều được Postgres trigger ghi tự động (audit server-side, migration 005/006).
          Chỉ admin hệ thống xem được trang này.
        </p>
      </div>

      {/* Filter bar */}
      <form
        onSubmit={onApply}
        className="rounded-lg border bg-card p-4 grid gap-3 md:grid-cols-6 items-end"
      >
        <div className="space-y-1 md:col-span-1">
          <Label htmlFor="f_cccd">CCCD người dùng</Label>
          <Input
            id="f_cccd"
            value={draftFilter.user_cccd}
            placeholder="Bắt đầu với..."
            onChange={(e) => setDraftFilter({ ...draftFilter, user_cccd: e.target.value })}
          />
        </div>

        <div className="space-y-1 md:col-span-1">
          <Label htmlFor="f_op">Hành động</Label>
          <Select
            id="f_op"
            value={draftFilter.op}
            onChange={(e) =>
              setDraftFilter({
                ...draftFilter,
                op: e.target.value as FilterState['op'],
              })
            }
          >
            <option value="">Tất cả</option>
            <option value="insert">Thêm mới</option>
            <option value="update">Cập nhật</option>
            <option value="delete">Xoá</option>
          </Select>
        </div>

        <div className="space-y-1 md:col-span-1">
          <Label htmlFor="f_entity">Loại dữ liệu</Label>
          <Select
            id="f_entity"
            value={draftFilter.entity_type}
            onChange={(e) => setDraftFilter({ ...draftFilter, entity_type: e.target.value })}
          >
            <option value="">Tất cả</option>
            {LOG_ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>{ENTITY_LABEL[t] ?? t}</option>
            ))}
          </Select>
        </div>

        <div className="space-y-1 md:col-span-1">
          <Label htmlFor="f_from">Từ ngày</Label>
          <Input
            id="f_from"
            type="date"
            value={draftFilter.dateFrom}
            onChange={(e) => setDraftFilter({ ...draftFilter, dateFrom: e.target.value })}
          />
        </div>

        <div className="space-y-1 md:col-span-1">
          <Label htmlFor="f_to">Đến ngày</Label>
          <Input
            id="f_to"
            type="date"
            value={draftFilter.dateTo}
            onChange={(e) => setDraftFilter({ ...draftFilter, dateTo: e.target.value })}
          />
        </div>

        <div className="flex gap-2 md:col-span-1">
          <Button type="submit" className="flex-1" disabled={loading}>
            <Search className="h-4 w-4 mr-1" /> Lọc
          </Button>
          <Button type="button" variant="outline" onClick={onReset} disabled={loading}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Lỗi</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Pagination header */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          {loading
            ? 'Đang tải...'
            : total === 0
              ? 'Không có log phù hợp.'
              : `${rangeStart.toLocaleString('vi-VN')}–${rangeEnd.toLocaleString('vi-VN')} / ${total.toLocaleString('vi-VN')} log`}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onExportCsv}
            disabled={loading || exporting || total === 0}
            title={`Xuất CSV (tối đa ${CSV_MAX_ROWS.toLocaleString('vi-VN')} dòng theo filter)`}
          >
            <Download className="h-3 w-3 mr-1" />
            {exporting ? 'Đang xuất...' : 'Xuất CSV'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => load(appliedFilter, page)}
            disabled={loading}
            title="Tải lại"
          >
            <RotateCw className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={loading || page === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs tabular-nums">
            Trang {page + 1} / {lastPage + 1}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
            disabled={loading || page >= lastPage}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-44">Thời gian</TableHead>
            <TableHead className="w-36">Người dùng</TableHead>
            <TableHead className="w-24">Hành động</TableHead>
            <TableHead>Loại dữ liệu</TableHead>
            <TableHead className="font-mono text-xs">Entity ID</TableHead>
            <TableHead className="text-right w-20">Chi tiết</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableEmpty colSpan={6}>Đang tải...</TableEmpty>
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={6} />
          ) : rows.map((log) => {
            const { op, table } = parseLogAction(log.action)
            const variant = OP_BADGE[op] ?? 'secondary'
            return (
              <TableRow key={log.id}>
                <TableCell className="text-xs tabular-nums whitespace-nowrap">
                  {formatDateTime(log.created_at)}
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap">
                  {log.user_cccd ?? <span className="text-muted-foreground italic">system</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={variant}>{LOG_OP_LABEL[op] ?? op}</Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {ENTITY_LABEL[log.entity_type ?? table] ?? log.entity_type ?? table ?? '—'}
                </TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">
                  {log.entity_id ? log.entity_id.slice(0, 8) + '…' : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDetail(log)}
                    title="Xem JSON old/new"
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {/* Chi tiết JSON */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent
          onClose={() => setDetail(null)}
          className="max-w-3xl"
        >
          <DialogHeader>
            <DialogTitle>Chi tiết log</DialogTitle>
            <DialogDescription>
              {detail && (
                <span className="block space-y-0.5">
                  <span className="block">
                    <strong>Thời gian:</strong>{' '}
                    <span className="font-mono">{formatDateTime(detail.created_at)}</span>
                  </span>
                  <span className="block">
                    <strong>CCCD:</strong>{' '}
                    <span className="font-mono">{detail.user_cccd ?? '—'}</span>
                    {' · '}
                    <strong>Action:</strong>{' '}
                    <span className="font-mono">{detail.action}</span>
                  </span>
                  <span className="block">
                    <strong>Entity:</strong>{' '}
                    <span className="font-mono">
                      {detail.entity_type ?? '—'} / {detail.entity_id ?? '—'}
                    </span>
                  </span>
                  {detail.ip_address && (
                    <span className="block">
                      <strong>IP:</strong> <span className="font-mono">{detail.ip_address}</span>
                    </span>
                  )}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1 min-w-0">
                <div className="text-xs font-semibold text-muted-foreground">Giá trị cũ</div>
                <pre className="rounded border bg-muted/30 p-2 text-[11px] leading-snug overflow-auto max-h-72 whitespace-pre-wrap break-all">
                  {prettyJson(detail.old_value)}
                </pre>
              </div>
              <div className="space-y-1 min-w-0">
                <div className="text-xs font-semibold text-muted-foreground">Giá trị mới</div>
                <pre className="rounded border bg-muted/30 p-2 text-[11px] leading-snug overflow-auto max-h-72 whitespace-pre-wrap break-all">
                  {prettyJson(detail.new_value)}
                </pre>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
