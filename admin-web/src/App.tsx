import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import EmotionClaims from '@/pages/EmotionClaims'
import FinanceDashboard from '@/pages/FinanceDashboard'
import Members from '@/pages/Members'
import Orders from '@/pages/Orders'
import Ledgers from '@/pages/Ledgers'
import MerchantSettlements from '@/pages/MerchantSettlements'
import BehaviorAnalytics from '@/pages/BehaviorAnalytics'
import SymptomRules from '@/pages/SymptomRules'
import MarketingTemplates from '@/pages/MarketingTemplates'
import SelfStores from '@/pages/SelfStores'
import CommissionGuide from '@/pages/CommissionGuide'
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
import EmotionStudio from '@/pages/merchant/EmotionStudio'
import EmotionFunnel from '@/pages/merchant/EmotionFunnel'

// ============ 路由守卫 ============

/**
 * 已登录 + 角色校验
 * - requireAdmin: 仅允许 admin，其余跳转 /merchant
 * - requireMerchant: 仅允许 merchant，其余跳转 /dashboard
 * - 无 requireXxx: 任意已登录角色均可访问
 */
// 判断是否有商家权限（role=merchant 或 merchant_status=approved）
const isMerchantUser = (profile: any): boolean => {
  if (!profile) return false
  return profile.role === 'merchant' || profile.merchant_status === 'approved'
}

function RequireAuth({ children, requireAdmin = false, requireMerchant = false }: {
  children: React.ReactNode
  requireAdmin?: boolean
  requireMerchant?: boolean
}) {
  const { profile, loading } = useAuth()

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 16 }}>加载中...</div>
    </div>
  )
  if (!profile) return <Navigate to="/login" replace />

  // admin 专属路由
  if (requireAdmin && profile.role !== 'admin') {
    return <Navigate to="/merchant" replace />
  }
  // 商家专属路由（允许 role=merchant 或 merchant_status=approved）
  if (requireMerchant && !isMerchantUser(profile)) {
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 16 }}>加载中...</div>
    </div>
  )
  if (!profile) return <Navigate to="/login" replace />
  if (profile.role === 'admin') return <Navigate to="/dashboard" replace />
  if (isMerchantUser(profile)) return <Navigate to="/merchant" replace />
  // 兜底：无权限用户退回登录
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
          <Route path="emotion-claims" element={<EmotionClaims />} />
          <Route path="finance" element={<FinanceDashboard />} />
          <Route path="members" element={<Members />} />
          <Route path="orders" element={<Orders />} />
          <Route path="ledgers" element={<Ledgers />} />
          <Route path="merchant-settlements" element={<MerchantSettlements />} />
          <Route path="behavior" element={<BehaviorAnalytics />} />
          <Route path="symptom-rules" element={<SymptomRules />} />
          <Route path="marketing-templates" element={<MarketingTemplates />} />
          <Route path="self-stores" element={<SelfStores />} />
          <Route path="commission-guide" element={<CommissionGuide />} />
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
            <Route path="emotion-studio" element={<EmotionStudio />} />
            <Route path="emotion-funnel" element={<EmotionFunnel />} />
          </Route>

          {/* 兜底：未匹配路由 → 按角色跳转 */}
          <Route path="*" element={<RoleRouter />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
