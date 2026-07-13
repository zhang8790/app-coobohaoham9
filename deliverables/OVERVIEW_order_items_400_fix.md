# 金豆支付下单 400 根因与修复（2026-07-09 第四层）

## 现象
登录态正常、金豆余额正常（49991）、`orders` 主表插入成功（`error:null`），
但 `order_items` 子表 `POST /rest/v1/order_items` 始终 **400**，
导致订单"创建成功但没商品"，且原代码静默吞错（无 toast、无日志），排查看不到原因。

## 根因（第四层）
`order_items.store_id` 在 `00001:134` 定义为 `uuid REFERENCES public.stores(id)`（uuid + 外键）。
`createOrderV2` 写子表时：

- `product_id: ... || null` → `||` 把 `""` 当 falsy 转 null ✅（之前已修）
- `store_id: o.store_id ?? params.items[idx]?.store_id ?? null` → **`??` 只对 null/undefined 生效，空串 `""` 不触发兜底** → 占位测试入口 `store_id:''` 被原样发给 uuid 列 → 400

空串源头：`payment/index.tsx:303` 兜底项 `store_id: ''`；`o.store_id` 来自 orders 插入（已是 null），于是 `??` 一路落到 item 的空串。

## 修复
1. **源码** `src/db/api.ts`：
   - `store_id` 改用 `o.store_id || params.items[idx]?.store_id || null`（`||` 同时容错 null 与空串）
   - 补 `store_name` / `product_image` 字段
   - 给 `order_items` 插入加 **错误捕获 + 日志 + toast**（原 `await ...insert()` 无 catch，400 被静默吞掉）
2. **根治 SQL** `deliverables/fix_order_items_store_product_text.sql`：
   `product_id` + `store_id` 均由 `uuid(FK)` 改为 `text` 并去外键（order_items 已冗余存 product_name/store_name，FK 意义不大），
   占位/平台精选/商品或门店被删时传空或无效 id 不再被 FK 拦截。幂等，供 Dashboard 粘贴。

## 验证
- `taro build --type weapp`：384 模块、23.23s、BUILD 成功
- dist 指纹核对：`store_id:t.store_id||(null==...o.store_id)||null` 存在；旧 `store_id??` 已消失；order_items 错误日志已编入
- 开发者工具热重载后复测"6金豆"占位下单 + 真实商品下单，预期 orders+order_items 双表落库、状态 pending_pickup

## 用户待办
1. 微信开发者工具点「编译/热重载」加载新 dist（若之前清过缓存需重登 18701410500/123456）
2. 点金豆支付复测，预期不再 400、订单中心能看到新订单
3. （可选）Dashboard 粘贴 `fix_order_items_store_product_text.sql` 消除 FK 隐患，避免未来真实商品/门店异常 id 再次 400
