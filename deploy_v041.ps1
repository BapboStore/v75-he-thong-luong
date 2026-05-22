# =====================================================================
# V75 — Deploy v0.4.1 (hotfix: AuthContext hard timeout + audit tối ưu)
# =====================================================================
# Tiền đề:
#   - v0.4.0 đã deploy. Migration 005 đã apply nhưng đang gây chậm/treo.
#   - Migration 006 KHUYẾN NGHỊ apply trước khi deploy v0.4.1, nhưng
#     KHÔNG bắt buộc — hard timeout phía client cũng cứu được trường hợp
#     treo do trigger chậm.
# =====================================================================

$ErrorActionPreference = 'Stop'

Write-Host "==== V75 deploy v0.4.1 ====" -ForegroundColor Cyan

$proj = 'D:\ClaudePro\V75-Hệ thống lương'
if ((Get-Location).Path -ne $proj) {
  Write-Host "→ Chuyển sang $proj" -ForegroundColor Yellow
  Set-Location $proj
}

# 1. Type-check
Write-Host "`n[1/3] Type-check..." -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Type-check FAIL" -ForegroundColor Red; exit 1 }

# 2. Build
Write-Host "`n[2/3] Vite build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Build FAIL" -ForegroundColor Red; exit 1 }

# 3. Deploy
Write-Host "`n[3/3] Netlify deploy --prod..." -ForegroundColor Cyan
netlify deploy --prod --dir=dist
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Deploy FAIL" -ForegroundColor Red; exit 1 }

Write-Host "`n✅ Deploy v0.4.1 OK." -ForegroundColor Green
Write-Host "   Test ngay:" -ForegroundColor Green
Write-Host "   - Tab Ẩn danh → Ctrl+Shift+R → app phải lên trong < 3s" -ForegroundColor Green
Write-Host "   - Login + sửa 1 ô Chấm công → kỳ vọng save < 2s" -ForegroundColor Green
Write-Host "   - F5 trang đang làm việc → KHÔNG được treo > 8s ('Đang kiểm tra phiên đăng nhập...')" -ForegroundColor Green
Write-Host "   - Nếu vẫn chậm: chạy ROLLBACK_AUDIT_TEST.sql để cô lập" -ForegroundColor Yellow
