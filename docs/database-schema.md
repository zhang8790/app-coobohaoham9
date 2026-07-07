# 来电有喜 - 数据库表结构文档

> 生成时间：2026-07-06  
> 数据库：Supabase PostgreSQL  
> 总表数：19张

---

## 📋 目录

1. [核心业务表](#核心业务表)
2. [用户相关表](#用户相关表)
3. [商品与订单表](#商品与订单表)
4. [营销与推广表](#营销与推广表)
5. [内容与管理表](#内容与管理表)
6. [字段说明](#字段说明)

---

## 核心业务表

### 1. `profiles` - 用户档案表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 用户ID，关联 auth.users |
| username | TEXT | 用户名（手机号） |
| phone | TEXT | 手机号 |
| nickname | TEXT | 昵称，默认"江湖散修" |
| avatar_url | TEXT | 头像URL |
| role | user_role | 角色：user/admin |
| member_rank | member_rank | 会员段位 |
| points | INTEGER | 积分 |
| balance | NUMERIC(10,2) | 余额 |
| coupons_count | INTEGER | 优惠券数量 |
| merchant_status | merchant_status | 商家状态 |
| invite_code | TEXT | 邀请码（唯一） |
| referred_by | UUID | 推荐人ID |
| total_consumption | NUMERIC | 累计消费 |
| team_performance | NUMERIC | 团队业绩 |
| created_at | TIMESTAMPTZ | 创建时间 |

**索引：**
- `profiles_invite_code_idx` ON `profiles(invite_code)`
- `profiles_referred_by_idx` ON `profiles(referred_by)`

---

### 2. `stores` - 门店表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 门店ID |
| owner_id | UUID | 店主ID |
| name | TEXT | 门店名称 |
| description | TEXT | 描述 |
| address | TEXT | 地址 |
| phone | TEXT | 电话 |
| category | TEXT | 分类 |
| image_url | TEXT | 头像 |
| banner_url | TEXT | 横幅 |
| rating | NUMERIC(3,1) | 评分 |
| is_active | BOOLEAN | 是否营业 |
| is_platform | BOOLEAN | 是否自营 |
| short_code | TEXT | 短码（用于分享） |
| referral_rate | NUMERIC | 让利率 |
| contact | TEXT | 联系人 |
| is_open | BOOLEAN | 是否营业 |
| open_time | TEXT | 营业开始时间 |
| close_time | TEXT | 营业结束时间 |
| delivery_enabled | BOOLEAN | 是否配送 |
| pickup_enabled | BOOLEAN | 是否自提 |
| delivery_radius | INTEGER | 配送半径 |
| delivery_fee | NUMERIC | 配送费 |
| free_delivery_threshold | NUMERIC | 免配送门槛 |
| min_order_amount | NUMERIC | 起送金额 |
| announcement | TEXT | 公告 |
| scene_tags | TEXT[] | 场景标签 |
| created_at | TIMESTAMPTZ | 创建时间 |

---

### 3. `products` - 商品表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 商品ID |
| store_id | UUID (FK) | 门店ID |
| category_id | UUID (FK) | 分类ID |
| name | TEXT | 商品名称 |
| description | TEXT | 描述 |
| price | NUMERIC(10,2) | 价格 |
| original_price | NUMERIC(10,2) | 原价 |
| image_url | TEXT | 主图 |
| main_image | TEXT | 主图（新） |
| sub_images | TEXT[] | 副图 |
| detail_images | TEXT[] | 详情图 |
| video_url | TEXT | 视频 |
| cost_price | NUMERIC | 成本价 |
| discount_rate | NUMERIC | 折扣率 |
| stock | INTEGER | 库存 |
| barcode | TEXT | 条码 |
| mood_tags | TEXT[] | 情绪标签 |
| scene_tags | TEXT[] | 场景标签 |
| is_active | BOOLEAN | 是否上架 |
| review_status | TEXT | 审核状态 |
| created_at | TIMESTAMPTZ | 创建时间 |

---

## 用户相关表

### 4. `user_addresses` - 用户地址表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 地址ID |
| user_id | UUID (FK) | 用户ID |
| name | TEXT | 收货人 |
| phone | TEXT | 手机号 |
| province | TEXT | 省 |
| city | TEXT | 市 |
| district | TEXT | 区 |
| detail | TEXT | 详细地址 |
| is_default | BOOLEAN | 是否默认 |
| created_at | TIMESTAMPTZ | 创建时间 |

### 5. `favorites` - 收藏表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 收藏ID |
| user_id | UUID (FK) | 用户ID |
| product_id | UUID (FK) | 商品ID |
| created_at | TIMESTAMPTZ | 创建时间 |

### 6. `footprints` - 足迹表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 足迹ID |
| user_id | UUID (FK) | 用户ID |
| product_id | UUID (FK) | 商品ID |
| viewed_at | TIMESTAMPTZ | 浏览时间 |

---

## 商品与订单表

### 7. `store_categories` - 门店分类表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 分类ID |
| store_id | UUID (FK) | 门店ID |
| name | TEXT | 分类名称 |
| sort_order | INTEGER | 排序 |

### 8. `cart_items` - 购物车表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 购物车ID |
| user_id | UUID (FK) | 用户ID |
| product_id | UUID (FK) | 商品ID |
| store_id | UUID (FK) | 门店ID |
| quantity | INTEGER | 数量 |
| selected | BOOLEAN | 是否选中 |
| created_at | TIMESTAMPTZ | 创建时间 |

### 9. `orders` - 订单表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 订单ID |
| order_no | TEXT (UNIQUE) | 订单号 |
| user_id | UUID (FK) | 用户ID |
| store_id | UUID (FK) | 门店ID |
| total_amount | NUMERIC(10,2) | 总金额 |
| status | order_status | 订单状态 |
| payment_method | payment_method | 支付方式 |
| pay_expired_at | TIMESTAMPTZ | 支付过期时间 |
| paid_at | TIMESTAMPTZ | 支付时间 |
| referrer_id | UUID | 推荐人ID |
| commission_distributed | BOOLEAN | 佣金已分发 |
| service_type | TEXT | 服务类型 |
| refunded_amount | NUMERIC | 退款金额 |
| parent_order_no | TEXT | 父订单号 |
| idempotency_key | TEXT | 幂等键 |
| l1_commission | NUMERIC | 一级佣金 |
| l2_commission | NUMERIC | 二级佣金 |
| buyer_points | INTEGER | 买家积分 |
| platform_income | NUMERIC | 平台收入 |
| commission_calculated | BOOLEAN | 佣金已计算 |
| promoter_id | UUID | 推广人ID |
| staff_id | UUID | 员工ID |
| created_at | TIMESTAMPTZ | 创建时间 |

### 10. `order_items` - 订单项表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 订单项ID |
| order_id | UUID (FK) | 订单ID |
| product_id | UUID (FK) | 商品ID |
| store_id | UUID (FK) | 门店ID |
| store_name | TEXT | 门店名称 |
| product_name | TEXT | 商品名称 |
| product_image | TEXT | 商品图片 |
| price | NUMERIC(10,2) | 价格 |
| quantity | INTEGER | 数量 |
| created_at | TIMESTAMPTZ | 创建时间 |

---

## 营销与推广表

### 11. `marketing_campaigns` - 营销活动表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL (PK) | 活动ID |
| store_id | UUID (FK) | 门店ID |
| campaign_name | TEXT | 活动名称 |
| campaign_type | TEXT | 类型：redpacket/physical |
| gift_name | TEXT | 礼品名称 |
| gift_value | NUMERIC(10,2) | 礼品价值 |
| total_limit | INTEGER | 发放总数 |
| daily_limit | INTEGER | 每日限领 |
| start_date | DATE | 开始日期 |
| end_date | DATE | 结束日期 |
| claimed_count | INTEGER | 已领取数 |
| commission_rate | NUMERIC(5,2) | 佣金比例 |
| status | TEXT | 状态 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

### 12. `user_campaign_claims` - 用户活动领取记录表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 记录ID |
| user_id | UUID (FK) | 用户ID |
| campaign_id | INTEGER (FK) | 活动ID |
| store_id | UUID (FK) | 门店ID |
| claimed_at | TIMESTAMPTZ | 领取时间 |
| status | TEXT | 状态 |
| verified | BOOLEAN | 是否已核销 |

### 13. `pending_referrals` - 预锁客表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 记录ID |
| device_id | TEXT | 设备ID |
| referral_code | TEXT | 推荐码 |
| store_id | UUID (FK) | 门店ID |
| campaign_id | INTEGER (FK) | 活动ID |
| status | TEXT | 状态 |
| converted | BOOLEAN | 是否已转化 |
| created_at | TIMESTAMPTZ | 创建时间 |

### 14. `coupons` - 优惠券表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 优惠券ID |
| user_id | UUID (FK) | 用户ID |
| code | TEXT | 优惠券码 |
| title | TEXT | 标题 |
| discount_type | TEXT | 折扣类型 |
| discount_value | NUMERIC | 折扣值 |
| min_amount | NUMERIC | 最低消费 |
| is_used | BOOLEAN | 是否已使用 |
| expired_at | TIMESTAMPTZ | 过期时间 |
| used_at | TIMESTAMPTZ | 使用时间 |
| created_at | TIMESTAMPTZ | 创建时间 |

---

## 内容与管理表

### 15. `articles` - 文章表（UGC）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 文章ID |
| user_id | UUID (FK) | 用户ID |
| title | TEXT | 标题 |
| content | TEXT | 内容 |
| images | TEXT[] | 图片 |
| tags | TEXT[] | 标签 |
| is_published | BOOLEAN | 是否发布 |
| status | TEXT | 状态 |
| cover_image | TEXT | 封面图 |
| video_url | TEXT | 视频URL |
| view_count | INTEGER | 浏览数 |
| share_count | INTEGER | 分享数 |
| created_at | TIMESTAMPTZ | 创建时间 |

### 16. `product_reviews` - 商品评价表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 评价ID |
| user_id | UUID (FK) | 用户ID |
| product_id | UUID (FK) | 商品ID |
| order_id | UUID (FK) | 订单ID |
| order_item_id | UUID (FK) | 订单项ID |
| rating | INTEGER | 评分 |
| content | TEXT | 内容 |
| images | TEXT[] | 图片 |
| created_at | TIMESTAMPTZ | 创建时间 |

### 17. `announcements` - 公告表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 公告ID |
| content | TEXT | 内容 |
| is_active | BOOLEAN | 是否活跃 |
| sort_order | INTEGER | 排序 |
| created_at | TIMESTAMPTZ | 创建时间 |

### 18. `merchant_applications` - 商家申请表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 申请ID |
| user_id | UUID (FK) | 用户ID |
| store_name | TEXT | 门店名称 |
| contact_name | TEXT | 联系人 |
| contact_phone | TEXT | 联系电话 |
| business_type | TEXT | 业务类型 |
| description | TEXT | 描述 |
| status | merchant_status | 状态 |
| reject_reason | TEXT | 拒绝原因 |
| created_at | TIMESTAMPTZ | 创建时间 |

### 19. `withdrawals` - 提现表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 提现ID |
| user_id | UUID (FK) | 用户ID |
| store_id | UUID (FK) | 门店ID |
| amount | NUMERIC(10,2) | 金额 |
| status | TEXT | 状态 |
| bank_name | TEXT | 银行名称 |
| bank_account | TEXT | 银行账号 |
| bank_holder | TEXT | 开户人 |
| alipay_account | TEXT | 支付宝账号 |
| withdraw_method | TEXT | 提现方式 |
| reject_reason | TEXT | 拒绝原因 |
| remark | TEXT | 备注 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

---

## 字段说明

### 枚举类型
- `user_role`: user, admin
- `member_rank`: 江湖散修, 外门弟子, 内门弟子, 核心弟子, 长老, 掌门
- `merchant_status`: none, pending, approved, rejected
- `order_status`: pending_pay, pending_ship, pending_receive, pending_review, completed, after_sale, cancelled
- `payment_method`: wxpay, gold_beans

### 关键字段说明
- `profiles.invite_code`: 用户的唯一邀请码，用于推广
- `stores.short_code`: 门店短码，用于扫码进入门店
- `orders.commission_distributed`: 标记佣金是否已分发，防止重复分发
- `marketing_campaigns.campaign_type`: redpacket=现金红包, physical=实物礼品

---

## 关系图（简化）

```
profiles (1) ─── (N) stores (1) ─── (N) products
                     │                   │
                     │                   └─── (N) cart_items
                     │                   └─── (N) order_items
                     │
                     └─── (N) orders (1) ─── (N) order_items
                     └─── (N) favorites
                     └─── (N) footprints
                     └─── (N) articles
                     └─── (N) withdrawals
```

---

## 待确认表（可能未使用）

以下表在代码中没有找到引用，可能需要删除：
1. `referrals` - 已被 `user_store_relation` 替代
2. `user_staff_bindings` - 已被 `store_staff` 替代
3. `rank_configs` - 未被引用
4. `platform_configs` - 未被引用

---

**文档结束**
