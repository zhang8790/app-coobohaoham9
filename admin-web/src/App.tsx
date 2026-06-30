import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Merchants from '@/pages/Merchants'
import Products from '@/pages/Products'
import Withdrawals from '@/pages/Withdrawals'
import Ugc from '@/pages/Ugc'
import Users from '@/pages/Users'

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B0F19' }}>
      <div style={{ color: '#9CA3AF', fontSize: 16 }}>加载中...</div>
    </div>
  )
  if (!profile || profile.role !== 'admin') return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAdmin><Layout /></RequireAdmin>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="merchants" element={<Merchants />} />
            <Route path="products" element={<Products />} />
            <Route path="withdrawals" element={<Withdrawals />} />
            <Route path="ugc" element={<Ugc />} />
            <Route path="users" element={<Users />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
