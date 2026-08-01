const { test } = require('node:test')
const assert = require('node:assert')

const {
  validateRemoteConfig,
  createRuntimeConfig,
  DEFAULT_CONFIG,
  CACHE_KEY
} = require('../utils/runtime-config')

// ===== validateRemoteConfig =====

test('validate: 白名单字段逐项校验', () => {
  const out = validateRemoteConfig({
    commentEnabled: true,
    minVersion: '1.0.0',
    schemaVersion: 1,
    announcement: { enabled: true, content: 'hi', extra: 'drop' },
    hacker: 'drop',
    nested: { evil: 'drop' }
  })
  assert.deepStrictEqual(out, {
    commentEnabled: true,
    minVersion: '1.0.0',
    schemaVersion: 1,
    announcement: { enabled: true, content: 'hi' }
  })
})

test('validate: 非对象/数组/全非法字段返回 null', () => {
  assert.strictEqual(validateRemoteConfig(null), null)
  assert.strictEqual(validateRemoteConfig('<html>login</html>'), null)
  assert.strictEqual(validateRemoteConfig([1, 2]), null)
  assert.strictEqual(validateRemoteConfig({ unknown: 1 }), null)
  assert.strictEqual(validateRemoteConfig({ commentEnabled: 'yes' }), null)
})

// ===== createRuntimeConfig =====

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    get: (k) => map.get(k),
    set: (k, v) => map.set(k, v),
    map
  }
}

const ENABLED_RC = {
  enabled: true,
  pluginName: 'plugin-halo-weapp',
  endpoint: '/apis/api.weapp.halo.run/v1alpha1/config',
  cacheTtl: 21600000
}

test('runtime: 未启用时不发起任何请求，返回默认值', async () => {
  let calls = 0
  const rc = createRuntimeConfig({
    get: () => {
      calls++
      return Promise.resolve({})
    },
    storage: makeStorage(),
    now: () => 1000,
    remoteConfig: { enabled: false, pluginName: '', endpoint: '' }
  })
  const cfg = await rc.ready()
  assert.strictEqual(calls, 0)
  assert.strictEqual(cfg.commentEnabled, false)
})

test('runtime: 缺少 pluginName/endpoint 时不发请求', async () => {
  let calls = 0
  const rc = createRuntimeConfig({
    get: () => {
      calls++
      return Promise.resolve({ commentEnabled: true })
    },
    storage: makeStorage(),
    now: () => 1000,
    remoteConfig: { enabled: true, pluginName: '', endpoint: '/apis/x' }
  })
  const cfg = await rc.ready()
  assert.strictEqual(calls, 0)
  assert.strictEqual(cfg.commentEnabled, false)
})

test('runtime: 合法配置生效并写入缓存', async () => {
  const storage = makeStorage()
  const rc = createRuntimeConfig({
    get: (path) => {
      if (path.includes('/available')) return Promise.resolve({ available: true })
      return Promise.resolve({ commentEnabled: true, unknown: 'x' })
    },
    storage,
    now: () => 5000,
    remoteConfig: ENABLED_RC
  })
  const cfg = await rc.ready()
  assert.strictEqual(cfg.commentEnabled, true)
  const cached = storage.map.get(CACHE_KEY)
  assert.ok(cached, '应写入缓存')
  assert.strictEqual(cached.fetchedAt, 5000)
  assert.deepStrictEqual(cached.data, { commentEnabled: true })
})

test('runtime: 插件不可用时保持默认且不写缓存', async () => {
  const storage = makeStorage()
  const rc = createRuntimeConfig({
    get: () => Promise.reject(Object.assign(new Error('nf'), { type: 'http', statusCode: 404 })),
    storage,
    now: () => 1000,
    remoteConfig: ENABLED_RC
  })
  const cfg = await rc.ready()
  assert.strictEqual(cfg.commentEnabled, false)
  assert.strictEqual(storage.map.has(CACHE_KEY), false)
})

test('runtime: 返回 HTML/非法字段时保持默认且不写缓存', async () => {
  for (const bad of ['<html>login</html>', { commentEnabled: 'yes' }, null, ['x']]) {
    const storage = makeStorage()
    const rc = createRuntimeConfig({
      get: (path) => {
        if (path.includes('/available')) return Promise.resolve({})
        return Promise.resolve(bad)
      },
      storage,
      now: () => 1000,
      remoteConfig: ENABLED_RC
    })
    const cfg = await rc.ready()
    assert.strictEqual(cfg.commentEnabled, false, `bad=${JSON.stringify(bad)}`)
    assert.strictEqual(storage.map.has(CACHE_KEY), false)
  }
})

test('runtime: 拉取失败时未过期缓存可降级', async () => {
  const storage = makeStorage({
    [CACHE_KEY]: { data: { commentEnabled: true }, fetchedAt: 900, schemaVersion: 1 }
  })
  const rc = createRuntimeConfig({
    get: () => Promise.reject(new Error('network')),
    storage,
    now: () => 1000,
    remoteConfig: ENABLED_RC
  })
  const cfg = await rc.ready()
  assert.strictEqual(cfg.commentEnabled, true)
})

test('runtime: 过期缓存不降级，回退默认值', async () => {
  const storage = makeStorage({
    [CACHE_KEY]: { data: { commentEnabled: true }, fetchedAt: 0, schemaVersion: 1 }
  })
  const rc = createRuntimeConfig({
    get: () => Promise.reject(new Error('network')),
    storage,
    now: () => 21600000 + 1,
    remoteConfig: ENABLED_RC
  })
  const cfg = await rc.ready()
  assert.strictEqual(cfg.commentEnabled, false)
})

test('runtime: schema 版本不符的缓存被忽略', async () => {
  const storage = makeStorage({
    [CACHE_KEY]: { data: { commentEnabled: true }, fetchedAt: 900, schemaVersion: 999 }
  })
  const rc = createRuntimeConfig({
    get: () => Promise.reject(new Error('network')),
    storage,
    now: () => 1000,
    remoteConfig: ENABLED_RC
  })
  const cfg = await rc.ready()
  assert.strictEqual(cfg.commentEnabled, false)
})

test('runtime: 本地默认值可被 config.commentEnabled 覆盖', async () => {
  const rc = createRuntimeConfig({
    get: () => Promise.reject(new Error('should not be called')),
    storage: makeStorage(),
    now: () => 1000,
    remoteConfig: { enabled: false },
    defaults: { commentEnabled: true }
  })
  const cfg = await rc.ready()
  assert.strictEqual(cfg.commentEnabled, true)
  assert.deepStrictEqual(DEFAULT_CONFIG, { commentEnabled: false })
})
