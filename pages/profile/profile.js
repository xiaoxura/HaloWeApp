const api = require('../../utils/api')
const config = require('../../config/index')
const { formatCount } = require('../../utils/util')

const app = getApp()

Page({
  data: {
    blogName: config.blogName,
    blogDesc: config.blogDesc,
    stats: {
      postCount: '0',
      categoryCount: '0',
      tagCount: '0',
      visitCount: '0'
    },
    commentEnabled: false
  },

  onLoad() {
    this.setData({ commentEnabled: app.globalData.runtime.commentEnabled })
    this.fetchStats()
  },

  onShow() {
    // 远程配置可能已更新
    this.setData({ commentEnabled: app.globalData.runtime.commentEnabled })
  },

  onPullDownRefresh() {
    this.fetchStats().finally(() => wx.stopPullDownRefresh())
  },

  async fetchStats() {
    try {
      const res = await api.getStats()
      this.setData({
        stats: {
          postCount: formatCount(res.postCount ?? res.post ?? 0),
          categoryCount: formatCount(res.categoryCount ?? res.category ?? 0),
          tagCount: formatCount(res.tagCount ?? res.tag ?? 0),
          visitCount: formatCount(res.visitCount ?? res.visit ?? 0)
        }
      })
    } catch (err) {
      console.error('加载统计失败', err)
    }
  },

  // 归档 / 友链 / 关于 / 设置：二期功能
  todo() {
    wx.showToast({ title: '功能开发中，敬请期待', icon: 'none' })
  }
})
