# Hướng dẫn Deploy & Kiểm thử – Phiên 16 (v0.12.0)

> **Tính năng mới:**
> 1. Audit log reset password (admin-reset-password)
> 2. Escalated lockout — lần 1 → 5', lần 2 → 15', lần 3+ → 1h
> 3. Email cảnh báo nâng bậc (Edge Function `send-promotion-alert` + Resend)
> 4. Báo cáo xu hướng nhiều tháng (tab Xu hướng + LineChart trong /reports)

---

## 1. Điều kiện tiên quyết

| Điều kiện | Trạng thái |
|-----------|-----------|
| v0.11.0 đã deploy thành công | ✅ Done |
| `package.json` version = `0.12.0` | ✅ Done |
| `Sidebar.tsx` label đã cập nhật | ✅ Done |
| Build sạch (2720 modules, 0 TS error) | ✅ Done |
| Có tài khoản Resend (resend.com) + API key | Cần kiểm tra |
| Đã set Supabase secrets (xem mục 3) | Cần làm |

---

## 2. Deploy Frontend + Edge Functions

Chạy script trong PowerShell (thư mục dự án):

```powershell
Set-Location "G:\Data\ClaudePro\V75-Hệ thống lương"
.\deploy_v0120.ps1
```

Script thực hiện:
1. `npx tsc --noEmit` — TypeScript check (phải pass)
2. `npm run build` — Build Vite (phải thấy `✓ 2720 modules transformed`)
3. `netlify deploy --prod --dir=dist` — Deploy frontend
4. Deploy 3 Edge Functions:
   - `admin-reset-password`
   - `auth-lockout --no-verify-jwt`
   - `send-promotion-alert --no-verify-jwt`

**Nếu Netlify chưa login:**
```powershell
netlify login
```

---

## 3. Apply Migration 009 (bắt buộc)

Thêm cột `lockout_count` vào bảng `users` — cần thiết cho escalated lockout.

1. Mở Supabase Dashboard → SQL Editor
2. Paste toàn bộ nội dung file: `009_escalated_lockout_to_paste.sql`
3. Nhấn **Run**
4. Kiểm tra: `SELECT lockout_count FROM users LIMIT 1;` — phải trả về 0

**Nội dung migration (tham khảo nhanh):**
```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS lockout_count INTEGER NOT NULL DEFAULT 0;
```

---

## 4. Set Supabase Secrets (cho email alert)

Chạy trong terminal (thay giá trị thực):

```powershell
supabase secrets set `
  RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxxx" `
  ALERT_EMAIL_TO="admin@cty.vn" `
  ALERT_EMAIL_FROM="V75 Luong <noreply@cty.vn>" `
  --project-ref qvcqkciobetttltlqqjq
```

> **Lấy RESEND_API_KEY:** Đăng nhập resend.com → API Keys → Create API Key

---

## 5. Apply Migration 010 (tuỳ chọn — cron tự gửi email)

Migration này cấu hình pg_cron để tự động gửi email cảnh báo vào đầu mỗi tháng.

### 5a. Set DB setting cho pg_net

Trong SQL Editor:

```sql
ALTER DATABASE postgres SET app.service_role_key = '<SERVICE_ROLE_KEY>';
SELECT pg_reload_conf();
```

> **Lấy SERVICE_ROLE_KEY:** Supabase Dashboard → Project Settings → API → `service_role` key (secret)

### 5b. Apply migration

Paste nội dung `010_cron_email_alert_to_paste.sql` vào SQL Editor → Run.

### 5c. Kiểm tra cron job

```sql
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'monthly-tnvk-promotion-alert';
```

Nên thấy: schedule = `0 7 1 * *` (7:00 sáng ngày 1 hàng tháng).

---

## 6. Kiểm thử (Smoke Tests)

### 6.1 Audit log reset password

1. Đăng nhập với tài khoản `admin_he_thong`
2. Vào **Tài khoản & Phân quyền** → chọn một user → **Reset mật khẩu**
3. Vào **Nhật ký hoạt động** → tìm entry có `action = admin.password_reset`
4. Kiểm tra cột `new_value` chứa `target_cccd` và `reset_to: default`

✅ **Pass:** Entry xuất hiện trong log với đủ thông tin.

---

### 6.2 Escalated lockout

**Lần 1 (5 phút):**
1. Đăng xuất, thử đăng nhập với user test bằng sai mật khẩu 5 lần
2. Lần thứ 5 phải thấy thông báo bị khoá ~5 phút

**Lần 2 (15 phút) — sau khi hết khoá lần 1:**
1. Đăng nhập đúng (unlock), rồi đăng xuất
2. Lại sai MK 5 lần → lần này bị khoá ~15 phút

**Lần 3+ (60 phút):**
1. Tương tự → khoá ~60 phút

**Reset lockout_count:**
```sql
UPDATE users SET lockout_count = 0, failed_attempts = 0, locked_until = NULL WHERE cccd = 'CCCD_CUA_USER_TEST';
```

✅ **Pass:** Thời gian khoá leo thang đúng 5' / 15' / 60'.

---

### 6.3 Email cảnh báo nâng bậc

**Test thủ công qua UI:**
1. Đăng nhập với `admin_luong` hoặc `admin_he_thong`
2. Vào **Nâng bậc TNVK**
3. Chỉnh **Số ngày tới** (ví dụ: 365 để thấy nhiều record)
4. Nhấn **Gửi email cảnh báo**
5. Kiểm tra hộp thư `ALERT_EMAIL_TO`

**Test thủ công qua curl (nếu cần debug):**
```bash
# Lấy JWT của user admin trước
curl -X POST https://qvcqkciobetttltlqqjq.supabase.co/functions/v1/send-promotion-alert \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"days_ahead": 365}'
```

Kết quả mong đợi:
```json
{ "ok": true, "sent": true, "count": N, "to": "admin@cty.vn", "message": "Đã gửi email..." }
```

Nếu không có TNVK sắp đến hạn:
```json
{ "ok": true, "sent": false, "count": 0, "message": "Không có nhân viên nào..." }
```

✅ **Pass:** Email nhận được, định dạng HTML đúng, có danh sách nhân viên sắp hết hạn.

---

### 6.4 Báo cáo xu hướng nhiều tháng

1. Đăng nhập với `admin_luong` hoặc `admin_he_thong`
2. Vào **Báo cáo / Xuất file**
3. Nhấn tab **Xu hướng nhiều tháng**
4. Chọn số tháng (6 / 12 / 18 / 24 tháng)
5. Kiểm tra LineChart hiển thị 3 đường: Quỹ lương, Thực lĩnh, Thuế TNCN
6. Kiểm tra bảng dữ liệu phía dưới chart

✅ **Pass:** Chart render đúng, bảng có đủ cột tháng, số liệu khớp với bảng lương đã nhập.

---

## 7. Checklist hoàn thành phiên 16

- [ ] `.\deploy_v0120.ps1` chạy thành công (0 error)
- [ ] Frontend Netlify live: https://luminous-marigold-a337b6.netlify.app
- [ ] Migration 009 applied (cột `lockout_count` tồn tại)
- [ ] Supabase secrets set (RESEND_API_KEY, ALERT_EMAIL_TO, ALERT_EMAIL_FROM)
- [ ] Smoke test 6.1 — Audit log reset password: PASS
- [ ] Smoke test 6.2 — Escalated lockout: PASS
- [ ] Smoke test 6.3 — Email cảnh báo: PASS
- [ ] Smoke test 6.4 — Xu hướng lương: PASS
- [ ] (Tuỳ chọn) Migration 010 + pg_net setup applied

---

## 8. Rollback (nếu cần)

**Rollback frontend** — deploy lại phiên trước:
```powershell
# Build lại từ tag v0.11.0 (nếu đã tag)
git checkout v0.11.0
npm run build
netlify deploy --prod --dir=dist
```

**Rollback migration 009:**
```sql
ALTER TABLE public.users DROP COLUMN IF EXISTS lockout_count;
```

**Rollback Edge Function auth-lockout** — deploy lại version cũ từ git.

---

*Tạo bởi Claude – Phiên 16 – v0.12.0*
