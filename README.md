# HaloWeApp

[Halo](https://halo.run) 博客的微信小程序端（原生小程序）。

白色主题 · 圆角卡片 · 霞鹜文楷 —— 设计规范见 [docs/prototype/index.html](docs/prototype/index.html)。

## 快速开始

1. 部署好自己的 Halo 2.x 博客（HTTPS + 已备案域名）
2. 用微信开发者工具导入本目录（无 AppID 可选"测试号"）
3. 修改 `config/index.js` 中的 `baseUrl` 为你的博客地址
4. 安装依赖并构建 npm：
   ```bash
   npm install
   ```
   然后在开发者工具中执行 **工具 → 构建 npm**（详情页正文渲染依赖 [mp-html](https://jin-yufeng.gitee.io/mp-html/)，以小程序 npm 方式引入，未构建时详情页无法渲染）
5. 小程序后台 → 开发管理 → 服务器域名：
   - `request 合法域名` 添加 `https://<你的博客域名>`
   - 图片/附件若使用独立 CDN（如对象存储），`downloadFile 合法域名` 也要一并添加，
     否则正文图片和头像在真机上无法加载（开发版可勾选"不校验合法域名"跳过）

## 目录结构

```
├── app.js / app.json / app.wxss   # 入口、全局配置、设计规范与页面状态样式
├── config/index.js                # 版本号、博客地址、名称、评论开关、远程配置、字体地址
├── utils/
│   ├── request.js                 # wx.request 封装（结构化错误、repeat 序列化）
│   ├── api.js                     # Halo API 接口层（路径见 docs/halo-api.md）
│   ├── asset.js                   # 相对资源 URL 补全（/upload/... → 站点域名）
│   ├── html.js                    # 正文字段选择、安全清理、自定义标签降级
│   ├── adapters/
│   │   ├── post.js                # 文章列表/详情 → PostSummary / PostDetail
│   │   └── search.js              # 搜索命中 → SearchResult（<B> 高亮解析）
│   ├── runtime-config.js          # 远程配置：显式启用、白名单校验、缓存降级
│   ├── search-history.js          # 搜索历史（LRU，上限 10 条）
│   ├── likes.js                   # 点赞状态本地持久化（LRU，上限 500 条）
│   └── util.js                    # 时间/数字格式化
├── pages/
│   ├── index/                     # 首页：搜索胶囊 + Banner 轮播 + 文章卡片流
│   ├── search/                    # 搜索页：历史记录 + 高亮结果
│   ├── category/                  # 分类网格 + 标签云
│   ├── posts/                     # 分类/标签下的文章列表
│   ├── post-detail/               # 文章详情：mp-html 正文 + 点赞 + 评论区
│   └── profile/                   # 我的：博客信息 + 站点统计
├── tests/                         # 自动化测试与脱敏接口夹具（npm test）
└── docs/                          # API 参考、UI 原型、开发计划
```

## 自动化测试

```bash
npm test
```

基于 Node.js 内置测试运行器（无额外依赖），覆盖：文章/搜索 adapter、资源 URL 补全、
正文清理管线、query 序列化、请求错误分类、远程配置校验与缓存、搜索历史。
`tests/fixtures/` 为从真实 Halo 2.x 站点抓取并脱敏的接口样本（11 篇不同结构的文章详情、
列表、搜索、分类、标签、统计），adapter 的兼容性由这些夹具保证。

## 远程配置（配套插件，可选）

小程序支持由配套 Halo 插件远程下发配置（评论开关等）。v0.2.0 采用**显式启用**策略：
在 `config/index.js` 的 `remoteConfig` 中同时配置 `enabled: true`、`pluginName` 和
`endpoint` 后才会发起请求；插件不可用、超时、返回 HTML 或字段非法时均回退本地默认值，
`commentEnabled` 最终兜底始终为 `false`（对齐提审要求）。配置带 6 小时缓存，
过期缓存仅在拉取失败时作短时降级。

## 功能现状（v0.2.0）

- 文章列表（置顶排序、Banner、无封面自适应）、下拉刷新与触底分页（单飞互斥）
- 文章详情：mp-html 正文渲染（代码块/表格横向滚动、图片懒加载与预览、外链点击复制、
  长按选词复制）、相对资源自动补全、404/空正文/失败重试独立状态
- 搜索：中文/英文/特殊字符、`<B>` 受控高亮、最近搜索（10 条 LRU）、最多展示 20 条结果
- 分类/标签浏览、点赞（状态本地持久化）、阅读量上报（每次进入只报一次）、站点统计
- 评论：仅读取，默认关闭，由 `config.commentEnabled` 或配套插件远程开关控制（提审期间保持关闭）
- 规划中（v0.3.x）：评论提交、归档、友链、关于、设置、配套 Halo 插件

## 包体积

- 小程序运行内容（页面/工具/图片/mp-html）约 250 KB，远低于微信 2 MB 主包限制
- `tests/`、`docs/` 已在 `project.config.json` 的 `packOptions.ignore` 中排除，不参与上传

## 相关文档

- 变更日志：[CHANGELOG.md](CHANGELOG.md)
- Halo API 参考：[docs/halo-api.md](docs/halo-api.md)
- UI 原型与设计规范：[docs/prototype/index.html](docs/prototype/index.html)
- 开发计划（v0.2.0）：[docs/development-plan-v0.2.0.md](docs/development-plan-v0.2.0.md)
- Halo 官方 API 文档：<https://api.halo.run>

## License

MIT
