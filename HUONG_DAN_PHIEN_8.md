# HƯỚNG DẪN DEPLOY V0.5.0 — PHIÊN 8

> Module 5 mở màn: UI trang `/logs` (Nhật ký hoạt động). Bug performance F5 đã đóng từ v0.4.3.

---

## A. Tóm tắt thay đổi phiên 8

**Mới**
- `src/pages/LogsPage.tsx` — trang `/logs` xem activity_logs. Filter: CCCD, hành động (insert/update/delete), loại dữ liệu (9 entity), range date. Paginate 50 dòng/trang. Dialog "Chi tiết" hiện JSON `old_value` / `new_value`.
- `src/lib/api.ts` — thêm `fetchActivityLogs(filter, pagination)` trả `{ rows, total }` (đếm `HEAD` cho UI hiển thị "1–50 / N").
- `src/lib/types.ts` — thêm `ActivityLog`, `parseLogAction()`, `LOG_OP_LABEL`, `LOG_ENTITY_TYPES`.

**Sửa**
- `src/App.tsx` — route `/logs` từ Placeholder → `<LogsPage />` (giữ guard `roles=['admin_he_thong']`).
- `src/components/Sidebar.tsx` — đổi label `v0.4.3 – cache profile F5` → `v0.5.0 – Module 5: Nhật ký`.
- `package.json` — bump `0.4.3 → 0.5.0`.

**Không đụng**
- Migration DB (đã có 005/006 phiên 7).
- AuthContext, supabase.ts, payroll.ts, các page khác.

---

## B. Tiền đề cần có sẵn (xác nhận từ phiên 7)

1. Migration 005 + 006 đã apply lại trên Supabase (rollback test phiên 7 đợt 2 đã DROP, anh đã re-apply trước khi xác nhận F5 nhanh).
2. Bảng `activity_logs` có dữ liệu mới (từ khi 005/006 hoạt động).
3. Code base hiện tại = v0.4.3 đã deploy, F5 nhanh.

Verify nhanh (tuỳ chọn — SQL Editor Supabase):
```sql
-- 1) Đếm trigger audit (kỳ vọng 27 = 9 bảng × 3 op)
SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'trg_audit_%';

-- 2) Có log mới chưa?
SELECT count(*) FROM activity_logs;
SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 10;
```

Nếu `count(*) = 0` hoặc trigger chỉ còn vài cái → cần re-apply `005_audit_triggers_to_paste.sql` + `006_audit_optimize_to_paste.sql` ở root project.

---

## C. Deploy

```powershell
cd "D:\ClaudePro\V75-Hệ thống lương"
.\deploy_v050.ps1
```

Script chạy 3 bước: `tsc -b` (typecheck), `vite build`, `netlify deploy --prod`. Nếu typecheck/build fail sẽ dừng tại chỗ và in lỗi.

---

## D. Smoke test sau deploy

### D1. Admin hệ thống thấy menu mới
1. Tab Ẩn danh, mở https://luminous-marigold-a337b6.netlify.app
2. Login `001199000001` (admin_he_thong).
3. Sidebar phải có mục **Nhật ký hoạt động** (icon đồng hồ).
4. Click → vào `/logs`.

### D2. Trang /logs hoạt động
- Filter bar trên cùng có 5 control: CCCD, Hành động, Loại dữ liệu, Từ ngày, Đến ngày + 2 nút (Lọc, Reset).
- Bảng hiển thị log mới nhất trước (ORDER BY `created_at DESC`).
- Cột: Thời gian, CCCD, Hành động (badge xanh/xanh dương/đỏ), Loại dữ liệu, Entity ID (rút gọn 8 ký tự), nút mắt.
- Footer trái: "1–50 / 312 log". Phải: nút lùi/tiến trang + số trang.
- Click nút mắt → Dialog "Chi tiết log" hiện JSON old/new song song 2 cột.

### D3. Test filter
- Nhập CCCD `0011` → ấn Lọc → chỉ còn log của các user CCCD bắt đầu bằng 0011.
- Chọn "Hành động = Cập nhật" → chỉ còn `action` bắt đầu bằng `update.*`.
- Chọn "Loại dữ liệu = Chấm công VP" → chỉ còn `entity_type = attendance_office`.
- Đặt "Từ ngày" = hôm nay → chỉ log trong ngày.
- Reset → bảng trở về toàn bộ.

### D4. Test trigger ghi log thật
1. Tab khác, login `001199000002` (admin_luong).
2. Vào **Phòng ban** → sửa một phòng → Lưu.
3. Quay lại tab admin_he_thong → /logs → nhấn nút Reload (icon xoay) → log mới `update.departments` với `user_cccd = 001199000002` xuất hiện ở đầu.

### D5. Test RLS chặn
1. Tab khác, login user thường `001199000005`.
2. Sidebar **KHÔNG** thấy mục Nhật ký.
3. Truy cập trực tiếp URL `/logs` → router redirect sang `/unauthorized` (ProtectedRoute role guard).
4. Kể cả nếu bypass router, RLS `logs_admin_select` chặn từ DB → `fetchActivityLogs` sẽ trả `[]`.

---

## E. Trouble shooting

| Symptom | Nguyên nhân | Cách xử |
|---|---|---|
| `/logs` báo "Không tải được nhật ký" + console 400 Postgrest | Token hết hạn hoặc role không phải admin_he_thong | Logout/login lại. Verify `select * from users where id = auth.uid()` cho ra role đúng. |
| Bảng trống dù bấm Reset filter | activity_logs trong DB rỗng (trigger 005/006 chưa apply) | Re-apply `005_audit_triggers_to_paste.sql` + `006_audit_optimize_to_paste.sql` theo guide phiên 7. |
| Filter ngày không trả về gì | Định dạng date input HTML5 OK nhưng `dateTo` lọc `<= 'YYYY-MM-DDT23:59:59.999Z'` (UTC) → có thể lệch giờ VN | Để trống `dateTo` hoặc đặt sang ngày kế tiếp. (Cải tiến phiên sau: chuyển sang giờ local VN.) |
| Nút "Chi tiết" mở dialog nhưng cột "Giá trị cũ" trống | Trigger 005/006 không lưu OLD cho INSERT (đúng nghiệp vụ) | Bình thường. INSERT chỉ có new_value, DELETE chỉ có old_value, UPDATE có cả hai. |

---

## F. Việc kế tiếp (phiên 9)

Đề xuất theo roadmap:

1. **Module 5 — Xuất Excel bảng lương** (SheetJS). Cần template tham khảo từ `Cau_truc_tien_luong_V75_cap_nhat.docx` (nếu user có).
2. **Module 5 — Xuất PDF phiếu lương** (jspdf hoặc print CSS đơn giản — đã có nút In ở PayslipPage).
3. **Module 5 — Cron TNVK & nâng bậc** (Supabase pg_cron hoặc Edge Function scheduled).
4. **Module 5 — Reset password admin từ UI** (Edge Function dùng service_role).
5. **Hạ tầng — GitHub remote + Netlify auto-build**.

---

## G. Câu hỏi mở phiên 8

1. /logs có cần nút **Xuất CSV** filter hiện tại không? (Dễ thêm bằng client-side.)
2. Có nên thêm cron `pg_cron` clean activity_logs > 6 tháng? Hiện log sẽ phình theo thời gian.
3. Filter "JSON search trong new_value" có thực sự cần? (Tốn hơn, hiện tại đủ filter cấp 1 cho 8 user.)
