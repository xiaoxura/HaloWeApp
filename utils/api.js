const { get, post } = require('./request')
const {
  PLUGIN_API_BASE,
  MOMENTS_PLUGIN_NAME,
  MOMENTS_LIST_ENDPOINT,
  MOMENTS_AVAILABLE_ENDPOINT
} = require('./plugin-contract')

const AVAILABLE_ENDPOINTS = Object.freeze({
  [MOMENTS_PLUGIN_NAME]: MOMENTS_AVAILABLE_ENDPOINT
})

function invalidArgument(message) {
  const error = new TypeError(message)
  error.type = 'validation'
  return Promise.reject(error)
}

/**
 * Halo API 接口层
 * 路径参考 docs/halo-api.md
 */
module.exports = {
  // ===== 文章 =====
  // 文章列表（公开）
  getPostList: (params) => get('/apis/api.content.halo.run/v1alpha1/posts', params),

  // 文章详情（公开）
  getPostByName: (name) => get(`/apis/api.content.halo.run/v1alpha1/posts/${name}`),

  // ===== 分类 =====
  getCategoryList: (params) => get('/apis/api.content.halo.run/v1alpha1/categories', params),

  getCategoryPostList: (name, params) =>
    get(`/apis/api.content.halo.run/v1alpha1/categories/${name}/posts`, params),

  // ===== 标签 =====
  getTagList: (params) => get('/apis/api.content.halo.run/v1alpha1/tags', params),

  getTagPostList: (name, params) =>
    get(`/apis/api.content.halo.run/v1alpha1/tags/${name}/posts`, params),

  // ===== 瞬间（PluginMoments >= 1.15.0 Public API）=====
  getMomentList: (params) => get(MOMENTS_LIST_ENDPOINT, params),

  getMomentByName: (name) => {
    if (typeof name !== 'string' || !name.trim() || name.length > 128) {
      return invalidArgument('Moment name 不合法')
    }
    return get(`${MOMENTS_LIST_ENDPOINT}/${encodeURIComponent(name.trim())}`)
  },

  // 通用调用面只接受编译期白名单中的固定插件名，页面不能提供任意探测路径。
  getPluginAvailability(pluginName) {
    const endpoint = AVAILABLE_ENDPOINTS[pluginName]
    return endpoint ? get(endpoint, null, { timeout: 5000 }) : invalidArgument('不支持的插件能力')
  },

  getMomentsPluginAvailability() {
    return module.exports.getPluginAvailability(MOMENTS_PLUGIN_NAME)
  },

  // ===== 评论（读取走 Halo Public API；写入必须经配套插件安全网关） =====
  getCommentList: (params) => get('/apis/api.halo.run/v1alpha1/comments', params),

  getCommentReplyList: (commentName, params) =>
    get(`/apis/api.halo.run/v1alpha1/comments/${commentName}/reply`, params),

  // ===== 配套插件（plugin-halo-weapp）=====
  // 插件 API 前缀是客户端与 plugin-halo-weapp 的固定协议，不属于部署配置
  pluginApiBase() {
    return PLUGIN_API_BASE
  },

  // 微信登录 code 换取短会话 token
  createPluginSession(code) {
    return post(`${module.exports.pluginApiBase()}/session`, { code })
  },

  // 发表评论（header 需含 X-WeApp-Session / X-Idempotency-Key / X-WeApp-Client-Version）
  submitPluginComment(data, header) {
    return post(`${module.exports.pluginApiBase()}/comments`, data, { header })
  },

  // 回复评论
  submitPluginReply(commentName, data, header) {
    return post(`${module.exports.pluginApiBase()}/comments/${encodeURIComponent(commentName)}/replies`, data, {
      header
    })
  },

  // ===== 统计与计数 =====
  getStats: () => get('/apis/api.halo.run/v1alpha1/stats/-'),

  // 点赞 / 浏览计数（tracker 形式）
  upvoteSubject(subject) {
    const it = subject && typeof subject === 'object' ? subject : {}
    const validPart = (value, max) =>
      typeof value === 'string' && value.length > 0 && value.length <= max && /^[A-Za-z0-9.-]+$/.test(value)
    if (!validPart(it.group, 100) || !validPart(it.plural, 100) || !validPart(it.name, 128)) {
      return invalidArgument('点赞主体不合法')
    }
    return post('/apis/api.halo.run/v1alpha1/trackers/upvote', {
      group: it.group,
      plural: it.plural,
      name: it.name
    })
  },

  // 文章兼容 wrapper，旧页面无需变更。
  upvote(name) {
    return module.exports.upvoteSubject({ group: 'content.halo.run', plural: 'posts', name })
  },

  reportCounter: (name) =>
    post('/apis/api.halo.run/v1alpha1/trackers/counter', {
      group: 'content.halo.run',
      plural: 'posts',
      name
    }),

  // ===== 搜索 =====
  // 当前搜索 API 使用 limit 而非标准分页（v0.2.0 最多返回 20 条，不做伪分页）
  search: (keyword, limit = 20) =>
    post('/apis/api.halo.run/v1alpha1/indices/-/search', {
      keyword,
      limit
    })
}
