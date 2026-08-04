const config = require('../config/index')

/**
 * 相对资源 URL 补全。
 * Halo 返回的头像、封面、正文图片可能是 `/upload/...` 相对地址，
 * 小程序 image 组件无法直接加载，需要补齐站点域名。
 *
 * 规则：
 * - 空值 => ''
 * - https:// 已完成地址 => 原样返回
 * - //cdn.x.com/... 协议相对地址 => 补 https:
 * - /upload/... => baseUrl + 路径
 * - 其他相对路径（upload/...） => baseUrl + '/' + 路径
 * - http://、data:、wxfile:、blob:、file: 及其他 scheme => 拒绝
 */
function resolveUrl(url) {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (/^https:\/\//i.test(trimmed)) return trimmed
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`
  // Never reinterpret an explicit scheme (including javascript:, data:, file:)
  // as a relative path.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return ''
  const base = (config.baseUrl || '').replace(/\/+$/, '')
  if (!/^https:\/\//i.test(base)) return ''
  const resolved = trimmed.startsWith('/') ? `${base}${trimmed}` : `${base}/${trimmed}`
  return /^https:\/\//i.test(resolved) ? resolved : ''
}

/**
 * 批量补全 HTML 字符串中的相对图片地址（<img src="/...">）。
 * 仅处理 src 属性，其他协议地址不受影响。
 */
function resolveHtmlAssets(html) {
  if (!html || typeof html !== 'string') return ''
  return html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (match, prefix, doubleQuoted, singleQuoted, bare) => {
      const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : ''
      const src = doubleQuoted !== undefined
        ? doubleQuoted
        : singleQuoted !== undefined
          ? singleQuoted
          : bare
      const resolved = resolveUrl(src)
      return quote ? `${prefix}${quote}${resolved}${quote}` : `${prefix}${resolved}`
    }
  )
}

module.exports = {
  resolveUrl,
  resolveHtmlAssets
}
