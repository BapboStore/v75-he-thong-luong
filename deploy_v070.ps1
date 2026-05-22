# =====================================================================
# V75 — Deploy v0.7.0 (Module 5 hoàn thiện: Xuất PDF phiếu + cron TNVK)
# =====================================================================
# File này có UTF-8 BOM ở đầu để PowerShell 5.1 hiểu encoding đúng.
# Dùng $PSScriptRoot thay path hardcode để tránh vỡ parser nếu encoding hỏng.
# =====================================================================
$ErrorActionPreference = 'Stop'

Write-Host "==== V75 deploy v0.7.0 ====" -ForegroundColor Cyan

$proj = $PSScriptRoot
if ((Get-Location).Path -ne $proj) {
  Write-Host "-> Chuyen sang $proj" -ForegroundColor Yellow
  Set-Location -LiteralPath $proj
}

# ---------------------------------------------------------------------
# [0/4] Cai jspdf + html2canvas neu chua co (xlsx da co tu phien 9).
# ---------------------------------------------------------------------
$jspdfPath = Join-Path $proj 'node_modules\jspdf\package.json'
$h2cPath   = Join-Path $proj 'node_modules\html2canvas\package.json'
if ((-not (Test-Path -LiteralPath $jspdfPath)) -or (-not (Test-Path -LiteralPath $h2cPath))) {
  Write-Host "`n[0/4] Cai jspdf + html2canvas..." -ForegroundColor Cyan
  npm install --save 'jspdf@^2.5.2' 'html2canvas@^1.4.1'
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[X] npm install FAIL - kiem tra mang / proxy." -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host "`n[0/4] jspdf + html2canvas da co - bo qua install." -ForegroundColor Green
}

Write-Host "`n[1/4] Type-check..." -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { Write-Host "[X] Type-check FAIL" -ForegroundColor Red; exit 1 }

Write-Host "`n[2/4] Vite build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "[X] Build FAIL" -ForegroundColor Red; exit 1 }

Write-Host "`n[3/4] Netlify deploy --prod..." -ForegroundColor Cyan
netlify deploy --prod --dir=dist
if ($LASTEXITCODE -ne 0) { Write-Host "[X] Deploy FAIL" -ForegroundColor Red; exit 1 }

Write-Host "`n[4/4] Nhac apply migration 008 (cron TNVK + nang bac):" -ForegroundColor Yellow
Write-Host "   - Mo Supabase Dashboard -> SQL Editor (project qvcqkciobetttltlqqjq)" -ForegroundColor Yellow
Write-Host "   - Paste 008_tnvk_promotion_cron_to_paste.sql -> Run" -ForegroundColor Yellow
Write-Host "   - Verify: SELECT * FROM cron.job WHERE jobname = 'v75_monthly_tnvk_promotion'" -ForegroundColor Yellow
Write-Host "   - Chay thu cong 1 lan: SELECT public.run_monthly_tnvk_promotion_job();" -ForegroundColor Yellow

Write-Host "`n[OK] Deploy v0.7.0 OK." -ForegroundColor Green
Write-Host "   Smoke test sau deploy:" -ForegroundColor Green
Write-Host "   1) Login user thuong (001199000005) -> /payslip -> chon thang co data -> bam 'Xuat PDF'" -ForegroundColor Green
Write-Host "   2) File PDF tai ve la A5 doc, tieng Viet hien thi dung" -ForegroundColor Green
Write-Host "   3) Apply 008 + chay thu cong run_monthly_tnvk_promotion_job()" -ForegroundColor Green
Write-Host "   4) Login admin_he_thong -> /logs -> kiem tra co log 'system.tnvk_promotion_job'" -ForegroundColor Green
