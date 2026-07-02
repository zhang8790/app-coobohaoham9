import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import Layout from '@/components/Layout'
import MerchantLayout from '@/components/MerchantLayout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Merchants from '@/pages/Merchants'
import Products from '@/pages/Products'
import Withdrawals from '@/pages/Withdrawals'
import Ugc from '@/pages/Ugc'
import Users from '@/pages/Users'
import Refunds from '@/pages/Refunds'
import Announcements from '@/pages/Announcements'
// 商家管理页面
import MerchantDashboard from '@/pages/merchant/Index'
import MerchantProducts from '@/pages/merchant/Products'
import MerchantOrders from '@/pages/merchant/Orders'
import MerchantCoupons from '@/pages/merchant/Coupons'
import MerchantAnalytics from '@/pages/merchant/Analytics'
import MerchantAds from '@/pages/merchant/Ads'
import MerchantMessages from '@/pages/merchant/Messages'
import MerchantWithdraw from '@/pages/merchant/Withdraw'
import MerchantMembers from '@/pages/merchant/Members'

// ============ 路由守卫 ============

/**
 * 已登录 + 角色校验
 * - requireAdmin: 仅允许 admin，其余跳转 /merchant
 * - requireMerchant: 仅允许 merchant，其余跳转 /dashboard
 * - 无 requireXxx: 任意已登录角色均可访问
 */
function RequireAuth({ children, requireAdmin = false, requireMerchant = false }: {
  children: React.ReactNode
  requireAdmin?: boolean
  requireMerchant?: boolean
}) {
  const { profile, loading } = useAuth()
  const nav = useNavigate()

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B0F19' }}>
      <div style={{ color: '#9CA3AF', fontSize: 16 }}>加载中...</div>
    </div>
  )
  if (!profile) return <Navigate to="/login" replace />

  // admin 专属路由
  if (requireAdmin && profile.role !== 'admin') {
    return <Navigate to="/merchant" replace />
  }
  // 商家专属路由
  if (requireMerchant && profile.role !== 'merchant') {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

/**
 * 根路径自动跳转（/）
 * - admin → /dashboard
 * - merchant → /merchant
 * - 未登录 → /login
 */
function RoleRouter() {
  const { profile, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B0F19' }}>
      <div style={{ color: '#9CA3AF', fontSize: 16 }}>加载中...</div>
    </div>
  )
  if (!profile) return <Navigate to="/login" replace />
  if (profile.role === 'admin') return <Navigate to="/dashboard" replace />
  if (profile.role === 'merchant') return <Navigate to="/merchant" replace />
  // 兜底
  return <Navigate to="/login" replace />
}

// ============ 应用根组件 ============

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* 登录页 */}
          <Route path="/login" element={<Login />} />

          {/* 根路径：按角色自动跳转 */}
          <Route path="/" element={<RoleRouter />} />

          {/* ===== 总后台（admin 专属）===== */}
          <Route path="/" element={<RequireAuth requireAdmin><Layout /></RequireAuth>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="merchants" element={<Merchants />} />
            <Route path="products" element={<Products />} />
            <Route path="withdrawals" element={<Withdrawals />} />
            <Route path="ugc" element={<Ugc />} />
            <Route path="users" element={<Users />} />
            <Route path="refunds" element={<Refunds />} />
            <Route path="announcements" element={<Announcements />} />
          </Route>

          {/* ===== 犒赏铺管理后台（merchant 专属）===== */}
          <Route path="/merchant" element={<RequireAuth requireMerchant><MerchantLayout /></RequireAuth>}>
            <Route index element={<MerchantDashboard />} />
            <Route path="products" element={<MerchantProducts />} />
            <Route path="orders" element={<MerchantOrders />} />
            <Route path="coupons" element={<MerchantCoupons />} />
            <Route path="analytics" element={<MerchantAnalytics />} />
            <Route path="ads" element={<MerchantAds />} />
            <Route path="messages" element={<MerchantMessages />} />
            <Route path="withdraw" element={<MerchantWithdraw />} />
            <Route path="members" element={<MerchantMembers />} />
          </Route>

          {/* 兜底：未匹配路由 → 按角色跳转 */}
          <Route path="*" element={<RoleRouter />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
