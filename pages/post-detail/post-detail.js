const config = require('../../config/index')
const api = require('../../utils/api')
const { normalizePostDetail } = require('../../utils/adapters/post')
const { normalizeCommentList, normalizeReplyList } = require('../../utils/adapters/comment')
const { extractCodeBlocks } = require('../../utils/html')
const { uuid } = require('../../utils/util')
const { commentSession } = require('../../utils/comment-session')
const { AUTH_STORAGE_KEYS } = require('../../utils/auth-session')
const likes = require('../../utils/likes')

const app = getApp()

// 评论列表每页条数（计划 §5.5：10～20 条，不再固定拉 50 条）
const COMMENT_PAGE_SIZE = 10
// 评论首屏附带回复数与「展开更多回复」每页条数
const REPLY_FIRST_SIZE = 5
const REPLY_PAGE_SIZE = 10

// 本机存储键：昵称（用户可选择不存）、已同意的隐私政策版本
const NICKNAME_KEY = 'commentNickname'
const CONSENT_KEY = AUTH_STORAGE_KEYS.CONSENT

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
    const name = options && options.name ? decodeURIComponent(options.name) : ''
    if (!name) {
      this.setData({ status: 'notfound' })
      return
    }
    this._counterReported = false
    this._unloaded = false
    this._commentsLoading = false
    this._repliesLoading = {}
    this._replyTarget = null
    this._idempotencyKey = ''
    this._upvotePromise = null
    this.setData({ name, upvoted: likes.isUpvoted(name) })

    app.runtimeReady().then(() => {
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
    })
    this.fetchPost()
  },

  onUnload() {
    this._unloaded = true
    // 页面卸载：立即结束表单并清理正文
    const sheet = this.selectComponent('#commentSheet')
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
      if (this.data.commentEnabled && post.allowComment) this.fetchComments(1)
    } catch (err) {
      if (this._unloaded) return
      console.error('加载文章失败', err.type || '', err.statusCode || '', err.path || this.data.name)
      // 接口 404 使用独立错误态，其余网络/超时/格式错误可重试
      const notfound = err && err.type === 'http' && err.statusCode === 404
      this.setData({ status: notfound ? 'notfound' : 'error' })
    }
  },

  // ===== 评论读取（分页单飞，失败保留已加载数据） =====

  async fetchComments(page = 1) {
    if (this._commentsLoading) return
    this._commentsLoading = true
    this.setData({ commentLoading: true, commentLoadError: false })
    try {
      const res = await api.getCommentList({
        group: 'content.halo.run',
        kind: 'Post',
        version: 'v1alpha1',
        name: this.data.name,
        page,
        size: COMMENT_PAGE_SIZE,
        withReplies: true,
        replySize: REPLY_FIRST_SIZE
      })
      if (this._unloaded) return
      const { comments, total, hasNext } = normalizeCommentList(res)
      // 分页去重（防止页间重叠）；新评论项标记回复页码供「展开更多回复」使用
      const fresh = comments.map((c) => ({ ...c, replyPage: 1 }))
      const list =
        page === 1
          ? fresh
          : this.data.comments.concat(
              fresh.filter((c) => !this.data.comments.some((x) => x.name === c.name))
            )
      this.setData({
        comments: list,
        commentTotal: total,
        commentHasNext: hasNext,
        commentPage: page
      })
    } catch (err) {
      if (this._unloaded) return
      console.error('加载评论失败', err.type || '', err.statusCode || '')
      this.setData({ commentLoadError: true })
    } finally {
      this._commentsLoading = false
      if (!this._unloaded) this.setData({ commentLoading: false })
    }
  },

  loadMoreComments() {
    if (this.data.commentHasNext && !this.data.commentLoading) {
      this.fetchComments(this.data.commentPage + 1)
    }
  },

  retryComments() {
    this.fetchComments(this.data.comments.length ? this.data.commentPage : 1)
  },

  // 展开某条评论的更多回复
  async fetchReplies(e) {
    const name = e.currentTarget.dataset.name
    const idx = this.data.comments.findIndex((c) => c.name === name)
    if (idx < 0 || this._repliesLoading[name]) return
    const comment = this.data.comments[idx]
    const nextPage = (comment.replyPage || 1) + 1
    this._repliesLoading[name] = true
    try {
      const res = await api.getCommentReplyList(name, { page: nextPage, size: REPLY_PAGE_SIZE })
      if (this._unloaded) return
      const { replies, hasNext } = normalizeReplyList(res)
      const merged = comment.replies.concat(
        replies.filter((r) => !comment.replies.some((x) => x.name === r.name))
      )
      this.setData({
        [`comments[${idx}].replies`]: merged,
        [`comments[${idx}].replyHasNext`]: hasNext,
        [`comments[${idx}].replyPage`]: nextPage
      })
    } catch (err) {
      if (!this._unloaded) wx.showToast({ title: '回复加载失败，请重试', icon: 'none' })
    } finally {
      delete this._repliesLoading[name]
    }
  },

  // 发表回复成功后只刷新对应评论的回复（不重载整篇文章）
  async refreshReplies(commentName) {
    const idx = this.data.comments.findIndex((c) => c.name === commentName)
    if (idx < 0) return
    try {
      const res = await api.getCommentReplyList(commentName, { page: 1, size: REPLY_PAGE_SIZE })
      if (this._unloaded) return
      const { replies, hasNext, total } = normalizeReplyList(res)
      this.setData({
        [`comments[${idx}].replies`]: replies,
        [`comments[${idx}].replyHasNext`]: hasNext,
        [`comments[${idx}].replyPage`]: 1,
        [`comments[${idx}].replyCount`]: total
      })
    } catch (err) {
      // 刷新失败不影响提交结果，用户可手动展开
    }
  },

  // ===== 评论弹层与提交状态机 =====

  readConsent(version) {
    // 未配置隐私版本时视为无需勾选；已同意版本与当前版本一致才免勾选
    if (!version) return true
    try {
      return wx.getStorageSync(CONSENT_KEY) === version
    } catch (e) {
      return false
    }
  },

  // 评论入口（底部输入框）
  handleComment() {
    if (!this.data.commentSubmitEnabled) {
      wx.showToast({ title: '暂未开放评论', icon: 'none' })
      return
    }
    this.openSheet(null)
  },

  // 回复入口（评论或回复行；dataset 带评论名与被引用回复）
  handleReply(e) {
    if (!this.data.commentReplyEnabled) {
      wx.showToast({ title: '暂未开放回复', icon: 'none' })
      return
    }
    const ds = e.currentTarget.dataset
    this.openSheet({
      commentName: ds.commentName,
      quoteReplyName: ds.quoteName || '',
      author: ds.author || '访客'
    })
  },

  openSheet(target) {
    this._replyTarget = target
    this._idempotencyKey = uuid()
    let initialNickname = ''
    try {
      initialNickname = wx.getStorageSync(NICKNAME_KEY) || ''
    } catch (e) {
      initialNickname = ''
    }
    // 真实账号认证态优先使用服务端公开 profile；缓存 profile 不能伪装为已登录昵称。
    initialNickname = app.authSession.preferredDisplayName(initialNickname)
    this.setData({
      sheetVisible: true,
      sheetReplyTo: target ? target.author : '',
      initialNickname
    })
  },

  onSheetClose() {
    this.setData({ sheetVisible: false })
    this._replyTarget = null
    this._idempotencyKey = ''
  },

  async onSheetSubmit(e) {
    const sheet = this.selectComponent('#commentSheet')
    const { nickname, content, saveNickname } = e.detail
    const target = this._replyTarget
    const isReply = !!target
    const rc = app.runtimeConfig
    const cfg = rc.getConfig()

    // 提交前由客户端再次校验写入口（服务端仍会做最终校验）
    const allowed = isReply ? rc.canReply() : rc.canSubmit()
    if (!allowed) {
      sheet.close()
      this.setData({ commentSubmitEnabled: false, commentReplyEnabled: false })
      wx.showToast({ title: '评论功能已关闭', icon: 'none' })
      return
    }

    // 记录本次隐私同意（sheet 已强制勾选当前版本）
    if (!this.data.consentGiven) {
      try {
        wx.setStorageSync(CONSENT_KEY, cfg.privacyPolicyVersion)
      } catch (err) {
        // 存储失败不阻断提交
      }
      this.setData({ consentGiven: true })
    }

    const key = this._idempotencyKey || (this._idempotencyKey = uuid())
    const buildHeader = (token) => ({
      'X-WeApp-Session': token,
      'X-Idempotency-Key': key,
      'X-WeApp-Client-Version': config.version
    })
    const payload = {
      displayName: nickname,
      content,
      privacyConsentVersion: cfg.privacyPolicyVersion || ''
    }

    try {
      // wx.login 仅在用户点击提交时触发；401 时重新登录并最多自动重试一次
      const res = await commentSession.withSession((token) =>
        isReply
          ? api.submitPluginReply(
              target.commentName,
              { ...payload, quoteReplyName: target.quoteReplyName || undefined },
              buildHeader(token)
            )
          : api.submitPluginComment(
              { ...payload, postName: this.data.name },
              buildHeader(token)
            )
      )
      if (this._unloaded) return

      // 昵称本机保存由用户选择；正文和会话 token 绝不持久化
      try {
        if (saveNickname) wx.setStorageSync(NICKNAME_KEY, nickname)
        else wx.removeStorageSync(NICKNAME_KEY)
      } catch (err) {
        // 存储失败不影响提交结果
      }

      sheet.close()
      if (res && res.status === 'published') {
        wx.showToast({ title: '发表成功', icon: 'success' })
        // published：刷新评论首屏 / 对应评论的回复
        if (isReply) this.refreshReplies(target.commentName)
        else this.fetchComments(1)
      } else {
        // pending：不伪造已发布评论，仅提示审核
        wx.showToast({ title: '已提交，审核后可见', icon: 'none' })
      }
    } catch (err) {
      if (this._unloaded) return
      this.handleSubmitError(err, sheet)
    }
  },

  // 按稳定业务码分支处理提交错误（message 仅用于展示）
  handleSubmitError(err, sheet) {
    const code = err && err.data && err.data.code
    const serverMsg = err && err.data && err.data.message
    switch (code) {
      case 'VALIDATION_ERROR':
      case 'CONTENT_REVIEW':
      case 'CONTENT_RISKY':
        // 标记并保留表单
        sheet.setError(serverMsg || '内容不符合要求，请修改后重试')
        break
      case 'RATE_LIMITED': {
        const wait = err.data && err.data.retryAfter
        sheet.setError(wait ? `操作过于频繁，请 ${wait} 秒后再试` : serverMsg || '操作过于频繁，请稍后再试')
        break
      }
      case 'COMMENT_DISABLED':
      case 'REPLY_DISABLED':
        // 远程已关闭：结束表单并关闭写入口
        sheet.close()
        this.setData({
          commentSubmitEnabled: code === 'COMMENT_DISABLED' ? false : this.data.commentSubmitEnabled,
          commentReplyEnabled: false
        })
        wx.showToast({ title: serverMsg || '评论功能已关闭', icon: 'none' })
        break
      case 'CLIENT_UPDATE_REQUIRED':
        sheet.close()
        this.setData({ commentSubmitEnabled: false, commentReplyEnabled: false })
        wx.showModal({
          title: '需要更新',
          content: serverMsg || '请更新小程序后再评论',
          showCancel: false
        })
        break
      case 'POST_NOT_FOUND':
      case 'COMMENT_NOT_FOUND':
        sheet.close()
        wx.showToast({ title: serverMsg || '内容已不存在', icon: 'none' })
        break
      default:
        // WECHAT_UNAVAILABLE / HALO_UNAVAILABLE / 网络错误 / 未知 code：
        // 保留表单，允许稍后手动重试；requestId 供排查
        if (err && err.data && err.data.requestId) {
          console.error('评论提交失败 requestId=', err.data.requestId, 'code=', code || '')
        }
        sheet.setError(serverMsg || '提交失败，请稍后重试')
    }
  },

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
