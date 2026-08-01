-- =====================================================================
-- 00134 · 防分佣双发幂等：commissions 加 (order_id, level, beneficiary_id) 唯一约束
--
-- 问题：distribute-commission 仅用 orders.commission_distributed 入口标记防重复，
--       但 commissions 是 plain INSERT 且该表**无唯一约束**；若函数在
--       「写入佣金行之后 / 标记 commission_distributed 之前」崩溃或云函数超时，
--       微信支付回调重试会重新执行 → 重复插入佣金行 + 重复发放余额
--       (tb_balance / commission_balance) = 资损。
--       对比 order_item_commissions 已有 UNIQUE(order_item_id) + upsert 幂等，
--       订单级 commissions 反而漏了，属于防护不一致。
--
-- 修复：① 先清理历史可能的重复行（按 订单+层级+受益人 分组，保留最早一行）；
--       ② 加唯一约束；③ 代码侧 00134 配套的 distribute-commission 将 insert 改为
--          upsert(onConflict:'order_id,level,beneficiary_id', ignoreDuplicates:true)，
--          形成「入口标记 + 唯一约束」双保险，重试也绝不双发。
-- =====================================================================

-- 1) 查重（先确认是否存在重复；有重复才会删除，无重复则 no-op）
DO $$
DECLARE
  v_dup_groups int;
BEGIN
  SELECT COUNT(*) INTO v_dup_groups
  FROM (
    SELECT order_id, level, beneficiary_id
    FROM public.commissions
    GROUP BY order_id, level, beneficiary_id
    HAVING COUNT(*) > 1
  ) d;
  IF v_dup_groups > 0 THEN
    RAISE NOTICE '[00134] 发现 % 组重复佣金行，开始清理（保留每组最小 id）', v_dup_groups;
  ELSE
    RAISE NOTICE '[00134] 未发现重复佣金行，无需清理';
  END IF;
END $$;

-- 2) 清理重复：同一 (order_id, level, beneficiary_id) 仅保留 id 最小（最早）的一行
DELETE FROM public.commissions a
USING public.commissions b
WHERE a.id > b.id
  AND a.order_id = b.order_id
  AND a.level = b.level
  AND a.beneficiary_id = b.beneficiary_id;

-- 3) 加唯一约束（幂等：已存在则不重建）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'uq_commissions_order_level_beneficiary'
  ) THEN
    ALTER TABLE public.commissions
      ADD CONSTRAINT uq_commissions_order_level_beneficiary
      UNIQUE (order_id, level, beneficiary_id);
    RAISE NOTICE '[00134] 已添加唯一约束 uq_commissions_order_level_beneficiary';
  ELSE
    RAISE NOTICE '[00134] 唯一约束已存在，跳过';
  END IF;
END $$;
