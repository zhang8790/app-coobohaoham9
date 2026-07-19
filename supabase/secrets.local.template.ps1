# ============================================================
# 微信 / LLM 密钥本地模板
# 用法：复制本文件为 supabase/secrets.local.ps1 并填入真实值
#       （secrets.local.ps1 不会被提交，请勿上传）
#
# 注意：Supabase 会自动注入以下三个变量，无需填写：
#   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
# ============================================================

# —— 微信登录 / openid 必需（否则 wechat_miniapp_login / get-wechat-openid 报 400）——
$WX_SECRET        = "微信小程序AppSecret"
$MERCHANT_APP_ID = "微信小程序AppID"

# —— 微信支付（可选；不填则 create-wechat-payment 部署后运行时报 400 配置缺失）——
$MERCHANT_ID            = ""
$MCH_CERT_SERIAL_NO     = ""
$MCH_PRIVATE_KEY        = ""
$WECHAT_PAY_PUBLIC_KEY_ID = ""
$WECHAT_PAY_PUBLIC_KEY  = ""

# —— 食疗 AI 文案（可选；不填则 food-therapy-ai 部署后运行时报 400 配置缺失）——
$LLM_API_KEY   = ""
$LLM_BASE_URL  = "https://api.openai.com/v1"
$LLM_MODEL     = "gpt-4o-mini"
