# V75 – Hệ thống Quản lý Tiền lương

Modules đã triển khai:
- **Module 1**: Thiết kế DB · Supabase · Netlify · Đăng nhập & Phân quyền
- **Module 2**: CRUD phòng ban / nhân viên / cấu hình lương (versioned) / quản lý user
- **Module 3**: Chấm công 4 khối · workflow draft → pending → locked · kiểm tra chéo lái xe
- **Module 4**: Tính bảng lương (RULE-04/05) · snapshot `salary_records` · workflow draft → pending → approved → cancelled · phiếu lương cá nhân `/payslip`

Stack: **Vite + React 18 + TypeScript · TailwindCSS + shadcn/ui · Supabase (Postgres + RLS) · Netlify**.

---

## 1. Cấu trúc thư mục

```
V75-Hệ thống lương/
├── .github/workflows/ci.yml      # CI: typecheck + lint + build
├── netlify.toml                  # SPA fallback + headers bảo mật
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── index.html
├── public/favicon.svg
├── src/
│   ├── main.tsx · App.tsx · index.css
│   ├── lib/        # supabase client, api.ts (CRUD), log.ts, utils, types
│   ├── contexts/   # AuthContext (login/logout/role/changePassword)
│   ├── components/ # ui/ (button/input/select/dialog/table/...), Layout, Sidebar, Header
│   └── pages/      # Login, ChangePassword, Dashboard, Unauthorized,
│                   #   Departments, Employees, Config, Users, Attendance
└── supabase/
    ├── migrations/
    │   ├── 001_initial_schema.sql            # 11 bảng, enum, trigger updated_at
    │   ├── 002_rls_policies.sql              # Helper functions + RLS cho 4 role
    │   ├── 003_seed_data.sql                 # 8 phòng ban, salary_grades, salary_config
    │   └── 004_salary_records_constraints.sql # Trigger bảo vệ snapshot đã duyệt + view tổng hợp
    └── scripts/seed-users.mjs                # Tạo demo users qua Admin API
```

---

## 2. Yêu cầu

- Node.js >= 18.18 (khuyến nghị 20)
- Tài khoản Supabase (free tier đủ dùng giai đoạn dev)
- Tài khoản Netlify (deploy SPA)

---

## 3. Khởi tạo Supabase

1. Vào https://supabase.com → New project (tên gợi ý: `v75-luong`).
2. Sau khi project sẵn sàng, vào **SQL Editor** và chạy lần lượt:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rls_policies.sql`
   - `supabase/migrations/003_seed_data.sql`
   - `supabase/migrations/004_salary_records_constraints.sql`
3. Lấy **Project URL** và **anon key** trong **Project Settings → API**.

### Tạo demo users (8 tài khoản đủ 4 role)

```bash
cp .env.example .env
# Điền: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (KHÔNG commit)
npm install
npm run seed:users
```

Mật khẩu mặc định cho tất cả tài khoản demo: `8888V75` (lần đầu đăng nhập sẽ bị buộc đổi).

| CCCD | Họ tên | Role | Phòng |
|------|--------|------|-------|
| 001199000001 | Quản trị Hệ thống | admin_he_thong | TCHC_VP |
| 001199000002 | Quản trị Lương | admin_luong | KTTC |
| 001199000003 | Trưởng phòng KTTC | truong_phong | KTTC |
| 001199000004 | Trưởng phòng KHKD | truong_phong | KHKD |
| 001199000005 | Nhân viên A | user | KTTC |
| 001199000006 | Nhân viên B | user | KHKD |
| 001199000007 | Lái xe Nghĩa Đô | user | DX_NGHIADO |
| 001199000008 | Bảo vệ TCHC | user | TCHC_BV |

---

## 4. Chạy local

```bash
npm install
npm run dev    # http://localhost:5173
```

Đảm bảo `.env` có `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`.

Lệnh khác:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm run build       # Vite production build
npm run preview     # phục vụ thử bản dist
```

---

## 5. Deploy Netlify

### Cách A – Netlify UI (khuyến nghị lần đầu)

1. Push repo lên GitHub.
2. Netlify → **Add new site → Import an existing project** → chọn repo.
3. Netlify tự đọc `netlify.toml` (đã thiết lập `command=npm run build`, `publish=dist`).
4. Vào **Site settings → Environment variables** thêm:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

### Cách B – Netlify CLI

```bash
npm i -g netlify-cli
netlify login
netlify init
netlify env:set VITE_SUPABASE_URL "https://xxx.supabase.co"
netlify env:set VITE_SUPABASE_ANON_KEY "eyJ..."
netlify deploy --build --prod
```

> **Tuyệt đối không** đặt `SUPABASE_SERVICE_ROLE_KEY` trên Netlify (chỉ dùng local cho seed).

---

## 6. Phân quyền (RULE-01)

Phân quyền được áp **tại DB qua RLS** (xem `002_rls_policies.sql`) — frontend chỉ ẩn/hiện UI.

| Role | Quyền chính |
|------|-------------|
| `user` | Xem hồ sơ + bảng lương cá nhân |
| `truong_phong` | Nhập/sửa bảng công phòng mình; xem bảng lương cả phòng |
| `admin_luong` | Nhập/sửa công & lương mọi phòng; duyệt bảng công, bảng lương |
| `admin_he_thong` | Toàn quyền: CRUD user/phòng ban/cấu hình; xem activity_logs |

**Đăng nhập**: ID là **CCCD (9–12 số)**. Frontend ánh xạ `cccd → cccd@v75.local` để dùng Supabase Auth (email-based).

**Khoá tạm thời**: 5 lần sai → khoá 5 phút (hiện đếm phía client trong `localStorage`; module sau sẽ thay bằng Edge Function để cứng hoá phía server).

**Đổi mật khẩu lần đầu**: cờ `users.must_change_password = true` → `<ProtectedRoute>` ép redirect tới `/change-password`.

---

## 7. CI/CD

`.github/workflows/ci.yml` chạy mỗi PR/push: `typecheck → lint (warn) → build`. Netlify build độc lập trên hạ tầng của Netlify khi merge `main`.

---

## 8. Module tiếp theo

- **Module 5:** Xuất PDF/Excel + cron TNVK & nâng bậc (RULE-03/02).
- **Module phụ trợ:** UI cho `/logs` (admin_he_thong xem activity_logs), Edge Function khoá đăng nhập phía server, reset mật khẩu cho admin.

---

## 9. Module 4 — Bảng lương (chi tiết)

### Files mới
- `src/lib/payroll.ts` — pure-TS calculator (RULE-04 + RULE-05) gồm `computePayroll()`, `thueTNCN()`, `normalizeAttendance()`. Không chạm DB.
- `src/pages/SalaryPage.tsx` — `/salary` cho `truong_phong` (xem) / `admin_luong` & `admin_he_thong` (tính, lưu, duyệt, huỷ).
- `src/pages/PayslipPage.tsx` — `/payslip` (read-only cho mọi role; lọc theo employee_id của session, RLS đã giới hạn).
- `supabase/migrations/004_salary_records_constraints.sql` — trigger `protect_approved_salary_records` chặn sửa snapshot đã duyệt (chỉ cho phép chuyển sang `cancelled`); view `v_salary_summary`.
- `src/lib/api.ts` thêm: `listSalaryRecords`, `listMySalaryRecords`, `getSalaryRecord`, `upsertSalaryRecords`, `setSalaryRecordsStatus`.
- `src/lib/types.ts` thêm: `SalaryRecord`, `SalaryRecordStatus`, `SR_STATUS_LABEL`.

### Công thức (tóm tắt — chi tiết xem comment trong `payroll.ts`)
- **LCB tháng** = LCS × hệ số bậc; **LCB ngày** = LCB tháng / `so_ngay_cong_chuan`.
- **PCCV / PCTN** = LCS × hệ số tương ứng. **TNVK (tiền)** = (LCB tháng + PCCV + PCTN) × `tnvk_percent` %.
- **Lương theo công** (chịu thuế) — hệ số chuẩn lao động VN: T7/CN ×2, ngoài giờ ×1.5, lễ Tết đi làm ×3, lễ Tết hưởng phép ×1.
- **Lái xe (RULE-05)**: cộng các đầu công × hệ số nội bộ (S600 ×1.0, xe 4-7 ×0.8, xe 16-29 ×1.2, công mía ×1.4, công chờ ×0.5, …) + KM × `don_gia_km_lai_xe`.
- **Bảo hiểm**: cơ sở trích = LCB tháng + PCCV + PCTN; trích NLĐ = `co_so_trich × ty_le_bh_nld`%; CĐP = `co_so_trich × ty_le_cong_doan_phi`%.
- **Thuế TNCN**: lũy tiến từng phần (TT 111/2013/TT-BTC).
- **Thực lĩnh** = Tổng chịu thuế + Tổng KCT − Trích NLĐ − CĐP − Thuế TNCN + Truy lĩnh − Truy thu.

### Workflow `salary_records`
`draft` → `pending` (gửi duyệt) → `approved` (admin_luong duyệt) → `cancelled` (huỷ duyệt, kèm lý do).
Sau khi `approved`, trigger DB chặn mọi sửa cột tính toán; chỉ chuyển sang `cancelled` được.

---

*V75 – README v0.3*
