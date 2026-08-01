/**
 * 搜索历史记录。
 *
 * - 本地存储，最多 MAX_ENTRIES 条；
 * - 重复搜索同一关键词时提升到最新（LRU）；
 * - 支持逐条复用与一键清除。
 * 存储通过参数注入，便于单元测试。
 */

const KEY = 'searchHistory'
const MAX_ENTRIES = 10

function getHistory(storage) {
  try {
    const list = storage.get(KEY)
    return Array.isArray(list) ? list.filter((k) => typeof k === 'string' && k) : []
  } catch (e) {
    return []
  }
}

function addHistory(storage, keyword) {
  const kw = (keyword || '').trim()
  if (!kw) return getHistory(storage)
  const list = getHistory(storage).filter((k) => k !== kw)
  list.unshift(kw)
  const trimmed = list.slice(0, MAX_ENTRIES)
  try {
    storage.set(KEY, trimmed)
  } catch (e) {
    // 存储失败不影响搜索
  }
  return trimmed
}

function clearHistory(storage) {
  try {
    storage.set(KEY, [])
  } catch (e) {
    // ignore
  }
  return []
}

module.exports = {
  KEY,
  MAX_ENTRIES,
  getHistory,
  addHistory,
  clearHistory
}
