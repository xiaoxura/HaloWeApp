const { formatDate } = require('../util')

/**
 * 搜索结果适配层。
 * 搜索 API（POST /apis/api.halo.run/v1alpha1/indices/-/search）的响应结构
 * 与文章列表不同：{ hits, total, keyword, limit }，命中字段内嵌 <B> 高亮标记。
 */

// 只识别服务端约定的 <B> / </B> 高亮标记（大小写不敏感）；
// 其他一切字符（包括其他 HTML 标签）按纯文本处理，由 WXML 插值自动转义。
const B_TAG = /<(\/?)B>/gi
const POST_TYPE = 'post.content.halo.run'
const MOMENT_TYPE = 'moment.moment.halo.run'

/**
 * 将含 <B> 标记的文本解析为受控高亮片段。
 * @param {string} text
 * @returns {Array<{ text: string, highlight: boolean }>}
 */
function parseHighlight(text) {
  const input = typeof text === 'string' ? text : ''
  if (!input) return []
  const segments = []
  let highlight = false
  let lastIndex = 0
  B_TAG.lastIndex = 0
  let match
  while ((match = B_TAG.exec(input)) !== null) {
    if (match.index > lastIndex) {
      pushSegment(segments, input.slice(lastIndex, match.index), highlight)
    }
    highlight = !match[1] // <B> 开启，</B> 关闭
    lastIndex = B_TAG.lastIndex
  }
  if (lastIndex < input.length) {
    pushSegment(segments, input.slice(lastIndex), highlight)
  }
  return segments
}

function pushSegment(segments, text, highlight) {
  if (!text) return
  const last = segments[segments.length - 1]
  if (last && last.highlight === highlight) {
    last.text += text
  } else {
    segments.push({ text, highlight })
  }
}

/**
 * 单条搜索命中 => SearchHit
 * 页面通过 metadataName 进入文章详情。
 */
function normalizeSearchHit(hit) {
  const h = hit && typeof hit === 'object' ? hit : {}
  const kind = h.type === MOMENT_TYPE ? 'moment' : 'post'
  // Moment 索引的 title 通常是“发表于…… by ……”的生成文本，不适合作为内容标题。
  // 优先展示正文摘要；文章仍沿用文章标题和摘要。
  const title = kind === 'moment' ? h.description || h.content || '瞬间' : h.title
  const description = kind === 'moment' ? '' : h.description || h.content
  return {
    metadataName: h.metadataName || '',
    kind,
    titleSegments: parseHighlight(title),
    descSegments: parseHighlight(description),
    updateTime: formatDate(h.updateTimestamp || h.creationTimestamp, true),
    permalink: h.permalink || ''
  }
}

/**
 * 搜索响应 => SearchResult。
 * 仅保留已发布、未回收的文章，以及调用方明确允许时的 Moment 命中。
 * Moment 是可选插件，默认不开放，避免旧调用方或陈旧索引制造详情死链。
 */
function normalizeSearchResult(res, options = {}) {
  const r = res && typeof res === 'object' ? res : {}
  const hits = Array.isArray(r.hits) ? r.hits : []
  const includeMoments = options && options.includeMoments === true
  const items = hits
    .filter(
      (h) =>
        h &&
        h.metadataName &&
        (h.type === POST_TYPE || (includeMoments && h.type === MOMENT_TYPE)) &&
        h.published !== false &&
        h.recycled !== true
    )
    .map(normalizeSearchHit)

  return {
    total: typeof r.total === 'number' ? r.total : items.length,
    keyword: r.keyword || '',
    items
  }
}

module.exports = {
  POST_TYPE,
  MOMENT_TYPE,
  parseHighlight,
  normalizeSearchHit,
  normalizeSearchResult
}
