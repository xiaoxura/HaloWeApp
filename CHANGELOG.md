# 变更日志

本项目遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [未发布]

## [0.3.0] - 2026-08-01

合规互动 Beta。按 [docs/development-plan-v0.3.0.md](docs/development-plan-v0.3.0.md) 实施，
配套插件 [`plugin-halo-weapp`](https://github.com/xiaoxura/plugin-halo-weapp) v0.1.0 联合验收。

### 新增

- 评论适配层 `utils/adapters/comment.js`：同时兼容 Halo 2.25 分页对象与旧版数组两类
  `replies` 结构（C-01）；评论/回复 HTML 统一转安全纯文本（支持 `<p>`/`<br>`/常见实体，
  过滤脚本、事件属性与不可见内容，不使用富文本渲染用户输入）（C-02）；相对头像补全；
  统一时间、审核/置顶状态与回复数量；缺失 owner/spec/replies 安全降级
- 评论分页：每页 10 条，分页单飞、页间去重、失败保留已加载数据（C-07）；
  回复首屏 5 条，存在 `hasNext` 时提供「展开更多回复」
- 评论/回复弹层 `components/comment-sheet/`：底部弹层适配键盘与安全区；
  昵称 2～20 字、内容 1～500 字（Unicode 字符）实时字数；提交单飞锁与幂等键；
  昵称可由用户选择仅保存本机，正文与会话 token 不持久化；
  首次提交前展示隐私说明并记录已同意的 `privacyPolicyVersion`
- 微信登录短会话 `utils/comment-session.js`：仅在点击提交时 `wx.login`，
  换取 90 分钟不透明 token（仅存内存）；401 后重新登录并最多自动重试一次
- 评论写入安全闭环：昵称+正文经插件登录态、频控、幂等与微信 `msgSecCheck`
  （仅 `pass`）后由插件代理写入 Halo；`published` 刷新列表，`pending` 提示审核后可见；
  错误按稳定业务码分支（频控按 `retryAfter` 提示、远程关闭立即结束表单、
  版本过低引导更新、内容拦截保留表单）
- 回复闭环：点击评论/回复进入回复模式并显示「回复给谁」，可选引用回复；
  提交成功后只刷新对应评论的回复；`replyEnabled=false` 隐藏入口但保留历史回复读取
- 远程配置 v0.3.0 契约：`commentEnabled` 控制读取、`commentOptions.submitEnabled` /
  `replyEnabled` 单独控制写入口（C-04）；写能力 fail-closed——仅本次冷启动实时
  探测并拉取成功、schema 受支持且版本不低于 `minVersion` 才开放；
  降级缓存可展示公告/评论但强制关闭写入口；内置默认配置始终关闭评论
- 首页公告条：可关闭，关闭状态按 `announcement.version` 保存，版本变化后再次展示（C-06）
- 最低版本提示：严格 SemVer 比较（含预发布规则），版本过低提示微信更新机制
  但不锁死阅读；非法版本字符串忽略并记录脱敏诊断
- 测试：111 个用例（新增评论 adapter、会话管理、SemVer、远程配置写能力门禁、
  请求错误体）；`tests/fixtures/` 收录脱敏评论/回复分页与插件配置样本

### 变更

- `utils/request.js`：非 2xx 错误携带解析后的 JSON 错误体（`err.data`），
  供稳定业务码分支使用；解析失败不影响错误分类
- `utils/api.js`：**移除**客户端直连 Halo 的 `addComment` / `addCommentReply`
  写入方法（C-03）；新增配套插件接口（`createPluginSession` / `submitPluginComment` /
  `submitPluginReply`），插件名称与 API 前缀由双端固定协议提供
- 评论列表每页 50 → 10 条，回复 10 → 首屏 5 条 + 按需展开
- `config.version` 升级至 0.3.0
- `config/index.js` 收口为客户端版本与 Halo `baseUrl`；插件名/API 路径改为固定协议常量
- 博客名称、简介、分页大小和字体地址迁移到 `plugin-halo-weapp` Setting 与公开配置的
  `site` 节点；客户端保留非敏感默认值和缓存降级
- 移除本地评论开关与远程端点开关，所有运行时业务配置统一由 Halo 插件下发

### 安全

- AppSecret、微信 access token、OpenID、session_key 只存在于插件服务端；
  小程序包、公开配置与日志中均不出现
- 客户端不得指定 subjectRef group/kind/version、审核状态、HTML、头像、邮箱或网站；
  服务端重新校验并转义
- 会话 token 不写入 storage；OpenID 仅在插件 90 分钟内存会话中使用
- 明确禁止在小程序配置和公开 DTO 中存放 Halo 管理员 PAT；读者端 Public API 无需 PAT，
  长期管理凭据只能留在服务端安全边界内

## [0.2.0] - 2026-08-01

只读 MVP / Release Candidate。按 [docs/development-plan-v0.2.0.md](docs/development-plan-v0.2.0.md) 实施。

### 新增

- 统一数据适配层：`utils/adapters/post.js`（`PostSummary`/`PostDetail`）、
  `utils/adapters/search.js`（`SearchResult`），页面不再直接依赖 Halo 原始响应字段
- `utils/asset.js`：封面、头像、正文图片等 `/upload/...` 相对资源自动补全站点域名（B-02）
- `utils/html.js`：正文按 `content.content` → `content.html` → `content.raw` 顺序兼容选择（B-01），
  清理 `script`/`iframe`/全局 `style`/事件属性/`javascript:` 链接，
  `<shiki-code>` 等自定义标签降级，`pre`/`table` 横向滚动处理
- 搜索页 `pages/search/`：关键词搜索、`<B>` 受控高亮（不渲染任意 HTML）、
  最近搜索历史（本地存储，10 条 LRU，支持逐条复用与一键清除）、
  搜索中/无结果/失败重试状态，结果最多展示 20 条并显示总命中数（B-04）
- `utils/runtime-config.js`：远程配置显式启用策略——未配置 `pluginName`/`endpoint`
  不发起任何请求；先探测插件可用性再拉取；仅接受 JSON 对象并对白名单字段逐项校验；
  非 2xx/HTML/非法字段不写入缓存；缓存带 `fetchedAt` 与 schema 版本，
  过期缓存仅作短时降级；`commentEnabled` 最终兜底始终为 `false`（B-03）
- 自动化测试：`node --test`，68 个用例覆盖 adapter、URL 补全、正文清理、query 序列化、
  请求错误分类、远程配置、搜索历史；`tests/fixtures/` 收录 11 篇真实脱敏详情响应及列表/
  搜索/分类/标签/统计样本
- 点赞状态按文章名本地持久化（LRU 上限 500 条，`utils/likes.js`）（B-09）
- 统一的加载/空数据/错误/重试页面状态（文案与交互各页一致）（B-07）

### 变更

- 详情页正文由原生 `rich-text` 替换为 [mp-html](https://jin-yufeng.gitee.io/mp-html/)
  （小程序 npm 引入）：图片懒加载与点击预览、代码块/表格横向滚动、长按选词复制、
  外链点击复制（无法直接打开时的兜底）
- 首页与分类/标签文章列表共用 `normalizePostSummary`，移除重复转换逻辑（B-05）
- 请求层结构化错误（`type`/`statusCode`/`path`），区分网络错误、超时、HTTP 错误、
  响应格式错误；HTML 登录页等非法响应按 parse 错误处理
- 标签数量改从标签列表分页响应的 `total` 获取，失败显示 `--` 不再伪造 0（B-06）
- "我的"页面移除归档/友链/关于/设置死入口；版本号统一从 `config.version` 读取（B-08）
- 评论开关关闭时不请求评论接口、不渲染评论入口
- 导航参数统一 `encodeURIComponent`，加载页做参数合法性检查
- `tests/`、`docs/` 加入 `packOptions.ignore`，不参与小程序上传

### 修复

- 详情页正文为空：兼容 Halo 2.x 实际返回的 `content.content`/`content.raw` 字段（B-01）
- 作者头像等相对资源加载失败（B-02）
- 阅读量同一页面会话重复上报
- 请求失败后 loading 不结束、缺少重试入口（B-07）
- 下拉刷新与触底加载并发导致重复页/重复文章（单飞互斥）
- 分页失败清空整页数据（改为保留已有列表）

## [0.1.0] - 2026-07-31

首个骨架版本（`e722f25`）：首页文章流、文章详情、分类/标签、评论读取 UI、站点统计。
