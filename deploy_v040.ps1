# =====================================================================
# V75 — Deploy v0.4.0 (Audit server-side)
# =====================================================================
# Tiền đề:
#   1) Đã apply migration 005 trên Supabase (qvcqkciobetttltlqqjq) → 10
#      trigger trg_audit_* đã tồn tại.
#   2) Đã `netlify link` site luminous-marigold-a337b6 (làm 1 lần ở phiên 4).
# Chạy: mở PowerShell ở thư mục dự án, gõ:
#   .\deploy_v040.ps1
# =====================================================================

$ErrorActionPreference = 'Stop'

Write-Host "==== V75 deploy v0.4.0 ====" -ForegroundColor Cyan

# 0. Kiểm tra đang ở đúng folder
$proj = 'D:\ClaudePro\V75-Hệ thống lương'
if ((Get-Location).Path -ne $proj) {
  Write-Host "→ Chuyển sang $proj" -ForegroundColor Yellow
  Set-Location $proj
}

# 1. Type-check (đảm bảo sau khi xoá logActivity TS không lỗi)
Write-Host "`n[1/3] Type-check..." -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ Type-check FAIL — không tiếp tục build" -ForegroundColor Red
  exit 1
}

# 2. Build
Write-Host "`n[2/3] Vite build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ Build FAIL" -ForegroundColor Red
  exit 1
}

# 3. Deploy
Write-Host "`n[3/3] Netlify deploy --prod..." -ForegroundColor Cyan
netlify deploy --prod --dir=dist
if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ Deploy FAIL" -ForegroundColor Red
  exit 1
}

Write-Host "`n✅ Deploy v0.4.0 OK. Vào https://luminous-marigold-a337b6.netlify.app/ test." -ForegroundColor Green
Write-Host "   Checklist nhanh:" -ForegroundColor Green
Write-Host "   - Login truong_phong (001199000003)" -ForegroundColor Green
Write-Host "   - Chấm công → khối Văn phòng → sửa 1 ô → Lưu" -ForegroundColor Green
Write-Host "   - Supabase Dashboard → activity_logs → thấy log mới với user_cccd='001199000003'" -ForegroundColor Green
