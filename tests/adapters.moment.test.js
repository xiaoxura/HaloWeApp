const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const config = require('../config/index')
const {
  SUMMARY_MAX_LENGTH,
  secureAssetUrl,
  normalizeMomentSummary,
  normalizeMomentDetail,
  normalizeMomentList
} = require('../utils/adapters/moment')

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'))
}

test('moment v1.16: 脱敏真实列表转换为稳定 MomentSummary', () => {
  const out = normalizeMomentList(fixture('moments-page1.json'))
  assert.strictEqual(out.page, 1)
  assert.strictEqual(out.size, 20)
  assert.strictEqual(out.total, 2)
  assert.strictEqual(out.hasNext, false)
  assert.strictEqual(out.moments.length, 2)

  const first = out.moments[0]
  assert.deepStrictEqual(first.owner, {
    name: 'fixture-owner',
    displayName: '示例作者',
    avatar: `${config.baseUrl}/upload/fixture-avatar.png`
  })
  assert.strictEqual(first.name, 'moment-fixture-photo')
  assert.strictEqual(first.text, '今天记录一张测试图片。')
  assert.strictEqual(first.releaseTime, '2026-01-20')
  assert.deepStrictEqual(first.tags, ['日常', '图片'])
  assert.deepStrictEqual(first.stats, { upvote: 3, approvedComment: 2 })
  assert.strictEqual(first.media[0].type, 'PHOTO')
  assert.strictEqual(first.media[0].supported, true)
  assert.strictEqual(first.media[0].url, 'https://cdn.example.com/moments/photo-1.jpg')
})

test('moment v1.15: 官方类型合成的列表与详情保持兼容', () => {
  const list = normalizeMomentList(fixture('moments-v1.15-page1.json'))
  assert.strictEqual(list.moments.length, 1)
  assert.strictEqual(list.moments[0].name, 'moment-v115-text')
  assert.strictEqual(list.moments[0].owner.displayName, 'v1.15 作者')

  const detail = normalizeMomentDetail(fixture('moment-v1.15-detail.json'))
  assert.ok(detail)
  assert.strictEqual(detail.name, 'moment-v115-photo')
  assert.match(detail.html, /v1\.15 详情正文/)
  assert.strictEqual(detail.media[0].url, `${config.baseUrl}/upload/v115-photo.png`)
})

test('moment detail: 复用 HTML 安全清理与相对图片补全管线', () => {
  const detail = normalizeMomentDetail(fixture('moment-detail.json'))
  assert.ok(detail)
  assert.strictEqual(detail.contentEmpty, false)
  assert.doesNotMatch(detail.html, /<(script|iframe|style)\b/i)
  assert.doesNotMatch(detail.html, /\son[a-z]+=/i)
  assert.doesNotMatch(detail.html, /javascript:/i)
  assert.match(detail.html, new RegExp(`${config.baseUrl}/upload/moment-inline\\.png`))
  assert.strictEqual(detail.media[0].url, `${config.baseUrl}/upload/moment-photo.jpg`)
})

test('moment media: PHOTO 最多九张，VIDEO/AUDIO/POST 支持，未知和 HTTP 安全降级', () => {
  const list = normalizeMomentList(fixture('moments-media-types.json')).moments
  const byName = Object.fromEntries(list.map((item) => [item.name, item]))

  assert.strictEqual(byName['moment-media-photo'].media.length, 9)
  assert.ok(byName['moment-media-photo'].media.every((item) => item.type === 'PHOTO' && item.supported))

  for (const [name, type] of [
    ['moment-media-video', 'VIDEO'],
    ['moment-media-audio', 'AUDIO'],
    ['moment-media-post', 'POST']
  ]) {
    assert.strictEqual(byName[name].media[0].type, type)
    assert.strictEqual(byName[name].media[0].supported, true)
    assert.match(byName[name].media[0].url, /^https:\/\//)
  }

  const unknown = byName['moment-media-unknown'].media
  assert.deepStrictEqual(unknown[0], {
    type: 'UNKNOWN',
    url: 'https://cdn.example.com/live',
    originType: 'application/x-future',
    supported: false,
    sourceType: 'LIVE'
  })
  assert.strictEqual(unknown[1].type, 'VIDEO')
  assert.strictEqual(unknown[1].url, '')
  assert.strictEqual(unknown[1].supported, false)
})

test('moment degraded: PRIVATE、未审核、已删除和缺少名称的数据不进入匿名列表', () => {
  const out = normalizeMomentList(fixture('moments-degraded.json'))
  assert.strictEqual(out.moments.length, 1)
  assert.strictEqual(out.moments[0].name, 'moment-minimal-public')
  assert.strictEqual(out.moments[0].owner.displayName, '博主')
  assert.strictEqual(out.moments[0].owner.avatar, '')
  assert.deepStrictEqual(out.moments[0].tags, ['有效标签'])
  assert.deepStrictEqual(out.moments[0].stats, { upvote: 0, approvedComment: 0 })
  assert.strictEqual(normalizeMomentDetail(fixture('moments-degraded.json').items[1]), null)
})

test('moment summary: Unicode 摘要按 code point 截断且缺失字段不抛错', () => {
  const longText = '🌱'.repeat(SUMMARY_MAX_LENGTH + 1)
  const summary = normalizeMomentSummary({
    metadata: { name: 'moment-long' },
    spec: {
      approved: true,
      visible: 'PUBLIC',
      content: { html: `<p>${longText}</p>`, medium: 'invalid' }
    },
    stats: { upvote: -5, approvedComment: 'invalid' }
  })
  assert.strictEqual(Array.from(summary.text).length, SUMMARY_MAX_LENGTH + 1)
  assert.ok(summary.text.endsWith('…'))
  assert.strictEqual(summary.hasMoreContent, true)
  assert.deepStrictEqual(summary.media, [])
  assert.doesNotThrow(() => normalizeMomentSummary(null))
  assert.deepStrictEqual(normalizeMomentList(null).moments, [])
})

test('moment assets: 只接受 HTTPS，协议相对与站内相对地址安全补全', () => {
  assert.strictEqual(secureAssetUrl('/upload/a.png'), `${config.baseUrl}/upload/a.png`)
  assert.strictEqual(secureAssetUrl('//cdn.example.com/a.png'), 'https://cdn.example.com/a.png')
  assert.strictEqual(secureAssetUrl('http://unsafe.example/a.png'), '')
  assert.strictEqual(secureAssetUrl('javascript:alert(1)'), '')
  assert.strictEqual(secureAssetUrl('data:image/png;base64,AA'), '')
})
