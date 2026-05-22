import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { ROLE_LABEL, STATUS_LABEL } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'

export default function DashboardPage() {
  const { profile, refreshProfile } = useAuth()

  // v0.4.3: profile thường được hydrate ngay từ localStorage cache khi F5 →
  // hiếm khi rơi vào fallback này. Chỉ thấy lần đăng nhập đầu tiên (chưa có
  // cache) trong khi loadProfile chạy nền, hoặc khi mạng/Supabase rất tệ.
  if (!profile) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Card>
          <CardHeader><CardTitle className="text-base">Đang tải hồ sơ…</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>
              Hồ sơ người dùng chưa tải xong (có thể do mạng chậm hoặc Supabase đang nghẽn).
              Anh thử bấm Tải lại bên dưới; nếu vẫn lỗi, đăng nhập lại.
            </p>
            <Button size="sm" onClick={() => { void refreshProfile() }}>
              Tải lại hồ sơ
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { user, employee, department } = profile

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Tổng quan nhanh hệ thống V75 – Module 1 (Auth & Phân quyền) đã hoạt động.
        </p>
      </div>

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
          <div>• Module 5: Xuất PDF/Excel + báo cáo + cron TNVK/nâng bậc</div>
        </CardContent>
      </Card>
    </div>
  )
}
