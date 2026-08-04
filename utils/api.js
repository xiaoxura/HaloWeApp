const { get, post, patch, del } = require('./request')
const {
  PLUGIN_API_BASE,
  MOMENTS_PLUGIN_NAME,
  MOMENTS_LIST_ENDPOINT,
  MOMENTS_AVAILABLE_ENDPOINT
} = require('./plugin-contract')
const { safeResourceName } = require('./resource-name')

const AVAILABLE_ENDPOINTS = Object.freeze({
  [MOMENTS_PLUGIN_NAME]: MOMENTS_AVAILABLE_ENDPOINT
})

function invalidArgument(message) {
  const error = new TypeError(message)
  error.type = 'validation'
  return Promise.reject(error)
}

function encodePathName(value, label) {
  if (typeof value !== 'string' || !value.trim() || Array.from(value.trim()).length > 128) {
    return invalidArgument(`${label} name 不合法`)
  }
  return encodeURIComponent(value.trim())
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
  getPostByName(name) {
    const encoded = encodePathName(name, 'Post')
    return typeof encoded === 'string'
      ? get(`/apis/api.content.halo.run/v1alpha1/posts/${encoded}`)
      : encoded
  },

  // ===== 分类 =====
  getCategoryList: (params) => get('/apis/api.content.halo.run/v1alpha1/categories', params),

  getCategoryPostList(name, params) {
    const encoded = encodePathName(name, 'Category')
    return typeof encoded === 'string'
      ? get(`/apis/api.content.halo.run/v1alpha1/categories/${encoded}/posts`, params)
      : encoded
  },

  // ===== 标签 =====
  getTagList: (params) => get('/apis/api.content.halo.run/v1alpha1/tags', params),

  getTagPostList(name, params) {
    const encoded = encodePathName(name, 'Tag')
    return typeof encoded === 'string'
      ? get(`/apis/api.content.halo.run/v1alpha1/tags/${encoded}/posts`, params)
      : encoded
  },

  // ===== 瞬间（PluginMoments >= 1.15.0 Public API）=====
  getMomentList: (params) => get(MOMENTS_LIST_ENDPOINT, params),

  getMomentByName: (name) => {
    const encoded = encodePathName(name, 'Moment')
    return typeof encoded === 'string' ? get(`${MOMENTS_LIST_ENDPOINT}/${encoded}`) : encoded
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

  getCommentReplyList(commentName, params) {
    const encoded = encodePathName(commentName, 'Comment')
    return typeof encoded === 'string'
      ? get(`/apis/api.halo.run/v1alpha1/comments/${encoded}/reply`, params)
      : encoded
  },

  // ===== 配套插件（plugin-halo-weapp）=====
  // 插件 API 前缀是客户端与 plugin-halo-weapp 的固定协议，不属于部署配置
  pluginApiBase() {
    return PLUGIN_API_BASE
  },

  // 微信登录 code 换取短会话 token
  createPluginSession(code) {
    return post(`${module.exports.pluginApiBase()}/session`, { code })
  },

  // ===== 微信读者身份（token 只由 auth-session 在内存中持有） =====
  // auth 写请求的 header 由调用方传入，统一包含 X-WeApp-Client-Version；
  // 认证会话 header 绝不进入 URL 或请求体。
  loginReader(data, header) {
    return post(`${module.exports.pluginApiBase()}/auth/login`, data, { header })
  },

  getReaderProfile(header) {
    return get(`${module.exports.pluginApiBase()}/auth/profile`, null, { header })
  },

  updateReaderProfile(data, header) {
    return patch(`${module.exports.pluginApiBase()}/auth/profile`, data, { header })
  },

  logoutReader(header) {
    return del(`${module.exports.pluginApiBase()}/auth/session`, { header })
  },

  deleteReaderAccount(header) {
    return del(`${module.exports.pluginApiBase()}/auth/account`, { header })
  },

  // 发表评论（header 需含 X-WeApp-Session / X-Idempotency-Key / X-WeApp-Client-Version）
  submitPluginComment(data, header) {
    return post(`${module.exports.pluginApiBase()}/comments`, data, { header })
  },

  // Moment 评论：主体来自受控 path，客户端不能提交任意 subjectRef/GVK。
  submitPluginMomentComment(momentName, data, header) {
    const name = safeResourceName(momentName)
    return name
      ? post(`${module.exports.pluginApiBase()}/moments/${encodeURIComponent(name)}/comments`, data, { header })
      : invalidArgument('Moment name 不合法')
  },

  // 回复评论
  submitPluginReply(commentName, data, header) {
    const name = safeResourceName(commentName)
    return name
      ? post(`${module.exports.pluginApiBase()}/comments/${encodeURIComponent(name)}/replies`, data, { header })
      : invalidArgument('Comment name 不合法')
  },

  // ===== 统计与计数 =====
  getStats: () => get('/apis/api.halo.run/v1alpha1/stats/-'),

  // 点赞 / 浏览计数（tracker 形式）
  upvoteSubject(subject) {
    const it = subject && typeof subject === 'object' ? subject : {}
    const validTrackerPart = (value, max) =>
      typeof value === 'string' && value.length > 0 && value.length <= max && /^[A-Za-z0-9.-]+$/.test(value)
    const name = safeResourceName(it.name)
    if (!validTrackerPart(it.group, 100) || !validTrackerPart(it.plural, 100) || !name) {
      return invalidArgument('点赞主体不合法')
    }
    return post('/apis/api.halo.run/v1alpha1/trackers/upvote', {
      group: it.group,
      plural: it.plural,
      name
    })
  },

  // 文章兼容 wrapper，旧页面无需变更。
  upvote(name) {
    return module.exports.upvoteSubject({ group: 'content.halo.run', plural: 'posts', name })
  },

  reportCounter(name) {
    const safeName = safeResourceName(name)
    if (!safeName) return invalidArgument('Post name 不合法')
    return post('/apis/api.halo.run/v1alpha1/trackers/counter', {
      group: 'content.halo.run',
      plural: 'posts',
      name: safeName
    })
  },

  // ===== 搜索 =====
  // 当前搜索 API 使用 limit 而非标准分页（v0.2.0 最多返回 20 条，不做伪分页）
  search(keyword, limit = 20) {
    const normalizedKeyword = typeof keyword === 'string' ? keyword.trim() : ''
    if (!normalizedKeyword || !Number.isInteger(limit) || limit < 1 || limit > 20) {
      return invalidArgument('搜索参数不合法')
    }
    return post('/apis/api.halo.run/v1alpha1/indices/-/search', {
      keyword: normalizedKeyword,
      limit
    })
  }
}
