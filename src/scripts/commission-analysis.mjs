// 分佣/段位逻辑量化诊断脚本（无网络依赖，纯本地计算）
// 复现新算法（2026-07-18 滚动段位 + 收敛比例 + 活跃/拓新门槛）：
//   段位 = 近6月滚动消费 决定（窗口外过期，躺平自动降级）
//   让利池 = 现金基数 × discountRate(0.09)；剩余池 = 让利池 × (1-0.10平台抽成)
//   佣金 = 剩余池 × 段位比例(L1/L2) × activeMult × recruitMult
//   activeMult：近30天有推荐成交=1；30~60天有=0.5；连续60天无=0
//   recruitMult：距上次拓新 ≤90天=1；>90天=0.4；从未拓新(NULL)=1
// 对比「现状」(终身累计段位 + 无门槛 + 旧比例0.60/0.25) 以证明躺平归零、活跃更高。

const OLD_RANK = [
  { rank: '无心境',   min: 20000, l1: 0.60, l2: 0.25 },
  { rank: '悟心',     min: 6000,  l1: 0.57, l2: 0.24 },
  { rank: '静心',     min: 2000,  l1: 0.54, l2: 0.22 },
  { rank: '明心',     min: 800,   l1: 0.50, l2: 0.20 },
  { rank: '初心',     min: 200,   l1: 0.45, l2: 0.18 },
  { rank: '凡心',     min: 0,     l1: 0.40, l2: 0.15 },
]
const NEW_RANK = [
  { rank: '无心境',   min: 20000, l1: 0.50, l2: 0.18 },
  { rank: '悟心',     min: 6000,  l1: 0.48, l2: 0.18 },
  { rank: '静心',     min: 2000,  l1: 0.46, l2: 0.18 },
  { rank: '明心',     min: 800,   l1: 0.44, l2: 0.17 },
  { rank: '初心',     min: 200,   l1: 0.42, l2: 0.16 },
  { rank: '凡心',     min: 0,     l1: 0.40, l2: 0.15 },
]
const MIN_PLATFORM = 0.10

function getRank(cons, table) {
  const sorted = [...table].sort((a, b) => a.min - b.min)
  let m = sorted[0]
  for (const r of sorted) if (cons >= r.min) m = r
  return m
}
function getActiveMultiplier(r30, r3060) {
  if (r30 > 0) return 1.0
  if (r3060 > 0) return 0.5
  return 0
}
function getRecruitMultiplier(days) {
  if (days == null) return 1.0
  if (days > 90) return 0.4
  return 1.0
}

// 现状：段位=终身累计消费；无活跃/拓新门槛；旧比例
function calcNow(orderAmount, discountRate, oldCons) {
  const pool = orderAmount * discountRate
  const remaining = pool * (1 - MIN_PLATFORM)
  const r = getRank(oldCons, OLD_RANK)
  const l1 = remaining * r.l1
  return { rank: r.rank, l1: +l1.toFixed(4) }
}

// 优化后：段位=近6月滚动消费；叠加 activeMult + recruitMult；新比例
function calcOpt(orderAmount, discountRate, rolling, r30, r3060, recruitDays) {
  const pool = orderAmount * discountRate
  const remaining = pool * (1 - MIN_PLATFORM)
  const r = getRank(rolling, NEW_RANK)
  const active = getActiveMultiplier(r30, r3060)
  const recruit = getRecruitMultiplier(recruitDays)
  const l1 = remaining * r.l1 * active * recruit
  return { rank: r.rank, active, recruit, l1: +l1.toFixed(4) }
}

const ORDER = 100, DR = 0.09
const pool = ORDER * DR
const remaining = +(pool * (1 - MIN_PLATFORM)).toFixed(4)
console.log(`= 订单 ¥${ORDER}，让利率 ${(DR*100)}%，让利池 ¥${pool}，剩余池(扣10%平台) ¥${remaining} =\n`)

const cases = [
  { name: 'A. 无心境躺平（终身20000，近6月0消费/0推荐成交/久未拓新）',
    now: calcNow(ORDER, DR, 20000),
    opt: calcOpt(ORDER, DR, 0, 0, 0, 200) },
  { name: 'B. 活跃凡心（终身200，近6月滚动1800=明心，近30天有推荐成交，近期拓新）',
    now: calcNow(ORDER, DR, 200),
    opt: calcOpt(ORDER, DR, 1800, 2, 0, 10) },
  { name: 'C. 悟心曾活跃现躺（终身6000，近3月0消费→滚动0，60天0推荐成交）',
    now: calcNow(ORDER, DR, 6000),
    opt: calcOpt(ORDER, DR, 0, 0, 0, 200) },
  { name: 'D. 无心境持续活跃（终身+滚动均20000，近30天有推荐成交，近期拓新）',
    now: calcNow(ORDER, DR, 20000),
    opt: calcOpt(ORDER, DR, 20000, 3, 0, 5) },
  { name: 'E. 无心境活跃但久未拓新（滚动20000，近30天有推荐成交，>90天未拓新）',
    now: calcNow(ORDER, DR, 20000),
    opt: calcOpt(ORDER, DR, 20000, 3, 0, 200) },
  { name: 'F. 新推广员首单（滚动0=凡心，当前单即推荐成交 active=1，从未拓新不惩罚）',
    now: calcNow(ORDER, DR, 0),
    opt: calcOpt(ORDER, DR, 0, 1, 0, null) },
]

for (const c of cases) {
  console.log(`【${c.name}】`)
  console.log(`  现状: 段位=${c.now.rank}  L1=¥${c.now.l1}  (终身段位·无门槛·旧比例0.60封顶)`)
  console.log(`  优化: 段位=${c.opt.rank}  activeMult=${c.opt.active}  recruitMult=${c.opt.recruit}  L1=¥${c.opt.l1}`)
  const diff = +(c.now.l1 - c.opt.l1).toFixed(4)
  const pct = c.now.l1 > 0 ? ((diff / c.now.l1) * 100).toFixed(0) + '%' : '-'
  console.log(`  → 该单躺平者少拿 ¥${diff}（${pct}）；优化后佣金 = 剩余池 × 滚动段位比例 × 活跃 × 拓新\n`)
}

console.log('结论：躺平高段位(无心境/悟心)从 ¥4.6~4.9 降到 ¥0；活跃用户按真实近6月消费拿 0.40~0.50 区间，公平且杜绝躺赚。')
