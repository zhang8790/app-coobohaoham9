import { View, Text } from '@tarojs/components'
// @title 段位规则
import Taro from '@tarojs/taro'

// 段位数据（与 src/utils/commission-calculator-v5.ts 中 RANK_CONFIG_TABLE_V5 保持一致）
const RANK_TABLE = [
  { rank: '掌门', score: '≥ 20,000', l1: '60%', l2: '25%', pts: '15%', color: '#D4AF37' },
  { rank: '长老', score: '≥ 6,000', l1: '57%', l2: '24%', pts: '15%', color: '#9CA3AF' },
  { rank: '核心弟子', score: '≥ 2,000', l1: '54%', l2: '22%', pts: '14%', color: '#CD7F32' },
  { rank: '内门弟子', score: '≥ 800', l1: '50%', l2: '20%', pts: '13%', color: '#4A90D9' },
  { rank: '外门弟子', score: '≥ 200', l1: '45%', l2: '18%', pts: '12%', color: '#50C878' },
  { rank: '江湖散修', score: '≥ 0', l1: '40%', l2: '15%', pts: '10%', color: '#90EE90' },
]

function RankRules() {
  return (
    <View className="min-h-screen bg-background pb-10">
      <View className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4" style={{ fontSize: '13px', lineHeight: '2', color: '#9CA3AF' }}>
        <Text style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 700, marginBottom: 12, lineHeight: 1.5 }}>来店有喜段位规则</Text>
        <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>最近更新日期：2026年7月1日<br/>生效日期：2026年7月1日</Text>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>一、段位体系</Text>
          <Text>平台共设六大段位，由低到高依次为：江湖散修 → 外门弟子 → 内门弟子 → 核心弟子 → 长老 → 掌门。段位越高，推广佣金比例越大。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 8 }}>二、段位与权益对照表</Text>
          <View style={{ border: '1px solid #1F2937', borderRadius: 12, overflow: 'hidden' }}>
            {/* 表头 */}
            <View style={{ flexDirection: 'row', backgroundColor: '#1F2937', paddingVertical: 8 }}>
              <Text style={{ flex: 1.2, color: '#E5E7EB', fontSize: 11, textAlign: 'center', fontWeight: 600 }}>段位</Text>
              <Text style={{ flex: 1.3, color: '#E5E7EB', fontSize: 11, textAlign: 'center', fontWeight: 600 }}>动态分数</Text>
              <Text style={{ flex: 1, color: '#E5E7EB', fontSize: 11, textAlign: 'center', fontWeight: 600 }}>L1</Text>
              <Text style={{ flex: 1, color: '#E5E7EB', fontSize: 11, textAlign: 'center', fontWeight: 600 }}>L2</Text>
              <Text style={{ flex: 1, color: '#E5E7EB', fontSize: 11, textAlign: 'center', fontWeight: 600 }}>积分</Text>
            </View>
            {RANK_TABLE.map((r, i) => (
              <View key={r.rank} style={{ flexDirection: 'row', paddingVertical: 8, borderTop: i === 0 ? 'none' : '1px solid #1F2937', backgroundColor: i % 2 === 0 ? '#111827' : 'transparent' }}>
                <Text style={{ flex: 1.2, color: r.color, fontSize: 11, textAlign: 'center', fontWeight: 700 }}>{r.rank}</Text>
                <Text style={{ flex: 1.3, color: '#D1D5DB', fontSize: 11, textAlign: 'center' }}>{r.score}</Text>
                <Text style={{ flex: 1, color: '#D1D5DB', fontSize: 11, textAlign: 'center' }}>{r.l1}</Text>
                <Text style={{ flex: 1, color: '#D1D5DB', fontSize: 11, textAlign: 'center' }}>{r.l2}</Text>
                <Text style={{ flex: 1, color: '#D1D5DB', fontSize: 11, textAlign: 'center' }}>{r.pts}</Text>
              </View>
            ))}
          </View>
          <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 6 }}>L1/L2 为佣金比例，积分比例为消费可得积分占让利池的比例。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>三、段位判定公式</Text>
          <Text>动态分数 = 个人累计消费（元）</Text>
          <Text>段位完全由个人累计消费决定，达到对应档位阈值即自动晋升，分数越高佣金比例越大。</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>四、晋升与维持</Text>
          <Text>1. 段位随动态分数实时变动，晋升后永久享受对应佣金比例（除非触发风控）。</Text>
          <Text>2. 保持拓新与消费可维持段位；长期不活跃可能导致佣金衰减。</Text>
          <Text>3. 段位相关权益以推广中心实时展示为准。</Text>
        </View>

        <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 20, borderTop: '1px solid #1F2937', paddingTop: 12 }}>
          本规则与《佣金规则》配套使用，最终解释权归来店有喜平台所有。
        </Text>
      </View>
    </View>
  )
}

export default RankRules
