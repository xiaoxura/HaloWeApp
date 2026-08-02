const { test } = require('node:test')
const assert = require('node:assert')

const { createCommentSession, isSessionError } = require('../utils/comment-session')

function makeDeps(overrides = {}) {
  const state = { loginCalls: 0, sessionCalls: 0 }
  return {
    state,
    login: () => {
      state.loginCalls++
      return Promise.resolve(`code-${state.loginCalls}`)
    },
    createSession: (code) => {
      state.sessionCalls++
      return Promise.resolve({ sessionToken: `token-for-${code}`, expiresIn: 5400 })
    },
    ...overrides
  }
}

function session401(code = 'SESSION_EXPIRED') {
  return Object.assign(new Error('请求失败（401）'), {
    type: 'http',
    statusCode: 401,
    data: { code, message: '登录已过期', requestId: 'req_x' }
  })
}

test('session: 首次 ensure 登录并缓存 token，有效期内复用', async () => {
  const deps = makeDeps()
  const cs = createCommentSession(deps)
  const t1 = await cs.ensure()
  const t2 = await cs.ensure()
  assert.strictEqual(t1, 'token-for-code-1')
  assert.strictEqual(t2, t1)
  assert.strictEqual(deps.state.loginCalls, 1)
  assert.strictEqual(deps.state.sessionCalls, 1)
})

test('session: 并发 ensure 单飞，只登录一次', async () => {
  const deps = makeDeps()
  const cs = createCommentSession(deps)
  const [a, b, c] = await Promise.all([cs.ensure(), cs.ensure(), cs.ensure()])
  assert.strictEqual(a, b)
  assert.strictEqual(b, c)
  assert.strictEqual(deps.state.loginCalls, 1)
})

test('session: withSession 401 时重新登录并最多重试一次', async () => {
  const deps = makeDeps()
  const cs = createCommentSession(deps)
  const seen = []
  let calls = 0
  const result = await cs.withSession((token) => {
    calls++
    seen.push(token)
    if (calls === 1) return Promise.reject(session401())
    return Promise.resolve('ok')
  })
  assert.strictEqual(result, 'ok')
  assert.strictEqual(calls, 2)
  assert.strictEqual(deps.state.loginCalls, 2)
  assert.notStrictEqual(seen[0], seen[1])
})

test('session: 重试后仍 401 则抛出，不再重试', async () => {
  const deps = makeDeps()
  const cs = createCommentSession(deps)
  let calls = 0
  await assert.rejects(
    cs.withSession(() => {
      calls++
      return Promise.reject(session401())
    }),
    (err) => err.statusCode === 401
  )
  assert.strictEqual(calls, 2)
  assert.strictEqual(deps.state.loginCalls, 2)
})

test('session: SESSION_REQUIRED 同样触发重登', async () => {
  const deps = makeDeps()
  const cs = createCommentSession(deps)
  let calls = 0
  await cs.withSession(() => {
    calls++
    return calls === 1 ? Promise.reject(session401('SESSION_REQUIRED')) : Promise.resolve('ok')
  })
  assert.strictEqual(calls, 2)
})

test('session: 非会话错误不重试（429/422/网络错误原样抛出）', async () => {
  const deps = makeDeps()
  const cs = createCommentSession(deps)
  for (const err of [
    Object.assign(new Error('x'), { type: 'http', statusCode: 429, data: { code: 'RATE_LIMITED' } }),
    Object.assign(new Error('x'), { type: 'http', statusCode: 422, data: { code: 'CONTENT_RISKY' } }),
    Object.assign(new Error('x'), { type: 'network' }),
    Object.assign(new Error('x'), { type: 'http', statusCode: 401, data: { code: 'OTHER' } })
  ]) {
    let calls = 0
    await assert.rejects(cs.withSession(() => {
      calls++
      return Promise.reject(err)
    }))
    assert.strictEqual(calls, 1, `err=${err.data && err.data.code}`)
  }
  assert.strictEqual(deps.state.loginCalls, 1)
})

test('session: 临近过期（60 秒余量）时重新登录', async () => {
  let now = 1000000
  const deps = makeDeps({
    now: () => now,
    createSession: () => Promise.resolve({ sessionToken: 'short', expiresIn: 30 })
  })
  const cs = createCommentSession(deps)
  await cs.ensure()
  assert.strictEqual(cs.isValid(), false) // 30 秒有效期 < 60 秒余量
  await cs.ensure()
  assert.strictEqual(deps.state.loginCalls, 2)
})

test('session: 会话响应非法时报 parse 错误', async () => {
  const deps = makeDeps({ createSession: () => Promise.resolve({}) })
  const cs = createCommentSession(deps)
  await assert.rejects(cs.ensure(), (err) => err.type === 'parse')
})

test('session: clear 后重新登录', async () => {
  const deps = makeDeps()
  const cs = createCommentSession(deps)
  await cs.ensure()
  cs.clear()
  await cs.ensure()
  assert.strictEqual(deps.state.loginCalls, 2)
})

test('session: isSessionError 判定', () => {
  assert.strictEqual(isSessionError(session401()), true)
  assert.strictEqual(isSessionError(session401('SESSION_REQUIRED')), true)
  assert.strictEqual(isSessionError(null), false)
  assert.strictEqual(isSessionError(new Error('x')), false)
  assert.strictEqual(
    isSessionError(Object.assign(new Error('x'), { type: 'http', statusCode: 403, data: { code: 'SESSION_EXPIRED' } })),
    false
  )
})

test('session: 有效账号会话优先复用，不申请临时 token', async () => {
  const account = {
    calls: 0,
    getState: () => 'authenticated',
    withAuthenticated(fn) {
      this.calls++
      return fn('account-token')
    }
  }
  const deps = makeDeps({ accountSession: account })
  const cs = createCommentSession(deps)
  assert.strictEqual(await cs.ensure(), 'account-token')
  assert.strictEqual(await cs.withSession((token) => Promise.resolve(`used:${token}`)), 'used:account-token')
  assert.strictEqual(account.calls, 2)
  assert.strictEqual(deps.state.loginCalls, 0)
  assert.strictEqual(deps.state.sessionCalls, 0)
})

test('session: 账号恢复失败回落临时会话，评论不会永久 loading', async () => {
  const recoveryError = Object.assign(new Error('account restore failed'), {
    authRecovery: true,
    type: 'network'
  })
  const account = {
    getState: () => 'authenticated',
    withAuthenticated: () => Promise.reject(recoveryError)
  }
  const deps = makeDeps({ accountSession: account })
  const cs = createCommentSession(deps)
  const result = await cs.withSession((token) => Promise.resolve(`used:${token}`))
  assert.strictEqual(result, 'used:token-for-code-1')
  assert.strictEqual(deps.state.loginCalls, 1)
  assert.strictEqual(deps.state.sessionCalls, 1)
})

test('session: 评论业务错误不因账号会话而回落重提', async () => {
  const contentError = Object.assign(new Error('risky'), {
    type: 'http',
    statusCode: 422,
    data: { code: 'CONTENT_RISKY' }
  })
  const account = {
    getState: () => 'authenticated',
    withAuthenticated: (fn) => fn('account-token')
  }
  const deps = makeDeps({ accountSession: account })
  const cs = createCommentSession(deps)
  let submitCalls = 0
  await assert.rejects(cs.withSession(() => {
    submitCalls++
    return Promise.reject(contentError)
  }), (err) => err === contentError)
  assert.strictEqual(submitCalls, 1)
  assert.strictEqual(deps.state.loginCalls, 0)
})
