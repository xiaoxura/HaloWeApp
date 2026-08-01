# 变更日志

本项目遵循 [SemVer](https://semver.org/lang/zh-CN/)。

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
- 自动化测试：`node --test`，64 个用例覆盖 adapter、URL 补全、正文清理、query 序列化、
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
