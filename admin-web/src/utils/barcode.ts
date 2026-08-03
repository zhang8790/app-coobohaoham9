/**
 * EAN-13 店内码工具（admin-web 独立副本，与小程序 src/utils/barcode.ts 同源）
 *
 * 店内码结构（13 位）： 2 + 门店前缀(6) + 店内序号(5) + 校验位(1)
 *   - 第 1 位固定 2（GS1「店内码」段，任意扫码枪可解）
 *   - 校验位 mod-10：前 12 位权重交替 1/3，算错部分扫码枪拒扫
 *
 * 校验位算法必须与 supabase/migrations/20260804_barcode_feature.sql 中的 fn_ean13_check 一致
 */

/** 计算 EAN-13 校验位（输入前 12 位数字，返回 0-9） */
export function computeEAN13CheckDigit(body12: string): number {
  if (!/^\d{12}$/.test(body12)) throw new Error('EAN13 主体须为 12 位数字')
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const d = body12.charCodeAt(i) - 48
    sum += i % 2 === 0 ? d * 1 : d * 3
  }
  return (10 - (sum % 10)) % 10
}

/** 校验完整 13 位 EAN-13 是否合法（长度 + 校验位） */
export function isValidEAN13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false
  const body = code.slice(0, 12)
  const check = code.charCodeAt(12) - 48
  return computeEAN13CheckDigit(body) === check
}

/** 店内码预览（不改库，仅前端示意）：给定门店前缀(6) + 序号，返回完整 13 位 */
export function previewStoreEAN13(storePrefix: string, seq: number): string {
  const p = String(storePrefix).padStart(6, '0').slice(0, 6)
  const s = String(Math.max(0, Math.floor(seq))).padStart(5, '0')
  const body = '2' + p + s
  return body + computeEAN13CheckDigit(body)
}

/** 归一化用户输入条码：去空格/连字符/全角，返回 null 表示空 */
export function normalizeBarcode(input: string | null | undefined): string | null {
  if (!input) return null
  const s = input.trim().replace(/[\s-]/g, '')
  return s || null
}

// ===== EAN-13 屏幕预览条空编码（用于 canvas / DOM 绘制人眼可见条码）=====
const L_CODE: Record<string, string> = {
  '0': '0001101', '1': '0011001', '2': '0010011', '3': '0111101', '4': '0100011',
  '5': '0110001', '6': '0101111', '7': '0111011', '8': '0110111', '9': '0001011',
}
const G_CODE: Record<string, string> = {
  '0': '0100111', '1': '0110011', '2': '0011011', '3': '0100001', '4': '0011101',
  '5': '0111001', '6': '0000101', '7': '0010001', '8': '0001001', '9': '0010111',
}
const R_CODE: Record<string, string> = {
  '0': '1110010', '1': '1100110', '2': '1101100', '3': '1000010', '4': '1011100',
  '5': '1001110', '6': '1010000', '7': '1000100', '8': '1001000', '9': '1110100',
}
const FIRST_PATTERN = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGGLG',
]

export interface EAN13EncodeResult {
  modules: string
  width: number
  humanReadable: string
}

/** 将合法 EAN-13 编码为条空模块串，供屏幕预览渲染 */
export function encodeEAN13(code: string): EAN13EncodeResult | null {
  if (!isValidEAN13(code)) return null
  const first = code[0]
  const left = code.slice(1, 7)
  const right = code.slice(7, 13)
  const pattern = FIRST_PATTERN[parseInt(first, 10)]

  let bars = '101'
  for (let i = 0; i < 6; i++) {
    bars += pattern[i] === 'L' ? L_CODE[left[i]] : G_CODE[left[i]]
  }
  bars += '01010'
  for (let i = 0; i < 6; i++) {
    bars += R_CODE[right[i]]
  }
  bars += '101'

  const full = '000000000' + bars + '000000000'
  return { modules: full, width: full.length, humanReadable: code }
}
