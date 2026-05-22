# V75 — Hotfix v0.4.1 (giải quyết treo "Đang kiểm tra phiên đăng nhập...")

> Tiền đề: v0.4.0 đã deploy + migration 005 đã apply. Triệu chứng phát hiện ở phiên 7:
> - Hệ thống load chậm sau khi v0.4.0 deploy.
> - F5 trang đôi khi **treo vĩnh viễn** ở màn hình "Đang kiểm tra phiên đăng nhập...".
> - Console không có error đỏ.

---

## Nguyên nhân (giả thuyết)

1. **`AuthContext.useEffect` init có thể treo vĩnh viễn** vì `loadProfile()` (3 SELECT users/employees/departments) hoặc `auth.signOut({scope:'local'})` không có timeout cứng → khi Supabase chậm, `setLoading(false)` không bao giờ chạy.
2. **Trigger `trg_audit_users`** (migration 005) fire mỗi lần login vì `signInWithCccd` update `failed_attempts=0` + `last_login_at`. Mỗi login → 1 INSERT activity_logs với JSONB nguyên row users → chậm + spam log + có thể là thủ phạm gây nghẽn auth flow.
3. **UPDATE no-op** cũng fire trigger → log rác.

## Giải pháp

| Lớp | Sửa |
|---|---|
| Frontend | `src/contexts/AuthContext.tsx` — **hard timeout 8s** cho toàn bộ init, **6s** cho `loadProfile`, **3s** cho mọi `signOut({scope:'local'})`. App không bao giờ treo trắng nữa. |
| Database | `006_audit_optimize.sql` — **DROP `trg_audit_users`** + tách trigger thành 3 (ins/upd/del), trong đó UPDATE có `WHEN (OLD.* IS DISTINCT FROM NEW.*)` để bỏ no-op. |

---

## Bước anh thao tác

### Tuỳ chọn nhanh (KHÔNG sửa trigger) — chỉ deploy frontend v0.4.1

Nếu chỉ muốn test xem hard timeout có cứu được vấn đề F5 không, bỏ qua phần migration 006.

```powershell
cd "D:\ClaudePro\V75-Hệ thống lương"
.\deploy_v041.ps1
```

→ Test: F5 trang. Tối đa sau 8 giây phải vào được app (kể cả nếu profile load không xong, sẽ vào với profile null tạm thời rồi reload lại).

### Tuỳ chọn đầy đủ (khuyến nghị) — apply migration 006 + deploy v0.4.1

#### Bước 1 — Apply `006_audit_optimize.sql`

1. Mở https://supabase.com/dashboard/project/qvcqkciobetttltlqqjq/sql/new
2. Mở file `D:\ClaudePro\V75-Hệ thống lương\006_audit_optimize_to_paste.sql` → copy toàn bộ.
3. Paste → **Run**.

#### Bước 2 — Verify trigger

```sql
-- Kỳ vọng 27 dòng (9 bảng × 3 trigger ins/upd/del)
SELECT tgname, tgrelid::regclass::text AS tablename
FROM pg_trigger
WHERE tgname LIKE 'trg_audit_%'
ORDER BY tablename, tgname;

-- Verify users KHÔNG còn audit trigger:
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.users'::regclass AND tgname LIKE 'trg_audit_%';
-- → 0 dòng (đúng kỳ vọng)
```

#### Bước 3 — Deploy v0.4.1

```powershell
cd "D:\ClaudePro\V75-Hệ thống lương"
.\deploy_v041.ps1
```

#### Bước 4 — Test

1. Tab Ẩn danh → Ctrl+Shift+R.
2. Login truong_phong (`001199000003 / <mật khẩu của bạn>`).
3. Vào Chấm công → khối Văn phòng → sửa 1 ô → Lưu. Đo thời gian (kỳ vọng < 2s).
4. **F5 trang đang ở** → kỳ vọng vào lại app trong < 3 giây, không kẹt loading.
5. Mở `activity_logs` → kỳ vọng thấy log mới `update.attendance_office` với `user_cccd='001199000003'`.
6. KHÔNG còn log `update.users` mỗi lần đăng nhập.

---

## Nếu vẫn treo sau hotfix v0.4.1 — Rollback test

Nếu sau khi deploy v0.4.1 + apply migration 006 mà F5 vẫn treo trên một số kịch bản, để chắc chắn migration 005 là thủ phạm chính, anh có thể DROP toàn bộ trigger audit tạm thời để test:

```sql
-- ROLLBACK migration 005 + 006 (CHỈ ĐỂ TEST — sẽ MẤT audit log từ thời điểm này)
DROP FUNCTION IF EXISTS public.audit_row() CASCADE;
```

→ Sau khi chạy lệnh trên, F5 trang. Nếu hết treo → confirm 100% là trigger gây ra. Em sẽ cùng anh debug sâu hơn.

Sau khi test xong, anh có thể re-apply `005_audit_triggers_to_paste.sql` + `006_audit_optimize_to_paste.sql` để khôi phục.

---

## Tóm tắt 1 phút

> v0.4.1 = **hai lớp phòng vệ**:
> - Frontend: AuthContext có **hard timeout 8s** → không bao giờ treo trắng nữa.
> - Database: **bỏ audit trên `users`** (login spam) + UPDATE có `WHEN` clause bỏ no-op → giảm load Postgres.
> Nếu hai biện pháp này vẫn không đủ → rollback test (DROP FUNCTION audit_row CASCADE) để cô lập nguyên nhân.
