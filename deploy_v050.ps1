# =====================================================================
# V75 — Deploy v0.5.0 (Module 5 mở màn: trang /logs)
# =====================================================================
$ErrorActionPreference = 'Stop'

Write-Host "==== V75 deploy v0.5.0 ====" -ForegroundColor Cyan

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

Write-Host "`n✅ Deploy v0.5.0 OK." -ForegroundColor Green
Write-Host "   Smoke test sau deploy:" -ForegroundColor Green
Write-Host "   1) Login admin_he_thong (001199000001)" -ForegroundColor Green
Write-Host "   2) Menu trái có mục 'Nhật ký hoạt động'" -ForegroundColor Green
Write-Host "   3) Mở /logs → bảng list log + filter + nút Chi tiết hiện JSON" -ForegroundColor Green
Write-Host "   4) Vào Phòng ban tạo / sửa 1 phòng → log mới xuất hiện trong /logs" -ForegroundColor Green
Write-Host "   5) Login user thường → không thấy menu Nhật ký + truy cập /logs sẽ vào /unauthorized" -ForegroundColor Yellow
