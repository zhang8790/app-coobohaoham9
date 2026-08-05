-- ============================================================
-- 食品配料安全管理系统 · 人群 severity 分级 + 婴幼儿/孕产妇独立维度
-- ------------------------------------------------------------
-- 解决：原 crowd 体系（main_conclusion.children）只有"可适量"的模糊绿灯，
--       且 ingredient-analyze 无条件给所有商品挂 children，导致保健品也显示"可吃"。
-- 本次补齐：
--   ① food_crowd_triggers / food_crowd_tips 增加 severity 列（负向四级语义）
--   ② 新增 infant（婴幼儿）/ pregnant（孕妇）/ lactating（哺乳期）独立维度
--   ③ 现有 children 明确为"派生父维度"——仅当命中 infant 或任一慢病时附带 caution
-- 合规：全部为"配料适配性提示"，不诊断、不写疗效；过敏原仍显著常驻。
-- 执行：Supabase SQL Editor 全量粘贴；幂等可重复执行。
-- ============================================================

-- ---------- ① 加 severity 列 ----------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='food_crowd_triggers' and column_name='severity'
  ) then
    alter table public.food_crowd_triggers
      add column severity text not null default 'caution'
      check (severity in ('ok','caution','advise_against','forbidden'));
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name='food_crowd_tips' and column_name='severity'
  ) then
    alter table public.food_crowd_tips
      add column severity text not null default 'caution'
      check (severity in ('ok','caution','advise_against','forbidden'));
  end if;
end $$;

-- ---------- ② 现有 children 行：明确基调为 caution（不再是模糊绿灯兜底） ----------
update public.food_crowd_tips
  set severity = 'caution'
  where crowd_code = 'children';

-- 现有慢性触发词默认 caution（限量/谨慎），与旧语义一致，无需改；
-- 过敏原 allergy_* 行统一提为 forbidden 基调（过敏严禁，强化提示）。
update public.food_crowd_tips
  set severity = 'forbidden'
  where crowd_code like 'allergy_%';

-- ---------- ③ 种子：infant / pregnant / lactating 触发词（带 severity） ----------
-- 注：unique(trigger_keyword, crowd_code) 已存在，新 crowd_code 不会与旧行冲突。
insert into public.food_crowd_triggers (trigger_keyword, crowd_code, severity) values
  -- ===== infant 婴幼儿（0-3岁，尤其辅食期：禁盐禁糖禁蜂蜜、脏器未发育） =====
  ('蜂蜜',           'infant', 'forbidden'),        -- 肉毒杆菌芽孢风险
  ('食用盐',         'infant', 'advise_against'),   -- 肾脏负担
  ('氯化钠',         'infant', 'advise_against'),
  ('谷氨酸钠',       'infant', 'advise_against'),   -- 钠
  ('白砂糖',         'infant', 'advise_against'),   -- 龋齿/代谢
  ('果葡糖浆',       'infant', 'advise_against'),
  ('麦芽糖',         'infant', 'advise_against'),
  ('麦芽糖浆',       'infant', 'advise_against'),
  ('酒精',           'infant', 'forbidden'),
  ('乙醇',           'infant', 'forbidden'),
  ('食用酒精',       'infant', 'forbidden'),
  ('番泻叶',         'infant', 'forbidden'),        -- 泻药
  ('芦荟',           'infant', 'forbidden'),
  ('大黄',           'infant', 'forbidden'),
  ('咖啡因',         'infant', 'advise_against'),   -- 神经兴奋
  ('茶碱',           'infant', 'advise_against'),
  ('可可粉',         'infant', 'advise_against'),
  ('人参',           'infant', 'advise_against'),   -- 高补不宜婴幼儿
  ('鹿茸',           'infant', 'advise_against'),
  ('蜂王浆',         'infant', 'advise_against'),

  -- ===== pregnant 孕妇（妊娠全程） =====
  ('酒精',           'pregnant', 'forbidden'),
  ('乙醇',           'pregnant', 'forbidden'),
  ('食用酒精',       'pregnant', 'forbidden'),
  ('咖啡因',         'pregnant', 'advise_against'),
  ('茶碱',           'pregnant', 'advise_against'),
  ('薏米',           'pregnant', 'advise_against'), -- 传统认为滑利
  ('薏仁',           'pregnant', 'advise_against'),
  ('山楂',           'pregnant', 'advise_against'), -- 刺激宫缩
  ('桂圆',           'pregnant', 'advise_against'), -- 活血上火
  ('龙眼肉',         'pregnant', 'advise_against'),
  ('番泻叶',         'pregnant', 'forbidden'),      -- 泻下
  ('芦荟',           'pregnant', 'forbidden'),
  ('当归',           'pregnant', 'advise_against'), -- 活血
  ('益母草',         'pregnant', 'advise_against'),
  ('红花',           'pregnant', 'advise_against'),
  ('川芎',           'pregnant', 'advise_against'),
  ('金枪鱼',         'pregnant', 'advise_against'), -- 高汞
  ('旗鱼',           'pregnant', 'advise_against'),
  ('方头鱼',         'pregnant', 'advise_against'),
  ('维生素A',        'pregnant', 'advise_against'), -- 过量致畸
  ('视黄醇',         'pregnant', 'advise_against'),
  ('鱼肝油',         'pregnant', 'advise_against'),

  -- ===== lactating 哺乳期（产褥至断奶） =====
  ('酒精',           'lactating', 'forbidden'),
  ('乙醇',           'lactating', 'forbidden'),
  ('食用酒精',       'lactating', 'forbidden'),
  ('咖啡因',         'lactating', 'advise_against'),
  ('茶碱',           'lactating', 'advise_against'),
  ('番泻叶',         'lactating', 'forbidden'),
  ('芦荟',           'lactating', 'forbidden'),
  ('炒麦芽',         'lactating', 'advise_against'), -- 回奶
  ('山楂',           'lactating', 'advise_against'), -- 回奶
  ('韭菜',           'lactating', 'advise_against'), -- 回奶（传统）

  -- ===== children 显式触发器（不再无条件挂；命中即 caution/advise_against） =====
  ('咖啡因',         'children', 'advise_against'),
  ('茶碱',           'children', 'advise_against'),
  ('可可粉',         'children', 'advise_against'),
  ('白砂糖',         'children', 'caution'),
  ('果葡糖浆',       'children', 'caution'),
  ('麦芽糖',         'children', 'caution'),
  ('麦芽糖浆',       'children', 'caution'),
  ('食用盐',         'children', 'caution'),
  ('氯化钠',         'children', 'caution'),
  ('谷氨酸钠',       'children', 'caution')
on conflict (trigger_keyword, crowd_code) do update set severity = excluded.severity;

-- ---------- ④ 种子：infant / pregnant / lactating 文案（food_crowd_tips） ----------
insert into public.food_crowd_tips
  (crowd_code, label, general_tip, children_tip, fit_people, unfit_people, severity, sort_order)
values
  ('infant', '婴幼儿（辅食期）提示',
    '婴幼儿（尤其 6 月龄内辅食期）脏器与代谢未发育完善，严格禁盐、禁添加糖、禁蜂蜜，配料适配需格外审慎。',
    '婴幼儿阶段肠胃与代谢稚嫩，少量多样、严格规避禁忌配料，遵从儿科与辅食指南。',
    '无相关过敏/禁忌、遵医嘱添加辅食的婴幼儿',
    '对蜂蜜/盐糖/酒精/泻药等禁忌配料存在暴露的婴幼儿', 'advise_against', 6),

  ('pregnant', '孕妇提示',
    '孕期膳食需格外审慎：禁酒精，限制咖啡因（每日≤200mg），规避薏米、山楂、桂圆及活血草药、高汞鱼类与过量维生素A。',
    '（孕妇专属维度，不单独对儿童输出）',
    '无相关禁忌、遵医嘱膳食的孕妇',
    '对酒精/咖啡因/活血食材/高汞鱼等存在暴露的孕妇', 'advise_against', 7),

  ('lactating', '哺乳期提示',
    '哺乳期同样规避酒精与过量咖啡因；部分食材（炒麦芽、山楂、韭菜）传统认为影响泌乳，建议留意。',
    '（哺乳期专属维度，不单独对儿童输出）',
    '无相关禁忌、泌乳正常的哺乳期妈妈',
    '对酒精/回奶食材等存在暴露的哺乳期妈妈', 'advise_against', 8)
on conflict (crowd_code) do update set
  label = excluded.label,
  general_tip = excluded.general_tip,
  children_tip = excluded.children_tip,
  fit_people = excluded.fit_people,
  unfit_people = excluded.unfit_people,
  severity = excluded.severity,
  sort_order = excluded.sort_order;
