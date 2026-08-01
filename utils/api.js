const { get, post } = require('./request')
const config = require('../config/index')

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

  // ===== 评论（读取走 Halo Public API；写入必须经配套插件安全网关） =====
  getCommentList: (params) => get('/apis/api.halo.run/v1alpha1/comments', params),

  getCommentReplyList: (commentName, params) =>
    get(`/apis/api.halo.run/v1alpha1/comments/${commentName}/reply`, params),

  // ===== 配套插件（plugin-halo-weapp）=====
  // 插件 API 前缀由 remoteConfig.endpoint 推导：
  // /apis/api.weapp.halo.run/v1alpha1/config => /apis/api.weapp.halo.run/v1alpha1
  pluginApiBase() {
    const ep = (config.remoteConfig && config.remoteConfig.endpoint) || ''
    return ep.endsWith('/config') ? ep.slice(0, -'/config'.length) : ''
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
  upvote: (name) =>
    post('/apis/api.halo.run/v1alpha1/trackers/upvote', {
      group: 'content.halo.run',
      plural: 'posts',
      name
    }),

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
