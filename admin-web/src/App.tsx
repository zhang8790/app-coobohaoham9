import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { StoreProvider } from '@/contexts/StoreContext'
import Layout from '@/components/Layout'
import MerchantLayout from '@/components/MerchantLayout'
import Login from '@/pages/Login'

/**
 * 页面全部改为路由级懒加载（React.lazy）。
 *
 * 背景：此前 41 个页面全是静态 import，vite 只能打出一个 ~986KB 的单包，
 * 且首屏（登录页）必须把「订单/财务/商品/配料库」等所有后台页面一起下载解析。
 * 改为按路由分割后，首屏只需 入口 + Layout + Login + 共享 vendor，
 * 其余页面在导航到对应路由时才拉取（配合 nginx 30d 强缓存 + gzip，二次访问近乎零开销）。
 *
 * 注意：
 * - Login 保持同步加载 —— 未登录用户的第一屏就是它，做成异步反而多一次往返。
 * - Layout / MerchantLayout 同样保持同步：它们是所有已登录路由的公共外壳，本来就在首包。
 * - 分割后每个页面独立 chunk，加载失败由 main.tsx 的 ErrorBoundary 兜底（已带「重新加载」按钮）。
 */

// ===== 总后台（admin 专属）=====
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Merchants = lazy(() => import('@/pages/Merchants'))
const Products = lazy(() => import('@/pages/Products'))
const Withdrawals = lazy(() => import('@/pages/Withdrawals'))
const Users = lazy(() => import('@/pages/Users'))
const Refunds = lazy(() => import('@/pages/Refunds'))
const Announcements = lazy(() => import('@/pages/Announcements'))
const FinanceDashboard = lazy(() => import('@/pages/FinanceDashboard'))
const Members = lazy(() => import('@/pages/Members'))
const Orders = lazy(() => import('@/pages/Orders'))
const Ledgers = lazy(() => import('@/pages/Ledgers'))
const MerchantSettlements = lazy(() => import('@/pages/MerchantSettlements'))
const BehaviorAnalytics = lazy(() => import('@/pages/BehaviorAnalytics'))
const SymptomRules = lazy(() => import('@/pages/SymptomRules'))
const SelfStores = lazy(() => import('@/pages/SelfStores'))
const CommissionGuide = lazy(() => import('@/pages/CommissionGuide'))
const Categories = lazy(() => import('@/pages/Categories'))
const Risk = lazy(() => import('@/pages/Risk'))
const Settings = lazy(() => import('@/pages/Settings'))
const Expiry = lazy(() => import('@/pages/Expiry'))
const FoodSafetyLibs = lazy(() => import('@/pages/FoodSafetyLibs'))
const FoodIngredients = lazy(() => import('@/pages/FoodIngredients'))
const FoodTagRules = lazy(() => import('@/pages/FoodTagRules'))
const OcrDebug = lazy(() => import('@/pages/OcrDebug'))
const HomeBranding = lazy(() => import('@/pages/HomeBranding'))
const HomeAds = lazy(() => import('@/pages/HomeAds'))

// ===== 自营门店管理后台（merchant 专属）=====
const MerchantDashboard = lazy(() => import('@/pages/merchant/Index'))
const MerchantProducts = lazy(() => import('@/pages/merchant/Products'))
const MerchantOrders = lazy(() => import('@/pages/merchant/Orders'))
const MerchantCoupons = lazy(() => import('@/pages/merchant/Coupons'))
const MerchantAnalytics = lazy(() => import('@/pages/merchant/Analytics'))
const MerchantAds = lazy(() => import('@/pages/merchant/Ads'))
const MerchantMessages = lazy(() => import('@/pages/merchant/Messages'))
const MerchantWithdraw = lazy(() => import('@/pages/merchant/Withdraw'))
const MerchantMembers = lazy(() => import('@/pages/merchant/Members'))
const MerchantSettings = lazy(() => import('@/pages/merchant/Settings'))
const MerchantVehicles = lazy(() => import('@/pages/merchant/Vehicles'))
const MerchantStaffInvites = lazy(() => import('@/pages/merchant/StaffInvites'))
const MerchantPrinters = lazy(() => import('@/pages/merchant/Printers'))
const MerchantBarcodeMaker = lazy(() => import('@/pages/merchant/BarcodeMaker'))

// ============ 路由守卫 ============

/** 全屏加载占位（路由切换 / chunk 拉取中） */
function PageLoading() {
  return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
      加载中...
    </div>
  )
}

/** 整屏加载占位（鉴权阶段，此时外层布局还没渲染） */
function FullScreenLoading() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 16 }}>加载中...</div>
    </div>
  )
}

/**
 * 已登录 + 角色校验
 * - requireAdmin: 仅允许 admin，其余跳转 /merchant
 * - requireMerchant: 仅允许 merchant，其余跳转 /dashboard
 * - 无 requireXxx: 任意已登录角色均可访问
 */
// 判断是否有自营门店权限（role=merchant 或 merchant_status=approved）
const isMerchantUser = (profile: any): boolean => {
  if (!profile) return false
  return profile.role === 'merchant' || profile.merchant_status === 'approved'
}

function RequireAuth({ children, requireAdmin = false, requireMerchant = false }: {
  children: ReactNode
  requireAdmin?: boolean
  requireMerchant?: boolean
}) {
  const { profile, loading } = useAuth()

  if (loading) return <FullScreenLoading />
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
  if (loading) return <FullScreenLoading />
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
        <Suspense fallback={<PageLoading />}>
          <Routes>
            {/* 登录页：保持同步加载（未登录用户的第一屏） */}
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
              <Route path="users" element={<Users />} />
              <Route path="refunds" element={<Refunds />} />
              <Route path="announcements" element={<Announcements />} />
              <Route path="finance" element={<FinanceDashboard />} />
              <Route path="members" element={<Members />} />
              <Route path="orders" element={<Orders />} />
              <Route path="ledgers" element={<Ledgers />} />
              <Route path="merchant-settlements" element={<MerchantSettlements />} />
              <Route path="behavior" element={<BehaviorAnalytics />} />
              <Route path="symptom-rules" element={<SymptomRules />} />
              <Route path="self-stores" element={<SelfStores />} />
              <Route path="commission-guide" element={<CommissionGuide />} />
              <Route path="categories" element={<Categories />} />
              <Route path="expiry" element={<Expiry />} />
              <Route path="food-safety-libs" element={<FoodSafetyLibs />} />
              <Route path="food-ingredients" element={<FoodIngredients />} />
              <Route path="food-tag-rules" element={<FoodTagRules />} />
              <Route path="ocr-debug" element={<OcrDebug />} />
              <Route path="home-branding" element={<HomeBranding />} />
              <Route path="home-ads" element={<HomeAds />} />
              <Route path="risk" element={<Risk />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            {/* ===== 自营门店管理后台（merchant 专属）===== */}
            {/* StoreProvider 包裹：让门店切换器 + 所有 merchant 页面共享「当前所选门店」 */}
            <Route path="/merchant" element={<RequireAuth requireMerchant><StoreProvider><MerchantLayout /></StoreProvider></RequireAuth>}>
              <Route index element={<MerchantDashboard />} />
              <Route path="products" element={<MerchantProducts />} />
              <Route path="orders" element={<MerchantOrders />} />
              <Route path="coupons" element={<MerchantCoupons />} />
              <Route path="analytics" element={<MerchantAnalytics />} />
              <Route path="ads" element={<MerchantAds />} />
              <Route path="messages" element={<MerchantMessages />} />
              <Route path="withdraw" element={<MerchantWithdraw />} />
              <Route path="members" element={<MerchantMembers />} />
              <Route path="settings" element={<MerchantSettings />} />
              <Route path="vehicles" element={<MerchantVehicles />} />
              <Route path="staff" element={<MerchantStaffInvites />} />
              <Route path="printers" element={<MerchantPrinters />} />
              <Route path="barcode-maker" element={<MerchantBarcodeMaker />} />
            </Route>

            {/* 兜底：未匹配路由 → 按角色跳转 */}
            <Route path="*" element={<RoleRouter />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
