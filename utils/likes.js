/**
 * Post / Moment 点赞状态本地持久化。
 *
 * 清理策略：最多保留 MAX_ENTRIES 条，超出时按写入时间淘汰最旧记录（LRU）。
 * 记录只用于交互反馈（防止重复点赞的提示），不与服务端计数强一致。
 */

const { safeResourceName } = require('./resource-name')

const KEY = 'upvotedPosts'
const MAX_ENTRIES = 500
const SUBJECT_KINDS = new Set(['post', 'moment'])

function readAll() {
  try {
    const data = wx.getStorageSync(KEY)
    return data && typeof data === 'object' ? data : {}
  } catch (e) {
    return {}
  }
}

function writeAll(all) {
  try {
    wx.setStorageSync(KEY, all)
  } catch (e) {
    // 存储失败不影响本次交互
  }
}

function subjectKey(kind, name) {
  const safeName = safeResourceName(name)
  if (!SUBJECT_KINDS.has(kind) || !safeName) return ''
  return `${kind}:${safeName}`
}

function isUpvotedSubject(kind, name) {
  const key = subjectKey(kind, name)
  if (!key) return false
  const all = readAll()
  if (all[key]) return true

  // v0.3.0 旧 Post key 为裸 metadata.name：首次读取时原地迁移，Moment 永不读取裸 key。
  const safeName = safeResourceName(name)
  if (kind === 'post' && safeName && all[safeName]) {
    all[key] = all[safeName]
    delete all[safeName]
    writeAll(all)
    return true
  }
  return false
}

function markUpvotedSubject(kind, name) {
  const key = subjectKey(kind, name)
  if (!key) return
  const all = readAll()
  all[key] = Date.now()
  const names = Object.keys(all)
  if (names.length > MAX_ENTRIES) {
    names
      .sort((a, b) => all[a] - all[b])
      .slice(0, names.length - MAX_ENTRIES)
      .forEach((n) => delete all[n])
  }
  writeAll(all)
}

function isUpvoted(name) {
  return isUpvotedSubject('post', name)
}

function markUpvoted(name) {
  markUpvotedSubject('post', name)
}

module.exports = {
  isUpvoted,
  markUpvoted,
  isUpvotedSubject,
  markUpvotedSubject,
  subjectKey,
  KEY,
  MAX_ENTRIES
}
