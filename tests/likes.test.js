const { test, beforeEach } = require('node:test')
const assert = require('node:assert')

const likes = require('../utils/likes')

let store

beforeEach(() => {
  store = {}
  global.wx = {
    getStorageSync(key) {
      return store[key]
    },
    setStorageSync(key, value) {
      store[key] = value
    }
  }
})

test('likes: Post / Moment 使用互不冲突的命名空间', () => {
  likes.markUpvotedSubject('post', 'same-name')
  assert.strictEqual(likes.isUpvotedSubject('post', 'same-name'), true)
  assert.strictEqual(likes.isUpvotedSubject('moment', 'same-name'), false)
  likes.markUpvotedSubject('moment', 'same-name')
  assert.strictEqual(likes.isUpvotedSubject('moment', 'same-name'), true)
  assert.ok(store[likes.KEY]['post:same-name'])
  assert.ok(store[likes.KEY]['moment:same-name'])
})

test('likes: v0.3.0 裸 Post key 首次读取迁移，Moment 不误读', () => {
  store[likes.KEY] = { legacy: 123 }
  assert.strictEqual(likes.isUpvotedSubject('moment', 'legacy'), false)
  assert.strictEqual(likes.isUpvoted('legacy'), true)
  assert.strictEqual(store[likes.KEY].legacy, undefined)
  assert.strictEqual(store[likes.KEY]['post:legacy'], 123)
})

test('likes: 旧 Post wrapper 保持兼容', () => {
  likes.markUpvoted('post-1')
  assert.strictEqual(likes.isUpvoted('post-1'), true)
  assert.strictEqual(likes.isUpvotedSubject('moment', 'post-1'), false)
})

test('likes: 非法 kind/name 不写入且 LRU 上限不变', () => {
  likes.markUpvotedSubject('arbitrary', 'x')
  likes.markUpvotedSubject('post', '')
  likes.markUpvotedSubject('moment', 'moment/invalid')
  assert.strictEqual(store[likes.KEY], undefined)

  const originalNow = Date.now
  let now = 0
  Date.now = () => ++now
  try {
    for (let i = 0; i < likes.MAX_ENTRIES + 2; i++) {
      likes.markUpvotedSubject('moment', `m-${i}`)
    }
  } finally {
    Date.now = originalNow
  }
  assert.strictEqual(Object.keys(store[likes.KEY]).length, likes.MAX_ENTRIES)
  assert.strictEqual(store[likes.KEY]['moment:m-0'], undefined)
  assert.ok(store[likes.KEY][`moment:m-${likes.MAX_ENTRIES + 1}`])
})
