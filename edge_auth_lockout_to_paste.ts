// =====================================================================
// Edge Function: auth-lockout (V75, phiên 11, v0.8.0)
// ---------------------------------------------------------------------
// File STANDALONE để paste vào Supabase Dashboard.
// CORS đã inline (không cần _shared/cors.ts).
//
// HƯỚNG DẪN UPLOAD QUA DASHBOARD:
//   1. Vào https://supabase.com/dashboard/project/qvcqkciobetttltlqqjq/functions
//   2. Bấm "Create a new function"
//   3. Function name: auth-lockout
//   4. Verify JWT: TẮT  ⚠️ QUAN TRỌNG (vì caller chưa login)
//   5. Paste TOÀN BỘ nội dung file này vào editor → Deploy.
//   6. Sau khi deploy, vào tab "Secrets" của project (Settings → Edge
//      Functions → Secrets), set:
//        Name:  SUPABASE_SERVICE_ROLE_KEY
//        Value: <service_role key từ Settings → API>
//      (Nếu đã set khi deploy admin-reset-password thì KHÔNG cần set lại,
//       secret dùng chung cho mọi Edge Function của project.)
// =====================================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_FAILED   = 5
const LOCK_MINUTES = 5

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
  is_active: boolean
}

interface ResponseBody {
  ok: true
  locked: boolean
  failed_attempts: number
  remaining_seconds: number
  remaining_attempts: number
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
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

    const { data: u, error: uErr } = await admin
      .from('users')
      .select('id, cccd, failed_attempts, locked_until, is_active')
      .eq('cccd', body.cccd)
      .maybeSingle<UserRow>()

    if (uErr) {
      return json({ ok: false, error: `Lỗi đọc users: ${uErr.message}` }, 500)
    }

    if (!u) {
      return jsonOk({
        locked: false,
        failed_attempts: 0,
        remaining_seconds: 0,
        remaining_attempts: MAX_FAILED,
      })
    }

    const now = Date.now()
    const lockedUntilMs = u.locked_until ? new Date(u.locked_until).getTime() : 0
    const stillLocked = lockedUntilMs > now

    if (body.action === 'check') {
      return jsonOk({
        locked: stillLocked,
        failed_attempts: u.failed_attempts ?? 0,
        remaining_seconds: stillLocked ? Math.ceil((lockedUntilMs - now) / 1000) : 0,
        remaining_attempts: Math.max(0, MAX_FAILED - (u.failed_attempts ?? 0)),
      })
    }

    if (body.action === 'reset') {
      const { error: rErr } = await admin
        .from('users')
        .update({ failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() })
        .eq('id', u.id)
      if (rErr) {
        return json({ ok: false, error: `Reset thất bại: ${rErr.message}` }, 500)
      }
      return jsonOk({
        locked: false,
        failed_attempts: 0,
        remaining_seconds: 0,
        remaining_attempts: MAX_FAILED,
      })
    }

    // action = increment
    if (stillLocked) {
      return jsonOk({
        locked: true,
        failed_attempts: u.failed_attempts ?? 0,
        remaining_seconds: Math.ceil((lockedUntilMs - now) / 1000),
        remaining_attempts: 0,
      })
    }

    const newFailed = (u.failed_attempts ?? 0) + 1
    let newLockedUntil: string | null = null
    if (newFailed >= MAX_FAILED) {
      newLockedUntil = new Date(now + LOCK_MINUTES * 60_000).toISOString()
    }

    const { error: iErr } = await admin
      .from('users')
      .update({
        failed_attempts: newFailed,
        locked_until: newLockedUntil,
      })
      .eq('id', u.id)
    if (iErr) {
      return json({ ok: false, error: `Increment thất bại: ${iErr.message}` }, 500)
    }

    return jsonOk({
      locked: newLockedUntil !== null,
      failed_attempts: newFailed,
      remaining_seconds: newLockedUntil ? LOCK_MINUTES * 60 : 0,
      remaining_attempts: Math.max(0, MAX_FAILED - newFailed),
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
