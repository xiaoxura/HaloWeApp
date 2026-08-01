// 全局配置：修改为你的博客信息
module.exports = {
  // 小程序版本号（“我的”页面等展示位置统一从这里读取）
  version: '0.2.0',

  // 你的 Halo 博客地址（必须 HTTPS，且已加入小程序 request 合法域名）
  baseUrl: 'https://www.uomn.cn',

  // 博客名称/简介（显示在"我的"页面）
  blogName: '我的博客',
  blogDesc: '记录技术 · 记录生活',

  // 每页文章数
  pageSize: 10,

  // 评论功能开关（本地默认值；安装配套插件后由插件下发覆盖）
  // 提审期间建议设为 false
  commentEnabled: false,

  // 远程配置（配套 Halo 插件下发，v0.2.0 采用「显式启用」策略）
  // enabled / pluginName / endpoint 任一缺失时不发起任何网络请求；
  // 插件不可用、超时、返回 HTML 或非法字段时均回退本地默认值（评论保持关闭）
  remoteConfig: {
    enabled: false,
    pluginName: '',
    endpoint: '',
    cacheTtl: 21600000 // 6 小时，过期缓存仅作短时降级
  },

  // 自定义字体（霞鹜文楷）网络地址，留空则不加载
  // 注意：需将字体文件托管在已配置 downloadFile 合法域名的 HTTPS 地址下
  // 建议使用精简 subset 版 woff2 以控制加载体积
  fontUrl: ''
}
