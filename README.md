# HaloWeApp

[Halo](https://halo.run) 博客的原生微信小程序客户端。

当前开发版本为 **v0.4.0 RC（动态阅读与微信读者身份 Beta）**。v0.4.0 读取公开文章与
公开 Moment，并通过配套插件提供可退出、可注销的“微信读者”身份；它不是 Halo Console / UC
账号，不具备私有内容或管理权限。

白色主题 · 圆角卡片 · 霞鹜文楷 —— 设计规范见
[docs/prototype/index.html](docs/prototype/index.html)。发布门禁和实测证据见
[docs/release-checklist-v0.4.0.md](docs/release-checklist-v0.4.0.md)。

## 功能概览

- 文章列表、分类/标签、全文搜索、详情、点赞、阅读量和评论/回复；
- 首页“最新瞬间”、Moment 列表/详情/标签，以及 PHOTO、VIDEO、AUDIO、POST 和未知媒体的
  安全展示或降级；
- 文章与 Moment 混合搜索、独立点赞命名空间和可恢复分享深链；
- 用户主动同意隐私政策后登录为微信读者，设置/修改昵称，并可恢复、退出或注销；
- 已认证读者提交文章评论时复用账号短会话；匿名读者仍兼容 v0.3.0 临时评论会话；
- 所有新能力远程开关默认关闭，插件缺失、停用、超时或返回非法响应时文章阅读不受影响。

> v0.4.0 **不提供 Moment 评论/回复、私有 Moment、作者发布、Halo 管理员登录或头像上传**。
> Moment 评论开关仅为 v0.4.1 预留，不能解释为已经可用。

## 环境与版本

| 组件 | 要求 |
| --- | --- |
| Halo | `>= 2.23.0`；发布前需在目标 Halo 版本完成实际部署回归 |
| 配套插件 | [`plugin-halo-weapp`](https://github.com/xiaoxura/plugin-halo-weapp) v0.2.0 |
| Moment 插件 | 可选；`PluginMoments >= 1.15.0`，推荐 v1.16.1 |
| 小程序基础库 | 项目当前固定 3.8.0 |
| 本地测试 | Node.js 20+；测试使用 Node 内置 test runner |

不安装或停用 Moment 插件时，小程序隐藏首页 Moment 模块；文章、分类、标签和文章搜索仍可用。
小程序 v0.3.0 + 配套插件 v0.1.1 是当前已通过双 Halo 本机闭环的回滚候选；v0.1.0 tag
在真实 Halo 中无法正常启动，禁止使用。v0.1.1 正式维护 tag/Release 与目标环境演练完成前，
v0.4.0 RC 回滚门禁仍未关闭。

当前官方 Halo 2.25.4 宿主镜像的逐 jar OSV 审计仍有 24 个去重公告；插件 thin jar 不内嵌这些
依赖，也不能替 Halo 私自覆盖。逐项调用边界已经记录，但 Halo 平台升级或目标环境正式风险接受
仍缺失，因此依赖门禁同样为 FAIL/PENDING。详见
[平台依赖风险审计](docs/evidence/halo-platform-dependency-audit-2026-08-02.md)。

## 快速开始

1. 部署自己的 Halo 2.x 博客（HTTPS + 已备案域名）。
2. 安装并启用配套插件 v0.2.0。首次升级时保持 `momentsEnabled=false`、
   `readerAccountEnabled=false`，评论展示/提交/回复也保持关闭；部署、备份和回滚步骤见
   [插件部署文档](https://github.com/xiaoxura/plugin-halo-weapp/blob/develop/v0.2.0/docs/deployment.md)。
3. 如需公开瞬间，安装并启用 `PluginMoments >= 1.15.0`。
4. 用微信开发者工具导入本目录，并修改 `config/index.js`：

   ```js
   module.exports = {
     version: '0.4.0',
     baseUrl: 'https://<你的 Halo 站点>'
   }
   ```

   该文件会进入公开小程序包，**只能保存版本号和站点 URL**。不要写入 Halo PAT、微信
   AppSecret、OpenID、identityKey、Cookie 或其他长期凭据。
5. 安装依赖并在微信开发者工具执行 **工具 → 构建 npm**：

   ```bash
   npm ci
   ```

   详情正文依赖 [mp-html](https://jin-yufeng.gitee.io/mp-html/)；未生成
   `miniprogram_npm/` 时详情页无法渲染。
6. 在插件设置中填写站点展示、版本和 HTTPS 隐私政策；确认实时公开配置成功后，再按
   “Moment 读取 → 微信读者登录 → 评论”的顺序小范围开启能力。

## 微信合法域名

发布和真机验收时必须开启合法域名校验；仓库中的 `project.config.json` 已设置
`setting.urlCheck=true`。开发者个人若确需临时关闭，只能写入不提交的
`project.private.config.json`，且不得用关闭校验的结果替代发布证据。

| 小程序后台配置 | 必须登记的来源 | 用途 |
| --- | --- | --- |
| `request 合法域名` | `config.baseUrl` 的 HTTPS origin | Halo Public API、插件 config/auth/comment API、Moment API |
| `downloadFile 合法域名` | 站点 origin，以及实际返回图片、视频、音频和字体的每个 HTTPS CDN origin | `<image>`、`<video>`、`InnerAudioContext`、正文附件和 `wx.loadFontFace` |

注意事项：

- 相对资源会补全为站点 origin；绝对 CDN 地址必须逐个登记，不能依赖通配符；
- 若资源发生 30x 跳转，最终落地域名也要登记；不得使用 HTTP、IP 地址或测试端口；
- Moment 内容可能引用站外媒体，开启功能前应从生产公开响应抽取全部 origin；
- 域名已配置并不等于可用，仍须在开启校验的 iOS 与 Android 真机验证图片、视频、音频、字体
  以及切后台/恢复行为。

## 远程配置与安全边界

小程序固定调用配套插件 `/apis/api.weapp.halo.run/v1alpha1`，部署者不能配置插件名或任意
探测路径。公开配置只接受显式白名单：

- `features.moments.enabled` 控制公开 Moment 读取；仍需本次冷启动实时确认
  `PluginMoments` 可用；
- `features.readerAccount.enabled` 只可由本次冷启动实时配置开启；缓存不能开放登录；
- `commentEnabled` 控制文章评论读取；`submitEnabled` / `replyEnabled` 独立控制写入口；
- 所有新开关默认 `false`。超时、HTML、非法 JSON、未知 schema、版本过低或插件停用均
  fail-closed；未过期缓存最多用于只读展示。

读者端只读取 Halo / Moment Public API，**不需要也不得持有管理员 PAT**。评论写入和读者身份
由插件服务端完成 `code2Session`、频控、幂等和微信内容安全检测；AppSecret、OpenID 和
identityKey 不出服务端安全边界。完整 API 说明见 [docs/halo-api.md](docs/halo-api.md)。

## 微信读者身份与隐私

- 首次账号创建只能由用户主动点击登录、同意当前隐私版本并提供 2～20 字昵称触发；
- token、到期时间、OpenID、身份摘要和内部资源名只在内存或服务端安全边界中使用；
- 客户端 storage 只允许 `readerKeepLogin`、白名单 profile（昵称/隐私版本）和共用的
  `privacyConsentVersion`；缓存 profile 不代表已认证；
- 服务端 `WeAppUser` 仅持久化昵称和隐私版本；内部名称来自独立密钥 HMAC，不保存原始
  OpenID；
- 32 字节 identityKey 只保存在配套插件内部 Opaque Secret；早期 RC ConfigMap 会先原值迁移
  再清除旧 key，避免 Halo 删除审计把 ConfigMap.data 写入日志；
- 退出会撤销当前 token 并清理本地资料/登录意愿；注销会删除读者资源并撤销全部关联会话；
- 注销不会自动删除已经公开发表到 Halo 的评论。数据主体请求和已公开评论处置由站点运营者
  按其隐私政策处理。

部署者在开启读者登录前必须完成微信隐私保护指引与站点政策核对。字段、目的、保留和注销
清单见配套插件的
[隐私实施指南](https://github.com/xiaoxura/plugin-halo-weapp/blob/develop/v0.2.0/docs/privacy.md)。

## 目录结构

```text
├── app.js / app.json / app.wxss
├── config/index.js                  # 仅版本号与 Halo HTTPS 地址
├── utils/
│   ├── request.js / api.js          # 请求封装与固定 API 路由
│   ├── runtime-config.js            # 白名单配置、缓存与 fail-closed 门禁
│   ├── moment-capabilities.js       # PluginMoments 冷启动单飞探测
│   ├── auth-session.js              # 微信读者内存会话状态机
│   ├── comment-session.js           # 账号会话复用 + 匿名临时会话回落
│   ├── media-session.js             # 音视频互斥与生命周期释放
│   └── adapters/                    # Post / Comment / Search / Moment 稳定模型
├── components/comment-sheet/        # 文章评论/回复弹层
├── pages/
│   ├── index/                       # 文章首屏 + 异步最新瞬间
│   ├── moments/ / moment-detail/    # Moment 列表与详情
│   ├── search/ / category/ / posts/
│   ├── post-detail/                 # 文章、点赞和评论闭环
│   └── profile/                     # 微信读者登录、资料、退出与注销
├── tests/                           # Node 测试与脱敏/合成契约夹具
└── docs/                            # API、隐私/发布记录、原型和开发计划
```

## 自动化验证

```bash
npm ci
npm test
```

v0.4.0 RC 当前有 162 项 Node 测试，覆盖文章/评论/搜索/Moment adapter、能力探测、媒体生命周期、
点赞迁移、请求错误、远程配置、读者身份、401 单飞恢复和评论会话复用。测试不等于真机证据；
双真机、弱网、合法域名和真实登录/注销结果单独记录在发布清单中。

## 包体积

同一微信开发者工具环境实测：

| 版本 | TOTAL |
| --- | ---: |
| v0.3.0 tag (`290ffa8`) | 162,533 bytes（158.7 KB） |
| v0.4.0 RC 实现基线 (`671246e`) | 236,493 bytes（231.0 KB） |
| 变化 | +73,960 bytes（+72.2 KiB，+45.50%） |

总包仍远低于微信 2 MiB 限制。`project.config.json` 明确排除 `tests/` 和 `docs/`；使用两个
1 MiB canary 文件的预览对比证明 `tests/fixtures` 与 `docs` 未进入上传包。最终上传前仍须重新
运行 preview 并保存 `--info-output` 证据。

## 相关文档

- [变更日志](CHANGELOG.md)
- [v0.4.0 RC 发布清单](docs/release-checklist-v0.4.0.md)
- [Halo 平台依赖风险审计](docs/evidence/halo-platform-dependency-audit-2026-08-02.md)
- [Halo / Moment / 配套插件 API](docs/halo-api.md)
- [v0.4.0 开发计划](docs/development-plan-v0.4.0.md)
- [UI 原型与设计规范](docs/prototype/index.html)
- [配套插件 OpenAPI](https://github.com/xiaoxura/plugin-halo-weapp/blob/develop/v0.2.0/docs/openapi.yaml)
- [Halo 官方 API](https://api.halo.run)

## License

MIT
