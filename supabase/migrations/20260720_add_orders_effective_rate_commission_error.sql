-- 20260720 新增 orders.effective_rate / commission_error 列
-- effective_rate：整单加权让利率（小数口径），按 order_items 商品 discount_rate 金额加权后落库，便于前端展示与分佣追溯
-- commission_error：分佣触发（distribute-commission）失败时的错误原因，便于自动补跑脚本扫描未发佣订单
-- 依赖：00003/00018/00019/00021/00023/00027/00108 已存在 commission_distributed 列

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS effective_rate numeric NULL,
  ADD COLUMN IF NOT EXISTS commission_error text NULL;

COMMENT ON COLUMN public.orders.effective_rate IS '整单加权让利率（小数口径，0.09=9%），按 order_items 商品 discount_rate 金额加权，落库便于展示与追溯';
COMMENT ON COLUMN public.orders.commission_error IS '分佣触发失败时的错误原因；commission_distributed=false 且本列非空 = 待补跑';
