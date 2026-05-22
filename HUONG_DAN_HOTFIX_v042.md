# V75 — Hotfix v0.4.2 (loadProfile song song)

> Sau khi anh chạy `rollback_audit_test.sql` (DROP audit_row CASCADE) và F5
> vẫn mất 13-15s + profile không load → **trigger 005/006 KHÔNG phải nguyên nhân chính**.
> Root cause thực sự: `loadProfile()` chạy 3 SELECT tuần tự trên Supabase free tier
> cold start (mỗi SELECT 4-5s → tổng 12-15s).

---

## Code đã sửa (Claude làm)

### 1. `src/contexts/AuthContext.tsx`

**Trước (tuần tự, ~3× thời gian):**
```ts
const user = await select users WHERE id = userId       // 5s
const employee = await select employees WHERE id = ...  // 5s
const department = await select departments WHERE id = .// 5s
// TỔNG: 15s
```

**Sau v0.4.2 (song song, ~2× thời gian):**
```ts
const user = await select users WHERE id = userId       // 5s
const [employee, department] = await Promise.all([
  select employees ...,                                 // 5s
  select departments ...,                               // 5s đồng thời
])
// TỔNG: 5 + max(5, 5) = 10s
```

### 2. Skip `INITIAL_SESSION` event

`supabase-js` phát `INITIAL_SESSION` khi mount/F5. Main `useEffect` đã load profile rồi → bỏ qua trong `onAuthStateChange` để tránh **2 lần `loadProfile` đồng thời** (mỗi lần 3 SELECT → 6 SELECT cùng lúc → có thể quá tải connection pool).

### 3. Hard timeout 8s → 12s

Vì cold start có thể mất 8-10s ngay cả sau parallel, tăng hard timeout lên 12s để không setLoading(false) sớm trong khi profile chưa kịp load.

### 4. Bỏ inner timeout 6s cho loadProfile

Trước đây có `Promise.race(loadProfile, timeout 6s)` để force exit. Giờ bỏ vì hard timeout 12s ở ngoài đã đủ. Tránh flicker `—` → tên thật sau 1 giây.

### 5. `src/pages/DashboardPage.tsx`

Khi profile null, KHÔNG trả về null nữa. Hiển thị fallback UI "Đang tải hồ sơ…" + nút "Tải lại hồ sơ".

---

## Việc anh làm

### Bước 1 — Re-apply migration 005 + 006 (vì rollback đã DROP toàn bộ)

1. Mở https://supabase.com/dashboard/project/qvcqkciobetttltlqqjq/sql/new
2. Paste `005_audit_triggers_to_paste.sql` → Run.
3. Paste `006_audit_optimize_to_paste.sql` → Run.

Verify:
```sql
SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'trg_audit_%';
-- Kỳ vọng 27 dòng (9 bảng × 3 trigger ins/upd/del)
```

### Bước 2 — Deploy v0.4.2

```powershell
cd "D:\ClaudePro\V75-Hệ thống lương"
.\deploy_v042.ps1
```

### Bước 3 — Test + đo thời gian

1. Tab Ẩn danh → Ctrl+Shift+R.
2. Login admin_he_thong (`001199000001`).
3. **Đo thời gian từ lúc submit login → sidebar đầy đủ 9 menu**:
   - Lần đầu (cold start): kỳ vọng < 10s.
   - Lần F5 thứ 2 (warm): kỳ vọng < 3s.
4. Nếu lần 2 vẫn > 5s → **mở DevTools → Network tab → F5 → screenshot** request nào chậm nhất. Em sẽ tiếp tục debug.

---

## Câu hỏi cho anh sau khi deploy

1. Lần F5 ĐẦU TIÊN sau khi deploy (cold start): mất bao nhiêu giây để vào trang đầy đủ?
2. Lần F5 THỨ HAI ngay sau đó (warm): mất bao nhiêu giây?
3. Trong Supabase Dashboard → Settings → Compute Plan: project có ở trạng thái "Active" không, hay "Paused"?

Nếu chênh lệch lần 1 và lần 2 lớn (vd. 15s vs 2s) → **Supabase free tier cold start** là thủ phạm. Em có thể đề xuất:
- Upgrade lên Pro tier ($25/tháng) để không bị pause.
- Hoặc cron giả gọi 1 query mỗi 5 phút (keep-alive) để giữ project warm.

Nếu cả 2 lần đều > 5s → vấn đề khác (RLS chậm, network, etc.), em cần Network screenshot để debug sâu.
