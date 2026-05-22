# ============================================================
# setup_github_phien12.ps1
# Phiên 12 — Git commit v0.4.0-v0.8.0 + chuẩn bị push GitHub
# ============================================================

$ErrorActionPreference = "Stop"
$projectDir = "D:\ClaudePro\V75-Hệ thống lương"
Set-Location $projectDir

Write-Host ""
Write-Host "=== PHIÊN 12: Git commit + chuẩn bị GitHub ===" -ForegroundColor Cyan
Write-Host ""

# --- Bước 1: Xóa git lock nếu có ---
$lockFile = Join-Path $projectDir ".git\index.lock"
if (Test-Path $lockFile) {
    Write-Host "[1/5] Xóa git index.lock cũ..." -ForegroundColor Yellow
    Remove-Item $lockFile -Force
    Write-Host "      Done." -ForegroundColor Green
} else {
    Write-Host "[1/5] Không có git lock — OK." -ForegroundColor Green
}

# --- Bước 2: Cài git user (nếu chưa có) ---
Write-Host "[2/5] Cấu hình git user..." -ForegroundColor Yellow
$gitEmail = git config user.email 2>$null
if (-not $gitEmail) {
    git config user.email "manhcuong.forever@gmail.com"
    git config user.name "MC"
}
Write-Host "      user.email = $(git config user.email)" -ForegroundColor Green

# --- Bước 3: Stage toàn bộ (trừ những gì .gitignore đã loại) ---
Write-Host "[3/5] Stage tất cả file (git add -A)..." -ForegroundColor Yellow
git add -A
if ($LASTEXITCODE -ne 0) { Write-Host "git add thất bại!" -ForegroundColor Red; exit 1 }
Write-Host "      Staged OK." -ForegroundColor Green

# --- Bước 4: Commit ---
Write-Host "[4/5] Commit v0.4.0-v0.8.0..." -ForegroundColor Yellow

$commitMsg = @"
feat: v0.4.0-v0.8.0 — phin 4-11 (Module 4-5 + Edge Functions)

Module 4 (Bang luong):
- migration 004: trigger protect_approved_salary_records
- payroll.ts: computePayroll, thueTNCN (TT 111/2013)
- SalaryPage, PayslipPage, AdjustmentDialog

Module 5 — audit server-side (v0.4.x):
- migration 005: trigger audit_row cho 10 bang
- migration 006: bo trg_audit_users + WHEN clause no-op
- Xoa logActivity khoi client

Module 5 — performance auth (v0.4.2-v0.4.3):
- loadProfile song song + cache localStorage + hard timeout
- DashboardPage fallback UI

Module 5 — UI logs (v0.5.0):
- LogsPage: filter 5 chieu + paginate 50 + dialog JSON
- fetchActivityLogs, ActivityLog types

Module 5 — export (v0.6.0):
- excel.ts: exportSalaryToExcel (SheetJS) + exportLogsToCsv
- migration 007: pg_cron clean logs > 6 thang

Module 5 — PDF + cron TNVK (v0.7.0):
- pdf.ts: exportPayslipToPdf (jsPDF + html2canvas, A5)
- migration 008: check_upcoming_promotions + cron job thang

Module 5 — hoan thien (v0.8.0):
- PromotionsPage: UI nang bac TNVK + slider + badge khan cap
- Edge Function admin-reset-password (service_role)
- Edge Function auth-lockout server-side (5 lan/5 phut)
- LoginPage: lockout server-side, bo localStorage
"@

git commit -m $commitMsg
if ($LASTEXITCODE -ne 0) {
    Write-Host "git commit thất bại! Kiểm tra lại." -ForegroundColor Red
    exit 1
}
Write-Host "      Commit OK." -ForegroundColor Green

# --- Bước 5: Đổi branch master → main ---
Write-Host "[5/5] Đổi branch sang 'main'..." -ForegroundColor Yellow
$currentBranch = git branch --show-current
if ($currentBranch -eq "master") {
    git branch -m master main
    Write-Host "      master → main OK." -ForegroundColor Green
} else {
    Write-Host "      Branch hiện tại: $currentBranch — không cần đổi." -ForegroundColor Green
}

# --- Tổng kết ---
Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Git log (2 commit mới nhất):" -ForegroundColor White
git log --oneline -2
Write-Host ""
Write-Host "Tiếp theo:" -ForegroundColor White
Write-Host "  1. Tạo GitHub repo (private) tại: https://github.com/new" -ForegroundColor Yellow
Write-Host "  2. Chạy lệnh (thay YOUR_USERNAME):" -ForegroundColor Yellow
Write-Host "     git remote add origin https://github.com/YOUR_USERNAME/v75-he-thong-luong.git" -ForegroundColor Cyan
Write-Host "     git push -u origin main" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Sau khi push xong: xem HUONG_DAN_PHIEN_12.md mục D để kết nối Netlify." -ForegroundColor Yellow
Write-Host ""
