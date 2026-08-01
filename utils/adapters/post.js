const { resolveUrl } = require('../asset')
const { pickContent, preparePostContent } = require('../html')
const { formatDate, formatCount } = require('../util')

/**
 * 文章数据适配层。
 * 页面只消费这里产出的内部模型（PostSummary / PostDetail），
 * 不再直接依赖 Halo 原始响应字段；所有兼容与兜底逻辑集中在这一层。
 */

/**
 * 文章列表项 => PostSummary
 * 首页、分类/标签文章列表共用（B-05）。
 * 缺失 metadata / spec / stats 时使用安全默认值，不允许抛错。
 */
function normalizePostSummary(item) {
  const it = item && typeof item === 'object' ? item : {}
  const spec = it.spec || {}
  const status = it.status || {}
  const stats = it.stats || {}
  const categories = Array.isArray(it.categories) ? it.categories : []
  const firstCat = categories[0] && categories[0].spec

  return {
    name: (it.metadata && it.metadata.name) || '',
    title: spec.title || '无标题',
    cover: resolveUrl(spec.cover),
    pinned: !!spec.pinned,
    excerpt: status.excerpt || spec.excerpt || '',
    publishTime: formatDate(spec.publishTime),
    visits: formatCount(stats.visit || 0),
    comments: stats.comment || 0,
    upvotes: stats.upvote || 0,
    category: (firstCat && firstCat.displayName) || ''
  }
}

/**
 * 文章详情响应 => PostDetail
 * content 经 pickContent 字段兼容选择 + preparePostContent 清理管线（B-01/B-02）。
 */
function normalizePostDetail(res) {
  const it = res && typeof res === 'object' ? res : {}
  const spec = it.spec || {}
  const stats = it.stats || {}
  const owner = it.owner || {}
  const tags = Array.isArray(it.tags) ? it.tags : []
  const categories = Array.isArray(it.categories) ? it.categories : []
  const firstCat = categories[0] && categories[0].spec
  const rawContent = pickContent(it.content)

  return {
    name: (it.metadata && it.metadata.name) || '',
    title: spec.title || '无标题',
    cover: resolveUrl(spec.cover),
    publishTime: formatDate(spec.publishTime, true),
    author: owner.displayName || '博主',
    avatar: resolveUrl(owner.avatar),
    category: (firstCat && firstCat.displayName) || '',
    content: preparePostContent(rawContent),
    contentEmpty: !rawContent.trim(),
    allowComment: spec.allowComment !== false,
    visits: formatCount(stats.visit || 0),
    upvotes: stats.upvote || 0,
    commentCount: stats.comment || 0,
    tags: tags.map((t) => ({
      name: (t.metadata && t.metadata.name) || '',
      displayName: (t.spec && t.spec.displayName) || ''
    }))
  }
}

module.exports = {
  normalizePostSummary,
  normalizePostDetail
}
