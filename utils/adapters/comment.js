const { resolveUrl } = require('../asset')
const { decodeEntities } = require('../html')
const { formatDate } = require('../util')

/**
 * 评论数据适配层。
 * 页面只消费这里产出的内部模型（CommentView / ReplyView），
 * 兼容 Halo 2.25 的分页 replies 对象与旧版本的 replies 数组（C-01），
 * 评论 HTML 统一转为安全纯文本展示（C-02），不使用富文本渲染用户输入。
 */

/**
 * 评论 HTML => 安全纯文本：
 * - 移除 script / iframe / style 标签及其内容（不可见内容不进入文本）
 * - <br> 与块级标签（p / div / li）转为换行
 * - 其余标签全部剥离（事件属性随标签一并消失）
 * - 解码常见 HTML 实体（单遍，不二次解码）
 */
function htmlToText(html) {
  if (!html || typeof html !== 'string') return ''
  return (
    html
      .replace(/<(script|iframe|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<(script|iframe|style)\b[^>]*\/?>/gi, '')
      .replace(/<br\b[^>]*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|blockquote|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => decodeEntities(line).trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/**
 * 回复对象 => ReplyView
 * quoteReply 为被引用回复的嵌套对象（Halo 2.25），缺失时安全降级。
 */
function normalizeReply(item) {
  const it = item && typeof item === 'object' ? item : {}
  const spec = it.spec || {}
  const owner = it.owner || {}
  const quote = it.quoteReply && typeof it.quoteReply === 'object' ? it.quoteReply : null

  return {
    name: (it.metadata && it.metadata.name) || '',
    author: owner.displayName || '访客',
    avatar: resolveUrl(owner.avatar),
    content: htmlToText(spec.content || spec.raw || ''),
    time: formatDate(spec.creationTime, true),
    quoteName: (quote && quote.metadata && quote.metadata.name) || '',
    quoteAuthor: (quote && quote.owner && quote.owner.displayName) || '',
    quoteContent: quote ? htmlToText((quote.spec && quote.spec.content) || '') : ''
  }
}

/**
 * 兼容两类 replies 结构（C-01）：
 * - Halo 2.25：分页对象 { items, hasNext, total, ... }
 * - 旧版本：数组 [...]（无法分页，视为无更多）
 */
function parseReplies(replies) {
  if (Array.isArray(replies)) {
    return { items: replies, hasNext: false, total: replies.length }
  }
  if (replies && typeof replies === 'object') {
    const items = Array.isArray(replies.items) ? replies.items : []
    const total = typeof replies.total === 'number' ? replies.total : items.length
    return { items, hasNext: !!replies.hasNext, total }
  }
  return { items: [], hasNext: false, total: 0 }
}

/**
 * 评论对象 => CommentView
 * 缺失 owner / spec / replies 时安全降级，不允许抛错。
 */
function normalizeComment(item) {
  const it = item && typeof item === 'object' ? item : {}
  const spec = it.spec || {}
  const owner = it.owner || {}
  const status = it.status || {}
  const stats = it.stats || {}
  const replies = parseReplies(it.replies)

  // 回复数量：优先服务端可见计数，其次分页对象 total，最后为首屏长度
  let replyCount = 0
  if (typeof status.visibleReplyCount === 'number') replyCount = status.visibleReplyCount
  else if (typeof status.replyCount === 'number') replyCount = status.replyCount
  else replyCount = replies.total

  return {
    name: (it.metadata && it.metadata.name) || '',
    author: owner.displayName || '访客',
    avatar: resolveUrl(owner.avatar),
    content: htmlToText(spec.content || spec.raw || ''),
    time: formatDate(spec.creationTime, true),
    approved: !!spec.approved,
    top: !!spec.top,
    upvotes: typeof stats.upvote === 'number' ? stats.upvote : 0,
    replyCount,
    replyHasNext: replies.hasNext,
    replies: replies.items.map(normalizeReply)
  }
}

/**
 * 评论列表响应 => { comments, page, total, hasNext }
 * 供分页状态机消费；非法响应按空列表处理。
 */
function normalizeCommentList(res) {
  const it = res && typeof res === 'object' ? res : {}
  const items = Array.isArray(it.items) ? it.items : []
  return {
    comments: items.map(normalizeComment),
    page: typeof it.page === 'number' ? it.page : 1,
    total: typeof it.total === 'number' ? it.total : items.length,
    hasNext: !!it.hasNext
  }
}

/**
 * 回复列表响应（GET comments/{name}/reply）=> { replies, page, total, hasNext }
 */
function normalizeReplyList(res) {
  const it = res && typeof res === 'object' ? res : {}
  const items = Array.isArray(it.items) ? it.items : []
  return {
    replies: items.map(normalizeReply),
    page: typeof it.page === 'number' ? it.page : 1,
    total: typeof it.total === 'number' ? it.total : items.length,
    hasNext: !!it.hasNext
  }
}

module.exports = {
  htmlToText,
  normalizeReply,
  normalizeComment,
  normalizeCommentList,
  normalizeReplyList
}
