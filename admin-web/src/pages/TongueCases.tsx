// 来店有喜 · 管理后台「舌象案例库 · 检索」
// 数据来源：tongue_cases（迁移 00227；平台自建去标识参考语料，见小程序
// src/db/tongue-cases.ts 与 utils/food-therapy/tongue-compliance.ts）。
// 本页为只读检索（按体质 / 分级 / 特征 / 关键词组合筛选），不提供直接编辑：
// 案例入库须过合规守门（validateTongueCaseText），写入由种子生成器或受控后台完成，
// 避免越界文案流入库。
import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { withTimeout } from '@/utils/withTimeout'

type Band = 'low' | 'mid' | 'high'

interface TongueCaseRow {
  case_no: string
  source: 'engine' | 'expert'
  features: Record<string, string>
  answers: number[]
  constitution_primary: string
  constitution_secondary: string | null
  health_index: number
  band: Band
  confidence: number
  tags: string[]
  expert_note: string | null
  created_at: string
}

const CONSTITUTIONS: { key: string; name: string }[] = [
  { key: 'pinghe', name: '平和' },
  { key: 'yangxu', name: '阳虚' },
  { key: 'yinxu', name: '阴虚' },
  { key: 'qixu', name: '气虚' },
  { key: 'tanshi', name: '痰湿' },
  { key: 'shire', name: '湿热' },
  { key: 'xueyu', name: '血瘀' },
]
const CONST_MAP: Record<string, string> = Object.fromEntries(CONSTITUTIONS.map((c) => [c.key, c.name]))
const BANDS: { key: Band; name: string; color: string }[] = [
  { key: 'low', name: '低风险', color: '#15803D' },
  { key: 'mid', name: '中等风险', color: '#B45309' },
  { key: 'high', name: '偏高风险', color: '#DC2626' },
]
const BAND_MAP: Record<string, { name: string; color: string }> = Object.fromEntries(
  BANDS.map((b) => [b.key, { name: b.name, color: b.color }]),
)
const DIMS: { key: string; name: string }[] = [
  { key: 'area', name: '舌体形态' },
  { key: 'color', name: '舌质颜色' },
  { key: 'coat_color', name: '舌苔颜色' },
  { key: 'coat_texture', name: '舌苔厚薄' },
  { key: 'teeth', name: '齿痕' },
  { key: 'crack', name: '裂纹' },
  { key: 'moist', name: '润燥' },
  { key: 'sublingual', name: '舌下络脉' },
]

const th: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  color: 'var(--text-dim)',
  fontSize: 12,
  fontWeight: 600,
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}
const td: CSSProperties = {
  padding: '10px 12px',
  color: 'var(--text)',
  fontSize: 13,
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'top',
}
const inputStyle: CSSProperties = {
  padding: '7px 9px',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  fontSize: 13,
  boxSizing: 'border-box',
}

function isInformative(v: string | undefined): boolean {
  return !!v && !v.includes('（常见）')
}

export default function TongueCases() {
  const [all, setAll] = useState<TongueCaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [constFilter, setConstFilter] = useState('')
  const [bandFilter, setBandFilter] = useState('')
  const [dimFilter, setDimFilter] = useState('')
  const [keyword, setKeyword] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = (await withTimeout(
        () => supabase.from('tongue_cases').select('*').order('case_no'),
        12000,
        '舌象案例库',
      )) as any
      if (err) throw err
      setAll((data as TongueCaseRow[]) ?? [])
    } catch (e: any) {
      setError(e?.message || '加载失败')
      setAll([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return all.filter((c) => {
      if (constFilter && c.constitution_primary !== constFilter && c.constitution_secondary !== constFilter)
        return false
      if (bandFilter && c.band !== bandFilter) return false
      if (dimFilter && !isInformative(c.features?.[dimFilter])) return false
      if (kw) {
        const hay = [c.case_no, ...(c.tags || []), c.expert_note || ''].join(' ').toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
  }, [all, constFilter, bandFilter, dimFilter, keyword])

  const reset = () => {
    setConstFilter('')
    setBandFilter('')
    setDimFilter('')
    setKeyword('')
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, margin: 0 }}>舌象案例库 · 检索</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '4px 0 0' }}>
            平台自建去标识参考语料（望舌辨证引擎同源），仅供检索与运营参考，不存个人可识别信息
          </p>
        </div>
        <button
          onClick={load}
          style={{
            padding: '8px 16px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          刷新
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--danger-soft, #FEE2E2)',
            border: '1px solid var(--danger, #DC2626)',
            borderRadius: 8,
            color: 'var(--danger-strong, #B91C1C)',
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {error}（已停止无限等待，请检查网络后点击「刷新」重试）
        </div>
      )}

      {/* 筛选栏 */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <Filter label="体质（主 / 兼）">
          <select style={{ ...inputStyle, minWidth: 140 }} value={constFilter} onChange={(e) => setConstFilter(e.target.value)}>
            <option value="">全部</option>
            {CONSTITUTIONS.map((c) => (
              <option key={c.key} value={c.key}>{c.name}</option>
            ))}
          </select>
        </Filter>
        <Filter label="风险分级">
          <select style={{ ...inputStyle, minWidth: 130 }} value={bandFilter} onChange={(e) => setBandFilter(e.target.value)}>
            <option value="">全部</option>
            {BANDS.map((b) => (
              <option key={b.key} value={b.key}>{b.name}</option>
            ))}
          </select>
        </Filter>
        <Filter label="特征（有指向性）">
          <select style={{ ...inputStyle, minWidth: 140 }} value={dimFilter} onChange={(e) => setDimFilter(e.target.value)}>
            <option value="">全部维度</option>
            {DIMS.map((d) => (
              <option key={d.key} value={d.key}>{d.name}</option>
            ))}
          </select>
        </Filter>
        <Filter label="关键词（编号 / 标签 / 备注）">
          <input
            style={{ ...inputStyle, minWidth: 220 }}
            placeholder="如：舌红 / 血瘀 / TC-0011"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </Filter>
        <button
          onClick={reset}
          style={{
            padding: '7px 14px',
            background: 'var(--surface-2, #F1EDE4)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          重置
        </button>
        <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: 13 }}>
          共 {filtered.length} / {all.length} 条
        </span>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-dim)', padding: 24 }}>加载中…</p>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['编号', '来源', '主体质', '兼体质', '健康指数', '分级', '置信度', '标签', '专家备注'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
                    暂无匹配案例
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const bm = BAND_MAP[c.band] || { name: c.band, color: 'var(--text)' }
                  return (
                    <tr key={c.case_no}>
                      <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{c.case_no}</td>
                      <td style={td}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {c.source === 'expert' ? '专家订正' : '引擎识别'}
                        </span>
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{CONST_MAP[c.constitution_primary] || c.constitution_primary}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {c.constitution_secondary ? CONST_MAP[c.constitution_secondary] || c.constitution_secondary : '—'}
                      </td>
                      <td style={{ ...td, fontWeight: 700 }}>{Number(c.health_index).toFixed(1)}</td>
                      <td style={td}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 600,
                            color: bm.color,
                            background: `${bm.color}1A`,
                          }}
                        >
                          {bm.name}
                        </span>
                      </td>
                      <td style={td}>{Number(c.confidence).toFixed(2)}</td>
                      <td style={{ ...td, maxWidth: 260 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(c.tags || []).map((t, i) => (
                            <span
                              key={i}
                              style={{
                                padding: '1px 7px',
                                borderRadius: 6,
                                fontSize: 11,
                                background: 'var(--bg)',
                                color: 'var(--text-muted)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ ...td, color: 'var(--text-dim)', maxWidth: 280 }}>{c.expert_note || '—'}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 12, marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  )
}
