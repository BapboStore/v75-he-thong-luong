/**
 * V75 — `logActivity` (DEPRECATED kể từ v0.4.0)
 *
 * Activity logs đã được chuyển hoàn toàn sang Postgres trigger
 * `trg_audit_<table>` (migration 005). Trigger chạy SECURITY DEFINER
 * với `auth.uid()` của caller → audit không bao giờ mất, không chiếm
 * HTTP connection pool của client.
 *
 * File này được giữ ở dạng STUB no-op để:
 *  - Tránh phá build nếu còn import sót `import { logActivity } from '@/lib/log'`.
 *  - Cho phép phục hồi nhanh (chỉ cần khôi phục bản v0.3.3 từ git history)
 *    nếu phát hiện trigger có vấn đề ở production.
 *
 * KHÔNG THÊM CODE MỚI VÀO ĐÂY. Mọi audit hãy thêm trigger ở
 * `supabase/migrations/`.
 */

interface LogParams {
  action: string
  entity_type?: string
  entity_id?: string | null
  old_value?: unknown
  new_value?: unknown
  description?: string
}

/**
 * @deprecated v0.4.0 — audit đã do Postgres trigger ghi tự động.
 * Hàm này hiện chỉ là no-op để không phá build nếu còn import sót.
 */
export async function logActivity(_params: LogParams): Promise<void> {
  // No-op: trigger `trg_audit_<table>` đảm nhiệm.
  return
}
