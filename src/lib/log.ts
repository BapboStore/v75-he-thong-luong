import { supabase } from '@/lib/supabase'

interface LogParams {
  action: string
  entity_type?: string
  entity_id?: string | null
  old_value?: unknown
  new_value?: unknown
  description?: string
}

/**
 * Ghi log hoạt động vào activity_logs.
 * Bỏ qua nếu lỗi (không chặn flow chính).
 */
export async function logActivity(params: LogParams): Promise<void> {
  try {
    const { data: u } = await supabase.auth.getUser()
    if (!u?.user) return

    // Lấy CCCD nhanh
    const { data: ures } = await supabase
      .from('users')
      .select('cccd')
      .eq('id', u.user.id)
      .maybeSingle()

    await supabase.from('activity_logs').insert({
      user_id: u.user.id,
      user_cccd: ures?.cccd ?? null,
      action: params.action,
      entity_type: params.entity_type ?? null,
      entity_id: params.entity_id ?? null,
      old_value: params.old_value ? (params.old_value as object) : null,
      new_value: params.new_value ? (params.new_value as object) : null,
      description: params.description ?? null,
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[V75] logActivity failed:', e)
  }
}
