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

// Halo 官方 Moment 插件公开契约。固定名称阻止部署配置把客户端导向任意探测路径。
const MOMENTS_PLUGIN_NAME = 'PluginMoments'
const MOMENTS_API_BASE = '/apis/api.moment.halo.run/v1alpha1'
const MOMENTS_LIST_ENDPOINT = `${MOMENTS_API_BASE}/moments`
const MOMENTS_AVAILABLE_ENDPOINT =
  `/apis/api.plugin.halo.run/v1alpha1/plugins/${MOMENTS_PLUGIN_NAME}/available`

module.exports = {
  PLUGIN_NAME,
  PLUGIN_API_BASE,
  PLUGIN_CONFIG_ENDPOINT,
  CONFIG_CACHE_TTL,
  MOMENTS_PLUGIN_NAME,
  MOMENTS_API_BASE,
  MOMENTS_LIST_ENDPOINT,
  MOMENTS_AVAILABLE_ENDPOINT
}
