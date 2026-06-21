# =====================================================================
# Deploy v0.12.0 — V75 Hệ thống lương (phiên 16)
# Tính năng mới:
#   1. Audit log reset password (admin-reset-password)
#   2. Escalated lockout — lần 1→5p, lần 2→15p, lần 3+→1h
#   3. Email cảnh báo nâng bậc (Edge Function send-promotion-alert + Resend)
#   4. Báo cáo xu hướng nhiều tháng (tab Xu hướng + LineChart trong /reports)
#
# Tiền đề:
#   - Migration 009 (lockout_count) đã apply.
#   - Migration 010 (pg_net email) đã apply (tùy chọn).
#   - Supabase secrets đã set: RESEND_API_KEY, ALERT_EMAIL_TO, ALERT_EMAIL_FROM.
#   - Edge Function send-promotion-alert đã deploy.
# =====================================================================

Set-Location "G:\Data\ClaudePro\V75-Hệ thống lương"

Write-Host "=== STEP 1: TypeScript check ===" -ForegroundColor Cyan
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { Write-Host "TypeScript error!" -ForegroundColor Red; exit 1 }

Write-Host "=== STEP 2: Build ===" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed!" -ForegroundColor Red; exit 1 }

Write-Host "=== STEP 3: Deploy frontend to Netlify ===" -ForegroundColor Cyan
netlify deploy --prod --dir=dist
if ($LASTEXITCODE -ne 0) { Write-Host "Netlify deploy failed!" -ForegroundColor Red; exit 1 }

Write-Host "=== STEP 4: Deploy Edge Functions ===" -ForegroundColor Cyan
supabase functions deploy admin-reset-password --project-ref qvcqkciobetttltlqqjq
supabase functions deploy auth-lockout --no-verify-jwt --project-ref qvcqkciobetttltlqqjq
supabase functions deploy send-promotion-alert --no-verify-jwt --project-ref qvcqkciobetttltlqqjq

Write-Host ""
Write-Host "=== DEPLOY XONG ===" -ForegroundColor Green
Write-Host "Nhac nho sau khi deploy:" -ForegroundColor Yellow
Write-Host "  1. Apply migration 009: paste noi dung 009_escalated_lockout_to_paste.sql vao SQL Editor"
Write-Host "  2. Apply migration 010 (tuy chon): paste 010_cron_email_alert_to_paste.sql"
Write-Host "  3. Set secrets neu chua set:"
Write-Host "     supabase secrets set RESEND_API_KEY=re_xxx ALERT_EMAIL_TO=admin@cty.vn ALERT_EMAIL_FROM='V75 Luong <noreply@cty.vn>' --project-ref qvcqkciobetttltlqqjq"
Write-Host "  4. Set DB setting cho pg_net (migration 010):"
Write-Host "     ALTER DATABASE postgres SET app.service_role_key = '<SERVICE_ROLE_KEY>';"
Write-Host "     SELECT pg_reload_conf();"
