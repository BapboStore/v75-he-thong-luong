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

const MAX_FAILED   = 5
const LOCK_MINUTES = 5
const STORAGE_KEY  = 'v75_login_state'

interface LocalLockState {
  cccd: string
  failed: number
  lockedUntil?: number   // epoch ms
}

function getLockState(): LocalLockState | null {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
}
function setLockState(s: LocalLockState | null) {
  if (!s) localStorage.removeItem(STORAGE_KEY)
  else    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

export default function LoginPage() {
  const { session, signInWithCccd, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname ?? '/'

  const [cccd, setCccd] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (!loading && session) navigate(from, { replace: true })
  }, [loading, session, navigate, from])

  // Đếm ngược khoá
  useEffect(() => {
    const id = setInterval(() => {
      const s = getLockState()
      if (!s?.lockedUntil) { setSecondsLeft(0); return }
      const remain = Math.max(0, Math.ceil((s.lockedUntil - Date.now()) / 1000))
      setSecondsLeft(remain)
      if (remain === 0) setLockState({ cccd: s.cccd, failed: 0 })
    }, 500)
    return () => clearInterval(id)
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isValidCccd(cccd)) { setError('CCCD phải là 9–12 chữ số.'); return }
    if (password.length < 4) { setError('Mật khẩu không hợp lệ.'); return }

    const lock = getLockState()
    if (lock?.cccd === cccd && lock.lockedUntil && lock.lockedUntil > Date.now()) {
      const r = Math.ceil((lock.lockedUntil - Date.now()) / 1000)
      setError(`Tài khoản đang bị khoá. Thử lại sau ${r}s.`)
      return
    }

    setSubmitting(true)
    const result = await signInWithCccd(cccd, password)
    setSubmitting(false)

    if (result.ok) {
      setLockState(null)
      navigate(from, { replace: true })
      return
    }

    const cur = getLockState()
    const failed = (cur?.cccd === cccd ? (cur.failed ?? 0) : 0) + 1
    if (failed >= MAX_FAILED) {
      const lockedUntil = Date.now() + LOCK_MINUTES * 60 * 1000
      setLockState({ cccd, failed, lockedUntil })
      setError(`Bạn đã sai ${MAX_FAILED} lần. Tài khoản bị khoá ${LOCK_MINUTES} phút.`)
    } else {
      setLockState({ cccd, failed })
      setError(`${result.message} (Còn ${MAX_FAILED - failed} lần thử)`)
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

              <Button type="submit" className="w-full" disabled={submitting || secondsLeft > 0}>
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
