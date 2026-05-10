import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center space-y-4">
      <ShieldAlert className="h-12 w-12 text-destructive" />
      <h1 className="text-2xl font-bold">Bạn không có quyền truy cập</h1>
      <p className="text-muted-foreground max-w-md">
        Trang này yêu cầu vai trò khác với tài khoản hiện tại của bạn.
        Liên hệ Quản trị Hệ thống nếu cần cấp thêm quyền.
      </p>
      <Link to="/"><Button>Về Dashboard</Button></Link>
    </div>
  )
}
