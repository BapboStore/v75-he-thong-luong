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

// =============================================================
// v0.4.3 — Cache AuthProfile vào localStorage
// ---------------------------------------------------------------
// Vấn đề ở v0.4.2: khi F5 trên Supabase free tier (đặc biệt cold
// start), 3 SELECT trong loadProfile (users + employees +
// departments) có thể mất 8-20s. Trong khoảng đó hardTimeout 12s
// thường fire trước → setLoading(false) nhưng profile vẫn null →
// Dashboard hiển thị "Đang tải hồ sơ…" với nút "Tải lại hồ sơ".
//
// Giải pháp: cache profile sau mỗi lần loadProfile thành công.
// Khi F5, AuthProvider hydrate profile ngay từ cache (đồng bộ),
// UI dùng được tức thì. loadProfile chạy nền, cập nhật cache khi
// xong. Nếu nền fail vì mạng → giữ nguyên cache (KHÔNG flicker
// về null). Cache bị xoá khi: signOut, user khác đăng nhập, hoặc
// session probe fail.
// =============================================================
const PROFILE_CACHE_KEY = 'v75:auth_profile_cache:v1'

function readCachedProfile(): AuthProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AuthProfile> | null
    if (
      parsed &&
      parsed.user &&
      typeof (parsed.user as AppUser).id === 'string' &&
      (parsed.user as AppUser).role
    ) {
      return parsed as AuthProfile
    }
    return null
  } catch {
    return null
  }
}

function writeCachedProfile(p: AuthProfile | null) {
  try {
    if (p) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p))
    else localStorage.removeItem(PROFILE_CACHE_KEY)
  } catch {
    /* ignore quota / privacy mode */
  }
}

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
  // v0.4.3: hydrate profile từ cache đồng bộ ngay lần render đầu tiên.
  const [profile, setProfile] = useState<AuthProfile | null>(() => readCachedProfile())
  const [loading, setLoading] = useState(true)

  /**
   * v0.4.3: loadProfile được "tolerant" hơn — khi SELECT users lỗi
   * (mạng, RLS, 5xx), KHÔNG ghi đè profile hiện có. Chỉ clear khi
   * user thực sự không tồn tại trong bảng (data === null && !error).
   * Mục tiêu: tránh flicker dashboard → "Đang tải hồ sơ…" khi cache
   * đang dùng được và background refresh tạm thời fail.
   */
  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data: u, error: ue } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (ue) {
        // eslint-disable-next-line no-console
        console.warn('[V75] loadProfile: users SELECT error (giữ cache):', ue)
        return
      }
      if (!u) {
        // eslint-disable-next-line no-console
        console.warn('[V75] loadProfile: user không tồn tại trong DB, clear profile')
        setProfile(null)
        writeCachedProfile(null)
        return
      }
      const user = u as AppUser

      const empPromise: Promise<Employee | null> = user.employee_id
        ? (async () => {
            try {
              const { data } = await supabase
                .from('employees').select('*').eq('id', user.employee_id!).maybeSingle()
              return (data as Employee) ?? null
            } catch { return null }
          })()
        : Promise.resolve(null)

      const depPromise: Promise<Department | null> = user.department_id
        ? (async () => {
            try {
              const { data } = await supabase
                .from('departments').select('*').eq('id', user.department_id!).maybeSingle()
              return (data as Department) ?? null
            } catch { return null }
          })()
        : Promise.resolve(null)

      const [employee, department] = await Promise.all([empPromise, depPromise])

      const fresh: AuthProfile = { user, employee, department }
      setProfile(fresh)
      writeCachedProfile(fresh)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[V75] loadProfile threw (giữ cache):', e)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    // ===========================================================
    // v0.4.3: init flow KHÔNG block UI chờ loadProfile.
    // - getSession() đọc localStorage (~10-50ms).
    // - Có session → setLoading(false) NGAY.
    // - getUser() probe + loadProfile chạy NỀN, cập nhật cache.
    // - Cached profile (đã hydrate ở useState init) giữ UI hiển thị
    //   tức thì khi F5.
    // Hard timeout 6s chỉ là safety net cho trường hợp getSession()
    // (đáng lẽ ~50ms) bị hang bất thường — gần như không bao giờ
    // fire trong thực tế.
    // ===========================================================
    const hardTimeout = setTimeout(() => {
      if (!mounted) return
      // eslint-disable-next-line no-console
      console.warn('[V75] AuthProvider init hard timeout 6s — force unblock')
      setLoading(false)
    }, 6000)

    ;(async () => {
      try {
        const { data, error: sessErr } = await supabase.auth.getSession()
        if (!mounted) return

        if (sessErr) {
          // eslint-disable-next-line no-console
          console.warn('[V75] getSession error, clearing local session:', sessErr)
          await Promise.race([
            supabase.auth.signOut({ scope: 'local' }).catch(() => {}),
            new Promise((r) => setTimeout(r, 3000)),
          ])
          if (!mounted) return
          writeCachedProfile(null)
          setSession(null); setProfile(null); setLoading(false); return
        }

        if (!data.session) {
          // Không có session → clear cache & cho UI vào /login ngay
          writeCachedProfile(null)
          setSession(null); setProfile(null); setLoading(false); return
        }

        // Có session — set + unblock UI NGAY. Capture sang biến local để
        // giữ type narrowing trong async IIFE bên dưới.
        const sess = data.session
        setSession(sess)

        // Stale cache check: cache còn nhưng của user khác → bỏ
        const cached = readCachedProfile()
        if (cached && cached.user.id !== sess.user.id) {
          // eslint-disable-next-line no-console
          console.warn('[V75] Cached profile thuộc user khác, clear:', cached.user.id, '!=', sess.user.id)
          writeCachedProfile(null)
          setProfile(null)
        }

        setLoading(false)

        // ===== Background tasks (không block UI) =====
        ;(async () => {
          // 1. Probe session bằng getUser() để phát hiện sớm refresh
          //    token hỏng. Có timeout 8s để không treo background.
          try {
            const probe = await Promise.race([
              supabase.auth.getUser(),
              new Promise<{ data: { user: null }; error: Error }>((resolve) =>
                setTimeout(() => resolve({ data: { user: null }, error: new Error('getUser timeout 8s') }), 8000),
              ),
            ])
            if (!mounted) return
            if (probe.error || !probe.data?.user) {
              // eslint-disable-next-line no-console
              console.warn('[V75] Background session probe failed, clearing local session:', probe.error)
              await Promise.race([
                supabase.auth.signOut({ scope: 'local' }).catch(() => {}),
                new Promise((r) => setTimeout(r, 3000)),
              ])
              if (!mounted) return
              writeCachedProfile(null)
              setSession(null); setProfile(null)
              return
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[V75] Background probe threw (bỏ qua):', e)
            // Probe lỗi mạng — vẫn cứ thử loadProfile, profile cache vẫn dùng được
          }

          // 2. Refresh profile từ DB (cập nhật cache)
          if (mounted) await loadProfile(sess.user.id)
        })()
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[V75] AuthProvider init threw:', e)
        await Promise.race([
          supabase.auth.signOut({ scope: 'local' }).catch(() => {}),
          new Promise((r) => setTimeout(r, 3000)),
        ])
        if (!mounted) return
        writeCachedProfile(null)
        setSession(null); setProfile(null); setLoading(false)
      } finally {
        if (mounted) clearTimeout(hardTimeout)
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
      // supabase-js phát INITIAL_SESSION khi mount/F5. Main path useEffect đã xử lý
      // rồi → bỏ qua để tránh 2 lần loadProfile đồng thời.
      if (event === 'INITIAL_SESSION') return
      if (s?.user) {
        await loadProfile(s.user.id)
      } else {
        setProfile(null)
        writeCachedProfile(null)
      }
    })
    return () => { mounted = false; clearTimeout(hardTimeout); sub.subscription.unsubscribe() }
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
      return { ok: false, message: 'Sai CCCD hoặc mật khẩu.' } as const
    }

    // 3. Reset failed_attempts + last_login (RLS cho phép self-update)
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
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    writeCachedProfile(null)
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
    //    bất kể DB update có thành công hay không. Đồng thời cập nhật cache để
    //    F5 không bị bounce về /change-password.
    setProfile(prev => {
      if (!prev) return prev
      const next: AuthProfile = { ...prev, user: { ...prev.user, must_change_password: false } }
      writeCachedProfile(next)
      return next
    })

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
