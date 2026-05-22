# =====================================================================
# V75 — Deploy v0.6.0 (Module 5 mở rộng: Excel + CSV + pg_cron)
# =====================================================================
# File này có UTF-8 BOM ở đầu để PowerShell 5.1 hiểu encoding đúng.
# Dùng $PSScriptRoot thay path hardcode để tránh vỡ parser nếu encoding hỏng.
# =====================================================================
$ErrorActionPreference = 'Stop'

Write-Host "==== V75 deploy v0.6.0 ====" -ForegroundColor Cyan

$proj = $PSScriptRoot
if ((Get-Location).Path -ne $proj) {
  Write-Host "→ Chuyển sang $proj" -ForegroundColor Yellow
  Set-Location -LiteralPath $proj
}

# ---------------------------------------------------------------------
# [0/4] Cài SheetJS nếu chưa có (xlsx package phải lấy từ CDN SheetJS,
#       npm registry không còn host nữa).
# ---------------------------------------------------------------------
$xlsxPath = Join-Path $proj 'node_modules\xlsx\package.json'
if (-not (Test-Path -LiteralPath $xlsxPath)) {
  Write-Host "`n[0/4] Cài SheetJS từ CDN..." -ForegroundColor Cyan
  npm install --save 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz'
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[X] npm install xlsx FAIL — kiểm tra mạng / proxy." -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host "`n[0/4] SheetJS đã có sẵn — bỏ qua install." -ForegroundColor Green
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

Write-Host "`n[4/4] Nhắc apply migration 007 (pg_cron):" -ForegroundColor Yellow
Write-Host "   - Mở Supabase Dashboard → SQL Editor (project qvcqkciobetttltlqqjq)" -ForegroundColor Yellow
Write-Host "   - Paste nội dung 007_log_cleanup_cron_to_paste.sql → Run" -ForegroundColor Yellow
Write-Host "   - Verify: SELECT * FROM cron.job WHERE jobname = 'v75_cleanup_activity_logs'" -ForegroundColor Yellow

Write-Host "`n[OK] Deploy v0.6.0 OK." -ForegroundColor Green
Write-Host "   Smoke test sau deploy:" -ForegroundColor Green
Write-Host "   1) Login admin_luong → /salary → chọn phòng + tháng có data → bấm 'Xuất Excel'" -ForegroundColor Green
Write-Host "   2) File .xlsx tải về có header tiêu đề + bảng + dòng TỔNG CỘNG" -ForegroundColor Green
Write-Host "   3) Login admin_he_thong → /logs → bấm 'Xuất CSV'" -ForegroundColor Green
Write-Host "   4) File .csv mở Excel đọc đúng tiếng Việt (BOM UTF-8)" -ForegroundColor Green
Write-Host "   5) Apply 007 + verify cron.job" -ForegroundColor Green
