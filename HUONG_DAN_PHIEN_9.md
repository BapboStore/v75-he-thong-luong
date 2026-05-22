# HƯỚNG DẪN DEPLOY V0.6.0 — PHIÊN 9

> Module 5 mở rộng: Xuất Excel bảng lương + Xuất CSV nhật ký + pg_cron tự dọn
> activity_logs > 6 tháng. Tiền đề: v0.5.0 đã deploy + smoke test OK.

---

## A. Tóm tắt thay đổi phiên 9

**Mới**

- `src/lib/excel.ts` — helper xuất file:
  - `exportSalaryToExcel({ records, department, monthYear })` → `.xlsx` có
    metadata header + bảng chi tiết + dòng TỔNG CỘNG. Dùng SheetJS Community
    (cài qua tarball CDN của SheetJS, **không phải** `xlsx` trên npm).
  - `exportLogsToCsv({ rows, suffix })` → `.csv` UTF-8 BOM + escape RFC 4180.
- `supabase/migrations/007_log_cleanup_cron.sql` — pg_cron job
  `v75_cleanup_activity_logs` chạy `15 3 * * *` xoá log > 6 tháng. Idempotent
  (DROP-job-cũ-nếu-có trước khi `cron.schedule`).

**Sửa**

- `src/pages/SalaryPage.tsx` — thêm nút **Xuất Excel** (icon Download) cạnh
  "Tải lại". Disabled khi `records.length === 0`.
- `src/pages/LogsPage.tsx` — thêm nút **Xuất CSV** trong cụm pagination.
  Trần `CSV_MAX_ROWS = 5000`. Nếu filter trả > 5000 dòng, cảnh báo cho user.
- `src/components/Sidebar.tsx` — label `v0.5.0 – Module 5: Nhật ký`
  → `v0.6.0 – Excel + CSV + cron`.
- `package.json` — bump `0.5.0 → 0.6.0` + thêm dependency:
  `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`.

**Không đụng**

- AuthContext, supabase.ts, payroll.ts, các page khác.
- Migration 001-006 (đã apply ổn định từ phiên 7).

---

## B. Tiền đề (xác nhận từ phiên 8)

1. v0.5.0 đã deploy + /logs hiển thị log thật từ trigger 005/006 — anh đã
   xác nhận.
2. Migration 005 + 006 đang chạy (audit triggers ghi log đầy đủ).
3. Bug performance F5 đã đóng từ v0.4.3 (cache AuthProfile).

---

## C. Deploy — 2 bước (npm install + deploy)

### Bước 1 — Cài SheetJS

```powershell
cd "D:\ClaudePro\V75-Hệ thống lương"
npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

> Lưu ý: package `xlsx` trên registry npm đã bị maintainers gỡ; phải cài
> trực tiếp tarball tại `cdn.sheetjs.com`. Lệnh `npm install` không tham
> số sẽ KHÔNG cài được vì đã ghi sẵn URL trong `package.json`, nhưng chạy
> thêm 1 lệnh có URL như trên giúp đảm bảo.

Verify: `npm ls xlsx` → in ra `xlsx@0.20.3`.

### Bước 2 — Build + deploy

```powershell
.\deploy_v060.ps1
```

Script chạy `tsc -b` → `vite build` → `netlify deploy --prod`. Nếu
typecheck/build fail sẽ dừng + in lỗi.

---

## D. Apply migration 007 (pg_cron)

Vào Supabase Dashboard → SQL Editor project `qvcqkciobetttltlqqjq`,
paste nội dung `007_log_cleanup_cron_to_paste.sql` ở root project rồi Run.

Verify (paste tiếp đoạn dưới vào SQL Editor):

```sql
-- 1) Job đã đăng ký?
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'v75_cleanup_activity_logs';
-- Kỳ vọng: 1 dòng, schedule = '15 3 * * *', active = true.

-- 2) Lịch sử run (rỗng nếu chưa tới giờ chạy):
SELECT jobid, runid, status, return_message, start_time, end_time
FROM cron.job_run_details
WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname = 'v75_cleanup_activity_logs')
ORDER BY start_time DESC LIMIT 5;
```

Nếu Supabase báo `extension "pg_cron" is not available`: vào Project Settings
→ Database → Extensions → bật `pg_cron`, sau đó re-run migration 007.

---

## E. Smoke test sau deploy

### E1. Xuất Excel bảng lương

1. Login `001199000002` (admin_luong).
2. Vào **Bảng lương** → chọn 1 phòng + 1 tháng đã có data (ví dụ KTTC tháng
   hiện tại). Nếu chưa có, bấm **Tính + Lưu nháp** trước.
3. Khi bảng đã hiện ≥ 1 dòng → bấm **Xuất Excel**.
4. Trình duyệt tải file `BangLuong_KTTC_2026-05_<stamp>.xlsx`.
5. Mở file:
   - Hàng 1-4: tiêu đề "BẢNG LƯƠNG THÁNG …", phòng ban, số NV, ngày xuất.
   - Hàng 6: header bảng (STT, Họ tên, CCCD, Chức vụ, Ngạch, Bậc, Hệ số bậc,
     TNVK %, Hệ số PCCV/PCTN, Lương cơ sở, LCB ngày, các khoản chịu thuế /
     KCT, BH NLĐ, CĐP, Thuế TNCN, Truy lĩnh/thu, Thực lĩnh, Số TK, Ngân
     hàng, Trạng thái).
   - Dòng cuối: **TỔNG CỘNG** với các cột số tổng dồn.
   - Cột tự co rộng theo nội dung.

### E2. Xuất CSV nhật ký

1. Login `001199000001` (admin_he_thong) → /logs.
2. Để filter = trống (lấy tất cả). Bấm **Xuất CSV**.
3. Trình duyệt tải `NhatKy_all_<stamp>.csv` (BOM UTF-8).
4. Mở bằng Excel → đọc đúng tiếng Việt (Họ tên, hành động).
5. Cột: Thời gian, CCCD, Hành động (VN), Bảng (entity), Loại dữ liệu (VN),
   Entity ID, IP, Giá trị cũ (JSON inline), Giá trị mới (JSON inline).
6. Bộ lọc: chọn Hành động = Xoá → ấn Lọc → Xuất CSV → file
   `NhatKy_delete_<stamp>.csv` chỉ chứa các dòng `delete.*`.
7. Nếu DB > 5000 log: thanh Alert sẽ hiện cảnh báo "Đã xuất 5000 log mới
   nhất...". Hãy thu hẹp filter (ví dụ chọn ngày) rồi xuất tiếp phần còn lại.

### E3. Verify pg_cron

Sau khi apply migration 007, kiểm tra job đã đăng ký (xem mục **D**). Job
chạy lúc 03:15 UTC (~10:15 VN). Có thể test ngay bằng cách chạy thủ công
câu DELETE trong SQL Editor (xem comment trong file migration).

### E4. RLS vẫn chặn

User thường (`001199000005`) không thấy menu /logs, không thấy nút Xuất CSV.
Xuất Excel ở SalaryPage chỉ hiển thị khi vào được trang (truong_phong xem
được, user thường bị ProtectedRoute redirect).

---

## F. Trouble shooting

| Symptom | Nguyên nhân | Cách xử |
|---|---|---|
| `npm install` báo `404 Not Found` cho `xlsx` | Đang cố lấy `xlsx` từ npm registry (đã bị gỡ) | Phải cài tarball SheetJS: `npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` |
| `tsc` báo `Cannot find module 'xlsx'` | Chưa chạy `npm install` sau khi sửa package.json | Chạy npm install như Bước 1 mục C. |
| Bấm Xuất Excel không phản ứng | Records rỗng → button đã disabled. Hoặc browser chặn pop-up download | Tính + Lưu nháp trước. Cho phép pop-up cho domain Netlify. |
| File CSV mở Excel hiện ô vuông tiếng Việt | Thiếu BOM | File đã có BOM UTF-8 sẵn. Nếu vẫn lỗi: trong Excel chọn Data → From Text/CSV → File origin = 65001 UTF-8. |
| Apply 007 báo `pg_cron is not available` | Extension chưa bật ở project | Project Settings → Database → Extensions → bật `pg_cron` → re-run 007. |
| `cron.job` không có dòng `v75_cleanup_activity_logs` | Migration 007 chưa apply hoặc chạy lỗi | Re-paste 007 vào SQL Editor, đọc kỹ output. |
| Job đăng ký nhưng `cron.job_run_details` không thấy chạy | Chưa tới giờ 03:15 UTC | Đợi qua đêm, hoặc test thủ công câu DELETE. |

---

## G. Việc kế tiếp (phiên 10+)

Còn lại trong Module 5:

1. **Xuất PDF phiếu lương** (jspdf + autoTable hoặc print CSS đơn giản
   ngay trên PayslipPage hiện có nút In).
2. **Edge Function reset password admin** từ UsersPage (cần Edge Function
   với service_role key).
3. **Cron TNVK + nâng bậc tự động** (Supabase pg_cron / Edge Function
   scheduled — đã có hạ tầng pg_cron sau migration 007).

Hạ tầng:

4. **GitHub remote + Netlify auto-build** (đỡ phải `netlify deploy` thủ
   công sau mỗi phiên).
5. **Edge Function lockout server-side** (hiện client-side dễ bypass).

---

## H. Câu hỏi mở phiên 9

1. Bảng Excel xuất có cần chia sheet riêng "Tổng kết theo phòng ban" hay
   chỉ 1 sheet chi tiết là đủ?
2. CSV nhật ký có cần thêm cột riêng tách `op` / `table` không (hiện đã có
   2 cột "Hành động" + "Bảng")?
3. Trần `CSV_MAX_ROWS = 5000` đã hợp lý chưa? Có cần tăng lên 50000?
4. pg_cron schedule 03:15 UTC (~10:15 VN) có lệch giờ tải nhất không? Đổi
   sang 17:00 UTC (~ 0:00 VN) chăng?
5. Lưu giữ 6 tháng có đủ cho audit nội bộ không? Có cần lưu lâu hơn
   (12 tháng) hoặc archive ra cold storage trước khi xoá?
