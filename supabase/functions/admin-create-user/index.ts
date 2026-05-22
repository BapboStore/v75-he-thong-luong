// =====================================================================
// Edge Function: admin-create-user (V75, phiên 13, v0.9.0)
// ---------------------------------------------------------------------
// Mục đích:
//   Cho phép admin_he_thong tạo tài khoản người dùng mới trực tiếp
//   từ trang /users (không cần chạy seed-users.mjs thủ công).
//   Tạo cả Auth user (email = cccd@v75.local, MK = 8888V75) lẫn
//   row trong public.users.
//
// Bảo mật:
//   - Verify JWT caller → chỉ cho phép admin_he_thong.
//   - SERVICE_ROLE_KEY lấy từ Supabase secrets, không hard-code.
//   - Kiểm tra CCCD chưa tồn tại trước khi tạo (tránh duplicate).
//
// Body request (JSON):
//   {
//     "cccd": "001199000009",       // 9-12 chữ số
//     "role": "user",               // user | truong_phong | admin_luong | admin_he_thong
//     "department_id": "<UUID>",    // optional
//     "employee_id": "<UUID>"       // optional — link tới employees
//   }
//
// Response (200):
//   { "ok": true, "cccd": "...", "user_id": "<UUID>", "message": "..." }
// Response (4xx/5xx):
//   { "ok": false, "error": "..." }
//
// Deploy:
//   supabase functions deploy admin-create-user --project-ref qvcqkciobetttltlqqjq
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

const DEFAULT_PASSWORD = '8888V75'
const VALID_ROLES = ['user', 'truong_phong', 'admin_luong', 'admin_he_thong'] as const
const CCCD_REGEX = /^[0-9]{9,12}$/

interface RequestBody {
  cccd: string
  role: string
  department_id?: string
  employee_id?: string
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
      return json({ ok: false, error: 'Chỉ admin_he_thong mới được tạo tài khoản.' }, 403)
    }

    // ===== 4. Parse + validate body =====
    let body: RequestBody
    try {
      body = await req.json() as RequestBody
    } catch {
      return json({ ok: false, error: 'Body không phải JSON hợp lệ.' }, 400)
    }

    const cccd = (body?.cccd ?? '').trim()
    const role = (body?.role ?? '').trim()
    const department_id = body?.department_id?.trim() || null
    const employee_id = body?.employee_id?.trim() || null

    if (!CCCD_REGEX.test(cccd)) {
      return json({ ok: false, error: 'CCCD phải là 9-12 chữ số.' }, 400)
    }
    if (!VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
      return json({ ok: false, error: `Role không hợp lệ: ${role}` }, 400)
    }

    // ===== 5. Kiểm tra CCCD chưa tồn tại =====
    const { data: existing } = await adminClient
      .from('users')
      .select('cccd')
      .eq('cccd', cccd)
      .maybeSingle()

    if (existing) {
      return json({ ok: false, error: `CCCD ${cccd} đã có tài khoản trong hệ thống.` }, 409)
    }

    // ===== 6. Tạo Auth user =====
    const email = `${cccd}@v75.local`
    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
      email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,   // bypass email confirmation
    })

    if (authErr || !authData?.user) {
      return json({ ok: false, error: `Tạo Auth user thất bại: ${authErr?.message ?? 'Unknown error'}` }, 500)
    }

    const newAuthId = authData.user.id

    // ===== 7. Insert vào public.users =====
    const insertPayload: Record<string, unknown> = {
      id: newAuthId,
      cccd,
      role,
      must_change_password: true,
      failed_attempts: 0,
      is_active: true,
    }
    if (department_id) insertPayload.department_id = department_id
    if (employee_id)  insertPayload.employee_id  = employee_id

    const { error: dbErr } = await adminClient
      .from('users')
      .insert(insertPayload)

    if (dbErr) {
      // Rollback: xóa auth user vừa tạo để tránh orphan
      await adminClient.auth.admin.deleteUser(newAuthId)
      return json({ ok: false, error: `Tạo Auth OK nhưng insert public.users thất bại: ${dbErr.message}. Đã rollback Auth user.` }, 500)
    }

    // ===== 8. Ghi audit log =====
    // Fire-and-forget — không để lỗi log chặn response thành công
    void (async () => {
      try {
        await adminClient.from('activity_logs').insert({
          user_cccd: callerRow.cccd ?? null,
          action: 'admin.create_user',
          entity_type: 'users',
          entity_id: newAuthId,
          old_value: null,
          new_value: { cccd, role, department_id: department_id ?? null, employee_id: employee_id ?? null },
        })
      } catch (_e) {
        // Bỏ qua lỗi log — không làm thất bại request
      }
    })()

    return json({
      ok: true,
      cccd,
      user_id: newAuthId,
      message: `Đã tạo tài khoản ${cccd} với role ${role}. Mật khẩu mặc định: ${DEFAULT_PASSWORD}. User phải đổi MK ở lần đăng nhập đầu tiên.`,
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
