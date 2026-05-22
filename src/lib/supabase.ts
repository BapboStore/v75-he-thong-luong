import { createClient } from '@supabase/supabase-js'

const url      = import.meta.env.VITE_SUPABASE_URL
const anonKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[V75] Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY. ' +
    'Tạo file .env theo mẫu .env.example và khởi động lại dev server.',
  )
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  global: {
    // Network-level timeout 20 giây cho MỌI fetch tới Supabase. Nếu Supabase
    // không trả lời (paused, network drop, refresh token loop…) → AbortError
    // được throw thay vì hang vô hạn. Caller sẽ catch và hiển thị lỗi.
    fetch: (input, init) => {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 20_000)
      return fetch(input as RequestInfo, { ...init, signal: ctrl.signal })
        .finally(() => clearTimeout(t))
    },
  },
})

// =============================================================
// Helper: bọc timeout chống treo cho 1 promise bất kỳ.
// Dùng cho các nghiệp vụ CRUD ngắn (insert/update). Nếu vượt
// quá `ms` → reject với Error có message rõ ràng để UI hiển thị.
// =============================================================
export function withTimeout<T>(p: PromiseLike<T>, ms = 15_000, label = 'Supabase'): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} không phản hồi sau ${ms}ms — vui lòng thử lại.`)), ms),
    ),
  ])
}

// =============================================================
// Auto cleanup khi GoTrue phát hiện refresh token hỏng.
// supabase-js v2 sẽ phát SIGNED_OUT khi auto-refresh fail.
// Listener này đảm bảo localStorage sạch để lần load sau không
// rơi vào trạng thái session zombie.
// =============================================================
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    try {
      // Xoá mọi key sb-* còn sót (phòng case GoTrue không tự xoá)
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('sb-')) localStorage.removeItem(k)
      }
    } catch { /* ignore */ }
  }
})
