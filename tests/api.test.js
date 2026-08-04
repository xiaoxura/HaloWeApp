const { test, beforeEach } = require('node:test')
const assert = require('node:assert')

const config = require('../config/index')
const api = require('../utils/api')
const {
  MOMENTS_LIST_ENDPOINT,
  MOMENTS_AVAILABLE_ENDPOINT
} = require('../utils/plugin-contract')

beforeEach(() => {
  delete global.wx
})

function captureRequest(responseData = {}) {
  let captured
  global.wx = {
    request(options) {
      captured = options
      options.success({ statusCode: 200, data: responseData })
    }
  }
  return () => captured
}

test('api: Moment 列表参数和详情名称统一编码', async () => {
  let getCaptured = captureRequest({ items: [] })
  await api.getMomentList({ page: 2, size: 20, tag: '旅行 日记' })
  assert.strictEqual(
    getCaptured().url,
    `${config.baseUrl}${MOMENTS_LIST_ENDPOINT}?page=2&size=20&tag=${encodeURIComponent('旅行 日记')}`
  )

  getCaptured = captureRequest({ metadata: { name: 'moment/name' } })
  await api.getMomentByName('moment/name')
  assert.strictEqual(
    getCaptured().url,
    `${config.baseUrl}${MOMENTS_LIST_ENDPOINT}/moment%2Fname`
  )
})

test('api: Post、分类、标签和评论主体名称按路径段编码并拒绝空值', async () => {
  const getCaptured = captureRequest({ items: [] })
  await api.getPostByName('post/name')
  assert.strictEqual(
    getCaptured().url,
    `${config.baseUrl}/apis/api.content.halo.run/v1alpha1/posts/post%2Fname`
  )

  await api.getCategoryPostList('分类/一', { page: 1 })
  assert.strictEqual(
    getCaptured().url,
    `${config.baseUrl}/apis/api.content.halo.run/v1alpha1/categories/%E5%88%86%E7%B1%BB%2F%E4%B8%80/posts?page=1`
  )
  await api.getTagPostList('标签/一', { page: 1 })
  assert.strictEqual(
    getCaptured().url,
    `${config.baseUrl}/apis/api.content.halo.run/v1alpha1/tags/%E6%A0%87%E7%AD%BE%2F%E4%B8%80/posts?page=1`
  )
  await api.getCommentReplyList('comment/name', { page: 2 })
  assert.strictEqual(
    getCaptured().url,
    `${config.baseUrl}/apis/api.halo.run/v1alpha1/comments/comment%2Fname/reply?page=2`
  )

  await assert.rejects(api.getPostByName(''), /Post name 不合法/)
  await assert.rejects(api.getCategoryPostList('', {}), /Category name 不合法/)
})

test('api: 插件 available 只允许固定白名单名称', async () => {
  const getCaptured = captureRequest(true)
  assert.strictEqual(await api.getMomentsPluginAvailability(), true)
  assert.strictEqual(getCaptured().url, `${config.baseUrl}${MOMENTS_AVAILABLE_ENDPOINT}`)
  await assert.rejects(api.getPluginAvailability('arbitrary-plugin'), /不支持的插件能力/)
})

test('api: 通用 tracker 点赞支持 Post / Moment，旧 Post wrapper 保持兼容', async () => {
  let getCaptured = captureRequest('')
  await api.upvoteSubject({ group: 'moment.halo.run', plural: 'moments', name: ' moment-1 ' })
  assert.strictEqual(getCaptured().method, 'POST')
  assert.deepStrictEqual(getCaptured().data, {
    group: 'moment.halo.run',
    plural: 'moments',
    name: 'moment-1'
  })

  getCaptured = captureRequest('')
  await api.upvote('post-1')
  assert.deepStrictEqual(getCaptured().data, {
    group: 'content.halo.run',
    plural: 'posts',
    name: 'post-1'
  })

  await assert.rejects(api.upvoteSubject({ group: 'moment.halo.run', plural: '', name: '../bad' }), /主体不合法/)

  getCaptured = captureRequest('')
  await api.reportCounter(' post-1 ')
  assert.deepStrictEqual(getCaptured().data, {
    group: 'content.halo.run',
    plural: 'posts',
    name: 'post-1'
  })
  await assert.rejects(api.reportCounter('../bad'), /Post name 不合法/)
})

test('api: 非法 Moment name 在发请求前拒绝', async () => {
  await assert.rejects(api.getMomentByName(''), /Moment name 不合法/)
  await assert.rejects(api.getMomentByName('x'.repeat(129)), /Moment name 不合法/)
  const getCaptured = captureRequest({ items: [] })
  await api.search('  Halo  ', 20)
  assert.deepStrictEqual(getCaptured().data, { keyword: 'Halo', limit: 20 })
  await assert.rejects(api.search('   '), /搜索参数不合法/)
  await assert.rejects(api.search(123), /搜索参数不合法/)
  await assert.rejects(api.search('Halo', 0), /搜索参数不合法/)
  await assert.rejects(api.search('Halo', 21), /搜索参数不合法/)
  await assert.rejects(api.search('Halo', '20'), /搜索参数不合法/)
})

test('api: auth 路由使用固定插件前缀、正确 HTTP 方法和安全 header', async () => {
  const captured = []
  global.wx = {
    request(options) {
      captured.push(options)
      options.success({ statusCode: options.method === 'DELETE' ? 204 : 200, data: '' })
    }
  }
  const header = {
    'X-WeApp-Session': 'memory-token',
    'X-WeApp-Client-Version': '0.4.0'
  }
  await api.loginReader({ code: 'wx-code', privacyConsentVersion: 'v1' }, header)
  await api.getReaderProfile(header)
  await api.updateReaderProfile({ displayName: '新昵称', privacyConsentVersion: 'v1' }, header)
  await api.logoutReader(header)
  await api.deleteReaderAccount(header)
  assert.deepStrictEqual(captured.map((item) => [item.method, item.url]), [
    ['POST', `${config.baseUrl}/apis/api.weapp.halo.run/v1alpha1/auth/login`],
    ['GET', `${config.baseUrl}/apis/api.weapp.halo.run/v1alpha1/auth/profile`],
    ['PATCH', `${config.baseUrl}/apis/api.weapp.halo.run/v1alpha1/auth/profile`],
    ['DELETE', `${config.baseUrl}/apis/api.weapp.halo.run/v1alpha1/auth/session`],
    ['DELETE', `${config.baseUrl}/apis/api.weapp.halo.run/v1alpha1/auth/account`]
  ])
  assert.strictEqual(captured[2].header['X-WeApp-Client-Version'], '0.4.0')
  assert.strictEqual(captured[3].header['X-WeApp-Session'], 'memory-token')
})

test('api: Moment 评论主体只通过受控路径编码', async () => {
  const captured = captureRequest({ status: 'published' })
  const header = {
    'X-WeApp-Session': 'memory-token',
    'X-Idempotency-Key': 'moment-idempotency',
    'X-WeApp-Client-Version': '0.4.0'
  }
  await api.submitPluginMomentComment('moment-1', {
    displayName: '访客昵称',
    content: '正文',
    privacyConsentVersion: 'v1'
  }, header)
  assert.strictEqual(
    captured().url,
    `${config.baseUrl}/apis/api.weapp.halo.run/v1alpha1/moments/moment-1/comments`
  )
  assert.strictEqual(captured().header['X-WeApp-Session'], 'memory-token')
  assert.strictEqual(captured().data.displayName, '访客昵称')
  await assert.rejects(api.submitPluginMomentComment('../admin', {}, header), /Moment name 不合法/)
})
