const { resolveHtmlAssets } = require('./asset')

/**
 * 正文 HTML 处理：字段选择、安全清理与自定义标签降级。
 *
 * 页面只应使用 preparePostContent 的产物，不再直接读取 Halo 原始字段。
 */

// 正文字段兼容顺序（B-01）：
// Halo 2.x 详情实际返回 content.content（渲染后 HTML）与 content.raw（编辑器原始内容），
// 部分版本/插件使用 content.html。raw 可能是 Markdown 源，仅作为最后兜底。
const CONTENT_KEYS = ['content', 'html', 'raw']

/**
 * 从详情响应的 content 包装对象中选出可渲染正文。
 * @param {object} contentWrapper 详情响应的 content 字段
 * @returns {string} 正文 HTML（可能为空字符串）
 */
function pickContent(contentWrapper) {
  if (typeof contentWrapper === 'string') return contentWrapper
  if (!contentWrapper || typeof contentWrapper !== 'object') return ''
  for (const key of CONTENT_KEYS) {
    const value = contentWrapper[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

/**
 * 安全清理：
 * - 移除 script / iframe / style 标签及其内容（主题常注入全局 <style class="pjax">）
 * - 移除 on* 事件属性
 * - 移除 javascript: 协议链接
 */
function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return ''
  return (
    html
      // 成对出现的危险标签，连同内容一起移除
      .replace(/<(script|iframe|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      // 自闭合/单标签形式
      .replace(/<(script|iframe|style)\b[^>]*\/?>/gi, '')
      // 事件属性 onxxx="..." / onxxx='...' / onxxx=xxx
      .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      // javascript: 协议
      .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=$2#$2')
  )
}

/**
 * 自定义标签降级：
 * Halo 主题/编辑器插件生成的自定义标签无法被渲染器识别，统一降级处理：
 * - <shiki-code>：降级为带语义的 div，保留内部 <pre><code> 结构
 * - <hyperlink-card>：降级为链接卡片（浅灰底 + 链接图标 + 可换行 URL）
 */
const CUSTOM_TAGS = ['shiki-code']

// 链接卡片的内联样式与图标（mp-html 仅支持标签级样式与内联样式，类选择器不生效）
// data URI 中的空格与引号全部百分号编码，url() 可不带引号，避免与 style 属性定界符冲突
const LINK_ICON =
  'data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%231e80ff%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27M10%2013a5%205%200%200%200%207.54.54l3-3a5%205%200%200%200-7.07-7.07l-1.72%201.71%27/%3E%3Cpath%20d=%27M14%2011a5%205%200%200%200-7.54-.54l-3%203a5%205%200%200%200%207.07%207.07l1.71-1.71%27/%3E%3C/svg%3E'
const HYPERLINK_CARD_STYLE =
  'display:block;margin:24rpx 0;padding:20rpx 24rpx 20rpx 72rpx;' +
  'background-color:#f7f8fa;border-radius:16rpx;font-size:26rpx;line-height:1.6;word-break:break-all;' +
  `background-image:url(${LINK_ICON});background-repeat:no-repeat;` +
  'background-position:22rpx center;background-size:28rpx 28rpx;'

function downgradeCustomTags(html) {
  if (!html || typeof html !== 'string') return ''
  let out = html
  CUSTOM_TAGS.forEach((tag) => {
    out = out
      .replace(new RegExp(`<${tag}\\b([^>]*)>`, 'gi'), `<div class="${tag}"$1>`)
      .replace(new RegExp(`</${tag}\\s*>`, 'gi'), '</div>')
  })
  // hyperlink-card 降级为链接卡片
  out = out
    .replace(/<hyperlink-card\b[^>]*>/gi, `<div style="${HYPERLINK_CARD_STYLE}">`)
    .replace(/<\/hyperlink-card\s*>/gi, '</div>')
  return out
}

/**
 * 排版兼容处理：
 * - pre 代码块：包裹相对定位容器，注入横向滚动内联样式与右上角复制按钮
 *   （按钮为 copy://索引 锚点，页面 linktap 拦截后复制对应代码文本）
 * - table：包裹可横向滚动的容器
 */
const CODE_BLOCK_STYLE =
  'display:block;white-space:pre;overflow-x:auto;max-width:100%;margin:0;' +
  'padding:24rpx;padding-top:70rpx;background:#282c34;color:#abb2bf;border-radius:20rpx;' +
  'font-size:24rpx;line-height:1.7;font-family:Consolas,Menlo,monospace;'

const COPY_BTN_STYLE =
  'position:absolute;top:12rpx;right:12rpx;font-size:20rpx;line-height:1.5;' +
  'color:rgba(255,255,255,0.85);background:rgba(255,255,255,0.14);' +
  'padding:6rpx 18rpx;border-radius:8rpx;text-decoration:none;'

// 给 pre 注入内联样式（保留已有 style）
function injectPreStyle(attrs, inner) {
  if (/\bstyle\s*=\s*"/i.test(attrs)) {
    return `<pre${attrs.replace(/style\s*=\s*"/i, `style="${CODE_BLOCK_STYLE}`)}>${inner}</pre>`
  }
  if (/\bstyle\s*=\s*'/i.test(attrs)) {
    return `<pre${attrs.replace(/style\s*=\s*'/i, `style='${CODE_BLOCK_STYLE}`)}>${inner}</pre>`
  }
  return `<pre${attrs} style="${CODE_BLOCK_STYLE}">${inner}</pre>`
}

function applyLayoutFixes(html) {
  if (!html || typeof html !== 'string') return ''
  let out = html
  let codeIndex = 0
  out = out.replace(/<pre\b([^>]*?)>([\s\S]*?)<\/pre\s*>/gi, (match, attrs, inner) => {
    const btn = `<a href="copy://${codeIndex}" style="${COPY_BTN_STYLE}">复制</a>`
    codeIndex += 1
    return `<div style="position:relative;margin:24rpx 0;">${injectPreStyle(attrs, inner)}${btn}</div>`
  })
  // table 外层包裹滚动容器
  out = out.replace(
    /<table\b[\s\S]*?<\/table\s*>/gi,
    (match) =>
      `<div style="overflow-x:auto;max-width:100%;margin:24rpx 0;">${match}</div>`
  )
  return out
}

// ===== 代码文本提取（与渲染共用同一 HTML，索引与 copy://N 一一对应） =====

const HTML_ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', '#39': "'", nbsp: ' ' }

// 单遍解码：'&amp;lt;' 只解为 '&lt;'，不会二次解码
function decodeEntities(text) {
  return text.replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (m, name) => HTML_ENTITIES[name] || m)
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, '')
}

/**
 * 按文档顺序提取所有 pre 代码块的纯文本（用于复制）。
 */
function extractCodeBlocks(html) {
  if (!html || typeof html !== 'string') return []
  const blocks = []
  const re = /<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi
  let match
  while ((match = re.exec(html))) {
    blocks.push(decodeEntities(stripTags(match[1])))
  }
  return blocks
}

/**
 * 详情正文完整处理管线：
 * 安全清理 => 自定义标签降级 => 排版修复 => 相对资源补全
 */
function preparePostContent(html) {
  return [sanitizeHtml, downgradeCustomTags, applyLayoutFixes, resolveHtmlAssets].reduce(
    (acc, fn) => fn(acc),
    html || ''
  )
}

module.exports = {
  CONTENT_KEYS,
  pickContent,
  sanitizeHtml,
  downgradeCustomTags,
  applyLayoutFixes,
  decodeEntities,
  extractCodeBlocks,
  preparePostContent
}
