# deploy_v0110.ps1 — Deploy v0.11.0 (Báo cáo tổng hợp + Nâng bậc hàng loạt)
# Chạy: .\deploy_v0110.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "`n=== V0.11.0 DEPLOY ===" -ForegroundColor Cyan
Write-Host "Tính năng: Báo cáo tổng hợp lương (/reports) + Nâng bậc hàng loạt`n"

# Bước 1: TypeScript check
Write-Host "[1/3] TypeScript typecheck..." -ForegroundColor Yellow
npm run typecheck
Write-Host "    OK`n" -ForegroundColor Green

# Bước 2: Build
Write-Host "[2/3] Build production..." -ForegroundColor Yellow
npm run build
Write-Host "    OK`n" -ForegroundColor Green

# Bước 3: Deploy thẳng lên Netlify production
Write-Host "[3/3] Netlify deploy --prod..." -ForegroundColor Yellow
netlify deploy --prod --dir=dist
Write-Host "    OK`n" -ForegroundColor Green

Write-Host "=== DEPLOY HOÀN TẤT ===" -ForegroundColor Green
Write-Host "Mở để kiểm tra:"
Write-Host "https://luminous-marigold-a337b6.netlify.app/" -ForegroundColor Cyan
Write-Host "`nSmoke test theo HUONG_DAN_PHIEN_15.md — mục C1-C6."
