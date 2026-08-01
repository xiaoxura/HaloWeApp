// 小程序启动配置：只保留无法从 Halo 插件发现的构建期信息。
//
// 安全提示：不要在这里放 Halo 管理员 PAT、AppSecret 或其他长期凭据。
// config/index.js 会打包进小程序，任何用户都可以读取其中内容；管理凭据只能保存在
// plugin-halo-weapp 的服务端安全边界中。当前读者端全部使用 Public API，不需要管理员 PAT。
module.exports = {
  // 小程序版本号（“我的”页面等展示位置统一从这里读取）
  version: '0.3.0',

  // 你的 Halo 博客地址（必须 HTTPS，且已加入小程序 request 合法域名）
  baseUrl: 'https://www.uomn.cn'
}
