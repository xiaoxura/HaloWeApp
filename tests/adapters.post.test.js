const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { normalizePostSummary, normalizePostDetail } = require('../utils/adapters/post')
const config = require('../config/index')

const fixtureDir = path.join(__dirname, 'fixtures')
const load = (f) => JSON.parse(fs.readFileSync(path.join(fixtureDir, f), 'utf8'))

const listFixture = load('posts-page1.json')
const detailFixtures = fs
  .readdirSync(fixtureDir)
  .filter((f) => f.startsWith('post-'))
  .map(load)

// ===== normalizePostSummary =====

test('summary: 列表夹具全部正常转换', () => {
  const items = listFixture.items.map(normalizePostSummary)
  assert.strictEqual(items.length, listFixture.items.length)
  items.forEach((p) => {
    assert.ok(p.name, '缺少 name')
    assert.ok(p.title, '缺少 title')
    assert.ok(/^\d{2}-\d{2}$/.test(p.publishTime), `publishTime 格式异常: ${p.publishTime}`)
    assert.strictEqual(typeof p.comments, 'number')
    assert.strictEqual(typeof p.upvotes, 'number')
    assert.strictEqual(typeof p.pinned, 'boolean')
  })
})

test('summary: 缺失 metadata/spec/stats 使用安全默认值（不崩溃）', () => {
  const p = normalizePostSummary({})
  assert.strictEqual(p.name, '')
  assert.strictEqual(p.title, '无标题')
  assert.strictEqual(p.cover, '')
  assert.strictEqual(p.comments, 0)
  assert.strictEqual(p.visits, '0')

  const p2 = normalizePostSummary(null)
  assert.strictEqual(p2.name, '')

  const p3 = normalizePostSummary({ metadata: { name: 'x' } })
  assert.strictEqual(p3.name, 'x')
  assert.strictEqual(p3.title, '无标题')
})

test('summary: 相对封面补全域名', () => {
  const p = normalizePostSummary({
    metadata: { name: 'a' },
    spec: { title: 't', cover: '/upload/cover.png', publishTime: '2026-01-01T00:00:00Z' }
  })
  assert.strictEqual(p.cover, `${config.baseUrl}/upload/cover.png`)
})

// ===== normalizePostDetail =====

test('detail: 真实夹具全部正常转换，正文非空（B-01 回归）', () => {
  detailFixtures.forEach((fx) => {
    const d = normalizePostDetail(fx)
    assert.ok(d.title, `${fx.metadata.name} 缺少标题`)
    assert.ok(d.content.length > 100, `${fx.metadata.name} 正文为空`)
    assert.strictEqual(d.contentEmpty, false)
    assert.ok(Array.isArray(d.tags))
    if (Array.isArray(fx.categories) && fx.categories.length) {
      assert.ok(d.category, `${fx.metadata.name} 缺少分类名`)
    }
  })
})

test('detail: 相对头像补全域名（B-02 回归）', () => {
  const fx = detailFixtures[0]
  assert.ok(fx.owner.avatar.startsWith('/'), '夹具头像应为相对地址')
  const d = normalizePostDetail(fx)
  assert.ok(d.avatar.startsWith(config.baseUrl), `头像未补全: ${d.avatar}`)
})

test('detail: 兼容 content.html 与 content.raw 字段', () => {
  const legacy = normalizePostDetail({
    metadata: { name: 'x' },
    spec: { title: 't' },
    content: { html: '<p>legacy html</p>' }
  })
  assert.ok(legacy.content.includes('legacy html'))

  const rawOnly = normalizePostDetail({
    metadata: { name: 'x' },
    spec: { title: 't' },
    content: { raw: '<p>raw html</p>' }
  })
  assert.ok(rawOnly.content.includes('raw html'))
})

test('detail: 空正文标记 contentEmpty', () => {
  const d = normalizePostDetail({ metadata: { name: 'x' }, spec: { title: 't' }, content: {} })
  assert.strictEqual(d.content, '')
  assert.strictEqual(d.contentEmpty, true)
})

test('detail: 缺失字段安全默认值', () => {
  const d = normalizePostDetail(null)
  assert.strictEqual(d.title, '无标题')
  assert.strictEqual(d.author, '博主')
  assert.strictEqual(d.upvotes, 0)
  assert.strictEqual(d.allowComment, true)
  assert.deepStrictEqual(d.tags, [])
})

test('detail: allowComment 显式 false 被保留', () => {
  const d = normalizePostDetail({
    metadata: { name: 'x' },
    spec: { title: 't', allowComment: false },
    content: { content: '<p>x</p>' }
  })
  assert.strictEqual(d.allowComment, false)
})
