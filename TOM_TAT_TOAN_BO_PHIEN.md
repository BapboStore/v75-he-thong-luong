# V75 Hệ thống lương — Tóm tắt toàn bộ phiên làm việc

> **Cập nhật lần cuối: Ca 20A+B (chốt) — 2026-06-21**
> Đọc TOÀN BỘ mục I + II trước khi bắt đầu ca mới. Không cần đọc phần lịch sử phiên cũ.

---

## I. THÔNG TIN HẠ TẦNG & TÀI KHOẢN

### Tài khoản (tất cả dùng manhcuong.forever@gmail.com + đăng nhập qua Google/Gmail)

| Dịch vụ | Tài khoản | Ghi chú |
|---|---|---|
| **Supabase** | manhcuong.forever@gmail.com | Login qua Google. Project: `V75-hethongluong` |
| **Netlify** | manhcuong.forever@gmail.com | Login qua Google. Site: `luminous-marigold-a337b6` |
| **Resend** | manhcuong.forever@gmail.com | Login qua Google. Dùng để gửi email cảnh báo nâng bậc |

### Hạ tầng kỹ thuật

| Hạng mục | Chi tiết |
|---|---|
| Folder dự án | `G:\Data\ClaudePro\V75-Hệ thống lương` |
| Frontend | Vite + React 18 + TypeScript + TailwindCSS + shadcn-style UI |
| Backend | Supabase project ref: `qvcqkciobetttltlqqjq` · region: ap-northeast-2 (Seoul) |
| DB password | `Ma1yeuMa1123` (psql/pgAdmin trực tiếp — KHÔNG phải anon/service key) |
| Netlify URL | https://luminous-marigold-a337b6.netlify.app |
| Git | **Chỉ local**, chưa có GitHub remote |
| Version live | **0.14.1** ✓ deployed ca 20A+B (2026-06-21) |

### Supabase CLI — cách login

Supabase CLI phải dùng **Personal Access Token** (không dùng browser vì Edge/Chrome khác tài khoản):
1. Vào https://supabase.com/dashboard/account/tokens (Chrome, đã login manhcuong.forever@gmail.com)
2. **Generate new token** → No expiry → Copy
3. Chạy: `supabase login --token <token>`

> Token hiện tại đã tạo (No expiry). Nếu mất: tạo token mới theo bước trên.
> Token nhạy cảm — lưu trong CLAUDE.md (đã gitignore), KHÔNG lưu ở đây.

---

## II. TRẠNG THÁI HIỆN TẠI (quan trọng nhất)

### Migrations DB

| Migration | Trạng thái |
|---|---|
| 001 initial_schema | ✓ Applied |
| 002 rls_policies | ✓ Applied |
| 003 seed_data | ✓ Applied |
| 004 salary_records_constraints | ✓ Applied |
| 005 audit_triggers | ✓ Applied |
| 006 audit_optimize | ✓ Applied |
| 007 log_cleanup_cron | ✓ Applied — pg_cron `v75_cleanup_activity_logs` chạy 03:15 UTC/ngày |
| 008 tnvk_promotion_cron | ✓ Applied — cron `v75_monthly_tnvk_promotion` chạy 00:30 ngày 1/tháng |
| 009 escalated_lockout | ✓ Applied ca 17A — cột `lockout_count` trong bảng `users` |
| 010 cron_email_alert | ⏳ Tuỳ chọn — cần DBA setup GUC `app.service_role_key` trước khi apply |
| 011 salary_trend_rpc | ✓ Applied ca 19A — RPC `get_salary_trend(p_months)` GROUP BY server-side |

### Edge Functions (Supabase)

| Function | Trạng thái | Ghi chú |
|---|---|---|
| admin-create-user | ✓ Deployed | verify_jwt=true |
| admin-delete-user | ✓ Deployed | verify_jwt=true |
| admin-reset-password | ✓ Deployed ca 17A | verify_jwt=true · có audit log |
| auth-lockout | ✓ Deployed ca 17A | --no-verify-jwt · escalated lockout 5'/15'/60' |
| send-promotion-alert | ✓ Deployed ca 17A | --no-verify-jwt · gọi Resend API |

### Secrets Supabase (đã set)

| Secret | Giá trị | Ghi chú |
|---|---|---|
| SUPABASE_SERVICE_ROLE_KEY | (lấy ở Project Settings → API) | Dùng bởi admin Edge Functions |
| RESEND_API_KEY | (lấy ở resend.com/api-keys) | Dùng bởi send-promotion-alert |
| ALERT_EMAIL_TO | manhcuong.forever@gmail.com | Email nhận cảnh báo nâng bậc |
| ALERT_EMAIL_FROM | onboarding@resend.dev | Email gửi đi (Resend test domain) |

> Giá trị thực của key nhạy cảm: lưu trong CLAUDE.md (gitignore).

### Lệnh deploy nhanh

```powershell
# Frontend
.\deploy.ps1 -Frontend

# Edge Function cụ thể
.\deploy.ps1 -Functions "send-promotion-alert"

# Cả hai
.\deploy.ps1 -Frontend -Functions "auth-lockout,admin-reset-password"
```

---

## III. 8 DEMO USER

| CCCD | Role | Phòng |
|---|---|---|
| 001199000001 | admin_he_thong | TCHC_VP |
| 001199000002 | admin_luong | KTTC |
| 001199000003 | truong_phong | KTTC |
| 001199000004 | truong_phong | KHKD |
| 001199000005 | user | KTTC |
| 001199000006 | user | KHKD |
| 001199000007 | user | DX_NGHIADO |
| 001199000008 | user | TCHC_BV |

Mật khẩu lần đầu: `8888V75` (đăng nhập lần đầu sẽ buộc đổi).

---

## IV. KIẾN TRÚC MODULE

### Module 1 — Auth & nền tảng
Login bằng CCCD → email `cccd@v75.local`. Lockout server-side qua Edge Function `auth-lockout` (escalated: 5'/15'/60'). Cache AuthProfile localStorage → F5 nhanh kể cả cold start.

### Module 2 — CRUD nghiệp vụ
DepartmentsPage · EmployeesPage (20+ trường, **hard delete có kiểm tra FK**) · ConfigPage (versioned salary_config) · UsersPage (tạo/xoá/reset password/lock).

### Module 3 — Chấm công
AttendancePage: 4 khối (Office/Security/Technician/Driver). Workflow: draft → pending → locked. Driver (RULE-06): 2 nguồn truong_phong + admin_luong phải khớp 11 chỉ tiêu (tolerance 0.001). **Mở chốt** (locked→draft): chỉ admin_luong/admin_he_thong. **Xoá bảng công**: toàn bộ phòng+tháng+khối.

### Module 4 — Bảng lương
SalaryPage + PayslipPage. Workflow: draft → pending → approved → cancelled. Trigger DB chặn sửa sau approved. Thuế TNCN lũy tiến TT 111/2013. **Xoá bảng lương**: từng dòng hoặc cả tháng (kể cả approved — chỉ admin).

### Module 5 — Tiện ích
- `/logs` — Nhật ký hoạt động (filter + paginate 50 + dialog JSON) · Xuất CSV
- SalaryPage — Xuất Excel (SheetJS)
- PayslipPage — Xuất PDF (jsPDF + html2canvas A5)
- `/promotions` — Nâng bậc TNVK (đơn lẻ + hàng loạt) · Gửi email cảnh báo (Resend)
- `/reports` — Báo cáo tổng hợp (BarChart theo phòng + LineChart xu hướng nhiều tháng) · Xuất Excel 2 sheet

### Audit log
Server-side hoàn toàn qua Postgres trigger `trg_audit_<table>` (migration 005+006). Client không gọi logActivity. Các Edge Function ghi thêm audit cho: tạo user, xoá user, reset password, gửi email, cron TNVK.

---

## V. KIẾN TRÚC FILE

```
src/
├── App.tsx                   Router + route guard
├── contexts/AuthContext.tsx  Auth + cache localStorage
├── lib/
│   ├── api.ts                CRUD tập trung (không gọi supabase trực tiếp từ page)
│   ├── supabase.ts           Client + fetch timeout 20s
│   ├── payroll.ts            Tính lương + thuế TNCN
│   ├── excel.ts              Xuất Excel (SheetJS) + CSV
│   ├── pdf.ts                Xuất PDF (jsPDF + html2canvas)
│   ├── types.ts              TypeScript types toàn dự án
│   └── log.ts                STUB no-op (audit đã server-side từ v0.4.0)
├── pages/                    14 page
└── components/               Header · Sidebar · Layout · ProtectedRoute · ui/

supabase/
├── migrations/               001–009 (010 chưa apply)
├── functions/
│   ├── _shared/cors.ts
│   ├── admin-create-user/
│   ├── admin-delete-user/
│   ├── admin-reset-password/
│   ├── auth-lockout/
│   └── send-promotion-alert/
└── scripts/seed-users.mjs    (không cần nữa — có UI tạo user)

.claude/settings.json         Permissions allowlist (npm, netlify, supabase)
deploy.ps1                    Script deploy tái sử dụng
CLAUDE.md                     Thông tin nhạy cảm + quy trình (gitignore)
```

---

## VI. LỊCH CA LÀM VIỆC (phiên 17+)

> Mỗi ca giữ context ≤ 75%. Đầu ca đọc file này, cuối ca cập nhật trạng thái.

| Ca | Nội dung | Context | Trạng thái |
|---|---|---|---|
| 17A | Deploy v0.12.0 + migration 009 + Edge Functions + secrets | ~25% | ✓ XONG |
| 17B | Permissions + CLAUDE.md + deploy.ps1 | ~32% | ✓ XONG |
| 18A | Fix timestamp UTC→VN (api.ts:461) + driver match batch upsert (api.ts:826) | ~45% | ✓ XONG |
| 18B | Cache salaryGrades module-level + promoteEmployee JOIN 1 query | ~42% | ✓ XONG |
| 19A | Migration 011: aggregate salary trend server-side (GROUP BY tháng) | ~55% | ✓ XONG |
| 19B | Skeleton loader Dashboard + KPI auto-refresh 5 phút | ~65% | ✓ XONG |
| 20A | Mobile responsive: sidebar hamburger + bảng scroll ngang | ~72% | ✓ XONG |
| 20B | Phân trang PromotionsPage + Export PDF báo cáo tổng hợp | ~70% | ✓ XONG |
| 20B+ | Xoá NV/bảng lương/chấm công (hard delete) · Mở chốt chấm công | ~85% | ✓ XONG |
| 21A | Nhập dữ liệu TCHC T6-2026: tạo 6 NV mới + update lương (cần CCCD) | — | ⏳ |

---

## VII. CHANGELOG VERSION

| Version | Nội dung | Deploy |
|---|---|---|
| 0.1–0.2 | Module 1+2: Auth + CRUD | ✓ |
| 0.3.0–0.3.4 | Module 3+4: Attendance + Salary + hotfix batch/timeout | ✓ |
| 0.4.0–0.4.3 | Audit server-side + loadProfile parallel + cache localStorage | ✓ |
| 0.5.0 | /logs: Nhật ký hoạt động | ✓ |
| 0.6.0 | Xuất Excel + CSV + pg_cron log cleanup | ✓ |
| 0.7.0 | Xuất PDF phiếu lương + cron TNVK (migration 008) | ✓ |
| 0.8.0 | /promotions + Edge Function reset password + lockout server-side | ✓ |
| 0.9.0 | Edge Function admin-create-user + UI tạo tài khoản | ✓ |
| 0.10.0 | Edge Function admin-delete-user + audit log tạo/xoá user | ✓ |
| 0.11.0 | Nâng bậc hàng loạt + /reports báo cáo tổng hợp + biểu đồ | ✓ |
| **0.12.0** | Audit reset password · Escalated lockout · Email Resend · Xu hướng lương | ✓ |
| **0.12.1** | Fix timestamp UTC→VN filter nhật ký · Driver match batch upsert 1 request | ✓ |
| **0.12.2** | Bulk promote song song Promise.all · Skeleton loader 8 trang | ✓ |
| **0.12.3** | Cache salaryGrades module-level · promoteEmployee 2 round-trip (grades từ cache) | ✓ |
| **0.13.0** | Migration 011 RPC get_salary_trend · fetchSalaryTrend server-side GROUP BY | ✓ |
| **0.13.1** | Dashboard KPI cards (4 chỉ số) + skeleton loader + auto-refresh 5 phút | ✓ |
| **0.14.0** | Mobile sidebar hamburger · Phân trang PromotionsPage · Export PDF báo cáo | ✓ |
| **0.14.1** | Xoá nhân viên hard-delete · Xoá bảng lương/chấm công · Mở chốt chấm công | ✓ Live |
