const api = require('../../utils/api')
const config = require('../../config/index')
const { formatCount } = require('../../utils/util')

const app = getApp()

Page({
  data: {
    blogName: config.blogName,
    blogDesc: config.blogDesc,
    version: config.version,
    stats: {
      postCount: '--',
      categoryCount: '--',
      tagCount: '--',
      visitCount: '--'
    },
    commentEnabled: false
  },

  onLoad() {
    app.runtimeReady().then((runtime) => {
      this.setData({ commentEnabled: !!runtime.commentEnabled })
    })
    this.fetchStats()
  },

  onShow() {
    // 远程配置可能已更新
    this.setData({ commentEnabled: app.globalData.runtime.commentEnabled })
  },

  onPullDownRefresh() {
    this.fetchStats().finally(() => wx.stopPullDownRefresh())
  },

  // 文章/分类/阅读来自 stats 接口；标签数取标签列表分页响应的 total（stats 不一定返回）
  async fetchStats() {
    const [statsRes, tagRes] = await Promise.allSettled([
      api.getStats(),
      api.getTagList({ page: 1, size: 1 })
    ])

    const next = {}
    if (statsRes.status === 'fulfilled') {
      const res = statsRes.value || {}
      next.postCount = formatCount(res.postCount ?? res.post ?? 0)
      next.categoryCount = formatCount(res.categoryCount ?? res.category ?? 0)
      next.visitCount = formatCount(res.visitCount ?? res.visit ?? 0)
    } else {
      console.error('加载统计失败', statsRes.reason)
    }
    if (tagRes.status === 'fulfilled') {
      // 失败时显示 '--'，不伪造 0
      next.tagCount = formatCount((tagRes.value && tagRes.value.total) || 0)
    } else {
      console.error('加载标签数失败', tagRes.reason)
    }
    if (Object.keys(next).length) {
      this.setData({ stats: { ...this.data.stats, ...next } })
    } else if (!this._statsToastShown) {
      this._statsToastShown = true
      wx.showToast({ title: '加载失败，请检查网络', icon: 'none' })
    }
  }
})
