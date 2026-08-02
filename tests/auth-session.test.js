const { test } = require('node:test')
const assert = require('node:assert')

const {
  AUTH_STATES,
  AUTH_STORAGE_KEYS,
  createAuthSession,
  sanitizeProfile
} = require('../utils/auth-session')

const PRIVACY = '2026-08-02'

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    get: (key) => map.get(key),
    set: (key, value) => map.set(key, value),
    remove: (key) => map.delete(key)
  }
}

function makeRuntime(overrides = {}) {
  const cfg = {
    features: { readerAccount: { enabled: true } },
    privacyPolicyUrl: 'https://example.com/privacy',
    privacyPolicyVersion: PRIVACY
  }
  const state = { readyCalls: 0 }
  return {
    state,
    ready: async () => {
      state.readyCalls++
      if (overrides.readyError) throw overrides.readyError
      return overrides.config || cfg
    },
    isLive: () => overrides.live !== false,
    isVersionOk: () => overrides.versionOk !== false
  }
}

function makeApi(overrides = {}) {
  const state = {
    loginCalls: 0,
    profileCalls: 0,
    updateCalls: 0,
    logoutCalls: 0,
    deleteCalls: 0,
    loginRequests: [],
    profileHeaders: [],
    updateRequests: [],
    logoutHeaders: [],
    deleteHeaders: []
  }
  const api = {
    state,
    async loginReader(payload, header) {
      state.loginCalls++
      state.loginRequests.push({ payload, header })
      if (overrides.loginReader) return overrides.loginReader(payload, header, state.loginCalls)
      return {
        sessionToken: `account-token-${state.loginCalls}`,
        expiresIn: 5400,
        profile: {
          displayName: payload.displayName || '缓存读者',
          privacyPolicyVersion: payload.privacyConsentVersion
        }
      }
    },
    async getReaderProfile(header) {
      state.profileCalls++
      state.profileHeaders.push(header)
      if (overrides.getReaderProfile) return overrides.getReaderProfile(header, state.profileCalls)
      return { displayName: '缓存读者', privacyPolicyVersion: PRIVACY }
    },
    async updateReaderProfile(payload, header) {
      state.updateCalls++
      state.updateRequests.push({ payload, header })
      if (overrides.updateReaderProfile) {
        return overrides.updateReaderProfile(payload, header, state.updateCalls)
      }
      return { displayName: payload.displayName, privacyPolicyVersion: payload.privacyConsentVersion }
    },
    async logoutReader(header) {
      state.logoutCalls++
      state.logoutHeaders.push(header)
      if (overrides.logoutReader) return overrides.logoutReader(header)
      return null
    },
    async deleteReaderAccount(header) {
      state.deleteCalls++
      state.deleteHeaders.push(header)
      if (overrides.deleteReaderAccount) return overrides.deleteReaderAccount(header, state.deleteCalls)
      return null
    }
  }
  return api
}

function makeDeps(overrides = {}) {
  const storage = overrides.storage || makeStorage()
  const runtimeConfig = overrides.runtimeConfig || makeRuntime()
  const api = overrides.api || makeApi()
  const loginState = { calls: 0 }
  const login = overrides.login || (async () => {
    loginState.calls++
    return `wx-code-${loginState.calls}`
  })
  return {
    storage,
    runtimeConfig,
    api,
    login,
    loginState,
    now: overrides.now || (() => 1000000),
    clientVersion: '0.4.0'
  }
}

function command(extra = {}) {
  return {
    displayName: '微信读者',
    privacyConsentVersion: PRIVACY,
    consentGiven: true,
    keepLogin: true,
    ...extra
  }
}

function session401() {
  return Object.assign(new Error('登录已过期'), {
    type: 'http',
    statusCode: 401,
    data: { code: 'SESSION_EXPIRED', message: '登录已过期' }
  })
}

test('auth: 缓存 profile 只读取白名单且绝不等于认证态', () => {
  const storage = makeStorage({
    [AUTH_STORAGE_KEYS.KEEP_LOGIN]: true,
    [AUTH_STORAGE_KEYS.CONSENT]: PRIVACY,
    [AUTH_STORAGE_KEYS.PROFILE]: {
      displayName: '缓存读者',
      privacyPolicyVersion: PRIVACY,
      openId: 'must-not-survive',
      readerName: 'reader-secret',
      sessionToken: 'must-not-survive'
    }
  })
  const session = createAuthSession(makeDeps({ storage }))
  assert.deepStrictEqual(session.getProfile(), {
    displayName: '缓存读者',
    privacyPolicyVersion: PRIVACY
  })
  assert.strictEqual(session.getState(), AUTH_STATES.ANONYMOUS)
  assert.strictEqual(session.isAuthenticated(), false)
  assert.strictEqual(session.getValidToken(), null)
  assert.strictEqual(session.preferredDisplayName('本机昵称'), '本机昵称')
  assert.deepStrictEqual(sanitizeProfile({ displayName: 'x', privacyPolicyVersion: PRIVACY }), null)
})

test('auth: 首次登录必须主动同意并填写昵称，成功后 token 只在内存', async () => {
  const deps = makeDeps()
  const session = createAuthSession(deps)
  await assert.rejects(
    session.login(command({ consentGiven: false })),
    (err) => err.data.code === 'PRIVACY_CONSENT_REQUIRED'
  )
  assert.strictEqual(deps.loginState.calls, 0)
  assert.strictEqual(deps.api.state.loginCalls, 0)
  assert.strictEqual(session.getState(), AUTH_STATES.CONSENT_REQUIRED)

  const result = await session.login(command())
  assert.strictEqual(result.state, AUTH_STATES.AUTHENTICATED)
  assert.strictEqual(session.isAuthenticated(), true)
  assert.strictEqual(session.getValidToken(), 'account-token-1')
  assert.strictEqual(session.preferredDisplayName('本机昵称'), '微信读者')
  assert.deepStrictEqual(deps.api.state.loginRequests[0], {
    payload: {
      code: 'wx-code-1',
      privacyConsentVersion: PRIVACY,
      displayName: '微信读者'
    },
    header: { 'X-WeApp-Client-Version': '0.4.0' }
  })
  assert.deepStrictEqual(deps.storage.map.get(AUTH_STORAGE_KEYS.PROFILE), {
    displayName: '微信读者',
    privacyPolicyVersion: PRIVACY
  })
  const stored = JSON.stringify(Object.fromEntries(deps.storage.map))
  assert.ok(!stored.includes('account-token'))
  assert.ok(!stored.includes('wx-code'))
  assert.ok(!stored.includes('openId'))
  assert.ok(!stored.includes('readerName'))
})

test('auth: 无保持登录意愿不静默恢复，恢复请求不携带昵称', async () => {
  const noIntent = makeDeps()
  const first = createAuthSession(noIntent)
  await first.restore()
  assert.strictEqual(noIntent.loginState.calls, 0)
  assert.strictEqual(noIntent.api.state.loginCalls, 0)

  const storage = makeStorage({
    [AUTH_STORAGE_KEYS.KEEP_LOGIN]: true,
    [AUTH_STORAGE_KEYS.CONSENT]: PRIVACY,
    [AUTH_STORAGE_KEYS.PROFILE]: { displayName: '缓存读者', privacyPolicyVersion: PRIVACY }
  })
  const deps = makeDeps({ storage })
  const session = createAuthSession(deps)
  await session.restore()
  assert.strictEqual(session.getState(), AUTH_STATES.AUTHENTICATED)
  assert.strictEqual(deps.loginState.calls, 1)
  assert.deepStrictEqual(deps.api.state.loginRequests[0].payload, {
    code: 'wx-code-1',
    privacyConsentVersion: PRIVACY
  })
  assert.ok(!Object.hasOwn(deps.api.state.loginRequests[0].payload, 'displayName'))
})

test('auth: 隐私版本变化暂停静默恢复且不调用 wx.login/API', async () => {
  const storage = makeStorage({
    [AUTH_STORAGE_KEYS.KEEP_LOGIN]: true,
    [AUTH_STORAGE_KEYS.CONSENT]: 'old-version',
    [AUTH_STORAGE_KEYS.PROFILE]: { displayName: '缓存读者', privacyPolicyVersion: 'old-version' }
  })
  const deps = makeDeps({ storage })
  const session = createAuthSession(deps)
  const restored = await session.restore()
  assert.strictEqual(restored.state, AUTH_STATES.CONSENT_REQUIRED)
  assert.strictEqual(restored.authenticated, false)
  assert.strictEqual(deps.loginState.calls, 0)
  assert.strictEqual(deps.api.state.loginCalls, 0)
})

test('auth: readerAccount 远程关闭后不登录且不调用微信接口', async () => {
  const storage = makeStorage({
    [AUTH_STORAGE_KEYS.KEEP_LOGIN]: true,
    [AUTH_STORAGE_KEYS.CONSENT]: PRIVACY,
    [AUTH_STORAGE_KEYS.PROFILE]: { displayName: '缓存读者', privacyPolicyVersion: PRIVACY }
  })
  const runtimeConfig = makeRuntime({
    config: {
      features: { readerAccount: { enabled: false } },
      privacyPolicyUrl: 'https://example.com/privacy',
      privacyPolicyVersion: PRIVACY
    }
  })
  const deps = makeDeps({ storage, runtimeConfig })
  const session = createAuthSession(deps)
  const restored = await session.restore()
  assert.strictEqual(restored.state, AUTH_STATES.ERROR)
  assert.strictEqual(restored.error.code, 'READER_ACCOUNT_DISABLED')
  assert.strictEqual(deps.loginState.calls, 0)
  assert.strictEqual(deps.api.state.loginCalls, 0)
  await assert.rejects(
    session.login(command()),
    (err) => err.data.code === 'READER_ACCOUNT_DISABLED'
  )
  assert.strictEqual(deps.loginState.calls, 0)
})

test('auth: 冷启动恢复失败只进入 error，不阻塞调用方且缓存不伪造认证', async () => {
  const storage = makeStorage({
    [AUTH_STORAGE_KEYS.KEEP_LOGIN]: true,
    [AUTH_STORAGE_KEYS.CONSENT]: PRIVACY,
    [AUTH_STORAGE_KEYS.PROFILE]: { displayName: '缓存读者', privacyPolicyVersion: PRIVACY }
  })
  const api = makeApi({ loginReader: async () => { throw Object.assign(new Error('offline'), { type: 'network' }) } })
  const deps = makeDeps({ storage, api })
  const session = createAuthSession(deps)
  const [a, b, c] = await Promise.all([session.restore(), session.restore(), session.restore()])
  assert.strictEqual(a.state, AUTH_STATES.ERROR)
  assert.strictEqual(b.authenticated, false)
  assert.strictEqual(c.profile.displayName, '缓存读者')
  assert.strictEqual(deps.loginState.calls, 1, '并发恢复必须单飞')
  assert.strictEqual(api.state.loginCalls, 1)
})

test('auth: 并发 401 只单飞重登一次并各自最多重试一次', async () => {
  const deps = makeDeps()
  const session = createAuthSession(deps)
  await session.login(command())
  const calls = [0, 0]
  const run = (index) => session.withAuthenticated((token) => {
    calls[index]++
    return token === 'account-token-1' ? Promise.reject(session401()) : Promise.resolve(token)
  })
  const [a, b] = await Promise.all([run(0), run(1)])
  assert.strictEqual(a, 'account-token-2')
  assert.strictEqual(b, 'account-token-2')
  assert.deepStrictEqual(calls, [2, 2])
  assert.strictEqual(deps.loginState.calls, 2, '首次登录 + 一次单飞重登')
  assert.strictEqual(deps.api.state.loginCalls, 2)
})

test('auth: 临近过期仅在使用时单飞刷新，不在后台主动延长', async () => {
  let now = 1000000
  const api = makeApi({
    loginReader: async (payload, header, call) => ({
      sessionToken: `short-token-${call}`,
      expiresIn: call === 1 ? 70 : 5400,
      profile: { displayName: payload.displayName || '微信读者', privacyPolicyVersion: PRIVACY }
    })
  })
  const deps = makeDeps({ api, now: () => now })
  const session = createAuthSession(deps)
  await session.login(command())
  assert.strictEqual(session.getValidToken(), 'short-token-1')
  now += 15000 // 只剩 55 秒，进入 60 秒安全余量
  assert.strictEqual(session.getValidToken(), null)
  assert.strictEqual(session.isAuthenticated(), true, '安全余量内仍未真正过期')
  assert.strictEqual(api.state.loginCalls, 1, '时间流逝本身不能触发后台刷新')
  const [a, b] = await Promise.all([
    session.withAuthenticated((token) => token),
    session.withAuthenticated((token) => token)
  ])
  assert.strictEqual(a, 'short-token-2')
  assert.strictEqual(b, 'short-token-2')
  assert.strictEqual(api.state.loginCalls, 2, '实际使用时并发刷新单飞')
  now += 6000000
  assert.strictEqual(session.getSnapshot().authenticated, false, '超过服务端 TTL 后不能继续宣称认证')
})

test('auth: 重试后仍 401 不会无限重登', async () => {
  const deps = makeDeps()
  const session = createAuthSession(deps)
  await session.login(command())
  let calls = 0
  await assert.rejects(
    session.withAuthenticated(() => {
      calls++
      return Promise.reject(session401())
    }),
    (err) => err.statusCode === 401
  )
  assert.strictEqual(calls, 2)
  assert.strictEqual(deps.api.state.loginCalls, 2)
  assert.strictEqual(session.getState(), AUTH_STATES.ERROR)
  assert.strictEqual(session.getValidToken(), null)
})

test('auth: 修改资料发送当前隐私版本与双 header，版本变化时 fail closed', async () => {
  const runtime = makeRuntime()
  const deps = makeDeps({ runtimeConfig: runtime })
  const session = createAuthSession(deps)
  await session.login(command())
  const updated = await session.updateProfile('新昵称')
  assert.strictEqual(updated.displayName, '新昵称')
  assert.deepStrictEqual(deps.api.state.updateRequests[0], {
    payload: { displayName: '新昵称', privacyConsentVersion: PRIVACY },
    header: {
      'X-WeApp-Client-Version': '0.4.0',
      'X-WeApp-Session': 'account-token-1'
    }
  })
  assert.deepStrictEqual(deps.storage.map.get(AUTH_STORAGE_KEYS.PROFILE), updated)

  runtime.ready = async () => ({
    features: { readerAccount: { enabled: true } },
    privacyPolicyUrl: 'https://example.com/privacy-v2',
    privacyPolicyVersion: 'v2'
  })
  await assert.rejects(
    session.updateProfile('再次修改'),
    (err) => err.data.code === 'PRIVACY_CONSENT_REQUIRED'
  )
  assert.strictEqual(deps.api.state.updateCalls, 1)
  assert.strictEqual(session.getState(), AUTH_STATES.CONSENT_REQUIRED)
})

test('auth: 匿名状态不能修改资料，异常隐私版本响应也不会污染缓存', async () => {
  const anonymousStorage = makeStorage({ [AUTH_STORAGE_KEYS.CONSENT]: PRIVACY })
  const anonymousDeps = makeDeps({ storage: anonymousStorage })
  const anonymousSession = createAuthSession(anonymousDeps)
  await assert.rejects(
    anonymousSession.updateProfile('新昵称'),
    (err) => err.data.code === 'SESSION_REQUIRED'
  )
  assert.strictEqual(anonymousSession.getState(), AUTH_STATES.ERROR)
  assert.strictEqual(anonymousSession.isAuthenticated(), false)
  assert.strictEqual(anonymousDeps.api.state.updateCalls, 0)

  const api = makeApi({
    updateReaderProfile: async (payload) => ({
      displayName: payload.displayName,
      privacyPolicyVersion: 'stale-version'
    })
  })
  const deps = makeDeps({ api })
  const session = createAuthSession(deps)
  await session.login(command())
  const profileBeforeUpdate = session.getProfile()
  await assert.rejects(session.updateProfile('新昵称'), /资料响应不合法/)
  assert.deepStrictEqual(session.getProfile(), profileBeforeUpdate)
  assert.deepStrictEqual(deps.storage.map.get(AUTH_STORAGE_KEYS.PROFILE), profileBeforeUpdate)
  assert.strictEqual(deps.storage.map.get(AUTH_STORAGE_KEYS.CONSENT), PRIVACY)
  assert.strictEqual(session.getState(), AUTH_STATES.AUTHENTICATED)
})

test('auth: 退出即使网络失败也清理 token、缓存资料和登录意愿', async () => {
  const api = makeApi({ logoutReader: async () => { throw Object.assign(new Error('offline'), { type: 'network' }) } })
  const deps = makeDeps({ api })
  const session = createAuthSession(deps)
  await session.login(command())
  await assert.rejects(session.logout(), /offline/)
  assert.strictEqual(session.getState(), AUTH_STATES.ANONYMOUS)
  assert.strictEqual(session.getValidToken(), null)
  assert.strictEqual(session.getProfile(), null)
  assert.strictEqual(deps.storage.map.has(AUTH_STORAGE_KEYS.KEEP_LOGIN), false)
  assert.strictEqual(deps.storage.map.has(AUTH_STORAGE_KEYS.PROFILE), false)
  // 隐私同意版本与评论链路共用，普通退出不撤销已作出的同意。
  assert.strictEqual(deps.storage.map.get(AUTH_STORAGE_KEYS.CONSENT), PRIVACY)
})

test('auth: 注销成功或账号已不存在时清理全部状态，其他失败保留账号供重试', async () => {
  let shouldFail = true
  const api = makeApi({
    deleteReaderAccount: async () => {
      if (shouldFail) throw Object.assign(new Error('server down'), { type: 'http', statusCode: 503 })
      return null
    }
  })
  const deps = makeDeps({ api })
  const session = createAuthSession(deps)
  await session.login(command())
  await assert.rejects(session.deleteAccount(), /server down/)
  assert.strictEqual(session.getState(), AUTH_STATES.AUTHENTICATED)
  assert.strictEqual(session.isAuthenticated(), true)

  shouldFail = false
  await session.deleteAccount()
  assert.strictEqual(session.getState(), AUTH_STATES.ANONYMOUS)
  assert.strictEqual(session.getProfile(), null)
  assert.strictEqual(deps.storage.map.size, 0)
  assert.strictEqual(api.state.deleteHeaders[1]['X-WeApp-Session'], 'account-token-1')

  const notFound = Object.assign(new Error('reader not found'), {
    type: 'http',
    statusCode: 404,
    data: { code: 'READER_NOT_FOUND', message: 'reader not found' }
  })
  const notFoundApi = makeApi({ deleteReaderAccount: async () => { throw notFound } })
  const notFoundDeps = makeDeps({ api: notFoundApi })
  const notFoundSession = createAuthSession(notFoundDeps)
  await notFoundSession.login(command())
  await notFoundSession.deleteAccount()
  assert.strictEqual(notFoundSession.getState(), AUTH_STATES.ANONYMOUS)
  assert.strictEqual(notFoundSession.getProfile(), null)
  assert.strictEqual(notFoundDeps.storage.map.size, 0)
})
