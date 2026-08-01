const api = require('../../utils/api')
const { formatDate, formatCount } = require('../../utils/util')

const app = getApp()

Page({
  data: {
    name: '',
    post: null,
    loading: true,
    commentEnabled: false,
    comments: [],
    commentTotal: 0,
    upvoted: false
  },

  onLoad(options) {
    this.setData({
      name: options.name,
      commentEnabled: app.globalData.runtime.commentEnabled
    })
    this.fetchPost()
  },

  async fetchPost() {
    try {
      const res = await api.getPostByName(this.data.name)
      this.setData({
        post: {
          title: res.spec.title,
          cover: res.spec.cover || '',
          publishTime: formatDate(res.spec.publishTime, true),
          author: (res.owner && res.owner.displayName) || '博主',
          avatar: (res.owner && res.owner.avatar) || '',
          content: (res.content && res.content.html) || '',
          allowComment: res.spec.allowComment !== false,
          visits: formatCount((res.stats && res.stats.visit) || 0),
          upvotes: (res.stats && res.stats.upvote) || 0,
          commentCount: (res.stats && res.stats.comment) || 0,
          tags: (res.tags || []).map((t) => ({
            name: t.metadata.name,
            displayName: t.spec.displayName
          }))
        },
        loading: false
      })
      wx.setNavigationBarTitle({ title: res.spec.title })
      // 上报阅读量（静默）
      api.reportCounter(this.data.name).catch(() => {})
      if (this.data.commentEnabled) this.fetchComments()
    } catch (err) {
      console.error('加载文章失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: '文章加载失败', icon: 'none' })
    }
  },

  async fetchComments() {
    try {
      const res = await api.getCommentList({
        group: 'content.halo.run',
        kind: 'Post',
        version: 'v1alpha1',
        name: this.data.name,
        page: 1,
        size: 50,
        withReplies: true,
        replySize: 10
      })
      const items = (res.items || []).map((c) => ({
        name: c.metadata.name,
        author: (c.owner && c.owner.displayName) || '访客',
        avatar: (c.owner && c.owner.avatar) || '',
        content: (c.spec && c.spec.content) || '',
        time: formatDate(c.spec && c.spec.creationTime, true),
        replies: (c.replies || []).map((r) => ({
          author: (r.owner && r.owner.displayName) || '访客',
          content: (r.spec && r.spec.content) || ''
        }))
      }))
      this.setData({ comments: items, commentTotal: res.total || 0 })
    } catch (err) {
      console.error('加载评论失败', err)
    }
  },

  // 点赞
  async handleUpvote() {
    if (this.data.upvoted) {
      wx.showToast({ title: '已经赞过了', icon: 'none' })
      return
    }
    try {
      await api.upvote(this.data.name)
      this.setData({
        upvoted: true,
        'post.upvotes': this.data.post.upvotes + 1
      })
      wx.showToast({ title: '点赞成功', icon: 'none' })
    } catch (err) {
      wx.showToast({ title: '点赞失败', icon: 'none' })
    }
  },

  // 评论输入（弹层）
  handleComment() {
    wx.showToast({ title: '评论功能即将上线', icon: 'none' })
  },

  // 分享
  onShareAppMessage() {
    const { post, name } = this.data
    return {
      title: (post && post.title) || '分享文章',
      path: `/pages/post-detail/post-detail?name=${name}`,
      imageUrl: (post && post.cover) || ''
    }
  },

  handleShare() {
    wx.showShareMenu({ withShareTicket: false })
    wx.showToast({ title: '点击右上角分享', icon: 'none' })
  },

  // 预览正文中的图片
  previewImage(e) {
    const { src } = e.detail
    if (src) wx.previewImage({ urls: [src] })
  }
})
