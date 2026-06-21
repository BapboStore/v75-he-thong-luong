// =====================================================================
// Edge Function: send-promotion-alert (V75, phiên 16, v0.12.0)
// ---------------------------------------------------------------------
// Mục đích:
//   Gửi email cảnh báo qua Resend API khi có NV sắp đến hạn nâng bậc.
//   Có thể gọi từ 2 nguồn:
//     1. Admin_luong / admin_he_thong bấm nút "Gửi email" trên UI /promotions
//        → gửi kèm JWT user trong Authorization header.
//     2. Postgres cron job (pg_net) gọi tự động đầu mỗi tháng
//        → gửi kèm SERVICE_ROLE_KEY trong Authorization header.
//
// Auth:
//   - Deploy với --no-verify-jwt (vì pg_net không có JWT).
//   - Trong hàm: kiểm tra bearer token:
//     a) Nếu bearer == SERVICE_ROLE_KEY → đây là system call (pg_cron).
//     b) Ngược lại → decode JWT thủ công bằng caller client → verify role.
//
// Env vars (Supabase secrets):
//   SUPABASE_URL            — tự inject
//   SUPABASE_ANON_KEY       — tự inject
//   SUPABASE_SERVICE_ROLE_KEY — tự inject
//   RESEND_API_KEY          — CẦN SET THỦ CÔNG (supabase secrets set)
//   ALERT_EMAIL_TO          — email nhận cảnh báo, ví dụ "admin@company.vn"
//                              Nhiều địa chỉ: cách nhau bằng dấu phẩy.
//   ALERT_EMAIL_FROM        — email gửi (phải là domain đã verify ở Resend)
//                              Mặc định "V75 Lương <noreply@yourdomain.com>"
//
// Deploy:
//   supabase functions deploy send-promotion-alert --no-verify-jwt \
//     --project-ref qvcqkciobetttltlqqjq
//
// Test thủ công (sau khi set secrets):
//   curl -X POST https://qvcqkciobetttltlqqjq.supabase.co/functions/v1/send-promotion-alert \
//     -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
//     -H "Content-Type: application/json" \
//     -d '{"days_ahead": 30}'
// =====================================================================

// @ts-expect-error Deno imports
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
// @ts-expect-error Deno imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeaders } from '../_shared/cors.ts'

interface UpcomingRow {
  employee_id: string
  cccd: string
  ho_ten: string
  ngach_code: string
  bac: number
  ngay_huong_bac: string
  next_promotion_date: string
  days_remaining: number
}

interface RequestBody {
  days_ahead?: number
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }

  try {
    // ===== 1. Đọc env =====
    // @ts-expect-error Deno global
    const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')
    // @ts-expect-error Deno global
    const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    // @ts-expect-error Deno global
    const ANON_KEY           = Deno.env.get('SUPABASE_ANON_KEY')
    // @ts-expect-error Deno global
    const RESEND_API_KEY     = Deno.env.get('RESEND_API_KEY')
    // @ts-expect-error Deno global
    const ALERT_EMAIL_TO     = Deno.env.get('ALERT_EMAIL_TO')
    // @ts-expect-error Deno global
    const ALERT_EMAIL_FROM   = Deno.env.get('ALERT_EMAIL_FROM') || 'V75 Lương <noreply@example.com>'

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
      return json({ ok: false, error: 'Thiếu SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY.' }, 500)
    }
    if (!RESEND_API_KEY) {
      return json({ ok: false, error: 'Chưa set RESEND_API_KEY. Chạy: supabase secrets set RESEND_API_KEY=<key> --project-ref qvcqkciobetttltlqqjq' }, 500)
    }
    if (!ALERT_EMAIL_TO) {
      return json({ ok: false, error: 'Chưa set ALERT_EMAIL_TO (email nhận cảnh báo). Chạy: supabase secrets set ALERT_EMAIL_TO=<email> ...' }, 500)
    }

    // ===== 2. Xác thực caller =====
    const authHeader = req.headers.get('Authorization') || ''
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    let callerLabel = 'system (pg_cron)'
    let callerCccd: string | null = null

    if (bearer === SERVICE_ROLE_KEY) {
      // Gọi từ pg_cron / hệ thống — tin tưởng hoàn toàn
      callerLabel = 'system (pg_cron)'
    } else if (bearer) {
      // Gọi từ UI — verify JWT
      const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: callerAuth, error: callerErr } = await callerClient.auth.getUser()
      if (callerErr || !callerAuth?.user) {
        return json({ ok: false, error: 'JWT không hợp lệ hoặc đã hết hạn.' }, 401)
      }
      const { data: callerRow } = await adminClient
        .from('users')
        .select('role, cccd')
        .eq('id', callerAuth.user.id)
        .maybeSingle()
      if (!callerRow || !['admin_luong', 'admin_he_thong'].includes(callerRow.role)) {
        return json({ ok: false, error: 'Chỉ admin_luong / admin_he_thong được gửi email cảnh báo.' }, 403)
      }
      callerLabel = `user (${callerRow.cccd})`
      callerCccd = callerRow.cccd
    } else {
      return json({ ok: false, error: 'Thiếu Authorization header.' }, 401)
    }

    // ===== 3. Parse body =====
    let body: RequestBody = {}
    try {
      body = await req.json() as RequestBody
    } catch { /* body có thể rỗng */ }
    const daysAhead = Math.min(Math.max(body.days_ahead ?? 30, 1), 365)

    // ===== 4. Lấy danh sách NV sắp đến hạn =====
    const { data: rows, error: rpcErr } = await adminClient
      .rpc('check_upcoming_promotions', { p_days_ahead: daysAhead })
    if (rpcErr) {
      return json({ ok: false, error: `Lỗi gọi RPC check_upcoming_promotions: ${rpcErr.message}` }, 500)
    }

    const promotions = (rows ?? []) as UpcomingRow[]

    // Nếu không có NV nào sắp đến hạn → log nhưng không gửi email
    if (promotions.length === 0) {
      await logActivity(adminClient, callerCccd, daysAhead, 0, 'Không có NV sắp đến hạn, không gửi email.')
      return json({
        ok: true,
        sent: false,
        message: `Không có NV nào đến hạn nâng bậc trong ${daysAhead} ngày tới. Không gửi email.`,
      })
    }

    // ===== 5. Build email HTML =====
    const urgent = promotions.filter(r => r.days_remaining <= 7)
    const soon   = promotions.filter(r => r.days_remaining > 7 && r.days_remaining <= 30)
    const later  = promotions.filter(r => r.days_remaining > 30)

    const subject = `[V75] Cảnh báo nâng bậc: ${promotions.length} NV sắp đến hạn (${daysAhead} ngày)`

    const tableRows = promotions.map((r) => {
      const color = r.days_remaining <= 7 ? '#dc2626' : r.days_remaining <= 30 ? '#d97706' : '#16a34a'
      const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString('vi-VN') : '—'
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${r.ho_ten}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:13px">${r.cccd}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${r.ngach_code} / bậc ${r.bac} → <strong>${r.bac + 1}</strong></td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${fmtDate(r.next_promotion_date)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:${color};font-weight:600">${r.days_remaining} ngày</td>
        </tr>`
    }).join('')

    const html = `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:sans-serif;color:#1f2937;background:#f9fafb;padding:24px">
  <div style="max-width:700px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <h2 style="margin-top:0;color:#111827">🔔 Cảnh báo nâng bậc TNVK</h2>
    <p>Hệ thống V75 ghi nhận <strong>${promotions.length} nhân viên</strong> sắp đến hạn nâng bậc trong <strong>${daysAhead} ngày</strong> tới:</p>

    <div style="display:flex;gap:16px;margin:16px 0">
      ${urgent.length > 0 ? `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:12px 20px;text-align:center"><div style="font-size:24px;font-weight:700;color:#dc2626">${urgent.length}</div><div style="font-size:12px;color:#6b7280">Khẩn (≤7 ngày)</div></div>` : ''}
      ${soon.length > 0 ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:12px 20px;text-align:center"><div style="font-size:24px;font-weight:700;color:#d97706">${soon.length}</div><div style="font-size:12px;color:#6b7280">Sắp đến (≤30 ngày)</div></div>` : ''}
      ${later.length > 0 ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:12px 20px;text-align:center"><div style="font-size:24px;font-weight:700;color:#16a34a">${later.length}</div><div style="font-size:12px;color:#6b7280">Theo dõi (>30 ngày)</div></div>` : ''}
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e5e7eb;font-weight:600">Họ tên</th>
          <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e5e7eb;font-weight:600">CCCD</th>
          <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e5e7eb;font-weight:600">Ngạch / Bậc</th>
          <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e5e7eb;font-weight:600">Đến hạn</th>
          <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e5e7eb;font-weight:600">Còn lại</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>

    <p style="margin-top:24px;font-size:13px;color:#6b7280">
      Vào <a href="https://luminous-marigold-a337b6.netlify.app/promotions" style="color:#4f46e5">trang Nâng bậc</a>
      để xử lý trực tiếp.<br>
      Email này được gửi ${callerLabel === 'system (pg_cron)' ? 'tự động bởi cron job' : `bởi admin ${callerCccd ?? ''}`}
      lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} (giờ VN).
    </p>
  </div>
</body>
</html>`

    // ===== 6. Gửi email qua Resend =====
    const toList = ALERT_EMAIL_TO.split(',').map((e: string) => e.trim()).filter(Boolean)

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: ALERT_EMAIL_FROM,
        to: toList,
        subject,
        html,
      }),
    })

    const resendJson = await resendRes.json().catch(() => ({})) as Record<string, unknown>
    if (!resendRes.ok) {
      const errMsg = (resendJson.message as string) || resendRes.statusText
      await logActivity(adminClient, callerCccd, daysAhead, promotions.length, `Gửi email thất bại: ${errMsg}`)
      return json({ ok: false, error: `Resend API lỗi (${resendRes.status}): ${errMsg}` }, 500)
    }

    // ===== 7. Ghi audit log =====
    await logActivity(adminClient, callerCccd, daysAhead, promotions.length,
      `Gửi email cảnh báo thành công → ${toList.join(', ')} (Resend ID: ${resendJson.id ?? 'unknown'})`)

    return json({
      ok: true,
      sent: true,
      count: promotions.length,
      to: toList,
      resend_id: resendJson.id,
      message: `Đã gửi email cảnh báo ${promotions.length} NV đến hạn → ${toList.join(', ')}.`,
    })

  } catch (e) {
    return json({
      ok: false,
      error: e instanceof Error ? e.message : 'Lỗi không xác định.',
    }, 500)
  }
})

async function logActivity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  callerCccd: string | null,
  daysAhead: number,
  count: number,
  description: string,
) {
  await client.from('activity_logs').insert({
    user_id: null,
    user_cccd: callerCccd,
    action: 'system.promotion_email_alert',
    entity_type: 'system',
    new_value: { days_ahead: daysAhead, promotion_count: count },
    description,
  }).then(() => {/* ignore */}).catch(() => {/* ignore */})
}

function json(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
