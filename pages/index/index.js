const api = require('../../utils/api')
const config = require('../../config/index')
const { normalizePostSummary } = require('../../utils/adapters/post')

Page({
  data: {
    bannerList: [],   // 置顶/带封面文章（轮播）
    postList: [],     // 文章列表
    page: 1,
    hasMore: true,
    loading: false,
    // 首屏加载失败标记（分页失败不清空列表，仅提示）
    loadFailed: false,
    showBackTop: false
  },

  onLoad() {
    this.fetchPosts(true)
  },

  onPullDownRefresh() {
    // 刷新与触底加载互斥：请求进行中直接结束刷新动画
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
    // 单飞：快速连续触底/刷新只产生一个请求
    if (this.data.loading) return
    const page = refresh ? 1 : this.data.page
    this.setData({ loading: true, loadFailed: false })

    try {
      const res = await api.getPostList({
        page,
        size: config.pageSize,
        sort: ['spec.pinned,desc', 'spec.publishTime,desc']
      })

      const items = (res.items || []).map(normalizePostSummary)

      this.setData({
        postList: refresh ? items : [...this.data.postList, ...items],
        page: page + 1,
        hasMore: res.hasNext || false,
        // 仅首页第一页时构建轮播：有封面的置顶/最新文章取前 5 条
        bannerList: refresh
          ? items.filter((p) => p.cover).slice(0, 5)
          : this.data.bannerList
      })
    } catch (err) {
      console.error('加载文章失败', err.type || '', err.statusCode || '')
      if (refresh && !this.data.postList.length) {
        // 首屏失败：整页错误态，可重试
        this.setData({ loadFailed: true })
      } else {
        // 刷新/分页失败：保留已有数据
        wx.showToast({ title: '加载失败，请检查网络', icon: 'none' })
      }
    } finally {
      this.setData({ loading: false })
    }
  },

  goDetail(e) {
    const { name } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/post-detail/post-detail?name=${encodeURIComponent(name)}` })
  },

  // 首屏错误态重试
  reloadFirstPage() {
    this.fetchPosts(true)
  },

  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' })
  }
})
