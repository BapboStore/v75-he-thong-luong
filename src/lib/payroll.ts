/**
 * V75 — Tính bảng lương (RULE-04, RULE-05).
 *
 * Module thuần TS, KHÔNG truy cập DB. Nhận đầu vào là employee + config +
 * attendance đã chuẩn hoá → trả về một bản ghi sẵn sàng ghi vào bảng
 * `salary_records` (đúng tên cột trong schema 001_initial_schema.sql).
 *
 * Quy ước:
 * - Tất cả tiền tính theo VNĐ, làm tròn đồng (Math.round) ở bước cuối.
 * - Tham số NUMERIC từ Supabase có thể trả về dạng string → mọi nơi nhận
 *   number nên ép Number(...) ở caller. Hàm tại đây chỉ dùng number.
 *
 * Công thức Thuế TNCN dùng biểu lũy tiến từng phần (Thông tư 111/2013/TT-BTC):
 *   ≤  5tr  → 5%
 *   ≤ 10tr  → 10%   - 0.25tr
 *   ≤ 18tr  → 15%   - 0.75tr
 *   ≤ 32tr  → 20%   - 1.65tr
 *   ≤ 52tr  → 25%   - 3.25tr
 *   ≤ 80tr  → 30%   - 5.85tr
 *   >  80tr → 35%   - 9.85tr
 */

import type {
  AttendanceDriver,
  AttendanceOffice,
  AttendanceSecurity,
  AttendanceTechnician,
  Department,
  EmployeeFull,
  SalaryConfig,
} from '@/lib/types'

// =============================================================
// TYPES
// =============================================================

export type Khoi = 'office' | 'security' | 'technician' | 'driver'

/** Bản đầy đủ một dòng chấm công đã chuẩn hoá để tính lương. */
export interface AttendanceUnion {
  khoi: Khoi
  // Office / Technician / Security – các trường có thể không tồn tại,
  // dùng 0 mặc định.
  cong_tg?: number
  cong_ngay?: number
  cong_dem?: number
  cong_vd?: number
  cong_t7cn?: number
  ngoai_gio?: number // giờ
  le_tet_di_lam?: number
  le_tet_hoc_phep?: number
  // Driver-only
  s600?: number
  xe_4_7?: number
  xe_16_29?: number
  cong_mia?: number
  nhan_cong?: number
  cong_cho?: number
  so_km?: number
}

/** Khoản điều chỉnh thủ công (admin_luong nhập tay). */
export interface PayrollAdjustments {
  thuong?: number
  truy_thu?: number
  truy_linh?: number
  xang_xe?: number
  dien_thoai?: number
  /** Số ngày được tính ăn trưa. Mặc định: tổng công thực tế từ chấm công. */
  so_ngay_an_trua?: number
  /**
   * Phần lương không chịu thuế tách riêng (ví dụ phần ngoài giờ vượt mức
   * theo TT 111/2013 khoản 1 điểm i.1). Mặc định 0; có thể tinh chỉnh sau.
   */
  tien_luong_kct?: number
}

/** Bản ghi lương đã tính xong, đúng tên cột bảng salary_records. */
export interface PayrollRecord {
  // Identity
  employee_id: string
  department_id: string
  month_year: string
  cccd: string
  ho_ten: string
  chuc_vu: string | null
  ngach_code: string | null
  bac: number | null
  he_so_bac: number
  tnvk_percent: number
  he_so_pccv: number
  he_so_pctn: number
  // Snapshot config
  luong_co_so: number
  lcb_ngay: number
  // Chịu thuế
  tien_pccv_pctn: number
  tien_luong_ct: number
  thuong: number
  tong_chiu_thue: number
  // Không chịu thuế
  tien_luong_kct: number
  an_trua: number
  xang_xe: number
  dien_thoai: number
  tong_khong_ct: number
  // BH & thuế
  co_so_trich: number
  trich_nld: number
  don_vi_dong: number
  cdp: number
  thue_tncn: number
  truy_thu: number
  truy_linh: number
  thuc_linh: number
  // Banking
  so_tai_khoan: string | null
  ten_ngan_hang: string | null
  // Snapshot toàn bộ input để audit
  raw_data: Record<string, unknown>
}

// =============================================================
// HELPERS
// =============================================================

const r = (n: number) => Math.round(n) // làm tròn đồng

/** Quy đổi attendance theo từng khối → unified shape. */
export function normalizeAttendance(
  khoi: Khoi,
  row:
    | AttendanceOffice
    | AttendanceSecurity
    | AttendanceTechnician
    | AttendanceDriver
    | null,
): AttendanceUnion {
  const base: AttendanceUnion = { khoi }
  if (!row) return base
  // Tất cả các trường đều có thể là string từ Supabase NUMERIC → ép Number
  const N = (v: unknown) => Number(v ?? 0) || 0
  switch (khoi) {
    case 'office': {
      const o = row as AttendanceOffice
      return {
        khoi,
        cong_tg: N(o.cong_tg),
        cong_t7cn: N(o.cong_t7cn),
        ngoai_gio: N(o.ngoai_gio),
        cong_vd: N(o.cong_vd),
        le_tet_hoc_phep: N(o.le_tet_hoc_phep),
        le_tet_di_lam: N(o.le_tet_di_lam),
      }
    }
    case 'technician': {
      const t = row as AttendanceTechnician
      return {
        khoi,
        cong_tg: N(t.cong_tg),
        cong_t7cn: N(t.cong_t7cn),
        ngoai_gio: N(t.ngoai_gio),
        le_tet_hoc_phep: N(t.le_tet_hoc_phep),
        le_tet_di_lam: N(t.le_tet_di_lam),
      }
    }
    case 'security': {
      const s = row as AttendanceSecurity
      return {
        khoi,
        cong_ngay: N(s.cong_ngay),
        cong_dem: N(s.cong_dem),
        cong_t7cn: N(s.cong_t7cn),
        ngoai_gio: N(s.ngoai_gio),
        le_tet_hoc_phep: N(s.le_tet_hoc_phep),
        le_tet_di_lam: N(s.le_tet_di_lam),
      }
    }
    case 'driver': {
      const d = row as AttendanceDriver
      return {
        khoi,
        s600: N(d.s600),
        xe_4_7: N(d.xe_4_7),
        xe_16_29: N(d.xe_16_29),
        cong_mia: N(d.cong_mia),
        nhan_cong: N(d.nhan_cong),
        cong_cho: N(d.cong_cho),
        so_km: N(d.so_km),
        cong_t7cn: N(d.cong_t7cn),
        ngoai_gio: N(d.ngoai_gio),
        le_tet_hoc_phep: N(d.le_tet_hoc_phep),
        le_tet_di_lam: N(d.le_tet_di_lam),
      }
    }
  }
}

/** Số ngày công thực tế (cong_thuc_te) — dùng để tính tiền ăn trưa. */
function congThucTe(att: AttendanceUnion): number {
  switch (att.khoi) {
    case 'office':
    case 'technician':
      return (att.cong_tg ?? 0) + (att.cong_vd ?? 0) + (att.cong_t7cn ?? 0) + (att.le_tet_di_lam ?? 0)
    case 'security':
      // Đêm vẫn ăn ca → tính 1 ngày
      return (att.cong_ngay ?? 0) + (att.cong_dem ?? 0) + (att.cong_t7cn ?? 0) + (att.le_tet_di_lam ?? 0)
    case 'driver':
      return (
        (att.s600 ?? 0) + (att.xe_4_7 ?? 0) + (att.xe_16_29 ?? 0) +
        (att.cong_mia ?? 0) + (att.nhan_cong ?? 0) + (att.cong_cho ?? 0) +
        (att.cong_t7cn ?? 0) + (att.le_tet_di_lam ?? 0)
      )
  }
}

/** Tính tiền lương "công" theo từng khối — không bao gồm phụ cấp.
 *  Trả về 2 phần: chịu thuế (tien_luong_ct) và không chịu thuế (kct).
 *  Hệ số lũy tiến chuẩn lao động Việt Nam:
 *   - T7/CN: 200%
 *   - Ngoài giờ ngày thường: 150%
 *   - Lễ Tết đi làm: 300%  (có thể là 400% gồm cả 100% phép)
 *   - Lễ Tết hưởng phép (không đi làm): 100%
 */
function tienLuongCong(att: AttendanceUnion, lcbNgay: number, heSoLamDem: number, donGiaKm: number): { ct: number; kct: number } {
  const lcbGio = lcbNgay / 8

  const sum = (...x: number[]) => x.reduce((a, b) => a + b, 0)

  switch (att.khoi) {
    case 'office':
    case 'technician': {
      const cong_tg = att.cong_tg ?? 0
      const cong_t7cn = att.cong_t7cn ?? 0
      const ngoai_gio = att.ngoai_gio ?? 0
      const cong_vd = att.cong_vd ?? 0
      const le_phep = att.le_tet_hoc_phep ?? 0
      const le_lam = att.le_tet_di_lam ?? 0
      const ct = sum(
        lcbNgay * cong_tg,
        lcbNgay * cong_vd,
        lcbNgay * cong_t7cn * 2.0,
        lcbGio   * ngoai_gio * 1.5,
        lcbNgay * le_lam * 3.0,
        lcbNgay * le_phep * 1.0,
      )
      return { ct, kct: 0 }
    }
    case 'security': {
      const cong_ngay = att.cong_ngay ?? 0
      const cong_dem = att.cong_dem ?? 0
      const cong_t7cn = att.cong_t7cn ?? 0
      const ngoai_gio = att.ngoai_gio ?? 0
      const le_phep = att.le_tet_hoc_phep ?? 0
      const le_lam = att.le_tet_di_lam ?? 0
      const ct = sum(
        lcbNgay * cong_ngay,
        lcbNgay * cong_dem * heSoLamDem,
        lcbNgay * cong_t7cn * 2.0,
        lcbGio   * ngoai_gio * 1.5,
        lcbNgay * le_lam * 3.0,
        lcbNgay * le_phep * 1.0,
      )
      return { ct, kct: 0 }
    }
    case 'driver': {
      // RULE-05: Lái xe hưởng theo công đa dạng + tiền KM phụ trợ.
      // Quy ước hệ số (có thể tinh chỉnh khi có tài liệu chính thức):
      //   S600: 1.0  (xe 600 hệ số chuẩn)
      //   xe_4_7 (xe 4-7 chỗ): 0.8
      //   xe_16_29 (xe 16-29 chỗ): 1.2
      //   cong_mia (chở mía): 1.4
      //   nhan_cong: 1.0
      //   cong_cho: 0.5  (công chờ tính nửa ngày)
      const s600 = att.s600 ?? 0
      const xe47 = att.xe_4_7 ?? 0
      const xe1629 = att.xe_16_29 ?? 0
      const cong_mia = att.cong_mia ?? 0
      const nhan_cong = att.nhan_cong ?? 0
      const cong_cho = att.cong_cho ?? 0
      const so_km = att.so_km ?? 0
      const cong_t7cn = att.cong_t7cn ?? 0
      const ngoai_gio = att.ngoai_gio ?? 0
      const le_phep = att.le_tet_hoc_phep ?? 0
      const le_lam = att.le_tet_di_lam ?? 0
      // tiền lương theo công (chịu thuế)
      const luong_cong = sum(
        lcbNgay * s600 * 1.0,
        lcbNgay * xe47 * 0.8,
        lcbNgay * xe1629 * 1.2,
        lcbNgay * cong_mia * 1.4,
        lcbNgay * nhan_cong * 1.0,
        lcbNgay * cong_cho * 0.5,
        lcbNgay * cong_t7cn * 2.0,
        lcbGio   * ngoai_gio * 1.5,
        lcbNgay * le_lam * 3.0,
        lcbNgay * le_phep * 1.0,
      )
      // tiền KM lái xe — quy ước: xếp vào "chịu thuế" (là một phần thu nhập
      // theo công); nếu chính sách công ty xếp vào không chịu thuế thì có
      // thể tinh chỉnh sau bằng cách chuyển sang `kct`.
      const tien_km = so_km * donGiaKm
      return { ct: luong_cong + tien_km, kct: 0 }
    }
  }
}

/** Thuế TNCN lũy tiến từng phần — input/output tính theo VNĐ. */
export function thueTNCN(thuNhapTinhThue: number): number {
  const x = thuNhapTinhThue
  if (x <= 0) return 0
  // Bảng tính rút gọn (TT 111/2013/TT-BTC):
  if (x <=  5_000_000) return x * 0.05
  if (x <= 10_000_000) return x * 0.10 -    250_000
  if (x <= 18_000_000) return x * 0.15 -    750_000
  if (x <= 32_000_000) return x * 0.20 -  1_650_000
  if (x <= 52_000_000) return x * 0.25 -  3_250_000
  if (x <= 80_000_000) return x * 0.30 -  5_850_000
  return                       x * 0.35 -  9_850_000
}

// =============================================================
// MAIN
// =============================================================

export interface ComputePayrollInput {
  employee: EmployeeFull
  department: Department | null
  config: SalaryConfig
  attendance:
    | AttendanceOffice
    | AttendanceSecurity
    | AttendanceTechnician
    | AttendanceDriver
    | null
  /** Lái xe có 2 nguồn — caller phải chọn nguồn `admin_luong` (đã đối chiếu). */
  khoi: Khoi
  monthYear: string
  he_so_bac: number
  adj?: PayrollAdjustments
}

export function computePayroll(input: ComputePayrollInput): PayrollRecord {
  const { employee, config, monthYear, khoi, he_so_bac, adj = {} } = input

  // ép Number cho mọi tham số config (Supabase NUMERIC → string)
  const N = (v: unknown) => Number(v ?? 0) || 0
  const lcs   = N(config.luong_co_so)
  const ngayChuan = config.so_ngay_cong_chuan || 22
  const heSoLamDem = N(config.he_so_lam_dem) || 1.3
  const donGiaKm = N(config.don_gia_km_lai_xe)
  const donGiaAnTrua = N(config.don_gia_an_trua_ngay)
  const anTruaMax = N(config.tien_an_trua_max)
  const tyleBhNld = N(config.ty_le_bh_nld)
  const tyleBhDv = N(config.ty_le_bh_dv)
  const tyleCdp = N(config.ty_le_cong_doan_phi)
  const giamTruBT = N(config.giam_tru_ban_than)
  const giamTruPT = N(config.giam_tru_phu_thuoc)

  const tnvk_percent = N(employee.tnvk_percent)
  const he_so_pccv = N(employee.he_so_pccv)
  const he_so_pctn = N(employee.he_so_pctn)

  // 1. Lương cơ bản & ngày công
  const lcbThang = lcs * he_so_bac
  const lcbNgay = lcbThang / ngayChuan

  // 2. Phụ cấp (tiền) — PCCV và PCTN tính theo LCS * hệ số
  const tien_pccv = lcs * he_so_pccv
  const tien_pctn = lcs * he_so_pctn
  const tien_pccv_pctn_raw = tien_pccv + tien_pctn
  // TNVK tính theo (LCB tháng + PCCV + PCTN) * %
  const tien_tnvk = (lcbThang + tien_pccv + tien_pctn) * (tnvk_percent / 100)

  // 3. Lương theo công (chịu thuế / không chịu thuế)
  const att = normalizeAttendance(khoi, input.attendance)
  const tienCong = tienLuongCong(att, lcbNgay, heSoLamDem, donGiaKm)

  // tien_luong_ct gộp: lương theo công + TNVK (TNVK chịu thuế vì là TN)
  const tien_luong_ct_raw = tienCong.ct + tien_tnvk
  const tien_luong_kct_raw = tienCong.kct + N(adj.tien_luong_kct)

  // 4. Tiền ăn trưa — không chịu thuế (theo TT 26)
  const ngayAnTruaThucTe = adj.so_ngay_an_trua ?? congThucTe(att)
  const an_trua_raw = Math.min(ngayAnTruaThucTe * donGiaAnTrua, anTruaMax)

  // 5. Phụ cấp khác (xăng xe, điện thoại) — không chịu thuế
  const xang_xe_raw = N(adj.xang_xe)
  const dien_thoai_raw = N(adj.dien_thoai)
  const thuong_raw = N(adj.thuong)

  // 6. BHXH/BHYT/BHTN/CĐP — cơ sở trích = LCB tháng + PCCV + PCTN
  const co_so_trich_raw = lcbThang + tien_pccv + tien_pctn
  const trich_nld_raw = co_so_trich_raw * (tyleBhNld / 100)
  const don_vi_dong_raw = co_so_trich_raw * (tyleBhDv / 100)
  const cdp_raw = co_so_trich_raw * (tyleCdp / 100)

  // 7. Tổng chịu thuế / không chịu thuế
  const tong_chiu_thue_raw = tien_pccv_pctn_raw + tien_luong_ct_raw + thuong_raw
  const tong_khong_ct_raw =
    tien_luong_kct_raw + an_trua_raw + xang_xe_raw + dien_thoai_raw

  // 8. Thuế TNCN (lũy tiến trên thu nhập tính thuế)
  const giam_tru = giamTruBT + giamTruPT * (employee.so_nguoi_phu_thuoc ?? 0)
  const thu_nhap_chiu_thue = tong_chiu_thue_raw - trich_nld_raw - cdp_raw
  const thu_nhap_tinh_thue = Math.max(0, thu_nhap_chiu_thue - giam_tru)
  const thue_tncn_raw = thueTNCN(thu_nhap_tinh_thue)

  // 9. Thực lĩnh = tổng thu nhập (CT + KCT) − BH NLĐ − CĐP − Thuế TNCN
  //                + truy lĩnh − truy thu
  const truy_thu_raw = N(adj.truy_thu)
  const truy_linh_raw = N(adj.truy_linh)
  const thuc_linh_raw =
    tong_chiu_thue_raw + tong_khong_ct_raw -
    trich_nld_raw - cdp_raw - thue_tncn_raw +
    truy_linh_raw - truy_thu_raw

  return {
    employee_id: employee.id,
    department_id: employee.department_id ?? '',
    month_year: monthYear,
    cccd: employee.cccd,
    ho_ten: employee.ho_ten,
    chuc_vu: employee.chuc_vu,
    ngach_code: employee.ngach_code,
    bac: employee.bac,
    he_so_bac,
    tnvk_percent,
    he_so_pccv,
    he_so_pctn,
    luong_co_so: lcs,
    lcb_ngay: r(lcbNgay),
    tien_pccv_pctn: r(tien_pccv_pctn_raw),
    tien_luong_ct: r(tien_luong_ct_raw),
    thuong: r(thuong_raw),
    tong_chiu_thue: r(tong_chiu_thue_raw),
    tien_luong_kct: r(tien_luong_kct_raw),
    an_trua: r(an_trua_raw),
    xang_xe: r(xang_xe_raw),
    dien_thoai: r(dien_thoai_raw),
    tong_khong_ct: r(tong_khong_ct_raw),
    co_so_trich: r(co_so_trich_raw),
    trich_nld: r(trich_nld_raw),
    don_vi_dong: r(don_vi_dong_raw),
    cdp: r(cdp_raw),
    thue_tncn: r(thue_tncn_raw),
    truy_thu: r(truy_thu_raw),
    truy_linh: r(truy_linh_raw),
    thuc_linh: r(thuc_linh_raw),
    so_tai_khoan: employee.so_tai_khoan,
    ten_ngan_hang: employee.ten_ngan_hang,
    raw_data: {
      attendance: att,
      adjustments: adj,
      he_so_bac,
      lcb_thang: lcbThang,
      lcb_gio: lcbNgay / 8,
      tien_pccv,
      tien_pctn,
      tien_tnvk,
      thu_nhap_chiu_thue,
      thu_nhap_tinh_thue,
      giam_tru_tong: giam_tru,
      ngay_an_trua: ngayAnTruaThucTe,
    },
  }
}

/** Map Department.salary_type → Khoi mặc định. Khối "bao_ve_ky_thuat"
 *  cần caller chỉ định cụ thể security hoặc technician. */
export function defaultKhoi(dept: Department | null): Khoi {
  if (!dept) return 'office'
  if (dept.salary_type === 'lai_xe') return 'driver'
  if (dept.salary_type === 'hanh_chinh') return 'office'
  return 'security'
}
