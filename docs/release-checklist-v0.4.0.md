# HaloWeApp v0.4.0 / plugin-halo-weapp v0.2.0 RC 验证记录

> 审计日期：2026-08-02（Asia/Shanghai）
>
> 对应计划：`docs/development-plan-v0.4.0.md` V040-08、§11、§12
> 状态：**RC NOT READY — 不得创建正式 tag 或上传生产**

本文只把有直接证据的项目标记为通过。Node/JVM Mock、Halo API 编译、微信开发者工具模拟器或
手工注入页面状态都不能替代 Halo 实例、真实微信接口、合法域名和 iOS/Android 真机证据。

## 1. 范围与候选源

v0.4.0 只验收 P0 V040-00～V040-08：公开 Moment 阅读、媒体/搜索/点赞、微信读者身份和文章
评论会话复用。V040-09～V040-10（Moment 评论/回复）明确后移 v0.4.1，远程预留开关必须保持
关闭，不能宣传为 v0.4.0 能力。

| 仓库 | 候选分支/提交 | 目标版本 | 状态 |
| --- | --- | --- | --- |
| HaloWeApp | `develop/v0.4.0`；功能基线 `671246e`，最终文档/门禁以包含本文的提交为准 | 0.4.0 | RC，未打 tag |
| plugin-halo-weapp | `develop/v0.2.0` / `2fa870c` | 0.2.0 | RC，未打 tag |
| HaloWeApp 回滚 | tag `v0.3.0` / `290ffa8` | 0.3.0 | tag 存在 |
| plugin 回滚 | tag `v0.1.0` / `df1dcf3` | 0.1.0 | tag 存在 |

版本静态核验：

| 来源 | 期望 | 结果 |
| --- | ---: | --- |
| `config/index.js` | 0.4.0 | PASS |
| `package.json` | 0.4.0 | PASS |
| `package-lock.json` 根包 | 0.4.0 | PASS |
| 插件 `gradle.properties` | 0.2.0 | PASS |
| 插件 OpenAPI `info.version` | 0.2.0 | PASS |
| 插件 jar `plugin.yaml requires` | `>=2.23.0` | PASS |

## 2. 验证环境

- 操作系统：当前 Linux 工作区；时区 Asia/Shanghai；
- Node.js v26.5.0 / npm 12.0.1；
- Eclipse Temurin JDK 21.0.12+8；
- Gradle Wrapper 9.4.0；
- 微信开发者工具 CLI：`/opt/wechat-devtools/bin/wechat-devtools-cli`，基础库 3.8.0；
- Gitleaks 8.30.1；OpenAPI lint 使用 `@redocly/cli`；
- 小程序 release 共享配置 `project.config.json setting.urlCheck=true`；本次本机私有覆盖也改为
  true，但这只证明配置，没有证明微信后台已登记域名。

## 3. 自动化、构建与契约

### 3.1 HaloWeApp

```bash
npm test
git diff --check
node --check <全部变更 JS>
```

| 项目 | 结果 | 证据边界 |
| --- | --- | --- |
| Node 测试 | PASS：162/162，0 fail/skip | 纯函数、状态机、请求 Mock；非真机 |
| auth-session | PASS：13 个场景（包含新增异常隐私响应与 READER_NOT_FOUND 收口） | 模拟微信/API/storage |
| Moment 适配/能力/媒体 | PASS | v1.15 合成官方类型 + v1.16 脱敏夹具；非实际插件矩阵 |
| JS 语法 / whitespace | PASS | 不覆盖 WXML/WXSS 运行时 |
| 微信开发者工具 preview | PASS | 编译/打包成功；非真机网络与交互 |

### 3.2 plugin-halo-weapp

最终代码在两套 Halo plugin API platform 上重复执行：

```bash
./gradlew clean test -PhaloApiVersion=2.23.0
./gradlew clean test -PhaloApiVersion=2.25.0
./gradlew clean build -PhaloApiVersion=2.23.0
```

| 项目 | 结果 | 证据边界 |
| --- | --- | --- |
| API 2.23.0 测试 | PASS：97/97，0 fail/skip | 最低 API 编译 + Mock 单测 |
| API 2.25.0 测试 | PASS：97/97，0 fail/skip | Halo 2.25.4 对应已发布 API platform；非 runtime |
| 正式兼容 jar build | PASS | 以最低 API 2.23.0 构建 |
| OpenAPI | PASS：Redocly 结构有效 | 仅剩 1 个样式 warning：公开 GET `/config` 没有伪造 4xx 响应 |
| YAML 解析 | PASS | workflow/settings/plugin/roles 均可解析 |
| feature 默认值 | PASS | moments、Moment 评论、readerAccount 均为 false |

插件 jar 证据（源树 `2fa870c`）：

- 文件：`plugin-halo-weapp-0.2.0.jar`；
- 大小：158,264 bytes；
- SHA-256：`f7db9853513eb5c5f70055915ed5cb98effb2d37793f53c7630d452a57fb2c4e`；
- 72 个 class 全部位于 `run/halo/weapp/`，未内嵌第三方 class；
- `plugin.yaml`、`settings.yaml`、`extensions/roles.yaml`、AuthEndpoint、WeAppUser 和
  IdentityKeyService 均存在。

> jar SHA 只对应本次本地构建。正式 GitHub Release 必须从最终 tag 重新构建并记录新的、可下载
> 产物 SHA，不能直接把本文哈希当作永久供应链证明。

## 4. 包体与 pack ignore

使用同一 AppID、开发者工具和生成后的同版本 `miniprogram_npm/mp-html` 分别 preview：

| 源 | TOTAL bytes | 工具显示 | 相对 v0.3.0 |
| --- | ---: | ---: | ---: |
| v0.3.0 tag `290ffa8` | 162,533 | 158.7 KB | — |
| v0.4.0 RC | 236,493 | 231.0 KB | +73,960 bytes / +72.2 KiB / +45.50% |

结果：PASS，当前总包远低于微信 2 MiB 限制。

pack ignore 采用可复现 canary 方法验证：在 v0.4.0 实现基线的临时 worktree 中分别新增
`docs/pack-ignore-canary.bin` 与 `tests/fixtures/pack-ignore-canary.bin`，每个 1 MiB，再次 preview；
TOTAL 仍为 236,493 bytes，与无 canary 完全一致。因此 `docs/`、`tests/` 和其 fixtures 未进入
上传包。临时 canary 和二维码均未提交仓库。

最终 RC preview（2026-08-02 12:43 Asia/Shanghai）在共享/私有 `urlCheck=true` 下成功，TOTAL
仍为 236,493 bytes。此结果不证明后台合法域名或资源请求可用。

## 5. 兼容矩阵

### 5.1 已有自动化/接口证据

| 组合/场景 | 证据 | 结论 |
| --- | --- | --- |
| Moment 1.15.x 契约 | 官方类型合成夹具的列表/详情/媒体测试 | PARTIAL：adapter PASS，未部署真实 1.15.x |
| Moment 1.16.1 契约 | 脱敏真实响应夹具测试 | PARTIAL：adapter PASS，未核验来源实例当前版本 |
| Halo API 2.23.0 | 插件 97 项测试 | PARTIAL：编译/Mock PASS，未启动 2.23.x runtime |
| Halo API 2.25.0 | 插件 97 项测试 | PARTIAL：编译/Mock PASS，未完成 Halo 2.25.4 runtime |
| Moment 插件缺失/停用/超时/HTML/非法 JSON | capabilities/runtime/search 自动化 | PASS（自动化范围） |
| PHOTO/VIDEO/AUDIO/POST/未知媒体 | adapter + media-session 自动化 | PASS（模型/生命周期范围），真机 PENDING |
| PRIVATE/未审核/已删除 | v1.15/v1.16 fixture 防御性过滤 | PASS（客户端防御）；真实匿名响应 PENDING |
| 登录/恢复/401/隐私变化/退出/注销 | 双端 162 + 97 项测试 | PASS（自动化范围），真实微信 PENDING |
| 旧 v0.3.0 客户端 + v0.2.0 插件 | 路径/DTO 向后兼容测试和静态契约 | PARTIAL，实际暗部署回归 PENDING |

2026-08-02 对当前 `config.baseUrl` 做了不保存正文的匿名探测：

- `PluginMoments/available` 返回 JSON `true`；
- 公开 Moment 列表返回 4 项，观察到绝对媒体 origin `https://cdn.uomn.cn`；
- 配套插件 `/config` 返回 `text/html` 而非 JSON，说明该站点当前不能作为 v0.2.0 auth/config
  验证环境；客户端对应 parse/fail-closed 路径已有自动化测试。

这只能作为“当前异常配置不会被接受”和生产域名盘点的辅助证据，不能证明 Moment 版本、配套
插件暗部署或读者登录成功。

### 5.2 未完成的实际矩阵

| Halo runtime | Moment | iOS | Android | 状态 |
| --- | --- | --- | --- | --- |
| 2.23.x | 1.15.x | 无记录 | 无记录 | PENDING |
| 2.23.x | 1.16.1 | 无记录 | 无记录 | PENDING |
| 2.25.4 | 1.15.x | 无记录 | 无记录 | PENDING |
| 2.25.4 | 1.16.1 | 无记录 | 无记录 | PENDING |

曾执行 `./gradlew haloServer -PhaloDevVersion=2.25.4`，构建阶段成功但环境停在
`pullHaloImage`，未启动容器、未获得健康检查或插件加载证据，故保持 PENDING。

## 6. 凭据、日志与依赖审计

### 6.1 凭据/真实资料

Gitleaks 8.30.1 结果：

| 仓库 | Git 全历史 | 当前工作树 |
| --- | ---: | ---: |
| HaloWeApp | PASS：候选分支完整历史，0 leak | PASS：0 leak |
| plugin-halo-weapp | PASS：8 commits，0 leak | PASS：0 leak |

插件 `.gitleaks.toml` 只允许 v0.1.0 以前两个已审查的确定性文档/测试占位值；当前 OpenAPI 和测试
已改为 `example` / `test-...-placeholder`。本地 JDK、Gradle cache 和 build 输出按 `.gitignore`
路径排除，不放宽源文件规则。脱敏 Moment/Post/Comment fixture 与合成 v1.15 样本未发现凭据。

日志静态审查结果：微信 WebClient 只记录 errcode、traceId、suggest、label、耗时和进程级 HMAC
短标签；未知异常兜底已收口为 requestId + 异常类名，不再记录异常 message/stacktrace，避免 URI、
header、请求体或正文进入日志。真实生产日志扫描仍为 PENDING。

### 6.2 客户端依赖

```bash
npm audit --omit=dev --json
```

结果：PASS，1 个直接生产依赖（mp-html 2.5.2），info/low/moderate/high/critical 均为 0。

### 6.3 Halo 平台依赖风险（未通过）

对 Gradle `compileClasspath` / `testRuntimeClasspath` 的 Maven 坐标调用 OSV querybatch：

| Halo API platform | compile 坐标 | OSV advisory | 受影响坐标 |
| --- | ---: | ---: | ---: |
| 2.23.0 | 208 | 99 | 30 |
| 2.25.0 | 210 | 20 | 9 |

2.25.0 的命中包括当日仍处于受影响版本范围的 Jackson Databind、Netty HTTP/HTTP2/HTTP3 和
Bouncy Castle 公告，例如 CVE-2026-59889（Jackson，固定于 2.21.5）、CVE-2026-55831（Netty，
固定于 4.2.16.Final）与 CVE-2026-5588（Bouncy Castle，固定于 1.84）。

插件 jar 未内嵌这些 class，它们由 Halo runtime 提供，不能通过把新版本塞入薄插件 jar 安全修补。
在 Halo 发布包含修复的平台版本，或项目完成逐项可利用性分析和正式风险接受之前，依赖漏洞门禁
为 **FAIL/PENDING**。这也是当前禁止 tag 的独立原因。

## 7. 开发者工具 UI 证据边界

微信自动化 SDK 在 390×671 模拟器中完成 Profile 三种状态渲染，无 exception/error console：

| 状态 | 截图 SHA-256 |
| --- | --- |
| 匿名 | `178274c21e24ffd54b9fcc22d75d7780cee170c792c910e92995be4ed3fe3844` |
| 登录表单 | `beade93be27c95db3c412595bcda329d14673e2670d07d84e4a97241834f2f3b` |
| 注入的已认证状态 | `82717104362c5cdfd935c58abea43c9667367c037035e412240a2cfd2e243375` |

“已认证”状态由自动化注入，仅证明 badge、昵称、退出/注销和公开评论警告的布局，不证明
`wx.login`、OpenID/HMAC、token、真实恢复或注销成功。

## 8. 真机/生产签字表（全部待执行）

每项必须记录：日期、设备型号、OS/微信/基础库版本、Halo/Moment/配套插件版本、开关快照、操作
步骤、预期/实际、截图或脱敏日志链接、执行人。不得在证据中保存 wx code、OpenID、token、
AppSecret 或 identityKey。

| 场景 | iOS | Android | 发布要求 |
| --- | --- | --- | --- |
| 开启合法域名校验：站点 request | PENDING | PENDING | API/配置/搜索无域名错误 |
| `www.uomn.cn` + 实际 CDN（当前观察 `cdn.uomn.cn`） | PENDING | PENDING | 图片/视频/音频/字体最终 origin 全登记 |
| PHOTO 1/4/9 图与预览 | PENDING | PENDING | 布局、滑动、失败态正确 |
| VIDEO 播放/失败/切页/切后台 | PENDING | PENDING | 不自动播放，退出停止 |
| AUDIO 单播/切换/切后台/卸载 | PENDING | PENDING | 无双播和后台残留 |
| POST/未知媒体/已删除深链 | PENDING | PENDING | 正确跳转或安全降级 |
| 弱网/超时/离线恢复 | PENDING | PENDING | 文章首屏不等 Moment，无永久 loading |
| 长列表/低内存/后台恢复 | PENDING | PENDING | 无崩溃、状态可恢复 |
| 首次登录拒绝/同意/昵称拦截 | PENDING | PENDING | 拒绝不创建 WeAppUser |
| 冷启动恢复/插件重启/并发 401 | PENDING | PENDING | 单飞且缓存不伪造登录 |
| 修改昵称/隐私版本变化 | PENDING | PENDING | 重新同意前 fail-closed |
| 退出与注销二次确认 | PENDING | PENDING | token 失效；公开评论说明可见 |
| 注销后二次查询/全部会话 | PENDING | PENDING | 资源不存在，全部账号 token 失效 |

## 9. 暗部署、备份与回滚（待执行）

文档已在 plugin `2fa870c` 补齐，包含两个 ConfigMap、WeAppUser、identityKey 32 字节/指纹、恢复
顺序和 v0.1.0 回滚约束。但以下必须在隔离/生产等价环境实际演练：

- [ ] 备份 `plugin-halo-weapp-configmap`、`plugin-halo-weapp-identity`、全部 WeAppUser 和评论；
- [ ] 使用同一恢复点恢复，并验证 identityKey SHA-256 指纹一致；
- [ ] 已有 WeAppUser 时删除/清空 identity ConfigMap，确认返回 HALO_UNAVAILABLE 且不生成 key；
- [ ] 恢复 key 后，已有账号不携带昵称恢复到原 profile；
- [ ] v0.2.0 所有新开关关闭暗部署，旧 v0.3.0 config/session/文章评论无回归；
- [ ] 按 readerAccount → 评论写入 → moments → PluginMoments 顺序关闭；
- [ ] 回滚插件 v0.1.0 + 小程序 v0.3.0，保留 identity ConfigMap/WeAppUser；
- [ ] 再升级 v0.2.0 并恢复已有账号。

## 10. 隐私与审核（待签字）

- [x] 代码/文档字段清单、处理时机、退出/注销和公开评论边界已写入插件 `docs/privacy.md`；
- [x] UI 注销确认明确“已有公开评论不会自动删除”；
- [x] v0.4.0 不请求/上传头像、手机号、邮箱、位置；
- [ ] 运营主体、联系方式、真实政策 URL/版本和保留期限完成法务核对；
- [ ] 微信小程序隐私保护指引与实际昵称、wx.login 标识、评论内容、安全检测/托管方一致；
- [ ] iOS/Android 验证拒绝同意不创建账号、版本变化重新同意、注销入口可用；
- [ ] 微信审核完成；提审期间所有新 feature 与 UGC 写入口保持关闭。

## 11. 当前 DoD 判定

| 开发计划 §12 | 判定 |
| --- | --- |
| V040-00～V040-07 实现与自动化 | PASS（现有证据范围） |
| V040-08 文档、版本、包体、pack ignore、双端 build | PASS |
| Halo/Moment 双版本实际 runtime + 双真机 | **PENDING** |
| 登录/恢复/退出/注销真实微信记录 | **PENDING** |
| 插件暗部署、identityKey 恢复、旧客户端回滚 | **PENDING** |
| 生产合法域名、弱网、媒体/低内存 | **PENDING** |
| 依赖漏洞门禁 | **FAIL/PENDING（Halo 平台 advisories）** |
| 正式产物/tag 一致 | **PENDING；按规则尚未创建 tag** |

因此当前只能称为 **RC 开发候选**，不能将 V040-08、M4 或完整 v0.4.0 目标标记完成，也不能创建
HaloWeApp `v0.4.0` / plugin `v0.2.0` tag。完成上述直接证据并确认 P0 缺陷为 0 后，才可：

1. 从最终提交重新执行全部测试、Gitleaks、依赖审计、OpenAPI 和 preview/build；
2. 记录最终小程序 TOTAL 与 jar SHA-256；
3. 合并到 release 分支并创建两个带注释 tag；
4. 推送 tag，核对 GitHub Release 产物来源与校验和；
5. 按“插件暗部署 → 小程序只读 → Moment → 读者登录 → 文章评论”的顺序灰度。
