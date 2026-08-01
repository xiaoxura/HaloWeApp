const api = require('../../utils/api')
const { normalizePostDetail } = require('../../utils/adapters/post')
const { extractCodeBlocks } = require('../../utils/html')
const { formatDate } = require('../../utils/util')
const likes = require('../../utils/likes')

const app = getApp()

// mp-html 标签默认样式（页面 wxss 无法穿透组件，正文排版统一在这里定义）
const tagStyle = {
  // 小标题层级：h1 细分隔线，h2 蓝色强调条，h3/h4 递减灰度
  h1: 'font-size:38rpx;font-weight:700;margin:44rpx 0 20rpx;padding-bottom:16rpx;line-height:1.4;color:#1a1a1a;border-bottom:1rpx solid #eef1f5;',
  h2: 'font-size:34rpx;font-weight:700;margin:40rpx 0 18rpx;padding-left:20rpx;line-height:1.4;color:#1a1a1a;border-left:8rpx solid #1e80ff;border-radius:2rpx;',
  h3: 'font-size:31rpx;font-weight:600;margin:32rpx 0 14rpx;line-height:1.45;color:#2a2a2a;',
  h4: 'font-size:28rpx;font-weight:600;margin:26rpx 0 12rpx;line-height:1.5;color:#4a4a4a;',
  h5: 'font-size:26rpx;font-weight:600;margin:22rpx 0 10rpx;line-height:1.5;color:#5a5a5a;',
  h6: 'font-size:24rpx;font-weight:600;margin:20rpx 0 10rpx;line-height:1.5;color:#6a6a6a;',
  p: 'margin:0 0 24rpx;line-height:1.8;',
  blockquote:
    'margin:24rpx 0;padding:20rpx 28rpx;background:#f7f8fa;' +
    'border-left:6rpx solid #d6dae1;border-radius:0 20rpx 20rpx 0;color:#666;',
  ul: 'margin:0 0 24rpx 4rpx;padding-left:36rpx;',
  ol: 'margin:0 0 24rpx 4rpx;padding-left:36rpx;',
  li: 'margin-bottom:8rpx;line-height:1.8;',
  hr: 'border:none;border-top:1rpx solid #e5e7eb;margin:36rpx 0;',
  a: 'color:#1e80ff;text-decoration:underline;text-decoration-color:rgba(30,128,255,0.4);text-underline-offset:6rpx;',
  code: 'font-family:Consolas,Menlo,monospace;font-size:24rpx;',
  img: 'max-width:100%;border-radius:20rpx;margin:24rpx 0;',
  table: 'border-collapse:collapse;font-size:24rpx;',
  th: 'background:#f5f7fa;font-weight:600;padding:16rpx 24rpx;text-align:left;border:1rpx solid #e5e6eb;',
  td: 'padding:16rpx 24rpx;border:1rpx solid #f0f1f3;'
}

Page({
  data: {
    name: '',
    post: null,
    // 页面状态：loading | ready | empty | notfound | error
    status: 'loading',
    tagStyle,
    // 自定义导航栏度量（onLoad 中按胶囊位置计算）
    statusBarHeight: 20,
    navBarHeight: 64,
    commentEnabled: false,
    comments: [],
    commentTotal: 0,
    upvoted: false
  },

  onLoad(options) {
    this.initNavMetrics()
    // 参数合法性检查：缺失或非法 name 直接进入独立错误态
    const name = options && options.name ? decodeURIComponent(options.name) : ''
    if (!name) {
      this.setData({ status: 'notfound' })
      return
    }
    this._counterReported = false
    this._unloaded = false
    this.setData({ name, upvoted: likes.isUpvoted(name) })

    app.runtimeReady().then((runtime) => {
      this.setData({ commentEnabled: !!runtime.commentEnabled })
      // 评论开关关闭时不请求评论接口
      if (this.data.commentEnabled && this.data.post && this.data.post.allowComment) {
        this.fetchComments()
      }
    })
    this.fetchPost()
  },

  onUnload() {
    this._unloaded = true
  },

  // 自定义导航栏度量：按右上角胶囊位置计算状态栏与导航栏高度
  initNavMetrics() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const statusBarHeight = info.statusBarHeight || 20
      const menu = wx.getMenuButtonBoundingClientRect()
      const navBarHeight = (menu.top - statusBarHeight) * 2 + menu.height + statusBarHeight
      this.setData({ statusBarHeight, navBarHeight })
    } catch (e) {
      // 使用 data 中的默认度量
    }
  },

  // 返回上一页；分享等场景没有上一页时回首页
  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack()
    } else {
      wx.switchTab({ url: '/pages/index/index' })
    }
  },

  async fetchPost() {
    this.setData({ status: 'loading' })
    try {
      const res = await api.getPostByName(this.data.name)
      // 页面已卸载：不再执行无意义的 setData
      if (this._unloaded) return
      const post = normalizePostDetail(res)
      // 提取代码块文本（与 copy://N 锚点一一对应，供复制按钮使用）
      this._codeBlocks = extractCodeBlocks(post.content)
      this.setData({
        post,
        status: post.contentEmpty ? 'empty' : 'ready'
      })
      // 阅读量上报：每次页面会话只上报一次，失败静默不影响正文
      if (!this._counterReported) {
        this._counterReported = true
        api.reportCounter(this.data.name).catch(() => {})
      }
      if (this.data.commentEnabled && post.allowComment) this.fetchComments()
    } catch (err) {
      if (this._unloaded) return
      console.error('加载文章失败', err.type || '', err.statusCode || '', err.path || this.data.name)
      // 接口 404 使用独立错误态，其余网络/超时/格式错误可重试
      const notfound = err && err.type === 'http' && err.statusCode === 404
      this.setData({ status: notfound ? 'notfound' : 'error' })
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
      if (this._unloaded) return
      this.setData({ comments: items, commentTotal: res.total || 0 })
    } catch (err) {
      console.error('加载评论失败', err.type || '', err.statusCode || '')
    }
  },

  // 点赞（状态本地持久化，重新进入后保持）
  async handleUpvote() {
    if (this.data.upvoted) {
      wx.showToast({ title: '已经赞过了', icon: 'none' })
      return
    }
    try {
      await api.upvote(this.data.name)
      likes.markUpvoted(this.data.name)
      this.setData({
        upvoted: true,
        'post.upvotes': this.data.post.upvotes + 1
      })
      wx.showToast({ title: '点赞成功', icon: 'none' })
    } catch (err) {
      wx.showToast({ title: '点赞失败，请稍后重试', icon: 'none' })
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
      path: `/pages/post-detail/post-detail?name=${encodeURIComponent(name)}`,
      imageUrl: (post && post.cover) || ''
    }
  },

  handleShare() {
    wx.showShareMenu({ withShareTicket: false })
    wx.showToast({ title: '点击右上角分享', icon: 'none' })
  },

  // 链接点击：copy://N 为代码块复制按钮；外链无法直接打开时复制链接（长按也可复制，由 copy-link 提供）
  handleLinkTap(e) {
    const href = e.detail && e.detail.href
    if (!href) return
    if (href.indexOf('copy://') === 0) {
      const index = parseInt(href.slice('copy://'.length), 10)
      const text = this._codeBlocks && this._codeBlocks[index]
      if (text) {
        wx.setClipboardData({ data: text })
      } else {
        wx.showToast({ title: '复制失败，请长按选择复制', icon: 'none' })
      }
      return
    }
    if (/^https?:\/\//.test(href)) {
      wx.setClipboardData({ data: href })
    }
  },

  // 封面加载失败：替换为占位图（防占位图本身失败造成死循环）
  onCoverError() {
    if (this._coverFailed) return
    this._coverFailed = true
    this.setData({ 'post.cover': '/images/img-error.png' })
  },

  // 正文媒体加载失败：图片由 error-img 自动占位，视频给出明确提示
  onMediaError(e) {
    const source = e.detail && e.detail.source
    if (source === 'video') {
      wx.showToast({ title: '视频加载失败，请稍后重试', icon: 'none' })
    }
  }
})
