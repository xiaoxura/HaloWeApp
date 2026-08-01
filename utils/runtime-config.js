const config = require('../config/index')
const request = require('./request')

/**
 * 运行时远程配置（配套插件下发）。
 *
 * v0.2.0 采用「显式启用」策略：config.remoteConfig 中 enabled / pluginName /
 * endpoint 任一缺失时不发起任何网络请求，直接使用本地默认值。
 * 任何异常（插件不可用、超时、HTML、非法字段）都不会覆盖默认值，
 * 最终兜底始终为 commentEnabled: false。
 */

const CACHE_KEY = 'runtimeConfig'
const SCHEMA_VERSION = 1

const DEFAULT_CONFIG = Object.freeze({
  commentEnabled: false
})

/**
 * 白名单字段逐项校验。只接受 JSON 对象；非法或全无效字段返回 null。
 */
function validateRemoteConfig(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const out = {}
  if (typeof data.commentEnabled === 'boolean') out.commentEnabled = data.commentEnabled
  if (typeof data.minVersion === 'string') out.minVersion = data.minVersion
  if (typeof data.schemaVersion === 'number') out.schemaVersion = data.schemaVersion
  if (data.announcement && typeof data.announcement === 'object' && !Array.isArray(data.announcement)) {
    const announcement = {}
    if (typeof data.announcement.enabled === 'boolean') {
      announcement.enabled = data.announcement.enabled
    }
    if (typeof data.announcement.content === 'string') {
      announcement.content = data.announcement.content
    }
    out.announcement = announcement
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * 创建运行时配置管理器（依赖注入便于测试）。
 * @param {object} deps
 * @param {Function} deps.get 发起 GET 请求的函数 (path, params) => Promise
 * @param {object} deps.storage { get(key), set(key, value) } 同步存储
 * @param {Function} deps.now 当前时间戳（毫秒）
 * @param {object} deps.remoteConfig config.remoteConfig 配置项
 */
function createRuntimeConfig(deps) {
  const { get, storage, now, remoteConfig } = deps
  const rc = remoteConfig || {}
  const ttl = typeof rc.cacheTtl === 'number' ? rc.cacheTtl : 21600000
  const localDefaults = { ...DEFAULT_CONFIG, ...(deps.defaults || {}) }

  let current = { ...localDefaults }
  let readyPromise = null

  function readCache() {
    try {
      const cached = storage.get(CACHE_KEY)
      if (!cached || typeof cached !== 'object') return null
      if (cached.schemaVersion !== SCHEMA_VERSION) return null
      const valid = validateRemoteConfig(cached.data)
      if (!valid) return null
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

  async function fetchRemote() {
    // 1. 插件可用性检测，不可用则抛错进入兜底
    await get(`/apis/api.plugin.halo.run/v1alpha1/plugins/${encodeURIComponent(rc.pluginName)}/available`)
    // 2. 拉取配置（request 层已保证非 2xx / HTML / 非法 JSON 都会 reject）
    const data = await get(rc.endpoint)
    const valid = validateRemoteConfig(data)
    if (!valid) {
      const err = new Error('远程配置字段不合法')
      err.type = 'parse'
      throw err
    }
    writeCache(valid)
    return valid
  }

  async function init() {
    // 显式启用策略：配置不完整时不发起任何网络请求
    if (!rc.enabled || !rc.pluginName || !rc.endpoint) {
      current = { ...localDefaults }
      return current
    }

    try {
      const remote = await fetchRemote()
      current = { ...localDefaults, ...remote }
    } catch (err) {
      // 拉取失败：未过期缓存可降级使用；过期则回退本地默认值，等待下次冷启动刷新
      const cached = readCache()
      if (cached && now() - cached.fetchedAt <= ttl) {
        current = { ...localDefaults, ...cached.data }
      } else {
        current = { ...localDefaults }
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
  remoteConfig: config.remoteConfig,
  defaults: { commentEnabled: !!config.commentEnabled }
})

module.exports = {
  DEFAULT_CONFIG,
  CACHE_KEY,
  SCHEMA_VERSION,
  validateRemoteConfig,
  createRuntimeConfig,
  runtimeConfig
}
