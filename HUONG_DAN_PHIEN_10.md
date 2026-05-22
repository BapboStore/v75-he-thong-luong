# HƯỚNG DẪN DEPLOY V0.7.0 — PHIÊN 10

> Module 5 hoàn thiện: **Xuất PDF phiếu lương** (1 phiếu/NV, khổ A5 dọc) +
> **Cron TNVK + cảnh báo nâng bậc** chạy đầu mỗi tháng. Tiền đề: v0.6.0
> đã deploy + smoke test OK (Excel + CSV + pg_cron dọn log).

---

## A. Tóm tắt thay đổi phiên 10

**Mới**

- `src/lib/pdf.ts` — helper `exportPayslipToPdf({ element, cccd, monthYear, hoTen })`.
  Dùng `html2canvas` chụp DOM phiếu → `jsPDF` khổ A5 dọc (148×210mm, margin
  8mm). Hỗ trợ phiếu dài hơn 1 trang: tự cắt canvas thành nhiều slice và
  trải lên nhiều page. Tiếng Việt hiển thị chuẩn xác vì PDF embed raster
  image render từ font hệ thống của browser.
- `supabase/migrations/008_tnvk_promotion_cron.sql` — gồm 3 functions +
  1 cron job:
  - `recalc_tnvk_for_top_grade()` — tính lại `tnvk_percent` cho NV ở bậc
    cuối theo RULE-03. Chỉ UPDATE khi giá trị khác (tránh spam audit log).
  - `check_upcoming_promotions(p_days_ahead INTEGER)` — list NV (không ở
    bậc cuối) có ngày nâng bậc rơi trong khoảng [hôm nay; hôm nay + N
    ngày]. Mặc định N = 30 (RULE-02).
  - `run_monthly_tnvk_promotion_job()` — wrapper được pg_cron gọi. Chạy 2
    hàm trên, ghi tổng kết vào `activity_logs` với `action =
    'system.tnvk_promotion_job'`. Trả về string mô tả ngắn cho `cron.job_run_details`.
  - pg_cron job `v75_monthly_tnvk_promotion` — `30 0 1 * *` (00:30 UTC
    ngày 1 hàng tháng ≈ 07:30 VN ngày 1).
- `008_tnvk_promotion_cron_to_paste.sql` — copy ở root để paste vào SQL
  Editor như các phiên trước.
- `deploy_v070.ps1` — script PowerShell deploy (BOM UTF-8 + `$PSScriptRoot`).

**Sửa**

- `src/pages/PayslipPage.tsx` — thêm nút **Xuất PDF** (icon `FileDown`)
  bên trái nút "In phiếu" hiện có. State `exporting` để disable trong khi
  đang xuất. Bọc `<PayslipDetail>` trong `<div ref={printableRef}>` để
  html2canvas chộp đúng vùng cần.
- `src/components/Sidebar.tsx` — label `v0.6.0 – Excel + CSV + cron`
  → `v0.7.0 – PDF phiếu + cron TNVK`.
- `package.json` — bump `0.6.0 → 0.7.0` + thêm 2 deps:
  `"jspdf": "^2.5.2"`, `"html2canvas": "^1.4.1"`.

**Không đụng**

- AuthContext, supabase.ts, payroll.ts, các page khác.
- Migration 001-007 (đã apply ổn định).
- Helper `excel.ts` (Xuất Excel/CSV của phiên 9 vẫn hoạt động bình thường).

---

## B. Tiền đề (xác nhận từ phiên 9)

1. v0.6.0 đã deploy + Xuất Excel + Xuất CSV đều OK trên Netlify.
2. Migration 007 đã apply trên Supabase + job `v75_cleanup_activity_logs`
   đăng ký thành công (đã xác nhận).
3. `pg_cron` đang chạy bình thường → có sẵn hạ tầng cho migration 008.

---

## C. Deploy — 2 bước (npm install + deploy)

### Bước 1 — Cài jsPDF + html2canvas

```powershell
cd "D:\ClaudePro\V75-Hệ thống lương"
npm install --save 'jspdf@^2.5.2' 'html2canvas@^1.4.1'
```

Verify:

```powershell
npm ls jspdf html2canvas
# → jspdf@2.5.2  + html2canvas@1.4.1
```

> Lưu ý: cả 2 package này host bình thường trên npm registry (không như
> `xlsx` ở phiên 9). Lệnh `npm install` không tham số cũng đủ — nhưng
> chỉ định version để khoá ổn định.

### Bước 2 — Build + deploy

```powershell
.\deploy_v070.ps1
```

Script chạy `tsc -b` → `vite build` → `netlify deploy --prod`. Tự skip
bước npm install nếu `node_modules/jspdf/package.json` và
`node_modules/html2canvas/package.json` đã tồn tại.

---

## D. Apply migration 008 (cron TNVK + cảnh báo nâng bậc)

Vào Supabase Dashboard → SQL Editor project `qvcqkciobetttltlqqjq`,
paste nội dung `008_tnvk_promotion_cron_to_paste.sql` ở root project
rồi **Run**.

Verify (paste tiếp đoạn dưới vào SQL Editor):

```sql
-- 1) Job đã đăng ký?
SELECT jobid, jobname, schedule, command, active
  FROM cron.job
 WHERE jobname = 'v75_monthly_tnvk_promotion';
-- Kỳ vọng: 1 dòng, schedule = '30 0 1 * *', active = true.

-- 2) Chạy thủ công ngay (không đợi ngày 1 tháng sau):
SELECT public.run_monthly_tnvk_promotion_job();
-- Kỳ vọng: trả về 1 dòng string 'OK: X TNVK updated, Y upcoming promotions in 30d'.

-- 3) Log tổng kết vừa ghi:
SELECT created_at, description, new_value->>'tnvk_updated' AS tnvk_updated,
       new_value->>'promotions_upcoming_30d' AS promo_count
  FROM public.activity_logs
 WHERE action = 'system.tnvk_promotion_job'
 ORDER BY created_at DESC LIMIT 5;

-- 4) List NV sắp đến hạn nâng bậc trong 60 ngày (debug):
SELECT * FROM public.check_upcoming_promotions(60);

-- 5) Lịch sử cron run (rỗng nếu chưa tới giờ 30 0 1 * *):
SELECT jobid, runid, status, return_message, start_time, end_time
  FROM cron.job_run_details
 WHERE jobid IN (SELECT jobid FROM cron.job
                  WHERE jobname = 'v75_monthly_tnvk_promotion')
 ORDER BY start_time DESC LIMIT 5;
```

> Nếu Supabase báo `extension "pg_cron" is not available` → bật ở Project
> Settings → Database → Extensions → `pg_cron` (giống phiên 9), rồi re-run.

---

## E. Smoke test sau deploy

### E1. Xuất PDF phiếu lương

1. Login `001199000005` (user thường, đã có hồ sơ + bảng lương).
2. Vào **Phiếu lương của tôi** → chọn 1 tháng đã có data (status = approved
   hoặc draft đều xuất được).
3. Bấm **Xuất PDF**.
4. Trình duyệt tải file `PhieuLuong_<CCCD>_<YYYY-MM>_<stamp>.pdf` (~150-300KB).
5. Mở file:
   - Khổ A5 dọc.
   - Toàn bộ 6 thẻ thông tin hiển thị (Thông tin bản ghi, Thông số áp
     dụng, Thu nhập chịu thuế, Thu nhập không chịu thuế, Khấu trừ, Thực
     lĩnh) — đúng layout grid 2 cột như trên màn hình.
   - Tiếng Việt có dấu hiển thị chuẩn (vì là raster image render từ
     browser font).
   - Nếu phiếu dài hơn 1 trang → tự sang trang 2 không cắt thẻ.
6. Test thêm role admin_luong (`001199000002`) → cũng truy cập được trang
   `/payslip` (nếu user này đã được liên kết với 1 employee_id).

### E2. Cron TNVK chạy thủ công

1. Trong Supabase SQL Editor, chạy `SELECT
   public.run_monthly_tnvk_promotion_job();`
2. Login `001199000001` (admin_he_thong) → /logs.
3. Filter "Loại hành động" = `Khác` (hoặc không filter) → tìm dòng có
   `action = 'system.tnvk_promotion_job'`.
4. Click vào dòng đó để xem `new_value` JSON:

   ```json
   {
     "tnvk_updated": 0,
     "promotions_upcoming_30d": 0,
     "tnvk_changes": [],
     "promotions": [],
     "run_date": "2026-05-18"
   }
   ```

   Số lượng phụ thuộc dữ liệu employees trong DB. Nếu seed chưa có NV ở
   bậc cuối hoặc gần đến hạn nâng bậc thì cả 2 con số = 0 — vẫn là **PASS**
   vì hàm chạy không lỗi.

### E3. RLS vẫn chặn

- User thường (`001199000005`) **KHÔNG** thấy menu /logs → không thấy
  được log system. ✓
- Nút **Xuất PDF** chỉ hiện khi đã chọn 1 tháng có data (disabled khi
  `current = null`). ✓

### E4. Cron tự động chạy đúng giờ

- Job đăng ký schedule `30 0 1 * *`. Lần chạy tiếp theo: 00:30 UTC ngày
  01 tháng sau (~07:30 VN). Có thể chờ đến hôm đó hoặc test thủ công như E2.

---

## F. Trouble shooting

| Symptom | Nguyên nhân | Cách xử |
|---|---|---|
| `npm install jspdf html2canvas` báo `EACCES` hoặc `EPERM` | Đang chạy bằng admin / có folder lock | Tắt mọi cửa sổ VS Code / Vite dev server → re-run |
| Bấm "Xuất PDF" → trắng / không phản hồi | `current = null` → button đã disabled. Hoặc PayslipDetail chưa render kịp | Đợi load xong rồi bấm. Mở DevTools → Console xem có lỗi html2canvas không |
| PDF tải về bị mất chữ tiếng Việt (toàn dấu ?) | html2canvas chưa wait font load | Reload trang, đợi 1-2s cho font Tailwind/system load xong rồi bấm Xuất PDF |
| PDF chỉ có nửa thẻ trên, mất nửa dưới | `printableRef` không bao đủ. Kiểm tra `<div ref={printableRef}>` bao toàn bộ `<PayslipDetail>` | Xem file `src/pages/PayslipPage.tsx` mục `printableRef` |
| Apply 008 báo `permission denied for schema cron` | Supabase đôi khi cần `GRANT USAGE` cho `postgres` | Thử lại bằng owner role: vào Project Settings → SQL Editor → `Run as owner` |
| `run_monthly_tnvk_promotion_job()` báo `permission denied for table activity_logs` | RLS chặn INSERT. Function SECURITY DEFINER chạy bằng owner → owner thiếu BYPASSRLS | Hiếm gặp trên Supabase free tier. Nếu xảy ra: thêm `ALTER TABLE public.activity_logs DISABLE ROW LEVEL SECURITY;` (KHÔNG khuyên) hoặc tạo policy riêng cho INSERT system action |
| Cron đăng ký nhưng `cron.job_run_details` không thấy chạy lúc 00:30 UTC ngày 1 | Bình thường, đợi 1 tháng. Hoặc kiểm tra `active = true` | `UPDATE cron.job SET active = true WHERE jobname = 'v75_monthly_tnvk_promotion';` |

---

## G. Việc kế tiếp (phiên 11+)

Còn lại trong roadmap:

1. **Edge Function reset password** (admin_he_thong gọi từ UsersPage để
   reset user về `8888V75` mà không cần seed-users.mjs).
2. **Edge Function lockout server-side** — đếm `failed_attempts` chuẩn xác
   không bị bypass bằng F5.
3. **GitHub remote + Netlify auto-build** — bỏ deploy thủ công.
4. **UI quản lý nâng bậc** — trang riêng cho admin_luong xem danh sách
   NV đến hạn (gọi `check_upcoming_promotions(p_days_ahead)`) + bấm
   "Nâng bậc" sẽ update `bac += 1` + `ngay_huong_bac = today`.
5. **Tự gửi email cảnh báo** khi cron tìm thấy promotions sắp đến hạn.

---

## H. Câu hỏi mở phiên 10

1. PDF dạng raster image (~200KB) có chấp nhận được không, hay cần text-PDF
   để search được trong file? Nếu cần text-PDF, phải embed Unicode font
   (Roboto/Times) → bundle tăng ~300KB.
2. Cron chạy `30 0 1 * *` (07:30 VN ngày 1) — có phù hợp giờ admin online
   không? Có cần đổi sang ngày làm việc gần nhất (skip Chủ nhật)?
3. Cảnh báo nâng bậc 30 ngày trước có đủ không? Có cần thêm mốc 7 ngày
   + 1 ngày để admin không bỏ sót?
4. Log `system.tnvk_promotion_job` ghi luôn `new_value.tnvk_changes`
   (chi tiết từng NV) — có vi phạm quyền riêng tư không? Bảng activity_logs
   chỉ admin_he_thong đọc được nên không sao, nhưng cần xác nhận.
5. Function `recalc_tnvk_for_top_grade()` UPDATE employees → trigger
   audit `trg_audit_employees` sẽ ghi thêm 1 log/NV cho mỗi lần thay
   đổi. Có cần tắt audit cho lần update này không? Hiện tại để mặc định
   (audit ghi đầy đủ — admin trace được).
