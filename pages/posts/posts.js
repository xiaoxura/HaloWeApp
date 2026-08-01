const api = require('../../utils/api')
const config = require('../../config/index')
const { formatDate, formatCount } = require('../../utils/util')

Page({
  data: {
    type: '',      // category | tag
    name: '',
    postList: [],
    page: 1,
    hasMore: true,
    loading: false
  },

  onLoad(options) {
    const title = decodeURIComponent(options.title || '文章列表')
    wx.setNavigationBarTitle({ title })
    this.setData({ type: options.type, name: options.name })
    this.fetchPosts(true)
  },

  onPullDownRefresh() {
    this.fetchPosts(true).finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.fetchPosts(false)
    }
  },

  async fetchPosts(refresh) {
    const page = refresh ? 1 : this.data.page
    this.setData({ loading: true })

    const params = { page, size: config.pageSize, sort: ['spec.publishTime,desc'] }
    const fetcher =
      this.data.type === 'tag'
        ? api.getTagPostList(this.data.name, params)
        : api.getCategoryPostList(this.data.name, params)

    try {
      const res = await fetcher
      const items = (res.items || []).map((item) => ({
        name: item.metadata.name,
        title: item.spec.title,
        cover: item.spec.cover || '',
        pinned: item.spec.pinned || false,
        excerpt: (item.status && item.status.excerpt) || '',
        publishTime: formatDate(item.spec.publishTime),
        visits: formatCount((item.stats && item.stats.visit) || 0),
        comments: (item.stats && item.stats.comment) || 0,
        upvotes: (item.stats && item.stats.upvote) || 0,
        category:
          (item.categories && item.categories[0] && item.categories[0].spec.displayName) || ''
      }))
      this.setData({
        postList: refresh ? items : [...this.data.postList, ...items],
        page: page + 1,
        hasMore: res.hasNext || false
      })
    } catch (err) {
      console.error('加载文章失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  goDetail(e) {
    const { name } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/post-detail/post-detail?name=${name}` })
  }
})
