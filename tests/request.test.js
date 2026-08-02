const { test, beforeEach } = require('node:test')
const assert = require('node:assert')

const { serialize, RequestError, get, post, patch, del } = require('../utils/request')
const config = require('../config/index')

// ===== serialize =====

test('serialize: 数组按 repeat 方式序列化', () => {
  assert.strictEqual(
    serialize({ sort: ['spec.pinned,desc', 'spec.publishTime,desc'] }),
    '?sort=spec.pinned%2Cdesc&sort=spec.publishTime%2Cdesc'
  )
})

test('serialize: 布尔值、0 正常保留，空值跳过', () => {
  assert.strictEqual(
    serialize({ page: 1, flag: false, zero: 0, empty: '', nil: null, undef: undefined }),
    '?page=1&flag=false&zero=0'
  )
})

test('serialize: 中文与特殊字符编码', () => {
  const out = serialize({ keyword: '中文 词', symbol: 'a&b=c' })
  assert.strictEqual(out, `?keyword=${encodeURIComponent('中文 词')}&symbol=${encodeURIComponent('a&b=c')}`)
})

test('serialize: 空参数返回空字符串', () => {
  assert.strictEqual(serialize(null), '')
  assert.strictEqual(serialize({}), '')
  assert.strictEqual(serialize({ a: '', b: null }), '')
})

// ===== request（mock wx） =====

function mockWx(behavior) {
  global.wx = {
    request: (opts) => behavior(opts)
  }
}

beforeEach(() => {
  delete global.wx
})

test('request: 2xx JSON 正常解析', async () => {
  mockWx(({ success }) => success({ statusCode: 200, data: { a: 1 } }))
  const data = await get('/apis/test')
  assert.deepStrictEqual(data, { a: 1 })
})

test('request: URL 拼接 baseUrl 与 query', async () => {
  let captured
  mockWx((opts) => {
    captured = opts.url
    opts.success({ statusCode: 200, data: {} })
  })
  await get('/apis/x', { page: 1, sort: ['a,desc', 'b,desc'] })
  assert.strictEqual(
    captured,
    `${config.baseUrl}/apis/x?page=1&sort=a%2Cdesc&sort=b%2Cdesc`
  )
})

test('request: 非 2xx 抛出 http 类型错误', async () => {
  mockWx(({ success }) => success({ statusCode: 404, data: {} }))
  await assert.rejects(get('/apis/x'), (err) => {
    assert.ok(err instanceof RequestError)
    assert.strictEqual(err.type, 'http')
    assert.strictEqual(err.statusCode, 404)
    assert.strictEqual(err.path, '/apis/x')
    return true
  })
})

test('request: 网络失败与超时区分', async () => {
  mockWx(({ fail }) => fail({ errMsg: 'request:fail timeout' }))
  await assert.rejects(get('/apis/x'), (err) => err.type === 'timeout')

  mockWx(({ fail }) => fail({ errMsg: 'request:fail url not in domain list' }))
  await assert.rejects(get('/apis/x'), (err) => err.type === 'network')
})

test('request: HTML 响应按 parse 错误处理（不返回给调用方）', async () => {
  mockWx(({ success }) =>
    success({ statusCode: 200, data: '<html><body>login</body></html>' })
  )
  await assert.rejects(get('/apis/x'), (err) => err.type === 'parse')
})

test('request: 字符串 JSON 自动解析', async () => {
  mockWx(({ success }) => success({ statusCode: 200, data: '{"ok":true}' }))
  const data = await get('/apis/x')
  assert.deepStrictEqual(data, { ok: true })
})

test('request: tracker 空 body 正常放行', async () => {
  mockWx(({ success }) => success({ statusCode: 200, data: '' }))
  const data = await post('/apis/trackers/upvote', { name: 'x' })
  assert.strictEqual(data, null)
})

test('request: PATCH/DELETE 保留方法、请求体和 header，204 空响应正常', async () => {
  const seen = []
  mockWx((opts) => {
    seen.push(opts)
    opts.success({ statusCode: opts.method === 'DELETE' ? 204 : 200, data: '' })
  })
  await patch('/apis/auth/profile', { displayName: '新昵称' }, {
    header: { 'X-WeApp-Session': 'memory-token' }
  })
  await del('/apis/auth/session', { header: { 'X-WeApp-Session': 'memory-token' } })
  assert.strictEqual(seen[0].method, 'PATCH')
  assert.deepStrictEqual(seen[0].data, { displayName: '新昵称' })
  assert.strictEqual(seen[0].header['X-WeApp-Session'], 'memory-token')
  assert.strictEqual(seen[1].method, 'DELETE')
  assert.strictEqual(seen[1].data, undefined)
  assert.strictEqual(seen[1].header['X-WeApp-Session'], 'memory-token')
})

test('request: 非 2xx 携带解析后的 JSON 错误体（插件业务码）', async () => {
  mockWx(({ success }) =>
    success({
      statusCode: 429,
      data: { code: 'RATE_LIMITED', message: '操作过于频繁', requestId: 'req_x', retryAfter: 30 }
    })
  )
  await assert.rejects(post('/apis/x', {}), (err) => {
    assert.strictEqual(err.type, 'http')
    assert.strictEqual(err.statusCode, 429)
    assert.strictEqual(err.data.code, 'RATE_LIMITED')
    assert.strictEqual(err.data.retryAfter, 30)
    return true
  })
})

test('request: 非 2xx 且错误体非 JSON 时 data 为 null', async () => {
  mockWx(({ success }) => success({ statusCode: 502, data: '<html>bad gateway</html>' }))
  await assert.rejects(get('/apis/x'), (err) => {
    assert.strictEqual(err.type, 'http')
    assert.strictEqual(err.data, null)
    return true
  })
})
