// =====================================================
// CSV 导出工具 · 财务对账刚需
//  - toCSV：对象数组 → CSV 字符串（字段内逗号/引号/换行自动转义）
//  - downloadCSV：带 UTF-8 BOM 触发浏览器下载，Excel 打开不乱码
// =====================================================

export interface CsvColumn {
  key: string
  label: string
}

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCSV(rows: Record<string, unknown>[], columns: CsvColumn[]): string {
  const head = columns.map(c => escapeCell(c.label)).join(',')
  const body = rows
    .map(r => columns.map(c => escapeCell(r[c.key])).join(','))
    .join('\n')
  return `${head}\n${body}`
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[], columns: CsvColumn[]) {
  const csv = '﻿' + toCSV(rows, columns) // BOM 让 Excel 正确识别 UTF-8
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function csvTimestamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}
