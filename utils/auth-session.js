/**
 * 微信读者账号会话管理。
 *
 * 安全边界：
 * - session token、expiresAt、OpenID 和 readerName 只存在本模块内存；
 * - storage 只保存保持登录意愿、脱敏公开 profile 和隐私政策版本；
 * - 首次 login 必须由页面显式传入 consentGiven=true，restore 不创建新账号；
 * - 账号请求收到一次 401 会通过单飞 wx.login 恢复，并且最多重试原请求一次。
 */

const config = require('../config/index')
const api = require('./api')
const { runtimeConfig: defaultRuntimeConfig } = require('./runtime-config')

const EXPIRY_MARGIN_MS = 60000
const DEFAULT_EXPIRES_IN = 5400

const AUTH_STATES = Object.freeze({
  ANONYMOUS: 'anonymous',
  LOGGING_IN: 'logging-in',
  AUTHENTICATED: 'authenticated',
  RESTORING: 'restoring',
  CONSENT_REQUIRED: 'consent-required',
  LOGGING_OUT: 'logging-out',
  DELETING: 'deleting',
  ERROR: 'error'
})

// 这些键只包含非凭据数据；名称保持 privacyConsentVersion 与评论旧流程兼容。
const AUTH_STORAGE_KEYS = Object.freeze({
  KEEP_LOGIN: 'readerKeepLogin',
  PROFILE: 'readerProfile',
  CONSENT: 'privacyConsentVersion'
})

function errorCode(err) {
  return (err && err.data && err.data.code) || (err && err.code) || ''
}

function isSessionError(err) {
  return !!(
    err &&
    err.type === 'http' &&
    err.statusCode === 401 &&
    (errorCode(err) === 'SESSION_EXPIRED' || errorCode(err) === 'SESSION_REQUIRED')
  )
}

function isConsentError(err) {
  return errorCode(err) === 'PRIVACY_CONSENT_REQUIRED' ||
    (err && err.statusCode === 428)
}

function makeAuthError(code, message) {
  const error = new Error(message)
  error.type = 'auth'
  error.code = code
  error.data = { code, message }
  return error
}

function publicError(err) {
  if (!err) return null
  return {
    code: errorCode(err) || err.type || 'AUTH_ERROR',
    message: (err.data && err.data.message) || err.message || '登录服务暂时不可用',
    type: err.type || 'auth',
    statusCode: err.statusCode || 0
  }
}

function codePointLength(value) {
  return value ? [...value].length : 0
}

function validDisplayName(value) {
  if (typeof value !== 'string') return false
  const name = value.trim()
  return codePointLength(name) >= 2 && codePointLength(name) <= 20 &&
    !/[\u0000-\u001f\u007f-\u009f]/.test(name)
}

function sanitizeProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const displayName = typeof value.displayName === 'string' ? value.displayName.trim() : ''
  const privacyPolicyVersion = typeof value.privacyPolicyVersion === 'string'
    ? value.privacyPolicyVersion
    : ''
  if (!validDisplayName(displayName) || !privacyPolicyVersion || privacyPolicyVersion.length > 100) {
    return null
  }
  // 明确重建白名单对象，不能把 readerName/OpenID 等未知字段带入 storage 或页面。
  return { displayName, privacyPolicyVersion }
}

function safeStorage() {
  return {
    get(key) {
      try {
        return typeof wx !== 'undefined' && wx.getStorageSync ? wx.getStorageSync(key) : undefined
      } catch (e) {
        return undefined
      }
    },
    set(key, value) {
      try {
        if (typeof wx !== 'undefined' && wx.setStorageSync) wx.setStorageSync(key, value)
      } catch (e) {
        // storage 失败不应让当前内存认证失败
      }
    },
    remove(key) {
      try {
        if (typeof wx !== 'undefined' && wx.removeStorageSync) wx.removeStorageSync(key)
      } catch (e) {
        // storage 失败不应让退出/注销卡住
      }
    }
  }
}

function safeReadString(storage, key) {
  const value = storage.get(key)
  return typeof value === 'string' && value.length <= 100 ? value : ''
}

function safeReadProfile(storage) {
  return sanitizeProfile(storage.get(AUTH_STORAGE_KEYS.PROFILE))
}

function wxLogin() {
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || typeof wx.login !== 'function') {
      const error = new Error('微信登录能力不可用')
      error.type = 'platform'
      reject(error)
      return
    }
    wx.login({
      success: (res) => {
        if (res && typeof res.code === 'string' && res.code.trim()) {
          resolve(res.code)
        } else {
          const error = new Error('wx.login 未返回 code')
          error.type = 'parse'
          reject(error)
        }
      },
      fail: () => {
        const error = new Error('微信登录失败，请稍后重试')
        error.type = 'network'
        reject(error)
      }
    })
  })
}

function createAuthSession(deps = {}) {
  const authApi = deps.api || api
  const runtime = deps.runtimeConfig || defaultRuntimeConfig
  const storage = deps.storage || safeStorage()
  const login = deps.login || wxLogin
  const now = deps.now || (() => Date.now())
  const clientVersion = deps.clientVersion || config.version
  const listeners = new Set()

  let token = null
  let expiresAt = 0
  let profile = safeReadProfile(storage)
  let keepLogin = storage.get(AUTH_STORAGE_KEYS.KEEP_LOGIN) === true
  let consentVersion = safeReadString(storage, AUTH_STORAGE_KEYS.CONSENT)
  let state = AUTH_STATES.ANONYMOUS
  let lastError = null
  let operation = ''
  let loginInflight = null
  let restoreInflight = null
  let reloginInflight = null

  function snapshot() {
    return Object.freeze({
      state,
      authenticated: state === AUTH_STATES.AUTHENTICATED && unexpiredToken(),
      // 返回副本，调用方不能修改会话内部资料。
      profile: profile ? { ...profile } : null,
      keepLogin,
      consentVersion,
      error: lastError ? { ...lastError } : null,
      operation
    })
  }

  function emit() {
    const next = snapshot()
    listeners.forEach((listener) => {
      try {
        listener(next)
      } catch (e) {
        // UI 订阅者异常不能影响认证状态机。
        console.warn('auth-session subscriber failed')
      }
    })
    return next
  }

  function setStatus(nextState, error = null, nextOperation = '') {
    state = nextState
    lastError = error ? publicError(error) : null
    operation = nextOperation
    return emit()
  }

  function setTokenFromResult(result, requestedPrivacyVersion) {
    if (!result || typeof result.sessionToken !== 'string' || !result.sessionToken) {
      const error = new Error('登录响应缺少有效会话')
      error.type = 'parse'
      throw error
    }
    const nextProfile = sanitizeProfile(result.profile)
    if (!nextProfile || nextProfile.privacyPolicyVersion !== requestedPrivacyVersion) {
      const error = new Error('登录响应资料不合法')
      error.type = 'parse'
      throw error
    }
    const expiresIn = typeof result.expiresIn === 'number' && result.expiresIn > 0
      ? result.expiresIn
      : DEFAULT_EXPIRES_IN
    token = result.sessionToken
    expiresAt = now() + expiresIn * 1000
    profile = nextProfile
    consentVersion = requestedPrivacyVersion || nextProfile.privacyPolicyVersion
    lastError = null
    operation = ''

    // 仅写入白名单数据；token 从不经过 storage。
    storage.set(AUTH_STORAGE_KEYS.KEEP_LOGIN, keepLogin)
    if (keepLogin) storage.set(AUTH_STORAGE_KEYS.PROFILE, { ...nextProfile })
    else storage.remove(AUTH_STORAGE_KEYS.PROFILE)
    storage.set(AUTH_STORAGE_KEYS.CONSENT, consentVersion)
    state = AUTH_STATES.AUTHENTICATED
    return emit()
  }

  async function readyForLogin() {
    const cfg = await runtime.ready()
    const features = cfg && cfg.features && cfg.features.readerAccount
    if (!runtime.isLive || !runtime.isLive()) {
      throw makeAuthError('HALO_UNAVAILABLE', '登录配置暂时不可用，请稍后重试')
    }
    if (!features || features.enabled !== true) {
      throw makeAuthError('READER_ACCOUNT_DISABLED', '微信读者登录暂未开放')
    }
    if (runtime.isVersionOk && !runtime.isVersionOk()) {
      throw makeAuthError('CLIENT_UPDATE_REQUIRED', '请更新小程序后再登录')
    }
    const privacyVersion = cfg && cfg.privacyPolicyVersion
    const privacyUrl = cfg && cfg.privacyPolicyUrl
    if (typeof privacyVersion !== 'string' || !privacyVersion || privacyVersion.length > 100 ||
      typeof privacyUrl !== 'string' || !/^https:\/\//i.test(privacyUrl)) {
      throw makeAuthError('HALO_UNAVAILABLE', '隐私配置暂时不可用，请稍后重试')
    }
    return { cfg, privacyVersion }
  }

  function requireExplicitConsent(command, privacyVersion) {
    if (!command || command.consentGiven !== true ||
      command.privacyConsentVersion !== privacyVersion) {
      throw makeAuthError('PRIVACY_CONSENT_REQUIRED', '请阅读并同意最新隐私政策')
    }
    if (!validDisplayName(command.displayName)) {
      throw makeAuthError('VALIDATION_ERROR', '首次登录请输入 2～20 个字符的昵称')
    }
  }

  function requireRestoreConsent(privacyVersion) {
    if (!consentVersion || consentVersion !== privacyVersion) {
      throw makeAuthError('PRIVACY_CONSENT_REQUIRED', '请重新阅读并同意最新隐私政策')
    }
  }

  function header(tokenValue) {
    const result = { 'X-WeApp-Client-Version': clientVersion }
    if (tokenValue) result['X-WeApp-Session'] = tokenValue
    return result
  }

  async function performLogin({ restore = false, command = null, allowWithoutIntent = false } = {}) {
    const { privacyVersion } = await readyForLogin()
    let nextKeepLogin = keepLogin
    if (restore) {
      if (!allowWithoutIntent && !keepLogin) {
        throw makeAuthError('RESTORE_NOT_REQUESTED', '未启用保持登录')
      }
      requireRestoreConsent(privacyVersion)
    } else {
      requireExplicitConsent(command, privacyVersion)
      nextKeepLogin = command.keepLogin !== false
    }
    const code = await login()
    const payload = { code, privacyConsentVersion: privacyVersion }
    if (!restore && command && command.displayName !== undefined) {
      payload.displayName = command.displayName.trim()
    }
    const result = await authApi.loginReader(payload, header())
    keepLogin = nextKeepLogin
    return setTokenFromResult(result, privacyVersion)
  }

  function handleFailure(err, fallbackState = AUTH_STATES.ERROR) {
    if (isConsentError(err)) return setStatus(AUTH_STATES.CONSENT_REQUIRED, err)
    return setStatus(fallbackState, err)
  }

  async function loginReader(command) {
    if (loginInflight) return loginInflight
    setStatus(AUTH_STATES.LOGGING_IN, null, 'login')
    loginInflight = (async () => {
      try {
        return await performLogin({ command })
      } catch (err) {
        handleFailure(err)
        throw err
      }
    })()
    return loginInflight.finally(() => {
      loginInflight = null
    })
  }

  async function restore() {
    if (restoreInflight) return restoreInflight
    if (!keepLogin) return snapshot()
    setStatus(AUTH_STATES.RESTORING, null, 'restore')
    restoreInflight = (async () => {
      try {
        await performLogin({ restore: true })
        return snapshot()
      } catch (err) {
        // 冷启动恢复失败不抛出未处理 Promise，文章首屏和公开阅读不受阻塞。
        handleFailure(err)
        return snapshot()
      }
    })()
    return restoreInflight.finally(() => {
      restoreInflight = null
    })
  }

  async function relogin() {
    if (reloginInflight) return reloginInflight
    token = null
    expiresAt = 0
    setStatus(AUTH_STATES.RESTORING, null, 'relogin')
    reloginInflight = (async () => {
      try {
        await performLogin({ restore: true, allowWithoutIntent: true })
        return token
      } catch (err) {
        handleFailure(err)
        err.authRecovery = true
        throw err
      }
    })()
    return reloginInflight.finally(() => {
      reloginInflight = null
    })
  }

  function validToken() {
    return !!token && state === AUTH_STATES.AUTHENTICATED && expiresAt > now() + EXPIRY_MARGIN_MS
  }

  function unexpiredToken() {
    return !!token && expiresAt > now()
  }

  function freshToken() {
    return !!token && expiresAt > now() + EXPIRY_MARGIN_MS
  }

  async function ensureAuthenticated() {
    if (freshToken()) return token
    if (reloginInflight) return reloginInflight
    if ((state === AUTH_STATES.AUTHENTICATED || state === AUTH_STATES.DELETING) && profile) {
      return relogin()
    }
    throw makeAuthError('SESSION_REQUIRED', '请先登录微信读者')
  }

  async function withAuthenticated(fn) {
    const initialToken = await ensureAuthenticated()
    try {
      return await fn(initialToken)
    } catch (err) {
      if (!isSessionError(err)) throw err
      const freshToken = await relogin()
      try {
        return await fn(freshToken)
      } catch (retryError) {
        if (isSessionError(retryError)) {
          token = null
          expiresAt = 0
          handleFailure(retryError)
          retryError.authRecovery = true
        }
        throw retryError
      }
    }
  }

  async function getProfile() {
    return withAuthenticated((tokenValue) =>
      authApi.getReaderProfile(header(tokenValue)).then((result) => {
        const nextProfile = sanitizeProfile(result)
        if (!nextProfile) {
          const error = new Error('资料响应不合法')
          error.type = 'parse'
          throw error
        }
        profile = nextProfile
        consentVersion = nextProfile.privacyPolicyVersion
        if (keepLogin) storage.set(AUTH_STORAGE_KEYS.PROFILE, { ...nextProfile })
        storage.set(AUTH_STORAGE_KEYS.CONSENT, consentVersion)
        state = AUTH_STATES.AUTHENTICATED
        lastError = null
        emit()
        return { ...nextProfile }
      })
    )
  }

  async function updateProfile(displayName) {
    const value = typeof displayName === 'string' ? displayName.trim() : ''
    if (!validDisplayName(value)) throw makeAuthError('VALIDATION_ERROR', '昵称需为 2～20 个字符')
    const { privacyVersion } = await readyForLogin()
    if (consentVersion !== privacyVersion) {
      const error = makeAuthError('PRIVACY_CONSENT_REQUIRED', '请重新阅读并同意最新隐私政策')
      handleFailure(error, AUTH_STATES.AUTHENTICATED)
      throw error
    }
    operation = 'profile-update'
    emit()
    try {
      const result = await withAuthenticated((tokenValue) =>
        authApi.updateReaderProfile(
          { displayName: value, privacyConsentVersion: privacyVersion },
          header(tokenValue)
        )
      )
      const nextProfile = sanitizeProfile(result)
      if (!nextProfile || nextProfile.privacyPolicyVersion !== privacyVersion) {
        const error = new Error('资料响应不合法')
        error.type = 'parse'
        throw error
      }
      profile = nextProfile
      consentVersion = nextProfile.privacyPolicyVersion
      if (keepLogin) storage.set(AUTH_STORAGE_KEYS.PROFILE, { ...nextProfile })
      storage.set(AUTH_STORAGE_KEYS.CONSENT, consentVersion)
      state = AUTH_STATES.AUTHENTICATED
      lastError = null
      operation = ''
      emit()
      return { ...nextProfile }
    } catch (err) {
      operation = ''
      if (state !== AUTH_STATES.CONSENT_REQUIRED) {
        if (freshToken()) setStatus(AUTH_STATES.AUTHENTICATED, err)
        else handleFailure(err)
      }
      throw err
    }
  }

  async function logout() {
    const currentToken = token
    setStatus(AUTH_STATES.LOGGING_OUT, null, 'logout')
    try {
      if (currentToken) await authApi.logoutReader(header(currentToken))
    } finally {
      token = null
      expiresAt = 0
      profile = null
      keepLogin = false
      storage.remove(AUTH_STORAGE_KEYS.KEEP_LOGIN)
      storage.remove(AUTH_STORAGE_KEYS.PROFILE)
      setStatus(AUTH_STATES.ANONYMOUS)
    }
  }

  async function deleteAccount() {
    await ensureAuthenticated()
    setStatus(AUTH_STATES.DELETING, null, 'delete')
    try {
      // 删除同样只在账号 token 下执行；收到 401 时由 withAuthenticated 单飞恢复一次。
      await withAuthenticated((tokenValue) => authApi.deleteReaderAccount(header(tokenValue)))
      clearLocal({ clearConsent: true })
    } catch (err) {
      // 删除失败保留当前认证态，允许用户重试；服务端 404 表示账号已不存在，按已注销收口。
      if (errorCode(err) === 'READER_NOT_FOUND') {
        clearLocal({ clearConsent: true })
        return
      } else if (freshToken()) {
        setStatus(AUTH_STATES.AUTHENTICATED, err)
      } else if (state !== AUTH_STATES.CONSENT_REQUIRED && state !== AUTH_STATES.ERROR) {
        handleFailure(err)
      }
      throw err
    }
  }

  function clearLocal({ clearConsent = false } = {}) {
    token = null
    expiresAt = 0
    profile = null
    keepLogin = false
    if (clearConsent) consentVersion = ''
    storage.remove(AUTH_STORAGE_KEYS.KEEP_LOGIN)
    storage.remove(AUTH_STORAGE_KEYS.PROFILE)
    if (clearConsent) storage.remove(AUTH_STORAGE_KEYS.CONSENT)
    setStatus(AUTH_STATES.ANONYMOUS)
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {}
    listeners.add(listener)
    listener(snapshot())
    return () => listeners.delete(listener)
  }

  function preferredDisplayName(fallback = '') {
    return state === AUTH_STATES.AUTHENTICATED && profile
      ? profile.displayName
      : (typeof fallback === 'string' ? fallback : '')
  }

  return {
    states: AUTH_STATES,
    storageKeys: AUTH_STORAGE_KEYS,
    getSnapshot: snapshot,
    getState: () => state,
    getProfile: () => (profile ? { ...profile } : null),
    preferredDisplayName,
    getValidToken: () => (validToken() ? token : null),
    isAuthenticated: () => state === AUTH_STATES.AUTHENTICATED && unexpiredToken(),
    subscribe,
    login: loginReader,
    restore,
    refreshProfile: getProfile,
    updateProfile,
    logout,
    deleteAccount,
    withAuthenticated,
    clear: clearLocal
  }
}

const authSession = createAuthSession()

module.exports = {
  AUTH_STATES,
  AUTH_STORAGE_KEYS,
  EXPIRY_MARGIN_MS,
  sanitizeProfile,
  validDisplayName,
  isSessionError,
  createAuthSession,
  authSession
}
