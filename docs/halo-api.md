# Halo 2.x API 参考（微信小程序开发用）

> 本文档整理自 [Halo 官方开发文档](https://docs.halo.run/developer-guide/restful-api/introduction) 与
> [uni-halo](https://github.com/ialley-workshop-open/uni-halo) 项目的实际调用代码，供本小程序开发参考。
>
> 在线 API 文档：<https://api.halo.run>（可按 Halo 版本切换）

## 项目组成

本项目为开源项目，最终产出两部分：

- **微信小程序端**（本仓库）：面向读者的小程序客户端。
- **Halo 配套插件**（独立仓库，如 `plugin-halo-weapp`）：安装在 Halo 侧，负责小程序的
  配置下发与管理（评论开关、公告等）。插件为**可选增强**——小程序未检测到插件时使用
  内置默认配置，核心功能不受影响。

## 0. 通用约定

- **Base URL**：`https://<你的博客域名>`，下文所有路径均为相对路径。
- **认证**：读取类接口走 Public API，**无需认证**；写/管理类接口使用个人令牌（PAT）：
  请求头加 `Authorization: Bearer pat_xxxxxxxx`（在 Halo 个人中心 → 个人令牌创建）。
  注意：Basic Auth 自 Halo 2.20 起默认关闭，不要使用。
- **分页参数**：`page`（从 1 开始）、`size`。
- **排序参数**：`sort`，格式为 `字段,方向`，可重复传多个，例如：
  `sort=spec.pinned,desc&sort=spec.publishTime,desc`（数组用 repeat 方式序列化）。
- **筛选参数**：
  - `fieldSelector`：按 spec 字段过滤，如 `spec.hideFromList=false`。
  - `labelSelector`：按 label 过滤，如 `content.halo.run/published=true`。
- **分页响应结构**：`{ page, size, total, items: [...], first, last, hasNext, hasPrevious, totalPages }`。
- 数组类查询参数需用 `arrayFormat: repeat` 序列化（即同一 key 重复出现）。

## 1. 内容 API（Public，无需认证）

路径前缀：`/apis/api.content.halo.run/v1alpha1`

### 文章 Post

| 功能 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 文章列表 | GET | `/apis/api.content.halo.run/v1alpha1/posts` | 参数：`page`、`size`、`sort`、`fieldSelector`、`labelSelector`、`keyword` |
| 文章详情 | GET | `/apis/api.content.halo.run/v1alpha1/posts/{name}` | `name` 为文章的 metadata.name |

文章列表典型调用（首页）：

```
GET /apis/api.content.halo.run/v1alpha1/posts?page=1&size=5&sort=spec.pinned,desc&sort=spec.publishTime,desc
```

### 分类 Category

| 功能 | 方法 | 路径 |
| --- | --- | --- |
| 分类列表 | GET | `/apis/api.content.halo.run/v1alpha1/categories` |
| 分类下的文章 | GET | `/apis/api.content.halo.run/v1alpha1/categories/{name}/posts` |

### 标签 Tag

| 功能 | 方法 | 路径 |
| --- | --- | --- |
| 标签列表 | GET | `/apis/api.content.halo.run/v1alpha1/tags` |
| 标签下的文章 | GET | `/apis/api.content.halo.run/v1alpha1/tags/{name}/posts` |

### 自定义页面 SinglePage

| 功能 | 方法 | 路径 |
| --- | --- | --- |
| 页面列表 | GET | `/apis/api.content.halo.run/v1alpha1/singlepages` |
| 页面详情 | GET | `/apis/api.content.halo.run/v1alpha1/singlepages/{name}` |

## 2. 站点公共 API（Public，前缀 /apis/api.halo.run/v1alpha1）

### 评论 Comment

| 功能 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 评论列表 | GET | `/apis/api.halo.run/v1alpha1/comments` | 见下方参数 |
| 发表评论 | POST | `/apis/api.halo.run/v1alpha1/comments` | 见下方请求体 |
| 回复列表 | GET | `/apis/api.halo.run/v1alpha1/comments/{commentName}/reply` | |
| 发表回复 | POST | `/apis/api.halo.run/v1alpha1/comments/{commentName}/reply` | |

评论列表查询参数（按文章过滤）：

```json
{
  "group": "content.halo.run",
  "kind": "Post",
  "version": "v1alpha1",
  "name": "<文章的 metadata.name>",
  "page": 1,
  "size": 50,
  "withReplies": true,
  "replySize": 10
}
```

发表评论请求体：

```json
{
  "allowNotification": true,
  "raw": "评论内容",
  "content": "评论内容",
  "owner": {
    "avatar": "https://.../avatar.png",
    "displayName": "昵称",
    "email": "user@example.com",
    "website": "https://..."
  },
  "subjectRef": {
    "group": "content.halo.run",
    "kind": "Post",
    "name": "<文章的 metadata.name>",
    "version": "v1alpha1"
  }
}
```

发表回复请求体（`quoteReply` 可选，为被引用的回复名）：

```json
{
  "allowNotification": true,
  "raw": "回复内容",
  "content": "回复内容",
  "owner": { "avatar": "...", "displayName": "...", "email": "...", "website": "..." },
  "quoteReply": "<被引用的 reply name，可选>"
}
```

> 评论相关能力依赖 Halo 评论组件（官方评论插件/Comment Widget），需后台开启且允许游客评论；
> 新评论可能需要审核后才会出现在列表中。

### 搜索

| 功能 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 全文搜索 | POST | `/apis/api.halo.run/v1alpha1/indices/-/search` | body 含 `keyword`、`limit` 等 |

### 统计与计数

| 功能 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 博客统计 | GET | `/apis/api.halo.run/v1alpha1/stats/-` | 文章数/评论数/访问量等 |
| 文章点赞 | POST | `/apis/api.halo.run/v1alpha1/trackers/upvote` | body 见下 |
| 计数（浏览量） | POST | `/apis/api.halo.run/v1alpha1/trackers/counter` | 上报阅读量 |

upvote / counter 请求体（tracker 形式）：

```json
{
  "group": "content.halo.run",
  "plural": "posts",
  "name": "<文章的 metadata.name>"
}
```

### 插件检测

| 功能 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 插件是否可用 | GET | `/apis/api.plugin.halo.run/v1alpha1/plugins/{name}/available` | 调用插件 API 前先探测 |

## 3. 插件提供的 Public API（需安装对应插件）

### 瞬间 Moments（moment 插件）

| 功能 | 方法 | 路径 |
| --- | --- | --- |
| 瞬间列表 | GET | `/apis/api.moment.halo.run/v1alpha1/moments` |
| 瞬间详情 | GET | `/apis/api.moment.halo.run/v1alpha1/moments/{name}` |

> 部分瞬间可能设为登录可见，此时需带 PAT。

### 图库 Photos（photo 插件）

| 功能 | 方法 | 路径 |
| --- | --- | --- |
| 相册分组 | GET | `/apis/api.photo.halo.run/v1alpha1/photogroups` |
| 照片列表 | GET | `/apis/api.photo.halo.run/v1alpha1/photos` |

### 友链 Links（link 插件）

| 功能 | 方法 | 路径 |
| --- | --- | --- |
| 友链分组 | GET | `/apis/api.link.halo.run/v1alpha1/linkgroups` |
| 友链列表 | GET | `/apis/api.link.halo.run/v1alpha1/links` |

## 4. 配套插件（plugin-halo-weapp，自研）

### 为什么需要它

小程序的部分能力需要**不发版就能调整**，由 Halo 后台统一控制：

- **评论开关**（核心诉求）：个人主体小程序含 UGC（评论/留言）功能在审核时容易被驳回，
  需要能在提审版本关闭评论、过审后远程开启。
- 公告、最低版本要求（`minVersion`）：运营调整与接口不兼容升级时提示用户更新。
- **评论写入安全网关**：AppSecret、微信登录态与内容安全检测只能存在于服务端，
  小程序不直接调用 Halo 评论写入 API。

### 插件形态

- 标准 Halo 插件（Java 21 + Gradle，独立仓库
  [plugin-halo-weapp](https://github.com/xiaoxura/plugin-halo-weapp)），发布 jar 手动安装。
- **配置项直接用 Halo 的 Setting 机制**（插件 `settings.yaml` 声明表单，Console 自动渲染设置页），
  配置持久化在 Halo 的 ConfigMap 中。
- 对外暴露公开的 CustomEndpoint（匿名角色模板聚合），无需 Halo 账号。

### 公开 API（group：`api.weapp.halo.run`，前缀 `/apis/api.weapp.halo.run/v1alpha1`）

| 功能 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 公开配置 | GET | `/config` | 站点展示/分页/字体/评论/公告/版本/隐私（白名单 DTO） |
| 微信登录短会话 | POST | `/session` | `wx.login` code 换 90 分钟不透明 token |
| 发表评论 | POST | `/comments` | 登录态+频控+幂等+msgSecCheck 后代理写入 |
| 回复评论 | POST | `/comments/{commentName}/replies` | 同上，可选 `quoteReplyName` |

契约的唯一事实来源是插件仓库的
[`docs/openapi.yaml`](https://github.com/xiaoxura/plugin-halo-weapp/blob/main/docs/openapi.yaml)；
本仓库只保存响应夹具与手写 adapter。写接口使用 `X-WeApp-Session`、
`X-Idempotency-Key`、`X-WeApp-Client-Version` 请求头；错误统一为
`{ code, message, requestId, retryAfter? }` 稳定业务码结构。

### 小程序端约定

- `config/index.js` 只保存客户端版本和 Halo `baseUrl`；插件名称与 API 路径是固定协议。
- 博客名称、简介、分页大小、字体等展示配置与评论/公告配置统一由插件 Setting 下发。
- 管理员 PAT、AppSecret 等长期凭据不得进入小程序包；公开读取接口无需认证。
- 启动时先用「插件检测」接口探测插件是否安装，再决定是否拉取配置。
- `commentEnabled` 控制评论区展示；`commentOptions.submitEnabled` / `replyEnabled`
  单独控制写入口，且只有本次冷启动**实时**探测+拉取成功才允许写入（fail-closed）。
- 拉取失败或插件未安装时使用内置默认配置（评论功能默认**关闭**，对齐提审状态）；
  未过期缓存可降级展示评论/公告，但写入口强制关闭。
- 配置缓存到 `wx.setStorage`，每次冷启动刷新，弱网不阻塞首屏。

## 5. 需要认证的 API（PAT，二期管理功能用）

路径前缀：`/apis/<group>/v1alpha1`（Extension API，自动 CRUD）

| 功能 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 文章 CRUD | GET/POST/PUT/DELETE | `/apis/content.halo.run/v1alpha1/posts[/{name}]` | 管理端视角，含草稿 |
| 分类 CRUD | GET/POST/PUT/DELETE | `/apis/content.halo.run/v1alpha1/categories[/{name}]` | |
| 标签 CRUD | GET/POST/PUT/DELETE | `/apis/content.halo.run/v1alpha1/tags[/{name}]` | |
| 评论管理 | GET/PUT/DELETE | `/apis/comment.halo.run/v1alpha1/comments[/{name}]` | 审核/删除 |

另外还有 Console API（`/apis/api.console.halo.run/...`）与 UC API（`/apis/api.uc.halo.run/...`），
分别对应控制台和个人中心的自定义接口，管理功能齐全时可查阅 <https://api.halo.run>。

> 注意：管理功能的 PAT 权限很大，**不要把 PAT 下发给普通小程序用户**，只应在"博主本人使用"
> 的受控场景（如单独的管理入口 + 手动填 token）中使用。

## 6. 微信小程序对接注意事项

- **合法域名**：小程序后台 → 开发管理 → 服务器域名 → `request 合法域名` 添加
  `https://<你的博客域名>`；仅支持 HTTPS 且需已备案；每月有修改次数限制。
- **axios 不可用**：小程序运行时无 XHR，`@halo-dev/api-client` 不能直接用；
  用 `wx.request` 自行封装（baseURL、超时、错误处理、query 序列化）。
- **query 序列化**：`sort`/`fieldSelector` 等数组参数要序列化成重复 key
  （`sort=a,desc&sort=b,desc`），`wx.request` 的 `data` 对象无法直接表达，需手动拼 URL。
- **富文本渲染**：文章 `content` 为 HTML，用 `rich-text` 组件或
  [mp-html](https://jin-yufeng.gitee.io/mp-html/) 渲染；mp-html 对代码高亮、图片预览支持更好。
- **图片域名**：附件若走了对象存储/CDN，`image`/`downloadFile` 合法域名也要一并配置。
- **评论与审核**：个人主体小程序提审时建议通过配套插件**关闭评论功能**（隐藏评论区与入口），
  过审后再开启；开放后 UGC（评论昵称、内容）应接入微信 `security.msgSecCheck` 内容安全检测。
- **用户头像**：评论表单里的头像可用微信 `button open-type="chooseAvatar"` 获取。

## 7. 参考链接

- Halo RESTful API 介绍：<https://docs.halo.run/developer-guide/restful-api/introduction>
- 在线 API 文档：<https://api.halo.run>
- API Client（@halo-dev/api-client）：<https://docs.halo.run/developer-guide/restful-api/api-client>
- Halo 插件开发：<https://docs.halo.run/developer-guide/plugin/introduction>
- 个人令牌（PAT）：<https://docs.halo.run/user-guide/user-center>
- uni-halo（Halo 2.x 小程序参考实现）：<https://github.com/ialley-workshop-open/uni-halo>
