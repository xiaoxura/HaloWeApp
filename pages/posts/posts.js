const api = require('../../utils/api')
const { normalizePostSummary } = require('../../utils/adapters/post')

const app = getApp()

Page({
  data: {
    type: '',      // category | tag
    name: '',
    postList: [],
    page: 1,
    hasMore: true,
    loading: false,
    loadFailed: false,
    paramInvalid: false,
    showBackTop: false
  },

  onLoad(options) {
    const type = options && options.type
    const name = options && options.name ? decodeURIComponent(options.name) : ''
    // 参数合法性检查：类型或名称缺失/非法时进入独立错误态
    if ((type !== 'category' && type !== 'tag') || !name) {
      wx.setNavigationBarTitle({ title: '文章列表' })
      this.setData({ paramInvalid: true })
      return
    }
    const title = decodeURIComponent(options.title || '文章列表')
    wx.setNavigationBarTitle({ title })
    this._unloaded = false
    this.setData({ type, name })
    // 首屏使用内置默认值/有效缓存，不等待配置网络请求；若首次实时配置的分页大小
    // 不同，则在首屏请求结束后自动重载，避免本次页面一直沿用默认 pageSize。
    const initialLoad = this.fetchPosts(true)
    app.runtimeReady().then(async (runtime) => {
      if (this._unloaded || this._pageSize === runtime.site.pageSize) return
      await initialLoad
      if (this._unloaded) return
      this._pageSize = runtime.site.pageSize
      await this.fetchPosts(true)
    })
  },

  onUnload() {
    this._unloaded = true
  },

  onPullDownRefresh() {
    if (this.data.paramInvalid) {
      wx.stopPullDownRefresh()
      return
    }
    if (this.data.loading) {
      wx.stopPullDownRefresh()
      return
    }
    this.fetchPosts(true).finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.fetchPosts(false)
    }
  },

  // 滚动超过一屏半后显示返回顶部按钮
  onPageScroll(e) {
    const show = e.scrollTop > 600
    if (show !== this.data.showBackTop) this.setData({ showBackTop: show })
  },

  backTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 300 })
  },

  async fetchPosts(refresh) {
    if (this.data.loading) return
    const page = refresh ? 1 : this.data.page
    // 一轮分页固定使用同一个 pageSize，避免远程配置在翻页中途更新导致跳项。
    if (refresh || !this._pageSize) {
      const cfg = app.runtimeConfig.getConfig()
      this._pageSize = cfg.site.pageSize
    }
    this.setData({ loading: true, loadFailed: false })

    const params = { page, size: this._pageSize, sort: ['spec.publishTime,desc'] }
    const fetcher =
      this.data.type === 'tag'
        ? api.getTagPostList(this.data.name, params)
        : api.getCategoryPostList(this.data.name, params)

    try {
      const res = await fetcher
      if (this._unloaded) return
      const items = (res.items || []).map(normalizePostSummary)
      this.setData({
        postList: refresh ? items : [...this.data.postList, ...items],
        page: page + 1,
        hasMore: res.hasNext || false
      })
    } catch (err) {
      if (this._unloaded) return
      console.error('加载文章失败', err.type || '', err.statusCode || '')
      if (refresh && !this.data.postList.length) {
        this.setData({ loadFailed: true })
      } else {
        wx.showToast({ title: '加载失败，请检查网络', icon: 'none' })
      }
    } finally {
      if (!this._unloaded) this.setData({ loading: false })
    }
  },

  reloadFirstPage() {
    this.fetchPosts(true)
  },

  goDetail(e) {
    const { name } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/post-detail/post-detail?name=${encodeURIComponent(name)}` })
  }
})
