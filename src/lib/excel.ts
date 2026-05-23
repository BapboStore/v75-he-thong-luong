/**
 * V75 — Helper xuất file Excel / CSV (Module 5, phiên 9).
 *
 * - `exportSalaryToExcel`: xuất bảng lương 1 phòng × 1 tháng ra .xlsx có
 *   metadata header (kỳ, phòng ban, ngày xuất), bảng chi tiết nhân viên và
 *   dòng tổng cộng. Dùng SheetJS Community Edition (CDN tarball của SheetJS).
 *
 * - `exportLogsToCsv`: xuất activity_logs đã filter ra .csv UTF-8 có BOM
 *   (Excel mở tiếng Việt không lỗi font), tự escape dấu phẩy / xuống dòng /
 *   dấu ngoặc kép theo RFC 4180.
 *
 * Cả hai tải file qua `<a download>` để chạy hoàn toàn client-side, không
 * cần backend.
 */
import * as XLSX from 'xlsx'
import type { ActivityLog, Department, SalaryRecord } from '@/lib/types'
import { LOG_OP_LABEL, parseLogAction } from '@/lib/types'

// =============================================================
// Helpers chung
// =============================================================

function safeFileName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // bỏ dấu tiếng Việt (combining marks)
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'export'
}

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function nowStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) + '_' +
    pad(d.getHours()) +
    pad(d.getMinutes())
  )
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 1000)
}

// =============================================================
// EXPORT BẢNG LƯƠNG → XLSX
// =============================================================

export interface ExportSalaryOptions {
  records: SalaryRecord[]
  department: Department | null
  monthYear: string // 'YYYY-MM'
}

interface ExcelRow {
  STT: number
  'Họ tên': string
  CCCD: string
  'Chức vụ': string
  Ngạch: string
  Bậc: number | string
  'Hệ số bậc': number
  'TNVK %': number
  'Hệ số PCCV': number
  'Hệ số PCTN': number
  'Lương cơ sở': number
  'LCB ngày': number
  'PCCV+PCTN': number
  'Lương chịu thuế': number
  Thưởng: number
  'Tổng chịu thuế': number
  'Lương KCT': number
  'Ăn trưa': number
  'Xăng xe': number
  'Điện thoại': number
  'Tổng KCT': number
  'BH NLĐ': number
  CĐP: number
  'Thuế TNCN': number
  'Truy lĩnh': number
  'Truy thu': number
  'Thực lĩnh': number
  'Số TK': string
  'Ngân hàng': string
  'Trạng thái': string
}

const SR_STATUS_LABEL_VN: Record<string, string> = {
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  cancelled: 'Đã huỷ',
}

export function exportSalaryToExcel({ records, department, monthYear }: ExportSalaryOptions): void {
  if (records.length === 0) {
    throw new Error('Không có bảng lương nào để xuất.')
  }

  const wb = XLSX.utils.book_new()

  // --- Sheet 1: tiêu đề ---
  const titleAoA: (string | number)[][] = [
    ['BẢNG LƯƠNG THÁNG ' + monthYear],
    ['Phòng ban', department ? `${department.code} – ${department.name}` : '(tất cả)'],
    ['Số nhân viên', records.length],
    ['Ngày xuất', new Date().toLocaleString('vi-VN')],
    [],
  ]

  // --- Bảng chi tiết ---
  const rows: ExcelRow[] = records.map((r, i) => ({
    STT: i + 1,
    'Họ tên': r.ho_ten ?? '',
    CCCD: r.cccd ?? '',
    'Chức vụ': r.chuc_vu ?? '',
    Ngạch: r.ngach_code ?? '',
    Bậc: r.bac ?? '',
    'Hệ số bậc': num(r.he_so_bac),
    'TNVK %': num(r.tnvk_percent),
    'Hệ số PCCV': num(r.he_so_pccv),
    'Hệ số PCTN': num(r.he_so_pctn),
    'Lương cơ sở': num(r.luong_co_so),
    'LCB ngày': num(r.lcb_ngay),
    'PCCV+PCTN': num(r.tien_pccv_pctn),
    'Lương chịu thuế': num(r.tien_luong_ct),
    Thưởng: num(r.thuong),
    'Tổng chịu thuế': num(r.tong_chiu_thue),
    'Lương KCT': num(r.tien_luong_kct),
    'Ăn trưa': num(r.an_trua),
    'Xăng xe': num(r.xang_xe),
    'Điện thoại': num(r.dien_thoai),
    'Tổng KCT': num(r.tong_khong_ct),
    'BH NLĐ': num(r.trich_nld),
    CĐP: num(r.cdp),
    'Thuế TNCN': num(r.thue_tncn),
    'Truy lĩnh': num(r.truy_linh),
    'Truy thu': num(r.truy_thu),
    'Thực lĩnh': num(r.thuc_linh),
    'Số TK': r.so_tai_khoan ?? '',
    'Ngân hàng': r.ten_ngan_hang ?? '',
    'Trạng thái': SR_STATUS_LABEL_VN[r.status] ?? r.status,
  }))

  // Tổng cộng — chỉ cộng dồn các cột số tiền (không cộng hệ số / lương cơ sở)
  const numericKeys: (keyof ExcelRow)[] = [
    'PCCV+PCTN', 'Lương chịu thuế', 'Thưởng', 'Tổng chịu thuế',
    'Lương KCT', 'Ăn trưa', 'Xăng xe', 'Điện thoại', 'Tổng KCT',
    'BH NLĐ', 'CĐP', 'Thuế TNCN', 'Truy lĩnh', 'Truy thu', 'Thực lĩnh',
  ]
  const totals: Record<string, number> = {}
  for (const r of rows) {
    for (const k of numericKeys) {
      totals[k as string] = (totals[k as string] ?? 0) + (r[k] as number)
    }
  }

  const totalRow: ExcelRow = {
    STT: 0,
    'Họ tên': `TỔNG CỘNG (${rows.length} bản)`,
    CCCD: '',
    'Chức vụ': '',
    Ngạch: '',
    Bậc: '',
    'Hệ số bậc': 0,
    'TNVK %': 0,
    'Hệ số PCCV': 0,
    'Hệ số PCTN': 0,
    'Lương cơ sở': 0,
    'LCB ngày': 0,
    'PCCV+PCTN': totals['PCCV+PCTN'] ?? 0,
    'Lương chịu thuế': totals['Lương chịu thuế'] ?? 0,
    Thưởng: totals['Thưởng'] ?? 0,
    'Tổng chịu thuế': totals['Tổng chịu thuế'] ?? 0,
    'Lương KCT': totals['Lương KCT'] ?? 0,
    'Ăn trưa': totals['Ăn trưa'] ?? 0,
    'Xăng xe': totals['Xăng xe'] ?? 0,
    'Điện thoại': totals['Điện thoại'] ?? 0,
    'Tổng KCT': totals['Tổng KCT'] ?? 0,
    'BH NLĐ': totals['BH NLĐ'] ?? 0,
    CĐP: totals['CĐP'] ?? 0,
    'Thuế TNCN': totals['Thuế TNCN'] ?? 0,
    'Truy lĩnh': totals['Truy lĩnh'] ?? 0,
    'Truy thu': totals['Truy thu'] ?? 0,
    'Thực lĩnh': totals['Thực lĩnh'] ?? 0,
    'Số TK': '',
    'Ngân hàng': '',
    'Trạng thái': '',
  }

  // Build sheet: title block (AoA) + table (json_to_sheet) ở dòng 6 (sau 4
  // dòng metadata + 1 dòng trống). Dùng origin tường minh thay vì -1 để
  // tránh phụ thuộc vào cách SheetJS tính '!ref' với row trống cuối.
  const ws = XLSX.utils.aoa_to_sheet(titleAoA)
  XLSX.utils.sheet_add_json(ws, [...rows, totalRow], { origin: 'A6', skipHeader: false })

  // Tự co rộng cột (đơn giản: max length text)
  const headers = Object.keys(rows[0]) as (keyof ExcelRow)[]
  const colWidths = headers.map((h) => {
    const headerLen = String(h).length
    const maxRow = Math.max(
      ...rows.map((r) => String(r[h] ?? '').length),
      String((totalRow[h] ?? '')).length,
    )
    return { wch: Math.min(40, Math.max(8, Math.max(headerLen, maxRow) + 1)) }
  })
  ws['!cols'] = colWidths

  XLSX.utils.book_append_sheet(wb, ws, 'Bảng lương')

  // Xuất
  const fileName = `BangLuong_${safeFileName(department?.code ?? 'all')}_${monthYear}_${nowStamp()}.xlsx`
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  downloadBlob(blob, fileName)
}

// =============================================================
// EXPORT NHẬT KÝ → CSV
// =============================================================

const ENTITY_LABEL_VN: Record<string, string> = {
  departments: 'Phòng ban',
  employees: 'Nhân viên',
  salary_config: 'Cấu hình lương',
  salary_grades: 'Ngạch / bậc',
  attendance_office: 'Chấm công VP',
  attendance_driver: 'Chấm công lái xe',
  attendance_security: 'Chấm công bảo vệ',
  attendance_technician: 'Chấm công kỹ thuật',
  salary_records: 'Bảng lương',
  users: 'Tài khoản',
}

/** Escape 1 ô CSV theo RFC 4180: bọc dấu " nếu có , " hoặc xuống dòng. */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = typeof v === 'string' ? v : (
    typeof v === 'object' ? JSON.stringify(v) : String(v)
  )
  // Loại CR/LF dư thừa (giữ nguyên cho đúng RFC, chỉ escape)
  if (/[",\r\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export interface ExportLogsOptions {
  rows: ActivityLog[]
  /** Hậu tố tên file, ví dụ "filtered" hoặc "all". */
  suffix?: string
}

export function exportLogsToCsv({ rows, suffix }: ExportLogsOptions): void {
  if (rows.length === 0) {
    throw new Error('Không có log nào để xuất.')
  }
  const headers = [
    'Thời gian',
    'CCCD',
    'Hành động',
    'Bảng',
    'Loại dữ liệu',
    'Entity ID',
    'IP',
    'Giá trị cũ',
    'Giá trị mới',
  ]
  const lines: string[] = [headers.map(csvCell).join(',')]
  for (const log of rows) {
    const { op, table } = parseLogAction(log.action ?? '')
    const opLabel = LOG_OP_LABEL[op] ?? op
    const entityLabel = ENTITY_LABEL_VN[log.entity_type ?? table] ?? log.entity_type ?? table
    lines.push([
      new Date(log.created_at).toLocaleString('vi-VN', { hour12: false }),
      log.user_cccd ?? '',
      opLabel,
      table,
      entityLabel,
      log.entity_id ?? '',
      log.ip_address ?? '',
      log.old_value ? JSON.stringify(log.old_value) : '',
      log.new_value ? JSON.stringify(log.new_value) : '',
    ].map(csvCell).join(','))
  }
  const csv = '﻿' + lines.join('\r\n') // BOM cho Excel mở UTF-8 đúng
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const fileName = `NhatKy_${suffix ? safeFileName(suffix) + '_' : ''}${nowStamp()}.csv`
  downloadBlob(blob, fileName)
}

// =============================================================
// EXPORT BÁO CÁO TỔNG HỢP LƯƠNG → XLSX (Module 6 — phiên 15)
// =============================================================

export interface DeptSummaryRow {
  deptId: string
  deptName: string
  deptCode: string
  soNV: number
  tongChiuThue: number
  tongKhongCT: number
  tongTrichNLD: number
  tongCDP: number
  tongThueTNCN: number
  tongTruyLinh: number
  tongTruyThu: number
  tongThucLinh: number
}

export interface ExportSalaryReportOptions {
  summaries: DeptSummaryRow[]
  records: SalaryRecord[]
  monthYear: string
}

export function exportSalaryReportToExcel({ summaries, records, monthYear }: ExportSalaryReportOptions): void {
  if (summaries.length === 0) throw new Error('Không có dữ liệu để xuất.')

  const wb = XLSX.utils.book_new()

  // ─── Sheet 1: Tổng hợp theo phòng ban ──────────────────────────────────────
  const titleAoA = [
    [`BÁO CÁO TỔNG HỢP LƯƠNG — KỲ ${monthYear}`],
    [`Ngày xuất: ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN')}`],
    [`Tổng số phòng ban: ${summaries.length} | Tổng số bản lương: ${records.length}`],
    [],
  ]

  interface SummaryExcelRow {
    STT: number
    'Mã phòng': string
    'Tên phòng ban': string
    'Số NV': number
    'Tổng chịu thuế': number
    'Tổng không CT': number
    'BH NLĐ': number
    CĐP: number
    'Thuế TNCN': number
    'Truy lĩnh': number
    'Truy thu': number
    'Thực lĩnh': number
  }

  const summaryRows: SummaryExcelRow[] = summaries.map((s, i) => ({
    STT: i + 1,
    'Mã phòng': s.deptCode,
    'Tên phòng ban': s.deptName,
    'Số NV': s.soNV,
    'Tổng chịu thuế': s.tongChiuThue,
    'Tổng không CT': s.tongKhongCT,
    'BH NLĐ': s.tongTrichNLD,
    CĐP: s.tongCDP,
    'Thuế TNCN': s.tongThueTNCN,
    'Truy lĩnh': s.tongTruyLinh,
    'Truy thu': s.tongTruyThu,
    'Thực lĩnh': s.tongThucLinh,
  }))

  // Dòng tổng cộng
  const grandTotalRow: SummaryExcelRow = {
    STT: 0,
    'Mã phòng': '',
    'Tên phòng ban': 'TỔNG CỘNG',
    'Số NV': summaries.reduce((s, r) => s + r.soNV, 0),
    'Tổng chịu thuế': summaries.reduce((s, r) => s + r.tongChiuThue, 0),
    'Tổng không CT': summaries.reduce((s, r) => s + r.tongKhongCT, 0),
    'BH NLĐ': summaries.reduce((s, r) => s + r.tongTrichNLD, 0),
    CĐP: summaries.reduce((s, r) => s + r.tongCDP, 0),
    'Thuế TNCN': summaries.reduce((s, r) => s + r.tongThueTNCN, 0),
    'Truy lĩnh': summaries.reduce((s, r) => s + r.tongTruyLinh, 0),
    'Truy thu': summaries.reduce((s, r) => s + r.tongTruyThu, 0),
    'Thực lĩnh': summaries.reduce((s, r) => s + r.tongThucLinh, 0),
  }

  const ws1 = XLSX.utils.aoa_to_sheet(titleAoA)
  XLSX.utils.sheet_add_json(ws1, [...summaryRows, grandTotalRow], { origin: 'A5', skipHeader: false })
  ws1['!cols'] = [
    { wch: 5 }, { wch: 12 }, { wch: 30 }, { wch: 8 },
    { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 10 },
    { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Tổng hợp')

  // ─── Sheet 2: Chi tiết từng NV (rút gọn) ───────────────────────────────────
  if (records.length > 0) {
    interface DetailRow {
      'Phòng': string
      'CCCD': string
      'Họ tên': string
      'Chức vụ': string
      'Thực lĩnh': number
      'Trạng thái': string
    }
    const detailRows: DetailRow[] = records.map((r) => ({
      'Phòng': r.department_id ?? '',
      'CCCD': r.cccd ?? '',
      'Họ tên': r.ho_ten ?? '',
      'Chức vụ': r.chuc_vu ?? '',
      'Thực lĩnh': num(r.thuc_linh),
      'Trạng thái': r.status ?? '',
    }))
    const ws2 = XLSX.utils.json_to_sheet(detailRows)
    ws2['!cols'] = [
      { wch: 20 }, { wch: 14 }, { wch: 28 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
    ]
    XLSX.utils.book_append_sheet(wb, ws2, 'Chi tiết NV')
  }

  const fileName = `BaoCaoLuong_${monthYear}_${nowStamp()}.xlsx`
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  downloadBlob(blob, fileName)
}
