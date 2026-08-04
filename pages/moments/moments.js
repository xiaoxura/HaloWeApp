const api = require('../../utils/api')
const { normalizeMomentList } = require('../../utils/adapters/moment')
const { pluginCapabilities } = require('../../utils/plugin-capabilities')
const { mergeMomentsByName, buildMomentListParams } = require('../../utils/moment-list')
const { momentMediaSession } = require('../../utils/moment-media-session')
const { decodeRouteParam } = require('../../utils/route')

const app = getApp()
const PAGE_SIZE = 20

Page({
  data: {
    moments: [],
    selectedTag: '',
    page: 1,
    hasMore: true,
    loading: false,
    status: 'loading', // loading | ready | empty | unavailable | error
    showBackTop: false
  },

  onLoad(options) {
    this._unloaded = false
    this._available = false
    this._querySequence = 0
    this._loadPromise = null
    const selectedTag = decodeRouteParam(options && options.tag, 50)
    this.setData({ selectedTag })
    this.checkCapabilityAndLoad()
  },

  onHide() {
    momentMediaSession.destroy()
  },

  onUnload() {
    this._unloaded = true
    this._querySequence += 1
    momentMediaSession.destroy()
  },

  async checkCapabilityAndLoad() {
    const sequence = ++this._querySequence
    this._available = false
    this.setData({ loading: true, status: 'loading' })
    try {
      await app.runtimeReady()
      if (this._unloaded || sequence !== this._querySequence) return
      if (!app.runtimeConfig.canReadMoments()) {
        this.setData({ loading: false, status: 'unavailable', moments: [] })
        return
      }
      const available = await pluginCapabilities.momentsAvailable()
      if (this._unloaded || sequence !== this._querySequence) return
      if (!available) {
        this.setData({ loading: false, status: 'unavailable', moments: [] })
        return
      }
      this._available = true
      this.setData({ loading: false })
      await this.fetchMoments(true, sequence)
    } catch (err) {
      if (this._unloaded || sequence !== this._querySequence) return
      this.setData({ loading: false, status: 'error' })
    }
  },

  fetchMoments(refresh, sequence = this._querySequence) {
    if (!this._available || this._unloaded) return Promise.resolve()
    if (this._loadPromise) return this._loadPromise
    const page = refresh ? 1 : this.data.page
    const tag = this.data.selectedTag
    this.setData({ loading: true, status: refresh && !this.data.moments.length ? 'loading' : this.data.status })

    const request = (async () => {
      try {
        const response = await api.getMomentList(buildMomentListParams(page, PAGE_SIZE, tag))
        if (this._unloaded || sequence !== this._querySequence) return
        const normalized = normalizeMomentList(response)
        const moments = refresh
          ? mergeMomentsByName([], normalized.moments)
          : mergeMomentsByName(this.data.moments, normalized.moments)
        this.setData({
          moments,
          page: page + 1,
          hasMore: normalized.hasNext,
          status: moments.length ? 'ready' : 'empty'
        })
      } catch (err) {
        if (this._unloaded || sequence !== this._querySequence) return
        console.error('加载瞬间失败', err.type || '', err.statusCode || '')
        if (!this.data.moments.length) {
          this.setData({ status: 'error' })
        } else {
          this.setData({ status: 'ready' })
          wx.showToast({ title: '加载失败，已保留现有内容', icon: 'none' })
        }
      } finally {
        if (!this._unloaded && sequence === this._querySequence) this.setData({ loading: false })
      }
    })()

    this._loadPromise = request
    return request.finally(() => {
      if (this._loadPromise === request) this._loadPromise = null
    })
  },

  onPullDownRefresh() {
    const task = this._available ? this.fetchMoments(true) : this.checkCapabilityAndLoad()
    Promise.resolve(task).finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading && this.data.status === 'ready') {
      this.fetchMoments(false)
    }
  },

  onPageScroll(e) {
    const show = e.scrollTop > 600
    if (show !== this.data.showBackTop) this.setData({ showBackTop: show })
  },

  backTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 300 })
  },

  async changeTag(tag) {
    const next = typeof tag === 'string' ? tag.trim().slice(0, 50) : ''
    if (next === this.data.selectedTag) return
    const sequence = ++this._querySequence
    momentMediaSession.stopAll()
    this.setData({
      selectedTag: next,
      moments: [],
      page: 1,
      hasMore: true,
      status: 'loading'
    })
    if (this._loadPromise) await this._loadPromise.catch(() => {})
    if (this._unloaded || sequence !== this._querySequence) return
    this._loadPromise = null
    // 标签切换可能发生在首次能力探测期间；此时还没有可用状态，重新走探测流程，
    // 避免 fetchMoments 的 fail-closed 短路把页面永久留在 loading。
    if (!this._available) {
      await this.checkCapabilityAndLoad()
      return
    }
    await this.fetchMoments(true, sequence)
  },

  selectTag(e) {
    this.changeTag(e.detail && e.detail.tag)
  },

  clearTag() {
    this.changeTag('')
  },

  goDetail(e) {
    const name = e.detail && e.detail.name
    if (!name) return
    wx.navigateTo({ url: `/pages/moment-detail/moment-detail?name=${encodeURIComponent(name)}` })
  },

  goPostDetail(e) {
    const name = e.detail && e.detail.name
    if (!name) return
    wx.navigateTo({ url: `/pages/post-detail/post-detail?name=${encodeURIComponent(name)}` })
  },

  retry() {
    if (this._available) this.fetchMoments(true)
    else this.checkCapabilityAndLoad()
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  onShareAppMessage() {
    const tag = this.data.selectedTag
    return {
      title: tag ? `#${tag} 的公开瞬间` : '最新公开瞬间',
      path: tag ? `/pages/moments/moments?tag=${encodeURIComponent(tag)}` : '/pages/moments/moments'
    }
  }
})
