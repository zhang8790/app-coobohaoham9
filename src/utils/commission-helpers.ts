/**
 * V4分佣算法 - 支付成功后更新用户数据
 * 
 * 功能：
 * 1. 更新用户当月消费（monthly_consumption）
 * 2. 更新用户累计消费（total_consumption）
 * 3. 重置连续零消费月数（consecutive_zero_months = 0）
 * 4. 更新团队月度GMV（team_monthly_gmv）- 需要递归更新上线
 * 5. 更新团队业绩（team_performance）- 需要递归更新上线
 */

import { supabase } from '@/client/supabase'
import type { Profile } from '@/db/types'

/**
 * 支付成功后更新用户消费数据
 * 
 * @param userId 用户ID
 * @param orderAmount 订单金额
 */
export async function updateUserConsumptionAfterPayment(
  userId: string,
  orderAmount: number
): Promise<void> {
  try {
    // 1. 获取用户当前数据
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    
    if (error || !profile) {
      console.error('[V4] 获取用户资料失败', error)
      return
    }
    
    // 2. 更新消费数据
    const updates: Partial<Profile> = {
      // 当月消费累加
      monthly_consumption: (profile.monthly_consumption || 0) + orderAmount,
      // 累计消费累加
      total_consumption: (profile.total_consumption || 0) + orderAmount,
      // 重置连续零消费月数
      consecutive_zero_months: 0,
    }
    
    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
    
    if (updateError) {
      console.error('[V4] 更新用户消费数据失败', updateError)
      return
    }
    
    console.log('[V4] 更新用户消费数据成功', {
      userId,
      orderAmount,
      monthly_consumption: updates.monthly_consumption,
      total_consumption: updates.total_consumption,
    })
    
    // 3. 递归更新上线们的团队月度GMV和团队业绩
    await updateReferrersTeamPerformance(profile.referrer_id, orderAmount)
    
  } catch (err) {
    console.error('[V4] 更新用户消费数据异常', err)
  }
}

/**
 * 递归更新上线们的团队月度GMV和团队业绩
 * 
 * @param referrerId 直接推荐人ID
 * @param orderAmount 订单金额
 * @param level 递归层级（1=L1, 2=L2）
 */
async function updateReferrersTeamPerformance(
  referrerId: string | null,
  orderAmount: number,
  level: number = 1
): Promise<void> {
  // 最多递归2层（L1和L2）
  if (!referrerId || level > 2) {
    return
  }
  
  try {
    // 1. 获取推荐人资料
    const { data: referrer, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', referrerId)
      .single()
    
    if (error || !referrer) {
      console.error('[V4] 获取推荐人资料失败', error)
      return
    }
    
    // 2. 更新推荐人团队数据
    const updates: Partial<Profile> = {}
    
    // 更新团队月度GMV（直接下线消费全额计入，间接下线消费全额计入）
    updates.team_monthly_gmv = (referrer.team_monthly_gmv || 0) + orderAmount
    
    // 更新团队业绩（L1全额，L2打5折）
    const performanceWeight = level === 1 ? 1.0 : 0.5
    updates.team_performance = (referrer.team_performance || 0) + orderAmount * performanceWeight
    
    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', referrerId)
    
    if (updateError) {
      console.error('[V4] 更新推荐人团队数据失败', updateError)
      return
    }
    
    console.log('[V4] 更新推荐人团队数据成功', {
      referrerId,
      level,
      orderAmount,
      team_monthly_gmv: updates.team_monthly_gmv,
      team_performance: updates.team_performance,
    })
    
    // 3. 递归更新上线（L2的上线是L1的推荐人）
    await updateReferrersTeamPerformance(referrer.referrer_id, orderAmount, level + 1)
    
  } catch (err) {
    console.error('[V4] 更新推荐人团队数据异常', err)
  }
}

/**
 * 新增下线时更新拓新状态
 * 
 * @param referrerId 推荐人ID
 */
export async function updateReferrerRecruitmentStatus(
  referrerId: string
): Promise<void> {
  try {
    const updates = {
      has_new_recruit: true,
      months_since_last_recruit: 0,
    }
    
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', referrerId)
    
    if (error) {
      console.error('[V4] 更新推荐人拓新状态失败', error)
      return
    }
    
    console.log('[V4] 更新推荐人拓新状态成功', { referrerId })
    
  } catch (err) {
    console.error('[V4] 更新推荐人拓新状态异常', err)
  }
}

/**
 * 每月1号重置统计（需要在定时任务或云函数中调用）
 * 
 * 功能：
 * 1. 重置 monthly_consumption = 0
 * 2. 更新 consecutive_zero_months（如果上月为零消费，则+1）
 * 3. 重置 team_monthly_gmv = 0
 * 4. 更新 months_since_last_recruit += 1
 * 5. 重置 has_new_recruit = false
 */
export async function resetMonthlyStats(): Promise<void> {
  try {
    // 注意：这个函数在应用层实现，因为需要复杂的逻辑判断
    // 这里提供一个参考实现，实际可能需要用云函数或定时任务
    
    console.log('[V4] 开始重置月度统计...')
    
    // 1. 获取所有用户
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, monthly_consumption, consecutive_zero_months, months_since_last_recruit')
    
    if (error || !profiles) {
      console.error('[V4] 获取用户列表失败', error)
      return
    }
    
    // 2. 逐个更新
    for (const profile of profiles) {
      const updates: Partial<Profile> = {
        // 重置当月消费
        monthly_consumption: 0,
        
        // 更新连续零消费月数
        consecutive_zero_months: (profile.consecutive_zero_months || 0) + 1,
        
        // 重置团队月度GMV
        team_monthly_gmv: 0,
        
        // 更新距离上次拓新月数
        months_since_last_recruit: (profile.months_since_last_recruit || 0) + 1,
        
        // 重置当月新增下线标记
        has_new_recruit: false,
      }
      
      // 如果上月有消费，则重置连续零消费月数
      if ((profile.monthly_consumption || 0) > 0) {
        updates.consecutive_zero_months = 0
      }
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile.id)
      
      if (updateError) {
        console.error('[V4] 重置用户统计失败', profile.id, updateError)
      }
    }
    
    console.log('[V4] 重置月度统计完成，共处理', profiles.length, '用户')
    
  } catch (err) {
    console.error('[V4] 重置月度统计异常', err)
  }
}

/**
 * Mock版本：更新用户消费数据（本地测试用）
 */
export async function updateUserConsumptionAfterPaymentMock(
  userId: string,
  orderAmount: number
): Promise<void> {
  try {
    // 从本地存储读取用户数据
    const raw = localStorage.getItem('mock_store_data')
    if (!raw) return
    
    const store = JSON.parse(raw)
    const profiles = store.profiles || []
    
    // 找到用户
    const userIndex = profiles.findIndex((p: any) => p.id === userId)
    if (userIndex === -1) return
    
    const profile = profiles[userIndex]
    
    // 更新消费数据
    profile.monthly_consumption = (profile.monthly_consumption || 0) + orderAmount
    profile.total_consumption = (profile.total_consumption || 0) + orderAmount
    profile.consecutive_zero_months = 0
    
    // 保存
    store.profiles = profiles
    localStorage.setItem('mock_store_data', JSON.stringify(store))
    
    console.log('[V4 Mock] 更新用户消费数据成功', {
      userId,
      monthly_consumption: profile.monthly_consumption,
      total_consumption: profile.total_consumption,
    })
    
    // 递归更新上线
    if (profile.referrer_id) {
      await updateReferrersTeamPerformanceMock(profile.referrer_id, orderAmount, 1, store)
    }
    
  } catch (err) {
    console.error('[V4 Mock] 更新用户消费数据异常', err)
  }
}

/**
 * Mock版本：递归更新上线团队数据
 */
async function updateReferrersTeamPerformanceMock(
  referrerId: string,
  orderAmount: number,
  level: number,
  store: any
): Promise<void> {
  if (!referrerId || level > 2) return
  
  const profiles = store.profiles || []
  const referrerIndex = profiles.findIndex((p: any) => p.id === referrerId)
  if (referrerIndex === -1) return
  
  const referrer = profiles[referrerIndex]
  
  // 更新团队数据
  referrer.team_monthly_gmv = (referrer.team_monthly_gmv || 0) + orderAmount
  const performanceWeight = level === 1 ? 1.0 : 0.5
  referrer.team_performance = (referrer.team_performance || 0) + orderAmount * performanceWeight
  
  console.log('[V4 Mock] 更新推荐人团队数据成功', {
    referrerId,
    level,
    team_monthly_gmv: referrer.team_monthly_gmv,
    team_performance: referrer.team_performance,
  })
  
  // 递归更新上线
  if (referrer.referrer_id) {
    await updateReferrersTeamPerformanceMock(referrer.referrer_id, orderAmount, level + 1, store)
  }
  
  // 保存
  store.profiles = profiles
  localStorage.setItem('mock_store_data', JSON.stringify(store))
}
