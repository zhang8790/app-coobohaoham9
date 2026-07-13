# 项目长期记忆：app-coobohaoham9（来电有喜 小程序 + admin-web 总后台）

## 一、沙箱编译 Taro 小程序（每次必做）
- 重链：`cd C:/Users/zhanglin/Desktop/app-coobohaoham9 && npm_config_shamefully_hoist=true /c/Users/zhanglin/.workbuddy/binaries/node/versions/22.22.2/pnpm install --offline`
- 编译：`CODEBUDDY_SAFE_DELETE_BULK_STATE_DIR= CODEBUDDY_TOOL_CALL_ID= node_modules/.bin/taro build --type weapp > build_full.log 2>&1; echo "BUILD_EXIT=$?"`（顺带 `rm -rf .taro` 清缓存）。
- JSX 同一元素重复属性（如两个 style=）会卡死构建无 dist/app.json；修完用 Python 扫 `src/**/*.tsx` 同 tag 内 `style=` 计数≥2。
- 沙箱禁 `ln -s`；`dist/` gitignore；微信开发者工具只读 dist/。

## 二、Supabase 约束（关键，反复踩）
- 沙箱无 supabase CLI / SUPABASE_ACCESS_TOKEN → 迁移、云函数部署、真库验证只能用户本机（Dashboard SQL Editor 粘贴 或 `supabase db push`）。
- admin-web 用 **anon key**（非 service_role）→ 表 ENABLE RLS 且无 admin policy 时 admin 读 0 行。财务表应 DISABLE RLS（测试期）或加 `get_user_role()='admin'` policy。
- emotion_* 5 表必须 DISABLE RLS（00072 幂等）；`emotion_rule_versions` 例外有 RLS。
- **FK 现状（2026-07-11 纠正）**：`orders.user_id` **实际有 FK → profiles(id) ON DELETE CASCADE**（00001:100），此前"无 FK"判断错误，勿据此禁止 join。`commissions.beneficiary_id/payer_id/referrer_id`、`withdrawals.user_id` 则指向 `auth.users(id)`（与 orders 并存，设计不一致，需统一到 profiles）。
- **两步直读范式仍适用**（原因非"无 FK"，而是测试期 RLS + anon 直连导致 join 行为不可靠）：对需合并 profiles 的查询，先主表 select 再 `profiles.in('id',ids)` 批量取 + JS merge；禁依赖未定义 RPC。

## 三、核心数据模型事实（勿再查）
- `profiles`：gold_beans(1:1元,真源)/tb_balance/commission_balance/cv_total/referrer_id/points/address/shipping_address/nickname/phone/is_banned/member_rank/created_at。
- `orders`：order_no/user_id/store_id(FK stores)/total_amount/status(8枚举)/gold_beans_used/referrer_id/refund_status/**verified_at**(无 is_used 列！)/discount_rate。
- `commissions`(00003)：order_id 硬FK + commission_amount + status(pending/settled/refunded)，已 DISABLE RLS。
- `withdrawals`：user_id/store_id/amount/status(pending/approved/rejected/paid)/bank_name/bank_account/bank_holder/alipay_account/withdraw_method(bank/alipay/wechat)/reject_reason/remark + **real_name,id_card(00077 新增)**。已 DISABLE RLS。
- `gold_bean_logs`(00076 新建即 DISABLE RLS)：type=refund_return/recharge/admin_grant(发放)/purchase_spend/admin_deduct(消耗)。
- `emotion_claims`/`emotion_assets`/`emotion_tongbao_logs`/`emotion_badge_defs`/`emotion_badge_grants`：用户端 anon 直插，DISABLE RLS。

## 四、admin-web 财务看板（与用户端同源 Supabase）
- 验证：`cd admin-web && npx tsc -b --force && npx vite build`。
- 文件：`src/api/finance.ts`(聚合+两步直读)/`FinanceDashboard.tsx`(KPI+SVG图+风控引擎+Realtime订阅 orders/profiles/gold_bean_logs/emotion_claims + 60s 兜底)/`Members.tsx`(含 adminAdjustGoldBean 发放/扣减)/`Orders.tsx`/`Ledgers.tsx`/`Withdrawals.tsx`(佣金兑付审核)。
- 风控引擎 getAnomalyReport：R1 门店退款率 / R2 GMV 骤降 / R3 大额订单 / R4 封禁占比 / R5 刷确权。
- 路由/导航：App.tsx + Layout.tsx。自动刷新 30s 勿删。

## 五、提现功能（2026-07-11 补全）
- 字段缺口已补：withdrawals 加 `real_name`(统一真实姓名，全收款方式必填)、`id_card`(身份证，bank 必填)。`bank_name` 原已有。
- 小程序 `src/pages/withdraw/index.tsx`：bank 收 开户行+卡号+持卡人+真实姓名+身份证；alipay/wechat 收 真实姓名+身份证（+账号）。
- admin-web `src/pages/merchant/Withdraw.tsx` 商家端同步补 real_name/id_card/bank_name。
- 总后台 `src/pages/Withdrawals.tsx`：详情抽屉展示 真实姓名/身份证(脱敏)/手机/开户行/账号(脱敏)/备注；状态流 审核通过(approved)→确认打款(paid)→驳回(rejected,释放佣金，原"退还金豆"文案已改)。
- 打款逻辑：withdrawals 是**推广佣金**兑付（非金豆）。

## 六、迁移执行状态（2026-07-11 用户本机已全部跑完）
- ✅ 用户已于 2026-07-11 确认本机执行：00054(治理RPC)/00072(emotion RLS)/00073(emo徽章种子)/00074(body_templates)/00076(gold_bean_logs)/**00077(withdrawals real_name+id_card)**/**00078(tongbao_amount改numeric(12,2) + gold_bean_logs强制DISABLE RLS)**。
- ✅ 早前已确认执行：00070(食养 shiyang_tags/shiyang_copy)/00084(notifications)/00055(ship_company/ship_no/verified_at)。
- **结论**：沙箱侧长期挂起的「待执行迁移」清单至此全部清零，真库 schema 完整。金豆支付 `verified_at` 列依赖、withdrawals 实名依赖、gold_bean_logs 表依赖均已闭合（代码侧此前已做容错兜底，DB 补全后更稳）。
- Supabase Realtime 发布：orders/profiles/gold_bean_logs/emotion_claims（看板实时用）— 如看板未实时，需用户在 Dashboard 开启对应表 Realtime。
- 云函数部署（沙箱无CLI/Token）：`supabase functions deploy create-order` + `supabase functions deploy refund-order`（refund-order 有未提交佣金回滚加固）— 先前 DEPLOY_STATUS 标已闭环，若用户改过函数源码需重部署。

## 七、用户偏好 / 合规 / 命名
- 中文交流、指令简洁；产物级验证必做；合规红线(医疗宣称/绝对化用语/医生背书)零容忍；投资路演需优雅 PPT。
- 合规整改（2026-07-13）：情绪文案库 `最X` 绝对化用语 + 边界医疗词(安眠/助眠) + 极限词(极品/顶级/唯一/翻倍) 全量改合规表述，**累计 88 处**（81 主量[13 上轮 + 68 本轮 `scripts/fix_superlatives.py` 精确 token 替换] + 7 补漏[唯一/安眠/助眠/极品/翻倍/顶级]）。合法词(最低/最高/最新/最多/最后/最终/最长/最短/最自然/最贴合)与食养字典功效(养肝明目/润肠/助消化，已带 SHIYANG_DISCLAIMER)保留不动。`治愈` 作情绪标签合法（`治愈(医)` 为禁词，分界线见 `emotion-description.ts:15` 合规红线注释）；商家标题/描述 违禁词库已含 `最好`、`极品`、`顶级` 等（compliance-words.ts + admin-web merchant.ts/emotion.ts）。
- 推广术语：一级=我的好友、二级=我的粉丝；两层封顶不发展多级。
- 情绪规则引擎（2026-07-13 选 C 夯实）：`product-emotion-lexicon.ts` 商品级词条 **32→42 条**（新增 牛奶酸奶/速食粉面/西式快餐/海鲜水产/豆制品/养生冲调/白酒洋酒/功能饮料/便当简餐/辣味零食，每条 5 模板+4 比喻+2 角度，合规无最X/医疗宣称）；`emotion-description.ts` 引擎改**错位变体种子**（metaphor=variant*3+1、angle=variant*5+2），放大 `body×metaphor×angle` 组合、弱化模板感，确定性不变；`category-emotion.ts` 餐饮/饮品各 +2 比喻 +3 模板。默认态仍属"规则文案"（未配 LLM_API_KEY 走本地规则），真 AI 需启用 LLM。
- 协议页统一语义 token（text-foreground/muted-foreground/border-border），禁硬编码灰度 hex。

## 八、食养×情绪双轨（要点）
- `src/utils/shiyang-dictionary.ts` 食材性味；emotion-scoring 5维/100；product_emotion 表单数无 store_id；00070 加 shiyang_tags/shiyang_copy（须本机执行）；合规铁律功效措辞=传统食养参考，禁"治疗/治愈"等。
- **原料分析功能（2026-07-13 完成）**：`products.ingredients text[]` 列（迁移 **00090，用户已于 2026-07-13 确认本机执行**，持久化路径现已生效）。前端已接——编辑页「🥗 原料成分分析（可选）」智能识别区块 + 详情页「🥗 原料分析」卡片；数据源为 `shiyang-dictionary.ts` 40+ 食材字典；`api.ts` 已软降级（缺列自动剥离重试，现列已存在故走正常持久化）。`src/utils/ingredient-analysis.ts` 提供 `matchIngredientKeys`/`resolveIngredientEntries`/`SHIYANG_DISCLAIMER`。网页版 admin-web 同源：`utils/shiyang.ts`(INGREDIENT_DICT/matchIngredientKeys/resolveIngredientEntries/SHIYANG_DISCLAIMER)、`merchant/Products.tsx` 编辑区块、`pages/Products.tsx` 总后台审阅详情弹窗均接该能力。
