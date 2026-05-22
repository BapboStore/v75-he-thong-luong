# =====================================================================
# V75 - Deploy v0.8.0 (Phien 11: Nang bac TNVK + Reset PW + Lockout)
# =====================================================================
# Goi y chay:
#   cd "D:\ClaudePro\V75-He thong luong"
#   .\deploy_v080.ps1
#
# Phien 11 KHONG them dependency npm moi. Chi can:
#   1. Type-check + build + netlify deploy --prod (frontend)
#   2. Deploy 2 Edge Functions:
#        - admin-reset-password (verify_jwt = true, default)
#        - auth-lockout         (verify_jwt = false, can goi truoc khi login)
#   3. Set secret SUPABASE_SERVICE_ROLE_KEY cho Edge runtime (neu chua co)
#
# Tien de:
#   - Supabase CLI da cai (npm i -g supabase hoac winget install supabase)
#   - Da chay: supabase login
#   - Da chay: supabase link --project-ref qvcqkciobetttltlqqjq (1 lan)
# =====================================================================
$ErrorActionPreference = 'Stop'

Write-Host "==== V75 deploy v0.8.0 ====" -ForegroundColor Cyan

$proj = $PSScriptRoot
if ((Get-Location).Path -ne $proj) {
  Write-Host "-> Chuyen sang $proj" -ForegroundColor Yellow
  Set-Location -LiteralPath $proj
}

# ---------------------------------------------------------------------
# [1/5] Type-check
# ---------------------------------------------------------------------
Write-Host "`n[1/5] Type-check..." -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { Write-Host "[X] Type-check FAIL" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------------
# [2/5] Vite build
# ---------------------------------------------------------------------
Write-Host "`n[2/5] Vite build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "[X] Build FAIL" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------------
# [3/5] Netlify deploy --prod
# ---------------------------------------------------------------------
Write-Host "`n[3/5] Netlify deploy --prod..." -ForegroundColor Cyan
netlify deploy --prod --dir=dist
if ($LASTEXITCODE -ne 0) { Write-Host "[X] Netlify deploy FAIL" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------------
# [4/5] Deploy 2 Edge Functions
# ---------------------------------------------------------------------
Write-Host "`n[4/5] Deploy Edge Function admin-reset-password..." -ForegroundColor Cyan
supabase functions deploy admin-reset-password --project-ref qvcqkciobetttltlqqjq
if ($LASTEXITCODE -ne 0) {
  Write-Host "[!] Deploy admin-reset-password FAIL." -ForegroundColor Red
  Write-Host "    Co the do chua chay 'supabase login' hoac chua 'supabase link'." -ForegroundColor Yellow
  Write-Host "    Chay: supabase login; supabase link --project-ref qvcqkciobetttltlqqjq" -ForegroundColor Yellow
  exit 1
}

Write-Host "`n     Deploy Edge Function auth-lockout (--no-verify-jwt)..." -ForegroundColor Cyan
supabase functions deploy auth-lockout --no-verify-jwt --project-ref qvcqkciobetttltlqqjq
if ($LASTEXITCODE -ne 0) {
  Write-Host "[!] Deploy auth-lockout FAIL." -ForegroundColor Red
  exit 1
}

# ---------------------------------------------------------------------
# [5/5] Nhac secret SUPABASE_SERVICE_ROLE_KEY
# ---------------------------------------------------------------------
Write-Host "`n[5/5] Nhac secrets:" -ForegroundColor Yellow
Write-Host "  Ca 2 Edge Function deu can secret SUPABASE_SERVICE_ROLE_KEY." -ForegroundColor Yellow
Write-Host "  Neu chua set, vao Dashboard -> Project Settings -> Edge Functions -> Secrets" -ForegroundColor Yellow
Write-Host "  hoac chay: supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service_role_key> --project-ref qvcqkciobetttltlqqjq" -ForegroundColor Yellow
Write-Host "  Lay service_role key tai: Dashboard -> Project Settings -> API -> service_role (secret)" -ForegroundColor Yellow

Write-Host "`n[OK] Deploy v0.8.0 OK." -ForegroundColor Green
Write-Host "   Smoke test theo HUONG_DAN_PHIEN_11.md muc E (E1-E5)" -ForegroundColor Green
