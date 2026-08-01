const api = require('../../utils/api')

Page({
  data: {
    categories: [],
    tags: [],
    loading: true,
    loadFailed: false
  },

  onLoad() {
    this.fetchData()
  },

  onPullDownRefresh() {
    this.fetchData().finally(() => wx.stopPullDownRefresh())
  },

  async fetchData() {
    this.setData({ loading: true, loadFailed: false })
    try {
      const [catRes, tagRes] = await Promise.all([
        api.getCategoryList({ page: 1, size: 100 }),
        api.getTagList({ page: 1, size: 100 })
      ])
      this.setData({
        categories: (catRes.items || []).map((c) => ({
          name: c.metadata.name,
          displayName: c.spec.displayName,
          cover: c.spec.cover || '',
          postCount: c.postCount ?? (c.status && c.status.postCount) ?? 0
        })),
        tags: (tagRes.items || []).map((t) => ({
          name: t.metadata.name,
          displayName: t.spec.displayName,
          postCount: t.postCount ?? (t.status && t.status.postCount) ?? 0
        }))
      })
    } catch (err) {
      console.error('加载分类失败', err.type || '', err.statusCode || '')
      // 刷新失败保留旧数据；首次失败显示错误态
      if (!this.data.categories.length && !this.data.tags.length) {
        this.setData({ loadFailed: true })
      } else {
        wx.showToast({ title: '加载失败，请检查网络', icon: 'none' })
      }
    } finally {
      this.setData({ loading: false })
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
