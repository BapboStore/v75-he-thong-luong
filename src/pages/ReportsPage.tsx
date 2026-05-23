/**
 * /reports -- Bao cao tong hop luong (Module 6, phien 15, v0.11.0).
 *
 * Cho admin_luong + admin_he_thong:
 *  - Filter: ky luong (thang/nam) + trang thai ban luong.
 *  - 4 KPI cards: Tong NV, Tong qui luong, Tong thue TNCN, Tong thuc linh.
 *  - Bieu do cot recharts: Thuc linh + Thue TNCN + BHXH NLD theo phong ban.
 *  - Bang tong hop theo phong ban voi cac cot so tien chinh.
 *  - Nut Xuat Excel tong hop (2 sheet: Tong hop + Chi tiet NV).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Download, RotateCw, TrendingUp, Users, Wallet,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { fetchSalaryReport, listDepartments } from '@/lib/api'
import { exportSalaryReportToExcel, type DeptSummaryRow } from '@/lib/excel'
import type { Department, SalaryRecord, SalaryRecordStatus } from '@/lib/types'
import { SR_STATUS_LABEL } from '@/lib/types'

// helpers

function currentMonthYear(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function monthOptions(): string[] {
  const opts: string[] = []
  const d = new Date()
  for (let i = 0; i < 24; i++) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    opts.push(`${y}-${m}`)
    d.setMonth(d.getMonth() - 1)
  }
  return opts
}

function fmtMoney(v: number): string {
  return v.toLocaleString('vi-VN') + ' đ'
}

function fmtMoneyShort(v: number): string {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + ' ỷ'
  if (v >= 1_000_000)     return (v / 1_000_000).toFixed(1) + ' tr'
  if (v >= 1_000)         return (v / 1_000).toFixed(0) + 'k'
  return String(v)
}

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const STATUS_OPTIONS: Array<{ value: '' | SalaryRecordStatus; label: string }> = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'approved', label: SR_STATUS_LABEL.approved },
  { value: 'pending',  label: SR_STATUS_LABEL.pending },
  { value: 'draft',    label: SR_STATUS_LABEL.draft },
  { value: 'cancelled', label: SR_STATUS_LABEL.cancelled },
]

// KPI Card sub-component

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: string
  unit?: string
  bg?: string
  highlight?: boolean
}

function KpiCard({ icon, label, value, unit, bg = 'bg-card', highlight }: KpiCardProps) {
  return (
    <div className={`rounded-lg border p-4 ${bg}`}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-bold ${highlight ? 'text-primary' : ''}`}>{value}</div>
      {unit && (
        <div className="text-xs text-muted-foreground mt-0.5 truncate" title={unit}>{unit}</div>
      )}
    </div>
  )
}

// Main page

export default function ReportsPage() {
  const [monthYear, setMonthYear] = useState(currentMonthYear)
  const [statusFilter, setStatusFilter] = useState<'' | SalaryRecordStatus>('')
  const [records, setRecords] = useState<SalaryRecord[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const deptMap = useMemo<Map<string, Department>>(() => {
    const m = new Map<string, Department>()
    departments.forEach(d => m.set(d.id, d))
    return m
  }, [departments])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [recs, depts] = await Promise.all([
        fetchSalaryReport(monthYear, statusFilter || null),
        departments.length === 0 ? listDepartments() : Promise.resolve(departments),
      ])
      setRecords(recs)
      if (departments.length === 0) setDepartments(depts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được báo cáo.')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthYear, statusFilter])

  useEffect(() => { load() }, [load])

  const summaries = useMemo<DeptSummaryRow[]>(() => {
    const byDept = new Map<string, SalaryRecord[]>()
    for (const r of records) {
      const arr = byDept.get(r.department_id) ?? []
      arr.push(r)
      byDept.set(r.department_id, arr)
    }
    const rows: DeptSummaryRow[] = []
    byDept.forEach((recs, deptId) => {
      const dept = deptMap.get(deptId)
      rows.push({
        deptId,
        deptName: dept?.name ?? deptId,
        deptCode: dept?.code ?? deptId,
        soNV:          recs.length,
        tongChiuThue:  recs.reduce((s, r) => s + num(r.tong_chiu_thue), 0),
        tongKhongCT:   recs.reduce((s, r) => s + num(r.tong_khong_ct),  0),
        tongTrichNLD:  recs.reduce((s, r) => s + num(r.trich_nld),      0),
        tongCDP:       recs.reduce((s, r) => s + num(r.cdp),            0),
        tongThueTNCN:  recs.reduce((s, r) => s + num(r.thue_tncn),      0),
        tongTruyLinh:  recs.reduce((s, r) => s + num(r.truy_linh),      0),
        tongTruyThu:   recs.reduce((s, r) => s + num(r.truy_thu),       0),
        tongThucLinh:  recs.reduce((s, r) => s + num(r.thuc_linh),      0),
      })
    })
    return rows.sort((a, b) => a.deptCode.localeCompare(b.deptCode))
  }, [records, deptMap])

  const totals = useMemo(() => ({
    soNV:         summaries.reduce((s, r) => s + r.soNV, 0),
    tongQuiLuong: summaries.reduce((s, r) => s + r.tongChiuThue + r.tongKhongCT, 0),
    tongThueTNCN: summaries.reduce((s, r) => s + r.tongThueTNCN, 0),
    tongThucLinh: summaries.reduce((s, r) => s + r.tongThucLinh, 0),
  }), [summaries])

  const chartData = useMemo(() =>
    summaries.map((s) => ({
      name: s.deptCode.length > 8 ? s.deptCode.slice(0, 8) + '…' : s.deptCode,
      fullName: s.deptName,
      'Thực lĩnh': Math.round(s.tongThucLinh / 1_000_000),
      'Thuế TNCN':      Math.round(s.tongThueTNCN / 1_000_000),
      'BHXH NLĐ':      Math.round(s.tongTrichNLD / 1_000_000),
    })),
  [summaries])

  const MONTH_OPTIONS = useMemo(monthOptions, [])

  const onExport = async () => {
    if (summaries.length === 0) return
    setExporting(true); setError(null)
    try {
      exportSalaryReportToExcel({ summaries, records, monthYear })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xuất Excel thất bại.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" /> Báo cáo tổng hợp lương
        </h1>
        <p className="text-sm text-muted-foreground">
          Tổng hợp bảng lương theo phòng ban cho một kỳ.
          Chọn tháng và bộ lọc trạng thái, sau đó xem biểu đồ và bảng chi tiết hoặc xuất Excel.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Lỗi</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-4 rounded-md border bg-card p-4">
        <div className="space-y-1">
          <Label htmlFor="month_year">Kỳ lương</Label>
          <Select
            id="month_year"
            value={monthYear}
            onChange={(e) => setMonthYear(e.target.value)}
            className="w-40"
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="status_filter">Trạng thái</Label>
          <Select
            id="status_filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | SalaryRecordStatus)}
            className="w-48"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>

        <Button variant="outline" onClick={load} disabled={loading}>
          <RotateCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Tải lại
        </Button>

        <Button
          className="ml-auto"
          onClick={onExport}
          disabled={loading || exporting || summaries.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          {exporting ? 'Đang xuất...' : 'Xuất Excel'}
        </Button>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground animate-pulse">Đang tải dữ liệu báo cáo…</p>
      )}

      {!loading && records.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Không có bản lương nào cho kỳ <strong>{monthYear}</strong>
          {statusFilter ? ` với trạng thái "${SR_STATUS_LABEL[statusFilter]}"` : ''}.
        </p>
      )}

      {!loading && records.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard
              icon={<Users className="h-5 w-5 text-blue-500" />}
              label="Tổng số NV"
              value={String(totals.soNV)}
              unit="người"
              bg="bg-blue-50"
            />
            <KpiCard
              icon={<Wallet className="h-5 w-5 text-green-500" />}
              label="Tổng quỹ lương"
              value={fmtMoneyShort(totals.tongQuiLuong)}
              unit={fmtMoney(totals.tongQuiLuong)}
              bg="bg-green-50"
            />
            <KpiCard
              icon={<TrendingUp className="h-5 w-5 text-amber-500" />}
              label="Tổng thuế TNCN"
              value={fmtMoneyShort(totals.tongThueTNCN)}
              unit={fmtMoney(totals.tongThueTNCN)}
              bg="bg-amber-50"
            />
            <KpiCard
              icon={<Wallet className="h-5 w-5 text-primary" />}
              label="Tổng thực lĩnh"
              value={fmtMoneyShort(totals.tongThucLinh)}
              unit={fmtMoney(totals.tongThucLinh)}
              bg="bg-primary/5"
              highlight
            />
          </div>

          {chartData.length > 0 && (
            <div className="rounded-md border bg-card p-4">
              <h2 className="text-base font-semibold mb-3">
                Biểu đồ so sánh theo phòng ban (đơn vị: triệu đồng)
              </h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="tr" />
                  <Tooltip
                    formatter={(val) => [`${val} triệu đ`]}
                    labelFormatter={(label) => {
                      const row = chartData.find(c => c.name === String(label))
                      return row?.fullName ?? String(label)
                    }}
                  />
                  <Legend />
                  <Bar dataKey="Thực lĩnh" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Thuế TNCN"      fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="BHXH NLĐ"       fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div>
            <h2 className="text-base font-semibold mb-2">
              Chi tiết theo phòng ban — kỳ {monthYear}
              {statusFilter && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {SR_STATUS_LABEL[statusFilter]}
                </Badge>
              )}
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phòng ban</TableHead>
                  <TableHead className="text-right">Số NV</TableHead>
                  <TableHead className="text-right">Tổng chịu thuế</TableHead>
                  <TableHead className="text-right">Tổng KCT</TableHead>
                  <TableHead className="text-right">BHXH NLĐ</TableHead>
                  <TableHead className="text-right">CĐP</TableHead>
                  <TableHead className="text-right">Thuế TNCN</TableHead>
                  <TableHead className="text-right">Truy lĩnh</TableHead>
                  <TableHead className="text-right font-semibold">Thực lĩnh</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.length === 0 ? (
                  <TableEmpty colSpan={9}>Không có dữ liệu.</TableEmpty>
                ) : (
                  <>
                    {summaries.map((s) => (
                      <TableRow key={s.deptId}>
                        <TableCell>
                          <div className="font-medium">{s.deptName}</div>
                          <div className="text-xs text-muted-foreground">{s.deptCode}</div>
                        </TableCell>
                        <TableCell className="text-right">{s.soNV}</TableCell>
                        <TableCell className="text-right text-sm">{fmtMoney(s.tongChiuThue)}</TableCell>
                        <TableCell className="text-right text-sm">{fmtMoney(s.tongKhongCT)}</TableCell>
                        <TableCell className="text-right text-sm">{fmtMoney(s.tongTrichNLD)}</TableCell>
                        <TableCell className="text-right text-sm">{fmtMoney(s.tongCDP)}</TableCell>
                        <TableCell className="text-right text-sm text-amber-600">{fmtMoney(s.tongThueTNCN)}</TableCell>
                        <TableCell className="text-right text-sm">
                          {s.tongTruyLinh !== 0 ? fmtMoney(s.tongTruyLinh) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-primary">{fmtMoney(s.tongThucLinh)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-bold border-t-2">
                      <TableCell>TỔNG CỘNG ({summaries.length} phòng)</TableCell>
                      <TableCell className="text-right">{totals.soNV}</TableCell>
                      <TableCell className="text-right">{fmtMoney(summaries.reduce((s, r) => s + r.tongChiuThue, 0))}</TableCell>
                      <TableCell className="text-right">{fmtMoney(summaries.reduce((s, r) => s + r.tongKhongCT, 0))}</TableCell>
                      <TableCell className="text-right">{fmtMoney(summaries.reduce((s, r) => s + r.tongTrichNLD, 0))}</TableCell>
                      <TableCell className="text-right">{fmtMoney(summaries.reduce((s, r) => s + r.tongCDP, 0))}</TableCell>
                      <TableCell className="text-right text-amber-600">{fmtMoney(totals.tongThueTNCN)}</TableCell>
                      <TableCell className="text-right">{fmtMoney(summaries.reduce((s, r) => s + r.tongTruyLinh, 0))}</TableCell>
                      <TableCell className="text-right text-primary">{fmtMoney(totals.tongThucLinh)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
