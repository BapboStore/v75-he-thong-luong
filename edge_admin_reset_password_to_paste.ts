// =====================================================================
// Edge Function: admin-reset-password (V75, phiên 11, v0.8.0)
// ---------------------------------------------------------------------
// File STANDALONE để paste vào Supabase Dashboard.
// CORS đã inline (không cần _shared/cors.ts).
//
// HƯỚNG DẪN UPLOAD QUA DASHBOARD:
//   1. Vào https://supabase.com/dashboard/project/qvcqkciobetttltlqqjq/functions
//   2. Bấm "Create a new function"
//   3. Function name: admin-reset-password
//   4. Verify JWT: BẬT (mặc định)
//   5. Paste TOÀN BỘ nội dung file này vào editor → Deploy.
//   6. Sau khi deploy, vào tab "Secrets" của project (Settings → Edge
//      Functions → Secrets), set:
//        Name:  SUPABASE_SERVICE_ROLE_KEY
//        Value: <service_role key từ Settings → API>
// =====================================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEFAULT_PASSWORD = '8888V75'

interface RequestBody {
  user_id: string
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
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
      return json({ ok: false, error: 'Thiếu env. Cần SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY.' }, 500)
    }

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
    const callerAuthId = callerAuth.user.id

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

    const { error: updErr } = await adminClient.auth.admin.updateUserById(targetRow.id, {
      password: DEFAULT_PASSWORD,
    })
    if (updErr) {
      return json({ ok: false, error: `Reset mật khẩu Auth thất bại: ${updErr.message}` }, 500)
    }

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
        error: `Reset MK Auth OK nhưng update cờ must_change_password thất bại: ${dbErr.message}.`,
      }, 500)
    }

    return json({
      ok: true,
      cccd: targetRow.cccd,
      message: `Đã reset mật khẩu user ${targetRow.cccd} về mặc định.`,
    }, 200)

  } catch (e) {
    return json({
      ok: false,
      error: e instanceof Error ? e.message : 'Lỗi không xác định.',
    }, 500)
  }
})

function json(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
