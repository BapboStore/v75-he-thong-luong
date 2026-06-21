import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3, Building2, ClipboardCheck, FileText, History,
  LayoutDashboard, Settings, TrendingUp, Users, Wallet,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/types'

interface MenuItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  roles: UserRole[]
}

const MENU: MenuItem[] = [
  { to: '/',            label: 'Dashboard',          icon: LayoutDashboard, roles: ['user','truong_phong','admin_luong','admin_he_thong'] },
  { to: '/payslip',     label: 'Phiếu lương của tôi', icon: Wallet,         roles: ['user','truong_phong','admin_luong','admin_he_thong'] },
  { to: '/attendance',  label: 'Chấm công',          icon: ClipboardCheck,  roles: ['truong_phong','admin_luong','admin_he_thong'] },
  { to: '/salary',      label: 'Bảng lương',         icon: BarChart3,       roles: ['truong_phong','admin_luong','admin_he_thong'] },
  { to: '/employees',   label: 'Nhân viên',          icon: Users,           roles: ['admin_luong','admin_he_thong'] },
  { to: '/promotions',  label: 'Nâng bậc TNVK',      icon: TrendingUp,      roles: ['admin_luong','admin_he_thong'] },
  { to: '/departments', label: 'Phòng ban',          icon: Building2,       roles: ['admin_luong','admin_he_thong'] },
  { to: '/reports',     label: 'Báo cáo / Xuất file', icon: FileText,       roles: ['admin_luong','admin_he_thong'] },
  { to: '/users',       label: 'Tài khoản & Phân quyền', icon: Users,       roles: ['admin_he_thong'] },
  { to: '/logs',        label: 'Nhật ký hoạt động',   icon: History,         roles: ['admin_he_thong'] },
  { to: '/config',      label: 'Cấu hình hệ thống',   icon: Settings,        roles: ['admin_he_thong'] },
]

interface SidebarProps {
  open?: boolean
  onClose?: () => void
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const { profile } = useAuth()
  const role = profile?.user.role ?? 'user'
  const visible = MENU.filter(m => m.roles.includes(role))
  const location = useLocation()

  // Close sidebar on route change (mobile)
  useEffect(() => {
    onClose?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-card w-64 flex-shrink-0',
        // Desktop: always visible
        'md:flex md:relative md:translate-x-0 md:z-auto',
        // Mobile: slide in/out overlay
        'fixed inset-y-0 left-0 z-30 transition-transform duration-200',
        open ? 'translate-x-0' : '-translate-x-full',
        'md:translate-x-0',
      )}
    >
      <div className="flex h-16 items-center gap-3 px-4 border-b">
        <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">V75</div>
        <div>
          <div className="text-sm font-semibold leading-tight">Hệ thống Lương</div>
          <div className="text-[11px] text-muted-foreground">v0.14.0 – Mobile responsive</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {visible.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t p-3 text-xs text-muted-foreground">
        Đăng nhập với role:
        <div className="mt-1 inline-block rounded bg-secondary px-2 py-0.5 text-secondary-foreground font-medium">
          {profile?.user.role}
        </div>
      </div>
    </aside>
  )
}
