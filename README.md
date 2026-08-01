# HaloWeApp

[Halo](https://halo.run) 博客的微信小程序端（原生小程序，开发中）。

白色主题 · 圆角卡片 · 霞鹜文楷 —— 设计规范见 [docs/prototype/index.html](docs/prototype/index.html)。

## 快速开始

1. 部署好自己的 Halo 2.x 博客（HTTPS + 已备案域名）
2. 用微信开发者工具导入本目录（无 AppID 可选"测试号"）
3. 修改 `config/index.js` 中的 `baseUrl` 为你的博客地址
4. 小程序后台将博客域名加入 `request` 合法域名（真机/体验版必须；开发版可在开发者工具勾选"不校验合法域名"跳过）

## 目录结构

```
├── app.js / app.json / app.wxss   # 入口、全局配置、设计规范与正文样式
├── config/index.js                # 博客地址、名称、评论开关、字体地址
├── utils/
│   ├── request.js                 # wx.request 封装（数组参数 repeat 序列化）
│   ├── api.js                     # Halo API 接口层（路径见 docs/halo-api.md）
│   └── util.js                    # 时间/数字格式化
├── pages/
│   ├── index/                     # 首页：搜索胶囊 + Banner 轮播 + 文章卡片流
│   ├── category/                  # 分类网格 + 标签云
│   ├── posts/                     # 分类/标签下的文章列表
│   ├── post-detail/               # 文章详情：正文渲染 + 点赞 + 评论区
│   └── profile/                   # 我的：博客信息 + 站点统计 + 菜单
└── docs/                          # API 参考、UI 原型
```

## 功能现状

- 已实现：文章列表（置顶排序、左文右图卡片、无封面自适应）、文章详情、分类/标签浏览、点赞、阅读量上报、站点统计
- 评论：UI 已就绪，由 `config.commentEnabled` 或配套插件远程开关控制（提审期间默认关闭）
- 规划中：搜索、评论提交、归档、友链、[mp-html](https://jin-yufeng.gitee.io/mp-html/) 替换 rich-text（代码高亮）、配套 Halo 插件（配置下发）

## 相关文档

- Halo API 参考：[docs/halo-api.md](docs/halo-api.md)
- UI 原型与设计规范：[docs/prototype/index.html](docs/prototype/index.html)
- Halo 官方 API 文档：<https://api.halo.run>

## License

MIT
