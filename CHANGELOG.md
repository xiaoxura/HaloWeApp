# 变更日志

本项目遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [未发布]

目标版本：HaloWeApp v0.4.0，配套 `plugin-halo-weapp` v0.2.0。当前为 RC 开发分支；双真机、
真实登录/注销、生产暗部署与回滚演练完成前不创建 v0.4.0 tag。已确认插件 v0.1.0 tag
不可执行；必须先正式发布并核验 v0.1.1 维护基线。

### 新增

- 固定 `PluginMoments` 名称、Public API 与 available 探测路径；冷启动能力探测仅内存缓存、
  并发单飞，插件缺失/停用/超时/HTML/非法响应时隐藏入口且不影响文章首屏
- 首页异步“最新瞬间”模块、Moment 列表/详情/标签、下拉刷新、分页、分享深链和独立错误状态
- Moment v1.15/v1.16 adapter 与脱敏/合成夹具，覆盖列表、详情、字段缺失及
  PHOTO/VIDEO/AUDIO/POST/未知媒体；匿名列表防御性过滤私有、未审核和已删除内容
- Moment 媒体闭环：最多九图预览、视频不自动播放、单一音频上下文、音视频互斥、页面卸载释放；
  仅接受 HTTPS，POST 与未知媒体提供不可执行降级
- 文章/Moment 混合搜索与正确详情分流；Moment 插件不可用时过滤陈旧索引命中
- Post / Moment 通用 tracker 点赞和本地 `post:` / `moment:` 命名空间；自动迁移 v0.3.0
  裸 Post key
- 运行时配置增加 `features.moments` / `features.readerAccount` 白名单、安全默认值及
  `canReadMoments()` / `canLogin()` 门禁；缓存不能开启身份或写能力
- `utils/auth-session.js` 微信读者内存状态机：主动登录、冷启动恢复、资料刷新/修改、退出、
  注销、临近过期单飞恢复和一次性 401 重试
- Profile 微信读者 UI：默认文字头像、缓存/认证状态区分、昵称与当前隐私同意、保持登录意愿、
  退出确认和注销二次确认；明确既有公开评论不会自动删除
- 配套插件 auth API 客户端：`POST /auth/login`、`GET/PATCH /auth/profile`、
  `DELETE /auth/session`、`DELETE /auth/account`，以及 PATCH/DELETE/204 请求层支持

### 变更

- `config.version`、npm package 与 lockfile 开发版本同步为 0.4.0
- 评论与 Moment 摘要共用 HTML 转安全纯文本实现；Moment 详情复用既有富文本清理与资源补全管线
- 首页文章首屏不等待 Moment 能力探测或读者身份恢复；App 不进行后台主动续期
- 文章评论优先复用真实认证的读者账号 token 与昵称；认证恢复失败才回落 v0.3.0 匿名临时会话，
  评论业务失败不会自动重提
- 微信合法域名校验的共享项目配置改为开启；开发者私有覆盖不能作为发布验证证据

### 安全

- session token、expiresAt、OpenID、身份摘要和内部 readerName 不进入客户端 storage、URL、
  请求体或公开 UI；可缓存 profile 仅重建 `{displayName, privacyPolicyVersion}` 白名单
- 首次账号创建要求页面主动操作、明确同意当前隐私版本和合法昵称；冷启动恢复不携带昵称，
  因而不能静默创建账号
- readerAccount 关闭、实时配置失败、隐私版本变化、版本不满足或二次 401 时全部 fail-closed；
  缓存资料绝不伪造 authenticated 状态
- 注销成功或服务端已不存在时清理全部本地身份数据；普通退出即使网络失败也清理 token、资料
  和登录意愿，同时保留与匿名评论共用的既有隐私同意版本
- Moment 读取不携带 Halo PAT/UC/Console 身份；HTML 继续清理 script/iframe/style/事件属性和
  `javascript:` 链接，未知媒体不执行未知协议

### 验证

- Node 自动化测试 162 项全部通过；覆盖 Moment adapter/能力探测/媒体生命周期、混合搜索、
  点赞迁移、auth-session、评论会话复用及远程配置门禁
- 微信开发者工具 preview 成功：v0.3.0 tag 为 162,533 bytes，v0.4.0 RC 实现基线为
  236,493 bytes，增加 73,960 bytes（45.50%）；1 MiB `docs`/`tests/fixtures` canary 对比证明
  pack ignore 生效
- 自动化和开发者工具结果不替代 iOS/Android 真机、弱网、合法域名、真实账号、插件暗部署或
  回滚证据；未完成项目见 `docs/release-checklist-v0.4.0.md`
- 插件 `hotfix/v0.1.1` / `cfaa16f` 已在 Halo 2.23.3/2.25.4 完成
  v0.2.0 → v0.1.1 → v0.2.0，本机 ConfigMap/Moment/匿名路由闭环与 GitHub CI 通过；正式
  v0.1.1 tag/Release、目标环境 identityKey/WeAppUser 恢复和旧 v0.3.0 客户端仍待完成

### 未包含

- Moment 评论/回复留到 v0.4.1；v0.4.0 不开放相关写入 UI，也不接受客户端自定义主体 GVK

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
