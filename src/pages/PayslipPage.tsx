import { useEffect, useMemo, useRef, useState } from 'react'
import { FileDown, Printer, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { listMySalaryRecords } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { fmtVND } from '@/lib/utils'
import { exportPayslipToPdf } from '@/lib/pdf'
import { SR_STATUS_LABEL, type SalaryRecord, type SalaryRecordStatus } from '@/lib/types'

function StatusBadge({ status }: { status: SalaryRecordStatus }) {
  const variant: 'secondary' | 'warning' | 'success' | 'destructive' = (
    status === 'draft' ? 'secondary' :
    status === 'pending' ? 'warning' :
    status === 'approved' ? 'success' : 'destructive'
  )
  return <Badge variant={variant}>{SR_STATUS_LABEL[status]}</Badge>
}

export default function PayslipPage() {
  const { profile } = useAuth()
  const [records, setRecords] = useState<SalaryRecord[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const printableRef = useRef<HTMLDivElement | null>(null)

  const employeeId = profile?.user.employee_id ?? null

  useEffect(() => {
    if (!employeeId) { setLoading(false); return }
    (async () => {
      setLoading(true); setError(null)
      try {
        const data = await listMySalaryRecords(employeeId)
        setRecords(data)
        if (data.length > 0 && !selectedMonth) setSelectedMonth(data[0].month_year)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Không tải được phiếu lương.')
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId])

  const current = useMemo(
    () => records.find(r => r.month_year === selectedMonth) ?? null,
    [records, selectedMonth],
  )

  async function handleExportPdf() {
    if (!current || !printableRef.current) return
    setError(null)
    setExporting(true)
    try {
      await exportPayslipToPdf({
        element: printableRef.current,
        cccd: current.cccd,
        monthYear: current.month_year,
        hoTen: current.ho_ten,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xuất được PDF.')
    } finally {
      setExporting(false)
    }
  }

  if (!employeeId) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" /> Phiếu lương của tôi
        </h1>
        <Alert variant="warning">
          <AlertTitle>Chưa liên kết hồ sơ nhân viên</AlertTitle>
          <AlertDescription>
            Tài khoản của bạn chưa được liên kết với hồ sơ nhân viên. Liên hệ quản trị hệ thống để được hỗ trợ.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" /> Phiếu lương của tôi
          </h1>
          <p className="text-sm text-muted-foreground">
            Hiển thị các bảng lương đã được tính trong hệ thống. Chỉ xem.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="month">Chọn tháng</Label>
            <Select id="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
              {records.length === 0 && <option value="">— chưa có —</option>}
              {records.map(r => (
                <option key={r.id} value={r.month_year}>
                  {r.month_year} — {SR_STATUS_LABEL[r.status]}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant="secondary"
            onClick={handleExportPdf}
            disabled={!current || exporting}
            title="Xuất phiếu lương ra PDF khổ A5 dọc (1 file/NV)"
          >
            <FileDown className="h-4 w-4 mr-1" />
            {exporting ? 'Đang xuất…' : 'Xuất PDF'}
          </Button>
          <Button onClick={() => window.print()} disabled={!current}>
            <Printer className="h-4 w-4 mr-1" /> In phiếu
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Lỗi</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      ) : !current ? (
        <Alert variant="info">
          <AlertTitle>Chưa có phiếu lương</AlertTitle>
          <AlertDescription>
            Tài khoản của bạn chưa có bảng lương nào được tạo trong hệ thống.
          </AlertDescription>
        </Alert>
      ) : (
        <div ref={printableRef} className="bg-background p-2">
          <PayslipDetail r={current} />
        </div>
      )}
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-1 ${bold ? 'font-semibold' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}

function PayslipDetail({ r }: { r: SalaryRecord }) {
  const N = (v: unknown) => Number(v ?? 0)
  const lcb_thang = N(r.he_so_bac) * N(r.luong_co_so)
  return (
    <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            Thông tin bản ghi <StatusBadge status={r.status} />
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <Row label="Tháng" value={r.month_year} />
          <Row label="Họ tên" value={r.ho_ten} />
          <Row label="CCCD" value={r.cccd} />
          <Row label="Chức vụ" value={r.chuc_vu ?? '—'} />
          <Row label="Ngạch / Bậc" value={`${r.ngach_code ?? '—'} / Bậc ${r.bac ?? '—'} (HS ${N(r.he_so_bac)})`} />
          <Row label="TNVK %" value={`${N(r.tnvk_percent)}%`} />
          <Row label="Hệ số PCCV / PCTN" value={`${N(r.he_so_pccv)} / ${N(r.he_so_pctn)}`} />
          <Row label="Số tài khoản" value={`${r.so_tai_khoan ?? '—'} (${r.ten_ngan_hang ?? '—'})`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Thông số áp dụng</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <Row label="Lương cơ sở" value={fmtVND(N(r.luong_co_so))} />
          <Row label="LCB tháng" value={fmtVND(lcb_thang)} />
          <Row label="LCB ngày" value={fmtVND(N(r.lcb_ngay))} />
          <Row label="Cơ sở trích BH" value={fmtVND(N(r.co_so_trich))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Thu nhập chịu thuế</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <Row label="Tiền PCCV + PCTN" value={fmtVND(N(r.tien_pccv_pctn))} />
          <Row label="Tiền lương theo công" value={fmtVND(N(r.tien_luong_ct))} />
          <Row label="Thưởng" value={fmtVND(N(r.thuong))} />
          <Row label="Tổng chịu thuế" value={fmtVND(N(r.tong_chiu_thue))} bold />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Thu nhập không chịu thuế</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <Row label="Lương không chịu thuế" value={fmtVND(N(r.tien_luong_kct))} />
          <Row label="Tiền ăn trưa" value={fmtVND(N(r.an_trua))} />
          <Row label="Phụ cấp xăng xe" value={fmtVND(N(r.xang_xe))} />
          <Row label="Phụ cấp điện thoại" value={fmtVND(N(r.dien_thoai))} />
          <Row label="Tổng không chịu thuế" value={fmtVND(N(r.tong_khong_ct))} bold />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Khấu trừ</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <Row label="Trích BH NLĐ" value={fmtVND(N(r.trich_nld))} />
          <Row label="Đơn vị đóng BH" value={fmtVND(N(r.don_vi_dong))} />
          <Row label="Công đoàn phí" value={fmtVND(N(r.cdp))} />
          <Row label="Thuế TNCN" value={fmtVND(N(r.thue_tncn))} />
          <Row label="Truy thu" value={fmtVND(N(r.truy_thu))} />
          <Row label="Truy lĩnh" value={fmtVND(N(r.truy_linh))} />
        </CardContent>
      </Card>

      <Card className="border-primary/40">
        <CardHeader className="pb-2"><CardTitle className="text-base text-primary">Thực lĩnh</CardTitle></CardHeader>
        <CardContent>
          <div className="text-3xl font-bold font-mono">{fmtVND(N(r.thuc_linh))}</div>
          <p className="text-xs text-muted-foreground mt-2">
            Thực lĩnh = Tổng chịu thuế + Tổng không chịu thuế − Trích BH NLĐ − CĐP − Thuế TNCN + Truy lĩnh − Truy thu
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
