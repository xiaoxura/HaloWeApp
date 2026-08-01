const config = require('../config/index')

/**
 * 请求层错误类型：
 * - network：断网/域名未配置等 wx.request 直接失败
 * - timeout：请求超时
 * - http：服务器返回非 2xx 状态码
 * - parse：响应不是合法 JSON（如插件缺失时返回登录页 HTML）
 */
class RequestError extends Error {
  constructor(type, message, extra = {}) {
    super(message)
    this.name = 'RequestError'
    this.type = type
    this.statusCode = extra.statusCode || 0
    this.path = extra.path || ''
  }
}

/**
 * 序列化查询参数
 * 数组值序列化为重复 key（Halo API 约定 arrayFormat: repeat）：
 *   { sort: ['a,desc', 'b,desc'] } => 'sort=a,desc&sort=b,desc'
 * undefined / null / 空字符串跳过；0、false、中文与特殊字符正常编码。
 */
function serialize(params) {
  if (!params) return ''
  const parts = []
  Object.keys(params).forEach((key) => {
    const value = params[key]
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item === undefined || item === null || item === '') return
        parts.push(`${key}=${encodeURIComponent(item)}`)
      })
    } else {
      parts.push(`${key}=${encodeURIComponent(value)}`)
    }
  })
  return parts.length ? `?${parts.join('&')}` : ''
}

/**
 * 解析响应体：接口约定返回 JSON。
 * 服务器异常或插件缺失时可能返回 HTML 登录页（字符串），统一按 parse 错误处理，
 * 避免调用方把 HTML 当数据使用或缓存。
 * tracker 等写接口返回 200 + 空 body，空响应按 null 正常放行。
 */
function parseBody(data, path) {
  if (data === null || data === undefined) return null
  if (typeof data === 'string') {
    if (!data.trim()) return null
    try {
      return JSON.parse(data)
    } catch (e) {
      throw new RequestError('parse', `响应不是合法 JSON: ${path}`, { path })
    }
  }
  return data
}

/**
 * wx.request 封装
 * @param {string} method GET / POST / ...
 * @param {string} path 接口路径（/apis/... 开头）
 * @param {object} options { params, data, header, timeout }
 */
function request(method, path, options = {}) {
  const { params, data, header = {}, timeout = 10000 } = options
  const url = `${config.baseUrl}${path}${method === 'GET' ? serialize(params) : ''}`

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      header: { 'content-type': 'application/json', ...header },
      timeout,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(parseBody(res.data, path))
          } catch (err) {
            reject(err)
          }
        } else {
          reject(
            new RequestError('http', `请求失败（${res.statusCode}）`, {
              statusCode: res.statusCode,
              path
            })
          )
        }
      },
      fail: (err) => {
        const isTimeout = err && err.errMsg && err.errMsg.indexOf('timeout') !== -1
        reject(
          new RequestError(
            isTimeout ? 'timeout' : 'network',
            isTimeout ? '请求超时，请检查网络' : '网络异常，请检查网络连接',
            { path }
          )
        )
      }
    })
  })
}

module.exports = {
  RequestError,
  serialize,
  get: (path, params, options = {}) =>
    request('GET', path, { params, header: options.header, timeout: options.timeout }),
  post: (path, data, options = {}) =>
    request('POST', path, { data, header: options.header, timeout: options.timeout })
}
