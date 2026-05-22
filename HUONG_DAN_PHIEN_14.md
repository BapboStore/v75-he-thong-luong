# HƯỚNG DẪN DEPLOY V0.10.0 — PHIÊN 14

> **Tính năng mới**: Xóa tài khoản người dùng từ UI + Audit log hành động tạo user.

---

## A. Tóm tắt thay đổi phiên 14

**Mới**
- `supabase/functions/admin-delete-user/index.ts` — Edge Function xóa user:
  - Verify JWT caller = `admin_he_thong`.
  - Bảo vệ: không xóa chính mình, không xóa `admin_he_thong` duy nhất.
  - Xóa `public.users` trước (có thể rollback nếu cần), sau đó xóa `auth.users`.
  - Ghi audit log `action='admin.delete_user'` (hoặc `'admin.delete_user_auth_failed'` nếu bước auth lỗi).
  - Trả `{ ok, cccd, message }`.

**Sửa**
- `supabase/functions/admin-create-user/index.ts`:
  - Select thêm `cccd` của caller ở bước 3.
  - Thêm bước 8: INSERT `activity_logs` với `action='admin.create_user'` sau khi tạo user thành công.
  - Fire-and-forget (lỗi log không làm thất bại request chính).
- `src/lib/api.ts` — thêm `adminDeleteUser(userId)`.
- `src/pages/UsersPage.tsx`:
  - Import `Trash2` icon + `adminDeleteUser`.
  - State mới: `deleteTarget`, `deleting`.
  - Nút `Trash2` (đỏ) trong cột Thao tác — chỉ hiện khi `u.id !== myId`.
  - Dialog xác nhận xóa: thông tin user, cảnh báo không thể hoàn tác, gợi ý dùng vô hiệu hóa thay thế.
  - Mô tả thêm nút Trash2 ở subtitle trang.
- `package.json` — bump `0.9.0 → 0.10.0`.
- `src/components/Sidebar.tsx` — label `v0.10.0 – Xóa user + Audit log`.

**Không đụng**
- Tất cả migration DB (001-008 đã apply ổn định).
- Tất cả page khác, AuthContext, payroll, pdf, excel, promotions.

---

## B. Deploy — 1 lệnh

```powershell
cd "D:\ClaudePro\V75-Hệ thống lương"
.\deploy_v0100.ps1
```

Script thực hiện 5 bước:
1. `npm run typecheck`
2. `npm run build`
3. `supabase functions deploy admin-create-user` (cập nhật audit log)
4. `supabase functions deploy admin-delete-user` (mới)
5. `git add -A && git commit && git push` → Netlify tự build

> **Lưu ý**: Secret `SUPABASE_SERVICE_ROLE_KEY` đã set từ phiên 11 → 2 Edge Function dùng lại, không cần set lại.

---

## C. Smoke test

### C1. Audit log tạo user

1. Login `001199000001` (admin_he_thong) → vào `/users`.
2. Sidebar hiện `v0.10.0 – Xóa user + Audit log`.
3. Bấm **Thêm tài khoản** → tạo user mới (vd CCCD `001199000010`).
4. Vào `/logs` → filter **Hành động** = Khác hoặc tìm `admin.create_user`.
5. Phải thấy log mới với `action='admin.create_user'`, `entity_type='users'`, `new_value` chứa CCCD + role vừa tạo.

### C2. Xóa user từ UI — luồng bình thường

1. Ở trang `/users` → tìm user vừa tạo (`001199000010`).
2. Cột Thao tác có nút đỏ (icon thùng rác).
3. Bấm → dialog cảnh báo mở ra với thông tin user + alert đỏ "Không thể hoàn tác".
4. Bấm **Xác nhận xóa vĩnh viễn** → alert xanh "Đã xóa tài khoản 001199000010...".
5. Bảng reload → user đã biến mất.
6. Vào `/logs` → filter `admin.delete_user` → thấy log mới.
7. Vào Supabase Dashboard → Authentication → Users → CCCD `001199000010@v75.local` không còn tồn tại.

### C3. Bảo vệ — không xóa chính mình

- Đang login là `001199000001` → nút Trash2 ở hàng user đó **không hiện**.
- (Bảo vệ client-side; server-side cũng chặn nếu gọi trực tiếp.)

### C4. Bảo vệ — không xóa admin_he_thong duy nhất

1. Tạo 1 admin_he_thong thứ 2 (vd `001199000011`).
2. Thử xóa `001199000001` từ account đó → sẽ lỗi vì server check số admin còn lại.
3. Hoặc: nếu chỉ còn 1 admin_he_thong → thử xóa admin đó → Edge Function trả lỗi 400 "Không thể xóa admin_he_thong duy nhất".

### C5. Gợi ý vô hiệu hóa thay vì xóa

- Dialog cảnh báo nhắc: "Nếu muốn vô hiệu hóa tạm thời, hãy dùng nút Sửa và tắt Tài khoản hoạt động."
- Test: dùng nút Sửa (Pencil) → bỏ tích "Tài khoản hoạt động" → Cập nhật → user vẫn còn trong bảng nhưng badge "Vô hiệu".

---

## D. Troubleshooting

| Symptom | Nguyên nhân | Cách xử |
|---|---|---|
| Nút Trash2 không hiện | Build cũ chưa cập nhật | Chờ Netlify build xong, F5 hard (Ctrl+Shift+R) |
| Lỗi "Chỉ admin_he_thong..." | Đang test bằng account khác | Login đúng `001199000001` |
| Lỗi "Không tìm thấy user" | user_id không đúng (client bug) | Tải lại trang → thử lại |
| Lỗi "Đã xóa public.users nhưng xóa auth.users thất bại" | Hiếm — race condition hoặc Supabase lỗi | Vào Dashboard → Auth → Users → xóa thủ công email `CCCD@v75.local` |
| Không thấy log `admin.create_user` | Edge Function cũ chưa được redeploy | Chạy lại bước 3 trong deploy script |

---

## E. Việc kế tiếp (phiên 15+)

1. **Module 6 báo cáo** — tổng hợp bảng lương theo phòng ban / tháng / năm + biểu đồ recharts.
2. **Email cảnh báo cron** — khi cron tháng phát hiện NV sắp đến hạn nâng bậc (Resend/SendGrid).
3. **Nâng bậc hàng loạt** — checkbox chọn nhiều NV trong PromotionsPage.
4. **Escalated lockout** — lần khoá 1→5', lần 2→15', lần 3→1h.
