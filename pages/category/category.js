const api = require('../../utils/api')

Page({
  data: {
    categories: [],
    tags: []
  },

  onLoad() {
    this.fetchData()
  },

  onPullDownRefresh() {
    this.fetchData().finally(() => wx.stopPullDownRefresh())
  },

  async fetchData() {
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
      console.error('加载分类失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  goCategoryPosts(e) {
    const { name, title } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/posts/posts?type=category&name=${name}&title=${encodeURIComponent(title)}`
    })
  },

  goTagPosts(e) {
    const { name, title } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/posts/posts?type=tag&name=${name}&title=${encodeURIComponent(title)}`
    })
  }
})
