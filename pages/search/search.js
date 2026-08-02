const api = require('../../utils/api')
const { MOMENT_TYPE, normalizeSearchResult } = require('../../utils/adapters/search')
const { pluginCapabilities } = require('../../utils/plugin-capabilities')
const historyStore = require('../../utils/search-history')

const SEARCH_LIMIT = 20
const app = getApp()

// 页面级存储适配（search-history 模块本身不依赖 wx，便于测试）
const storage = {
  get: (key) => wx.getStorageSync(key),
  set: (key, value) => wx.setStorageSync(key, value)
}

Page({
  data: {
    keyword: '',
    history: [],
    // 页面状态：idle（历史/初始）| searching | done | empty | error
    status: 'idle',
    results: [],
    total: 0,
    searchedKeyword: ''
  },

  onLoad() {
    this.setData({ history: historyStore.getHistory(storage) })
    this._searchSeq = 0
    this._unloaded = false
  },

  onUnload() {
    this._unloaded = true
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onClearInput() {
    this.setData({ keyword: '', status: 'idle', results: [], total: 0 })
  },

  // 提交搜索（按钮/键盘 search 事件共用）
  async onSearch() {
    const keyword = this.data.keyword.trim()
    // 空白关键词不请求接口
    if (!keyword) return
    // 请求进行中忽略重复提交（含同一关键词并发）
    if (this.data.status === 'searching') return

    const seq = ++this._searchSeq
    this.setData({ status: 'searching', searchedKeyword: keyword })

    try {
      // 搜索请求立即开始；仅当响应真的包含 Moment 命中时才等待可选插件能力探测，
      // 文章-only 搜索不被 PluginMoments 的网络状态拖慢。
      const res = await api.search(keyword, SEARCH_LIMIT)
      let includeMoments = false
      const hasMomentHit =
        res && Array.isArray(res.hits) && res.hits.some((hit) => hit && hit.type === MOMENT_TYPE)
      if (hasMomentHit) {
        await app.runtimeReady()
        if (app.runtimeConfig.canReadMoments()) {
          includeMoments = await pluginCapabilities.momentsAvailable()
        }
      }
      // 只处理最后一次提交的响应；页面卸载后不再 setData
      if (seq !== this._searchSeq || this._unloaded) return
      const { items, total } = normalizeSearchResult(res, { includeMoments })
      this.setData({
        status: items.length ? 'done' : 'empty',
        results: items,
        total,
        history: historyStore.addHistory(storage, keyword)
      })
    } catch (err) {
      if (seq !== this._searchSeq || this._unloaded) return
      console.error('搜索失败', err.type || '', err.statusCode || '')
      this.setData({ status: 'error', results: [], total: 0 })
    }
  },

  // 点击历史记录：复用关键词并搜索
  onHistoryTap(e) {
    const { keyword } = e.currentTarget.dataset
    this.setData({ keyword }, () => this.onSearch())
  },

  onClearHistory() {
    this.setData({ history: historyStore.clearHistory(storage) })
  },

  goDetail(e) {
    const { name, kind } = e.currentTarget.dataset
    const page = kind === 'moment' ? 'moment-detail/moment-detail' : 'post-detail/post-detail'
    wx.navigateTo({ url: `/pages/${page}?name=${encodeURIComponent(name)}` })
  }
})
