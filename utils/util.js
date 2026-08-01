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

// 严格 SemVer（semver.org 2.0）：x.y.z[-prerelease][+build]
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/

function parseSemver(version) {
  if (typeof version !== 'string') return null
  const m = SEMVER_RE.exec(version.trim())
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split('.') : []
  }
}

// 预发布标识符比较：数字 < 字母；数字按数值，字母按 ASCII
function comparePrerelease(a, b) {
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1 // 无预发布 > 有预发布
  if (b.length === 0) return -1
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i]
    const y = b[i]
    if (x === y) continue
    const xNum = /^\d+$/.test(x)
    const yNum = /^\d+$/.test(y)
    if (xNum && yNum) return Number(x) < Number(y) ? -1 : 1
    if (xNum) return -1
    if (yNum) return 1
    return x < y ? -1 : 1
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1
}

/**
 * 严格 SemVer 比较：a < b => -1；a = b => 0；a > b => 1。
 * 任一非法（非 SemVer 字符串）返回 null，调用方按「忽略该比较」处理。
 */
function compareSemver(a, b) {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa || !pb) return null
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1
  return comparePrerelease(pa.prerelease, pb.prerelease)
}

/**
 * 简单 UUID 生成（仅用于幂等键等业务场景，非安全随机）。
 */
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

module.exports = {
  formatDate,
  formatCount,
  parseSemver,
  compareSemver,
  uuid
}
