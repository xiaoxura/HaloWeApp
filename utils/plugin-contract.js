/**
 * plugin-halo-weapp 的固定公开契约。
 *
 * 这些值属于客户端与插件之间的协议，不是部署者配置；变更时必须与插件的
 * metadata.name、API group 和 docs/openapi.yaml 同步发布。
 */
const PLUGIN_NAME = 'plugin-halo-weapp'
const PLUGIN_API_BASE = '/apis/api.weapp.halo.run/v1alpha1'
const PLUGIN_CONFIG_ENDPOINT = `${PLUGIN_API_BASE}/config`
const CONFIG_CACHE_TTL = 21600000 // 6 小时

module.exports = {
  PLUGIN_NAME,
  PLUGIN_API_BASE,
  PLUGIN_CONFIG_ENDPOINT,
  CONFIG_CACHE_TTL
}
