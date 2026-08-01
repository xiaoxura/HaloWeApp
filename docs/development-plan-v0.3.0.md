# HaloWeApp 下一阶段开发计划（v0.3.0）

> 文档状态：可执行草案
> 编制日期：2026-08-01
> 小程序基线：v0.2.0（`ab54e12`）
> 配套插件目标版本：`plugin-halo-weapp` v0.1.0
> 建议周期：18 人日开发与测试 + 3 人日缓冲；按 1 名全栈开发者估算约 4～5 周

## 1. 阶段定位

v0.3.0 定位为 **合规互动 Beta**。本阶段在 v0.2.0 稳定阅读链路之上，完成配套 Halo
插件、远程运营配置和评论写入闭环，使读者能够安全地发表评论，并在插件、微信接口或网络
异常时自动降级为只读模式。

本阶段的核心原则：

1. AppSecret、微信 access token、OpenID 和内容安全调用只能存在于服务端；
2. 小程序不得直接调用 Halo 的评论写入 API；
3. 评论只有通过微信 `msgSecCheck` 且结果为 `pass` 才能写入 Halo；
4. 评论写入能力必须依赖**实时验证成功**的插件配置，不能由本地开关或过期缓存单独开启；
5. 插件停用、配置异常或微信服务不可用时，文章阅读和已发布评论读取不受影响；
6. 先以最少个人信息完成文本评论，头像、图片评论和社交账号体系后置。

> 这里的“小程序不得直接调用 Halo 评论写入 API”仅表示在**写入路径前增加安全网关**，
> 不表示隔离评论数据。插件完成登录、频控和微信内容安全校验后，仍把评论写入 Halo 的
> 同一套 Comment/Reply 资源，并使用与网站相同的文章 `subjectRef`。因此网站发表的评论
> 可以在小程序读取，小程序发表的评论也会出现在网站和 Halo 评论管理中。评论读取仍可
> 直接使用 Halo Public API，无需经过插件。

## 2. v0.2.0 基线确认

### 2.1 已完成能力

- 文章列表、搜索、分类/标签、文章详情和分享主链路；
- `mp-html` 正文渲染、资源地址归一化和正文安全清理；
- 请求错误分类、分页单飞、统一加载/空/错状态；
- 远程配置显式启用、白名单校验和缓存降级；
- 点赞状态、搜索历史等本地持久化；
- 真实 Halo 2.x 响应夹具及自动化测试。

规划时执行 `npm test`，现有 **68 个用例全部通过**。当前 `config.baseUrl` 环境为 Halo
2.25.4，可作为 v0.3.0 的主集成测试环境。

### 2.2 新确认的问题

| 编号 | 现状 | 影响 | 优先级 |
| --- | --- | --- | --- |
| C-01 | Halo 2.25 的 `comment.replies` 是分页对象，当前代码按数组调用 `.map()` | 评论开关开启后，存在评论的文章可能无法加载评论 | P0 |
| C-02 | 评论与回复的 `spec.content` 是 HTML，当前 WXML 按文本输出 | 用户会看到 `<p>` 等原始标签 | P0 |
| C-03 | `utils/api.js` 暴露直接评论写入方法，但没有微信内容安全、身份、频控和幂等 | 不符合 UGC 上线要求 | P0 |
| C-04 | 当前只有 `commentEnabled`，没有区分“展示评论”和“允许写入” | 本地开关或旧缓存可能错误开放写入口 | P0 |
| C-05 | 配套插件仓库、插件 metadata name、API group 和正式契约尚未落地 | 客户端无法真正启用远程能力 | P0 |
| C-06 | `announcement`、`minVersion` 已被配置校验器接受，但页面尚未消费 | 运营配置不完整 | P1 |
| C-07 | 评论列表固定一次取 50 条，回复只取前 10 条，没有独立分页状态 | 评论较多时体验和请求体积不可控 | P1 |
| C-08 | 尚无隐私说明、评论身份资料约束和审核结果反馈 | 无法进入正式提审流程 | P0 |

## 3. 本轮关键技术决策

上一轮留下的 v0.3.0 进入条件在本计划中固定为以下决策。实现中如需变更，必须先更新本
文档和 API 契约，不允许客户端与插件分别猜测。

| 决策项 | 本轮结论 |
| --- | --- |
| 插件仓库 | 独立仓库 `plugin-halo-weapp`；本地开发时与 `HaloWeApp` 同级，不嵌套到小程序仓库 |
| 插件名称 | `metadata.name: plugin-halo-weapp` |
| API group | `api.weapp.halo.run` |
| API 前缀 | `/apis/api.weapp.halo.run/v1alpha1` |
| 插件版本 | v0.1.0，与小程序 v0.3.0 联合验收 |
| Halo 兼容范围 | `>= 2.23.0`；至少测试 2.23.x 和 2.25.4，旧版本继续使用 v0.2 只读能力 |
| Java 基线 | Java 21、Gradle Wrapper；发布依赖必须使用正式版本，不使用 SNAPSHOT |
| 管理界面 | 使用 Halo Setting 表单，不开发自定义 Console 前端 |
| 评论身份 | 昵称必填；v0.3.0 不采集头像、网站，邮箱默认不采集，通知默认关闭 |
| 评论长度 | 1～500 个 Unicode 字符；服务端再次校验，低于微信 2500 字上限 |
| 微信身份 | `wx.login` code 在插件侧调用 `code2Session`，小程序不接触 OpenID/session_key |
| 会话 | 插件签发随机、不透明会话 token，默认 90 分钟有效；仅保存于内存，重启后重新登录 |
| 内容安全策略 | `scene=2`、`version=2`；仅 `pass` 写入，`review`/`risky` 均不落库 |
| 写入策略 | 插件代理写入 Halo Public Comment API，并以多版本集成测试约束兼容性 |
| 发布策略 | 插件先安装且评论关闭 → 小程序发布 → 审核完成后远程开启，可随时远程关闭 |

> `msgSecCheck` 要求 OpenID 对应用户在近两小时内访问过小程序，因此会话有效期不能超过
> 该窗口。遇到登录态过期时，小程序重新执行 `wx.login` 后只重试一次。

## 4. 阶段目标与成功标准

### 4.1 产品目标

- **O1 评论可读**：评论、回复、HTML 内容、相对头像和分页结构正确展示；
- **O2 评论可写**：用户填写昵称和文本后可以安全提交，明确看到发布或待审核结果；
- **O3 安全合规**：所有小程序评论都经过登录、频控、幂等和微信文本安全检测；
- **O4 运营可控**：评论、公告和最低版本要求可在 Halo 后台修改，无需重新发布小程序；
- **O5 可降级**：任一依赖异常时关闭评论写入，但保留阅读和评论读取能力；
- **O6 可部署**：插件 jar、设置说明、联合版本矩阵和回滚流程完整。

### 4.2 可量化成功标准

- 插件和小程序 P0 自动化测试通过率 100%；
- 抽样的所有真实评论响应均可转换，页面不再出现原始 HTML 标签；
- `pass` 内容可写入，`review`/`risky` 内容写入数必须为 0；
- 相同 OpenID 与幂等键的重复请求最多生成 1 条评论；
- 超出频控阈值返回 429，响应包含可重试时间，不调用 Halo 写入接口；
- AppSecret、access token、session_key 和原始 OpenID 在小程序包、公开配置和日志中出现数为 0；
- 插件停用、实时配置失败或配置过期时，评论提交入口在本次会话内关闭；
- Halo 2.23.x 与 2.25.4 各完成一次评论创建、审核状态和回复集成测试；
- iOS、Android 真机各完成登录、提交、拦截、过期重登和重复点击测试；
- 插件安装但 `commentEnabled=false` 时，可安全通过小程序提审。

## 5. 本阶段范围

### 5.1 P0：插件与契约基础

#### A. 建立独立插件仓库

在 `HaloWeApp` 的同级目录中，基于 Halo 官方插件模板创建独立仓库
`plugin-halo-weapp`：

```text
Code/
├── HaloWeApp/                     # 微信小程序仓库
└── plugin-halo-weapp/             # Halo 插件仓库（独立 .git）
```

插件仓库内部建议结构：

```text
plugin-halo-weapp/
├── src/main/java/.../
│   ├── endpoint/                  # config/session/comment CustomEndpoint
│   ├── config/                    # Setting 读取和公开配置映射
│   ├── wechat/                    # code2Session、access token、msgSecCheck
│   ├── comment/                   # 校验、频控、幂等、Halo 网关
│   └── security/                  # 不透明会话与日志脱敏
├── src/main/resources/
│   ├── plugin.yaml
│   └── settings.yaml
├── src/test/
├── docs/openapi.yaml             # 对外接口唯一事实来源
└── gradlew / gradle/
```

插件 v0.1.0 只使用 Halo Setting 生成管理表单，配置项至少包括：

- 小程序 AppID、AppSecret；
- 评论区展示开关、评论提交开关、回复提交开关；
- 评论最大长度；
- 每用户每分钟/每小时频控；
- 公告开关、公告内容和公告版本；
- 小程序最低版本、隐私政策 URL 和隐私政策版本；
- 可选的接口调用超时。

AppSecret 使用密码类型字段，任何 `toString`、异常、HTTP trace 和诊断接口都必须脱敏。
公开配置 DTO 采用显式白名单，不得直接序列化 Setting 对象。

#### B. 固化 API 契约

插件仓库中的 `docs/openapi.yaml` 是唯一契约源；小程序仓库保存响应夹具与手写 adapter，
不复制第二份可独立修改的 OpenAPI 文件。

版本规则：

- 路径保持 `v1alpha1`；
- `schemaVersion: 1` 内只允许增加可选字段；
- 删除、改名、修改字段类型时提升 schema 版本；
- 客户端遇到高于自身支持范围的 schema 时保持只读，不尝试评论写入；
- 所有错误使用稳定业务码，客户端不依赖服务端中文 message 做逻辑判断。

### 5.2 P0：远程配置与安全降级

#### A. 公开配置

```http
GET /apis/api.weapp.halo.run/v1alpha1/config
```

响应草案：

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-01T08:00:00Z",
  "commentEnabled": false,
  "commentOptions": {
    "submitEnabled": false,
    "replyEnabled": false,
    "maxLength": 500,
    "nicknameRequired": true
  },
  "announcement": {
    "enabled": false,
    "version": "",
    "content": ""
  },
  "minVersion": "0.3.0",
  "privacyPolicyUrl": "https://example.com/privacy",
  "privacyPolicyVersion": "2026-08-01"
}
```

兼容约定：

- 保留 v0.2.0 已识别的顶层 `commentEnabled`、`announcement`、`minVersion`；
- `commentEnabled` 控制评论区是否展示，`commentOptions.submitEnabled` 单独控制写入口；
- 本地 `config.commentEnabled` 最多开启评论读取，不能开启 `submitEnabled`；
- 只有本次冷启动已实时完成插件探测和 config 拉取，才允许评论写入；
- 过期或降级缓存可以继续展示公告，但强制覆盖 `submitEnabled/replyEnabled=false`；
- 配置端关闭评论后，已打开的评论表单在最终提交前仍需由服务端再次校验开关。

#### B. 公告与最低版本

- 首页展示可关闭的公告条，关闭状态按 `announcement.version` 保存；
- `minVersion` 使用严格 SemVer 比较；
- 当前版本低于最低版本时提示使用微信更新机制，但不锁死文章阅读；
- 版本过低时强制关闭所有写能力，避免旧客户端调用不兼容接口；
- 非法版本字符串忽略并记录脱敏诊断，不影响启动。

### 5.3 P0：微信会话与内容安全

#### A. 登录换取短会话

```http
POST /apis/api.weapp.halo.run/v1alpha1/session
Content-Type: application/json

{ "code": "wx.login 返回的一次性 code" }
```

插件调用微信 `code2Session` 后返回：

```json
{
  "sessionToken": "随机不透明 token",
  "expiresIn": 5400
}
```

安全要求：

- code 只使用一次，不写日志、不缓存原文；
- OpenID 和 session_key 不返回小程序；
- token 至少 256 bit 随机熵，通过 `X-WeApp-Session` 请求头传递；
- 会话内只保存提交安全检测所需 OpenID，不持久化 session_key；
- 内存会话到期或插件重启后返回稳定的 `SESSION_EXPIRED`；
- 同一客户端收到 401 后重新登录并最多自动重试一次，禁止无限重试；
- 登录、会话和 AppSecret 相关日志使用请求 ID，不打印凭据。

#### B. 微信 access token

- 插件服务端获取并缓存微信 access token；
- 按微信返回过期时间提前刷新，刷新过程单飞，防止并发击穿；
- 收到 token 失效错误时清缓存并最多重试一次；
- 微信超时、限额和系统错误映射为稳定业务码，不开放评论写入；
- 未上架小程序的低日调用额度纳入测试计划，避免自动化测试消耗真实额度。

#### C. 文本安全策略

每次评论和回复写入前调用：

```text
POST https://api.weixin.qq.com/wxa/msg_sec_check
version = 2
scene = 2（评论）
openid = 当前短会话对应 OpenID
content = 昵称 + 换行 + 评论正文
```

- `result.suggest=pass`：继续写入；
- `review` 或 `risky`：不写入，返回统一可理解提示，不向客户端暴露命中关键词；
- 微信接口无结果、超时、限额或返回未知值：按失败关闭处理，不绕过检测；
- 日志只记录 `trace_id`、suggest、label、耗时和内部哈希用户标识；
- 评论正文限制 500 字，昵称限制 2～20 字，服务端按 Unicode 字符重新计算。

### 5.4 P0：安全评论写入

#### A. 发表评论

```http
POST /apis/api.weapp.halo.run/v1alpha1/comments
X-WeApp-Session: <sessionToken>
X-Idempotency-Key: <client-generated-key>

{
  "postName": "post metadata.name",
  "displayName": "访客昵称",
  "content": "纯文本评论",
  "privacyConsentVersion": "2026-08-01"
}
```

服务端处理顺序必须固定：

1. 校验实时总开关、会话、请求体和隐私协议版本；
2. 校验文章存在、公开且 `allowComment=true`；
3. 检查幂等键和频控；
4. 调用微信文本安全；
5. 对昵称和正文做 HTML 转义，由服务端生成 Halo 所需 `raw/content`；
6. 通过 `HaloCommentGateway` 代理 Halo Public Comment API；
7. 根据 Halo `approved` 状态返回 `published` 或 `pending`；
8. 缓存幂等结果，重复请求返回第一次结果。

客户端不得传入任意 `group`、`kind`、`version`、`approved`、`hidden`、HTML、头像、邮箱或网站；
插件固定构造 Post 的 `subjectRef`，`allowNotification=false`。

成功响应：

```json
{
  "requestId": "req_xxx",
  "status": "published",
  "commentName": "comment-name"
}
```

#### B. 频控与幂等

- 默认每个 OpenID 每分钟 3 次、每小时 20 次，后台可调但设安全上下限；
- 额外按来源 IP 做宽松阈值，正确处理受信任代理头，未配置时不盲信客户端 header；
- 日志和频控 key 使用带服务端 salt 的 OpenID 哈希；
- 幂等键按“用户 + 路由 + key”隔离，默认保留 10 分钟；
- 相同 key 但请求体不同返回 `IDEMPOTENCY_CONFLICT`；
- 频控发生在微信与 Halo 外部调用之前。

#### C. Halo 写入网关

- 插件内部定义 `HaloCommentGateway`，业务层不直接依赖 Halo 内部非公开实现类；
- v0.1.0 首选代理同站点 Public Comment API，并保留结构化错误映射；
- 验证 Halo 的游客评论设置和审核策略，不在插件中伪造管理员身份或内置 PAT；
- 插件启动诊断应能识别“评论组件未启用/游客评论关闭”，但不得泄露后台配置；
- 2.23.x、2.25.4 的请求与响应固定为集成测试夹具；
- 如 PoC 证明同站点 HTTP 代理不稳定，V030-01 必须先形成 ADR 选择受支持的 Halo API，
  不得通过反射调用内部 Service。

### 5.5 P0：小程序评论读取与提交

#### A. 评论 adapter 与分页

新增：

```text
utils/adapters/comment.js
utils/comment-session.js
components/comment-sheet/
tests/fixtures/comments-*.json
```

评论 adapter 需要：

- 同时兼容 `replies: []` 与 `replies: { items, hasNext, ... }`；
- 评论和回复 HTML 转为安全纯文本，支持 `<p>`、`<br>` 和常见 HTML 实体；
- 过滤脚本、事件属性和不可见内容，不使用富文本执行用户输入；
- 补齐相对头像 URL；
- 统一时间、审核状态、置顶状态和回复数量；
- 缺失 owner/spec/replies 时安全降级。

评论列表每页 10～20 条，分页失败保留已加载数据；回复默认显示首屏，存在 `hasNext` 时提供
“展开更多回复”，不再一次固定拉取 50 条评论。

#### B. 评论表单

- 使用底部弹层，适配键盘、安全区和长文本滚动；
- 昵称 2～20 字、内容 1～500 字，显示实时字数；
- 提交按钮具备单飞锁和幂等键，重复点击不重复写入；
- 昵称可由用户选择是否仅保存在本机，正文和会话 token 不持久化；
- 首次提交前展示隐私说明，并记录已同意的 `privacyPolicyVersion`；
- 仅在用户点击提交时调用 `wx.login`，不延长小程序冷启动；
- `published` 时刷新评论首屏，`pending` 时提示“审核后可见”，不伪造已发布评论；
- 页面卸载、评论被远程关闭或版本过低时立即结束表单并清理正文；
- 移除/停用客户端直连 Halo 的 `addComment`、`addCommentReply` 写入方法。

### 5.6 P1：回复闭环

```http
POST /apis/api.weapp.halo.run/v1alpha1/comments/{commentName}/replies
```

请求继续使用 `X-WeApp-Session` 和 `X-Idempotency-Key`，正文规则与评论一致。可选
`quoteReplyName` 只能引用当前评论下已公开的回复。

- 点击评论或回复进入回复模式，并明确显示“回复给谁”；
- 服务端校验父评论存在且属于当前公开文章；
- 回复同样执行频控、幂等和 `msgSecCheck`；
- 提交成功后只刷新对应评论回复，不重载整篇文章；
- `replyEnabled=false` 时隐藏回复入口，但保留历史回复读取。

若 P0 延迟，回复能力可以从 v0.3.0 RC 移出，不得压缩内容安全与测试时间换取排期。

### 5.7 P2：有余量再做

- 评论草稿仅在当前页面会话内恢复；
- 评论列表 skeleton 和定位到新评论；
- 公告支持简单链接，但只允许 HTTPS 且点击后复制；
- 插件诊断页输出脱敏的微信连通性、Halo 评论配置和版本信息；
- 通过 ETag/`If-None-Match` 降低公开配置请求流量。

## 6. 明确不在本阶段的内容

| 功能 | 延后原因 | 建议版本 |
| --- | --- | --- |
| 评论头像上传 | 涉及文件上传、持久化与图片内容安全检测 | v0.4.0+ |
| 图片、语音、视频评论 | 需 `mediaCheckAsync`、异步审核和对象存储 | 暂不排期 |
| 邮件通知 | 需要收集邮箱、通知确认和更完整隐私方案 | v0.4.0+ |
| 评论删除、举报、拉黑 | 需要用户身份持久化和管理策略 | v0.4.0+ |
| Halo 自定义评论管理 UI | v0.3 使用 Halo 现有评论审核能力 | 暂不排期 |
| 插件应用市场发布 | 本轮先提供可安装 jar 和升级文档 | v0.3.1+ |
| 归档、友链、关于、设置 | 与合规评论主链路无直接依赖 | v0.4.0 |
| 收藏、跨设备账号体系 | 需要长期用户身份与数据存储设计 | v0.5.0+ |
| 博主管理/PAT | 权限风险高，不属于读者端 | 暂不排期 |

## 7. 总体架构与时序

```text
┌──────────────┐       HTTPS       ┌───────────────────────────┐
│ 微信小程序    │ ─────────────────▶ │ plugin-halo-weapp         │
│ v0.3.0       │                    │ - config / session        │
│              │ ◀───────────────── │ - rate limit / idempotency│
└──────────────┘                    │ - msgSecCheck / gateway   │
        │                           └──────────┬────────┬────────┘
        │ GET 文章/评论                         │        │
        └─────────────────────────────────────┘        │
                                           微信 API    │ Halo Public API
                                              ▼        ▼
                                      code2Session   Comment/Reply
                                      access token   审核与持久化
                                      msgSecCheck
```

评论提交时序：

```text
用户提交
  → 小程序本地校验并生成幂等键
  → wx.login（无有效短会话时）
  → 插件 code2Session，返回不透明 sessionToken
  → 插件校验开关/文章/频控/幂等
  → 微信 msgSecCheck(scene=2)
  → 仅 pass 时代理 Halo Comment API
  → 返回 published 或 pending
  → 小程序刷新评论或显示审核提示
```

## 8. 错误契约

失败响应统一为：

```json
{
  "code": "RATE_LIMITED",
  "message": "操作过于频繁，请稍后再试",
  "requestId": "req_xxx",
  "retryAfter": 30
}
```

首批稳定业务码：

| HTTP | code | 客户端行为 |
| ---: | --- | --- |
| 400 | `VALIDATION_ERROR` | 标记字段并保留表单 |
| 401 | `SESSION_REQUIRED` / `SESSION_EXPIRED` | 重新 `wx.login`，最多重试一次 |
| 403 | `COMMENT_DISABLED` / `REPLY_DISABLED` | 关闭表单并刷新运行时配置 |
| 404 | `POST_NOT_FOUND` / `COMMENT_NOT_FOUND` | 提示内容已不存在 |
| 409 | `COMMENT_NOT_ALLOWED` / `IDEMPOTENCY_CONFLICT` | 停止提交并提示 |
| 422 | `CONTENT_REVIEW` / `CONTENT_RISKY` | 不落库，提示修改内容 |
| 426 | `CLIENT_UPDATE_REQUIRED` | 关闭写能力并引导更新 |
| 429 | `RATE_LIMITED` | 根据 `retryAfter` 禁用提交按钮 |
| 502/503 | `WECHAT_UNAVAILABLE` / `HALO_UNAVAILABLE` | 保留表单，允许稍后手动重试 |

客户端只根据 `code` 决定行为；`message` 用于展示，未知 code 使用统一失败提示并保留
`requestId` 供排查。

## 9. 隐私与安全基线

- 小程序隐私保护指引中声明昵称、评论内容和服务端临时 OpenID 的处理目的；
- 隐私政策必须提供 HTTPS URL，并与远程配置中的版本对应；
- v0.3.0 不请求头像，不采集邮箱、网站、手机号和地理位置；
- OpenID 仅在 90 分钟内存会话中使用，不写入 Halo Comment、不输出到日志；
- 日志用户标识使用服务端 salt 的不可逆 HMAC，不使用普通 SHA 哈希；
- 插件不得暴露通用 HTTP 代理、任意 subjectRef 或可由客户端指定的 Halo API 路径；
- 请求体、header、URL 和异常日志均设置大小上限与脱敏策略；
- 评论内容始终按纯文本接收并由服务端转义，客户端 HTML 不可信；
- AppSecret 不进入 Git、jar 资源、公开配置、测试夹具或前端包；
- 发布前执行依赖漏洞、凭据和日志关键字扫描；
- 明确说明插件只能保证小程序写入链路经过检测，不替代博客 Web 端自身的反滥用措施。

## 10. 任务拆分与估算

估算以 1 名同时熟悉原生小程序、Java/Spring WebFlux 和 Halo 插件的开发者为基准，不含
微信审核、Halo 应用市场审核和隐私政策法务审阅时间。

| 任务 ID | 任务 | 优先级 | 估算 | 依赖 | 交付物 |
| --- | --- | --- | ---: | --- | --- |
| V030-01 | 威胁模型、ADR、OpenAPI 和真实评论夹具 | P0 | 1.0 人日 | 无 | 契约与写入 PoC 结论 |
| V030-02 | 插件仓库、Gradle、CI、plugin/settings 配置 | P0 | 1.5 人日 | V030-01 | 可安装空插件 jar |
| V030-03 | config endpoint、Schema v1、客户端配置升级 | P0 | 1.5 人日 | V030-01/02 | 双端配置契约与测试 |
| V030-04 | code2Session、access token 缓存和短会话 | P0 | 2.0 人日 | V030-02 | 微信服务客户端与会话 |
| V030-05 | 频控、幂等、日志脱敏与稳定错误码 | P0 | 1.5 人日 | V030-04 | 安全中间层 |
| V030-06 | msgSecCheck pass/review/risky 策略 | P0 | 1.5 人日 | V030-04/05 | 内容安全服务与测试 |
| V030-07 | HaloCommentGateway、评论写入和审核状态映射 | P0 | 1.5 人日 | V030-01/05/06 | 插件评论 endpoint |
| V030-08 | 评论 adapter、HTML 转文本、评论/回复分页 | P0 | 1.5 人日 | V030-01 | 客户端读取链路与测试 |
| V030-09 | 评论弹层、隐私确认、登录与提交状态机 | P0 | 2.0 人日 | V030-03/04/07/08 | 客户端评论提交闭环 |
| V030-10 | 回复 endpoint、回复模式与局部刷新 | P1 | 1.25 人日 | V030-07/09 | 回复闭环 |
| V030-11 | 公告、最低版本提示和写能力降级 | P1 | 0.75 人日 | V030-03 | 运营配置消费 |
| V030-12 | 双端测试、真机联调、部署文档与 RC 修复 | P0 | 2.0 人日 | 全部 P0 | 测试报告、jar、v0.3.0 RC |

**合计：18 人日；建议另保留 3 人日风险缓冲。**

## 11. 里程碑

### M0：契约与安全设计冻结（第 1 天）

- OpenAPI、错误码、配置 Schema、威胁模型和 Halo 写入 PoC 完成；
- 插件标识、兼容版本、会话和隐私字段冻结；
- 保存并脱敏真实评论、回复响应夹具。

退出条件：小程序和插件可以基于同一契约独立开发，Halo 写入路径不存在未决阻断项。

### M1：插件基础与微信会话（第 2～5 天）

- 插件可构建、安装、升级和卸载；
- Setting 和公开 config endpoint 可用；
- code2Session、access token 缓存和短会话完成；
- AppSecret 与 OpenID 日志脱敏测试通过。

退出条件：真实小程序可获取短会话，插件异常时客户端保持只读。

### M2：安全评论写入（第 6～9 天）

- 频控、幂等、`msgSecCheck` 和 HaloCommentGateway 完成；
- pass/review/risky、超时、限额和 Halo 审核状态测试通过；
- 关闭评论后所有写请求在外部调用前被拒绝。

退出条件：插件集成测试证明只有 pass 内容能生成且最多生成一条评论。

### M3：小程序评论闭环（第 10～14 天）

- 修复 comments/replies 实际响应适配；
- 评论分页、回复展开、评论弹层、隐私确认和提交状态完成；
- session 过期重登、远程关闭和页面卸载行为正确。

退出条件：iOS/Android 均可完成发布与待审核两条路径，不显示原始 HTML。

### M4：运营配置与回复（第 15～16 天）

- 公告和最低版本提示上线；
- 回复能力完成，或在不影响 P0 的前提下明确移至 v0.3.1；
- 小程序与插件版本兼容矩阵完成。

退出条件：管理员可远程关闭全部写能力，旧客户端不会误开放写入口。

### M5：发布候选（第 17～18 天）

- Halo 2.23.x、2.25.4 联合回归完成；
- 安全、凭据、依赖和包体检查完成；
- 插件 jar、部署说明、隐私清单、CHANGELOG 和回滚说明完成；
- 进入 3 人日缓冲期，只处理缺陷，不新增功能。

## 12. 验收清单

### 12.1 插件与配置

- [ ] 插件可在 Halo 2.23.x、2.25.4 安装、启用、停用、升级和卸载；
- [ ] 默认评论和回复开关为关闭；
- [ ] config 响应不包含 AppSecret、OpenID、内部异常或任意 Setting 字段；
- [ ] Schema 版本未知、HTML 响应、超时和旧缓存均不能开启写能力；
- [ ] 后台关闭开关后，新写请求立即失败；
- [ ] 公告关闭状态按版本生效，最低版本比较符合 SemVer。

### 12.2 会话与内容安全

- [ ] 有效 `wx.login` code 可换取 90 分钟不透明 token；
- [ ] 无效、重复、过期 code 返回稳定错误且不泄露微信原始响应；
- [ ] 会话过期后客户端只重新登录和重试一次；
- [ ] access token 并发刷新只有一个上游请求；
- [ ] pass 内容进入 Halo，review/risky 内容不进入 Halo；
- [ ] 微信超时、限额、未知 suggest 和 61010 均按失败关闭处理；
- [ ] AppSecret、access token、session_key、OpenID 未出现在日志与测试快照。

### 12.3 频控、幂等与写入

- [ ] 超过分钟/小时阈值在调用微信和 Halo 前返回 429；
- [ ] 相同幂等键并发提交只生成一条评论；
- [ ] 相同幂等键不同请求体返回冲突；
- [ ] 客户端不能指定 subject group、HTML、审核状态、头像或任意 Halo 路径；
- [ ] 不存在、私有、已回收或禁止评论的文章不能写入；
- [ ] Halo 自动审核和人工审核两种配置分别返回 published/pending；
- [ ] Halo 不可用时保留客户端表单，可手动重试但不自动重复写入。

### 12.4 评论读取与交互

- [ ] `replies` 数组和分页对象两类夹具均可转换；
- [ ] `<p>`、`<br>`、HTML 实体正常转成纯文本，脚本和事件属性被移除；
- [ ] 评论和回复分页不重复、不丢失，失败保留已有数据；
- [ ] 昵称、内容长度和空白字符双端校验一致；
- [ ] 快速连续点击提交只有一个进行中请求；
- [ ] published 刷新评论，pending 只显示审核提示；
- [ ] 评论远程关闭、版本过低和页面卸载时表单安全退出；
- [ ] 评论关闭时不调用 session、msgSecCheck 或评论写入接口。

### 12.5 隐私、发布与回滚

- [ ] 隐私保护指引包含本轮实际收集和处理的信息；
- [ ] 未同意当前隐私版本时不能提交；
- [ ] iOS/Android 真机完成正常、风险、限流、断网和过期场景；
- [ ] 插件先关闭评论安装，小程序审核期间无 UGC 入口；
- [ ] 远程关闭评论后无需发版即可回退为 v0.2 只读体验；
- [ ] 插件卸载后小程序无未捕获异常，文章主链路保持可用；
- [ ] 发布产物、版本号、配置示例、合法域名和升级说明一致。

## 13. 发布门禁（Definition of Done）

v0.3.0 只有同时满足以下条件才可完成：

1. V030-01～V030-09、V030-12 全部完成，P0 缺陷为 0；
2. 插件与小程序自动化测试全部通过，Halo 双版本和双真机矩阵完成；
3. `review`/`risky`、未知结果及微信异常均有“未写入 Halo”的可验证证据；
4. 凭据扫描和日志测试确认敏感信息未进入客户端、仓库、jar 或日志；
5. 评论开关、版本门槛、实时配置和过期缓存全部采用 fail-closed；
6. OpenAPI、Setting、README、部署、隐私、CHANGELOG 和回滚文档齐全；
7. `plugin-halo-weapp` v0.1.0 jar 与 HaloWeApp v0.3.0 RC 联合验收；
8. 生产上线仍保持 `commentEnabled=false`，待小程序审核和线上只读冒烟通过后远程开启；
9. 上一版本 v0.2.0 和插件关闭开关均可作为回滚路径。

P1 回复如未完成，可明确进入 v0.3.1；公告和最低版本若缺失，不影响评论 P0 安全门禁，
但不得在配置中宣称能力已启用。

## 14. 分阶段上线与回滚

### 阶段 A：插件暗部署

1. 安装插件 v0.1.0；
2. 配置 AppID/AppSecret、隐私 URL，保持评论/回复关闭；
3. 验证 config、session、微信连通性和 Halo 评论配置；
4. 确认公开 config 无敏感字段。

### 阶段 B：小程序发布

1. 发布 v0.3.0，默认只读；
2. 验证文章、搜索、详情和历史评论无回归；
3. 完成微信隐私声明与审核；
4. 观察插件和小程序错误率，不开放评论。

### 阶段 C：灰度开放

1. 先开启评论读取，再开启 `submitEnabled`；
2. 使用少量真实账号测试 pass、审核中、重复提交和限流；
3. 观察微信限额、内容安全结果、Halo 审核队列和 5xx；
4. 指标稳定后再开启回复。

### 回滚

- 一级：远程设置 `submitEnabled/replyEnabled=false`，立即关闭写入；
- 二级：设置 `commentEnabled=false`，隐藏整个评论区；
- 三级：停用插件，客户端自动回落本地只读默认；
- 四级：回滚小程序到 v0.2.0；插件保留关闭状态以便排查。

## 15. 风险与应对

| 风险 | 可能性/影响 | 应对 |
| --- | --- | --- |
| Halo 评论内部 API 非插件稳定 API | 高/高 | V030-01 先做网关 PoC；只依赖公开 API；双版本集成测试；禁止反射内部 Service |
| 微信 msgSecCheck 依赖近两小时 OpenID | 高/高 | 90 分钟短会话；401/61010 重新登录一次；失败关闭 |
| 未上架小程序内容安全日额度低 | 高/中 | 单元测试全部 mock；真实接口只跑受控冒烟；记录额度错误 |
| 插件返回旧缓存导致误开评论 | 中/高 | 写能力必须实时探测成功；缓存只读降级；提交时服务端再校验 |
| AppSecret 在设置或日志泄露 | 中/高 | 密码字段、日志脱敏、凭据扫描、最小管理员权限和备份安全说明 |
| 评论重复写入 | 中/高 | 双端单飞 + 服务端幂等键 + 结果缓存 + 并发测试 |
| 恶意刷接口消耗微信额度 | 高/高 | 会话、OpenID/IP 频控在 msgSecCheck 前执行；请求体上限；指标告警 |
| review/risky 处理不一致 | 中/高 | 只允许 pass；未知结果一律失败关闭；契约测试固定 |
| Halo 审核状态与响应版本差异 | 中/中 | Gateway 适配与真实夹具；published/pending 只由服务端映射 |
| 隐私说明与实际字段不一致 | 中/高 | v0.3 最小化采集；发布清单逐字段核对；变更字段需同步隐私版本 |
| 单人跨 Java/小程序开发周期偏差 | 中/中 | 先 P0 后 P1；回复可拆 v0.3.1；保留 3 人日缓冲 |

## 16. 下一阶段建议（v0.4.0）

v0.3.0 稳定运行至少一个观察周期后，再规划内容增强与用户能力：

1. 归档、友链、关于页面；
2. 评论删除/举报和更完整的用户身份；
3. 头像上传与图片内容安全；
4. 邮件通知和回复订阅；
5. 插件应用市场发布、升级迁移和诊断页面；
6. 收藏与跨设备同步的身份/存储方案。

进入 v0.4.0 前应至少具备：评论风险拦截率、微信接口失败率、Halo 写入失败率、审核积压和
远程关闭演练记录，避免在互动链路尚不稳定时继续扩张个人数据与媒体能力。

## 17. 参考资料

- 微信文本内容安全识别：<https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_msgseccheck.html>
- 微信小程序登录凭证校验：<https://developers.weixin.qq.com/miniprogram/dev/server/API/user-login/api_code2session.html>
- Halo 2.25 插件开发介绍：<https://docs.halo.run/developer-guide/plugin/introduction>
- Halo API 参考（本仓库）：[halo-api.md](halo-api.md)
- 上一阶段计划：[development-plan-v0.2.0.md](development-plan-v0.2.0.md)
