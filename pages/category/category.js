const api = require('../../utils/api')

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeTerm(item) {
  const value = objectOrEmpty(item)
  const metadata = objectOrEmpty(value.metadata)
  const spec = objectOrEmpty(value.spec)
  const status = objectOrEmpty(value.status)
  const name = typeof metadata.name === 'string' ? metadata.name.trim() : ''
  const displayName = typeof spec.displayName === 'string' ? spec.displayName.trim() : ''
  return {
    name,
    displayName: displayName || name,
    cover: typeof spec.cover === 'string' ? spec.cover : '',
    postCount: Number.isFinite(value.postCount)
      ? Math.max(0, Math.floor(value.postCount))
      : Number.isFinite(status.postCount)
        ? Math.max(0, Math.floor(status.postCount))
        : 0
  }
}

Page({
  data: {
    categories: [],
    tags: [],
    loading: true,
    loadFailed: false
  },

  onLoad() {
    this._unloaded = false
    this._loadSeq = 0
    this.fetchData()
  },

  onUnload() {
    this._unloaded = true
    this._loadSeq += 1
  },

  onPullDownRefresh() {
    if (this.data.loading) {
      wx.stopPullDownRefresh()
      return
    }
    this.fetchData().finally(() => wx.stopPullDownRefresh())
  },

  async fetchData() {
    if (this._unloaded) return
    const seq = ++this._loadSeq
    this.setData({ loading: true, loadFailed: false })
    try {
      const [catRes, tagRes] = await Promise.all([
        api.getCategoryList({ page: 1, size: 100 }),
        api.getTagList({ page: 1, size: 100 })
      ])
      if (this._unloaded || seq !== this._loadSeq) return
      this.setData({
        categories: (Array.isArray(catRes && catRes.items) ? catRes.items : [])
          .map(normalizeTerm)
          .filter((item) => item.name),
        tags: (Array.isArray(tagRes && tagRes.items) ? tagRes.items : [])
          .map(normalizeTerm)
          .filter((item) => item.name)
      })
    } catch (err) {
      if (this._unloaded || seq !== this._loadSeq) return
      console.error('加载分类失败', err.type || '', err.statusCode || '')
      // 刷新失败保留旧数据；首次失败显示错误态
      if (!this.data.categories.length && !this.data.tags.length) {
        this.setData({ loadFailed: true })
      } else {
        wx.showToast({ title: '加载失败，请检查网络', icon: 'none' })
      }
    } finally {
      if (!this._unloaded && seq === this._loadSeq) this.setData({ loading: false })
    }
  },

  goCategoryPosts(e) {
    const { name, title } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/posts/posts?type=category&name=${encodeURIComponent(name)}&title=${encodeURIComponent(title)}`
    })
  },

  goTagPosts(e) {
    const { name, title } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/posts/posts?type=tag&name=${encodeURIComponent(name)}&title=${encodeURIComponent(title)}`
    })
  }
})
