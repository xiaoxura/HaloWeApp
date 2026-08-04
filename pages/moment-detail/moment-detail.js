const api = require('../../utils/api')
const { normalizeMomentDetail, safeMomentName } = require('../../utils/adapters/moment')
const { pluginCapabilities } = require('../../utils/plugin-capabilities')
const { momentMediaSession } = require('../../utils/moment-media-session')
const { tagStyle } = require('../../utils/rich-text-style')
const { createCommentThread } = require('../../utils/comment-thread')
const likes = require('../../utils/likes')
const { decodeRouteParam } = require('../../utils/route')

const app = getApp()

function safeName(options) {
  return safeMomentName(decodeRouteParam(options && options.name))
}

const commentThread = createCommentThread({
  isMoment: true,
  getSubject: (page) => ({
    group: 'moment.halo.run',
    kind: 'Moment',
    version: 'v1alpha1',
    name: page.data.name
  })
})

Page({
  data: {
    name: '',
    moment: null,
    status: 'loading', // loading | ready | unavailable | notfound | empty | error
    detailLoadError: false,
    tagStyle,
    upvoted: false,
    upvoting: false,
    commentEnabled: false,
    commentSubmitEnabled: false,
    commentReplyEnabled: false,
    commentMaxLength: 500,
    comments: [],
    commentTotal: 0,
    commentPage: 1,
    commentHasNext: false,
    commentLoading: false,
    commentLoadError: false,
    sheetVisible: false,
    sheetReplyTo: '',
    initialNickname: '',
    privacyUrl: '',
    privacyVersion: '',
    consentGiven: false
  },

  onLoad(options) {
    this._unloaded = false
    this._loadSequence = 0
    this._upvotePromise = null
    this._commentsLoading = false
    this._repliesLoading = {}
    this._replyTarget = null
    this._idempotencyKey = ''
    const name = safeName(options)
    if (!name) {
      this.setData({ status: 'notfound' })
      return
    }
    this.setData({ name, upvoted: likes.isUpvotedSubject('moment', name) })
    this.loadMoment()
  },

  onHide() {
    const media = typeof this.selectComponent === 'function'
      ? this.selectComponent('#momentMedia')
      : null
    if (media && typeof media.resetPlayback === 'function') media.resetPlayback()
    momentMediaSession.destroy()
  },

  onUnload() {
    this._unloaded = true
    this._loadSequence += 1
    const sheet = this.selectComponent('#commentSheet')
    if (sheet) sheet.close()
    this._replyTarget = null
    this._idempotencyKey = ''
    momentMediaSession.destroy()
  },

  async loadMoment() {
    const sequence = ++this._loadSequence
    const existingMoment = this.data.moment
    this.setData({
      status: existingMoment ? (existingMoment.contentEmpty ? 'empty' : 'ready') : 'loading',
      detailLoadError: false
    })
    try {
      await app.runtimeReady()
      if (this._unloaded || sequence !== this._loadSequence) return
      if (!app.runtimeConfig.canReadMoments()) {
        this.setData({ status: 'unavailable', moment: null })
        return
      }
      const available = await pluginCapabilities.momentsAvailable()
      if (this._unloaded || sequence !== this._loadSequence) return
      if (!available) {
        this.setData({ status: 'unavailable', moment: null })
        return
      }
      const response = await api.getMomentByName(this.data.name)
      if (this._unloaded || sequence !== this._loadSequence) return
      const moment = normalizeMomentDetail(response)
      if (!moment) {
        this.setData({ status: 'notfound', moment: null })
        return
      }
      this.setData({
        moment,
        status: moment.contentEmpty ? 'empty' : 'ready',
        detailLoadError: false
      })
      this.configureComments(app.runtimeConfig)
      if (this.data.commentEnabled) this.fetchComments(1)
    } catch (err) {
      if (this._unloaded || sequence !== this._loadSequence) return
      console.error('加载瞬间详情失败', err && err.type || '', err && err.statusCode || '')
      const notfound = err && err.statusCode === 404
      const currentMoment = this.data.moment
      if (notfound || !currentMoment) {
        this.setData({ status: notfound ? 'notfound' : 'error', moment: null, detailLoadError: false })
      } else {
        this.setData({
          status: currentMoment.contentEmpty ? 'empty' : 'ready',
          detailLoadError: true
        })
      }
    }
  },

  // Shared with article comments; the helper owns the state machine above.
  ...commentThread,

  retry() {
    return this.loadMoment()
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/index/index' })
  },

  openTag(e) {
    const tag = e.currentTarget.dataset.tag
    if (!tag) return
    wx.navigateTo({ url: `/pages/moments/moments?tag=${encodeURIComponent(tag)}` })
  },

  goPostDetail(e) {
    const name = e.detail && e.detail.name
    if (!name) return
    wx.navigateTo({ url: `/pages/post-detail/post-detail?name=${encodeURIComponent(name)}` })
  },

  handleLinkTap(e) {
    const href = e.detail && e.detail.href
    if (/^https:\/\//i.test(href || '')) wx.setClipboardData({ data: href })
  },

  handleUpvote() {
    if (!this.data.moment || (this.data.status !== 'ready' && this.data.status !== 'empty')) {
      return Promise.resolve()
    }
    if (this.data.upvoted) {
      wx.showToast({ title: '已经赞过了', icon: 'none' })
      return Promise.resolve()
    }
    if (this._upvotePromise) return this._upvotePromise

    this.setData({ upvoting: true })
    const request = api
      .upvoteSubject({ group: 'moment.halo.run', plural: 'moments', name: this.data.name })
      .then(() => {
        if (this._unloaded) return
        likes.markUpvotedSubject('moment', this.data.name)
        this.setData({
          upvoted: true,
          'moment.stats.upvote': this.data.moment.stats.upvote + 1
        })
        wx.showToast({ title: '点赞成功', icon: 'none' })
      })
      .catch(() => {
        if (!this._unloaded) wx.showToast({ title: '点赞失败，请稍后重试', icon: 'none' })
      })
      .finally(() => {
        if (!this._unloaded) this.setData({ upvoting: false })
        if (this._upvotePromise === request) this._upvotePromise = null
      })
    this._upvotePromise = request
    return request
  },

  handleShare() {
    wx.showShareMenu({ withShareTicket: false })
    wx.showToast({ title: '点击右上角分享', icon: 'none' })
  },

  onShareAppMessage() {
    const moment = this.data.moment
    const titleText = moment && moment.text ? Array.from(moment.text).slice(0, 42).join('') : ''
    const photo =
      moment && Array.isArray(moment.media)
        ? moment.media.find((item) => item.type === 'PHOTO' && item.supported && /^https:\/\//i.test(item.url))
        : null
    return {
      title: titleText || (moment ? `${moment.owner.displayName || '博主'}的瞬间` : '分享瞬间'),
      path: `/pages/moment-detail/moment-detail?name=${encodeURIComponent(this.data.name)}`,
      imageUrl: (photo && photo.url) || ''
    }
  }
})
