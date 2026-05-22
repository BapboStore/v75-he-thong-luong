import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AlertCircle, Lock, ShieldCheck, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useAuth } from '@/contexts/AuthContext'
import { isValidCccd } from '@/lib/utils'
import { callAuthLockout } from '@/lib/api'

const MAX_FAILED = 5

export default function LoginPage() {
  const { session, signInWithCccd, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname ?? '/'

  const [cccd, setCccd] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Lockout state (server-side qua Edge Function `auth-lockout`)
  const [serverLocked, setServerLocked] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (!loading && session) navigate(from, { replace: true })
  }, [loading, session, navigate, from])

  // Đếm ngược thời gian khoá còn lại (client-side ticker, không gọi lại server).
  useEffect(() => {
    if (secondsLeft <= 0) {
      if (serverLocked) setServerLocked(false)
      return
    }
    const id = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [secondsLeft, serverLocked])

  /** Kiểm tra lock server-side khi user blur ô CCCD hoặc nhấn login. */
  const checkLockoutForCccd = async (c: string): Promise<boolean> => {
    if (!isValidCccd(c)) return false
    try {
      const resp = await callAuthLockout('check', c)
      if (resp.locked) {
        setServerLocked(true)
        setSecondsLeft(resp.remaining_seconds)
        setError(`Tài khoản đang bị khoá. Thử lại sau ${resp.remaining_seconds}s.`)
        return true
      }
      setServerLocked(false)
      setSecondsLeft(0)
      return false
    } catch (e) {
      // Edge Function lỗi / mạng → KHÔNG block UI, log warn, dùng client fallback
      // eslint-disable-next-line no-console
      console.warn('[V75] auth-lockout check thất bại:', e)
      return false
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isValidCccd(cccd)) { setError('CCCD phải là 9–12 chữ số.'); return }
    if (password.length < 4) { setError('Mật khẩu không hợp lệ.'); return }

    // 1. Check server-side lockout
    const isLocked = await checkLockoutForCccd(cccd)
    if (isLocked) return

    setSubmitting(true)
    const result = await signInWithCccd(cccd, password)
    setSubmitting(false)

    if (result.ok) {
      // 2a. Đăng nhập OK → reset failed_attempts server-side (best-effort).
      // AuthContext đã update last_login_at + failed_attempts=0 trực tiếp qua RLS
      // self-update; gọi Edge Function reset chỉ là backup phòng RLS chặn.
      try { await callAuthLockout('reset', cccd) } catch { /* ignore */ }
      navigate(from, { replace: true })
      return
    }

    // 2b. Đăng nhập sai → increment server-side
    try {
      const resp = await callAuthLockout('increment', cccd)
      if (resp.locked) {
        setServerLocked(true)
        setSecondsLeft(resp.remaining_seconds)
        setError(`Bạn đã sai ${MAX_FAILED} lần. Tài khoản bị khoá ${Math.ceil(resp.remaining_seconds / 60)} phút.`)
      } else {
        setError(`${result.message} (Còn ${resp.remaining_attempts} lần thử)`)
      }
    } catch (e) {
      // Edge Function increment fail → vẫn báo lỗi sai MK cho user
      // eslint-disable-next-line no-console
      console.warn('[V75] auth-lockout increment thất bại:', e)
      setError(result.message)
    }
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-sky-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold shadow-md">
            V75
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Hệ thống Quản lý Tiền lương</h1>
          <p className="text-sm text-muted-foreground">Đăng nhập bằng số CCCD của bạn</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Đăng nhập</CardTitle>
            <CardDescription>Lần đầu sử dụng, mật khẩu mặc định là <code className="rounded bg-muted px-1">8888V75</code></CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Không thể đăng nhập</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {secondsLeft > 0 && (
                <Alert variant="warning">
                  <Lock className="h-4 w-4" />
                  <AlertTitle>Tài khoản đang bị khoá</AlertTitle>
                  <AlertDescription>Còn {secondsLeft}s nữa bạn mới có thể thử lại.</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="cccd">Số CCCD</Label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="cccd"
                    inputMode="numeric"
                    autoComplete="username"
                    placeholder="VD: 001199000001"
                    className="pl-10"
                    value={cccd}
                    onChange={(e) => setCccd(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    onBlur={() => { if (isValidCccd(cccd)) void checkLockoutForCccd(cccd) }}
                    maxLength={12}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="pl-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={submitting || serverLocked}>
                {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} V75 – Quên mật khẩu vui lòng liên hệ quản trị hệ thống.
        </p>
      </div>
    </div>
  )
}
