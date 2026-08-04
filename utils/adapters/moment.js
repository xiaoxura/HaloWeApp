const { resolveUrl } = require('../asset')
const { htmlToText, preparePostContent } = require('../html')
const { safeResourceName } = require('../resource-name')

/**
 * PluginMoments v1.15+ Public API 数据适配层。
 * 页面只消费 MomentSummary / MomentDetail，不直接依赖插件原始字段。
 */

const SUMMARY_MAX_LENGTH = 160
const MAX_PHOTOS = 9
const KNOWN_MEDIA_TYPES = new Set(['PHOTO', 'VIDEO', 'AUDIO', 'POST'])

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function safeString(value, maxLength = 500) {
  if (typeof value !== 'string') return ''
  return Array.from(value.trim()).slice(0, maxLength).join('')
}

/**
 * Moment 的 POST 媒体通常只有一个外部 permalink。只有插件明确提供文章
 * metadata.name 时才生成内部跳转目标，避免从 slug 或任意 URL 猜测文章资源。
 */
function explicitPostName(item) {
  const post = objectOrEmpty(item.post)
  const target = objectOrEmpty(item.target)
  const candidates = [
    item.postName,
    item.metadataName,
    post.name,
    objectOrEmpty(post.metadata).name,
    target.postName,
    target.name
  ]
  for (const candidate of candidates) {
    const name = safeResourceName(candidate)
    if (name) return name
  }
  return ''
}

function nonNegativeCount(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

function secureAssetUrl(value) {
  if (typeof value !== 'string') return ''
  const raw = value.trim()
  // resolveUrl 会把未知 scheme 当作相对路径；在补全前先拒绝所有非 HTTP(S) scheme。
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:/i.test(raw)) return ''
  const resolved = resolveUrl(value)
  return /^https:\/\//i.test(resolved) ? resolved : ''
}

function formatReleaseTime(value) {
  if (typeof value !== 'string' || !value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeTags(value) {
  if (!Array.isArray(value) && !(value instanceof Set)) return []
  const seen = new Set()
  const tags = []
  Array.from(value).forEach((item) => {
    const tag = safeString(item, 50)
    if (!tag || seen.has(tag) || tags.length >= 20) return
    seen.add(tag)
    tags.push(tag)
  })
  return tags
}

function normalizeMedia(value) {
  if (!Array.isArray(value)) return []
  let photoCount = 0
  return value.reduce((out, raw) => {
    const item = objectOrEmpty(raw)
    const sourceType = safeString(item.type, 32).toUpperCase()
    const known = KNOWN_MEDIA_TYPES.has(sourceType)
    if (sourceType === 'PHOTO') {
      if (photoCount >= MAX_PHOTOS) return out
      photoCount += 1
    }
    const url = secureAssetUrl(item.url)
    const media = {
      type: known ? sourceType : 'UNKNOWN',
      url,
      originType: safeString(item.originType, 100),
      supported: known && !!url,
      sourceType: known ? sourceType : sourceType || 'UNKNOWN'
    }
    // Keep the stable model compact for ordinary media. This optional field is
    // present only when the server supplied a valid, explicit article target.
    if (sourceType === 'POST') {
      const postName = explicitPostName(item)
      if (postName) media.postName = postName
    }
    out.push(media)
    return out
  }, [])
}

function pickMomentHtml(content) {
  const wrapper = objectOrEmpty(content)
  if (typeof wrapper.html === 'string' && wrapper.html.trim()) return wrapper.html
  if (typeof wrapper.raw === 'string' && wrapper.raw.trim()) return wrapper.raw
  return ''
}

function isPublicMoment(item) {
  const it = objectOrEmpty(item)
  const metadata = objectOrEmpty(it.metadata)
  const spec = objectOrEmpty(it.spec)
  return (
    !metadata.deletionTimestamp &&
    spec.deleted !== true &&
    spec.visible === 'PUBLIC' &&
    spec.approved === true &&
    !!safeResourceName(metadata.name)
  )
}

function normalizeMomentSummary(item) {
  const it = objectOrEmpty(item)
  const metadata = objectOrEmpty(it.metadata)
  const spec = objectOrEmpty(it.spec)
  const content = objectOrEmpty(spec.content)
  const owner = objectOrEmpty(it.owner)
  const stats = objectOrEmpty(it.stats)
  const fullText = htmlToText(pickMomentHtml(content))
  const characters = Array.from(fullText)
  const hasMoreContent = characters.length > SUMMARY_MAX_LENGTH

  return {
    name: safeResourceName(metadata.name),
    text: hasMoreContent
      ? `${characters.slice(0, SUMMARY_MAX_LENGTH).join('').trimEnd()}…`
      : fullText,
    owner: {
      name: safeString(owner.name || spec.owner, 128),
      displayName: safeString(owner.displayName, 100) || '博主',
      avatar: secureAssetUrl(owner.avatar)
    },
    releaseTime: formatReleaseTime(spec.releaseTime || metadata.creationTimestamp),
    tags: normalizeTags(spec.tags),
    media: normalizeMedia(content.medium),
    stats: {
      upvote: nonNegativeCount(stats.upvote),
      approvedComment: nonNegativeCount(stats.approvedComment)
    },
    hasMoreContent
  }
}

function normalizeMomentDetail(item) {
  if (!isPublicMoment(item)) return null
  const it = objectOrEmpty(item)
  const spec = objectOrEmpty(it.spec)
  const rawHtml = pickMomentHtml(spec.content)
  return {
    ...normalizeMomentSummary(it),
    html: preparePostContent(rawHtml),
    contentEmpty: !htmlToText(rawHtml) && normalizeMedia(objectOrEmpty(spec.content).medium).length === 0
  }
}

function normalizeMomentList(response) {
  const res = objectOrEmpty(response)
  const rawItems = Array.isArray(res.items) ? res.items : []
  const moments = rawItems.filter(isPublicMoment).map(normalizeMomentSummary)
  const page = Number.isInteger(res.page) && res.page > 0 ? res.page : 1
  const size = Number.isInteger(res.size) && res.size > 0 ? res.size : rawItems.length || 20
  const total = Number.isFinite(res.total) && res.total >= 0 ? Math.floor(res.total) : moments.length
  const hasNext = typeof res.hasNext === 'boolean' ? res.hasNext : page * size < total
  return { moments, page, size, total, hasNext }
}

module.exports = {
  SUMMARY_MAX_LENGTH,
  MAX_PHOTOS,
  KNOWN_MEDIA_TYPES,
  safeMomentName: safeResourceName,
  safeResourceName,
  secureAssetUrl,
  normalizeMedia,
  isPublicMoment,
  normalizeMomentSummary,
  normalizeMomentDetail,
  normalizeMomentList
}
