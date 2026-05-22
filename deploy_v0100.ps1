# deploy_v0100.ps1 - V75 v0.10.0: Xoa user + Audit log tao user
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== DEPLOY V0.10.0 ===" -ForegroundColor Cyan

Write-Host "[1/5] typecheck..." -ForegroundColor Yellow
npm run typecheck
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL typecheck" -ForegroundColor Red; exit 1 }

Write-Host "[2/5] build..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL build" -ForegroundColor Red; exit 1 }

Write-Host "[3/5] deploy Edge Function admin-create-user (da them audit log)..." -ForegroundColor Yellow
supabase functions deploy admin-create-user --project-ref qvcqkciobetttltlqqjq
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL edge function admin-create-user" -ForegroundColor Red; exit 1 }

Write-Host "[4/5] deploy Edge Function admin-delete-user (moi)..." -ForegroundColor Yellow
supabase functions deploy admin-delete-user --project-ref qvcqkciobetttltlqqjq
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL edge function admin-delete-user" -ForegroundColor Red; exit 1 }

Write-Host "[5/5] git commit + push -> Netlify auto-build..." -ForegroundColor Yellow
git add -A
git commit -m "feat: v0.10.0 - xoa user + audit log tao user"
git push
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL git push" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Green
Write-Host "Check Netlify: https://app.netlify.com/sites/luminous-marigold-a337b6/deploys" -ForegroundColor Cyan
Write-Host ""
Write-Host "Smoke test:" -ForegroundColor Yellow
Write-Host "  1. Login admin_he_thong -> /users -> Sidebar hien v0.10.0"
Write-Host "  2. Tao user moi -> /logs -> filter action=admin.create_user -> co log"
Write-Host "  3. Xoa user vua tao -> confirm dialog -> user bien mat khoi bang"
Write-Host "  4. /logs -> filter action=admin.delete_user -> co log"
Write-Host "  5. Thu xoa chinh minh -> phai bao loi 'khong the xoa'"
