/**
 * 通用工具函数
 */

// ISO 时间 => 'MM-dd' / 'yyyy-MM-dd'
function formatDate(isoString, withYear = false) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return withYear ? `${y}-${m}-${d}` : `${m}-${d}`
}

// 大数字缩写：3200 => 3.2k
function formatCount(n) {
  if (!n && n !== 0) return '0'
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

module.exports = {
  formatDate,
  formatCount
}
