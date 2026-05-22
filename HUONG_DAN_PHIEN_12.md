# HƯỚNG DẪN PHIÊN 12 — GitHub Remote + Netlify Auto-Deploy

> **Mục tiêu**: Code V75 lên GitHub → Netlify tự deploy mỗi khi `git push`.
> Từ phiên này trở đi: thêm tính năng → commit → push → Netlify tự build, không cần chạy script thủ công.

---

## A. Tóm tắt thay đổi đã sẵn sàng

Từ phiên 11, toàn bộ code v0.8.0 đã trong folder. Chưa commit lên git.
Script `setup_github_phien12.ps1` (bên dưới) sẽ:
1. Xóa git index.lock nếu có
2. Stage + commit toàn bộ thay đổi v0.4.0–v0.8.0
3. Đổi branch `master` → `main`
4. Nhắc anh tạo GitHub repo rồi push

---

## B. Chạy script một lần

```powershell
cd "D:\ClaudePro\V75-Hệ thống lương"
.\setup_github_phien12.ps1
```

Script tự xử lý git commit. Sau khi xong, tiếp theo là bước C.

---

## C. Tạo GitHub repo (làm 1 lần)

### C1. Tạo repo trên GitHub

1. Mở https://github.com/new
2. Điền:
   - **Repository name**: `v75-he-thong-luong` (hoặc tùy anh)
   - **Visibility**: **Private** (bắt buộc — code chứa logic nghiệp vụ nội bộ)
   - **KHÔNG** check "Add a README file" (repo đã có sẵn README)
3. Bấm **Create repository**
4. GitHub hiện trang mới với URL dạng: `https://github.com/TEN_USER/v75-he-thong-luong`

### C2. Push code lên GitHub

Mở PowerShell trong folder dự án:

```powershell
cd "D:\ClaudePro\V75-Hệ thống lương"

# Thay YOUR_USERNAME bằng tên GitHub của anh
git remote add origin https://github.com/YOUR_USERNAME/v75-he-thong-luong.git

git push -u origin main
```

> **Lần đầu push**: Windows sẽ hiện popup đăng nhập GitHub → chọn
> "Sign in with your browser" → authorize.
> Sau đó Git Credential Manager lưu token, các lần push sau không cần đăng nhập lại.

Verify thành công:
```powershell
git remote -v
# origin  https://github.com/YOUR_USERNAME/v75-he-thong-luong.git (fetch)
# origin  https://github.com/YOUR_USERNAME/v75-he-thong-luong.git (push)
```

---

## D. Kết nối Netlify với GitHub (làm 1 lần)

> Netlify hiện đang deploy thủ công qua `netlify deploy --prod`.
> Bước này chuyển sang **auto-deploy**: mỗi `git push main` → Netlify tự build và publish.

### D1. Vào Netlify Dashboard

1. Mở https://app.netlify.com → chọn site **luminous-marigold-a337b6**
2. Vào **Site configuration** → **Build & deploy** → **Continuous deployment**
3. Bấm **Connect to Git**

### D2. Chọn GitHub

1. Chọn **GitHub** → authorize Netlify app (nếu chưa authorize)
2. Chọn repo `v75-he-thong-luong` vừa tạo
3. Netlify tự detect `netlify.toml` → điền sẵn:
   - **Branch to deploy**: `main`
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
4. Bấm **Deploy site**

### D3. Cài Environment Variables trên Netlify

> Quan trọng: file `.env` KHÔNG lên GitHub (đã gitignore).
> Phải set biến môi trường trực tiếp trên Netlify.

1. **Site configuration** → **Environment variables** → **Add a variable**
2. Thêm 2 biến:

| Key | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://qvcqkciobetttltlqqjq.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | *(lấy ở Supabase Dashboard → Project Settings → API → anon key)* |

3. Sau khi thêm xong → **Trigger deploy** → chờ build xong (khoảng 1–2 phút)

### D4. Verify

- Mở https://luminous-marigold-a337b6.netlify.app
- Đăng nhập → sidebar hiện `v0.8.0 – Nâng bậc + Reset PW + Lockout`
- Trang `/promotions` mở được, nút Reset PW trong `/users` hiện ra

---

## E. Quy trình làm việc mới (từ phiên 12+)

```
Sửa code → npm run build (test local) → git add . → git commit -m "..." → git push
                                                                    ↓
                                              Netlify tự build + deploy (1-2 phút)
```

**Không cần** chạy `netlify deploy --prod` hay `.\deploy_v0xx.ps1` nữa.

Script `.\deploy_v0xx.ps1` cũ vẫn giữ để rollback thủ công nếu cần.

---

## F. Smoke test quy trình mới

Sau khi kết nối Netlify + GitHub thành công:

1. Mở `src/components/Sidebar.tsx`
2. Thêm dấu space vào cuối dòng comment bất kỳ (thay đổi nhỏ, không ảnh hưởng chức năng)
3. Chạy:
   ```powershell
   git add src/components/Sidebar.tsx
   git commit -m "test: verify Netlify auto-deploy on push"
   git push
   ```
4. Mở https://app.netlify.com → site → tab **Deploys** → thấy build mới đang chạy
5. Sau ~1 phút → build **Published** → F5 app → vẫn hoạt động bình thường

---

## G. Troubleshooting

| Symptom | Nguyên nhân | Cách xử |
|---|---|---|
| `git push` báo `rejected — non-fast-forward` | Repo GitHub có commit khác (nếu chọn thêm README khi tạo) | `git pull origin main --rebase` rồi push lại |
| Netlify build fail: `Cannot find module 'xlsx'` | `npm install` chưa chạy sau khi pull | Thêm `npm ci` trước build: trong `netlify.toml` đổi `command = "npm ci && npm run build"` |
| Netlify build fail: `VITE_SUPABASE_URL not defined` | Chưa set env var trên Netlify | Xem bước D3 |
| Push lần đầu hỏi username/password | Git Credential Manager chưa cache | Dùng Personal Access Token hoặc GitHub CLI |
| `error: src refspec main does not match any` | Branch vẫn là `master` | `git branch -m master main` rồi push lại |

---

## H. Việc kế tiếp sau phiên 12

1. **UI tạo user mới từ /users** — Edge Function `admin-create-user` (bỏ seed-users.mjs)
2. **Module 6 báo cáo** — tổng hợp theo phòng ban / tháng / năm + biểu đồ
3. **Email cảnh báo** — khi cron tháng tìm thấy NV sắp đến hạn nâng bậc (Resend/SendGrid)
4. **Audit log reset password** — thêm INSERT activity_logs action='admin.password_reset'
