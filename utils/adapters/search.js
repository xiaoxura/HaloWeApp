const { formatDate } = require('../util')

/**
 * 搜索结果适配层。
 * 搜索 API（POST /apis/api.halo.run/v1alpha1/indices/-/search）的响应结构
 * 与文章列表不同：{ hits, total, keyword, limit }，命中字段内嵌 <B> 高亮标记。
 */

// 只识别服务端约定的 <B> / </B> 高亮标记（大小写不敏感）；
// 其他一切字符（包括其他 HTML 标签）按纯文本处理，由 WXML 插值自动转义。
const B_TAG = /<(\/?)B>/gi

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
  return {
    metadataName: h.metadataName || '',
    titleSegments: parseHighlight(h.title),
    descSegments: parseHighlight(h.description || h.content),
    updateTime: formatDate(h.updateTimestamp || h.creationTimestamp, true),
    permalink: h.permalink || ''
  }
}

/**
 * 搜索响应 => SearchResult。
 * 仅保留已发布的文章命中（过滤回收站、非文章类型）。
 */
function normalizeSearchResult(res) {
  const r = res && typeof res === 'object' ? res : {}
  const hits = Array.isArray(r.hits) ? r.hits : []
  const items = hits
    .filter(
      (h) =>
        h &&
        h.metadataName &&
        h.type === 'post.content.halo.run' &&
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
  parseHighlight,
  normalizeSearchHit,
  normalizeSearchResult
}
