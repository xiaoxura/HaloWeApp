/**
 * 点赞状态本地持久化（按文章 metadata.name）。
 *
 * 清理策略：最多保留 MAX_ENTRIES 条，超出时按写入时间淘汰最旧记录（LRU）。
 * 记录只用于交互反馈（防止重复点赞的提示），不与服务端计数强一致。
 */

const KEY = 'upvotedPosts'
const MAX_ENTRIES = 500

function readAll() {
  try {
    const data = wx.getStorageSync(KEY)
    return data && typeof data === 'object' ? data : {}
  } catch (e) {
    return {}
  }
}

function isUpvoted(name) {
  if (!name) return false
  return Boolean(readAll()[name])
}

function markUpvoted(name) {
  if (!name) return
  const all = readAll()
  all[name] = Date.now()
  const names = Object.keys(all)
  if (names.length > MAX_ENTRIES) {
    names
      .sort((a, b) => all[a] - all[b])
      .slice(0, names.length - MAX_ENTRIES)
      .forEach((n) => delete all[n])
  }
  try {
    wx.setStorageSync(KEY, all)
  } catch (e) {
    // 存储失败不影响本次交互
  }
}

module.exports = {
  isUpvoted,
  markUpvoted
}
