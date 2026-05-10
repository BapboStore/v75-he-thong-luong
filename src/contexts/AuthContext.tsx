import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { cccdToEmail } from '@/lib/utils'
import type { AppUser, AuthProfile, Department, Employee, UserRole } from '@/lib/types'

interface AuthContextValue {
  loading: boolean
  session: Session | null
  profile: AuthProfile | null
  signInWithCccd: (cccd: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  changePassword: (newPassword: string) => Promise<{ ok: boolean; message?: string }>
  hasRole: (...roles: UserRole[]) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<AuthProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId: string) => {
    const { data: u, error: ue } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (ue || !u) { setProfile(null); return }
    const user = u as AppUser

    let employee: Employee | null = null
    if (user.employee_id) {
      const { data } = await supabase
        .from('employees').select('*').eq('id', user.employee_id).maybeSingle()
      employee = (data as Employee) ?? null
    }

    let department: Department | null = null
    if (user.department_id) {
      const { data } = await supabase
        .from('departments').select('*').eq('id', user.department_id).maybeSingle()
      department = (data as Department) ?? null
    }

    setProfile({ user, employee, department })
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data, error: sessErr } = await supabase.auth.getSession()
        if (!mounted) return
        if (sessErr) {
          // eslint-disable-next-line no-console
          console.warn('[V75] getSession error, clearing local session:', sessErr)
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
          setSession(null); setProfile(null); setLoading(false); return
        }
        if (data.session) {
          // Probe session bằng getUser() (có timeout) để chắc chắn access/refresh
          // token còn dùng được. Nếu refresh token bị huỷ (Invalid Refresh Token) thì
          // các call auth.* sau đó có thể treo / fail. Phát hiện sớm và clear session
          // local để buộc đăng nhập lại sạch.
          const probe = await Promise.race([
            supabase.auth.getUser(),
            new Promise<{ data: { user: null }; error: Error }>((resolve) =>
              setTimeout(() => resolve({ data: { user: null }, error: new Error('getUser timeout 5s') }), 5000),
            ),
          ])
          if (probe.error || !probe.data?.user) {
            // eslint-disable-next-line no-console
            console.warn('[V75] Session probe failed, clearing local session:', probe.error)
            await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
            setSession(null); setProfile(null); setLoading(false); return
          }
          setSession(data.session)
          await loadProfile(data.session.user.id)
        } else {
          setSession(null)
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[V75] AuthProvider init threw:', e)
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
        setSession(null); setProfile(null)
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s)
      // Khi đổi mật khẩu, supabase-js phát event USER_UPDATED ngay sau auth.updateUser.
      // Nếu reload profile ở đây sẽ đua với update users.must_change_password trong
      // changePassword() — có thể đọc lại giá trị cũ (true) và ghi đè state mới (false),
      // khiến ProtectedRoute redirect ngược lại /change-password sau khi navigate('/').
      // → Bỏ qua USER_UPDATED, để changePassword tự reload profile.
      if (event === 'USER_UPDATED') return
      if (s?.user) await loadProfile(s.user.id)
      else setProfile(null)
    })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [loadProfile])

  /** Đăng nhập bằng CCCD. Tự kiểm tra khoá 5'/5 lần sai. */
  const signInWithCccd = useCallback(async (cccd: string, password: string) => {
    // 1. Tra cứu user theo CCCD để kiểm tra khoá / is_active
    const { data: ures } = await supabase
      .from('users')
      .select('id,is_active,failed_attempts,locked_until')
      .eq('cccd', cccd)
      .maybeSingle()

    if (ures && !ures.is_active) {
      return { ok: false, message: 'Tài khoản đã bị vô hiệu hoá. Liên hệ quản trị hệ thống.' } as const
    }
    if (ures?.locked_until && new Date(ures.locked_until) > new Date()) {
      const remain = Math.ceil((new Date(ures.locked_until).getTime() - Date.now()) / 1000)
      return { ok: false, message: `Tài khoản đang bị khoá. Thử lại sau ${remain}s.` } as const
    }

    // 2. Đăng nhập
    const email = cccdToEmail(cccd)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // 3. Tăng failed_attempts qua RPC nhẹ (update trực tiếp – chỉ owner mới sửa users của mình
      //    nên ở đây ta không tăng được nếu chưa đăng nhập. Để admin Edge Function xử lý sau.)
      //    Trước mắt, hiển thị thông báo và cho client tự đếm.
      return { ok: false, message: 'Sai CCCD hoặc mật khẩu.' } as const
    }

    // 4. Reset failed_attempts + last_login (RLS cho phép self-update)
    if (data.user) {
      await supabase
        .from('users')
        .update({
          failed_attempts: 0,
          locked_until: null,
          last_login_at: new Date().toISOString(),
        })
        .eq('id', data.user.id)
    }

    return { ok: true } as const
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null); setSession(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id)
  }, [session?.user, loadProfile])

  const changePassword = useCallback(async (newPassword: string) => {
    /* eslint-disable no-console */
    if (!session?.user) return { ok: false, message: 'Chưa đăng nhập.' }
    const userId = session.user.id
    console.log('[V75] changePassword: start, userId =', userId)

    // 0. Probe session: nếu refresh token đã bị huỷ thì auth.updateUser sẽ TREO vô hạn
    //    (GoTrueClient internal lock kẹt sau khi gặp Invalid Refresh Token).
    //    Phát hiện sớm bằng getUser() rồi signOut, yêu cầu user đăng nhập lại.
    try {
      const probe = await Promise.race([
        supabase.auth.getUser(),
        new Promise<{ data: null; error: Error }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: new Error('getUser timeout 5s') }), 5000),
        ),
      ])
      if (probe.error || !probe.data?.user) {
        console.warn('[V75] changePassword: session probe failed:', probe.error)
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
        return {
          ok: false,
          message: 'Phiên đăng nhập đã hết hạn (refresh token không hợp lệ). Vui lòng đăng nhập lại bằng mật khẩu hiện tại.',
        }
      }
    } catch (e) {
      console.error('[V75] changePassword: probe threw:', e)
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
      return {
        ok: false,
        message: 'Không xác thực được phiên đăng nhập. Vui lòng đăng nhập lại.',
      }
    }

    // 1. Cập nhật mật khẩu trên Supabase Auth. Bọc timeout để không hang vô hạn
    //    nếu auth client rơi vào trạng thái lock kẹt.
    let updResp: Awaited<ReturnType<typeof supabase.auth.updateUser>> | undefined
    try {
      updResp = await Promise.race([
        supabase.auth.updateUser({ password: newPassword }),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('auth.updateUser timeout 15s — auth client có thể đã hỏng, hãy đăng nhập lại')), 15000),
        ),
      ])
    } catch (e) {
      console.error('[V75] auth.updateUser threw:', e)
      return { ok: false, message: e instanceof Error ? e.message : 'auth.updateUser exception.' }
    }
    console.log('[V75] auth.updateUser response:', updResp)

    if (updResp.error) {
      return { ok: false, message: updResp.error.message }
    }
    if (!updResp.data?.user) {
      return { ok: false, message: 'Đổi mật khẩu không thành công. Phản hồi rỗng từ Supabase.' }
    }

    // 2. Đánh dấu must_change_password = false. DÙNG .select() để verify thực sự
    //    update được. Vì Supabase RLS có thể filter ra 0 rows mà KHÔNG trả error
    //    (chỉ trả empty array). Phải dựa vào số dòng thực tế thay đổi.
    let dbWarn: string | null = null
    try {
      const { data: updRows, error: dbErr } = await supabase
        .from('users')
        .update({ must_change_password: false })
        .eq('id', userId)
        .select('id, must_change_password')
      console.log('[V75] users.update result:', { updRows, dbErr })
      if (dbErr) {
        console.warn('[V75] users.update must_change_password failed:', dbErr)
        dbWarn = dbErr.message
      } else if (!updRows || updRows.length === 0) {
        dbWarn = 'RLS hoặc filter chặn — 0 dòng được cập nhật. Kiểm tra policy users_update_self.'
        console.warn('[V75] users.update affected 0 rows (RLS suspect):', { userId })
      } else if (updRows[0].must_change_password !== false) {
        dbWarn = `Update không persist: must_change_password vẫn là ${updRows[0].must_change_password}.`
        console.warn('[V75] users.update did not persist:', updRows[0])
      }
    } catch (e) {
      console.warn('[V75] users.update threw:', e)
      dbWarn = e instanceof Error ? e.message : 'users.update exception.'
    }

    // 3. Optimistic update — set must_change_password = false trong local profile
    //    bất kể DB update có thành công hay không. Nếu DB không update thì lần load
    //    kế tiếp profile lại = true, nhưng phiên hiện tại user vào được app, không
    //    bị kẹt ở /change-password.
    setProfile(prev =>
      prev ? { ...prev, user: { ...prev.user, must_change_password: false } } : prev,
    )

    // 4. KHÔNG gọi loadProfile ở đây — để tránh đua với optimistic update.
    //    Lần load profile kế tiếp (refresh page, login lại) sẽ tự đọc DB.

    console.log('[V75] changePassword: done, dbWarn =', dbWarn)
    return {
      ok: true,
      message: dbWarn
        ? `Đã đổi mật khẩu. Lưu ý: cờ must_change_password chưa cập nhật DB (${dbWarn}). Hiện tại bạn vẫn vào được app — lần đăng nhập kế tiếp có thể yêu cầu đổi mật khẩu lại; nhờ admin xử lý.`
        : undefined,
    }
    /* eslint-enable no-console */
  }, [session])

  const hasRole = useCallback((...roles: UserRole[]) => {
    if (!profile) return false
    return roles.includes(profile.user.role)
  }, [profile])

  const value = useMemo<AuthContextValue>(() => ({
    loading, session, profile,
    signInWithCccd, signOut, refreshProfile, changePassword, hasRole,
  }), [loading, session, profile, signInWithCccd, signOut, refreshProfile, changePassword, hasRole])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải dùng trong <AuthProvider>')
  return ctx
}
