import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { UserRole } from '@/lib/types'

interface Props {
  children: React.ReactNode
  /** Nếu truyền, chỉ các role này được vào. Bỏ trống = bất cứ user đăng nhập */
  roles?: UserRole[]
}

export function ProtectedRoute({ children, roles }: Props) {
  const { loading, session, profile } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center text-muted-foreground">
        Đang kiểm tra phiên đăng nhập...
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  // Bắt buộc đổi mật khẩu lần đầu
  if (profile?.user.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  if (roles && roles.length > 0 && profile && !roles.includes(profile.user.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}
