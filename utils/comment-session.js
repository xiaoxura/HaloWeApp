/**
 * 微信登录短会话管理（插件 POST /session 签发的 90 分钟不透明 token）。
 *
 * 安全约定（与插件 docs/openapi.yaml 对齐）：
 * - token 仅存内存，绝不写入 storage（重启/冷启动后重新 wx.login）；
 * - ensure() 单飞：并发调用共享同一次登录流程；
 * - withSession(fn)：收到 401（SESSION_REQUIRED / SESSION_EXPIRED）时
 *   重新 wx.login 并**最多自动重试一次**，禁止无限重试；
 * - 仅在用户点击提交时触发 wx.login，不延长小程序冷启动。
 */

// 提前 60 秒视为过期，避免边界时刻请求恰好撞上服务端过期
const EXPIRY_MARGIN_MS = 60000

function isSessionError(err) {
  return !!(
    err &&
    err.type === 'http' &&
    err.statusCode === 401 &&
    err.data &&
    (err.data.code === 'SESSION_EXPIRED' || err.data.code === 'SESSION_REQUIRED')
  )
}

/**
 * 创建会话管理器（依赖注入便于测试）。
 * @param {object} deps
 * @param {Function} deps.login 发起微信登录，resolve 一次性 code
 * @param {Function} deps.createSession (code) => Promise<{ sessionToken, expiresIn }>
 * @param {Function} [deps.now] 当前时间戳（毫秒）
 */
function createCommentSession(deps) {
  const { login, createSession } = deps
  const now = deps.now || (() => Date.now())

  let current = null // { token, expiresAt }
  let inflight = null

  function clear() {
    current = null
  }

  function isValid() {
    return !!current && current.expiresAt > now() + EXPIRY_MARGIN_MS
  }

  /** 获取有效 token（无有效会话时执行一次登录） */
  function ensure() {
    if (isValid()) return Promise.resolve(current.token)
    if (inflight) return inflight
    inflight = (async () => {
      const code = await login()
      const res = await createSession(code)
      if (!res || typeof res.sessionToken !== 'string' || !res.sessionToken) {
        const err = new Error('会话响应非法')
        err.type = 'parse'
        throw err
      }
      const expiresIn = typeof res.expiresIn === 'number' && res.expiresIn > 0 ? res.expiresIn : 5400
      current = { token: res.sessionToken, expiresAt: now() + expiresIn * 1000 }
      return current.token
    })()
    // 无论成败都解除单飞，失败时允许下次重试
    return inflight.finally(() => {
      inflight = null
    })
  }

  /**
   * 携带会话执行请求；401 会话错误时重新登录并最多自动重试一次。
   * @param {Function} fn (token) => Promise
   */
  async function withSession(fn) {
    const token = await ensure()
    try {
      return await fn(token)
    } catch (err) {
      if (!isSessionError(err)) throw err
      clear()
      const freshToken = await ensure()
      return fn(freshToken)
    }
  }

  return { ensure, withSession, clear, isValid }
}

// 小程序内使用的单例（测试请使用 createCommentSession 注入依赖）
const api = require('./api')

const commentSession = createCommentSession({
  login: () =>
    new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (res && res.code) resolve(res.code)
          else reject(new Error('wx.login 未返回 code'))
        },
        fail: () => {
          const err = new Error('微信登录失败，请稍后重试')
          err.type = 'network'
          reject(err)
        }
      })
    }),
  createSession: (code) => api.createPluginSession(code)
})

module.exports = {
  createCommentSession,
  commentSession,
  isSessionError
}
