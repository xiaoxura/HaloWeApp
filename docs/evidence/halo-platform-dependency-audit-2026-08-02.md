# Halo 平台依赖风险审计（2026-08-02）

> 结论：**FAIL/PENDING**。逐项归因已经完成，但没有把“插件代码未直接调用”误判为 Halo
> 宿主整体不可利用；当前官方 Halo 2.25.4 仍包含有修复版本可用的受影响组件，且目标环境的
> 协议、反向代理、数据库、模板和风险接受均没有签字。因此本证据不能解除 v0.4.0/v0.2.0
> tag 门禁。

机器可读原始结果：
[halo-platform-dependency-audit-2026-08-02.json](halo-platform-dependency-audit-2026-08-02.json)

- JSON SHA-256：`e390dd4087ec48cd2b17787fab611a8bdf5363bb35c1b71291cc4e7b48b69af0`；
- 生成时间：2026-08-02 19:30:55（Asia/Shanghai；JSON 为
  `2026-08-02T11:30:55+00:00`）；
- 审计工具源：`plugin-halo-weapp` `04f3fa78ca2c5bfed8130857c630fe24a0d113ef`，
  工作树为 clean，脚本 SHA-256
  `6b2aaa3fbbd28dc0bded3ef23cf1305085d1b319f2393ee8740dc19fee18c2bb`；
- 该提交的 GitHub Actions 双 API / 最低 API build
  [run 30746660243](https://github.com/xiaoxura/plugin-halo-weapp/actions/runs/30746660243)
  为 success；
- OSV 请求只包含 Maven package name 和 version，不包含源码、配置、凭据或业务数据。

## 1. 可复现方法与上游快照

执行命令：

```bash
cd ../plugin-halo-weapp
python3 scripts/security/audit-halo-platform.py \
  --runtime-image 2.23.3=halohub/halo:2.23.3 \
  --runtime-image 2.25.4=halohub/halo:2.25.4 \
  --coordinate-hint org.springframework.boot:spring-boot-jarmode-tools \
  --output /tmp/plugin-halo-weapp-platform-osv-20260802.json
```

脚本使用 Gradle resolution result 解析 `compileClasspath`；额外解析 `testRuntimeClasspath` 只为
没有 `pom.properties` 的 runtime jar 提供 group/artifact 字典，不把测试依赖计入 compile
命中。随后从官方 Docker 镜像的 `/application/lib` 或 `/application/BOOT-INF/lib` 提取全部
jar：优先读取 jar 内 Maven 元数据，缺失时使用“文件名 + 已解析 platform group”。Halo
2.23.3 唯一不在 Gradle 图中的 `spring-boot-jarmode-tools` 通过命令行显式补 group。任何 jar
无法识别都会中止，不会静默漏扫。

审计时的官方上游状态：

| 项目 | 结果 |
| --- | --- |
| Halo 最新正式 Release | `v2.25.4`，发布于 2026-06-24；Release jar SHA-256 `537756c4…a04e` |
| Halo plugin API platform 最新版 | `2.25.0`；Maven metadata 最后更新 2026-06-12 |
| Halo 2.23.3 镜像 | `halohub/halo@sha256:03f56d5b…f86661d` |
| Halo 2.25.4 镜像 | `halohub/halo@sha256:1299a0e7…ce547e6` |

## 2. 结果口径

旧清单把 OSV “坐标 × 公告”的命中行数简称为 advisory，容易与去重公告数混淆。本次同时保留
四个独立指标：解析坐标数、命中行数、去重公告数、受影响坐标数。

| 清单 | jar | 坐标 | 命中行 | 去重公告 | 受影响坐标 |
| --- | ---: | ---: | ---: | ---: | ---: |
| API platform 2.23.0 `compileClasspath` | — | 208 | 99 | 89 | 30 |
| API platform 2.25.0 `compileClasspath` | — | 210 | 20 | 19 | 9 |
| Halo 2.23.3 实际镜像 runtime | 217 | 220 | 101 | 86 | 32 |
| Halo 2.25.4 实际镜像 runtime | 216 | 219 | 29 | 24 | 14 |

实际 runtime 与 API platform 必须分开：例如 Halo 2.25.4 还包含 PostgreSQL JDBC、OnGres
SCRAM 和 Thymeleaf 命中，不能用薄插件的 compile 图代替宿主镜像 SBOM。

## 3. 插件自身调用边界

对 `04f3fa7` 源码与 jar 的静态检查得到：

1. 插件 jar 为 thin jar，第三方 class 不在产物中；不能在插件内安全覆盖 Halo 父 classloader
   的 Jackson、Netty、Bouncy Castle、数据库驱动或 Thymeleaf；
2. 插件对 Jackson Databind 的直接使用只有 `ObjectMapper.readTree` / `JsonNode` 和普通 DTO；
   源码没有 `@JsonView`、`@JsonUnwrapped`、`@JsonTypeInfo` 或按属性开启的
   `ACCEPT_CASE_INSENSITIVE_PROPERTIES`；
3. 源码没有 `io.netty`、`org.bouncycastle`、`org.thymeleaf`、JDBC、SCRAM、WebSocket、SPDY、
   HTTP/3、Bzip2、GOST、FrodoKEM 或 LDAP API 调用；
4. 插件的两个 `WebClient` 会走 Halo 提供的 Reactor Netty：固定访问微信 API 和站点自身评论
   API，因此 DNS 解码及宿主 HTTP pipeline 不能仅凭“无 Netty import”判定不可达；
5. 本机两个默认 H2 容器对 h2c prior-knowledge 请求均拒绝，说明本次隔离环境没有开放 HTTP/2；
   它不证明生产 TLS、反向代理、WebSocket、压缩或 HTTP/3 配置相同。

“插件触发不存在”只缩小 plugin-halo-weapp 的增量攻击面，不是对 Halo core、主题、其他插件或
目标部署的风险接受。

## 4. Halo 2.25.4 的 24 个公告逐项归因

修复版本取自本次 OSV 记录，并已逐个确认对应 POM 可从 Maven Central 获取。表中的“宿主待核”
表示当前证据不能证明 Halo 其他调用链不可达；所有行在正式平台升级或风险签字前仍属于门禁残余
风险。

| OSV / CVE | runtime 组件；最低修复 | 触发条件与本项目证据 | 判定 |
| --- | --- | --- | --- |
| [GHSA-5gvw-p9qm-jgwh](https://osv.dev/vulnerability/GHSA-5gvw-p9qm-jgwh) / CVE-2026-59889 | Jackson 2.21.4、3.1.4；2.21.5 / 3.1.5 | `@JsonView` + `@JsonUnwrapped` 容器属性；插件无这些注解，只做 tree parse | 插件触发不存在；宿主待核 |
| [GHSA-5jmj-h7xm-6q6v](https://osv.dev/vulnerability/GHSA-5jmj-h7xm-6q6v) / CVE-2026-54515 | Jackson 2.21.4；2.21.5 | 按属性 case-insensitive + `@JsonIgnoreProperties` 排除；插件没有该组合 | 插件触发不存在；宿主待核 |
| [GHSA-mhm7-754m-9p8w](https://osv.dev/vulnerability/GHSA-mhm7-754m-9p8w) | Jackson 2.21.4；2.21.5 | creator property 的 `@JsonView` + external type id；插件没有该组合 | 插件触发不存在；宿主待核 |
| [GHSA-4mp9-239f-g9hg](https://osv.dev/vulnerability/GHSA-4mp9-239f-g9hg) / CVE-2026-59898 | Netty HTTP 4.2.15；4.2.16.Final | WebSocket V07/V08 握手；插件不注册 WebSocket，目标宿主/代理未核 | 测试环境未启用；宿主条件风险 |
| [GHSA-558v-64gr-wgg4](https://osv.dev/vulnerability/GHSA-558v-64gr-wgg4) / CVE-2026-59901 | Netty compression 4.2.15；4.2.16.Final | 恶意 bzip2 流进入 `Bzip2Decoder`；插件不创建该 handler | 插件触发不存在；宿主待核 |
| [GHSA-6cqp-g7gg-8hr5](https://osv.dev/vulnerability/GHSA-6cqp-g7gg-8hr5) / CVE-2026-56746 | Netty HTTP 4.2.15；4.2.16.Final | `CorsHandler.shortCircuit` + `Origin: null`；插件不配置 Netty CORS | 插件触发不存在；宿主/代理待核 |
| [GHSA-6jqx-86gh-f27w](https://osv.dev/vulnerability/GHSA-6jqx-86gh-f27w) / CVE-2026-55831 | Netty HTTP 4.2.15；4.2.16.Final | SPDY SETTINGS 放大；插件与隔离环境均未启用 SPDY | 测试环境未启用；目标待核 |
| [GHSA-jppx-w49h-x2qq](https://osv.dev/vulnerability/GHSA-jppx-w49h-x2qq) / CVE-2026-56745 | Netty HTTP 4.2.15；4.2.16.Final | `SpdyHttpDecoder` RST_STREAM 泄漏；无 SPDY pipeline 证据 | 测试环境未启用；目标待核 |
| [GHSA-mvh2-crg5-v77c](https://osv.dev/vulnerability/GHSA-mvh2-crg5-v77c) / CVE-2026-55833 | Netty HTTP 4.2.15；4.2.16.Final | SPDY zlib header 解压放大；无 SPDY pipeline 证据 | 测试环境未启用；目标待核 |
| [GHSA-gcjf-9mgh-3p7g](https://osv.dev/vulnerability/GHSA-gcjf-9mgh-3p7g) / CVE-2026-59921 | Netty HTTP 4.2.15；4.2.16.Final | `HttpPostRequestEncoder` multipart 文件名；插件 WebClient 只发送 JSON | 插件触发不存在；宿主其他客户端待核 |
| [GHSA-q4f6-jm68-57ww](https://osv.dev/vulnerability/GHSA-q4f6-jm68-57ww) / CVE-2026-59899 | Netty HTTP 4.2.15；4.2.16.Final | HTTP/1.1 pipelining + `HttpContentCompressor` 队列；Halo 对外 HTTP 路径可能满足 | **宿主条件可达，未排除** |
| [GHSA-93wv-jw9v-4972](https://osv.dev/vulnerability/GHSA-93wv-jw9v-4972) / CVE-2026-56819 | Netty HTTP/2 4.2.15；4.2.16.Final | HTTP/2 内容解压关闭流；隔离 h2c 未启用，生产 TLS/代理未知 | 测试环境未启用；目标待核 |
| [GHSA-c69g-56f8-xwqj](https://osv.dev/vulnerability/GHSA-c69g-56f8-xwqj) / CVE-2026-59900 | Netty HTTP/2 4.2.15；4.2.16.Final | HTTP/2 → HTTP/1 Host 重复翻译；目标协议终止位置未知 | 测试环境未启用；目标待核 |
| [GHSA-hpcc-26xq-25fv](https://osv.dev/vulnerability/GHSA-hpcc-26xq-25fv) / CVE-2026-56816 | Netty HTTP/3 4.2.15；4.2.16.Final | QUIC/HTTP3 reserved frame；插件与隔离环境不启用 HTTP/3 | 测试环境未启用；目标待核 |
| [GHSA-mfg7-5gfp-c4w3](https://osv.dev/vulnerability/GHSA-mfg7-5gfp-c4w3) | Netty DNS 4.2.15；4.2.16.Final | 恶意 DNS record 造成 buffer 泄漏；WebClient 有固定域名 DNS 查询 | **受信 DNS 前提下条件可达，未排除** |
| [GHSA-574f-3g2m-x479](https://osv.dev/vulnerability/GHSA-574f-3g2m-x479) / CVE-2025-14813 | Bouncy Castle 1.83；1.84 | GOST 28147 CTR；插件仅用 JDK `HmacSHA256`，不调用 GOST | 插件触发不存在；宿主待核 |
| [GHSA-c3fc-8qff-9hwx](https://osv.dev/vulnerability/GHSA-c3fc-8qff-9hwx) / CVE-2026-0636 | Bouncy Castle 1.83；1.84 | `LDAPStoreHelper` 注入；插件无 LDAP/Bouncy API | 插件触发不存在；宿主待核 |
| [GHSA-p93r-85wp-75v3](https://osv.dev/vulnerability/GHSA-p93r-85wp-75v3) / CVE-2026-5598 | Bouncy Castle 1.83；1.84 | FrodoKEM 解封装 timing channel；插件不使用 FrodoKEM | 插件触发不存在；宿主待核 |
| [GHSA-wg6q-6289-32hp](https://osv.dev/vulnerability/GHSA-wg6q-6289-32hp) / CVE-2026-5588 | Bouncy Castle PKIX 1.83；1.84 | draft composite 空签名序列；插件不做 PKIX composite 校验 | 插件触发不存在；宿主待核 |
| [GHSA-p9jg-fcr6-3mhf](https://osv.dev/vulnerability/GHSA-p9jg-fcr6-3mhf) / CVE-2026-53712 | OnGres SCRAM 3.2；3.3 | PostgreSQL 严格 channel binding + 特定证书算法 + MITM；插件不连接数据库 | 宿主数据库条件风险；目标待核 |
| [GHSA-j92g-9f8w-j867](https://osv.dev/vulnerability/GHSA-j92g-9f8w-j867) / CVE-2026-54291 | pgJDBC 42.7.11；42.7.12 | 同一 channel-binding downgrade；镜像含驱动，但目标 DB/加载路径未知 | 宿主数据库条件风险；目标待核 |
| [GHSA-c9ph-gxww-7744](https://osv.dev/vulnerability/GHSA-c9ph-gxww-7744) / CVE-2026-41901 | Thymeleaf 3.1.3；3.1.5.RELEASE | sandbox 表达式绕过；插件无模板，但 Halo core/主题使用边界未证明安全 | **宿主条件风险，Critical，未排除** |
| [GHSA-r4v4-5mwr-2fwr](https://osv.dev/vulnerability/GHSA-r4v4-5mwr-2fwr) / CVE-2026-40477 | Thymeleaf 3.1.3；3.1.4（统一升 3.1.5） | 未验证输入进入表达式时可 SSTI；插件无模板，宿主主题待核 | **宿主条件风险，Critical，未排除** |
| [GHSA-xjw8-8c5c-9r79](https://osv.dev/vulnerability/GHSA-xjw8-8c5c-9r79) / CVE-2026-40478 | Thymeleaf 3.1.3；3.1.4（统一升 3.1.5） | 未授权表达式语法绕过；插件无模板，宿主主题待核 | **宿主条件风险，Critical，未排除** |

## 5. 处置结论

### 5.1 首选修复

等待并升级到官方 Halo Release，使实际 runtime 至少包含以下修复线，然后对**新镜像 digest**
重新运行完整脚本和 Halo/Moment/plugin runtime 矩阵：

- Jackson Databind 2.21.5、Jackson 3 Databind 3.1.5；
- Netty 4.2.16.Final；
- Bouncy Castle 1.84；
- PostgreSQL JDBC 42.7.12、OnGres SCRAM 3.3；
- Thymeleaf 3.1.5.RELEASE。

这些版本不能由 thin plugin 私自塞入 jar。手工覆盖 Halo classpath 既不能证明二进制兼容，也会让
目标环境偏离官方可支持组合，不能作为本项目的正式修复。

### 5.2 只能降低风险、不能关闭门禁的部署措施

- 不直接暴露 Halo 8090；在已修补的反向代理终止 HTTP/2、HTTP/3 和 WebSocket，内部固定
  HTTP/1.1，并对连接、pipelining、请求速率和响应压缩设置边界；
- 使用受信递归 DNS，限制 Halo 出站只访问必要的微信与站点 origin，并监控 direct-memory/OOM；
- 若目标使用 PostgreSQL，记录实际驱动、TLS、`channelBinding`、证书算法和连接路径；
- 禁止不受信主题/模板与表达式输入；在平台修复前不要把“插件无 Thymeleaf”当成 Halo 安全；
- 所有新功能和 UGC 写入口继续默认关闭。这些措施不消除已有公开 Halo HTTP/主题攻击面。

### 5.3 正式风险接受仍缺失

若在官方修复版 Halo 发布前继续候选发布，必须由有权限的安全/运维负责人另行签署至少包含：目标
镜像 digest、外部协议与代理、数据库与模板实况、逐项补偿控制、残余影响、监控/回滚、责任人、
批准人和不超过 30 天的到期复审。本文作者没有权限代签，当前也没有上述目标环境证据。

因此“逐项分析”子任务可视为完成，但依赖漏洞发布门禁仍为 **FAIL/PENDING**；不得创建
HaloWeApp `v0.4.0` 或 plugin `v0.2.0` tag。
