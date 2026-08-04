const config = require('../config/index')
const request = require('./request')
const { compareSemver } = require('./util')
const {
  PLUGIN_NAME,
  PLUGIN_CONFIG_ENDPOINT,
  CONFIG_CACHE_TTL
} = require('./plugin-contract')

/**
 * 运行时远程配置（配套插件下发）。
 *
 * 插件名称与 API 路径是固定协议，不再由 config/index.js 重复配置。任何异常
 * （插件不可用、超时、HTML、非法字段）都不会覆盖安全默认值，评论写能力始终
 * fail-closed；站点展示配置则使用内置非敏感默认值降级。
 *
 * v0.3.0 起区分「评论读取」与「评论写入」（C-04）：
 * - commentEnabled 只控制评论区展示；写入口由 commentOptions.submitEnabled /
 *   replyEnabled 单独控制；
 * - 写能力 fail-closed：只有本次冷启动实时完成插件探测与 config 拉取（live），
 *   且 schema 受支持、客户端版本不低于 minVersion，才允许写入；
 * - 过期或降级缓存可继续展示公告/评论，但绝不开启写入口；
 */

const CACHE_KEY = 'runtimeConfig'
const SCHEMA_VERSION = 1
// 客户端支持的远程配置 schema 版本；高于此版本的响应整体忽略（保持只读）
const SUPPORTED_SCHEMA_VERSION = 1

const CONFIG_SOURCE = Object.freeze({
  pluginName: PLUGIN_NAME,
  endpoint: PLUGIN_CONFIG_ENDPOINT,
  cacheTtl: CONFIG_CACHE_TTL
})

const DEFAULT_CONFIG = Object.freeze({
  site: Object.freeze({
    blogName: '我的博客',
    blogDesc: '记录技术 · 记录生活',
    pageSize: 10,
    fontUrl: ''
  }),
  features: Object.freeze({
    moments: Object.freeze({
      enabled: false,
      commentEnabled: false
    }),
    readerAccount: Object.freeze({
      enabled: false
    })
  }),
  commentEnabled: false,
  commentOptions: Object.freeze({
    submitEnabled: false,
    replyEnabled: false,
    maxLength: 500,
    nicknameRequired: true
  }),
  announcement: Object.freeze({
    enabled: false,
    version: '',
    content: ''
  }),
  minVersion: '',
  privacyPolicyUrl: '',
  privacyPolicyVersion: ''
})

function isPluginAvailableResponse(value) {
  return value === true || (!!value && typeof value === 'object' && value.available === true)
}

/**
 * 白名单字段逐项校验。只接受 JSON 对象；非法或全无效字段返回 null。
 * 绝不透传白名单以外的字段（AppSecret、OpenID、内部异常等）。
 */
function validateRemoteConfig(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const out = {}
  if (data.site && typeof data.site === 'object' && !Array.isArray(data.site)) {
    const site = {}
    if (
      typeof data.site.blogName === 'string' &&
      data.site.blogName.trim() &&
      data.site.blogName.length <= 100
    ) {
      site.blogName = data.site.blogName
    }
    if (typeof data.site.blogDesc === 'string' && data.site.blogDesc.length <= 200) {
      site.blogDesc = data.site.blogDesc
    }
    if (
      Number.isInteger(data.site.pageSize) &&
      data.site.pageSize >= 1 &&
      data.site.pageSize <= 100
    ) {
      site.pageSize = data.site.pageSize
    }
    if (
      typeof data.site.fontUrl === 'string' &&
      (!data.site.fontUrl || /^https:\/\//i.test(data.site.fontUrl))
    ) {
      site.fontUrl = data.site.fontUrl
    }
    if (Object.keys(site).length > 0) out.site = site
  }
  if (data.features && typeof data.features === 'object' && !Array.isArray(data.features)) {
    const features = {}
    if (
      data.features.moments &&
      typeof data.features.moments === 'object' &&
      !Array.isArray(data.features.moments)
    ) {
      const moments = {}
      if (typeof data.features.moments.enabled === 'boolean') {
        moments.enabled = data.features.moments.enabled
      }
      if (typeof data.features.moments.commentEnabled === 'boolean') {
        moments.commentEnabled = data.features.moments.commentEnabled
      }
      if (Object.keys(moments).length > 0) features.moments = moments
    }
    if (
      data.features.readerAccount &&
      typeof data.features.readerAccount === 'object' &&
      !Array.isArray(data.features.readerAccount)
    ) {
      const readerAccount = {}
      if (typeof data.features.readerAccount.enabled === 'boolean') {
        readerAccount.enabled = data.features.readerAccount.enabled
      }
      if (Object.keys(readerAccount).length > 0) features.readerAccount = readerAccount
    }
    if (Object.keys(features).length > 0) out.features = features
  }
  if (typeof data.commentEnabled === 'boolean') out.commentEnabled = data.commentEnabled
  if (typeof data.minVersion === 'string') out.minVersion = data.minVersion
  if (typeof data.schemaVersion === 'number') out.schemaVersion = data.schemaVersion
  if (typeof data.generatedAt === 'string') out.generatedAt = data.generatedAt
  if (
    typeof data.privacyPolicyUrl === 'string' &&
    (!data.privacyPolicyUrl || /^https:\/\//i.test(data.privacyPolicyUrl))
  ) {
    out.privacyPolicyUrl = data.privacyPolicyUrl
  }
  if (typeof data.privacyPolicyVersion === 'string') {
    out.privacyPolicyVersion = data.privacyPolicyVersion
  }
  if (data.commentOptions && typeof data.commentOptions === 'object' && !Array.isArray(data.commentOptions)) {
    const opts = {}
    if (typeof data.commentOptions.submitEnabled === 'boolean') {
      opts.submitEnabled = data.commentOptions.submitEnabled
    }
    if (typeof data.commentOptions.replyEnabled === 'boolean') {
      opts.replyEnabled = data.commentOptions.replyEnabled
    }
    if (
      Number.isInteger(data.commentOptions.maxLength) &&
      data.commentOptions.maxLength >= 1 &&
      data.commentOptions.maxLength <= 500
    ) {
      opts.maxLength = data.commentOptions.maxLength
    }
    if (typeof data.commentOptions.nicknameRequired === 'boolean') {
      opts.nicknameRequired = data.commentOptions.nicknameRequired
    }
    if (Object.keys(opts).length > 0) out.commentOptions = opts
  }
  if (data.announcement && typeof data.announcement === 'object' && !Array.isArray(data.announcement)) {
    const announcement = {}
    if (typeof data.announcement.enabled === 'boolean') {
      announcement.enabled = data.announcement.enabled
    }
    if (typeof data.announcement.version === 'string') {
      announcement.version = data.announcement.version
    }
    if (typeof data.announcement.content === 'string') {
      announcement.content = data.announcement.content
    }
    out.announcement = announcement
  }
  return Object.keys(out).length > 0 ? out : null
}

/** 浅合并 + 嵌套对象与默认值合并；未知字段已经在 validate 阶段剔除。 */
function mergeConfig(base, extra) {
  const out = { ...base, ...(extra || {}) }
  const extraFeatures = (extra && extra.features) || {}
  out.site = { ...base.site, ...((extra && extra.site) || {}) }
  out.features = {
    moments: { ...base.features.moments, ...(extraFeatures.moments || {}) },
    readerAccount: { ...base.features.readerAccount, ...(extraFeatures.readerAccount || {}) }
  }
  out.commentOptions = { ...base.commentOptions, ...((extra && extra.commentOptions) || {}) }
  out.announcement = { ...base.announcement, ...((extra && extra.announcement) || {}) }
  return out
}

/**
 * 创建运行时配置管理器（依赖注入便于测试）。
 * @param {object} deps
 * @param {Function} deps.get 发起 GET 请求的函数 (path, params) => Promise
 * @param {object} deps.storage { get(key), set(key, value) } 同步存储
 * @param {Function} deps.now 当前时间戳（毫秒）
 * @param {object} [deps.source] 测试或兼容场景覆盖插件配置源；生产使用固定协议
 * @param {string} [deps.clientVersion] 当前客户端版本（SemVer），用于 minVersion 门槛
 */
function createRuntimeConfig(deps) {
  const { get, storage, now } = deps
  const source = deps.source || CONFIG_SOURCE
  const ttl = typeof source.cacheTtl === 'number' ? source.cacheTtl : CONFIG_CACHE_TTL
  const localDefaults = mergeConfig(DEFAULT_CONFIG, null)
  const clientVersion = typeof deps.clientVersion === 'string' ? deps.clientVersion : ''

  let current = mergeConfig(localDefaults, null)
  // 本次冷启动是否实时拉取成功（写能力前提，fail-closed）
  let live = false
  let readyPromise = null

  function readCache() {
    try {
      const cached = storage.get(CACHE_KEY)
      if (!cached || typeof cached !== 'object') return null
      if (cached.schemaVersion !== SCHEMA_VERSION) return null
      const valid = validateRemoteConfig(cached.data)
      if (!valid) return null
      // 缓存中高于自身支持范围的 schema 同样不可用
      if (typeof valid.schemaVersion === 'number' && valid.schemaVersion > SUPPORTED_SCHEMA_VERSION) {
        return null
      }
      return { data: valid, fetchedAt: typeof cached.fetchedAt === 'number' ? cached.fetchedAt : 0 }
    } catch (e) {
      return null
    }
  }

  function writeCache(data) {
    try {
      storage.set(CACHE_KEY, { data, fetchedAt: now(), schemaVersion: SCHEMA_VERSION })
    } catch (e) {
      // 存储失败不影响配置生效
    }
  }

  // 页面可在实时请求完成前同步使用未过期缓存中的站点展示配置；写能力仍由 live=false
  // 强制关闭。这样插件短时不可用不会阻塞文章首屏，也不会误开放评论提交。
  const initialCache = readCache()
  if (initialCache && now() - initialCache.fetchedAt <= ttl) {
    current = mergeConfig(localDefaults, initialCache.data)
  }

  async function fetchRemote() {
    // 1. 插件可用性检测，不可用则抛错进入兜底
    const availability = await get(
      `/apis/api.plugin.halo.run/v1alpha1/plugins/${encodeURIComponent(source.pluginName)}/available`
    )
    if (!isPluginAvailableResponse(availability)) {
      const err = new Error('配套插件不可用')
      err.type = 'unavailable'
      throw err
    }
    // 2. 拉取配置（request 层已保证非 2xx / HTML / 非法 JSON 都会 reject）
    const data = await get(source.endpoint)
    const valid = validateRemoteConfig(data)
    if (!valid) {
      const err = new Error('远程配置字段不合法')
      err.type = 'parse'
      throw err
    }
    if (typeof valid.schemaVersion === 'number' && valid.schemaVersion > SUPPORTED_SCHEMA_VERSION) {
      const err = new Error(`远程配置 schema 版本不受支持: ${valid.schemaVersion}`)
      err.type = 'unsupported'
      throw err
    }
    writeCache(valid)
    return valid
  }

  /** 客户端版本是否满足 minVersion；minVersion 非法时拒绝所有写能力。 */
  function checkVersion(cfg) {
    if (!cfg.minVersion) return true
    const cmp = compareSemver(clientVersion, cfg.minVersion)
    if (cmp === null) {
      console.warn('远程 minVersion 非法，已关闭写能力', clientVersion ? '' : '(客户端版本缺失)')
      return false
    }
    return cmp >= 0
  }

  async function init() {
    live = false
    // 固定协议被测试覆盖为不完整值时安全降级，不发起网络请求
    if (!source.pluginName || !source.endpoint) {
      current = mergeConfig(localDefaults, null)
      return current
    }

    try {
      const remote = await fetchRemote()
      live = true
      current = mergeConfig(localDefaults, remote)
    } catch (err) {
      // 拉取失败：未过期缓存可降级使用（仅读取/公告，写入口保持关闭）；
      // 过期则回退内置安全默认值，等待下次冷启动刷新
      const cached = readCache()
      if (cached && now() - cached.fetchedAt <= ttl) {
        current = mergeConfig(localDefaults, cached.data)
      } else {
        current = mergeConfig(localDefaults, null)
      }
    }
    return current
  }

  return {
    /** 配置就绪 Promise，页面用它避免启动时序竞争 */
    ready() {
      if (!readyPromise) readyPromise = init()
      return readyPromise
    },
    /** 同步获取当前配置（ready 之前为默认值） */
    getConfig() {
      return current
    },
    /** 本次冷启动是否实时拉取成功 */
    isLive() {
      return live
    },
    /** 客户端版本是否满足远程 minVersion */
    isVersionOk() {
      return checkVersion(current)
    },
    /** Moment 展示开关；缓存不能开启入口，必须先完成本次实时配置拉取。 */
    canReadMoments() {
      return live && current.features.moments.enabled === true
    },
    /**
     * 微信读者登录门禁：必须是实时配置、开关开启、版本满足且隐私契约完整。
     * 缓存配置永远不能创建账号或恢复认证会话。
     */
    canLogin() {
      return (
        live &&
        current.features.readerAccount.enabled === true &&
        checkVersion(current) &&
        typeof current.privacyPolicyVersion === 'string' &&
        current.privacyPolicyVersion.length > 0 &&
        current.privacyPolicyVersion.length <= 100 &&
        typeof current.privacyPolicyUrl === 'string' &&
        /^https:\/\//i.test(current.privacyPolicyUrl)
      )
    },
    /**
     * 是否允许发表评论（fail-closed）：
     * 实时拉取成功 + 评论区开启 + 提交开关开启 + 版本满足门槛
     */
    canSubmit() {
      return (
        live &&
        current.commentEnabled === true &&
        current.commentOptions.submitEnabled === true &&
        checkVersion(current)
      )
    },
    /** 是否允许回复（在 canSubmit 基础上要求回复开关） */
    canReply() {
      return this.canSubmit() && current.commentOptions.replyEnabled === true
    },
    /** v0.4.1 预留门禁；v0.4.0 没有对应写入路由或 UI。 */
    canSubmitMomentComment() {
      return (
        this.canSubmit() &&
        current.features.moments.enabled === true &&
        current.features.moments.commentEnabled === true
      )
    }
  }
}

// 小程序内使用的单例（测试请使用 createRuntimeConfig 注入依赖）
const runtimeConfig = createRuntimeConfig({
  get: (path) => request.get(path, null, { timeout: 5000 }),
  storage: {
    get: (key) => wx.getStorageSync(key),
    set: (key, value) => wx.setStorageSync(key, value)
  },
  now: () => Date.now(),
  clientVersion: config.version
})

module.exports = {
  DEFAULT_CONFIG,
  CACHE_KEY,
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSION,
  CONFIG_SOURCE,
  validateRemoteConfig,
  mergeConfig,
  createRuntimeConfig,
  runtimeConfig
}
