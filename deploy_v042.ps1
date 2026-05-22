# =====================================================================
# V75 — Deploy v0.4.2 (loadProfile song song)
# =====================================================================
$ErrorActionPreference = 'Stop'

Write-Host "==== V75 deploy v0.4.2 ====" -ForegroundColor Cyan

$proj = 'D:\ClaudePro\V75-Hệ thống lương'
if ((Get-Location).Path -ne $proj) {
  Write-Host "→ Chuyển sang $proj" -ForegroundColor Yellow
  Set-Location $proj
}

Write-Host "`n[1/3] Type-check..." -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Type-check FAIL" -ForegroundColor Red; exit 1 }

Write-Host "`n[2/3] Vite build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Build FAIL" -ForegroundColor Red; exit 1 }

Write-Host "`n[3/3] Netlify deploy --prod..." -ForegroundColor Cyan
netlify deploy --prod --dir=dist
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Deploy FAIL" -ForegroundColor Red; exit 1 }

Write-Host "`n✅ Deploy v0.4.2 OK." -ForegroundColor Green
Write-Host "   Đo nhanh:" -ForegroundColor Green
Write-Host "   - Lần F5 đầu (cold start): kỳ vọng < 10s vào trang đầy đủ" -ForegroundColor Green
Write-Host "   - Lần F5 ngay sau đó (warm): kỳ vọng < 3s" -ForegroundColor Green
Write-Host "   - Nếu cả 2 lần đều chậm → screenshot Network panel cho Claude" -ForegroundColor Yellow
