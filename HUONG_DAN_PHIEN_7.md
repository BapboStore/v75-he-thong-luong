# V75 — HƯỚNG DẪN PHIÊN 7 (Migration 005 + v0.4.0)

> Apply audit triggers server-side → xoá `logActivity` khỏi client → deploy v0.4.0.
> Tiền đề: v0.3.4 đã deploy, Chấm công batch save < 5s (Case A đã xác nhận).

---

## A. Việc đã làm SẴN trong folder (do Claude làm phiên 7)

| File | Thay đổi |
|---|---|
| `src/lib/api.ts` | XOÁ toàn bộ `import { logActivity }` + 9 chỗ gọi `void logActivity(...)`. Thêm header doc v0.4.0. |
| `src/lib/log.ts` | Chuyển thành STUB no-op (export hàm `logActivity` chỉ return). Giữ file để không phá build nếu có import sót. |
| `package.json` | Bump `version: 0.3.4 → 0.4.0` |
| `src/components/Sidebar.tsx` | Đổi label `v0.3.4 – Module 1+2+3+4` → `v0.4.0 – Audit server-side` |

Migration 005 đã có sẵn từ phiên 6: `supabase/migrations/005_audit_triggers.sql` và bản copy ở `005_audit_triggers_to_paste.sql` (root folder).

---

## B. Việc user cần làm theo thứ tự

### Bước 1 — Apply migration 005 trên Supabase

1. Mở https://supabase.com/dashboard/project/qvcqkciobetttltlqqjq/sql/new
2. Mở file `D:\ClaudePro\V75-Hệ thống lương\005_audit_triggers_to_paste.sql` → copy toàn bộ.
3. Paste vào SQL Editor → **Run**.
4. Kỳ vọng output: không có error đỏ. Có thể có warning "function … will be created" / "trigger … dropped if exists" — bình thường.

### Bước 2 — Verify trigger đã tạo (10 dòng)

Tại SQL Editor, chạy:
```sql
SELECT tgname, tgrelid::regclass::text AS tablename
FROM pg_trigger
WHERE tgname LIKE 'trg_audit_%'
ORDER BY tablename;
```

Kỳ vọng **10 dòng** với 10 bảng:
- attendance_driver, attendance_office, attendance_security, attendance_technician
- departments, employees, salary_config, salary_grades, salary_records, users

Nếu thiếu bảng nào → migration chưa chạy đủ, xem error trong SQL Editor.

### Bước 3 — Smoke test trigger (1 phút)

Vẫn ở SQL Editor:
```sql
-- Đếm số log trước test
SELECT count(*) AS truoc FROM activity_logs;

-- Bịa 1 update vô hại (KHÔNG động chạm data thật)
UPDATE departments
SET updated_at = NOW()
WHERE code = 'TCHC_VP';

-- Đếm lại
SELECT count(*) AS sau FROM activity_logs;

-- Xem log mới nhất
SELECT id, action, entity_type, user_cccd, created_at
FROM activity_logs
ORDER BY created_at DESC
LIMIT 3;
```

Kỳ vọng:
- `sau` = `truoc` + 1 (hoặc + 2 nếu trigger 004 `protect_approved_salary_records` cũng đụng tới).
- Log mới có `action='update.departments'`, `entity_type='departments'`, `user_cccd` là CCCD của bạn (admin login vào SQL Editor sẽ là NULL — không sao, đó là chế độ service-role).

> Lưu ý: khi chạy từ SQL Editor, `auth.uid()` thường NULL → `user_id` & `user_cccd` đều NULL. Test thực tế từ web app mới thấy CCCD.

### Bước 4 — Deploy v0.4.0

```powershell
cd "D:\ClaudePro\V75-Hệ thống lương"
npm run typecheck      # đảm bảo TS sạch sau khi xoá logActivity
npm run build          # vite build → dist/
netlify deploy --prod --dir=dist
```

Hoặc đơn giản hơn — chạy:
```powershell
.\deploy_v040.ps1
```

### Bước 5 — Verify production

1. Login truong_phong `001199000003 / <mật khẩu của bạn>`.
2. Vào **Chấm công** → tháng `2026-05` → khối Văn phòng.
3. Sửa 1-2 ô đầu công → **Lưu**.
4. Mở Supabase Dashboard → Table editor → `activity_logs` → Sort by `created_at DESC`.
5. Kỳ vọng: thấy 2-3 dòng mới với `action='update.attendance_office'`, `user_cccd='001199000003'`.
6. Nếu `user_cccd` đúng CCCD truong_phong → trigger work tốt với JWT của caller. ✅

---

## C. Câu hỏi nếu CÓ vấn đề

### Q1: Apply migration báo `permission denied for function auth.uid`
→ Trong Supabase, schema `auth` chỉ cho `authenticated, anon, service_role` dùng. Function `audit_row()` đã set `SECURITY DEFINER` và `GRANT EXECUTE` cho `authenticated, service_role` → trên lý thuyết OK. Nếu vẫn báo lỗi, paste error vào chat cho Claude.

### Q2: Sau deploy v0.4.0, save Chấm công vẫn báo lỗi gì đó
→ Console screenshot + tab Network screenshot. Nguyên nhân có thể:
- Trigger `audit_row()` raise exception → cả batch rollback. Check Supabase Dashboard → Logs → Postgres.
- Nếu trigger fail vì lỗi `column does not exist`: schema một bảng nào đó không có cột `id` (xác suất thấp — đã xác nhận 10 bảng đều có). Báo Claude.

### Q3: Số dòng `activity_logs` tăng quá nhanh (vd. 1000 dòng/ngày)
→ Trigger ghi mỗi row mỗi lần INSERT/UPDATE/DELETE → tốn dung lượng. Phương án sau:
- Thêm filter `WHEN (OLD.* IS DISTINCT FROM NEW.*)` để bỏ qua UPDATE no-op.
- Hoặc cron pg_cron mỗi tháng truncate log > 6 tháng.

### Q4: Muốn rollback v0.4.0 về v0.3.4
- DROP triggers: `DROP TRIGGER trg_audit_<table> ON <table>;` cho 10 bảng (hoặc `DROP FUNCTION audit_row() CASCADE;`).
- Khôi phục `src/lib/api.ts` + `src/lib/log.ts` từ git history (commit cuối phiên 6).
- Bump 0.4.0 → 0.4.1 (rollback marker) hoặc về 0.3.4.

---

## D. Sau khi v0.4.0 OK — Roadmap phiên 8

| Ưu tiên | Việc |
|---|---|
| 1 | **Module 5 — UI `/logs`**: page admin_he_thong xem `activity_logs` (table + filter theo user/action/date). Đây là việc tự nhiên kế tiếp vì giờ log đầy đủ. |
| 2 | **Module 5 — Xuất Excel bảng lương**: SheetJS. Template tham khảo `Cau_truc_tien_luong_V75_cap_nhat.docx` (nếu user có). |
| 3 | **Module 5 — Xuất PDF phiếu lương**: jspdf hoặc print CSS. |
| 4 | **Module 5 — Reset password admin từ UI**: Edge Function dùng `service_role`. |
| 5 | **Cron TNVK & nâng bậc tự động**: Supabase pg_cron / Edge Function scheduled. |
| 6 | **Hạ tầng — GitHub remote + Netlify auto-build**: đỡ phải `netlify deploy` thủ công. |

---

## E. Tóm tắt 1 phút

> **Phiên 7 = bóc gánh nặng log khỏi client.** Sau phiên này, mỗi lần INSERT/UPDATE/DELETE 1 trong 10 bảng nghiệp vụ, Postgres tự ghi 1 dòng `activity_logs` với JWT của user. Client `api.ts` mỏng đi, không còn `void logActivity()` nào. Chấm công save batch sẽ thuần CRUD, audit không bao giờ mất.
