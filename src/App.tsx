import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Layout } from '@/components/Layout'
import LoginPage from '@/pages/LoginPage'
import ChangePasswordPage from '@/pages/ChangePasswordPage'
import DashboardPage from '@/pages/DashboardPage'
import UnauthorizedPage from '@/pages/UnauthorizedPage'
import DepartmentsPage from '@/pages/DepartmentsPage'
import EmployeesPage from '@/pages/EmployeesPage'
import ConfigPage from '@/pages/ConfigPage'
import UsersPage from '@/pages/UsersPage'
import AttendancePage from '@/pages/AttendancePage'
import SalaryPage from '@/pages/SalaryPage'
import PayslipPage from '@/pages/PayslipPage'
import LogsPage from '@/pages/LogsPage'
import PromotionsPage from '@/pages/PromotionsPage'
import ReportsPage from '@/pages/ReportsPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <ChangePasswordPage />
              </ProtectedRoute>
            }
          />

          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="payslip"     element={<PayslipPage />} />
            <Route path="attendance"  element={<ProtectedRoute roles={['truong_phong','admin_luong','admin_he_thong']}><AttendancePage /></ProtectedRoute>} />
            <Route path="salary"      element={<ProtectedRoute roles={['truong_phong','admin_luong','admin_he_thong']}><SalaryPage /></ProtectedRoute>} />
            <Route path="employees"   element={<ProtectedRoute roles={['admin_luong','admin_he_thong']}><EmployeesPage /></ProtectedRoute>} />
            <Route path="promotions"  element={<ProtectedRoute roles={['admin_luong','admin_he_thong']}><PromotionsPage /></ProtectedRoute>} />
            <Route path="departments" element={<ProtectedRoute roles={['admin_luong','admin_he_thong']}><DepartmentsPage /></ProtectedRoute>} />
            <Route path="reports"     element={<ProtectedRoute roles={['admin_luong','admin_he_thong']}><ReportsPage /></ProtectedRoute>} />
            <Route path="users"       element={<ProtectedRoute roles={['admin_he_thong']}><UsersPage /></ProtectedRoute>} />
            <Route path="logs"        element={<ProtectedRoute roles={['admin_he_thong']}><LogsPage /></ProtectedRoute>} />
            <Route path="config"      element={<ProtectedRoute roles={['admin_he_thong']}><ConfigPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
