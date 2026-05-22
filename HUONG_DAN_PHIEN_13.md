# HƯỚNG DẪN DEPLOY V0.9.0 — PHIÊN 13

> **Tính năng mới**: Tạo tài khoản người dùng trực tiếp từ trang `/users`
> thông qua Edge Function `admin-create-user`. Không cần chạy `seed-users.mjs` thủ công nữa.

---

## A. Tóm tắt thay đổi phiên 13

**Mới**
- `supabase/functions/admin-create-user/index.ts` — Edge Function:
  - Verify JWT caller = `admin_he_thong`.
  - Validate CCCD (9–12 chữ số), role, kiểm tra CCCD chưa tồn tại.
  - `auth.admin.createUser({ email: cccd@v75.local, password: '8888V75', email_confirm: true })`.
  - Insert vào `public.users` (id, cccd, role, department_id?, employee_id?, must_change_password=true).
  - **Rollback**: nếu insert DB thất bại → `auth.admin.deleteUser()` tránh orphan.
  - Trả `{ ok, cccd, user_id, message }`.

**Sửa**
- `src/lib/api.ts` — thêm `interface CreateUserPayload` + `adminCreateUser()`.
- `src/pages/UsersPage.tsx`:
  - Import `UserPlus`, `Input`, `adminCreateUser`, `CreateUserPayload`.
  - State mới: `openCreate`, `createForm`, `creating`.
  - `freeEmployees` (memo): danh sách NV chưa liên kết tài khoản.
  - Handler `onOpenCreate`, `onCreateSubmit`.
  - Nút **Thêm tài khoản** (icon `UserPlus`) ở góc phải header trang.
  - `CreateUserForm` component: CCCD (validate realtime), Role, Phòng ban, Liên kết NV (optional).
  - Dialog confirm với mô tả MK mặc định.
- `package.json` — bump `0.8.0 → 0.9.0`.
- `src/components/Sidebar.tsx` — label `v0.9.0 – Tạo tài khoản từ UI`.

**Không đụng**
- Tất cả migration DB (001-008 đã apply ổn định).
- Tất cả page khác, AuthContext, payroll, pdf, excel.

---

## B. Deploy — 1 lệnh

```powershell
cd "D:\ClaudePro\V75-Hệ thống lương"
.\deploy_v090.ps1
```

Script thực hiện 4 bước:
1. `npm run typecheck`
2. `npm run build`
3. `supabase functions deploy admin-create-user --project-ref qvcqkciobetttltlqqjq`
4. `git add -A && git commit && git push` → Netlify tự build

> **Lưu ý**: Secret `SUPABASE_SERVICE_ROLE_KEY` đã set từ phiên 11 → Edge Function mới dùng lại, không cần set lại.

---

## C. Smoke test

### C1. Tạo tài khoản mới

1. Login `001199000001` (admin_he_thong) → vào `/users`.
2. Sidebar hiện `v0.9.0 – Tạo tài khoản từ UI`.
3. Góc phải trên cùng có nút **Thêm tài khoản** (icon người + dấu cộng).
4. Bấm → dialog mở ra với form:
   - **CCCD**: nhập `001199000009` (hoặc số mới chưa dùng)
   - **Role**: chọn `user`
   - **Phòng ban**: chọn tùy ý (hoặc để trống)
   - **Liên kết nhân viên**: dropdown chỉ hiện NV chưa có tài khoản
5. Bấm **Tạo tài khoản** → alert xanh "Đã tạo tài khoản 001199000009...".
6. Bảng reload → thấy user mới với badge Bắt đổi MK = Có.
7. Logout → login bằng `001199000009` / `8888V75` → redirect `/change-password` (must_change_password=true) ✓

### C2. Validation CCCD

- Nhập CCCD đã tồn tại (vd `001199000001`) → Edge Function trả lỗi 409 "CCCD ... đã có tài khoản".
- Nhập CCCD sai định dạng (`abc123`) → nút **Tạo tài khoản** disabled (validate client-side).

### C3. Phân quyền

- Login user thường → `/users` không truy cập được (ProtectedRoute chặn).
- Gọi trực tiếp Edge Function bằng JWT của user thường → trả 403 "Chỉ admin_he_thong...".

### C4. Audit log

- Sau khi tạo user → `/logs` (admin_he_thong) → filter `entity_type = users`, op = insert → thấy log mới ghi `cccd` + `role` của user vừa tạo (trigger `trg_audit_users` đã bị DROP ở migration 006... nhưng nếu anh muốn có audit log cho users, cần re-enable trigger đó).

> **Lưu ý**: Migration 006 đã DROP `trg_audit_users` (vì trigger này gây spam khi login update `last_login_at`). Nếu cần audit CREATE user, có thể thêm INSERT vào `activity_logs` trong Edge Function sau.

---

## D. Troubleshooting

| Symptom | Nguyên nhân | Cách xử |
|---|---|---|
| Nút "Thêm tài khoản" không hiện | Build cũ chưa cập nhật | Chờ Netlify build xong, F5 hard (Ctrl+Shift+R) |
| Edge Function báo "Thiếu env" | `SUPABASE_SERVICE_ROLE_KEY` chưa set | Dashboard → Project Settings → Edge Functions → Secrets |
| Lỗi "CCCD đã có tài khoản" | CCCD nhập trùng | Dùng CCCD khác |
| Lỗi "Tạo Auth user thất bại" | Email `cccd@v75.local` trùng trong auth.users | Kiểm tra Supabase Dashboard → Authentication → Users |
| `supabase functions deploy` báo lỗi | Chưa link project | `supabase link --project-ref qvcqkciobetttltlqqjq` |

---

## E. Việc kế tiếp (phiên 14+)

1. **Module 6 báo cáo** — tổng hợp bảng lương theo phòng ban / tháng / năm + biểu đồ recharts.
2. **Xóa user từ UI** — Edge Function `admin-delete-user` (auth.admin.deleteUser + delete public.users).
3. **Audit log tạo user** — thêm INSERT `activity_logs` trong `admin-create-user` với `action='admin.create_user'`.
4. **Email cảnh báo cron** — khi cron tháng phát hiện NV sắp đến hạn nâng bậc.
