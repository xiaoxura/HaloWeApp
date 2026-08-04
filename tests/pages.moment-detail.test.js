const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const apiPath = require.resolve('../utils/api')
const likesPath = require.resolve('../utils/likes')
const capabilitiesPath = require.resolve('../utils/plugin-capabilities')
const commentThreadPath = require.resolve('../utils/comment-thread')
const mediaSessionPath = require.resolve('../utils/moment-media-session')
const pagePath = require.resolve('../pages/moment-detail/moment-detail.js')

let pageDefinition
let apiMock
let likesMock
let capabilitiesMock
let instance
let toasts
let commentQuery
let runtimeConfigMock
let mediaDestroyCalls

function setNested(target, path, value) {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  const last = parts.pop()
  const parent = parts.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = /^\d+$/.test(key) ? [] : {}
    }
    return current[key]
  }, target)
  parent[last] = value
}

function loadPage() {
  apiMock = {
    upvoteSubject: () => Promise.resolve(),
    getCommentList: (query) => {
      commentQuery = query
      return Promise.resolve({ page: 1, size: 10, total: 1, hasNext: false, items: [] })
    },
    getCommentReplyList: () => Promise.resolve({ items: [], hasNext: false, total: 0 })
  }
  likesMock = {
    isUpvotedSubject: () => false,
    markUpvotedSubject: () => {}
  }
  capabilitiesMock = {
    momentsAvailable: () => Promise.resolve(true)
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
  require.cache[capabilitiesPath] = {
    id: capabilitiesPath,
    filename: capabilitiesPath,
    loaded: true,
    exports: { pluginCapabilities: capabilitiesMock }
  }
  mediaDestroyCalls = 0
  require.cache[mediaSessionPath] = {
    id: mediaSessionPath,
    filename: mediaSessionPath,
    loaded: true,
    exports: {
      momentMediaSession: {
        destroy() {
          mediaDestroyCalls += 1
        }
      }
    }
  }
  delete require.cache[pagePath]
  delete require.cache[commentThreadPath]

  global.Page = (definition) => {
    pageDefinition = definition
  }
  runtimeConfigMock = {
    canReadMoments: () => true,
    canSubmitMomentComment: () => true,
    getConfig: () => ({
      commentEnabled: true,
      commentOptions: { submitEnabled: true, replyEnabled: true, maxLength: 500 },
      privacyPolicyUrl: 'https://example.com/privacy',
      privacyPolicyVersion: 'v1'
    })
  }
  global.getApp = () => ({
    runtimeReady: () => Promise.resolve(),
    runtimeConfig: runtimeConfigMock
  })
  toasts = []
  commentQuery = null
  global.wx = {
    showToast(value) {
      toasts.push(value)
    },
    showShareMenu() {}
  }

  require(pagePath)
  instance = {
    data: {
      ...pageDefinition.data,
      name: 'moment-name',
      status: 'ready',
      moment: {
        text: '一条可分享的瞬间',
        owner: { displayName: '作者' },
        media: [{ type: 'PHOTO', supported: true, url: 'https://cdn.example/photo.jpg' }],
        stats: { upvote: 3 }
      },
      upvoted: false,
      upvoting: false
    },
    _unloaded: false,
    _loadSequence: 0,
    _upvotePromise: null,
    setData(patch) {
      Object.entries(patch).forEach(([key, value]) => setNested(this.data, key, value))
    },
    selectComponent() {
      return null
    }
  }
}

function restoreModules() {
  delete require.cache[pagePath]
  delete require.cache[commentThreadPath]
  delete require.cache[apiPath]
  delete require.cache[likesPath]
  delete require.cache[capabilitiesPath]
  delete require.cache[mediaSessionPath]
}

beforeEach(loadPage)

afterEach(() => {
  restoreModules()
  delete global.Page
  delete global.getApp
  delete global.wx
})

test('moment detail: duplicate upvotes share one request and increment only after success', async () => {
  let resolveRequest
  let calls = 0
  let marks = 0
  apiMock.upvoteSubject = () => {
    calls += 1
    return new Promise((resolve) => {
      resolveRequest = resolve
    })
  }
  likesMock.markUpvotedSubject = () => {
    marks += 1
  }

  const first = pageDefinition.handleUpvote.call(instance)
  const second = pageDefinition.handleUpvote.call(instance)
  assert.strictEqual(first, second)
  assert.strictEqual(calls, 1)
  assert.strictEqual(instance.data.moment.stats.upvote, 3)

  resolveRequest()
  await Promise.all([first, second])
  assert.strictEqual(marks, 1)
  assert.strictEqual(instance.data.upvoted, true)
  assert.strictEqual(instance.data.moment.stats.upvote, 4)
  assert.strictEqual(instance.data.upvoting, false)
})

test('moment detail: failed upvote does not change stats and can be retried', async () => {
  let calls = 0
  let marks = 0
  apiMock.upvoteSubject = () => {
    calls += 1
    return calls === 1 ? Promise.reject(new Error('network')) : Promise.resolve()
  }
  likesMock.markUpvotedSubject = () => {
    marks += 1
  }

  await pageDefinition.handleUpvote.call(instance)
  assert.strictEqual(instance.data.upvoted, false)
  assert.strictEqual(instance.data.moment.stats.upvote, 3)
  assert.strictEqual(marks, 0)
  assert.match(toasts[0].title, /失败/)

  await pageDefinition.handleUpvote.call(instance)
  assert.strictEqual(calls, 2)
  assert.strictEqual(instance.data.upvoted, true)
  assert.strictEqual(instance.data.moment.stats.upvote, 4)
  assert.strictEqual(marks, 1)
})

test('moment detail: transient refresh failure keeps loaded content and exposes retry state', async () => {
  const previous = instance.data.moment
  apiMock.getMomentByName = () => Promise.reject({ statusCode: 503, type: 'http' })

  await pageDefinition.loadMoment.call(instance)

  assert.strictEqual(instance.data.moment, previous)
  assert.strictEqual(instance.data.status, 'ready')
  assert.strictEqual(instance.data.detailLoadError, true)
})

test('moment detail: share path is encoded and falls back safely without loaded content', () => {
  const shared = pageDefinition.onShareAppMessage.call(instance)
  assert.strictEqual(shared.path, '/pages/moment-detail/moment-detail?name=moment-name')
  assert.strictEqual(shared.imageUrl, 'https://cdn.example/photo.jpg')
  assert.strictEqual(shared.title, '一条可分享的瞬间')

  instance.data.name = 'moment name'
  instance.data.moment = null
  const fallback = pageDefinition.onShareAppMessage.call(instance)
  assert.strictEqual(
    fallback.path,
    '/pages/moment-detail/moment-detail?name=moment%20name'
  )
  assert.strictEqual(fallback.title, '分享瞬间')
  assert.strictEqual(fallback.imageUrl, '')
})

test('moment detail: unavailable and deleted deep links expose recoverable states', async () => {
  runtimeConfigMock.canReadMoments = () => true
  capabilitiesMock.momentsAvailable = () => Promise.resolve(false)
  await pageDefinition.loadMoment.call(instance)
  assert.strictEqual(instance.data.status, 'unavailable')
  assert.strictEqual(instance.data.moment, null)

  capabilitiesMock.momentsAvailable = () => Promise.resolve(true)
  apiMock.getMomentByName = () => Promise.reject({ statusCode: 404, type: 'http' })
  await pageDefinition.loadMoment.call(instance)
  assert.strictEqual(instance.data.status, 'notfound')
  assert.strictEqual(instance.data.moment, null)

  apiMock.getMomentByName = () => Promise.resolve({
    metadata: { name: 'moment-name' },
    spec: {
      visible: 'PUBLIC',
      approved: true,
      releaseTime: '2026-08-03T00:00:00Z',
      content: { html: '<p>恢复后的瞬间</p>', medium: [] }
    },
    owner: { displayName: '作者' },
    stats: {}
  })
  instance.loadMoment = () => pageDefinition.loadMoment.call(instance)
  await pageDefinition.retry.call(instance)
  assert.strictEqual(instance.data.status, 'ready')
  assert.strictEqual(instance.data.moment.name, 'moment-name')

  const wxml = fs.readFileSync(
    path.join(__dirname, '../pages/moment-detail/moment-detail.wxml'),
    'utf8'
  )
  assert.match(wxml, /status === 'unavailable'/)
  assert.match(wxml, /status === 'notfound'/)
  assert.match(wxml, /不存在、已删除或不再公开/)
  assert.match(wxml, /bindtap="retry"/)
  assert.match(wxml, /bindtap="goBack"/)

  pageDefinition.onHide.call(instance)
  pageDefinition.onUnload.call(instance)
  assert.strictEqual(mediaDestroyCalls, 2)
  assert.strictEqual(instance._unloaded, true)
})

test('moment detail: comments use the fixed Moment subject and preserve paging state', async () => {
  apiMock.getCommentList = (query) => {
    commentQuery = query
    return Promise.resolve({
      page: 1,
      size: 10,
      total: 1,
      hasNext: false,
      items: [{
        metadata: { name: 'comment-1' },
        owner: { displayName: '访客' },
        spec: { content: '<p>你好</p>', approved: true },
        replies: []
      }]
    })
  }
  instance._commentsLoading = false
  instance._repliesLoading = {}
  await pageDefinition.fetchComments.call(instance, 1)
  assert.deepStrictEqual(commentQuery, {
    group: 'moment.halo.run',
    kind: 'Moment',
    version: 'v1alpha1',
    name: 'moment-name',
    page: 1,
    size: 10,
    withReplies: true,
    replySize: 5
  })
  assert.strictEqual(instance.data.comments.length, 1)
  assert.strictEqual(instance.data.comments[0].name, 'comment-1')
})

test('moment detail: reply refresh follows the comment after the list is replaced', async () => {
  let resolveReplies
  apiMock.getCommentReplyList = () => new Promise((resolve) => {
    resolveReplies = resolve
  })
  instance.data.comments = [
    {
      name: 'comment-1',
      replies: [{ name: 'old-reply' }],
      replyPage: 1,
      replyHasNext: true,
      replyCount: 1
    },
    {
      name: 'comment-2',
      replies: [{ name: 'keep-reply' }],
      replyPage: 1,
      replyHasNext: false,
      replyCount: 1
    }
  ]

  const pending = pageDefinition.refreshReplies.call(instance, 'comment-1')
  instance.data.comments = [
    instance.data.comments[1],
    {
      name: 'comment-1',
      replies: [],
      replyPage: 1,
      replyHasNext: true,
      replyCount: 1
    }
  ]
  resolveReplies({
    items: [{
      metadata: { name: 'reply-1' },
      owner: { displayName: '访客' },
      spec: { content: '<p>新回复</p>' }
    }],
    hasNext: false,
    total: 1
  })
  await pending

  assert.deepStrictEqual(
    instance.data.comments[0].replies.map((reply) => reply.name),
    ['keep-reply']
  )
  assert.deepStrictEqual(
    instance.data.comments[1].replies.map((reply) => reply.name),
    ['reply-1']
  )
})

test('moment detail: WXML exposes the shared comment sheet and controlled actions', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '../pages/moment-detail/moment-detail.wxml'),
    'utf8'
  )
  assert.match(wxml, /bindtap="handleComment"/)
  assert.match(wxml, /bindtap="fetchReplies"/)
  assert.match(wxml, /<comment-sheet/)
  assert.match(wxml, /bind:submit="onSheetSubmit"/)
  assert.match(wxml, /detail-loadfail/)
})
