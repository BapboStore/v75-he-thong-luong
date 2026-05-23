# HƯỚNG DẪN DEPLOY V0.11.0 — PHIÊN 15

> **Tính năng mới**: Nâng bậc hàng loạt (PromotionsPage) + Báo cáo tổng hợp lương (/reports).

---

## A. Tóm tắt thay đổi phiên 15

**Sửa / Nâng cấp**
- `src/pages/PromotionsPage.tsx`:
  - Thêm cột checkbox vào bảng danh sách NV sắp đến hạn.
  - Checkbox "Chọn tất cả" ở header (indeterminate state khi chọn 1 phần).
  - Nút "Nâng bậc đã chọn (N)" xuất hiện khi có ≥1 NV được chọn.
  - Dialog xác nhận hàng loạt: bảng danh sách NV + bậc hiện tại → mới + cảnh báo.
  - Xử lý tuần tự `promoteEmployee()` cho từng NV, progress text từng bước.
  - Báo cáo tóm tắt sau khi xong: danh sách thành công + thất bại riêng.

**Mới**
- `src/pages/ReportsPage.tsx` (route `/reports`):
  - Filter: tháng/năm (24 tháng gần nhất) + trạng thái bản lương.
  - 4 KPI cards: Tổng NV, Tổng quỹ lương, Tổng thuế TNCN, Tổng thực lĩnh.
  - Biểu đồ cột recharts: Thực lĩnh + Thuế TNCN + BHXH NLĐ theo phòng ban (triệu đ).
  - Bảng tổng hợp theo phòng: 8 cột số tiền + dòng TỔNG CỘNG.
  - Nút Xuất Excel: 2 sheet — "Tổng hợp" (theo phòng) + "Chi tiết NV" (tất cả NV).
- `src/lib/api.ts` — thêm `fetchSalaryReport(month_year, status?)`.
- `src/lib/excel.ts` — thêm `exportSalaryReportToExcel()` + interface `DeptSummaryRow`.

**Version & UI**
- `package.json` — bump `0.10.0 → 0.11.0`.
- `src/components/Sidebar.tsx` — label `v0.11.0 – Báo cáo + Nâng bậc hàng loạt`.
- `src/App.tsx` — route `/reports` đổi từ Placeholder thành `<ReportsPage />`.

**Không đụng**
- Tất cả migration DB (001-008 đã apply ổn định) — **không có migration mới**.
- Tất cả Edge Function.
- Tất cả page khác.

---

## B. Deploy — 1 lệnh

```powershell
cd "D:\ClaudePro\V75-Hệ thống lương"
.\deploy_v0110.ps1
```

Script thực hiện 3 bước:
1. `npm run typecheck`
2. `npm run build`
3. `git add -A && git commit -m "feat: v0.11.0 – Báo cáo tổng hợp + Nâng bậc hàng loạt" && git push`
   → Netlify tự build và deploy trong 1-2 phút.

> **Lưu ý**: Phiên 15 không có migration mới và không có Edge Function mới.
> Chỉ cần build frontend + push git là xong.

---

## C. Smoke test

### C1. Version
1. Login → Sidebar hiển thị `v0.11.0 – Báo cáo + Nâng bậc hàng loạt`.

### C2. Nâng bậc hàng loạt
1. Login `001199000002` (admin_luong) → vào `/promotions`.
2. Đổi dropdown sang 180 ngày → tải lại → có nhiều dòng hơn.
3. Tích checkbox 2-3 NV → nút **Nâng bậc đã chọn (N)** xuất hiện.
4. Bấm → dialog mở, hiển thị bảng danh sách NV đã chọn + bậc hiện tại → mới.
5. Bấm **Xác nhận nâng bậc N NV** → thanh progress chạy từng NV → hoàn tất.
6. Alert xanh hiện tóm tắt kết quả.
7. Bảng reload → các NV vừa nâng bậc không còn trong danh sách (hoặc ngày còn lại thay đổi).

### C3. Checkbox "Chọn tất cả"
1. Bấm checkbox ở header → tất cả dòng tích.
2. Bấm lại → tất cả bỏ tích.
3. Tích 1 phần → checkbox header ở trạng thái indeterminate (nét gạch ngang).

### C4. Báo cáo tổng hợp — hiển thị
1. Login `001199000002` (admin_luong) → vào `/reports`.
2. Sidebar menu "Báo cáo / Xuất file" active.
3. Trang tải: 4 KPI cards + biểu đồ cột + bảng tổng hợp hiện đúng kỳ hiện tại.
4. Đổi **Kỳ lương** sang tháng có dữ liệu → tải lại → số liệu cập nhật.
5. Đổi **Trạng thái** = "Đã duyệt" → chỉ tính bản lương approved.

### C5. Báo cáo tổng hợp — xuất Excel
1. Bấm **Xuất Excel** → tải file `BaoCaoLuong_YYYY-MM_*.xlsx`.
2. Mở file → Sheet "Tổng hợp": có header metadata + bảng theo phòng + dòng TỔNG CỘNG.
3. Sheet "Chi tiết NV": danh sách tất cả NV có cột Phòng, CCCD, Họ tên, Thực lĩnh.

### C6. RLS — user thường không thấy menu /reports
1. Login `001199000005` (user) → Sidebar không có menu "Báo cáo / Xuất file".
2. Vào trực tiếp URL `/reports` → redirect unauthorized.

---

## D. Troubleshooting

| Symptom | Nguyên nhân | Cách xử |
|---|---|---|
| TS error khi build: `recharts` không tìm thấy type | Recharts đã có trong deps nhưng TS config cần cập nhật | Chạy `npm install` → thử lại build |
| Biểu đồ không hiển thị | Không có bản lương nào cho tháng chọn | Tạo dữ liệu test: vào `/salary` tạo draft cho 1 phòng |
| Nâng bậc 1 NV thất bại trong bulk | NV đã ở bậc cuối | Kết quả hiện "✗ Thất bại" kèm tên NV và lý do |
| Checkbox header không indeterminate | Thuộc tính `ref` với `el.indeterminate` — cần Chromium | Bình thường trên Chrome/Edge |

---

## E. Việc kế tiếp (phiên 16+)

1. **Email cảnh báo cron** — khi cron tháng phát hiện NV sắp đến hạn → gửi email (Resend/SendGrid).
2. **Escalated lockout** — lần khóa 1→5', lần 2→15', lần 3→1h.
3. **Audit log reset password** — Edge Function `admin-reset-password` thêm INSERT activity_logs.
4. **Báo cáo xu hướng** — biểu đồ đường theo nhiều tháng (so sánh quỹ lương tháng 1-12).
