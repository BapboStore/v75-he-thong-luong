# HƯỚNG DẪN DEPLOY V0.8.0 — PHIÊN 11

> 3 hạng mục lớn của phiên 11:
> 1. **UI quản lý nâng bậc TNVK** — trang `/promotions` cho admin_luong gọi
>    `check_upcoming_promotions()` (đã có sẵn từ migration 008) + nút Nâng
>    bậc làm `bac += 1` + `ngay_huong_bac = today`.
> 2. **Edge Function `admin-reset-password`** — admin_he_thong reset MK 1 user
>    về `8888V75` từ UsersPage, không cần chạy `seed-users.mjs` thủ công nữa.
> 3. **Edge Function `auth-lockout`** — đếm `failed_attempts` SERVER-SIDE
>    (không bị bypass bằng F5/clear localStorage).
>
> Tiền đề: v0.7.0 đã deploy + smoke test OK + migration 008 đã apply.

---

## A. Tóm tắt thay đổi phiên 11

**Mới**

- `src/pages/PromotionsPage.tsx` — trang `/promotions`. Filter slider 7/30/60/90/180 ngày,
  bảng 8 cột (CCCD, Họ tên, Ngạch/Bậc, Bắt đầu bậc, Đến hạn, Còn lại, Trạng thái, Thao tác).
  Badge khẩn cấp: ≤7 ngày = đỏ; ≤30 = vàng; còn lại = xanh. Confirm dialog trước khi nâng bậc.
- `supabase/functions/admin-reset-password/index.ts` — Edge Function reset MK.
  Verify JWT caller → check role = `admin_he_thong` → gọi `auth.admin.updateUserById(..., { password: '8888V75' })`
  → update `users.must_change_password = true` + reset `failed_attempts`/`locked_until`.
  KHÔNG cho admin reset chính mình.
- `supabase/functions/auth-lockout/index.ts` — Edge Function lockout server-side.
  3 action: `check` (đọc), `increment` (sai → +1, lock nếu ≥ 5), `reset` (login OK → xoá).
  Lock policy: 5 lần sai → khoá 5 phút. Dùng SERVICE_ROLE_KEY bypass RLS;
  KHÔNG verify JWT (caller chưa login).
- `supabase/functions/_shared/cors.ts` — CORS headers chia sẻ giữa 2 functions.
- `deploy_v080.ps1` — script deploy frontend + 2 Edge Function.

**Sửa**

- `src/lib/api.ts` — thêm:
  - `interface UpcomingPromotionRow` + `listUpcomingPromotions(daysAhead)` gọi RPC.
  - `promoteEmployee(id)` — validate bậc mới trong `salary_grades` rồi update.
  - `interface AuthLockoutResponse` + `callAuthLockout(action, cccd)` gọi Edge Function.
  - `adminResetPassword(targetUserId)` gọi Edge Function.
- `src/pages/UsersPage.tsx` — thêm nút icon `KeyRound` mở dialog confirm reset MK
  cho mỗi row (TRỪ chính admin đang login). State `resetTarget`, `resetting`, `info`.
- `src/pages/LoginPage.tsx` — refactor lockout:
  - Bỏ `STORAGE_KEY` + helper `getLockState`/`setLockState` (client-side).
  - Thêm `callAuthLockout` ở: `onBlur` ô CCCD (preflight check), trước
    `signInWithPassword` (block nếu locked), sau login OK (reset), sau login fail (increment).
- `src/App.tsx` — thêm route `/promotions` (roles=admin_luong + admin_he_thong) + import.
- `src/components/Sidebar.tsx` — thêm menu "Nâng bậc TNVK" (icon `TrendingUp`),
  cập nhật label phiên bản → `v0.8.0 – Nâng bậc + Reset PW + Lockout`.
- `package.json` — `0.7.0 → 0.8.0`. KHÔNG thêm dependency.

**Không đụng**

- AuthContext, supabase.ts, payroll.ts, excel.ts, pdf.ts.
- Migration 001-008 (đã apply ổn định).
- Pages: Dashboard / Attendance / Salary / Payslip / Logs / Departments / Employees / Config / ChangePassword.

---

## B. Tiền đề (xác nhận từ phiên 10)

1. v0.7.0 đã deploy + smoke test OK (PDF + cron TNVK).
2. Migration 008 đã apply trên Supabase + 3 function (`recalc_tnvk_for_top_grade`,
   `check_upcoming_promotions`, `run_monthly_tnvk_promotion_job`) + cron job
   `v75_monthly_tnvk_promotion` đăng ký thành công.
3. Demo user 8 CCCD đăng nhập bình thường.

---

## C. Tiền đề thêm cho phiên 11

### C1. Cài Supabase CLI (1 lần duy nhất)

```powershell
# Cách 1: scoop (khuyên dùng)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Cách 2: npm global
npm install -g supabase

# Cách 3: winget (Windows 10+)
winget install --id Supabase.CLI
```

Verify:
```powershell
supabase --version
# vd: 1.200.0
```

### C2. Login + link project (1 lần duy nhất)

```powershell
cd "D:\ClaudePro\V75-Hệ thống lương"
supabase login            # mở browser, paste access token
supabase link --project-ref qvcqkciobetttltlqqjq
# Khi hỏi DB password → nhập: Ma1yeuMa1123 (từ CLAUDE.md)
```

### C3. Set secret `SUPABASE_SERVICE_ROLE_KEY` (1 lần duy nhất)

Cả 2 Edge Function cần service_role key để bypass RLS (đọc/ghi `users` không cần JWT).
Lấy key:
- Dashboard → Project Settings → API → **service_role** (secret, ô màu đỏ).
- KHÔNG dùng anon key, KHÔNG commit vào git.

Set vào Edge runtime:

```powershell
# Cách 1: qua CLI (giấu key trong file .env tạm rồi xoá)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... --project-ref qvcqkciobetttltlqqjq

# Cách 2: qua Dashboard → Project Settings → Edge Functions → Secrets → Add new secret
#   Name:  SUPABASE_SERVICE_ROLE_KEY
#   Value: <paste service_role key>
```

Verify:
```powershell
supabase secrets list --project-ref qvcqkciobetttltlqqjq
# Phai thay co SUPABASE_SERVICE_ROLE_KEY
```

> Lưu ý: `SUPABASE_URL` và `SUPABASE_ANON_KEY` được Supabase tự inject vào
> Edge runtime, không cần set thủ công.

---

## D. Deploy — 1 lệnh

```powershell
cd "D:\ClaudePro\V75-Hệ thống lương"
.\deploy_v080.ps1
```

Script thực hiện 5 bước:
1. `npm run typecheck`
2. `npm run build`
3. `netlify deploy --prod --dir=dist`
4. `supabase functions deploy admin-reset-password --project-ref qvcqkciobetttltlqqjq`
5. `supabase functions deploy auth-lockout --no-verify-jwt --project-ref qvcqkciobetttltlqqjq`

> **QUAN TRỌNG**: cờ `--no-verify-jwt` cho `auth-lockout` là bắt buộc vì
> caller (LoginPage) chưa có JWT khi gọi function này.

---

## E. Smoke test sau deploy

### E1. UI nâng bậc TNVK

1. Login `001199000002` (admin_luong) hoặc `001199000001` (admin_he_thong).
2. Sidebar có menu **Nâng bậc TNVK** (icon đồ thị tăng).
3. Click vào → trang `/promotions` hiện ra:
   - Slider "Khoảng thời gian cảnh báo" mặc định 30 ngày.
   - Bảng hiện danh sách NV đến hạn (nếu seed data có NV đến hạn).
   - Badge tổng kết: "Khẩn: X | Sắp đến: Y | Theo dõi: Z | Tổng N NV".
4. Đổi slider sang 180 ngày → bảng reload, có thể thêm NV.
5. Bấm **Nâng bậc** ở 1 row → dialog confirm hiện:
   - Họ tên / CCCD / Ngạch / Bậc cũ → mới / Ngày hưởng bậc mới.
   - Alert vàng cảnh báo "không thể hoàn tác qua UI".
6. Bấm **Xác nhận nâng bậc** → alert xanh "Đã nâng bậc cho ...". Bảng reload,
   NV vừa nâng bậc biến mất (vì `next_promotion_date` đã đẩy ra xa hơn N ngày).
7. Mở trang `/employees` → tìm NV vừa nâng → verify `bac` đã +1 + `ngay_huong_bac = today`.
8. Mở trang `/logs` → filter `entity_type = employees`, op = update → có dòng audit
   mới ghi `bac` cũ → mới, `ngay_huong_bac` cũ → mới (do trigger `trg_audit_employees`).

### E2. Reset password admin

1. Login `001199000001` (admin_he_thong) → /users.
2. Mỗi row (TRỪ row của chính mình) có icon **KeyRound** mới ở cột Thao tác.
3. Bấm icon → dialog confirm hiện CCCD + Họ tên + Role + Alert vàng cảnh báo.
4. Bấm **Xác nhận reset** → alert xanh "Đã reset mật khẩu user XXX về 8888V75...".
5. Logout admin, login lại bằng CCCD vừa reset + MK `8888V75`:
   - Đăng nhập OK.
   - Tự động redirect sang `/change-password` (vì `must_change_password = true`).
6. Đổi MK mới → vào dashboard bình thường.

### E3. Lockout server-side

1. Mở Login (ẩn danh, hoặc Ctrl+Shift+N), CCCD = `001199000005`.
2. Cố tình nhập MK sai 5 lần → sau lần sai thứ 5, alert vàng "Còn 300s..." + button disable.
3. **Bypass test**: F5 trang → button vẫn disable + alert vàng vẫn hiện (vì state lưu DB, không phải localStorage).
4. Mở DevTools → Application → Local Storage → KHÔNG còn key `v75_login_state` (đã bỏ ở v0.8.0).
5. Đợi 5 phút (hoặc rút ngắn để test: chạy SQL `UPDATE users SET locked_until = NULL, failed_attempts = 0 WHERE cccd = '001199000005';`) → thử lại OK.
6. **Verify DB**: SQL Editor chạy:
   ```sql
   SELECT cccd, failed_attempts, locked_until
     FROM users WHERE cccd = '001199000005';
   ```
   Sau 5 lần sai: `failed_attempts = 5`, `locked_until = now() + 5 phút`.
   Sau login OK: `failed_attempts = 0`, `locked_until = NULL`.

### E4. RLS vẫn chặn

- User thường (`001199000005`) **KHÔNG** thấy menu "Nâng bậc TNVK" ở sidebar.
- Truy cập trực tiếp `/promotions` → redirect `/unauthorized` (ProtectedRoute chặn).
- User thường vẫn không thấy menu /users.
- Edge Function `admin-reset-password` gọi bằng user role `user` → trả 403.

### E5. Edge Function endpoint trực tiếp (debug)

Test bằng curl/PowerShell nếu UI không phản hồi:

```powershell
# Lay anon key tu .env (VITE_SUPABASE_ANON_KEY)
$anon = "eyJhbGc..."

# Test auth-lockout (action=check)
curl -X POST "https://qvcqkciobetttltlqqjq.supabase.co/functions/v1/auth-lockout" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $anon" `
  -d '{"action":"check","cccd":"001199000005"}'
# Ky vong: {"ok":true,"locked":false,"failed_attempts":0,...}

# Test admin-reset-password (can JWT cua admin_he_thong dang login)
# Lay JWT tu DevTools -> Network -> /auth/v1/token -> response.access_token
$jwt = "eyJhbGc..."
curl -X POST "https://qvcqkciobetttltlqqjq.supabase.co/functions/v1/admin-reset-password" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $jwt" `
  -d '{"user_id":"<UUID cua target user>"}'
# Ky vong: {"ok":true,"cccd":"...","message":"..."}
```

---

## F. Trouble shooting

| Symptom | Nguyên nhân | Cách xử |
|---|---|---|
| `supabase functions deploy` báo `Project not linked` | Chưa link | `supabase link --project-ref qvcqkciobetttltlqqjq` |
| Deploy OK nhưng gọi Edge Function → 500 "Thiếu env" | Chưa set `SUPABASE_SERVICE_ROLE_KEY` | Xem C3 ở trên |
| Click "Nâng bậc" → lỗi "Ngạch X không có bậc Y" | NV đã ở bậc cuối nhưng `is_bac_cuoi` chưa flag đúng trong `salary_grades` | Sửa flag: `UPDATE salary_grades SET is_bac_cuoi = TRUE WHERE ngach_code = 'X' AND bac = (SELECT MAX(bac) FROM salary_grades WHERE ngach_code = 'X');`. Sau đó NV bậc cuối sẽ không hiện trong UI nâng bậc. |
| Trang `/promotions` trắng, console error `function check_upcoming_promotions does not exist` | Migration 008 chưa apply | Paste `008_tnvk_promotion_cron_to_paste.sql` vào SQL Editor |
| Nút Reset password → "Role 'user' không có quyền" dù đang login admin | Cache profile cũ trong localStorage | Logout + login lại để refresh role |
| Lockout test: F5 reset đếm về 0 | Đang gọi function bị fail (network) → fallback client-side | DevTools → Network → tìm request `/functions/v1/auth-lockout` → xem response. Nếu CORS error: chưa deploy `--no-verify-jwt` |
| `auth-lockout` báo 401 Unauthorized | Quên flag `--no-verify-jwt` khi deploy | Re-deploy: `supabase functions deploy auth-lockout --no-verify-jwt --project-ref qvcqkciobetttltlqqjq` |
| Reset password OK nhưng user vẫn login được bằng MK cũ | `auth.admin.updateUserById` có thể chậm 1-2s đồng bộ; hoặc service_role key sai | Đợi 5s rồi thử lại. Verify key bằng cách so với Dashboard → API → service_role. |

---

## G. Việc kế tiếp (phiên 12+)

1. **GitHub remote + Netlify auto-build** — push code lên GitHub, kết nối Netlify
   → auto deploy mỗi push lên main. Bỏ `deploy_v0xx.ps1` thủ công.
2. **Tự gửi email cảnh báo** khi cron tháng tìm thấy promotions sắp đến hạn
   (Resend / SendGrid Edge Function).
3. **UI tạo user mới từ /users** — thêm Edge Function `admin-create-user`
   (auth.admin.createUser + insert public.users + insert/link employees).
   Bỏ hẳn `seed-users.mjs`.
4. **Tolerance NUMERIC** trong `refreshDriverMatch` — `Math.abs(a-b) < 0.001`
   thay vì so equality strict (RULE-06).
5. **Báo cáo Module 6** — tổng hợp theo phòng ban / năm / quý + biểu đồ.

---

## H. Câu hỏi mở phiên 11

1. UI nâng bậc hiện chỉ cho phép nâng 1 NV mỗi lần. Có cần thêm "Nâng bậc hàng loạt"
   (chọn nhiều NV bằng checkbox) không? Hay 1 NV / lần là đủ vì admin cần review từng case?
2. Lockout 5 lần / 5 phút có hợp lý không? Có cần escalate: lần khoá đầu 5', lần 2 → 15', lần 3 → 1h?
3. Reset password về `8888V75` là MK mặc định mềm. Có nên random 8 ký tự + gửi qua
   email/SMS để bảo mật hơn không? Nếu có, cần SMTP / SMS provider.
4. Edge Function hiện không log audit khi reset password. Có cần thêm INSERT
   `activity_logs` với `action = 'admin.password_reset'` để có audit trail không?
5. `auth-lockout` deploy `--no-verify-jwt` cho phép gọi không cần JWT.
   Liệu có bị abuse (DoS / enumerate CCCD) không? Edge runtime của Supabase
   có rate limit mặc định, nhưng có cần thêm CAPTCHA ở LoginPage không?
6. Cron TNVK (migration 008) recalc `tnvk_percent` cho NV ở bậc cuối. UI hiện
   chỉ hiển thị NV CHƯA ở bậc cuối (để nâng). Có cần thêm trang/tab riêng
   xem NV bậc cuối + TNVK hiện tại + lịch sử thay đổi TNVK không?
