const api = require('../../utils/api')
const { normalizePostDetail } = require('../../utils/adapters/post')
const { extractCodeBlocks } = require('../../utils/html')
const { createCommentThread } = require('../../utils/comment-thread')
const likes = require('../../utils/likes')
const { decodeRouteParam } = require('../../utils/route')
const { safeResourceName } = require('../../utils/resource-name')

const app = getApp()

const commentThread = createCommentThread({
  getSubject: (page) => ({
    group: 'content.halo.run',
    kind: 'Post',
    version: 'v1alpha1',
    name: page.data.name
  })
})

const { tagStyle } = require('../../utils/rich-text-style')

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
    // 写入口（fail-closed：实时拉取成功 + 开关 + 版本门槛全部满足才为 true）
    commentSubmitEnabled: false,
    commentReplyEnabled: false,
    commentMaxLength: 500,
    comments: [],
    commentTotal: 0,
    commentPage: 1,
    commentHasNext: false,
    commentLoading: false,
    commentLoadError: false,
    // 评论弹层
    sheetVisible: false,
    sheetReplyTo: '',
    initialNickname: '',
    privacyUrl: '',
    privacyVersion: '',
    consentGiven: false,
    upvoted: false
  },

  onLoad(options) {
    this.initNavMetrics()
    // 参数合法性检查：缺失或非法 name 直接进入独立错误态
    const name = safeResourceName(decodeRouteParam(options && options.name))
    if (!name) {
      this.setData({ status: 'notfound' })
      return
    }
    this._counterReported = false
    this._unloaded = false
    this._commentsLoading = false
    this._loadSequence = 0
    this._repliesLoading = {}
    this._replyTarget = null
    this._idempotencyKey = ''
    this._upvotePromise = null
    this.setData({ name, upvoted: likes.isUpvoted(name) })

    app.runtimeReady().then(() => {
      if (this._unloaded) return
      const rc = app.runtimeConfig
      const cfg = rc.getConfig()
      this.setData({
        commentEnabled: !!cfg.commentEnabled,
        commentSubmitEnabled: rc.canSubmit(),
        commentReplyEnabled: rc.canReply(),
        commentMaxLength: (cfg.commentOptions && cfg.commentOptions.maxLength) || 500,
        privacyUrl: cfg.privacyPolicyUrl || '',
        privacyVersion: cfg.privacyPolicyVersion || '',
        consentGiven: this.readConsent(cfg.privacyPolicyVersion)
      })
      // 评论开关关闭时不请求评论接口
      if (this.data.commentEnabled && this.data.post && this.data.post.allowComment) {
        this.fetchComments(1)
      }
    }).catch(() => {
      if (this._unloaded) return
      this.setData({
        commentEnabled: false,
        commentSubmitEnabled: false,
        commentReplyEnabled: false
      })
    })
    this.fetchPost()
  },

  onUnload() {
    this._unloaded = true
    this._loadSequence = (this._loadSequence || 0) + 1
    // 页面卸载：立即结束表单并清理正文
    const sheet = typeof this.selectComponent === 'function'
      ? this.selectComponent('#commentSheet')
      : null
    if (sheet) sheet.close()
    this._replyTarget = null
    this._idempotencyKey = ''
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
    const sequence = (this._loadSequence || 0) + 1
    this._loadSequence = sequence
    this.setData({ status: 'loading' })
    try {
      const res = await api.getPostByName(this.data.name)
      // 页面已卸载：不再执行无意义的 setData
      if (this._unloaded || sequence !== this._loadSequence) return
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
      if (this.data.commentEnabled && post.allowComment) this.fetchComments(1)
    } catch (err) {
      if (this._unloaded || sequence !== this._loadSequence) return
      console.error('加载文章失败', err && err.type || '', err && err.statusCode || '',
        err && err.path || this.data.name)
      // 接口 404 使用独立错误态，其余网络/超时/格式错误可重试
      const notfound = err && err.type === 'http' && err.statusCode === 404
      this.setData({ status: notfound ? 'notfound' : 'error' })
    }
  },

  ...commentThread,
  // 点赞（状态本地持久化，重新进入后保持）
  async handleUpvote() {
    if (this.data.upvoted) {
      wx.showToast({ title: '已经赞过了', icon: 'none' })
      return
    }
    // 单飞：快速重复点击只产生一次 tracker 请求；成功后才更新计数与本地状态。
    if (this._upvotePromise) return this._upvotePromise
    const request = api
      .upvote(this.data.name)
      .then(() => {
        if (this._unloaded) return
        likes.markUpvoted(this.data.name)
        this.setData({
          upvoted: true,
          'post.upvotes': this.data.post.upvotes + 1
        })
        wx.showToast({ title: '点赞成功', icon: 'none' })
      })
      .catch(() => {
        if (!this._unloaded) wx.showToast({ title: '点赞失败，请稍后重试', icon: 'none' })
      })
      .finally(() => {
        if (this._upvotePromise === request) this._upvotePromise = null
      })
    this._upvotePromise = request
    return request
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
