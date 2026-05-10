import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useAuth } from '@/contexts/AuthContext'

const PASSWORD_RULES = [
  { test: (p: string) => p.length >= 8,                label: 'Tối thiểu 8 ký tự' },
  { test: (p: string) => /[A-Z]/.test(p),              label: 'Có ít nhất 1 chữ hoa' },
  { test: (p: string) => /[a-z]/.test(p),              label: 'Có ít nhất 1 chữ thường' },
  { test: (p: string) => /\d/.test(p),                 label: 'Có ít nhất 1 chữ số' },
  { test: (p: string) => p !== '8888V75',              label: 'Không được trùng mật khẩu mặc định' },
]

export default function ChangePasswordPage() {
  const { changePassword, profile } = useAuth()
  const navigate = useNavigate()

  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone]   = useState(false)

  const checks = PASSWORD_RULES.map(r => ({ ...r, ok: r.test(pw1) }))
  const allOk  = checks.every(c => c.ok) && pw1 === pw2

  // Auto-navigate khi profile.must_change_password chuyển thành false sau khi user
  // bấm submit. Cách này declarative hơn setTimeout thuần — đảm bảo chỉ navigate khi
  // state đã thật sự cập nhật.
  useEffect(() => {
    if (done && profile && !profile.user.must_change_password) {
      // eslint-disable-next-line no-console
      console.log('[V75] ChangePasswordPage: profile updated, navigating to /')
      navigate('/', { replace: true })
    }
  }, [done, profile, navigate])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!allOk) { setError('Mật khẩu chưa đáp ứng yêu cầu hoặc xác nhận chưa khớp.'); return }
    setSubmitting(true)
    // eslint-disable-next-line no-console
    console.log('[V75] ChangePasswordPage: submit start')
    try {
      const res = await changePassword(pw1)
      // eslint-disable-next-line no-console
      console.log('[V75] ChangePasswordPage: changePassword returned', res)
      if (!res.ok) {
        setError(res.message ?? 'Không đổi được mật khẩu.')
        // eslint-disable-next-line no-console
        console.warn('[V75] changePassword failed:', res)
        return
      }
      setDone(true)
      // Fallback: nếu sau 1.5s mà profile chưa cập nhật / useEffect chưa navigate
      // thì force navigate. (Trường hợp dbWarn → optimistic vẫn set false → hợp lệ)
      setTimeout(() => {
        // eslint-disable-next-line no-console
        console.log('[V75] ChangePasswordPage: fallback navigate fires')
        navigate('/', { replace: true })
      }, 1500)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[V75] changePassword threw:', err)
      setError(err instanceof Error ? err.message : 'Lỗi không xác định khi đổi mật khẩu.')
    } finally {
      setSubmitting(false)
    }
  }

  const isFirstTime = !!profile?.user.must_change_password

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-sky-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> Đổi mật khẩu</CardTitle>
            <CardDescription>
              {isFirstTime
                ? 'Đây là lần đăng nhập đầu tiên. Bạn cần đổi mật khẩu mặc định trước khi tiếp tục.'
                : 'Cập nhật mật khẩu mới cho tài khoản của bạn.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Lỗi</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {done && (
                <Alert variant="success">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Đổi mật khẩu thành công</AlertTitle>
                  <AlertDescription>Đang chuyển hướng...</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="pw1">Mật khẩu mới</Label>
                <Input id="pw1" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Xác nhận mật khẩu</Label>
                <Input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
              </div>

              <ul className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                {checks.map((c) => (
                  <li key={c.label} className={c.ok ? 'text-green-700' : 'text-muted-foreground'}>
                    {c.ok ? '✔︎' : '○'} {c.label}
                  </li>
                ))}
                <li className={pw1 && pw1 === pw2 ? 'text-green-700' : 'text-muted-foreground'}>
                  {pw1 && pw1 === pw2 ? '✔︎' : '○'} Hai lần nhập mật khẩu khớp nhau
                </li>
              </ul>

              <Button type="submit" className="w-full" disabled={!allOk || submitting}>
                {submitting ? 'Đang lưu...' : 'Đổi mật khẩu'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
