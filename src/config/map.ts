/**
 * 腾讯位置服务 Key 集中配置
 *
 * 真机必配（重要）：
 * 微信小程序原生 <map> 组件在真机运行时，必须在微信公众平台后台
 * 「开发管理 → 腾讯位置服务」中配置此 Key，否则地图定位蓝点
 * （show-location）、逆地址解析等能力会受限或空白。
 * 代码层面的 <map> 组件本身【不接收】key 属性，Key 由微信后台绑定小程序 AppID。
 *
 * 此 Key 同时供腾讯位置服务 WebService API（逆地址解析 / 正向地理编码 /
 * 地点搜索 / 路线规划）使用，调用 https://apis.map.qq.com 时需在微信后台
 * 把该域名加入 request 合法域名（开发者工具可勾选「不校验合法域名」临时调试）。
 * ⚠️ 小程序端 forwardGeocode（商家端「根据地址自动获取坐标」）也走此域名，
 * 真机未配合法域名会解析失败，仅开发者工具勾选后可临时调通。
 */
export const TENCENT_MAP_KEY = 'D63BZ-GLHCL-XUIPF-EI7QI-6OK6S-7IB3Q'

/** 腾讯位置服务 WebService API 基础地址 */
export const TENCENT_MAP_API_BASE = 'https://apis.map.qq.com'
