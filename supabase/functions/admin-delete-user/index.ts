// =====================================================================
// Edge Function: admin-delete-user (V75, phiên 14, v0.10.0)
// ---------------------------------------------------------------------
// Mục đích:
//   Cho phép admin_he_thong xóa hoàn toàn 1 tài khoản:
//   - Xóa khỏi Supabase Auth (auth.users)
//   - Xóa khỏi public.users
//   - Ghi audit log action='admin.delete_user'
//
// Bảo vệ:
//   - Chỉ admin_he_thong được gọi (verify JWT).
//   - Không cho xóa chính mình.
//   - Không cho xóa khi hệ thống còn đúng 1 admin_he_thong (tránh lockout).
//
// Body request (JSON):
//   { "user_id": "<UUID>" }
//
// Response (200):
//   { "ok": true, "cccd": "...", "message": "..." }
// Response (4xx/5xx):
//   { "ok": false, "error": "..." }
//
// Deploy:
//   supabase functions deploy admin-delete-user --project-ref qvcqkciobetttltlqqjq
// =====================================================================

// @ts-expect-error Deno imports
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
// @ts-expect-error Deno imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    // ===== 2. Verify JWT caller =====
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ ok: false, error: 'Thiếu Authorization header.' }, 401)
    }

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: callerAuth, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !callerAuth?.user) {
      return json({ ok: false, error: 'JWT không hợp lệ hoặc đã hết hạn.' }, 401)
    }

    // ===== 3. Kiểm tra role caller = admin_he_thong =====
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: callerRow, error: roleErr } = await adminClient
      .from('users')
      .select('role, cccd')
      .eq('id', callerAuth.user.id)
      .maybeSingle()

    if (roleErr) {
      return json({ ok: false, error: `Lỗi đọc role: ${roleErr.message}` }, 500)
    }
    if (!callerRow || callerRow.role !== 'admin_he_thong') {
      return json({ ok: false, error: 'Chỉ admin_he_thong mới được xóa tài khoản.' }, 403)
    }

    // ===== 4. Parse body =====
    let body: { user_id?: string }
    try {
      body = await req.json()
    } catch {
      return json({ ok: false, error: 'Body không phải JSON hợp lệ.' }, 400)
    }

    const targetUserId = (body?.user_id ?? '').trim()
    if (!targetUserId) {
      return json({ ok: false, error: 'Thiếu user_id.' }, 400)
    }

    // ===== 5. Không cho xóa chính mình =====
    if (targetUserId === callerAuth.user.id) {
      return json({ ok: false, error: 'Không thể xóa tài khoản của chính mình.' }, 400)
    }

    // ===== 6. Đọc thông tin target user =====
    const { data: targetRow, error: targetErr } = await adminClient
      .from('users')
      .select('cccd, role')
      .eq('id', targetUserId)
      .maybeSingle()

    if (targetErr) {
      return json({ ok: false, error: `Lỗi đọc thông tin user: ${targetErr.message}` }, 500)
    }
    if (!targetRow) {
      return json({ ok: false, error: 'Không tìm thấy user trong hệ thống.' }, 404)
    }

    // ===== 7. Không xóa admin_he_thong cuối cùng =====
    if (targetRow.role === 'admin_he_thong') {
      const { count, error: countErr } = await adminClient
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin_he_thong')
        .eq('is_active', true)

      if (countErr) {
        return json({ ok: false, error: `Lỗi kiểm tra admin: ${countErr.message}` }, 500)
      }
      if ((count ?? 0) <= 1) {
        return json({
          ok: false,
          error: 'Không thể xóa admin_he_thong duy nhất của hệ thống. Cần tạo admin khác trước.',
        }, 400)
      }
    }

    // ===== 8. Xóa khỏi public.users trước (để tránh orphan trong DB) =====
    const { error: dbDeleteErr } = await adminClient
      .from('users')
      .delete()
      .eq('id', targetUserId)

    if (dbDeleteErr) {
      return json({ ok: false, error: `Xóa public.users thất bại: ${dbDeleteErr.message}` }, 500)
    }

    // ===== 9. Xóa khỏi auth.users =====
    const { error: authDeleteErr } = await adminClient.auth.admin.deleteUser(targetUserId)

    if (authDeleteErr) {
      // Rollback: không thể khôi phục public.users row đã xóa dễ dàng
      // Nhưng ghi log lỗi để admin biết cần xử lý thủ công
      void (async () => {
        try {
          await adminClient.from('activity_logs').insert({
            user_cccd: callerRow.cccd ?? null,
            action: 'admin.delete_user_auth_failed',
            entity_type: 'users',
            entity_id: targetUserId,
            old_value: { cccd: targetRow.cccd, role: targetRow.role },
            new_value: { error: authDeleteErr.message, note: 'public.users đã xóa, auth.users chưa xóa được' },
          })
        } catch (_e) { /* bỏ qua */ }
      })()
      return json({
        ok: false,
        error: `Đã xóa public.users nhưng xóa auth.users thất bại: ${authDeleteErr.message}. Cần xóa thủ công trong Supabase Dashboard → Authentication → Users.`,
      }, 500)
    }

    // ===== 10. Ghi audit log =====
    void (async () => {
      try {
        await adminClient.from('activity_logs').insert({
          user_cccd: callerRow.cccd ?? null,
          action: 'admin.delete_user',
          entity_type: 'users',
          entity_id: targetUserId,
          old_value: { cccd: targetRow.cccd, role: targetRow.role },
          new_value: null,
        })
      } catch (_e) { /* bỏ qua */ }
    })()

    return json({
      ok: true,
      cccd: targetRow.cccd,
      message: `Đã xóa tài khoản ${targetRow.cccd} (${targetRow.role}) khỏi hệ thống.`,
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
