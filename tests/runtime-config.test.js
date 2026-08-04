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
    site: {
      blogName: '技术博客',
      blogDesc: 'Halo 驱动',
      pageSize: 20,
      fontUrl: 'https://cdn.example.com/font.woff2',
      adminToken: 'drop'
    },
    commentEnabled: true,
    minVersion: '1.0.0',
    schemaVersion: 1,
    announcement: { enabled: true, content: 'hi', extra: 'drop' },
    hacker: 'drop',
    nested: { evil: 'drop' }
  })
  assert.deepStrictEqual(out, {
    site: {
      blogName: '技术博客',
      blogDesc: 'Halo 驱动',
      pageSize: 20,
      fontUrl: 'https://cdn.example.com/font.woff2'
    },
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

const TEST_SOURCE = {
  pluginName: 'plugin-halo-weapp',
  endpoint: '/apis/api.weapp.halo.run/v1alpha1/config',
  cacheTtl: 21600000
}

test('runtime: 配置源不完整时不发起任何请求，返回安全默认值', async () => {
  let calls = 0
  const rc = createRuntimeConfig({
    get: () => {
      calls++
      return Promise.resolve({})
    },
    storage: makeStorage(),
    now: () => 1000,
    source: { pluginName: '', endpoint: '' }
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
    source: { pluginName: '', endpoint: '/apis/x' }
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
    source: TEST_SOURCE
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
  let configCalls = 0
  const rc = createRuntimeConfig({
    get: (path) => {
      if (path.includes('/available')) return Promise.resolve({ available: false })
      configCalls++
      return Promise.resolve({ commentEnabled: true })
    },
    storage,
    now: () => 1000,
    source: TEST_SOURCE
  })
  const cfg = await rc.ready()
  assert.strictEqual(cfg.commentEnabled, false)
  assert.strictEqual(configCalls, 0, '插件明确不可用时不应拉取配置')
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
      source: TEST_SOURCE
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
    source: TEST_SOURCE
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
    source: TEST_SOURCE
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
    source: TEST_SOURCE
  })
  const cfg = await rc.ready()
  assert.strictEqual(cfg.commentEnabled, false)
})

test('runtime: ready 前可同步读取未过期站点缓存，但读取与写能力保持关闭', async () => {
  const cached = {
    data: {
      site: { blogName: '缓存博客', pageSize: 20 },
      features: {
        moments: { enabled: true, commentEnabled: true },
        readerAccount: { enabled: true }
      },
      commentEnabled: true,
      commentOptions: { submitEnabled: true, replyEnabled: true }
    },
    fetchedAt: 900,
    schemaVersion: 1
  }
  const rc = createRuntimeConfig({
    get: () => Promise.reject(new Error('not started')),
    storage: makeStorage({ [CACHE_KEY]: cached }),
    now: () => 1000,
    source: TEST_SOURCE
  })
  assert.strictEqual(rc.getConfig().site.blogName, '缓存博客')
  assert.strictEqual(rc.getConfig().site.blogDesc, DEFAULT_CONFIG.site.blogDesc)
  assert.strictEqual(rc.getConfig().commentEnabled, true)
  assert.strictEqual(rc.canReadMoments(), false, '缓存不能提前开启 Moment 展示入口')
  assert.strictEqual(rc.canLogin(), false, '缓存不能恢复或创建读者账号')
  assert.strictEqual(rc.canSubmitMomentComment(), false, '缓存不能开启 Moment 写入')
  assert.strictEqual(rc.isLive(), false)
  assert.strictEqual(rc.canSubmit(), false)
  await rc.ready()
  assert.strictEqual(rc.canReadMoments(), false, '实时配置失败后仍保持 fail-closed')
  assert.deepStrictEqual(DEFAULT_CONFIG.commentEnabled, false)
  assert.deepStrictEqual(DEFAULT_CONFIG.commentOptions.submitEnabled, false)
  assert.deepStrictEqual(DEFAULT_CONFIG.features.moments.enabled, false)
  assert.deepStrictEqual(DEFAULT_CONFIG.features.readerAccount.enabled, false)
})

// ===== v0.3.0：写能力与读取分离（C-04） =====

const FULL_CONFIG = {
  schemaVersion: 1,
  generatedAt: '2026-08-01T08:00:00Z',
  site: {
    blogName: '技术博客',
    blogDesc: 'Halo 驱动',
    pageSize: 20,
    fontUrl: 'https://cdn.example.com/font.woff2'
  },
  features: {
    moments: { enabled: true, commentEnabled: false },
    readerAccount: { enabled: true }
  },
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
    source: TEST_SOURCE,
    clientVersion: extra.clientVersion || '0.3.0'
  })
}

test('validate: v0.3.0 全字段白名单校验，未知字段被剔除', () => {
  const out = validateRemoteConfig({ ...FULL_CONFIG, appSecret: 'leak', openId: 'leak' })
  assert.deepStrictEqual(out, FULL_CONFIG)
})

test('validate: commentOptions 部分字段与非法 maxLength', () => {
  const out = validateRemoteConfig({ commentOptions: { submitEnabled: true, maxLength: 501 } })
  assert.deepStrictEqual(out, { commentOptions: { submitEnabled: true } })
  assert.deepStrictEqual(
    validateRemoteConfig({ commentOptions: { maxLength: 0.5, replyEnabled: true } }),
    { commentOptions: { replyEnabled: true } }
  )
})

test('validate: site 非法字段被剔除，不能下发客户端凭据', () => {
  const out = validateRemoteConfig({
    site: {
      blogName: '',
      blogDesc: 'ok',
      pageSize: 0,
      fontUrl: 'http://unsafe.example/font.woff2',
      adminToken: 'pat_leak'
    }
  })
  assert.deepStrictEqual(out, { site: { blogDesc: 'ok' } })
})

test('validate: features 仅接受固定嵌套布尔字段', () => {
  assert.deepStrictEqual(
    validateRemoteConfig({
      features: {
        moments: { enabled: true, commentEnabled: false, endpoint: '/evil' },
        readerAccount: { enabled: true, identityKey: 'leak' },
        arbitraryPlugin: { enabled: true }
      }
    }),
    {
      features: {
        moments: { enabled: true, commentEnabled: false },
        readerAccount: { enabled: true }
      }
    }
  )
  assert.strictEqual(
    validateRemoteConfig({ features: { moments: { enabled: 'yes' } } }),
    null
  )
})

test('runtime: 实时拉取成功且开关全开时允许写入', async () => {
  const rc = createWithRemote(FULL_CONFIG)
  await rc.ready()
  assert.strictEqual(rc.isLive(), true)
  assert.strictEqual(rc.canSubmit(), true)
  assert.strictEqual(rc.canReply(), true)
  assert.strictEqual(rc.canReadMoments(), true)
  assert.strictEqual(rc.canLogin(), true)
  assert.strictEqual(rc.canSubmitMomentComment(), false)
  assert.strictEqual(rc.getConfig().commentOptions.maxLength, 500)
  assert.strictEqual(rc.getConfig().privacyPolicyVersion, '2026-08-01')
})

test('runtime: 内置默认配置不能开启评论读取或写入', async () => {
  const rc = createRuntimeConfig({
    get: () => Promise.reject(new Error('should not be called')),
    storage: makeStorage(),
    now: () => 1000,
    source: { pluginName: '', endpoint: '' }
  })
  await rc.ready()
  assert.strictEqual(rc.getConfig().commentEnabled, false)
  assert.strictEqual(rc.canSubmit(), false)
  assert.strictEqual(rc.canReply(), false)
  assert.strictEqual(rc.canReadMoments(), false)
  assert.strictEqual(rc.canLogin(), false)
  assert.strictEqual(rc.canSubmitMomentComment(), false)
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
  assert.strictEqual(rc.canLogin(), false)
  assert.strictEqual(rc.canSubmitMomentComment(), false)
})

test('runtime: Moment 评论预留门禁要求实时配置与全部相关开关', async () => {
  const rc = createWithRemote({
    ...FULL_CONFIG,
    features: {
      ...FULL_CONFIG.features,
      moments: { enabled: true, commentEnabled: true }
    }
  })
  await rc.ready()
  assert.strictEqual(rc.canSubmitMomentComment(), true)
})

test('runtime: readerAccount 必须实时开启且隐私契约完整', async () => {
  for (const remote of [
    { ...FULL_CONFIG, features: { ...FULL_CONFIG.features, readerAccount: { enabled: false } } },
    { ...FULL_CONFIG, privacyPolicyVersion: '' },
    { ...FULL_CONFIG, privacyPolicyUrl: 'http://unsafe.example/privacy' }
  ]) {
    const rc = createWithRemote(remote)
    await rc.ready()
    assert.strictEqual(rc.canLogin(), false)
    assert.strictEqual(rc.canReadMoments(), true, '身份门禁不得影响 Moment 阅读')
  }
})

test('runtime: submitEnabled 关闭时评论可读不可写', async () => {
  const rc = createWithRemote({ ...FULL_CONFIG, commentOptions: { ...FULL_CONFIG.commentOptions, submitEnabled: false } })
  await rc.ready()
  assert.strictEqual(rc.getConfig().commentEnabled, true)
  assert.strictEqual(rc.canSubmit(), false)
  assert.strictEqual(rc.canLogin(), true, '文章评论开关不得影响读者身份登录')
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
    source: TEST_SOURCE,
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
  assert.strictEqual(rc.canLogin(), false)
  // 读取不受影响
  assert.strictEqual(rc.getConfig().commentEnabled, true)
  assert.strictEqual(rc.canReadMoments(), true)
})

test('runtime: minVersion 非法时关闭写能力', async () => {
  const rc = createWithRemote({ ...FULL_CONFIG, minVersion: 'not-a-version' })
  await rc.ready()
  assert.strictEqual(rc.isVersionOk(), false)
  assert.strictEqual(rc.canSubmit(), false)
  assert.strictEqual(rc.canLogin(), false)
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
  assert.strictEqual(cfg.site.blogName, '技术博客')
  assert.strictEqual(cfg.site.pageSize, 20)
  assert.strictEqual(cfg.site.fontUrl, 'https://cdn.example.com/font.woff2')
  assert.strictEqual(cfg.features.moments.enabled, true)
  assert.strictEqual(cfg.features.moments.commentEnabled, false)
  assert.strictEqual(cfg.features.readerAccount.enabled, true)
  assert.strictEqual(rc.canReadMoments(), true)
  assert.strictEqual(rc.canLogin(), true)
  assert.strictEqual(cfg.announcement.version, '2026-08-01')
  assert.strictEqual(cfg.privacyPolicyVersion, '2026-08-01')
})
