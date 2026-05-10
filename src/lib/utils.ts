import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Chuyển CCCD thành email kỹ thuật để dùng với Supabase Auth */
export const cccdToEmail = (cccd: string) => `${cccd}@v75.local`

/** Validate CCCD: 9 đến 12 chữ số */
export const isValidCccd = (cccd: string) => /^[0-9]{9,12}$/.test(cccd)

/** Format VNĐ */
export const fmtVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(n) + ' ₫'

export const formatDateTime = (d: string | Date) =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(d))
