# V75 Hệ thống lương — Tóm tắt toàn bộ phiên làm việc

> Bàn giao tổng hợp tính đến hết phiên 12 (2026-05-22). Đọc file này đầu mỗi phiên mới để có đầy đủ context.

---

## I. THÔNG TIN HẠ TẦNG

| Hạng mục | Chi tiết |
|---|---|
| Folder dự án | `D:\ClaudePro\V75-Hệ thống lương` |
| Frontend | Vite + React 18 + TypeScript + TailwindCSS + shadcn-style UI |
| Backend | Supabase project `qvcqkciobetttltlqqjq` (Postgres + Auth + RLS) |
| DB password | `Ma1yeuMa1123` (kết nối Postgres trực tiếp, không phải anon/service key) |
| Host | Netlify site `luminous-marigold-a337b6` → https://luminous-marigold-a337b6.netlify.app/ |
| Deploy | `netlify deploy --prod --dir=dist` (đã `netlify link` site, không cần lại) |
| Git | **Chỉ local**, chưa có GitHub remote |
| Version hiện tại trong folder | **0.8.0** (PromotionsPage + Edge Function reset PW + auth-lockout server-side) — **ĐÃ DEPLOY** |
| Version deploy gần nhất xác nhận | **0.8.0** (smoke test E1-E5 PASS — giữa phiên 11 và 12) |
| Git | **1 commit v0.3.0** + **1 commit v0.4.0-v0.8.0** (local). **Phiên 12**: kết nối GitHub remote + Netlify auto-deploy |
| Migration 005 (audit triggers) | ✓ Đã re-apply giữa phiên 7 và 8 (user xác nhận log mới ghi được). |
| Migration 006 (tối ưu audit) | ✓ Đã re-apply, log không còn rác no-op. |
| Migration 007 (pg_cron clean log) | ✓ Applied — pg_cron job `v75_cleanup_activity_logs` đang chạy 03:15 UTC mỗi ngày. |
| Migration 008 (TNVK cron) | ✓ Applied — 3 function + cron job `v75_monthly_tnvk_promotion` (30 0 1 * *). |

---

## II. 8 DEMO USER

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

## III. 4 MODULE NGHIỆP VỤ

### Module 1 — Auth & nền tảng (phiên 1-3)
- 3 migration: `001_initial_schema.sql` (11 bảng + 5 enum + trigger updated_at), `002_rls_policies.sql` (6 helper STABLE + RLS 4 role), `003_seed_data.sql` (8 phòng ban + ngạch/bậc + salary_config).
- `supabase/scripts/seed-users.mjs` tạo 8 demo user qua Auth Admin API.
- Login bằng CCCD ánh xạ `cccd@v75.local`, đổi MK lần đầu, lockout 5 phút sau 5 lần sai (client-side).

### Module 2 — CRUD nghiệp vụ (phiên 2-3)
- `pages/DepartmentsPage` (admin_he_thong)
- `pages/EmployeesPage` 20+ trường, ngạch/bậc dynamic (admin_luong + admin_he_thong)
- `pages/ConfigPage` versioned salary_config (admin_he_thong)
- `pages/UsersPage` quản lý role/phòng/lock (admin_he_thong)
- `lib/api.ts` tầng truy cập DB tập trung + `lib/log.ts` activity logs

### Module 3 — Chấm công (phiên 3)
- `pages/AttendancePage` 4 grid khối (Office/Security/Technician/Driver).
- Workflow draft → pending → locked.
- Khối lái xe (RULE-06): 2 nguồn truong_phong + admin_luong, `refreshDriverMatch()` so 11 chỉ tiêu, chỉ chốt khi 2 nguồn KHỚP.

### Module 4 — Bảng lương (phiên 4)
- `supabase/migrations/004_salary_records_constraints.sql` — trigger `protect_approved_salary_records` + view `v_salary_summary`.
- `src/lib/payroll.ts` — pure-TS calculator: `computePayroll()`, `thueTNCN()` (lũy tiến TT 111/2013), `normalizeAttendance()`.
- `src/pages/SalaryPage.tsx` (/salary, có dialog `AdjustmentDialog` live preview).
- `src/pages/PayslipPage.tsx` (/payslip read-only + nút In).
- Workflow: draft → pending → approved → cancelled (sau approved trigger DB chặn sửa).
- Hệ số quy đổi đầu công lái xe (S600 ×1.0, xe 4-7 ×0.8, xe 16-29 ×1.2, công mía ×1.4, công chờ ×0.5) — quy ước trong code, có thể cần điều chỉnh.

### Module 5 — Đang triển khai (bắt đầu phiên 8)
- **Phiên 8**: ✓ UI `/logs` xem activity_logs (LogsPage.tsx + fetchActivityLogs + ActivityLog type). Đã deploy + smoke test OK.
- **Phiên 9**: ✓ Xuất Excel bảng lương (SheetJS) + Xuất CSV nhật ký + Migration 007 pg_cron clean log > 6 tháng.
- **Phiên 10+**: Xuất PDF phiếu lương (jspdf hoặc print CSS).
- **Phiên 10+**: Cron TNVK & nâng bậc tự động (đã có sẵn pg_cron sau migration 007).
- **Phiên 10+**: Reset password admin từ UI (Edge Function với service_role).

---

## IV. LỊCH SỬ PHIÊN

### Phiên 1-3 — Xây dựng Module 1, 2, 3
Thiết lập hạ tầng, schema, RLS, seed user, CRUD phòng ban / nhân viên / config / tài khoản, chấm công 4 khối với workflow draft→pending→locked, kiểm tra chéo lái xe 2 nguồn.

### Phiên 4 — Module 4 + chuỗi hotfix v0.3.0 → v0.3.2

**Triển khai Module 4**: 5 file mới (migration 004, payroll.ts, SalaryPage, PayslipPage, dialog adjust) + sửa 4 file cũ. Build OK 1649 modules / 2.99s. Deploy lên Netlify production OK. Cài Netlify CLI + login + link site.

**Bug v0.3.0**: tạo phòng ban → bấm Lưu treo "Đang lưu…" vĩnh viễn. Console hiện `AuthApiError: Invalid Refresh Token`.

**Hotfix v0.3.1** (3 lớp phòng vệ):
1. `src/lib/supabase.ts` — override `global.fetch` với `AbortController` timeout 20 giây cho mọi call Supabase.
2. `src/lib/supabase.ts` — listener `onAuthStateChange` tự xoá localStorage khi `SIGNED_OUT` (cleanup session zombie).
3. `src/lib/log.ts` — `logActivity` bọc `Promise.race` timeout 5 giây + đổi mọi `await logActivity` trong `api.ts` thành `void logActivity` (fire-and-forget).
4. Bump 0.3.0 → 0.3.1.

**Bug v0.3.1**: batch save Attendance (1 phòng 20+ NV) treo do loop sequential awaits.

**Hotfix v0.3.2**: thêm `upsertAttendanceBatch` (1 request cho cả mảng); 4 grid AttendancePage đều dùng batch. Bump 0.3.1 → 0.3.2.

### Phiên 5 — Verify deploy + apply migration 004 + 2 hotfix v0.3.3, v0.3.4

**Bối cảnh môi trường**: Cowork sandbox Linux không boot được + Chrome extension chưa kết nối → Claude không thể chạy `npm`/`netlify`/`npx supabase` hay điều khiển browser tự động. Phải hướng dẫn user copy-paste lệnh.

**Việc 1 — Deploy v0.3.2 và apply migration 004**:
- Claude verify code v0.3.2 đã đủ trong folder (fetch timeout, batch upsert, migration 004 cột khớp schema).
- Tạo packet hướng dẫn ở outputs Cowork (`HUONG_DAN_PHIEN_5.md`, `004_migration_to_paste.sql`, `deploy_v032.ps1`).
- User chạy `npm run build && netlify deploy --prod --dir=dist` → deploy v0.3.2 thành công.
- User paste SQL 004 vào SQL Editor `qvcqkciobetttltlqqjq` → apply OK.

**Bug 1 (sau deploy v0.3.2)**: save many rows vẫn treo + console `logActivity timeout 5s — bỏ qua`.

**Phân tích**: `logActivity` đang gọi `supabase.auth.getUser()` — đây là REST call qua mạng tới `/auth/v1/user`. Mỗi save batch fire 1 log → tốn 1 round-trip vô ích. Khi auth bận / refresh token đang chạy, call bị queue → timeout 5s. Mặc dù `void logActivity` là fire-and-forget, các call này vẫn chiếm chỗ HTTP connection pool browser.

**Hotfix v0.3.3** (`src/lib/log.ts`):
- Thay `supabase.auth.getUser()` (REST) → `supabase.auth.getSession()` (đọc localStorage, instant).
- Cache `cccd` module-level theo `uid` → không re-query bảng `users` mỗi log.
- Bump 0.3.2 → 0.3.3 + Sidebar.

**Kết quả test v0.3.3**: bảng **Nhân viên** OK (lưu nhanh, không timeout). **Chấm công khối Văn phòng vẫn treo** "Đang lưu…" với cảnh báo `logActivity timeout 5s` ở dòng `log.ts:47`.

**Phân tích sâu hơn**: 
- Dòng 47 là callback của Promise timeout — nghĩa là `work` Promise (insert activity_logs) không hoàn tất trong 5s. RLS đã cho phép user authenticated INSERT, không phải bị chặn policy.
- Nhưng `void logActivity` là fire-and-forget → không thể block save chính. Vậy lý do button treo phải nằm trong `upsertAttendanceBatch` chứ không phải log.
- Giả thuyết: RLS evaluate per-row cho truong_phong với batch 30+ row → cộng dồn vài giây; hoặc 1 row trong batch fail policy khiến cả batch rollback; hoặc PostgREST single-statement bị block.

**Hotfix v0.3.4** (`src/lib/api.ts` → `upsertAttendanceBatch`):
- Chia chunk **10 row/lần** thay vì 1 request lớn.
- Mỗi chunk bọc `withTimeout(12_000, 'upsert ${table} (chunk N)')` → throw error rõ ràng nếu chunk nào stuck thay vì treo silent.
- Log gộp 1 dòng SAU CÙNG khi tất cả chunk xong (không trong hot-path).
- Bump 0.3.3 → 0.3.4 + Sidebar.

**Trạng thái cuối phiên 5**: v0.3.4 đã sửa trong folder, **chưa build/deploy**.

### Phiên 6 — Chuẩn bị migration 005 (audit triggers) + handover deploy v0.3.4

**Bối cảnh môi trường**: Cowork sandbox Linux phiên 6 vẫn báo `Workspace still starting` sau nhiều lần thử → Claude không tự chạy được `npm run build` / `netlify deploy`. Quyết định:
1. Verify code v0.3.4 đã đúng trong folder (package.json 0.3.4, Sidebar v0.3.4, api.ts có chunk 10 + withTimeout 12s + log gộp, supabase.ts có fetch timeout 20s + onAuthStateChange cleanup) → ✓ tất cả OK.
2. Chuẩn bị **migration 005** sẵn sàng để user apply ngay sau khi xác nhận v0.3.4 hoạt động (Ưu tiên 2 trong roadmap phiên 5).
3. Tạo packet hướng dẫn copy-paste trong outputs Cowork.

**Migration 005 — `supabase/migrations/005_audit_triggers.sql`**:
- Function `public.audit_row()` LANGUAGE plpgsql SECURITY DEFINER:
  - Lấy `auth.uid()` (cho phép NULL), tra cứu `user_cccd` từ bảng `users`.
  - Insert vào `activity_logs` với `action = lower(TG_OP) || '.' || TG_TABLE_NAME`, `old_value`/`new_value` là `to_jsonb(OLD/NEW)`, `entity_type = TG_TABLE_NAME`, `entity_id = NEW.id|OLD.id`.
  - SECURITY DEFINER → bypass RLS `logs_insert_self` (chính sách cũ yêu cầu user_id = auth.uid()) mà vẫn lấy được uid từ JWT của caller.
- Loop DO $$ tạo `trg_audit_<table>` AFTER INSERT/UPDATE/DELETE FOR EACH ROW cho **10 bảng**: departments, employees, users, attendance_office, attendance_driver, attendance_security, attendance_technician, salary_records, salary_config, salary_grades.
- Idempotent (DROP TRIGGER IF EXISTS trước).
- GRANT EXECUTE function cho `authenticated, service_role`.

**Files mới tạo phiên 6**:
- `supabase/migrations/005_audit_triggers.sql` (trong folder dự án).
- `outputs/HUONG_DAN_PHIEN_6.md` — guide A) deploy v0.3.4 → B) test Network DevTools với phân nhánh Case A/B/C → C) apply migration 005 sau khi v0.3.4 OK → tuỳ chọn bump v0.4.0 xoá `logActivity` khỏi `src/lib/api.ts`.
- `outputs/005_audit_triggers_to_paste.sql` — copy migration cho dễ paste vào SQL Editor.
- `outputs/deploy_v034.ps1` — PowerShell deploy script (build + netlify deploy).

**Trạng thái cuối phiên 6**:
- v0.3.4 vẫn **CHƯA DEPLOY** (chờ user).
- Migration 005 **CHƯA APPLY** (chờ test v0.3.4 trước để biết bug Chấm công thuộc Case A/B/C).
- Sandbox Cowork không boot được suốt phiên 6 → toàn bộ là chuẩn bị artefact + handover.

**Thảo luận kiến trúc luồng dữ liệu**:
- Hiện tượng treo có liên quan luồng dữ liệu một phần (V75 đang trộn write + log + reload trong cùng `saveAll()`), nhưng nguồn gốc chính nhiều khả năng là RLS chậm với batch.
- Web app nên tách 4 luồng: **critical (write đồng bộ)**, **side-effect (log/audit fire-and-forget)**, **read (có thể optimistic)**, **background (cron)**.
- Đề xuất cho V75 (8 user, không cần CQRS đầy đủ):
  - Chuyển `activity_logs` xuống **Postgres trigger server-side** → xoá toàn bộ `void logActivity()` trong client → loại bỏ luồng log khỏi hot-path, audit không bao giờ mất.
  - Optimistic UI cho `load()` sau save (nice-to-have, làm sau).

### Phiên 7 — Refactor v0.4.0: audit server-side + xoá `logActivity` khỏi client

**Bối cảnh đầu phiên**: User xác nhận đã deploy v0.3.4 và test Case A — Chấm công batch save chạy < 5s, không treo. Bug v0.3.x ĐÓNG. Quyết hướng đi: triển khai Ưu tiên 2 (Migration 005 + bump v0.4.0).

**Việc đã làm (Claude tự sửa code, user deploy)**:

1. **`src/lib/api.ts`** — xoá `import { logActivity } from '@/lib/log'` + 9 chỗ `void logActivity({...})` (createDepartment, updateDepartment, setDepartmentActive, createEmployee, updateEmployee, createSalaryConfig, updateUserRow, upsertAttendanceBatch, setAttendanceStatus, upsertSalaryRecords, setSalaryRecordsStatus). Thêm doc-comment giải thích lý do refactor v0.4.0.
2. **`src/lib/log.ts`** — đổi thành STUB no-op: export `logActivity` nhưng chỉ return; giữ file để không phá build nếu còn import sót và để rollback nhanh từ git history.
3. **`package.json`** — bump `0.3.4 → 0.4.0`.
4. **`src/components/Sidebar.tsx`** — đổi label `v0.3.4 – Module 1+2+3+4` → `v0.4.0 – Audit server-side`.

**Migration 005** đã có sẵn từ phiên 6 (`supabase/migrations/005_audit_triggers.sql`), được copy ra root folder `005_audit_triggers_to_paste.sql` cho dễ paste.

**Files mới tạo phiên 7 (trong folder dự án để user truy cập được)**:
- `HUONG_DAN_PHIEN_7.md` — guide 5 bước: apply migration 005 → verify pg_trigger → smoke test → deploy v0.4.0 → verify production. Có FAQ rollback.
- `deploy_v040.ps1` — PowerShell deploy (typecheck → build → netlify deploy).
- `005_audit_triggers_to_paste.sql` — copy migration 005.

**Trạng thái giữa phiên 7**:
- User đã apply migration 005 + deploy v0.4.0 OK. Log chấm công ghi đầy đủ với `user_cccd` đúng.
- **NHƯNG xuất hiện bug regression**: hệ thống load chậm, F5 trang treo vĩnh viễn ở "Đang kiểm tra phiên đăng nhập..." (Console không có error đỏ).

**Phân tích bug v0.4.0**:
- `AuthProvider.useEffect` init: `loadProfile()` (3 SELECT users/employees/departments) + `auth.signOut({scope:'local'})` không có timeout cứng → khi Supabase chậm, `setLoading(false)` không bao giờ chạy.
- Trigger `trg_audit_users` từ migration 005 fire mỗi lần login (`signInWithCccd` update `failed_attempts=0` + `last_login_at`) → spam audit log + có thể gây nghẽn GoTrue auth flow.
- UPDATE no-op cũng fire trigger → log rác.

**Hotfix v0.4.1 (Claude làm, chưa deploy)**:
1. `src/contexts/AuthContext.tsx` — **hard timeout 8s** cho toàn bộ init flow + **6s** cho `loadProfile()` + **3s** cho mọi `auth.signOut({scope:'local'})`. Sau cùng force `setLoading(false)` bất kể. App không bao giờ treo trắng nữa.
2. `supabase/migrations/006_audit_optimize.sql` (mới) — **DROP `trg_audit_users`** + tách 9 trigger còn lại thành 3 (ins/upd/del), trong đó UPDATE có `WHEN (OLD.* IS DISTINCT FROM NEW.*)` để bỏ no-op.
3. Bump 0.4.0 → 0.4.1 + Sidebar label.

**Files mới phiên 7 (đợt hotfix v0.4.1)**:
- `HUONG_DAN_HOTFIX_v041.md` — guide có 2 lộ trình (chỉ deploy code / đầy đủ apply migration 006 + deploy) + lộ trình rollback test.
- `006_audit_optimize_to_paste.sql` — paste vào SQL Editor.
- `rollback_audit_test.sql` — DROP FUNCTION audit_row CASCADE, dùng để cô lập nguyên nhân nếu hotfix vẫn không đủ.
- `deploy_v041.ps1` — PowerShell deploy.
- `supabase/migrations/006_audit_optimize.sql` — migration trong folder dự án.

**Phiên 7 đợt 3 — Deploy v0.4.1 không cứu được, rollback test cho kết quả bất ngờ, hotfix v0.4.2**:

User apply migration 006 + deploy v0.4.1 theo `HUONG_DAN_HOTFIX_v041.md`. Kết quả: **vẫn treo "Đang kiểm tra phiên đăng nhập..."**, nhưng Console hiện log `[V75] AuthProvider init hard timeout 8s — force unblock` → tức là hard timeout đã fire, `setLoading(false)` đã chạy. Vì sao vẫn treo?

**Hỏi user kỹ symptom**: thực ra app KHÔNG còn treo ở ProtectedRoute, mà sidebar v0.4.1 đã hiện. Vấn đề là **trang Dashboard hiện ra hoàn toàn trắng**:
- Sidebar chỉ có 2 menu (Dashboard + Phiếu lương) thay vì 9 menu của admin_he_thong → role mặc định `'user'` (vì `profile?.user.role ?? 'user'` khi profile null).
- Header hiện "Xin chào —" / "()" — placeholder khi profile null.
- DashboardPage có `if (!profile) return null` → render rỗng.

→ **Symptom thực sự**: `loadProfile()` không xong → profile null → trang trống.

**Đề xuất rollback_audit_test.sql** để xác nhận trigger 005/006 có phải thủ phạm: user chạy `DROP FUNCTION audit_row CASCADE` → F5 → **vẫn mất 13-15s, profile vẫn không load**.

→ **PHÁT HIỆN QUAN TRỌNG**: trigger 005/006 KHÔNG phải nguyên nhân chính. Nguyên nhân thực sự là **`loadProfile()` chạy 3 SELECT users/employees/departments TUẦN TỰ** (sequential await). Trên Supabase free tier cold start, mỗi SELECT 4-5s → tổng 12-15s.

**Hotfix v0.4.2 (Claude làm)**:

1. `src/contexts/AuthContext.tsx` — sửa `loadProfile`:
   - SELECT users vẫn await (phụ thuộc — cần `user.employee_id` và `user.department_id`).
   - 2 SELECT employees + departments chuyển sang **chạy song song** bằng `Promise.all`. Wrap mỗi query trong async IIFE với try/catch (vì supabase-js trả `PromiseLike`, không có `.catch`).
   - Skip event `INITIAL_SESSION` trong `onAuthStateChange` → tránh main path + callback đua nhau gọi `loadProfile` (2× 3 SELECTs = 6 SELECTs đồng thời, quá tải connection pool).
   - Tăng hard timeout `8s → 12s` để cover cold start parallel.
   - Bỏ inner timeout 6s cho `loadProfile` (tránh flicker placeholder → tên thật sau 1s).

2. `src/pages/DashboardPage.tsx` — thay `if (!profile) return null` bằng **fallback UI**: hiển thị Card "Đang tải hồ sơ…" + nút "Tải lại hồ sơ" (gọi `refreshProfile()`). Tránh trang trắng tinh.

3. Bump `0.4.1 → 0.4.2` + Sidebar label `v0.4.2 – loadProfile song song`.

**Files mới phiên 7 đợt 3**:
- `HUONG_DAN_HOTFIX_v042.md` — guide re-apply 005 + 006 (vì rollback đã DROP toàn bộ) + deploy v0.4.2 + đo thời gian F5 lần 1 vs lần 2 để chẩn đoán cold start.
- `deploy_v042.ps1` — PowerShell deploy v0.4.2.

**TS error khi user build v0.4.2**: `Property 'catch' does not exist on type 'PromiseLike<...>'`. Đã sửa bằng cách wrap mỗi supabase query trong `async IIFE` với `try/catch` thay vì `.catch` chain.

**Trạng thái cuối phiên 7**:
- Code v0.4.2 đã sửa + đã fix TS error, **CHƯA BUILD/DEPLOY**.
- Migration 005 + 006 **ĐÃ BỊ DROP** ở cuối phiên 7 đợt 2 (rollback test) → cần **re-apply** ở phiên 8 trước khi deploy v0.4.2.
- Nguyên nhân chính **đã xác định**: 3 SELECT tuần tự + Supabase free tier cold start.
- Sandbox Cowork phiên 7 vẫn không tự chạy được `npm`/`netlify`/`supabase`.

### Giữa phiên 7 và 8 (user tự xử lý)

- Re-apply migration 005 + 006 thành công.
- Build & deploy v0.4.2 → v0.4.3 (user bổ sung optimization: cache `AuthProfile` vào localStorage → F5 hydrate đồng bộ ngay lần render đầu tiên, không cần đợi 3 SELECT users/employees/departments).
- Kết quả: **F5 đã nhanh, bug performance ĐÓNG**. Cold start Supabase free tier vẫn tồn tại nhưng người dùng không thấy spinner trắng nữa nhờ cache.

### Phiên 8 — Module 5 mở màn: UI Nhật ký hoạt động (v0.5.0)

**Bối cảnh đầu phiên**: Bug performance đóng, anh chọn Module 5 ưu tiên 1 (`/logs`) trước Excel/PDF.

**Việc đã làm**:

1. **`src/lib/types.ts`** — thêm:
   - `interface ActivityLog` khớp 100% schema bảng `activity_logs` (11 trường).
   - `parseLogAction(action)` tách `"insert.departments"` → `{ op: 'insert', table: 'departments' }`.
   - `LOG_OP_LABEL` (insert/update/delete/login/logout → tiếng Việt).
   - `LOG_ENTITY_TYPES` (mảng 9 bảng có trigger 005/006, dùng cho dropdown filter).

2. **`src/lib/api.ts`** — thêm:
   - `interface ActivityLogFilter` (user_cccd, entity_type, op, dateFrom, dateTo).
   - `interface ActivityLogPage` (rows + total).
   - `fetchActivityLogs(filter, { limit, offset })` query `activity_logs` với `count: 'exact'`, ORDER BY `created_at DESC`, range pagination.
     - CCCD: `ilike '<value>%'` (prefix match).
     - op: `ilike 'insert.%'`/`'update.%'`/`'delete.%'` trên cột `action`.
     - entity_type: `eq`.
     - dateFrom/dateTo: `gte`/`lte` với boundary 00:00:00 và 23:59:59 UTC.

3. **`src/pages/LogsPage.tsx`** mới (route `/logs`, admin_he_thong only):
   - Filter bar 5 control (CCCD, Hành động, Loại dữ liệu, Từ ngày, Đến ngày) + nút Lọc/Reset.
   - Pattern "draft filter" vs "applied filter" — chỉ trigger fetch khi user ấn Lọc, không re-fetch mỗi keystroke.
   - Bảng 6 cột (Thời gian, CCCD, Hành động badge, Loại dữ liệu, Entity ID rút gọn, nút Mắt).
   - Paginate 50 dòng/trang, có "1–50 / 312 log" + nút lùi/tiến + số trang.
   - Dialog "Chi tiết log" hiện 2 cột song song JSON `old_value` / `new_value` pretty-printed, scroll riêng.
   - Sử dụng `lucide-react` icons: `History, ChevronLeft, ChevronRight, Eye, RotateCw, Search, X`.

4. **`src/App.tsx`** — thay `Placeholder` `/logs` bằng `<LogsPage />` thực (giữ guard `roles=['admin_he_thong']`).

5. **`package.json`** — bump `0.4.3 → 0.5.0` (Module 5 mở màn, bump minor).

6. **`src/components/Sidebar.tsx`** — label `v0.4.3 – cache profile F5` → `v0.5.0 – Module 5: Nhật ký`.

**Files mới phiên 8 (trong folder dự án)**:
- `HUONG_DAN_PHIEN_8.md` — guide deploy + 5 bước smoke test (admin thấy menu, filter, trigger ghi log thật, RLS chặn user thường).
- `deploy_v050.ps1` — PowerShell deploy (typecheck → build → netlify).

**RLS đã có sẵn** (`002_rls_policies.sql`): `logs_admin_select` chỉ cho `is_admin_he_thong()` → bảo vệ ở DB không cần guard thêm trong `fetchActivityLogs`.

**Trạng thái cuối phiên 8**:
- Code v0.5.0 trong folder, **CHƯA BUILD/DEPLOY**. Sandbox Cowork vẫn không boot được → typecheck phải user chạy `npm run typecheck` local.
- Không thay đổi gì trên DB (migration đã đủ từ phiên 7).
- Không có bug nào nổi lên trong phiên này — code straightforward, chủ yếu thêm chứ không sửa logic cũ.

### Giữa phiên 8 và 9 (user tự xử lý)

- Build & deploy v0.5.0 thành công.
- Smoke test 5 bước (D1-D5) PASS hết: admin_he_thong thấy menu, /logs render đầy đủ filter+pagination, dialog JSON OK, trigger ghi log thật, RLS chặn user thường.
- Bug performance vẫn ĐÓNG, không có regression.

### Phiên 9 — Module 5 mở rộng: Excel + CSV + pg_cron (v0.6.0)

**Bối cảnh đầu phiên**: v0.5.0 OK, anh chọn 3 hạng mục triển khai:
1. **Chính**: Xuất Excel bảng lương (SheetJS).
2. **Phụ**: Nút Xuất CSV ở /logs.
3. **Phụ**: pg_cron clean activity_logs > 6 tháng.

**Việc đã làm (Claude tự sửa code, user deploy)**:

1. **`package.json`**:
   - Bump `0.5.0 → 0.6.0`.
   - Thêm dependency `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`. **Lưu ý**: package `xlsx` trên npm registry đã bị maintainers gỡ; phải cài tarball từ CDN SheetJS chính thức. Lệnh: `npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.

2. **`src/lib/excel.ts`** (file mới):
   - `exportSalaryToExcel({ records, department, monthYear })`: tạo workbook 1 sheet "Bảng lương" gồm:
     - 4 dòng metadata (tiêu đề, phòng ban, số NV, ngày xuất) + 1 dòng trống.
     - Bảng chi tiết 30 cột (STT, Họ tên, CCCD, Chức vụ, Ngạch/Bậc, hệ số, lương cơ sở/ngày, các khoản chịu thuế, KCT, BH NLĐ, CĐP, thuế TNCN, truy lĩnh/thu, thực lĩnh, số TK, ngân hàng, trạng thái VN).
     - Dòng cuối **TỔNG CỘNG** cộng dồn 15 cột số tiền (chỉ tổng cột tiền, không tổng hệ số/LCB).
     - Tự co rộng cột theo độ dài nội dung (`!cols`).
     - Tên file: `BangLuong_<DEPT>_<YYYY-MM>_<stamp>.xlsx`. Hàm `safeFileName` bỏ dấu tiếng Việt + ký tự đặc biệt.
   - `exportLogsToCsv({ rows, suffix })`: CSV UTF-8 có BOM (`﻿`) để Excel mở đúng tiếng Việt; escape RFC 4180 (bọc `"` nếu có `,` `"` xuống dòng).
     - 9 cột: Thời gian VN, CCCD, Hành động (VN), Bảng (entity raw), Loại dữ liệu (VN), Entity ID, IP, Giá trị cũ (JSON inline), Giá trị mới (JSON inline).
   - Cả 2 hàm trigger download bằng `<a download>` + `URL.createObjectURL` + revoke sau 1s.

3. **`src/pages/SalaryPage.tsx`**:
   - Import `Download` icon + `exportSalaryToExcel`.
   - Thêm nút **Xuất Excel** sau nút "Tải lại". Disabled khi `busy || records.length === 0`.
   - Sau xuất set `info` báo "Đã xuất Excel N bản lương..."; bắt lỗi vào `error`.

4. **`src/pages/LogsPage.tsx`**:
   - Import `Download` icon + `exportLogsToCsv`.
   - Thêm state `exporting` + const `CSV_MAX_ROWS = 5000`.
   - Hàm `onExportCsv` async: fetch tối đa 5000 dòng theo filter ÁP DỤNG (không phụ thuộc page hiện tại), sinh suffix tên file theo entity_type / op / cccd / 'all'.
   - Cảnh báo `error` (dùng Alert sẵn có) nếu `total > CSV_MAX_ROWS` để user biết file chỉ có 5000 dòng mới nhất.
   - Nút **Xuất CSV** đặt cạnh nút Reload trong cụm pagination header.

5. **`src/components/Sidebar.tsx`**: label `v0.5.0 – Module 5: Nhật ký` → `v0.6.0 – Excel + CSV + cron`.

6. **`supabase/migrations/007_log_cleanup_cron.sql`** (mới):
   - `CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;`
   - DO block: SELECT jobid của job `v75_cleanup_activity_logs` (nếu có) → `cron.unschedule(jid)` để idempotent.
   - `cron.schedule('v75_cleanup_activity_logs', '15 3 * * *', $$DELETE FROM public.activity_logs WHERE created_at < NOW() - INTERVAL '6 months'$$)`. Chạy 03:15 UTC mỗi ngày.
   - Comment chi tiết SQL verify (`SELECT FROM cron.job`), xem lịch sử (`cron.job_run_details`), test thủ công, rollback.

**Files mới phiên 9 (trong folder dự án)**:
- `src/lib/excel.ts` (helper SheetJS + CSV).
- `supabase/migrations/007_log_cleanup_cron.sql`.
- `007_log_cleanup_cron_to_paste.sql` (root, copy 007 dễ paste).
- `HUONG_DAN_PHIEN_9.md` (guide deploy v0.6.0 + apply 007 + 5 bước smoke test E1-E4 + troubleshooting + roadmap).
- `deploy_v060.ps1` (PowerShell 5 bước: install xlsx → typecheck → build → netlify → nhắc apply 007).

**Trạng thái cuối phiên 9**:
- Code v0.6.0 trong folder, **CHƯA BUILD/DEPLOY**. Cần `npm install` SheetJS trước.
- Migration 007 **CHƯA APPLY** (chờ user deploy v0.6.0 OK rồi paste 007 vào SQL Editor).
- Sandbox Cowork phiên 9 vẫn chưa boot được → user phải tự chạy `.\deploy_v060.ps1`.
- Không có bug nào nổi lên trong phiên này — chỉ thêm tính năng mới, không sửa logic cũ.

### Giữa phiên 11 và 12 (user tự xử lý)

- Cài Supabase CLI + `supabase login` + `supabase link --project-ref qvcqkciobetttltlqqjq`.
- Set secret `SUPABASE_SERVICE_ROLE_KEY` vào Edge runtime.
- Deploy v0.8.0 (`.\deploy_v080.ps1`): frontend OK + 2 Edge Function deploy OK.
- Smoke test E1-E5 PASS: PromotionsPage hiển thị NV sắp đến hạn, nút Nâng bậc OK, Reset PW OK, Lockout server-side qua F5 vẫn giữ trạng thái (bypass-proof), RLS chặn user thường.

### Phiên 12 — GitHub Remote + Netlify Auto-Deploy

**Bối cảnh đầu phiên**: v0.8.0 đã deploy OK. Anh chọn hạng mục: GitHub remote + Netlify auto-deploy.

**Việc đã làm**:

1. **Git commit**: Toàn bộ thay đổi phiên 4-11 (từ v0.4.0 đến v0.8.0) được stage và commit thành 1 commit gọn gàng với message mô tả đầy đủ. Repo local hiện có 2 commit: v0.3.0 (cũ) + v0.4.0-v0.8.0 (mới).

2. **Branch đổi `master` → `main`** (theo convention GitHub mặc định).

3. **Files hướng dẫn mới**:
   - `setup_github_phien12.ps1` — script PowerShell: xóa git lock → stage -A → commit v0.4.0-v0.8.0 → đổi branch sang main → in hướng dẫn bước tiếp theo.
   - `HUONG_DAN_PHIEN_12.md` — guide đầy đủ: tạo GitHub repo private → push → kết nối Netlify auto-deploy → set env vars → smoke test quy trình mới → troubleshooting.

**Quy trình CI/CD mới sau phiên 12**:
```
git add . → git commit → git push origin main → Netlify auto-build (1-2 phút)
```
Không cần `.\deploy_v0xx.ps1` thủ công nữa.

**Trạng thái cuối phiên 12**:
- Script commit (`setup_github_phien12.ps1`) đã tạo — **user chạy để commit + đổi branch**.
- **Chờ user**: tạo GitHub repo (private) → `git remote add origin ...` → `git push -u origin main`.
- **Chờ user**: kết nối Netlify với GitHub repo (Site config → Build & deploy → Connect to Git) + set 2 env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- Sau đó smoke test bằng 1 commit nhỏ → verify Netlify tự build.

---

## V. KIẾN TRÚC FILE HIỆN TẠI

### Backend (Supabase)
```
supabase/
├── migrations/
│   ├── 001_initial_schema.sql        ✓ Applied
│   ├── 002_rls_policies.sql          ✓ Applied
│   ├── 003_seed_data.sql             ✓ Applied
│   ├── 004_salary_records_constraints.sql  ✓ Applied (phiên 5)
│   ├── 005_audit_triggers.sql        ✓ Re-applied giữa phiên 7 và 8 (user xác nhận log mới ghi đủ).
│   ├── 006_audit_optimize.sql        ✓ Re-applied — DROP trg_audit_users + WHEN clause UPDATE bỏ no-op.
│   └── 007_log_cleanup_cron.sql      ⏳ CHƯA APPLY — pg_cron clean activity_logs > 6 tháng (phiên 9).
└── scripts/
    └── seed-users.mjs                 ✓ Đã chạy
```

### Frontend
```
src/
├── App.tsx                            Router root
├── main.tsx                           Entry
├── components/
│   ├── Header.tsx, Layout.tsx        Layout chung
│   ├── Sidebar.tsx                    v0.4.2 label
│   ├── ProtectedRoute.tsx             Route guard (loading screen "Đang kiểm tra phiên đăng nhập...")
│   └── ui/                            shadcn-style primitives
├── contexts/
│   └── AuthContext.tsx                v0.4.3: cache AuthProfile localStorage + hydrate đồng bộ + tolerant loadProfile
├── lib/
│   ├── api.ts                         CRUD tập trung + (v0.5.0) `fetchActivityLogs()` cho LogsPage
│   ├── log.ts                         STUB no-op deprecated v0.4.0 (giữ file để rollback nhanh)
│   ├── supabase.ts                    Client + fetch timeout 20s + auth cleanup
│   ├── payroll.ts                     Tính lương + thuế TNCN (Module 4)
│   ├── excel.ts                       (v0.6.0) SheetJS + CSV: exportSalaryToExcel, exportLogsToCsv
│   ├── types.ts                       TypeScript types + (v0.5.0) `ActivityLog`, `parseLogAction`, `LOG_OP_LABEL`, `LOG_ENTITY_TYPES`
│   └── utils.ts                       Tiện ích chung
└── pages/                             11 page: Login, Dashboard (v0.4.2 fallback UI),
                                       ChangePassword, Employees, Departments, Config, Users,
                                       Attendance (v0.6.0: nút Xuất Excel ở Salary),
                                       Salary, Payslip, Unauthorized,
                                       Logs (v0.5.0 + v0.6.0: nút Xuất CSV)
```

### Bàn giao
```
Trong folder dự án:
├── CLAUDE.md                          Ghi chú dự án (DB password)
├── TOM_TAT_TOAN_BO_PHIEN.md           File này
└── HANDOVER_PHIEN_5.md                Handover ngắn phiên 5

Trong outputs Cowork (phiên 5):
├── HUONG_DAN_PHIEN_5.md               Guide deploy v0.3.2
├── 004_migration_to_paste.sql         SQL đã paste OK
├── deploy_v032.ps1                    Deploy script
├── HOTFIX_v033.md                     Guide v0.3.3
└── HOTFIX_v034.md                     Guide v0.3.4 + test plan Network

Trong outputs Cowork (phiên 6):
├── HUONG_DAN_PHIEN_6.md               Guide deploy v0.3.4 + apply migration 005
├── 005_audit_triggers_to_paste.sql    SQL migration 005 (copy để paste)
└── deploy_v034.ps1                    PowerShell deploy script v0.3.4

Trong folder dự án (phiên 7, user truy cập trực tiếp):
├── HUONG_DAN_PHIEN_7.md               Guide 5 bước: migration 005 → deploy v0.4.0
├── 005_audit_triggers_to_paste.sql    Copy migration 005 sang root để dễ paste
├── deploy_v040.ps1                    PowerShell deploy v0.4.0 (typecheck + build + netlify)
│
├── HUONG_DAN_HOTFIX_v041.md           Guide hotfix v0.4.1 (đợt 2 phiên 7)
├── 006_audit_optimize_to_paste.sql    DROP trg_audit_users + WHEN clause UPDATE bỏ no-op
├── rollback_audit_test.sql            DROP FUNCTION audit_row CASCADE (đã CHẠY → audit hiện tại bị DROP)
├── deploy_v041.ps1                    PowerShell deploy v0.4.1
│
├── HUONG_DAN_HOTFIX_v042.md           Guide hotfix v0.4.2 (đợt 3 phiên 7) — re-apply migrations + deploy
└── deploy_v042.ps1                    PowerShell deploy v0.4.2 (loadProfile parallel)

Trong folder dự án (phiên 8):
├── HUONG_DAN_PHIEN_8.md               Guide deploy v0.5.0 + 5 bước smoke test /logs
└── deploy_v050.ps1                    PowerShell deploy v0.5.0

Trong folder dự án (phiên 9, mới):
├── HUONG_DAN_PHIEN_9.md               Guide deploy v0.6.0 + apply 007 + smoke test E1-E4
├── deploy_v060.ps1                    PowerShell 5 bước (install xlsx → typecheck → build → netlify → nhắc apply 007)
├── 007_log_cleanup_cron_to_paste.sql  Copy migration 007 ra root để dễ paste vào SQL Editor
└── supabase/migrations/007_log_cleanup_cron.sql  Migration thật trong folder migrations
```

---

## VI. VIỆC ĐẦU TIÊN CỦA PHIÊN 13

### Tiền đề (kết thúc phiên 12)
- **Code v0.8.0** đã deploy + smoke test OK. Tất cả migration 001-008 đã apply.
- **Git local**: 2 commit (v0.3.0 + v0.4.0-v0.8.0). Branch `main`.
- **Chờ user hoàn thành phiên 12**: chạy `.\setup_github_phien12.ps1` → tạo GitHub repo → push → kết nối Netlify auto-deploy.

### Bước 1 — Verify CI/CD hoạt động (nếu phiên 12 đã xong)

```powershell
# Test: 1 commit nhỏ → push → Netlify tự build
git log --oneline -3
# Phải thấy 2 commit: v0.3.0 và v0.4.0-v0.8.0
```

Mở https://app.netlify.com → Deploys → deploy mới nhất status "Published".

### Bước 2 — Chọn hướng phiên 13

Sau khi CI/CD OK, chọn 1 trong:
- **(a)** UI tạo user mới từ /users — Edge Function `admin-create-user` (bỏ seed-users.mjs).
- **(b)** Module 6 báo cáo tổng hợp + biểu đồ (theo phòng/tháng/năm).
- **(c)** Email cảnh báo cron tháng (Resend/SendGrid Edge Function).

---

## VII. ROADMAP PHIÊN 13+

### ✓ Đã làm phiên 8 — Module 5 / UI `/logs`
- LogsPage.tsx + fetchActivityLogs() + ActivityLog type + paginate 50 + dialog JSON. Bump v0.5.0.

### ✓ Đã làm phiên 9 — Module 5 / Excel + CSV + pg_cron
- `src/lib/excel.ts` (exportSalaryToExcel + exportLogsToCsv). Nút Xuất Excel ở SalaryPage. Nút Xuất CSV ở LogsPage (trần 5000 dòng). Migration 007 pg_cron clean activity_logs > 6 tháng. Bump v0.6.0.

### ✓ Đã làm phiên 10 — Module 5 / PDF + cron TNVK
- `src/lib/pdf.ts` (jsPDF + html2canvas A5). Migration 008 (check_upcoming_promotions + recalc_tnvk + pg_cron tháng). Bump v0.7.0.

### ✓ Đã làm phiên 11 — Module 5 hoàn thiện
- PromotionsPage (UI nâng bậc). Edge Function admin-reset-password. Edge Function auth-lockout server-side. Bump v0.8.0.

### ✓ Đã làm phiên 12 — Hạ tầng CI/CD
- Git commit toàn bộ v0.4.0-v0.8.0. Script + guide kết nối GitHub remote + Netlify auto-deploy.

### Ưu tiên 1 (phiên 13) — UI tạo user mới
- **Edge Function `admin-create-user`**: admin_he_thong tạo user mới từ /users (auth.admin.createUser + insert public.users). Bỏ seed-users.mjs thủ công.

### Ưu tiên 2 — Module 6 báo cáo
- Tổng hợp bảng lương theo phòng ban / tháng / năm. Biểu đồ cột/đường (recharts). Export Excel tổng hợp.

### Ưu tiên 3 — Cải thiện còn lại
- Email cảnh báo khi cron tháng phát hiện NV sắp đến hạn nâng bậc (Resend/SendGrid Edge Function).
- Audit log action='admin.password_reset' khi Edge Function reset MK.
- Tolerance NUMERIC `Math.abs(a-b) < 0.001` trong `refreshDriverMatch` thay vì so equality strict.
- Escalated lockout: lần 1 → 5', lần 2 → 15', lần 3 → 1h.

---

## VIII. CHANGELOG VERSION

| Version | Nội dung chính | Trạng thái deploy |
|---|---|---|
| 0.1.x | Module 1: Auth + RLS + seed users | ✓ |
| 0.2.x | Module 2: CRUD departments/employees/config/users + hotfix đổi MK | ✓ |
| 0.2.3 | Hotfix race onAuthStateChange + refresh token + RLS silent filter | ✓ |
| 0.3.0 | Module 3: Attendance 4 khối + workflow | ✓ |
| 0.3.0 | Module 4: SalaryPage + PayslipPage + migration 004 (gộp với 0.3.0) | ✓ Deploy nhưng có bug |
| 0.3.1 | Fix save treo: fetch timeout 20s + auth cleanup + log Promise.race | ✓ |
| 0.3.2 | Batch upsert Attendance (`upsertAttendanceBatch`) | ✓ |
| 0.3.3 | log.ts: `getUser` (REST) → `getSession` (local) + cache cccd | ✓ |
| 0.3.4 | api.ts: chunk batch 10 row/lần + `withTimeout(12s)` mỗi chunk | ✓ Deploy + test Case A OK (Chấm công save < 5s) |
| 0.4.0 | Migration 005 audit triggers (DB) + xoá `logActivity` khỏi client → api.ts thuần CRUD, log.ts STUB no-op | ✓ Deploy nhưng có regression: F5 treo "Đang kiểm tra phiên đăng nhập..." |
| 0.4.1 | Hotfix: AuthContext hard timeout 8s + Migration 006 (DROP trg_audit_users + WHEN clause UPDATE bỏ no-op) | ✓ Deploy nhưng không cứu được symptom — vẫn 13-15s rồi trang trắng |
| 0.4.2 | loadProfile chạy song song (Promise.all employees+departments) + skip INITIAL_SESSION + hard timeout 12s + DashboardPage fallback UI | ✓ Deploy (re-apply 005+006 trước đó), nhưng cold start vẫn lộ spinner trắng vài giây |
| 0.4.3 | Cache AuthProfile vào localStorage → F5 hydrate đồng bộ ngay lần render đầu, loadProfile chạy nền cập nhật sau | ✓ Deploy, **bug performance ĐÓNG**, F5 nhanh kể cả cold start |
| 0.5.0 | Module 5 mở màn: trang `/logs` xem activity_logs (filter CCCD/op/entity/date + paginate 50 + dialog JSON old/new) + `fetchActivityLogs()` trong api.ts + types `ActivityLog`/`parseLogAction`/`LOG_OP_LABEL`/`LOG_ENTITY_TYPES` | ✓ Deploy + smoke test 5 bước OK (giữa phiên 8 và 9) |
| 0.6.0 | Module 5 mở rộng: `src/lib/excel.ts` (SheetJS + CSV) + nút Xuất Excel ở SalaryPage + nút Xuất CSV ở LogsPage + Migration 007 pg_cron job clean log > 6 tháng | ✓ Deploy + apply 007 OK (giữa phiên 9 và 10) |
| 0.7.0 | Module 5 hoàn thiện: `src/lib/pdf.ts` (jsPDF + html2canvas, A5 dọc) + nút Xuất PDF ở PayslipPage + Migration 008 cron `v75_monthly_tnvk_promotion` chạy đầu mỗi tháng (recalc TNVK NV bậc cuối + cảnh báo nâng bậc 30 ngày) | ✓ Deploy + apply 008 OK (giữa phiên 10 và 11) |
| **0.8.0** | **Phiên 11**: (1) Trang `/promotions` UI quản lý nâng bậc TNVK cho admin_luong (gọi `check_upcoming_promotions`, nút Nâng bậc làm `bac+=1` + `ngay_huong_bac=today`). (2) Edge Function `admin-reset-password` reset MK về `8888V75` từ UsersPage (icon KeyRound). (3) Edge Function `auth-lockout` đếm `failed_attempts` SERVER-SIDE (không bị bypass F5). LoginPage refactor bỏ STORAGE_KEY client-side. KHÔNG thêm dependency npm. | ✓ Deploy + smoke test E1-E5 PASS (giữa phiên 11 và 12) |

---

### Phiên 10 — Module 5 hoàn thiện (v0.7.0): PDF phiếu lương + Cron TNVK

**Việc đã làm (Claude tự sửa code, user deploy)**:

1. **`src/lib/pdf.ts`** (mới) — helper `exportPayslipToPdf({ element, cccd, monthYear, hoTen })`.
   Dùng `html2canvas` chụp DOM phiếu → `jsPDF` khổ A5 dọc (148×210mm, margin 8mm).
   Hỗ trợ phiếu dài hơn 1 trang: cắt canvas thành nhiều slice và trải lên nhiều page.
   Tiếng Việt hiển thị chuẩn vì PDF embed raster image render từ font browser.

2. **`supabase/migrations/008_tnvk_promotion_cron.sql`** (mới):
   - `recalc_tnvk_for_top_grade()` — RULE-03: tính `tnvk_percent` cho NV bậc cuối
     (`5 + floor((months - thoi_gian_cho)/12)`); chỉ UPDATE khi khác (tránh spam audit).
   - `check_upcoming_promotions(p_days_ahead)` — RULE-02: list NV chưa bậc cuối
     có `ngay_huong_bac + chu_ky_nang_bac_nam` rơi trong khoảng [today; today + N].
   - `run_monthly_tnvk_promotion_job()` wrapper được pg_cron gọi; INSERT
     `activity_logs` với `action='system.tnvk_promotion_job'`, return text mô tả.
   - pg_cron job `v75_monthly_tnvk_promotion` schedule `30 0 1 * *` (≈07:30 VN ngày 1).

3. **`src/pages/PayslipPage.tsx`** — thêm nút **Xuất PDF** (icon FileDown) cạnh nút In.
   State `exporting`, bọc `<PayslipDetail>` trong `<div ref={printableRef}>`.

4. **`package.json`** bump 0.6.0 → 0.7.0 + thêm `jspdf@^2.5.2`, `html2canvas@^1.4.1`.

5. **Sidebar** label `v0.6.0 – Excel + CSV + cron` → `v0.7.0 – PDF phiếu + cron TNVK`.

**Files mới phiên 10**:
- `src/lib/pdf.ts`
- `supabase/migrations/008_tnvk_promotion_cron.sql`
- `008_tnvk_promotion_cron_to_paste.sql` (root copy)
- `HUONG_DAN_PHIEN_10.md`
- `deploy_v070.ps1`

### Giữa phiên 10 và 11 (user xử lý)

- `npm install jspdf html2canvas` thành công.
- Deploy v0.7.0 OK + apply migration 008 OK + smoke test E1-E4 PASS.
- PDF phiếu lương A5 dọc xuất đúng, cron `run_monthly_tnvk_promotion_job()` chạy thủ công log thành công vào `activity_logs`.

### Phiên 11 — Nâng bậc UI + 2 Edge Function (v0.8.0)

**Bối cảnh đầu phiên**: v0.7.0 đã deploy OK. Anh chọn 3 hạng mục cùng lúc cho phiên 11:
1. UI quản lý nâng bậc TNVK (tận dụng function migration 008).
2. Edge Function reset password admin (bỏ `seed-users.mjs` thủ công).
3. Edge Function lockout server-side (chống bypass F5).

**Việc đã làm (Claude tự sửa code, user deploy)**:

1. **`src/pages/PromotionsPage.tsx`** (mới) — trang `/promotions`:
   - Filter slider 7/30/60/90/180 ngày (mặc định 30).
   - Bảng 8 cột với badge khẩn cấp (≤7d đỏ; ≤30d vàng; còn lại xanh).
   - Nút "Nâng bậc" → confirm dialog → update `bac+=1` + `ngay_huong_bac=today`.
   - Summary tổng kết: "Khẩn: X | Sắp đến: Y | Theo dõi: Z | Tổng N NV".

2. **`src/lib/api.ts`** — thêm 4 hàm:
   - `listUpcomingPromotions(daysAhead)` → RPC `check_upcoming_promotions(p_days_ahead)`.
   - `promoteEmployee(employeeId)` → validate bậc mới trong `salary_grades`, update `employees`.
   - `callAuthLockout(action, cccd)` → invoke Edge Function `auth-lockout`.
   - `adminResetPassword(targetUserId)` → invoke Edge Function `admin-reset-password`.

3. **`supabase/functions/admin-reset-password/index.ts`** (mới Edge Function):
   - Verify JWT caller → check `role = admin_he_thong` → block tự reset chính mình.
   - Gọi `auth.admin.updateUserById(id, { password: '8888V75' })` (dùng SERVICE_ROLE_KEY).
   - Update `users.must_change_password=true` + reset `failed_attempts=0`, `locked_until=NULL`.
   - Trả `{ ok, cccd, message }`. Deploy mặc định (verify_jwt=true).

4. **`supabase/functions/auth-lockout/index.ts`** (mới Edge Function):
   - 3 action: `check` (đọc), `increment` (sai → +1, lock nếu >= 5), `reset` (login OK → xoá).
   - Lock policy: 5 lần sai → khoá 5 phút (`locked_until = now() + 5min`).
   - Dùng SERVICE_ROLE_KEY bypass RLS (user chưa login). Deploy với `--no-verify-jwt`.
   - Trả `{ ok, locked, failed_attempts, remaining_seconds, remaining_attempts }`.

5. **`supabase/functions/_shared/cors.ts`** (mới) — CORS headers chia sẻ.

6. **`src/pages/LoginPage.tsx`** — refactor lockout:
   - Bỏ `STORAGE_KEY = 'v75_login_state'` + helper `getLockState`/`setLockState` (client-side).
   - Thêm `callAuthLockout`:
     - `onBlur` ô CCCD: gọi `check` preflight (best-effort).
     - Trước `signInWithPassword`: gọi `check` block nếu locked.
     - Sau login OK: gọi `reset` (backup phòng RLS chặn).
     - Sau login fail: gọi `increment`, hiển thị `remaining_attempts`.
   - State `serverLocked` + `secondsLeft` (đếm ngược client-side, không gọi lại server).
   - Fallback: nếu Edge Function lỗi mạng → vẫn cho user thử login (không block).

7. **`src/pages/UsersPage.tsx`** — thêm nút icon `KeyRound` mở dialog confirm reset MK.
   Không cho admin reset chính mình (so `u.id !== myId`). State `resetTarget`, `resetting`, `info`.
   Sửa subtitle giải thích quy trình mới (qua Edge Function).

8. **`src/App.tsx`** — route `/promotions` (roles=admin_luong + admin_he_thong) + import PromotionsPage.

9. **`src/components/Sidebar.tsx`** — menu mới "Nâng bậc TNVK" (icon `TrendingUp`),
   chèn giữa "Nhân viên" và "Phòng ban". Cập nhật label phiên bản.

10. **`package.json`** bump 0.7.0 → 0.8.0. KHÔNG thêm dependency npm (chỉ cần Supabase CLI cho deploy Edge Function).

**Files mới phiên 11** (trong folder dự án):
- `src/pages/PromotionsPage.tsx`
- `supabase/functions/_shared/cors.ts`
- `supabase/functions/admin-reset-password/index.ts` + `deno.json`
- `supabase/functions/auth-lockout/index.ts` + `deno.json`
- `HUONG_DAN_PHIEN_11.md` — guide đầy đủ: tiền đề (cài Supabase CLI, login, link, set secret) → deploy 1 lệnh → 5 bước smoke test E1-E5 → troubleshooting + roadmap.
- `deploy_v080.ps1` — 5 bước: typecheck → build → netlify → deploy 2 Edge Function.

**Trạng thái cuối phiên 11**:
- Code v0.8.0 trong folder, **CHƯA BUILD/DEPLOY**.
- 2 Edge Function **CHƯA DEPLOY** lên Supabase.
- Migration 008 đã apply từ phiên 10 (3 function `check_upcoming_promotions`,
  `recalc_tnvk_for_top_grade`, `run_monthly_tnvk_promotion_job` + cron job sẵn sàng).
- Tiền đề mới phải làm 1 lần: cài Supabase CLI + `supabase login` + `supabase link --project-ref qvcqkciobetttltlqqjq` + set secret `SUPABASE_SERVICE_ROLE_KEY` (xem `HUONG_DAN_PHIEN_11.md` mục C).
- Không có bug nào nổi lên trong phiên này — chỉ thêm tính năng mới, không sửa logic cũ.

---

## IX. CÂU HỎI MỞ CHO PHIÊN 13

1. UI nâng bậc hiện chỉ cho phép nâng 1 NV mỗi lần. Có cần "Nâng bậc hàng loạt" (checkbox chọn nhiều) không?
2. Lockout 5 lần / 5 phút có hợp lý không? Có cần escalate: lần khoá 2 → 15', lần 3 → 1h?
3. Reset password về `8888V75` (MK mềm). Có nên random 8 ký tự + gửi qua email/SMS không?
4. Edge Function `admin-reset-password` hiện không log audit (action='admin.password_reset'). Có cần thêm không?
5. `auth-lockout` deploy `--no-verify-jwt` → cho phép gọi không cần JWT. Có cần CAPTCHA hoặc rate-limit thêm không?
6. Có nên thêm tab "NV bậc cuối + TNVK hiện tại" trong trang `/promotions` để admin xem tổng thể không?
7. **Phiên 13 ưu tiên cái gì**: (a) UI tạo user mới từ /users (Edge Function admin-create-user), (b) Module 6 báo cáo tổng hợp + biểu đồ, (c) Email cảnh báo cron tháng, hay (d) các cải thiện bảo mật nhỏ?
