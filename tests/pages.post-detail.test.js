const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')

const apiPath = require.resolve('../utils/api')
const likesPath = require.resolve('../utils/likes')
const commentThreadPath = require.resolve('../utils/comment-thread')
const pagePath = require.resolve('../pages/post-detail/post-detail.js')

let pageDefinition
let apiMock
let likesMock
let instance
let authSessionMock
let storage
let runtimeReadyImpl

function setNested(target, path, value) {
  const parts = path.split('.')
  const last = parts.pop()
  const parent = parts.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== 'object') current[key] = {}
    return current[key]
  }, target)
  parent[last] = value
}

function loadPage() {
  apiMock = { upvote: () => Promise.resolve() }
  likesMock = { isUpvoted: () => false, markUpvoted: () => {} }
  storage = {}
  authSessionMock = {
    preferredDisplayName: (fallback) => fallback
  }
  require.cache[apiPath] = {
    id: apiPath,
    filename: apiPath,
    loaded: true,
    exports: apiMock
  }
  require.cache[likesPath] = {
    id: likesPath,
    filename: likesPath,
    loaded: true,
    exports: likesMock
  }
  delete require.cache[pagePath]
  delete require.cache[commentThreadPath]

  runtimeReadyImpl = () => Promise.resolve()

  global.Page = (definition) => {
    pageDefinition = definition
  }
  global.getApp = () => ({
    runtimeReady: (...args) => runtimeReadyImpl(...args),
    authSession: authSessionMock
  })
  global.wx = {
    showToast() {},
    getStorageSync(key) {
      return storage[key]
    }
  }
  require(pagePath)

  instance = {
    data: {
      ...pageDefinition.data,
      name: 'post-name',
      post: { upvotes: 2 },
      upvoted: false
    },
    _unloaded: false,
    _upvotePromise: null,
    setData(patch) {
      Object.entries(patch).forEach(([key, value]) => setNested(this.data, key, value))
    }
  }
}

beforeEach(loadPage)

afterEach(() => {
  delete require.cache[pagePath]
  delete require.cache[commentThreadPath]
  delete require.cache[apiPath]
  delete require.cache[likesPath]
  delete global.Page
  delete global.getApp
  delete global.wx
})

test('post detail: duplicate upvotes share one request and increment after success', async () => {
  let resolveRequest
  let calls = 0
  let marks = 0
  apiMock.upvote = () => {
    calls += 1
    return new Promise((resolve) => {
      resolveRequest = resolve
    })
  }
  likesMock.markUpvoted = () => {
    marks += 1
  }

  const first = pageDefinition.handleUpvote.call(instance)
  const second = pageDefinition.handleUpvote.call(instance)
  assert.strictEqual(calls, 1)
  assert.strictEqual(instance.data.post.upvotes, 2)

  resolveRequest()
  await Promise.all([first, second])
  assert.strictEqual(marks, 1)
  assert.strictEqual(instance.data.upvoted, true)
  assert.strictEqual(instance.data.post.upvotes, 3)
})

test('post detail: failed upvote leaves statistics unchanged and permits retry', async () => {
  let calls = 0
  let marks = 0
  apiMock.upvote = () => {
    calls += 1
    return calls === 1 ? Promise.reject(new Error('network')) : Promise.resolve()
  }
  likesMock.markUpvoted = () => {
    marks += 1
  }

  await pageDefinition.handleUpvote.call(instance)
  assert.strictEqual(instance.data.upvoted, false)
  assert.strictEqual(instance.data.post.upvotes, 2)
  assert.strictEqual(marks, 0)

  await pageDefinition.handleUpvote.call(instance)
  assert.strictEqual(calls, 2)
  assert.strictEqual(instance.data.upvoted, true)
  assert.strictEqual(instance.data.post.upvotes, 3)
  assert.strictEqual(marks, 1)
})

test('post detail: comment sheet prefers authenticated display name and falls back locally', () => {
  storage.commentNickname = '本机昵称'
  authSessionMock.preferredDisplayName = () => '服务端昵称'
  pageDefinition.openSheet.call(instance, null)
  assert.strictEqual(instance.data.initialNickname, '服务端昵称')

  authSessionMock.preferredDisplayName = (fallback) => fallback
  pageDefinition.openSheet.call(instance, null)
  assert.strictEqual(instance.data.initialNickname, '本机昵称')
})

test('post detail: runtime readiness rejection keeps comment writes closed', async () => {
  let commentFetches = 0
  runtimeReadyImpl = () => Promise.reject(new Error('runtime unavailable'))
  apiMock.getPostByName = () => Promise.resolve({
    metadata: { name: 'post-name' },
    spec: { title: '文章', allowComment: true },
    content: { content: '<p>正文</p>' },
    stats: {}
  })
  apiMock.reportCounter = () => Promise.resolve()
  apiMock.getCommentList = () => {
    commentFetches += 1
    return Promise.resolve({ items: [] })
  }
  instance.initNavMetrics = () => {}
  instance.fetchPost = () => pageDefinition.fetchPost.call(instance)

  pageDefinition.onLoad.call(instance, { name: 'post-name' })
  await new Promise((resolve) => setImmediate(resolve))

  assert.strictEqual(instance.data.commentEnabled, false)
  assert.strictEqual(instance.data.commentSubmitEnabled, false)
  assert.strictEqual(instance.data.commentReplyEnabled, false)
  assert.strictEqual(commentFetches, 0)
})

test('post detail: an older fetch response cannot replace the latest response', async () => {
  const pending = []
  apiMock.getPostByName = () => new Promise((resolve) => pending.push(resolve))
  apiMock.reportCounter = () => Promise.resolve()

  const makePost = (name, title) => ({
    metadata: { name },
    spec: { title, allowComment: false },
    content: { content: `<p>${title}</p>` },
    stats: {}
  })

  const first = pageDefinition.fetchPost.call(instance)
  const second = pageDefinition.fetchPost.call(instance)
  assert.strictEqual(pending.length, 2)

  pending[1](makePost('post-name', '最新文章'))
  await second
  pending[0](makePost('post-name', '旧文章'))
  await first

  assert.strictEqual(instance.data.post.title, '最新文章')
  assert.strictEqual(instance.data.status, 'ready')
})
