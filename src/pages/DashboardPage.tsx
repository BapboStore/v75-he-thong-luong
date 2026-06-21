import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Clock, RefreshCw, TrendingUp, Users, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { fetchDashboardKpi, type DashboardKpi } from '@/lib/api'
import { ROLE_LABEL, STATUS_LABEL } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

const AUTO_REFRESH_MS = 5 * 60 * 1000 // 5 phút

function fmtMoney(v: number): string {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + ' tỷ'
  if (v >= 1_000_000)     return (v / 1_000_000).toFixed(1) + ' tr'
  return v.toLocaleString('vi-VN') + ' đ'
}

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  loading?: boolean
  highlight?: boolean
  warn?: boolean
}

function KpiCard({ icon, label, value, sub, loading, highlight, warn }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          {icon}
          <span>{label}</span>
        </div>
        {loading ? (
          <>
            <Skeleton className="h-8 w-24 mb-1" />
            <Skeleton className="h-3 w-32" />
          </>
        ) : (
          <>
            <div className={`text-2xl font-bold ${highlight ? 'text-primary' : warn ? 'text-amber-600' : ''}`}>
              {value}
            </div>
            {sub && <div className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</div>}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { profile, refreshProfile, hasRole } = useAuth()
  const isAdmin = hasRole('admin_luong', 'admin_he_thong')

  const [kpi, setKpi] = useState<DashboardKpi | null>(null)
  const [kpiLoading, setKpiLoading] = useState(false)
  const [kpiError, setKpiError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadKpi = useCallback(async () => {
    if (!isAdmin) return
    setKpiLoading(true); setKpiError(null)
    try {
      const data = await fetchDashboardKpi()
      setKpi(data)
      setLastRefresh(new Date())
    } catch (e) {
      setKpiError(e instanceof Error ? e.message : 'Không tải được KPI.')
    } finally {
      setKpiLoading(false)
    }
  }, [isAdmin])

  // Load lần đầu + auto-refresh 5 phút
  useEffect(() => {
    void loadKpi()
    timerRef.current = setInterval(() => { void loadKpi() }, AUTO_REFRESH_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [loadKpi])

  // Skeleton khi profile chưa load
  if (!profile) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="outline" onClick={() => { void refreshProfile() }}>
            Tải lại hồ sơ
          </Button>
        </div>
      </div>
    )
  }

  const { user, employee, department } = profile

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Xin chào, <strong>{employee?.ho_ten ?? user.cccd}</strong>!
            {lastRefresh && (
              <span className="ml-2 text-xs">
                · Cập nhật lúc {lastRefresh.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" variant="outline" onClick={loadKpi} disabled={kpiLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${kpiLoading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        )}
      </div>

      {/* KPI Cards — chỉ admin */}
      {isAdmin && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={<Users className="h-4 w-4 text-blue-500" />}
            label="NV đang làm việc"
            value={kpi ? String(kpi.soNVDangLam) : '—'}
            sub="người"
            loading={kpiLoading && !kpi}
          />
          <KpiCard
            icon={<Wallet className="h-4 w-4 text-green-500" />}
            label={`Thực lĩnh tháng ${kpi?.currentMonth ?? '—'}`}
            value={kpi ? fmtMoney(kpi.tongThucLinhThang) : '—'}
            sub={kpi && kpi.tongThucLinhThang > 0 ? kpi.tongThucLinhThang.toLocaleString('vi-VN') + ' đ' : 'Chưa có bảng lương duyệt'}
            loading={kpiLoading && !kpi}
            highlight
          />
          <KpiCard
            icon={<Clock className="h-4 w-4 text-amber-500" />}
            label="Bảng lương chờ duyệt"
            value={kpi ? String(kpi.soBangLuongChoDuyet) : '—'}
            sub="bản pending"
            loading={kpiLoading && !kpi}
            warn={!!kpi && kpi.soBangLuongChoDuyet > 0}
          />
          <KpiCard
            icon={<TrendingUp className="h-4 w-4 text-purple-500" />}
            label="NV sắp nâng bậc"
            value={kpi ? String(kpi.soNVSapNangBac) : '—'}
            sub="trong 30 ngày tới"
            loading={kpiLoading && !kpi}
            warn={!!kpi && kpi.soNVSapNangBac > 0}
          />
        </div>
      )}

      {kpiError && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> {kpiError}
        </div>
      )}

      {/* Thông tin cá nhân */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Thông tin tài khoản</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div><span className="text-muted-foreground">CCCD: </span>{user.cccd}</div>
            <div><span className="text-muted-foreground">Vai trò: </span>{ROLE_LABEL[user.role]}</div>
            <div><span className="text-muted-foreground">Đăng nhập gần nhất: </span>
              {user.last_login_at ? formatDateTime(user.last_login_at) : '—'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Hồ sơ nhân viên</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div><span className="text-muted-foreground">Họ tên: </span>{employee?.ho_ten ?? '—'}</div>
            <div><span className="text-muted-foreground">Chức vụ: </span>{employee?.chuc_vu ?? '—'}</div>
            <div><span className="text-muted-foreground">Trạng thái: </span>
              {employee ? STATUS_LABEL[employee.status] : '—'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Phòng ban</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div><span className="text-muted-foreground">Mã: </span>{department?.code ?? '—'}</div>
            <div><span className="text-muted-foreground">Tên: </span>{department?.name ?? '—'}</div>
            <div><span className="text-muted-foreground">Loại lương: </span>{department?.salary_type ?? '—'}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Tiến độ module</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <div>✓ Module 1: Auth & nền tảng</div>
          <div>✓ Module 2: Quản lý phòng ban, nhân viên, tham số lương</div>
          <div>✓ Module 3: Chấm công (HC, lái xe, bảo vệ, kỹ thuật) + workflow duyệt</div>
          <div>✓ Module 4: Tính & duyệt bảng lương + snapshot, phiếu lương cá nhân</div>
          <div>✓ Module 5: Xuất PDF/Excel + báo cáo + cron TNVK/nâng bậc</div>
        </CardContent>
      </Card>
    </div>
  )
}
