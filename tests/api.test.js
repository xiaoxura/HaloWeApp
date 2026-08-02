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

test('api: 插件 available 只允许固定白名单名称', async () => {
  const getCaptured = captureRequest(true)
  assert.strictEqual(await api.getMomentsPluginAvailability(), true)
  assert.strictEqual(getCaptured().url, `${config.baseUrl}${MOMENTS_AVAILABLE_ENDPOINT}`)
  await assert.rejects(api.getPluginAvailability('arbitrary-plugin'), /不支持的插件能力/)
})

test('api: 通用 tracker 点赞支持 Post / Moment，旧 Post wrapper 保持兼容', async () => {
  let getCaptured = captureRequest('')
  await api.upvoteSubject({ group: 'moment.halo.run', plural: 'moments', name: 'moment-1' })
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
})

test('api: 非法 Moment name 在发请求前拒绝', async () => {
  await assert.rejects(api.getMomentByName(''), /Moment name 不合法/)
  await assert.rejects(api.getMomentByName('x'.repeat(129)), /Moment name 不合法/)
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
