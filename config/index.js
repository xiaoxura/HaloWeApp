// 全局配置：修改为你的博客信息
module.exports = {
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

  // 自定义字体（霞鹜文楷）网络地址，留空则不加载
  // 注意：需将字体文件托管在已配置 downloadFile 合法域名的 HTTPS 地址下
  // 建议使用精简 subset 版 woff2 以控制加载体积
  fontUrl: ''
}
