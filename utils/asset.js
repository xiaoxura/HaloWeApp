const config = require('../config/index')

/**
 * 相对资源 URL 补全。
 * Halo 返回的头像、封面、正文图片可能是 `/upload/...` 相对地址，
 * 小程序 image 组件无法直接加载，需要补齐站点域名。
 *
 * 规则：
 * - 空值 => ''
 * - http(s)://、data:、wxfile:、blob: 等已完成地址 => 原样返回
 * - //cdn.x.com/... 协议相对地址 => 补 https:
 * - /upload/... => baseUrl + 路径
 * - 其他相对路径（upload/...） => baseUrl + '/' + 路径
 */
function resolveUrl(url) {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (/^(https?:)?\/\//i.test(trimmed)) {
    return trimmed.startsWith('//') ? `https:${trimmed}` : trimmed
  }
  if (/^(data:|wxfile:|blob:|file:)/i.test(trimmed)) return trimmed
  const base = (config.baseUrl || '').replace(/\/+$/, '')
  if (!base) return trimmed
  return trimmed.startsWith('/') ? `${base}${trimmed}` : `${base}/${trimmed}`
}

/**
 * 批量补全 HTML 字符串中的相对图片地址（<img src="/...">）。
 * 仅处理 src 属性，其他协议地址不受影响。
 */
function resolveHtmlAssets(html) {
  if (!html || typeof html !== 'string') return ''
  return html.replace(/(<img\b[^>]*?\bsrc=)(["'])([^"']*)\2/gi, (match, prefix, quote, src) => {
    return `${prefix}${quote}${resolveUrl(src)}${quote}`
  })
}

module.exports = {
  resolveUrl,
  resolveHtmlAssets
}
