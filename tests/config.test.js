const { test } = require('node:test')
const assert = require('node:assert')

const config = require('../config/index')
const {
  PLUGIN_NAME,
  PLUGIN_API_BASE,
  PLUGIN_CONFIG_ENDPOINT,
  MOMENTS_PLUGIN_NAME,
  MOMENTS_API_BASE,
  MOMENTS_LIST_ENDPOINT,
  MOMENTS_AVAILABLE_ENDPOINT
} = require('../utils/plugin-contract')

test('config: 本地配置面只包含版本号与 Halo 基础 URL', () => {
  assert.deepStrictEqual(Object.keys(config).sort(), ['baseUrl', 'version'])
  assert.match(config.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
  assert.match(config.baseUrl, /^https:\/\//)
})

test('config: 插件名称与 API 路径由固定协议提供', () => {
  assert.strictEqual(PLUGIN_NAME, 'plugin-halo-weapp')
  assert.strictEqual(PLUGIN_API_BASE, '/apis/api.weapp.halo.run/v1alpha1')
  assert.strictEqual(PLUGIN_CONFIG_ENDPOINT, `${PLUGIN_API_BASE}/config`)
  assert.strictEqual(MOMENTS_PLUGIN_NAME, 'PluginMoments')
  assert.strictEqual(MOMENTS_API_BASE, '/apis/api.moment.halo.run/v1alpha1')
  assert.strictEqual(MOMENTS_LIST_ENDPOINT, `${MOMENTS_API_BASE}/moments`)
  assert.strictEqual(
    MOMENTS_AVAILABLE_ENDPOINT,
    '/apis/api.plugin.halo.run/v1alpha1/plugins/PluginMoments/available'
  )
})
