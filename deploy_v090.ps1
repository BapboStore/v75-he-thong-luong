# deploy_v090.ps1 - V75 v0.9.0: admin-create-user Edge Function
$ErrorActionPreference = "Stop"
Set-Location "D:\ClaudePro\V75-He thong luong" 2>$null
if ($LASTEXITCODE -ne 0) {
    Set-Location "D:\ClaudePro\V75-H thong lng" 2>$null
}
# Set to correct folder
cd "D:\ClaudePro\V75-H`u1ec7 th`u1ed1ng l`u01b0`u01a1ng" 2>$null
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== DEPLOY V0.9.0 ===" -ForegroundColor Cyan

Write-Host "[1/4] typecheck..." -ForegroundColor Yellow
npm run typecheck
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL typecheck" -ForegroundColor Red; exit 1 }

Write-Host "[2/4] build..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL build" -ForegroundColor Red; exit 1 }

Write-Host "[3/4] deploy Edge Function admin-create-user..." -ForegroundColor Yellow
supabase functions deploy admin-create-user --project-ref qvcqkciobetttltlqqjq
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL edge function" -ForegroundColor Red; exit 1 }

Write-Host "[4/4] git commit + push..." -ForegroundColor Yellow
git add -A
git commit -m "feat: v0.9.0 - admin-create-user Edge Function + UI"
git push
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL git push" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Green
Write-Host "Check Netlify: https://app.netlify.com/sites/luminous-marigold-a337b6/deploys" -ForegroundColor Cyan
