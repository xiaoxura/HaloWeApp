const { test } = require('node:test')
const assert = require('node:assert')

const config = require('../config/index')
const {
  PLUGIN_NAME,
  PLUGIN_API_BASE,
  PLUGIN_CONFIG_ENDPOINT
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
})
