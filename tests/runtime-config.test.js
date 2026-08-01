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
  assert.deepStrictEqual(DEFAULT_CONFIG.commentEnabled, false)
  assert.deepStrictEqual(DEFAULT_CONFIG.commentOptions.submitEnabled, false)
})

// ===== v0.3.0：写能力与读取分离（C-04） =====

const FULL_CONFIG = {
  schemaVersion: 1,
  generatedAt: '2026-08-01T08:00:00Z',
  commentEnabled: true,
  commentOptions: { submitEnabled: true, replyEnabled: true, maxLength: 500, nicknameRequired: true },
  announcement: { enabled: true, version: '2026-08-01', content: 'hi' },
  minVersion: '0.3.0',
  privacyPolicyUrl: 'https://example.com/privacy',
  privacyPolicyVersion: '2026-08-01'
}

function createWithRemote(remote, extra = {}) {
  const storage = makeStorage(extra.cached ? { [CACHE_KEY]: extra.cached } : {})
  return createRuntimeConfig({
    get: (path) => {
      if (path.includes('/available')) return Promise.resolve({ available: true })
      if (remote instanceof Error) return Promise.reject(remote)
      return Promise.resolve(remote)
    },
    storage,
    now: () => 1000,
    remoteConfig: ENABLED_RC,
    clientVersion: extra.clientVersion || '0.3.0',
    defaults: extra.defaults || {}
  })
}

test('validate: v0.3.0 全字段白名单校验，未知字段被剔除', () => {
  const out = validateRemoteConfig({ ...FULL_CONFIG, appSecret: 'leak', openId: 'leak' })
  assert.deepStrictEqual(out, FULL_CONFIG)
})

test('validate: commentOptions 部分字段与非法 maxLength', () => {
  const out = validateRemoteConfig({ commentOptions: { submitEnabled: true, maxLength: -1 } })
  assert.deepStrictEqual(out, { commentOptions: { submitEnabled: true } })
})

test('runtime: 实时拉取成功且开关全开时允许写入', async () => {
  const rc = createWithRemote(FULL_CONFIG)
  await rc.ready()
  assert.strictEqual(rc.isLive(), true)
  assert.strictEqual(rc.canSubmit(), true)
  assert.strictEqual(rc.canReply(), true)
  assert.strictEqual(rc.getConfig().commentOptions.maxLength, 500)
  assert.strictEqual(rc.getConfig().privacyPolicyVersion, '2026-08-01')
})

test('runtime: 本地 config.commentEnabled 只能开启读取，不能开启写入', async () => {
  const rc = createRuntimeConfig({
    get: () => Promise.reject(new Error('should not be called')),
    storage: makeStorage(),
    now: () => 1000,
    remoteConfig: { enabled: false },
    defaults: { commentEnabled: true }
  })
  await rc.ready()
  assert.strictEqual(rc.getConfig().commentEnabled, true)
  assert.strictEqual(rc.canSubmit(), false)
  assert.strictEqual(rc.canReply(), false)
})

test('runtime: 降级缓存只读，强制关闭写入口', async () => {
  const rc = createWithRemote(new Error('network'), {
    cached: { data: FULL_CONFIG, fetchedAt: 900, schemaVersion: 1 }
  })
  await rc.ready()
  // 缓存可展示评论与公告
  assert.strictEqual(rc.getConfig().commentEnabled, true)
  assert.strictEqual(rc.getConfig().announcement.enabled, true)
  // 但写能力必须关闭
  assert.strictEqual(rc.isLive(), false)
  assert.strictEqual(rc.canSubmit(), false)
  assert.strictEqual(rc.canReply(), false)
})

test('runtime: submitEnabled 关闭时评论可读不可写', async () => {
  const rc = createWithRemote({ ...FULL_CONFIG, commentOptions: { ...FULL_CONFIG.commentOptions, submitEnabled: false } })
  await rc.ready()
  assert.strictEqual(rc.getConfig().commentEnabled, true)
  assert.strictEqual(rc.canSubmit(), false)
})

test('runtime: replyEnabled 单独控制回复', async () => {
  const rc = createWithRemote({ ...FULL_CONFIG, commentOptions: { ...FULL_CONFIG.commentOptions, replyEnabled: false } })
  await rc.ready()
  assert.strictEqual(rc.canSubmit(), true)
  assert.strictEqual(rc.canReply(), false)
})

test('runtime: schema 版本高于支持范围时保持只读且不写缓存', async () => {
  const storage = makeStorage()
  const rc = createRuntimeConfig({
    get: (path) => {
      if (path.includes('/available')) return Promise.resolve({})
      return Promise.resolve({ ...FULL_CONFIG, schemaVersion: 99 })
    },
    storage,
    now: () => 1000,
    remoteConfig: ENABLED_RC,
    clientVersion: '0.3.0'
  })
  await rc.ready()
  assert.strictEqual(rc.isLive(), false)
  assert.strictEqual(rc.canSubmit(), false)
  assert.strictEqual(storage.map.has(CACHE_KEY), false)
})

test('runtime: 高于支持范围的缓存 schema 同样被忽略', async () => {
  const rc = createWithRemote(new Error('network'), {
    cached: { data: { ...FULL_CONFIG, schemaVersion: 99 }, fetchedAt: 900, schemaVersion: 1 }
  })
  await rc.ready()
  assert.strictEqual(rc.getConfig().commentEnabled, false)
  assert.strictEqual(rc.canSubmit(), false)
})

test('runtime: minVersion 高于客户端版本时关闭写能力', async () => {
  const rc = createWithRemote({ ...FULL_CONFIG, minVersion: '0.4.0' }, { clientVersion: '0.3.0' })
  await rc.ready()
  assert.strictEqual(rc.isVersionOk(), false)
  assert.strictEqual(rc.canSubmit(), false)
  // 读取不受影响
  assert.strictEqual(rc.getConfig().commentEnabled, true)
})

test('runtime: minVersion 非法时忽略，不影响写能力', async () => {
  const rc = createWithRemote({ ...FULL_CONFIG, minVersion: 'not-a-version' })
  await rc.ready()
  assert.strictEqual(rc.isVersionOk(), true)
  assert.strictEqual(rc.canSubmit(), true)
})

test('runtime: 预发布版本比较（0.3.0-rc.1 < 0.3.0）', async () => {
  const rc = createWithRemote(FULL_CONFIG, { clientVersion: '0.3.0-rc.1' })
  await rc.ready()
  assert.strictEqual(rc.isVersionOk(), false)
  assert.strictEqual(rc.canSubmit(), false)
})

test('runtime: 插件配置夹具可完整转换并开放写能力', async () => {
  const fixture = JSON.parse(
    require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures', 'plugin-config.json'), 'utf8')
  )
  const rc = createWithRemote(fixture)
  await rc.ready()
  assert.strictEqual(rc.isLive(), true)
  assert.strictEqual(rc.canSubmit(), true)
  assert.strictEqual(rc.canReply(), true)
  const cfg = rc.getConfig()
  assert.strictEqual(cfg.announcement.version, '2026-08-01')
  assert.strictEqual(cfg.privacyPolicyVersion, '2026-08-01')
})
