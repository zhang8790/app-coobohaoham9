// @title 商家后台 - 云打印机配置 / 打印调用
import { supabase } from '@/lib/supabase'

export interface PrinterConfig {
  id: string
  store_id: string
  provider: 'feie' | 'yilianyun' | '365'
  device_sn: string
  api_user: string | null
  api_key: string | null
  printer_key: string | null
  enabled: boolean
  auto_print_on_paid: boolean
  print_count: number
  last_print_at: string | null
  created_at: string
  updated_at: string
}

export async function getPrinterConfig(storeId: string): Promise<PrinterConfig | null> {
  const { data, error } = await supabase
    .from('printer_configs')
    .select('*')
    .eq('store_id', storeId)
    .limit(1)
    .maybeSingle()
  if (error) { console.error('[getPrinterConfig]', error); return null }
  return (data as PrinterConfig) ?? null
}

export async function upsertPrinterConfig(
  cfg: Partial<PrinterConfig> & { store_id: string; device_sn: string },
): Promise<boolean> {
  const { error } = await supabase
    .from('printer_configs')
    .upsert(cfg, { onConflict: 'store_id,device_sn' })
  if (error) { console.error('[upsertPrinterConfig]', error); return false }
  return true
}

export async function callPrintReceipt(opts: {
  orderId?: string
  storeId?: string
  test: boolean
}): Promise<{ success: boolean; error?: string; message?: string; need_config?: boolean }> {
  const body: Record<string, any> = opts.test
    ? { test: true, store_id: opts.storeId }
    : { order_id: opts.orderId }
  const { data, error } = await supabase.functions.invoke('print-receipt', { body })
  if (error) return { success: false, error: error.message }
  return (data ?? {}) as { success: boolean; error?: string; message?: string; need_config?: boolean }
}
