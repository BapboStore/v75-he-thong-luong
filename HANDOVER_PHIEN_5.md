# V75 Hệ thống lương — Bàn giao sau phiên 5

> File này tóm tắt toàn bộ tiến độ tính đến cuối phiên 5 (2026-05-11) để chuyển sang phiên 6. **Không commit lên Git** (nếu có .gitignore Git sau này).

---

## 1. Trạng thái hiện tại

| Hạng mục | Tình trạng |
|---|---|
| Frontend stack | Vite + React 18 + TS + Tailwind ✓ |
| Backend | Supabase project `qvcqkciobetttltlqqjq` ✓ |
| Hosting | Netlify `luminous-marigold-a337b6.netlify.app` ✓ |
| Git | **Chỉ local**, chưa có GitHub remote |
| Version code trong folder | **0.3.4** (chưa chắc đã deploy) |
| Version deployed cuối cùng được xác nhận | **0.3.3** (sau hotfix log.ts) |
| Migration 001-004 trên Supabase | ✓ Đã apply tất cả |
| Module hoàn thành | 1 (Auth), 2 (CRUD), 3 (Chấm công), 4 (Lương) |
| Module tạm dừng | 5 (Xuất Excel/PDF, Cron TNVK, UI Logs, Reset MK admin) |

---

## 2. Lịch sử các phiên

### Phiên 1-3 — Module 1, 2, 3
- Tạo schema (3 migration), seed 8 user, login CCCD, đổi MK lần đầu, lockout 5 phút.
- CRUD: DepartmentsPage, EmployeesPage, ConfigPage, UsersPage.
- AttendancePage 4 grid (Office/Security/Technician/Driver), workflow draft → pending → locked.
- Khối lái xe (RULE-06): 2 nguồn truong_phong + admin_luong, refreshDriverMatch() so 11 chỉ tiêu.

### Phiên 4 — Module 4 + hotfix v0.3.0 → v0.3.2
- Migration `004_salary_records_constraints.sql` (trigger protect_approved + view v_salary_summary).
- `src/lib/payroll.ts` (thueTNCN lũy tiến TT 111/2013, computePayroll, normalizeAttendance).
- `SalaryPage.tsx`, `PayslipPage.tsx`, dialog `AdjustmentDialog` live preview.
- Bug v0.3.0: save treo "Đang lưu…" vì `await logActivity` block.
- Hotfix v0.3.1: fetch timeout 20s + onAuthStateChange cleanup sb-* + `Promise.race` timeout 5s cho log + đổi `await logActivity` → `void logActivity`.
- Hotfix v0.3.2: batch upsert (`upsertAttendanceBatch`), 4 grid Attendance đều dùng batch.

### Phiên 5 — Verify deploy + apply migration 004 + 2 hotfix
**Đã làm**:
- Verify code v0.3.2 đầy đủ trong folder (kết quả: OK, có sẵn 4 grid batch + fetch timeout + onAuthStateChange).
- Chuẩn bị file hướng dẫn `HUONG_DAN_PHIEN_5.md`, `004_migration_to_paste.sql`, `deploy_v032.ps1` cho user tự deploy (sandbox phía Claude không lên được).
- User deploy v0.3.2 thành công + apply migration 004 OK qua SQL Editor.
- **Bug 1**: save many rows vẫn treo + console `logActivity timeout 5s`.
- **Hotfix v0.3.3**: trong `src/lib/log.ts` thay `supabase.auth.getUser()` (REST `/auth/v1/user`) → `supabase.auth.getSession()` (đọc localStorage, instant). Cache cccd module-level. Bump version.
- User deploy v0.3.3. Test: Employees OK, **Chấm công khối Văn phòng vẫn treo "Đang lưu…"** và data không lưu.
- **Hotfix v0.3.4** (đã sửa trong folder, **CHƯA DEPLOY**): trong `src/lib/api.ts` → `upsertAttendanceBatch`:
  - Chia chunk 10 row/lần, mỗi chunk bọc `withTimeout(12s)`.
  - Log gộp 1 dòng SAU CÙNG khi tất cả chunk xong.
  - Bump 0.3.3 → 0.3.4 + Sidebar.

**Đã thảo luận kiến trúc**:
- Hiện tượng treo có liên quan **luồng dữ liệu** một phần (trộn 3 trách nhiệm trong 1 lần Lưu: write/log/reload), nhưng nguồn gốc chính nhiều khả năng là RLS Postgres evaluate per-row chậm khi batch lớn cho truong_phong.
- Đề xuất kiến trúc: chuyển ghi `activity_logs` sang **Postgres trigger server-side** (sẽ làm trong phiên 6+). Xoá toàn bộ `void logActivity()` ở `api.ts` sau đó.

---

## 3. Việc đầu tiên của phiên 6

### a. Verify v0.3.4
1. User chạy:
   ```powershell
   cd "D:\ClaudePro\V75-Hệ thống lương"
   npm run build
   netlify deploy --prod --dir=dist
   ```
2. Test: login truong_phong (`001199000003 / 8888V75`) → Chấm công → khối Văn phòng → khai đầy đủ → Lưu.
3. **TRƯỚC khi bấm Lưu**: mở DevTools (F12) → tab Network → filter `Fetch/XHR`. Sau khi bấm Lưu, screenshot panel này.

### b. Phân nhánh dựa trên kết quả

**Case A — Save xong < 5s** ✅
- Chunk fix hoạt động, kết thúc bug v0.3.x. Chuyển sang việc kế tiếp.

**Case B — Có 1 chunk báo lỗi "upsert attendance_office (chunk N) không phản hồi sau 12000ms"**
- Chunk cụ thể bị RLS chặn → cần debug:
  - Query thủ công SQL Editor xem chunk đó có row nào violate `is_truong_phong_of(department_id) AND status IN ('draft','pending')` không.
  - Có thể `current_user_dept()` không match department_id thực tế.
  - Có thể trigger 004 trên `salary_records` không liên quan nhưng cũng nên check.

**Case C — Vẫn treo silent**
- fetch timeout 20s không kick in. Khả năng `signal` bị override bởi supabase-js.
- Fix: merge signals trong `src/lib/supabase.ts` fetch override.

---

## 4. Roadmap phiên 6 (theo thứ tự ưu tiên)

### Ưu tiên 1 — Đóng bug Chấm công (tuỳ kết quả Case A/B/C)
Theo phân nhánh ở mục 3.

### Ưu tiên 2 — Migration 005: chuyển activity_logs sang trigger server-side
Mục tiêu: xoá luồng log khỏi client, đảm bảo audit không bao giờ mất.

```sql
-- File supabase/migrations/005_audit_triggers.sql (chưa tạo)
CREATE OR REPLACE FUNCTION public.audit_row()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO activity_logs (
    user_id, action, entity_type, entity_id,
    old_value, new_value
  )
  VALUES (
    auth.uid(),
    TG_OP || ' ' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN row_to_json(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN row_to_json(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END $$;

-- Áp dụng cho các bảng nghiệp vụ chính:
CREATE TRIGGER trg_audit_attendance_office AFTER INSERT OR UPDATE OR DELETE
  ON attendance_office FOR EACH ROW EXECUTE FUNCTION audit_row();
-- Tương tự cho attendance_driver, attendance_security, attendance_technician,
-- employees, departments, users, salary_records, salary_config.
```

Sau đó:
- Xoá `import { logActivity }` và mọi `void logActivity(...)` trong `src/lib/api.ts`.
- Xoá file `src/lib/log.ts` (hoặc giữ làm no-op deprecated).
- Bump version 0.4.0 (đủ lớn để mark milestone).

### Ưu tiên 3 — Module 5
- Xuất Excel bảng lương: SheetJS, mock template `Cau_truc_tien_luong_V75_cap_nhat.docx`.
- Xuất PDF phiếu lương: jspdf hoặc print CSS.
- UI `/logs` xem activity_logs (chỉ admin_he_thong).
- Reset password admin: Edge Function dùng service_role.
- Cron TNVK & nâng bậc tự động: Supabase pg_cron hoặc Edge Function scheduled.

### Ưu tiên 4 — Cải thiện hạ tầng
- Tạo GitHub repo + Netlify auto-build (đỡ phải `netlify deploy` thủ công).
- Edge Function lockout server-side (hiện đang client-side, dễ bypass).
- Tolerance NUMERIC `Math.abs(a-b) < 0.001` trong `refreshDriverMatch` thay vì so equality strict.

---

## 5. Phụ lục — Files quan trọng

### Trong dự án
- `supabase/migrations/001_initial_schema.sql` — 11 bảng + 5 enum + trigger updated_at
- `supabase/migrations/002_rls_policies.sql` — 6 helper STABLE + RLS 4 role
- `supabase/migrations/003_seed_data.sql` — 8 phòng + ngạch/bậc + salary_config
- `supabase/migrations/004_salary_records_constraints.sql` — trigger protect_approved + view v_salary_summary
- `src/lib/payroll.ts` — pure-TS computePayroll, thueTNCN
- `src/lib/api.ts` — tầng truy cập DB tập trung (đã chunk batch v0.3.4)
- `src/lib/log.ts` — activity log (sẽ deprecate khi có trigger 005)
- `src/lib/supabase.ts` — fetch timeout 20s + auth cleanup
- `src/lib/types.ts` — TypeScript types
- `src/contexts/AuthContext.tsx` — Auth state, đổi MK lần đầu
- `src/pages/*` — 10 page

### Trong outputs Cowork (phiên 5)
- `HUONG_DAN_PHIEN_5.md` — guide deploy v0.3.2
- `004_migration_to_paste.sql` — SQL migration 004 đã paste OK
- `deploy_v032.ps1` — PowerShell deploy script
- `HOTFIX_v033.md` — guide deploy v0.3.3
- `HOTFIX_v034.md` — guide deploy v0.3.4 + test plan với Network screenshot

---

## 6. Demo users (đăng nhập)

| CCCD | Role | Phòng | MK ban đầu |
|---|---|---|---|
| 001199000001 | admin_he_thong | TCHC_VP | `8888V75` |
| 001199000002 | admin_luong | KTTC | `8888V75` |
| 001199000003 | truong_phong | KTTC | `8888V75` |
| 001199000004 | truong_phong | KHKD | `8888V75` |
| 001199000005 | user | KTTC | `8888V75` |
| 001199000006 | user | KHKD | `8888V75` |
| 001199000007 | user | DX_NGHIADO | `8888V75` |
| 001199000008 | user | TCHC_BV | `8888V75` |

> Lần đầu login bị buộc đổi mật khẩu.

---

## 7. Lệnh chuẩn cho phiên 6

```powershell
# Deploy
cd "D:\ClaudePro\V75-Hệ thống lương"
npm run build
netlify deploy --prod --dir=dist

# Apply migration
# Mở https://supabase.com/dashboard/project/qvcqkciobetttltlqqjq/sql/new
# → Paste nội dung file .sql → Run

# Seed users (chỉ chạy lần đầu, đã chạy rồi)
# npm run seed:users
```

---

## 8. Câu hỏi mở cho phiên 6

1. Sau khi v0.3.4 deploy, batch save có còn treo không? (chưa rõ → cần test)
2. Trigger server-side có ảnh hưởng performance Supabase free tier không? (cần đo)
3. Có nên đẩy Git remote lên GitHub + Netlify auto-build trước Module 5 không?
4. Excel template xuất bảng lương — user có sẵn template hay cần thiết kế từ đầu?
