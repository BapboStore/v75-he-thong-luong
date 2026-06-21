// =====================================================================
// Edge Function: auth-lockout (V75, phiên 16, v0.12.0)
// ---------------------------------------------------------------------
// Mục đích:
//   Đếm số lần đăng nhập sai SERVER-SIDE (không bị bypass bằng F5/clear
//   localStorage như client-side cũ). Lưu vào `users.failed_attempts`
//   + `users.locked_until` + `users.lockout_count` (xem migration 009).
//
//   Lockout policy (ESCALATED — phiên 16):
//     - Lần khoá 1 → 5 phút
//     - Lần khoá 2 → 15 phút
//     - Lần khoá 3+ → 60 phút (1 giờ)
//   lockout_count reset về 0 khi login thành công (action='reset').
//
// Cách dùng:
//   - LoginPage gọi function này TRƯỚC khi gọi `auth.signInWithPassword`,
//     truyền action='check' + cccd → trả về { locked, remaining_seconds,
//     failed_attempts, lockout_count }. Nếu locked → block UI.
//   - Sau `auth.signInWithPassword`:
//     - Nếu OK: gọi action='reset' để xoá failed_attempts + lockout_count.
//     - Nếu fail: gọi action='increment' để tăng failed_attempts + tự lock
//       nếu đạt MAX.
//
// Body request (JSON):
//   { "action": "check" | "increment" | "reset", "cccd": "<cccd 9-12 số>" }
//
// Response (200):
//   {
//     "ok": true,
//     "locked": boolean,
//     "failed_attempts": number,
//     "remaining_seconds": number,   // > 0 nếu đang locked
//     "remaining_attempts": number,  // 5 - failed_attempts
//     "lockout_count": number,       // số lần bị khoá lũy tích
//   }
//
// Bảo mật:
//   - Function dùng SERVICE_ROLE_KEY để bypass RLS (cần update bảng users
//     của user chưa login). KHÔNG expose key ra client.
//   - KHÔNG verify JWT caller — function này phải gọi được trước khi user
//     đăng nhập. Bù lại: chỉ thao tác trên cột failed_attempts / locked_until,
//     không expose data sensitive. Rate limit của Edge runtime đủ chặn abuse.
//
// Deploy:
//   supabase functions deploy auth-lockout --no-verify-jwt --project-ref qvcqkciobetttltlqqjq
//
// QUAN TRỌNG: cờ --no-verify-jwt là bắt buộc vì caller chưa có JWT.
//
// Tiền đề: Migration 009 phải được apply trước (thêm cột lockout_count).
// =====================================================================

// @ts-expect-error Deno imports
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
// @ts-expect-error Deno imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeaders } from '../_shared/cors.ts'

const MAX_FAILED = 5

/** Tính số phút khoá dựa trên số lần khoá trước đó (trước khi tăng) */
function lockMinutes(priorLockoutCount: number): number {
  if (priorLockoutCount === 0) return 5      // lần 1 → 5 phút
  if (priorLockoutCount === 1) return 15     // lần 2 → 15 phút
  return 60                                  // lần 3+ → 60 phút
}

type Action = 'check' | 'increment' | 'reset'

interface RequestBody {
  action: Action
  cccd: string
}

interface UserRow {
  id: string
  cccd: string
  failed_attempts: number | null
  locked_until: string | null
  lockout_count: number | null
  is_active: boolean
}

interface ResponseBody {
  ok: true
  locked: boolean
  failed_attempts: number
  remaining_seconds: number
  remaining_attempts: number
  lockout_count: number
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }

  try {
    // @ts-expect-error Deno global
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    // @ts-expect-error Deno global
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ ok: false, error: 'Thiếu env SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.' }, 500)
    }

    let body: RequestBody
    try {
      body = await req.json() as RequestBody
    } catch {
      return json({ ok: false, error: 'Body không phải JSON hợp lệ.' }, 400)
    }

    if (!body?.cccd || !/^\d{9,12}$/.test(body.cccd)) {
      return json({ ok: false, error: 'CCCD phải là 9-12 chữ số.' }, 400)
    }
    if (!['check', 'increment', 'reset'].includes(body.action)) {
      return json({ ok: false, error: 'action phải là check / increment / reset.' }, 400)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Lấy user theo CCCD
    const { data: u, error: uErr } = await admin
      .from('users')
      .select('id, cccd, failed_attempts, locked_until, lockout_count, is_active')
      .eq('cccd', body.cccd)
      .maybeSingle<UserRow>()

    if (uErr) {
      return json({ ok: false, error: `Lỗi đọc users: ${uErr.message}` }, 500)
    }

    // CCCD không tồn tại → vẫn trả response neutral để tránh enumerate user
    if (!u) {
      return jsonOk({
        locked: false,
        failed_attempts: 0,
        remaining_seconds: 0,
        remaining_attempts: MAX_FAILED,
        lockout_count: 0,
      })
    }

    const now = Date.now()
    const lockedUntilMs = u.locked_until ? new Date(u.locked_until).getTime() : 0
    const stillLocked = lockedUntilMs > now
    const curFailed = u.failed_attempts ?? 0
    const curLockoutCount = u.lockout_count ?? 0

    // ---------- action = check ----------
    if (body.action === 'check') {
      return jsonOk({
        locked: stillLocked,
        failed_attempts: curFailed,
        remaining_seconds: stillLocked ? Math.ceil((lockedUntilMs - now) / 1000) : 0,
        remaining_attempts: Math.max(0, MAX_FAILED - curFailed),
        lockout_count: curLockoutCount,
      })
    }

    // ---------- action = reset ----------
    if (body.action === 'reset') {
      const { error: rErr } = await admin
        .from('users')
        .update({
          failed_attempts: 0,
          locked_until: null,
          lockout_count: 0,          // reset lockout escalation khi login thành công
          last_login_at: new Date().toISOString(),
        })
        .eq('id', u.id)
      if (rErr) {
        return json({ ok: false, error: `Reset thất bại: ${rErr.message}` }, 500)
      }
      return jsonOk({
        locked: false,
        failed_attempts: 0,
        remaining_seconds: 0,
        remaining_attempts: MAX_FAILED,
        lockout_count: 0,
      })
    }

    // ---------- action = increment ----------
    // Nếu đang locked thì không tăng nữa (trả số liệu hiện tại)
    if (stillLocked) {
      return jsonOk({
        locked: true,
        failed_attempts: curFailed,
        remaining_seconds: Math.ceil((lockedUntilMs - now) / 1000),
        remaining_attempts: 0,
        lockout_count: curLockoutCount,
      })
    }

    const newFailed = curFailed + 1
    let newLockedUntil: string | null = null
    let newLockoutCount = curLockoutCount

    if (newFailed >= MAX_FAILED) {
      // Tính thời gian khoá dựa trên số lần khoá trước (escalated)
      const mins = lockMinutes(curLockoutCount)
      newLockedUntil = new Date(now + mins * 60_000).toISOString()
      newLockoutCount = curLockoutCount + 1
    }

    const { error: iErr } = await admin
      .from('users')
      .update({
        failed_attempts: newFailed,
        locked_until: newLockedUntil,
        lockout_count: newLockoutCount,
      })
      .eq('id', u.id)
    if (iErr) {
      return json({ ok: false, error: `Increment thất bại: ${iErr.message}` }, 500)
    }

    const lockedNow = newLockedUntil !== null
    return jsonOk({
      locked: lockedNow,
      failed_attempts: newFailed,
      remaining_seconds: lockedNow ? lockMinutes(curLockoutCount) * 60 : 0,
      remaining_attempts: Math.max(0, MAX_FAILED - newFailed),
      lockout_count: newLockoutCount,
    })
  } catch (e) {
    return json({
      ok: false,
      error: e instanceof Error ? e.message : 'Lỗi không xác định.',
    }, 500)
  }
})

function jsonOk(payload: Omit<ResponseBody, 'ok'>): Response {
  return json({ ok: true, ...payload }, 200)
}

function json(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
