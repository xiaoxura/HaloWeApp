const { test } = require('node:test')
const assert = require('node:assert')

const { mergeMomentsByName, buildMomentListParams } = require('../utils/moment-list')

test('moment list: 分页按 metadata.name 稳定去重并保留已有顺序', () => {
  const merged = mergeMomentsByName(
    [{ name: 'a', text: 'old-a' }, { name: 'b' }],
    [{ name: 'b', text: 'duplicate' }, { name: 'c' }, null, { text: 'missing-name' }]
  )
  assert.deepStrictEqual(merged.map((item) => item.name), ['a', 'b', 'c'])
  assert.strictEqual(merged[1].text, undefined)
})

test('moment list: 标签作为固定 API tag 参数，空标签不发送', () => {
  assert.deepStrictEqual(buildMomentListParams(2, 20, ' Halo '), {
    page: 2,
    size: 20,
    sort: ['spec.releaseTime,desc'],
    tag: 'Halo'
  })
  assert.deepStrictEqual(buildMomentListParams(0, 0, ''), {
    page: 1,
    size: 20,
    sort: ['spec.releaseTime,desc']
  })
})
