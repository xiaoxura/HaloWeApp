const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { parseHighlight, normalizeSearchHit, normalizeSearchResult } = require('../utils/adapters/search')

const searchFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'search-result.json'), 'utf8')
)

// ===== parseHighlight =====

test('highlight: 基本 <B> 标记解析（连续高亮合并）', () => {
  const segs = parseHighlight('本地FastGPT接入本地<B>大</B><B>模型</B>教程')
  assert.deepStrictEqual(segs, [
    { text: '本地FastGPT接入本地', highlight: false },
    { text: '大模型', highlight: true },
    { text: '教程', highlight: false }
  ])
})

test('highlight: 无标记返回单段纯文本', () => {
  assert.deepStrictEqual(parseHighlight('普通文本'), [{ text: '普通文本', highlight: false }])
  assert.deepStrictEqual(parseHighlight(''), [])
  assert.deepStrictEqual(parseHighlight(null), [])
})

test('highlight: 其他 HTML 标签按纯文本保留（不解析、不剔除）', () => {
  const segs = parseHighlight('<div><B>命中</B><script>x</script></div>')
  // 只识别 <B>，其余标签原样作为文本（WXML 插值自动转义，不会注入）
  assert.deepStrictEqual(segs, [
    { text: '<div>', highlight: false },
    { text: '命中', highlight: true },
    { text: '<script>x</script></div>', highlight: false }
  ])
})

test('highlight: 未闭合标记优雅降级', () => {
  const segs = parseHighlight('前<B>后')
  assert.deepStrictEqual(segs, [
    { text: '前', highlight: false },
    { text: '后', highlight: true }
  ])
})

test('highlight: 小写 <b> 同样识别', () => {
  const segs = parseHighlight('a<b>b</b>c')
  assert.deepStrictEqual(segs, [
    { text: 'a', highlight: false },
    { text: 'b', highlight: true },
    { text: 'c', highlight: false }
  ])
})

// ===== normalizeSearchResult =====

test('search: 真实夹具转换，高亮片段受控', () => {
  const r = normalizeSearchResult(searchFixture)
  assert.ok(r.total > 0)
  assert.ok(r.items.length > 0)
  r.items.forEach((item) => {
    assert.ok(item.metadataName, '缺少 metadataName')
    assert.ok(item.titleSegments.length > 0, '标题片段为空')
    // 片段中不应出现 <B> 原文
    item.titleSegments.concat(item.descSegments).forEach((seg) => {
      assert.ok(!/<\/?B>/i.test(seg.text), `片段残留 <B> 标记: ${seg.text}`)
    })
  })
})

test('search: 过滤回收站/未发布/非文章类型', () => {
  const r = normalizeSearchResult({
    total: 4,
    hits: [
      { metadataName: 'ok', type: 'post.content.halo.run', published: true, recycled: false, title: 'a' },
      { metadataName: 'recycled', type: 'post.content.halo.run', published: true, recycled: true, title: 'b' },
      { metadataName: 'draft', type: 'post.content.halo.run', published: false, recycled: false, title: 'c' },
      { metadataName: 'page', type: 'singlepage.content.halo.run', published: true, recycled: false, title: 'd' }
    ]
  })
  assert.strictEqual(r.items.length, 1)
  assert.strictEqual(r.items[0].metadataName, 'ok')
  assert.strictEqual(r.total, 4)
})

test('search: 空响应与非法输入安全返回', () => {
  assert.deepStrictEqual(normalizeSearchResult(null), { total: 0, keyword: '', items: [] })
  assert.deepStrictEqual(normalizeSearchResult({}), { total: 0, keyword: '', items: [] })
  assert.deepStrictEqual(normalizeSearchResult({ hits: 'not-array' }), { total: 0, keyword: '', items: [] })
})

test('search: hit 更新时间格式化', () => {
  const h = normalizeSearchHit({
    metadataName: 'x',
    title: 't',
    updateTimestamp: '2026-01-16T10:55:50.300256831Z'
  })
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(h.updateTime), h.updateTime)
})
