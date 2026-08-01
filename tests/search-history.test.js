const { test } = require('node:test')
const assert = require('node:assert')

const { getHistory, addHistory, clearHistory, MAX_ENTRIES } = require('../utils/search-history')

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    get: (k) => map.get(k),
    set: (k, v) => map.set(k, v),
    map
  }
}

test('history: 新增关键词置于最前', () => {
  const s = makeStorage()
  addHistory(s, 'halo')
  const list = addHistory(s, '小程序')
  assert.deepStrictEqual(list, ['小程序', 'halo'])
  assert.deepStrictEqual(getHistory(s), ['小程序', 'halo'])
})

test('history: 空白关键词不写入', () => {
  const s = makeStorage()
  assert.deepStrictEqual(addHistory(s, '   '), [])
  assert.deepStrictEqual(addHistory(s, ''), [])
  assert.strictEqual(s.map.size, 0)
})

test('history: 重复关键词去重并提升（LRU）', () => {
  const s = makeStorage()
  addHistory(s, 'a')
  addHistory(s, 'b')
  addHistory(s, 'c')
  const list = addHistory(s, 'a')
  assert.deepStrictEqual(list, ['a', 'c', 'b'])
})

test('history: 超过上限淘汰最旧记录', () => {
  const s = makeStorage()
  for (let i = 0; i < MAX_ENTRIES + 3; i++) addHistory(s, `kw-${i}`)
  const list = getHistory(s)
  assert.strictEqual(list.length, MAX_ENTRIES)
  assert.strictEqual(list[0], `kw-${MAX_ENTRIES + 2}`)
  assert.ok(!list.includes('kw-0'))
})

test('history: 一键清除', () => {
  const s = makeStorage()
  addHistory(s, 'a')
  clearHistory(s)
  assert.deepStrictEqual(getHistory(s), [])
})

test('history: 存储数据损坏时安全返回空数组', () => {
  const s = makeStorage({ searchHistory: 'corrupted-string' })
  assert.deepStrictEqual(getHistory(s), [])
  const s2 = makeStorage({ searchHistory: [1, null, 'ok', ''] })
  assert.deepStrictEqual(getHistory(s2), ['ok'])
})
