const { test } = require('node:test')
const assert = require('node:assert')

const {
  parsePluginAvailability,
  createPluginCapabilities
} = require('../utils/plugin-capabilities')
const { MOMENTS_AVAILABLE_ENDPOINT } = require('../utils/plugin-contract')

test('capabilities: 只接受明确的可用响应', () => {
  assert.strictEqual(parsePluginAvailability(true), true)
  assert.strictEqual(parsePluginAvailability({ available: true }), true)
  for (const value of [false, null, undefined, 'true', {}, { available: false }]) {
    assert.strictEqual(parsePluginAvailability(value), false)
  }
})

test('capabilities: 并发探测单飞且只使用固定 PluginMoments 路径', async () => {
  let calls = 0
  let requestedPath = ''
  let resolveRequest
  const capabilities = createPluginCapabilities({
    get: (path) => {
      calls++
      requestedPath = path
      return new Promise((resolve) => {
        resolveRequest = resolve
      })
    }
  })

  const first = capabilities.momentsAvailable()
  const second = capabilities.momentsAvailable()
  await Promise.resolve()
  assert.strictEqual(calls, 1)
  assert.strictEqual(requestedPath, MOMENTS_AVAILABLE_ENDPOINT)
  resolveRequest(true)
  assert.deepStrictEqual(await Promise.all([first, second]), [true, true])
  assert.strictEqual(capabilities.getMomentsAvailability(), true)

  assert.strictEqual(await capabilities.momentsAvailable(), true)
  assert.strictEqual(calls, 1, '同一冷启动不得重复探测')
})

test('capabilities: 网络、HTML 与显式 false 均缓存为本次冷启动不可用', async () => {
  for (const result of [new Error('timeout'), '<html>login</html>', false, { available: false }]) {
    let calls = 0
    const capabilities = createPluginCapabilities({
      get: () => {
        calls++
        return result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
      }
    })
    assert.strictEqual(await capabilities.momentsAvailable(), false)
    assert.strictEqual(await capabilities.momentsAvailable(), false)
    assert.strictEqual(calls, 1)
  }
})

test('capabilities: reset 模拟新冷启动并重新探测', async () => {
  let calls = 0
  const capabilities = createPluginCapabilities({
    get: () => Promise.resolve(++calls > 1)
  })
  assert.strictEqual(await capabilities.momentsAvailable(), false)
  capabilities.reset()
  assert.strictEqual(capabilities.getMomentsAvailability(), null)
  assert.strictEqual(await capabilities.momentsAvailable(), true)
  assert.strictEqual(calls, 2)
})
