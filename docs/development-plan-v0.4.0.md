# HaloWeApp 下一阶段开发计划（v0.4.0）

> 文档状态：可执行草案（默认采用“微信读者身份”，不接入 Halo 管理员 / UC 账号）
> 实施状态（2026-08-02）：V040-00～V040-07 已进入 RC；V040-08 的文档、自动化、包体及
> Halo 2.23.3/2.25.4 + Moment 1.15/1.16 本机隔离运行时矩阵、identity Secret 迁移与合成
> 备份恢复已完成；双真机、真实微信、目标环境暗部署/恢复/回滚及依赖风险仍未通过。另已确认
> v0.1.0 tag 不是可执行回滚基线；`hotfix/v0.1.1` / `cfaa16f` 已通过双 Halo 本机往返和 CI，
> 但正式维护 tag/Release 尚未完成。详见
> [release-checklist-v0.4.0.md](release-checklist-v0.4.0.md)。未满足 §12 前不得创建 v0.4.0/v0.2.0 tag。
> 编制日期：2026-08-01
> 小程序基线：HaloWeApp `v0.3.0`
> 配套插件历史基线：`plugin-halo-weapp` `v0.1.0`（`df1dcf3`）；可执行回滚候选：v0.1.1（`cfaa16f`，未打 tag）
> 目标版本：HaloWeApp v0.4.0、`plugin-halo-weapp` v0.2.0
> 瞬间插件基线：`PluginMoments >= 1.15.0`，推荐 v1.16.1
> 建议周期：P0 16.5 人日；含 P1 瞬间评论约 20 人日，另保留 3 人日缓冲

## 1. 阶段定位

v0.4.0 定位为 **动态阅读与读者身份 Beta**。本阶段在文章、搜索和安全评论链路稳定的
基础上，增加 Halo「瞬间」内容入口，并把当前仅服务于评论提交的临时会话升级为用户可感知、
可退出、可注销的微信读者身份。

本阶段优先完成以下主链路：

1. 用户可从首页看到最新瞬间并进入瞬间列表；
2. 用户可阅读图文、图片、视频、音频和文章链接类型的公开瞬间；
3. 搜索可同时返回文章与瞬间，并导航到正确详情页；
4. 用户可在“我的”页面主动登录为微信读者，设置昵称并在下次冷启动恢复身份；
5. 已登录读者提交文章评论时复用同一短会话与昵称，未登录用户仍可按 v0.3.0 方式评论；
6. Moment 插件、配套插件、微信接口或网络不可用时，文章阅读主链路不受影响。

本阶段继续坚持以下原则：

- **Public API 优先**：公开瞬间直接读取 Moment 插件 Public API；不引入 PAT；
- **身份边界清晰**：微信读者身份不是 Halo 管理员，也不是 Halo User Center 账号；
- **最小个人信息**：v0.4.0 只持久化读者昵称与不可逆身份摘要，不上传头像；
- **显式同意**：评论临时会话不自动创建持久读者账号，只有用户主动登录并同意当前隐私版本
  后才创建账号；
- **可选依赖降级**：未安装或停用 `PluginMoments` 时隐藏首页瞬间模块，分享深链进入时显示
  明确的不可用状态；
- **写能力 fail-closed**：读者登录、资料修改以及后续瞬间评论都要求本次冷启动实时配置成功；
- **先读后写**：瞬间读取、媒体和搜索属于 v0.4.0 P0；瞬间评论/回复是 P1，可独立发布为
  v0.4.1，不阻塞 v0.4.0。

## 2. 事实基线与调研结论

### 2.1 当前仓库状态

规划时的实际检查结果：

- HaloWeApp 当前分支相对 `origin/main` 领先 2 个提交，工作区另有一批未提交的配置归属收口
  修改；执行 `npm test`，**111 个用例全部通过**；
- `plugin-halo-weapp` 工作区也有未提交的站点配置修改；使用仓库内置 JDK 21 执行
  `./gradlew test`，**67 个用例全部通过**；
- 小程序 `config.version` 已是 `0.3.0`，但 `package.json` 与 `package-lock.json` 仍是
  `0.2.0`，且两个仓库均没有正式 Git tag；
- v0.3.0 计划仍标记为“可执行草案”，记录的基线测试数仍是 68，与当前实现不一致。

因此 v0.4.0 开工前必须先完成 v0.3.0 / 插件 v0.1.0 的版本、文档、提交与标签收口，不能
在脏工作区上直接叠加新阶段功能。

### 2.2 Moment 插件事实

规划时对官方仓库和当前测试站进行了核对：

| 项目 | 结论 |
| --- | --- |
| 官方仓库 | `halo-sigs/plugin-moments` |
| 插件 metadata name | `PluginMoments`（大小写固定） |
| Public API | `/apis/api.moment.halo.run/v1alpha1/moments` |
| Public API 引入版本 | v1.15.0 |
| 规划时最新正式版 | v1.16.1（2026-07-09 发布） |
| Halo 要求 | Moment v1.16.x 要求 Halo `>= 2.22.0`；本项目整体仍以 `>= 2.23.0` 为准 |
| 内容类型 | `PHOTO`、`VIDEO`、`AUDIO`、`POST`，未来可能新增 |
| 可见性 | 当前模型为 `PUBLIC` / `PRIVATE` |
| 评论主体 | `group=moment.halo.run`、`kind=Moment`、`version=v1alpha1` |
| 搜索类型 | `moment.moment.halo.run` |

当前 `config.baseUrl` 测试站已安装 `PluginMoments`：可用性探测返回 `true`，公开列表返回
4 条真实瞬间，包含相对作者头像、HTML 正文、图片媒体和统计字段；以瞬间正文关键词调用 Halo
搜索接口也能返回 `type=moment.moment.halo.run` 的结果。

需要纠正旧文档中的一个认识：Moment v1.15+ 的公共查询会给**已通过 Halo 认证的原作者**
附带其私有瞬间，但自研的 `X-WeApp-Session` 不是 Halo SecurityContext，不能获得该能力。
v0.4.0 小程序只展示匿名 Public API 返回的已审核公开瞬间，不读取私有瞬间，也不要求 PAT。

### 2.3 当前“登录”的真实能力

v0.3.0 的 `POST /session` 与 `utils/comment-session.js` 是评论安全链路的一部分：

- 仅在用户点击评论提交时执行 `wx.login`；
- 服务端调用 `code2Session`，签发 90 分钟随机 token；
- token 和 OpenID 仅在内存中存在，插件重启后失效；
- 没有读者资料、登录状态、`/me`、退出、账号注销或跨冷启动恢复；
- 评论昵称最多选择保存在当前设备，不能跨设备同步。

它可以作为新登录体系的底层会话，但不能直接在 UI 中宣称为“完整登录”。

### 2.4 回滚基线勘误（2026-08-02）

正式 tag v0.1.0 虽完成编译与 Mock 测试，但在 Halo 2.23.3 生产插件加载器中实际回滚失败：

1. Setting 只位于 jar 根目录而非 `extensions/settings.yaml`，协调器找不到 manifest 引用的
   `plugin-halo-weapp-settings`；
2. 两个含测试辅助构造器的 Spring Component 未显式选择生产构造器，Bean 无法创建；
3. config 匿名角色只有 `get`，缺少 Halo collection GET 所需 `list`，请求跳转 `/login`；
4. 若只沿用旧 Setting schema，Halo 协调还会删除 v0.2.0 `features` ConfigMap 组。

维护候选 `hotfix/v0.1.1` / `cfaa16f` 修复上述问题，并在 Halo 2.23.3 与 2.25.4 完成
v0.2.0 → v0.1.1 → v0.2.0 往返：候选 `STARTED`、旧匿名路由进入 JSON 业务处理、ConfigMap 与
Moment 数据保留、再升级后 v0.2.0 Setting 与路由恢复。GitHub Actions run 30741013676 成功。

因此本文所有“可执行回滚”门禁均以 v0.1.1 为准；v0.1.0 只保留为历史版本事实。v0.1.1
正式 tag/Release 以及目标环境演练完成前，M4/§12 仍未满足。

## 3. 已确认的问题

| 编号 | 现状 | 影响 | 优先级 |
| --- | --- | --- | --- |
| D-01 | 小程序三个版本来源不一致，且 v0.3.0 无 tag | 无法形成可信发布基线 | P0 |
| D-02 | 双仓库都有未提交的上一阶段修改 | 新功能难以审查、回滚和定位回归 | P0 |
| D-03 | Moment API 尚未进入 `utils/api.js`，也没有 adapter 与夹具 | 页面会直接耦合插件原始字段 | P0 |
| D-04 | Moment 是可选插件，而原生 tabBar 不能动态隐藏单个 tab | 直接加固定 tab 会给未安装插件的站点制造死入口 | P0 |
| D-05 | Moment 正文为 HTML，媒体支持四种类型且 URL 可能相对 | 富文本、媒体兼容和合法域名存在风险 | P0 |
| D-06 | 搜索 adapter 只接受 `post.content.halo.run` | 已被 Halo 索引的瞬间仍会被客户端丢弃 | P0 |
| D-07 | 点赞 API 和本地 key 都默认绑定 Post | 瞬间点赞无法复用，未来可能发生 key 冲突 | P0 |
| D-08 | 当前短会话无持久读者资料、退出与注销 | “我的”页面无法提供真实登录体验 | P0 |
| D-09 | 评论昵称只有设备本地存储 | 登录后仍无法获得身份复用价值 | P0 |
| D-10 | `plugin-halo-weapp` 的评论校验与 Gateway 硬编码 Post | 瞬间评论不能安全复用现有写链路 | P1 |
| D-11 | 旧 API 文档称瞬间可能“登录可见并带 PAT” | 容易诱导把高权限凭据放入客户端 | P0 |
| D-12 | 外部图片/音视频/CDN 域名无法由代码动态加入微信白名单 | 真机可能出现开发工具正常、生产失败 | P0 |
| D-13 | v0.1.0 tag 在真实 Halo 中无法加载 Setting/Bean 且 config 匿名授权不足 | 五级回滚不可执行并可能丢失前向配置 | P0 |
| D-14 | Halo 2.23.3 删除扩展时会在 INFO 日志序列化 ConfigMap.data | 用 ConfigMap 保存 identityKey 会在删除/事故处理时泄露密钥 | P0 |

## 4. 产品与架构决策

### 4.1 “登录”定义为微信读者身份

v0.4.0 的登录定义如下：

- 用户身份来源是当前小程序 AppID 下的微信 OpenID；
- OpenID、session_key、AppSecret、access token 均不返回客户端；
- 服务端只持久化 `HMAC-SHA256(identityKey, appId + ":" + openId)` 的结果及用户主动填写
  的昵称，绝不持久化原始 OpenID；
- 读者身份只用于小程序资料、昵称复用及后续读者数据，不自动创建 Halo User；
- 不允许使用读者身份访问 Halo Console / UC API、私有文章、私有瞬间或管理接口；
- v0.4.0 不提供手机号、邮箱、网站、地理位置、微信头像或文件上传；头像区域使用默认图形或
  昵称首字符；
- 登录后仍使用 90 分钟短会话；token 不写 storage。冷启动时若用户此前主动登录且隐私版本
  未变化，可重新 `wx.login` 静默恢复；
- 用户可退出当前设备，也可注销读者账号。注销删除读者资料和身份摘要，但不会自动删除已经
  公开发表的 Halo 评论，界面和隐私政策必须明确说明。

明确排除以下方案：

- 在小程序内保存 Halo 管理员 PAT；
- 直接复用 Halo Console 登录 Cookie；
- 把微信读者自动映射为 Halo 管理员或普通 UC 用户；
- 仅保存一个本地布尔值并把它包装成“登录成功”。

如未来确实要支持作者在小程序发布瞬间，应单独规划 Halo UC 授权、角色、二次验证和媒体审核，
不与本轮读者登录混做。

### 4.2 瞬间入口先放首页，不新增固定 tab

P0 采用以下导航方案：

- 首页异步加载“最新瞬间”模块，展示 2～3 条摘要和“查看全部”；
- 新增 `pages/moments/moments` 与 `pages/moment-detail/moment-detail`；
- Moment 插件缺失或功能关闭时，首页模块完全隐藏；
- 分享深链仍可进入详情页，依赖不可用时显示可返回、可重试的状态；
- v0.4.0 不为了动态 tab 引入 custom-tab-bar，避免重写现有三 tab 导航与无障碍行为。

观察一个版本后，如瞬间成为稳定一级入口，再在 v0.5.0 评估固定第四 tab 或 custom-tab-bar。

### 4.3 Moment 版本与能力探测

- 客户端固定使用插件名 `PluginMoments`，不让部署者填写；
- 每次冷启动调用 Halo 插件 available API，使用内存单飞 Promise，不能持久化 `true`；
- Public API 以 Moment v1.15.0 为最低契约，推荐部署 v1.16.1；
- `plugin-halo-weapp` 公开配置增加可选的 `features` 节点，仍属于 schemaVersion 1 的向后兼容
  扩展：

```json
{
  "features": {
    "moments": {
      "enabled": false,
      "commentEnabled": false
    },
    "readerAccount": {
      "enabled": false
    }
  }
}
```

- 旧插件缺少 `features` 时默认全部关闭；旧客户端会忽略该可选节点；
- 瞬间读取要求功能开关开启且 `PluginMoments` 本次探测可用；
- 读者登录要求本次冷启动实时配置成功、账号开关开启、客户端版本满足门槛且隐私版本有效；
- 瞬间评论除上述条件外还必须满足现有评论/回复全局写开关。

### 4.4 Moment 内容模型

页面只消费 adapter 生成的稳定视图模型：

```js
MomentSummary = {
  name,
  text,
  owner: { name, displayName, avatar },
  releaseTime,
  tags,
  media: [{ type, url, originType, supported }],
  stats: { upvote, approvedComment },
  hasMoreContent
}

MomentDetail = {
  ...MomentSummary,
  html
}
```

兼容规则：

- 列表卡片使用安全纯文本摘要，不在长列表中批量实例化 `mp-html`；
- 详情页使用现有 HTML 清理、资源补全和 `mp-html` 渲染管线；
- `PHOTO` 使用懒加载网格与 `wx.previewImage`，最多按接口的 9 项展示；
- `VIDEO` 不自动播放，默认只加载 metadata；页面同时只允许一个视频播放；
- `AUDIO` 使用统一 `InnerAudioContext` 与自定义播放状态，页面卸载时销毁；
- `POST` 先显示链接卡片。能可靠映射到小程序文章时内部跳转，否则复制 HTTPS 地址；
- 未知媒体类型保留安全占位与复制链接入口，不崩溃、不猜测执行；
- 相对头像和媒体 URL 使用站点 baseUrl 补全；只接受 `https`，开发环境外拒绝明文 HTTP；
- 缺失 metadata/spec/content/owner/stats/medium 时使用安全默认值。

### 4.5 瞬间评论采用独立安全路由（P1）

现有 `POST /comments` 的 `postName` 契约保持不变。瞬间评论不让客户端上传任意 GVK，而新增：

```text
POST /apis/api.weapp.halo.run/v1alpha1/moments/{momentName}/comments
POST /apis/api.weapp.halo.run/v1alpha1/comments/{commentName}/replies
```

服务端固定 Moment 的 subjectRef：

```json
{
  "group": "moment.halo.run",
  "kind": "Moment",
  "version": "v1alpha1",
  "name": "<path 中的 momentName>"
}
```

写入前通过固定 loopback Public API 校验 Moment 存在、已审核且公开；不在
`plugin-halo-weapp` 中编译依赖可选的 Moment Java 类型。回复时读取父评论 subjectRef，只允许
既定的 Post 或 Moment 两类主体，再调用对应校验器。频控、幂等、隐私版本、`msgSecCheck`、
HTML 转义和 Halo 写入顺序保持 v0.3.0 不变。

客户端应先把文章详情中评论读取、回复展开和表单状态抽成可复用 `comment-thread` 组件，再接入
瞬间详情，禁止复制一整套评论状态机。

## 5. 阶段目标与成功标准

### 5.1 产品目标

- **O1 瞬间可读**：公开瞬间的列表、详情、媒体、标签、分页和分享可稳定使用；
- **O2 内容可发现**：首页能发现最新瞬间，搜索能区分文章与瞬间并正确跳转；
- **O3 登录真实可控**：用户主动登录后有明确身份状态，可恢复、退出和注销；
- **O4 身份最小化**：客户端无 OpenID/长期 token，服务端无原始 OpenID 持久化；
- **O5 可选依赖安全降级**：任意插件缺失、停用、升级或超时时不影响文章主链路；
- **O6 发布可回滚**：功能默认关闭，插件、小程序与远程开关均有独立回滚路径。

### 5.2 可量化标准

- HaloWeApp 与 `plugin-halo-weapp` 全部既有测试继续通过，新增功能不得降低现有覆盖场景；
- Moment adapter 至少覆盖真实列表/详情、空列表、字段缺失及 PHOTO/VIDEO/AUDIO/POST/未知类型；
- 首页文章首屏不等待 Moment 探测或 Moment 列表请求；
- Moment 20 条列表在开发者工具及 iOS/Android 真机滚动无明显掉帧，视频和音频不自动播放；
- 搜索覆盖“仅文章、仅瞬间、混合结果、插件停用、陈旧索引”五类场景；
- 同一 OpenID 并发首次登录只创建一个读者资源；退出后 token 立即失效；注销后资料不可再查询；
- 小程序 storage、日志、错误响应和公开配置中不出现 session token、OpenID、session_key、
  AppSecret、identityKey 或完整身份摘要；
- 至少联合验证 Halo 2.23.x / 2.25.4、Moment 1.15.x / 1.16.1；
- 开发者工具及至少一台 iOS、一台 Android 完成登录、媒体、弱网与插件停用回归；
- 主包和总包仍满足微信限制，并记录 v0.3.0 → v0.4.0 的体积变化。

## 6. P0 实现范围

### A. 上一阶段基线收口

1. 分别审查并提交两个仓库当前未提交的站点配置收口修改；
2. 将 v0.3.0 计划标记完成并记录实现提交、111 个客户端测试和 67 个插件测试；
3. 同步 `config.version`、`package.json`、`package-lock.json`、CHANGELOG 与构建产物版本；
4. 完成 HaloWeApp `v0.3.0` 与插件 `v0.1.0` tag；
5. 从干净基线创建 v0.4.0 / 插件 v0.2.0 开发分支。

### B. 插件能力与远程配置

客户端新增：

```text
utils/plugin-capabilities.js    固定插件名探测、冷启动单飞、内存态结果
utils/plugin-contract.js        增加 PluginMoments 固定名称（不作为部署配置）
```

配套插件新增：

- Setting 中的“瞬间展示”“瞬间评论展示”“微信读者登录”开关，默认全部关闭；
- PublicConfig `features` 白名单 DTO；
- 客户端 runtime-config 对 `features` 的字段/长度/类型校验；
- `canLogin()`、`canReadMoments()` 与后续 `canSubmitMomentComment()` 的统一门禁；
- 配置缓存只能影响只读展示，登录和写入必须实时成功。

### C. Moment API 与 adapter

新增：

```text
utils/adapters/moment.js
tests/adapters.moment.test.js
tests/fixtures/moments-page1.json
tests/fixtures/moment-detail.json
tests/fixtures/moments-media-types.json
tests/fixtures/moments-degraded.json
```

`utils/api.js` 增加：

- `getMomentList(params)`；
- `getMomentByName(name)`；
- 通用 `upvoteSubject({ group, plural, name })`，原文章 API 保留兼容 wrapper；
- 通用插件可用性探测，禁止页面自行拼 endpoint。

夹具优先从当前测试站真实响应脱敏；VIDEO/AUDIO/POST 和异常字段若测试站暂无样本，可使用基于
官方类型定义的合成夹具，并明确标记来源。

### D. 瞬间首页模块、列表与详情

新增页面：

```text
pages/moments/               分页列表、标签筛选、下拉刷新、触底加载
pages/moment-detail/         安全富文本、媒体、统计、分享与后续评论容器
components/moment-card/      列表卡片与媒体摘要
components/moment-media/     PHOTO/VIDEO/AUDIO/POST 渲染与生命周期
```

交互要求：

- 首页文章加载完成后异步拉取最新 3 条瞬间，失败不弹全局 toast、不阻塞文章；
- 列表分页单飞、按 metadata.name 去重，失败保留已有数据；
- 标签点击使用 API `tag` 参数重新加载；
- 列表卡正文超过约定长度折叠，点击进入详情；
- 图片预览仅传当前 Moment 的有效图片 URL；
- 视频/音频切换时停止其他媒体，进入后台和页面卸载时释放资源；
- 详情 404、插件不可用、空内容、媒体失败和网络错误分别展示；
- 分享卡标题取安全纯文本摘要，图片优先取第一张 PHOTO；
- 页面不能因为未知媒体类型、空 owner 或相对资源崩溃。

### E. 搜索、点赞与本地状态泛化

- 搜索 adapter 输出 `kind: post | moment`，保留受控 `<B>` 高亮；
- Moment 结果优先显示正文摘要，不直接使用“发表于……by……”形式的索引标题；
- Moment 功能关闭或插件不可用时过滤 Moment 命中，避免陈旧索引制造死链；
- 点击 Post / Moment 分别导航到对应详情页；
- 点赞本地 key 改为 `post:<name>` / `moment:<name>`，提供旧 Post key 的一次性兼容读取；
- Moment 点赞使用 tracker `{ group: "moment.halo.run", plural: "moments", name }`；
- 点赞失败不修改本地状态，快速重复点击仍保持单飞。

### F. 配套插件读者身份

新增内部扩展（不聚合到 anonymous 角色）：

```text
apiVersion: weapp.halo.run/v1alpha1
kind: WeAppUser
metadata.name: reader-<identity digest 的稳定前缀>
spec:
  displayName: string
  privacyPolicyVersion: string
```

安全要求：

- 插件首次需要时生成 256-bit `identityKey`，只保存在服务端内部 Opaque Secret 的二进制
  `data`，不出现在 Setting 表单、公开 DTO、日志、jar 或测试快照；
- 早期 RC 同名 ConfigMap 必须先原值迁移到 Secret，再清除旧 key；冲突或损坏时阻止启动，
  禁止直接删除仍含 key 的 ConfigMap；
- 内部资源名由 HMAC 摘要确定以保证并发幂等，不返回给小程序；
- AppID 纳入 HMAC 输入，切换 AppID 不复用旧身份；
- identityKey 必须进入备份/恢复说明；丢失后不可恢复映射，轮换需单独迁移；
- 昵称 2～20 Unicode 字符，修改昵称也执行频控和 `msgSecCheck`；
- 登录、资料更新、退出和注销均有稳定业务码与请求 ID；
- 注销删除读者资源并撤销该用户所有内存会话。

新增 API（OpenAPI 先行）：

```text
POST   /auth/login        wx.login code + 当前隐私同意版本 + 首次昵称 → token + 公开资料
GET    /auth/profile      查询当前读者资料
PATCH  /auth/profile      修改昵称
DELETE /auth/session      退出当前设备并撤销 token
DELETE /auth/account      注销读者账号并撤销全部会话
```

`POST /session` 继续作为“不创建账号的评论临时会话”，保证 v0.3.0 客户端兼容。两类 token 使用
同一个 SessionService 校验协议；账号会话附带内部 readerName，评论临时会话不附带。

### G. 小程序登录状态与“我的”页面

新增 `utils/auth-session.js`，状态为：

```text
anonymous → logging-in → authenticated
                 ↘ error
authenticated → restoring → authenticated / consent-required / error
authenticated → logging-out → anonymous
authenticated → deleting → anonymous
```

要求：

- token 只在内存保存，持久化内容仅限用户的“保持登录意愿”、脱敏公开资料和已同意隐私版本；
- 用户首次必须主动点击登录并同意隐私政策，不在启动时静默创建账号；
- 已主动登录用户冷启动可在文章首屏之外并行静默恢复；隐私版本变化时暂停恢复并要求重新确认；
- Profile 页显示默认头像、昵称、登录状态、退出与注销入口；删除账号必须二次确认；
- 登录资料昵称优先预填评论弹层；未登录时继续兼容现有本机昵称；
- `comment-session.js` 优先复用有效账号 token，否则按原流程申请临时会话；
- 登录失败不能让评论和文章阅读永久 loading；评论仍可回落临时会话；
- App 进入后台不主动延长会话，临近过期再单飞刷新。

### H. 测试、文档与发布

- 新增 Moment adapter、能力探测、搜索分流、点赞命名空间和 auth-session Node 测试；
- 新增身份摘要、并发首次登录、隐私版本、资料安全检查、退出/注销和会话复用 Java 测试；
- 更新双端 OpenAPI、ADR、威胁模型、部署、升级、备份和回滚文档；
- 更新 Halo API 文档，移除“私有瞬间需要客户端 PAT”的误导描述；
- 更新合法域名说明，明确图片/视频/音频/字体 CDN 的真机要求；
- 记录 Moment 1.15.x / 1.16.1 与 Halo 2.23.x / 2.25.4 联合测试矩阵；
- 版本同步为 HaloWeApp v0.4.0 与 `plugin-halo-weapp` v0.2.0。

## 7. P1：可拆到 v0.4.1 的范围

### 7.1 瞬间评论与回复

- 插件增加 Moment 固定主体校验器和独立评论 route；
- Gateway 从“硬编码 Post”重构为只接受服务端生成的受控 Subject 类型；
- 父评论回复校验支持 Post / Moment，其他 GVK 一律拒绝；
- 小程序抽取 `comment-thread`，文章详情回归后接入瞬间详情；
- 评论读取使用 Halo Public API 的 Moment subjectRef；
- 登录用户自动带入资料昵称，未登录用户继续使用临时会话；
- 远程关闭 Moment 评论时不影响文章评论，也不影响历史瞬间阅读。

### 7.2 后续版本而非本阶段

以下能力不进入 v0.4.0 / v0.4.1：

| 能力 | 后置原因 |
| --- | --- |
| 小程序发布、编辑、删除瞬间 | 需要 Halo UC 身份、角色、媒体上传和内容审核完整设计 |
| 查看 PRIVATE 瞬间 | 微信读者身份不是 Halo 原作者身份 |
| 微信头像或自定义头像上传 | 需要上传网关、存储配额、图片内容安全和删除策略 |
| 图片评论 | 需要 `mediaCheckAsync`、异步审核与失败清理 |
| Halo 管理员登录 | PAT / Console Cookie 不应进入普通读者端 |
| 收藏、跨设备点赞同步 | 应在身份基础稳定后单独设计资源与冲突策略 |
| 我的评论与评论删除 | 需要私有 ownership 映射、审核权限和数据保留政策 |
| 第四个动态 tab | 先验证首页入口的真实使用率，避免为可选插件重写 tabBar |

## 8. 双端接口与调用顺序

### 8.1 瞬间读取

```text
App 冷启动
  → plugin-halo-weapp config（features，失败使用安全默认）
  → PluginMoments available（单飞、内存态）
  → 首页文章首屏独立完成
  → 条件满足后异步 GET moments?page=1&size=3
  → adapter 白名单转换
  → 首页模块 / 列表 / 详情
```

### 8.2 首次读者登录

```text
用户点击登录
  → 展示当前隐私政策与处理字段
  → 用户明确同意
  → wx.login
  → POST /auth/login { code, privacyConsentVersion, displayName? }
  → 首次登录要求 displayName，并对昵称执行 msgSecCheck；恢复登录可省略
  → plugin code2Session
  → HMAC(appId + OpenID)，幂等创建/读取 WeAppUser
  → 签发 90 分钟内存 token
  → 返回 { sessionToken, expiresIn, profile }
  → 客户端仅内存保存 token，storage 保存登录意愿与公开 profile
```

### 8.3 冷启动恢复

```text
存在登录意愿 + 隐私版本未变化 + 实时账号开关开启
  → 在文章首屏之外执行 wx.login
  → POST /auth/login
  → 恢复 profile 与短会话

任一步失败
  → Profile 显示“登录状态待恢复/重试”
  → 不阻塞文章与公开瞬间
  → 不把缓存 profile 当作已认证 token
```

### 8.4 账号会话复用评论

```text
用户提交评论
  → auth-session 有有效 token：直接复用
  → 否则 comment-session 走原 POST /session 临时会话
  → 其余频控/幂等/msgSecCheck/Halo 写入流程不变
```

## 9. 任务拆分与估算

| 任务 ID | 任务 | 优先级 | 估算 | 依赖 | 交付物 |
| --- | --- | --- | ---: | --- | --- |
| V040-00 | v0.3.0 / 插件 v0.1.0 工作区、版本、文档与 tag 收口 | P0 | 1.0 人日 | 无 | 干净历史基线；可执行回滚后由 v0.1.1 勘误 |
| V040-01 | 登录语义 ADR、Moment ADR、OpenAPI 与 config features 冻结 | P0 | 1.0 人日 | V040-00 | 双端契约与安全决策 |
| V040-02 | Moment 能力探测、API、adapter 与真实/合成夹具 | P0 | 1.5 人日 | V040-01 | 纯函数与测试 |
| V040-03 | 首页模块、Moment 列表/详情、分页和标签 | P0 | 2.5 人日 | V040-02 | 完整读取链路 |
| V040-04 | PHOTO/VIDEO/AUDIO/POST、搜索、分享与点赞泛化 | P0 | 2.0 人日 | V040-02/03 | 媒体与发现闭环 |
| V040-05 | WeAppUser、HMAC key、并发幂等与注销清理 | P0 | 2.5 人日 | V040-01 | 持久读者身份服务 |
| V040-06 | auth API、会话扩展、昵称安全检测与错误契约 | P0 | 2.0 人日 | V040-05 | 插件 v0.2.0 auth 闭环 |
| V040-07 | 客户端 auth-session、Profile UI 与评论会话复用 | P0 | 2.0 人日 | V040-06 | 登录/恢复/退出/注销体验 |
| V040-08 | 双端回归、真机媒体、文档、包体与 RC | P0 | 2.0 人日 | 全部 P0 | v0.4.0 RC 与测试记录 |
| V040-09 | Moment 固定主体评论网关与服务端测试 | P1 | 2.0 人日 | V040-01/06 | 插件 Moment 评论 API |
| V040-10 | comment-thread 抽取及 Moment 评论/回复 UI | P1 | 1.5 人日 | V040-03/09 | v0.4.1 候选能力 |

**P0 合计 16.5 人日；P1 3.5 人日；全部合计 20 人日，建议另保留 3 人日缓冲。**

估算不包含微信小程序审核、Halo 应用市场审核、隐私政策法务审阅和外部 CDN 域名审批时间。

## 10. 里程碑

### M0：上一阶段正式收口（第 1 天）

- 两个仓库工作区干净；
- v0.3.0 / v0.1.0 版本、CHANGELOG、测试记录和 tag 一致；
- 明确历史提交；真实运行时发现的回滚缺陷由 v0.1.1 维护线修复。

退出条件：新阶段所有 diff 都能与上一阶段明确分离。

### M1：契约与样本冻结（第 2 天）

- 登录语义、持久数据、删除规则、HMAC key 和 API 契约冻结；
- Moment 1.15 / 1.16 响应夹具与媒体类型冻结；
- `features` 配置与默认关闭策略冻结。

退出条件：小程序与插件可以并行开发，不再讨论是否使用 Halo PAT / UC 登录。

### M2：公开瞬间闭环（第 3～7 天）

- 能力探测、adapter、首页模块、列表、详情、媒体、标签完成；
- 搜索、点赞、分享完成；
- 插件缺失、陈旧索引和未知媒体安全降级。

退出条件：关闭配套插件或 Moment 插件均不影响文章主链路，开启后可完整浏览公开瞬间。

### M3：微信读者身份（第 8～13 天）

- WeAppUser、身份摘要、auth API 与会话复用完成；
- Profile 登录、恢复、昵称、退出与注销完成；
- 隐私版本变化和插件重启场景通过。

退出条件：登录状态不是本地伪状态，服务端数据可验证创建、恢复和删除，且无原始 OpenID 落盘。

### M4：v0.4.0 发布候选（第 14～16.5 天）

- 双版本、双真机、弱网、媒体域名和包体回归完成；
- 插件暗部署与远程开关演练完成；
- 文档、版本与回滚说明完成。

退出条件：满足第 12 节发布门禁，无未关闭 P0 缺陷。

### M5：瞬间互动（可选，第 17～20 天或 v0.4.1）

- 服务端 Moment 评论固定主体写入完成；
- comment-thread 抽取且文章评论无回归；
- 瞬间评论/回复、内容安全和远程关闭演练完成。

退出条件：只有公开、已审核 Moment 能写评论；客户端不能指定任意 GVK。

## 11. 验收清单

### 11.1 基线与配置

- [ ] 双仓库开始开发前工作区干净；v0.3.0 与插件 v0.1.1 有经过运行时验证的可回滚 tag；
- [ ] 三处小程序版本及插件版本一致；
- [ ] 新开关默认关闭，旧插件/旧客户端组合安全；
- [ ] 缓存配置不能开启登录或 Moment 写入；
- [ ] `PluginMoments` 名称固定，部署者不能通过客户端配置任意探测路径。

### 11.2 瞬间读取与媒体

- [ ] Moment 1.15.x 与 1.16.1 的列表/详情可转换；
- [ ] 插件未安装、停用、available 超时、返回 HTML/非法 JSON 时首页不出现死入口；
- [ ] 首屏、刷新、分页和标签切换不重复、不串页；
- [ ] 相对作者头像和相对媒体 URL 正确补全；
- [ ] PHOTO 1～9 张布局和预览正确；
- [ ] VIDEO 不自动播放，失败有提示，切页后停止；
- [ ] AUDIO 同时只播放一个，页面卸载后无后台残留；
- [ ] POST 和未知媒体类型均有安全降级；
- [ ] HTML 中 script/iframe/style/事件属性/javascript 链接仍被清理；
- [ ] PRIVATE、未审核、已删除 Moment 不出现在匿名小程序响应中。

### 11.3 搜索、点赞与分享

- [ ] 文章、瞬间和混合结果均正确高亮与导航；
- [ ] Moment 插件停用后陈旧索引结果不制造死链；
- [ ] Post / Moment 点赞 tracker 的 group/plural 正确；
- [ ] 两类本地点赞 key 不冲突，旧 Post 状态兼容；
- [ ] 重复点击与请求失败不虚增统计；
- [ ] Moment 分享深链在正常、插件关闭和内容删除三种状态下可恢复。

### 11.4 登录与资料

- [ ] 未主动同意隐私政策时不创建 WeAppUser；
- [ ] 同一 OpenID 首次并发登录只创建一个资源；
- [ ] 客户端 storage 中没有 token、OpenID 或身份摘要；
- [ ] 插件资源、公开 config、错误响应和日志中没有原始 OpenID；
- [ ] 登录后昵称可跨冷启动恢复并预填评论；
- [ ] 隐私版本变化后停止静默恢复，重新同意前不能修改资料；
- [ ] token 过期、插件重启和 401 只触发一次单飞重登；
- [ ] 退出后当前 token 立即失效，缓存资料和登录意愿清理；
- [ ] 注销后二次查询返回未登录/不存在，相关会话全部失效；
- [ ] 注销说明明确既有公开评论不会自动删除；
- [ ] readerAccount 远程关闭后不再登录，但文章与公开 Moment 仍可阅读。

### 11.5 P1 瞬间评论

- [ ] 客户端不能传入任意 group/kind/version；
- [ ] 不存在、私有、未审核或已删除 Moment 不能写评论；
- [ ] Post / Moment 父评论回复均校验到正确主体；
- [ ] 其他主体的评论不能借回复 route 绕过；
- [ ] Moment 评论同样经过会话、频控、幂等与仅 pass 放行的 msgSecCheck；
- [ ] 文章 comment-thread 抽取后原有评论分页、回复和错误分支无回归；
- [ ] 远程关闭 Moment 评论后不影响文章评论。

### 11.6 真机与发布

- [ ] 开启合法域名校验后，站点与所有媒体 CDN 在 iOS/Android 可用；
- [ ] 弱网下首页文章不等待 Moment，媒体失败不导致永久 loading；
- [ ] 长列表滚动、视频、音频、切后台和低内存恢复完成真机测试；
- [ ] 微信隐私保护指引与实际持久字段、登录时机、注销行为一致；
- [ ] 主包/总包体积满足限制，新增资源未误打包 docs/tests/fixtures；
- [ ] 插件 v0.2.0 先关闭新功能暗部署，小程序 v0.4.0 审核时无新增 UGC 入口；
- [ ] 凭据、OpenID、token、identityKey 和测试真实资料扫描无命中。

## 12. 发布门禁（Definition of Done）

v0.4.0 只有同时满足以下条件才可完成：

1. V040-00～V040-08 全部完成，P0 缺陷为 0；
2. 客户端与插件自动化测试全部通过，Halo / Moment 双版本和双真机矩阵完成；
3. Moment 插件缺失、停用、升级、超时和陈旧索引均不会影响文章主链路；
4. PHOTO/VIDEO/AUDIO/POST 与未知媒体均有可验证的正常或降级行为；
5. 登录、恢复、退出、注销和隐私版本变化具备自动化测试与真机记录；
6. 原始 OpenID、AppSecret、token、identityKey 不进入客户端、公开 API、日志与仓库；
7. `features.moments.enabled=false`、`readerAccount.enabled=false` 为生产初始状态；
8. OpenAPI、ADR、威胁模型、部署、备份、隐私、CHANGELOG 和回滚文档齐全；
9. HaloWeApp v0.4.0 与 `plugin-halo-weapp` v0.2.0 产物和 tag 一致；
10. v0.3.0 小程序 + 插件 v0.1.1 是已发布且经过目标环境验证的可执行回滚路径；v0.1.0
    明确禁止使用。

V040-09～V040-10 未完成不阻塞 v0.4.0，但必须明确标记为 v0.4.1，不能在远程配置中宣称
Moment 评论已可用。

## 13. 分阶段上线与回滚

### 阶段 A：插件 v0.2.0 暗部署

1. 备份 Setting ConfigMap、identity Secret 和 WeAppUser，并验证 identityKey 按需初始化、
   旧 ConfigMap 安全迁移和恢复说明；
2. 安装/升级插件，保持 moments、readerAccount、Moment 评论全部关闭；
3. 验证旧 v0.3.0 客户端 config、session 和文章评论无回归；
4. 验证公开配置无内部身份字段。

### 阶段 B：小程序 v0.4.0 只读发布

1. 发布小程序，仍保持所有新 feature 关闭；
2. 回归首页、搜索、文章详情、评论和 Profile；
3. 观察插件 config / session 错误率与客户端异常；
4. 完成微信审核。

### 阶段 C：开启公开瞬间

1. 确认生产已安装 Moment `>=1.15.0`，推荐 1.16.1；
2. 确认所有媒体域名已登记；
3. 开启 moments 读取，先验证首页 3 条与详情深链；
4. 观察 Moment API 延迟、媒体失败率和首页文章首屏。

### 阶段 D：开启读者登录

1. 核对隐私政策 URL、版本和小程序隐私保护指引；
2. 开启 readerAccount，仅用少量真实账号验证登录/恢复/退出/注销；
3. 检查服务端资源与日志不含原始 OpenID；
4. 稳定后再扩大使用。

### 阶段 E：Moment 评论（v0.4.1，可选）

1. 先开启评论读取，不开放写入；
2. 验证 Moment subjectRef 与网站评论互通；
3. 小范围开启提交与回复，观察安全检测、审核、频控和错误率；
4. 稳定后再全量。

### 回滚

- 一级：关闭 readerAccount，停止新登录与资料修改；
- 二级：关闭 Moment 评论，保留公开 Moment 阅读；
- 三级：关闭 moments，首页模块隐藏，深链显示不可用；
- 四级：停用 `PluginMoments`，文章能力继续运行；
- 五级：回滚 `plugin-halo-weapp` v0.1.1 与小程序 v0.3.0；恢复前一份 ConfigMap。v0.1.0
  因生产资源布局/装配/RBAC 缺陷禁止使用。

回滚插件前必须确认 v0.2.0 新增 WeAppUser 资源的保留/删除策略；默认保留数据，等恢复插件后继续
使用，不在紧急回滚时自动销毁用户资料。

## 14. 风险与应对

| 风险 | 可能性/影响 | 应对 |
| --- | --- | --- |
| 把微信读者误认为 Halo 账号 | 高/高 | UI、API、文档统一称“微信读者”；不接 UC/Console/PAT |
| Moment 旧版本没有 Public API | 中/高 | 最低 1.15.0；available + 契约响应校验；部署前版本核对 |
| 可选插件固定 tab 产生死入口 | 高/中 | v0.4.0 使用首页异步模块，不引入固定 tab |
| Moment 富文本和多媒体拖慢列表 | 高/中 | 列表纯文本摘要；详情才用 mp-html；图片懒加载；媒体不预播 |
| 外部媒体域名真机失败 | 高/高 | 发布前抽取生产媒体域名；开启合法域名校验做双真机回归 |
| 未知媒体类型导致页面崩溃 | 中/中 | adapter 枚举白名单 + unknown 占位，不执行未知协议 |
| 身份摘要仍属于可关联标识 | 中/高 | 独立 HMAC key、最小字段、非匿名 RBAC、隐私声明与注销能力 |
| identityKey 丢失导致账号映射失效 | 中/高 | 自动生成后纳入加密备份；恢复演练；轮换必须走迁移 |
| ConfigMap 删除日志泄露 identityKey | 高/高 | key 只存 Opaque Secret.data；旧 RC 启动迁移并清除 ConfigMap；用实际 key 扫描 Halo 日志 |
| 同一用户并发创建重复账号 | 中/中 | 确定性内部 name + create 冲突后 fetch + 并发测试 |
| 缓存配置误开登录/写入 | 中/高 | canLogin/canWrite 必须 live；缓存只允许只读展示 |
| 登录恢复拖慢冷启动 | 中/中 | 文章首屏完成后并行恢复；Profile 显式状态；所有请求单飞 |
| 注销与已发布评论认知不一致 | 中/高 | 注销确认和隐私政策明确；不承诺自动删除公开评论 |
| Moment 评论绕过 Post 安全校验 | 中/高 | 独立 route、服务端固定 GVK、subject policy 白名单、父评论复验 |
| 回滚基线 jar 无法启动或旧 Setting 删除前向配置 | 中/高 | v0.1.0 禁用；先发布 v0.1.1；完整备份、资源哈希与双向升级验证 |
| 同时开发瞬间、身份与 UGC 周期失控 | 高/中 | P0 先读+登录；Moment 评论独立为 P1/v0.4.1；保留 3 人日缓冲 |

## 15. 开工顺序

推荐严格按以下顺序开始，不并行铺页面：

1. **先收口 v0.3.0**：提交当前双仓库修改、同步版本、补 tag；
2. **冻结契约**：更新配套插件 OpenAPI、登录 ADR、Moment ADR 与 config features；
3. **先做 Moment adapter 与夹具**：页面只依赖稳定模型；
4. **完成 Moment 只读闭环**：首页 → 列表 → 详情 → 媒体 → 搜索；
5. **再做读者身份服务端**：数据模型、HMAC、auth API、注销；
6. **接入 Profile 与评论会话复用**；
7. **完成 P0 发布候选**；
8. **观察后决定是否立即进入 v0.4.1 Moment 评论**。

## 16. 仍可由产品调整的三个选项

以下默认值已足够开工，但可在 M1 前调整：

1. **瞬间入口**：默认“首页模块 + 二级页面”；若必须固定第四 tab，需要额外评估无插件站点体验，
   不建议本轮改 custom-tab-bar；
2. **登录语义**：默认“微信读者身份”；若目标是 Halo 作者发布瞬间，应终止当前登录任务并另做
   UC 授权方案，工期和安全边界会显著变化；
3. **瞬间评论版本**：默认 v0.4.1；若要求 v0.4.0 同期交付，计划按 20 人日执行，并且不得压缩
   身份、内容安全和真机回归时间。

## 17. 参考资料

- Moment 官方仓库：<https://github.com/halo-sigs/plugin-moments>
- Moment REST API：<https://github.com/halo-sigs/plugin-moments/blob/main/dev/rest-api.md>
- Moment v1.15.0（首次提供新 Public API）：
  <https://github.com/halo-sigs/plugin-moments/releases/tag/v1.15.0>
- Moment v1.16.1：<https://github.com/halo-sigs/plugin-moments/releases/tag/v1.16.1>
- 配套插件 OpenAPI：<https://github.com/xiaoxura/plugin-halo-weapp/blob/main/docs/openapi.yaml>
- 上一阶段计划：[development-plan-v0.3.0.md](development-plan-v0.3.0.md)
- Halo API 参考：[halo-api.md](halo-api.md)
