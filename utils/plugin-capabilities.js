const api = require('./api')
const { MOMENTS_AVAILABLE_ENDPOINT } = require('./plugin-contract')

/**
 * Halo 插件能力探测。
 *
 * - 只探测编译期固定的 PluginMoments，不接受页面或部署配置传入名称/路径；
 * - 每个小程序冷启动最多发起一次请求，并发调用复用同一个 Promise；
 * - 结果只保存在当前 JS 运行时内存，不写 storage，下一次冷启动必须重新探测；
 * - 超时、非 2xx、HTML、非法 JSON 与显式 false 全部按不可用安全降级。
 */

function parsePluginAvailability(data) {
  return data === true || (!!data && typeof data === 'object' && data.available === true)
}

function createPluginCapabilities(deps) {
  const { get } = deps
  let momentsResult = null
  let momentsPromise = null

  function momentsAvailable() {
    if (momentsResult !== null) return Promise.resolve(momentsResult)
    if (momentsPromise) return momentsPromise

    momentsPromise = Promise.resolve()
      .then(() => get(MOMENTS_AVAILABLE_ENDPOINT))
      .then(parsePluginAvailability)
      .catch(() => false)
      .then((available) => {
        momentsResult = available
        return available
      })
      .finally(() => {
        momentsPromise = null
      })
    return momentsPromise
  }

  return {
    momentsAvailable,
    /** 仅用于同步 UI 判断；null 表示尚未探测，不能当作可用。 */
    getMomentsAvailability() {
      return momentsResult
    },
    /** 测试与显式新冷启动边界使用；业务页面不应反复重置。 */
    reset() {
      momentsResult = null
      momentsPromise = null
    }
  }
}

const pluginCapabilities = createPluginCapabilities({
  get: () => api.getMomentsPluginAvailability()
})

module.exports = {
  parsePluginAvailability,
  createPluginCapabilities,
  pluginCapabilities
}
