// =====================================================================
// Edge Function: admin-reset-password (V75, phiên 11, v0.8.0)
// ---------------------------------------------------------------------
// Mục đích:
//   Cho phép admin_he_thong reset mật khẩu của 1 user bất kỳ về '8888V75'
//   + đặt cờ must_change_password = true (user phải đổi MK lần đăng nhập
//   kế tiếp). Trước đây phải chạy thủ công `seed-users.mjs` từ máy
//   admin → bất tiện và lộ service_role key.
//
// Bảo mật:
//   - Function dùng SERVICE_ROLE_KEY (lấy từ Supabase secrets, KHÔNG
//     hard-code, KHÔNG expose ra client).
//   - Verify caller bằng JWT (anon-key call có JWT của user đang login)
//     → query `users` lấy role → chỉ cho phép 'admin_he_thong'.
//   - Không cho admin tự reset chính mình (tránh phá phiên đăng nhập).
//
// Body request (JSON):
//   { "user_id": "<UUID của row trong public.users (KHÔNG phải auth.users)>" }
//
// Response (200):
//   { "ok": true, "cccd": "<cccd>", "message": "..." }
// Response (4xx/5xx):
//   { "ok": false, "error": "<message>" }
//
// Deploy:
//   supabase functions deploy admin-reset-password --project-ref qvcqkciobetttltlqqjq
//   (cần secret SUPABASE_SERVICE_ROLE_KEY đã set ở Project Settings →
//    Edge Functions → Secrets, hoặc chạy:
//    supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<key> --project-ref qvcqkciobetttltlqqjq)
// =====================================================================

// @ts-expect-error Deno imports — chạy trên Edge runtime, không phải Node
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
// @ts-expect-error Deno imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeaders } from '../_shared/cors.ts'

const DEFAULT_PASSWORD = '8888V75'

interface RequestBody {
  user_id: string
}

serve(async (req: Request) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }

  try {
    // ===== 1. Đọc env =====
    // @ts-expect-error Deno global
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    // @ts-expect-error Deno global
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    // @ts-expect-error Deno global
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
      return json({ ok: false, error: 'Thiếu env. Cần SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY.' }, 500)
    }

    // ===== 2. Lấy JWT caller từ header Authorization =====
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ ok: false, error: 'Thiếu Authorization header.' }, 401)
    }

    // Client với JWT caller (RLS-aware) để verify caller
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: callerAuth, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !callerAuth?.user) {
      return json({ ok: false, error: 'JWT không hợp lệ hoặc đã hết hạn.' }, 401)
    }
    const callerAuthId = callerAuth.user.id

    // ===== 3. Lấy role caller từ public.users =====
    // Dùng service client để bypass RLS (đảm bảo luôn đọc được role caller)
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: callerRow, error: roleErr } = await adminClient
      .from('users')
      .select('id, role, cccd')
      .eq('id', callerAuthId)
      .maybeSingle()

    if (roleErr) {
      return json({ ok: false, error: `Lỗi đọc role caller: ${roleErr.message}` }, 500)
    }
    if (!callerRow) {
      return json({ ok: false, error: 'Caller không có record trong bảng users.' }, 403)
    }
    if (callerRow.role !== 'admin_he_thong') {
      return json({ ok: false, error: `Role '${callerRow.role}' không có quyền reset mật khẩu. Chỉ admin_he_thong.` }, 403)
    }

    // ===== 4. Parse body =====
    let body: RequestBody
    try {
      body = await req.json() as RequestBody
    } catch {
      return json({ ok: false, error: 'Body không phải JSON hợp lệ.' }, 400)
    }
    if (!body?.user_id || typeof body.user_id !== 'string') {
      return json({ ok: false, error: 'Thiếu user_id (UUID).' }, 400)
    }
    if (body.user_id === callerAuthId) {
      return json({ ok: false, error: 'Không được reset mật khẩu của chính mình.' }, 400)
    }

    // ===== 5. Lấy target user =====
    const { data: targetRow, error: tErr } = await adminClient
      .from('users')
      .select('id, cccd, role')
      .eq('id', body.user_id)
      .maybeSingle()

    if (tErr) {
      return json({ ok: false, error: `Lỗi đọc target user: ${tErr.message}` }, 500)
    }
    if (!targetRow) {
      return json({ ok: false, error: 'Target user không tồn tại.' }, 404)
    }

    // ===== 6. Reset MK qua Auth Admin API =====
    const { error: updErr } = await adminClient.auth.admin.updateUserById(targetRow.id, {
      password: DEFAULT_PASSWORD,
    })
    if (updErr) {
      return json({ ok: false, error: `Reset mật khẩu Auth thất bại: ${updErr.message}` }, 500)
    }

    // ===== 7. Set cờ must_change_password = true + reset failed_attempts =====
    const { error: dbErr } = await adminClient
      .from('users')
      .update({
        must_change_password: true,
        failed_attempts: 0,
        locked_until: null,
      })
      .eq('id', targetRow.id)

    if (dbErr) {
      return json({
        ok: false,
        error: `Reset MK Auth OK nhưng update cờ must_change_password thất bại: ${dbErr.message}. Vui lòng vào trang Users sửa thủ công.`,
      }, 500)
    }

    // ===== 8. Ghi audit log (fire-and-forget) =====
    adminClient.from('activity_logs').insert({
      user_id: callerAuthId,
      user_cccd: callerRow.cccd,
      action: 'admin.password_reset',
      entity_type: 'users',
      entity_id: targetRow.id,
      new_value: { target_cccd: targetRow.cccd, reset_to: 'default' },
    }).then(() => {/* ignore */}).catch(() => {/* ignore */})

    return json({
      ok: true,
      cccd: targetRow.cccd,
      message: `Đã reset mật khẩu user ${targetRow.cccd} về mặc định. User sẽ phải đổi MK ở lần đăng nhập kế tiếp.`,
    }, 200)

  } catch (e) {
    return json({
      ok: false,
      error: e instanceof Error ? e.message : 'Lỗi không xác định ở Edge Function.',
    }, 500)
  }
})

function json(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
