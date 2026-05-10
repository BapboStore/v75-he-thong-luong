// =====================================================================
// V75 – Seed demo users (CCCD/password) qua Supabase Admin API
// Chạy: node supabase/scripts/seed-users.mjs
// Yêu cầu env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// =====================================================================
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Quy ước: Supabase Auth bắt buộc email -> sinh email kỹ thuật từ CCCD
const cccdToEmail = (cccd) => `${cccd}@v75.local`

const DEMO_USERS = [
  // CCCD              Họ tên                Role               Phòng ban
  { cccd: '001199000001', ho_ten: 'Quản trị Hệ thống', role: 'admin_he_thong', dept_code: 'TCHC_VP' },
  { cccd: '001199000002', ho_ten: 'Quản trị Lương',     role: 'admin_luong',     dept_code: 'KTTC' },
  { cccd: '001199000003', ho_ten: 'Trưởng phòng KTTC',  role: 'truong_phong',    dept_code: 'KTTC' },
  { cccd: '001199000004', ho_ten: 'Trưởng phòng KHKD',  role: 'truong_phong',    dept_code: 'KHKD' },
  { cccd: '001199000005', ho_ten: 'Nhân viên A',        role: 'user',            dept_code: 'KTTC' },
  { cccd: '001199000006', ho_ten: 'Nhân viên B',        role: 'user',            dept_code: 'KHKD' },
  { cccd: '001199000007', ho_ten: 'Lái xe Nghĩa Đô',    role: 'user',            dept_code: 'DX_NGHIADO' },
  { cccd: '001199000008', ho_ten: 'Bảo vệ TCHC',        role: 'user',            dept_code: 'TCHC_BV' },
]

const DEFAULT_PASSWORD = '8888V75'

async function main () {
  // 1. Lấy mapping department_code -> id
  const { data: depts, error: deptErr } = await supabase
    .from('departments').select('id, code')
  if (deptErr) throw deptErr
  const deptMap = Object.fromEntries(depts.map(d => [d.code, d.id]))

  for (const u of DEMO_USERS) {
    const email = cccdToEmail(u.cccd)
    const dept_id = deptMap[u.dept_code]
    if (!dept_id) { console.warn(`Bỏ qua ${u.cccd} – không tìm thấy phòng ${u.dept_code}`); continue }

    // 2. Tạo auth user (idempotent: nếu trùng thì lấy id cũ)
    let authUserId
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { cccd: u.cccd, ho_ten: u.ho_ten },
    })
    if (createErr && !String(createErr.message).toLowerCase().includes('registered')) {
      console.error(`Tạo auth user lỗi (${u.cccd}):`, createErr.message)
      continue
    }
    if (created?.user) authUserId = created.user.id
    else {
      // user đã tồn tại -> tìm lại
      const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const existed = list?.users?.find(x => x.email === email)
      if (!existed) { console.error(`Không tìm được user ${email}`); continue }
      authUserId = existed.id
    }

    // 3. Tạo employee
    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .upsert({
        cccd: u.cccd,
        ho_ten: u.ho_ten,
        department_id: dept_id,
        chuc_vu: u.role === 'truong_phong' ? 'Trưởng phòng' : (u.role === 'admin_luong' ? 'Quản trị lương' : (u.role === 'admin_he_thong' ? 'Quản trị hệ thống' : 'Nhân viên')),
        ngay_vao_lam: '2020-01-01',
        status: 'dang_lam_viec',
      }, { onConflict: 'cccd' })
      .select()
      .single()
    if (empErr) { console.error('Upsert employee lỗi:', empErr.message); continue }

    // 4. Tạo user record
    const { error: userErr } = await supabase
      .from('users')
      .upsert({
        id: authUserId,
        cccd: u.cccd,
        employee_id: emp.id,
        role: u.role,
        department_id: dept_id,
        must_change_password: true,
        is_active: true,
      }, { onConflict: 'id' })
    if (userErr) { console.error('Upsert users lỗi:', userErr.message); continue }

    console.log(`✓ ${u.cccd}  ${u.ho_ten.padEnd(24)}  ${u.role.padEnd(16)}  ${u.dept_code}`)
  }

  console.log('\nMật khẩu mặc định cho tất cả tài khoản demo: 8888V75')
  console.log('Khi đăng nhập lần đầu, hệ thống sẽ yêu cầu đổi mật khẩu.')
}

main().catch(e => { console.error(e); process.exit(1) })
