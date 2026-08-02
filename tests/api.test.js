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
