import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, KeyRound, LogOut, Menu, UserCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { ROLE_LABEL } from '@/lib/types'

interface HeaderProps {
  onMenuToggle?: () => void
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const onLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/80 backdrop-blur px-4 md:px-6">
      <div className="flex items-center gap-3">
        {/* Hamburger — chỉ hiện trên mobile */}
        <button
          onClick={onMenuToggle}
          className="md:hidden rounded-md p-2 hover:bg-accent"
          aria-label="Mở menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      <div>
        <div className="text-sm text-muted-foreground">Xin chào</div>
        <div className="text-base font-semibold leading-tight">
          {profile?.employee?.ho_ten ?? '—'}{' '}
          <span className="text-xs font-normal text-muted-foreground">
            ({profile ? ROLE_LABEL[profile.user.role] : ''})
          </span>
        </div>
      </div>
      </div>

      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm hover:bg-accent"
        >
          <UserCircle2 className="h-5 w-5 text-primary" />
          <span className="font-medium">{profile?.user.cccd}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-56 rounded-md border bg-popover shadow-lg">
            <div className="border-b px-3 py-2 text-xs text-muted-foreground">
              Phòng ban: {profile?.department?.name ?? '—'}
            </div>
            <Link
              to="/change-password"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
            >
              <KeyRound className="h-4 w-4" /> Đổi mật khẩu
            </Link>
            <button
              onClick={onLogout}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent"
            >
              <LogOut className="h-4 w-4" /> Đăng xuất
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
