/**
 * supabase-mock.ts — 资金流集成测试用的「内存版 Supabase 客户端」
 *
 * 用途：给 money-flow Edge Function（create-order / refund-order …）的测试入口
 * `handleXxxOrder(req, { supabase: mock, getUser })` 注入一个不联网、不碰真实 DB 的
 * 内存实现，从而可在 CI（deno test）里跑「建单→退款」全链路断言。
 *
 * 设计原则：
 * - 链式 builder 复刻 supabase-js 常用调用形态（select/insert/update/delete + eq/in/gte + maybeSingle）。
 * - 所有表状态存在 `tables` 里，测试前后可读写断言。
 * - `functions.invoke` 记录调用次数与入参（不真正触发别的 EF），便于断言分佣被触发。
 * - 不做 RLS：测试默认以「服务端角色（service_role 等价）」运行，RLS 由真实部署保证；
 *   若需模拟「越权读不到」，可在测试里手动清表或断言返回 null。
 *
 * ⚠️ 这是测试工具，不是生产代码。禁止在 EF 里 import 本文件。
 */

export type MockRow = Record<string, any>

export interface MockTables {
  [table: string]: MockRow[]
}

let _seq = 0
function genId(prefix = 'id'): string {
  _seq += 1
  return `${prefix}_${Date.now().toString(36)}_${_seq}`
}

type Filter =
  | { type: 'eq'; col: string; val: any }
  | { type: 'in'; col: string; vals: any[] }
  | { type: 'gte'; col: string; val: any }

function rowMatches(row: MockRow, filters: Filter[]): boolean {
  for (const f of filters) {
    const cell = row[f.col]
    if (f.type === 'eq') {
      if (String(cell) !== String(f.val)) return false
    } else if (f.type === 'in') {
      if (!f.vals.map((v) => String(v)).includes(String(cell))) return false
    } else if (f.type === 'gte') {
      if (Number(cell) < Number(f.val)) return false
    }
  }
  return true
}

class QueryBuilder {
  private client: MockSupabaseClient
  private table: string
  private op: 'select' | 'insert' | 'update' | 'delete' | null = null
  private payload: any = null
  private filters: Filter[] = []
  private isSingle = false
  /** .select() 跟在 insert/update 后表示「返回受影响行」，与 op 互斥，单独记 */
  private returning = false

  constructor(client: MockSupabaseClient, table: string) {
    this.client = client
    this.table = table
  }

  select(_cols?: string): this {
    if (this.op == null) this.op = 'select'
    this.returning = true
    return this
  }

  insert(row: any): this {
    this.op = 'insert'
    this.payload = row
    return this
  }

  update(row: any): this {
    this.op = 'update'
    this.payload = row
    return this
  }

  delete(): this {
    this.op = 'delete'
    return this
  }

  eq(col: string, val: any): this {
    this.filters.push({ type: 'eq', col, val })
    return this
  }

  in(col: string, vals: any[]): this {
    this.filters.push({ type: 'in', col, vals })
    return this
  }

  gte(col: string, val: any): this {
    this.filters.push({ type: 'gte', col, val })
    return this
  }

  /** 终端：返回单条或 null */
  maybeSingle(): Promise<{ data: any; error: any }> {
    this.isSingle = true
    return this.exec()
  }

  /** 终端：同 maybeSingle（兼容 supabase-js） */
  single(): Promise<{ data: any; error: any }> {
    this.isSingle = true
    return this.exec()
  }

  /** thenable：让 `await builder`（无 maybeSingle 的 update/delete）也能执行 */
  then(resolve: (v: { data: any; error: any }) => void, reject?: (e: any) => void): Promise<void> {
    return this.exec().then(resolve, reject)
  }

  private exec(): Promise<{ data: any; error: any }> {
    const rows = this.client.tables[this.table] ?? (this.client.tables[this.table] = [])
    switch (this.op) {
      case 'select': {
        const res = rows.filter((r) => rowMatches(r, this.filters))
        return Promise.resolve({ data: this.isSingle ? (res[0] ?? null) : res, error: null })
      }
      case 'insert': {
        const row = Array.isArray(this.payload) ? this.payload[0] : this.payload
        const newRow: MockRow = { id: genId(this.table), ...row }
        this.client.tables[this.table] = rows.concat(newRow)
        if (this.isSingle) return Promise.resolve({ data: newRow, error: null })
        if (this.returning) return Promise.resolve({ data: [newRow], error: null })
        return Promise.resolve({ data: null, error: null })
      }
      case 'update': {
        for (const r of rows) {
          if (rowMatches(r, this.filters)) Object.assign(r, this.payload)
        }
        // 真实 PostgREST 不 .select() 时 data=null、error=null（0 行也不报错）
        return Promise.resolve({ data: null, error: null })
      }
      case 'delete': {
        this.client.tables[this.table] = rows.filter((r) => !rowMatches(r, this.filters))
        return Promise.resolve({ data: null, error: null })
      }
      default:
        return Promise.resolve({ data: null, error: null })
    }
  }
}

export class MockSupabaseClient {
  tables: MockTables
  /** 记录 functions.invoke 的调用：name -> 入参 body 列表 */
  functionInvocations: Record<string, any[]> = {}

  constructor(initial?: MockTables) {
    this.tables = initial ?? {}
  }

  from(table: string): QueryBuilder {
    return new QueryBuilder(this, table)
  }

  functions = {
    invoke: (name: string, opts?: { body?: any }) => {
      this.functionInvocations[name] = this.functionInvocations[name] ?? []
      this.functionInvocations[name].push(opts?.body ?? null)
      return Promise.resolve({ data: null, error: null })
    },
  }

  /** 测试辅助：清空某表 */
  reset(table?: string) {
    if (table) this.tables[table] = []
    else this.tables = {}
  }
}

/**
 * 预置一份「基础世界」：用户、商品目录价、门店让利率、空流水表。
 * 测试可按需覆盖 products 的 price / discount_rate、profiles 的 tb_balance。
 */
export function seedBasic(
  opts?: {
    userId?: string
    tbBalance?: number
    products?: Array<{ id: string; price: number; discount_rate?: number }>
    stores?: Array<{ id: string; referral_rate?: number; referral_rate_enabled?: boolean }>
  },
): MockSupabaseClient {
  const userId = opts?.userId ?? 'U1'
  const products = opts?.products ?? [
    { id: 'p1', price: 10, discount_rate: 9 },
    { id: 'p2', price: 20, discount_rate: 9 },
  ]
  const stores = opts?.stores ?? [{ id: 's1', referral_rate: 0.09, referral_rate_enabled: true }]
  return new MockSupabaseClient({
    profiles: [
      { id: userId, tb_balance: opts?.tbBalance ?? 0, points: 0, commission_balance: 0 },
    ],
    products: products.map((p) => ({ id: p.id, price: p.price, discount_rate: p.discount_rate ?? 0 })),
    stores: stores.map((s) => ({ id: s.id, referral_rate: s.referral_rate ?? 0.09, referral_rate_enabled: s.referral_rate_enabled ?? true })),
    orders: [],
    order_items: [],
    refunds: [],
    commissions: [],
    points_logs: [],
    tongbao_logs: [],
    order_item_commissions: [],
  })
}
