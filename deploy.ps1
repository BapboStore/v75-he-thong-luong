# deploy.ps1 — Script deploy tái sử dụng cho V75-hethongluong
# Dùng: .\deploy.ps1 [-Frontend] [-Functions "fn1,fn2"] [-SkipBuild]
#
# Ví dụ:
#   .\deploy.ps1 -Frontend                              # build + deploy Netlify
#   .\deploy.ps1 -Functions "auth-lockout"              # deploy 1 Edge Function
#   .\deploy.ps1 -Frontend -Functions "send-promotion-alert,auth-lockout"
#   .\deploy.ps1 -Frontend -SkipBuild                   # chỉ netlify deploy (đã build rồi)

param(
    [switch]$Frontend,
    [string]$Functions = "",
    [switch]$SkipBuild
)

$PROJECT_REF = "qvcqkciobetttltlqqjq"
$NO_JWT_FUNCTIONS = @("send-promotion-alert", "auth-lockout")

$ErrorActionPreference = "Stop"
$success = $true

# ── Frontend ──────────────────────────────────────────────────────────────────
if ($Frontend) {
    if (-not $SkipBuild) {
        Write-Host "`n[1/2] TypeScript check..." -ForegroundColor Cyan
        npm run typecheck
        if ($LASTEXITCODE -ne 0) { Write-Host "TypeScript error — dừng deploy." -ForegroundColor Red; exit 1 }

        Write-Host "`n[2/2] Build..." -ForegroundColor Cyan
        npm run build
        if ($LASTEXITCODE -ne 0) { Write-Host "Build lỗi — dừng deploy." -ForegroundColor Red; exit 1 }
    }

    Write-Host "`nDeploy Netlify production..." -ForegroundColor Cyan
    netlify deploy --prod --dir=dist
    if ($LASTEXITCODE -ne 0) { $success = $false; Write-Host "Netlify deploy thất bại." -ForegroundColor Red }
    else { Write-Host "Frontend deployed OK" -ForegroundColor Green }
}

# ── Edge Functions ────────────────────────────────────────────────────────────
if ($Functions -ne "") {
    $fnList = $Functions -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
    foreach ($fn in $fnList) {
        Write-Host "`nDeploy Edge Function: $fn" -ForegroundColor Cyan
        $noJwt = $NO_JWT_FUNCTIONS -contains $fn
        if ($noJwt) {
            supabase functions deploy $fn --no-verify-jwt --project-ref $PROJECT_REF
        } else {
            supabase functions deploy $fn --project-ref $PROJECT_REF
        }
        if ($LASTEXITCODE -ne 0) { $success = $false; Write-Host "$fn deploy thất bại." -ForegroundColor Red }
        else { Write-Host "$fn deployed OK" -ForegroundColor Green }
    }
}

# ── Kết quả ──────────────────────────────────────────────────────────────────
Write-Host ""
if ($success) {
    Write-Host "Deploy hoàn thành." -ForegroundColor Green
} else {
    Write-Host "Có lỗi trong quá trình deploy. Kiểm tra output phía trên." -ForegroundColor Red
    exit 1
}
