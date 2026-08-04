const config = require('../config/index')
const api = require('./api')
const { normalizeCommentList, normalizeReplyList } = require('./adapters/comment')
const { uuid } = require('./util')
const { commentSession } = require('./comment-session')
const { AUTH_STORAGE_KEYS } = require('./auth-session')

const COMMENT_PAGE_SIZE = 10
const REPLY_FIRST_SIZE = 5
const REPLY_PAGE_SIZE = 10
const NICKNAME_KEY = 'commentNickname'
const CONSENT_KEY = AUTH_STORAGE_KEYS.CONSENT

/**
 * Shared comment/reply state machine for Post and Moment detail pages.
 *
 * The page owns only its content loading and rendering.  This module owns
 * pagination, reply expansion, privacy consent, session reuse, idempotency,
 * and stable server-error handling; subject identity is supplied by the page.
 */
function createCommentThread(options = {}) {
  const isMoment = options.isMoment === true
  const getSubject = typeof options.getSubject === 'function'
    ? options.getSubject
    : (page) => ({
        group: 'content.halo.run',
        kind: 'Post',
        version: 'v1alpha1',
        name: page.data.name
      })

  function subject(page) {
    const value = getSubject(page) || {}
    return {
      group: value.group,
      kind: value.kind,
      version: value.version,
      name: value.name
    }
  }

  function canSubmit(runtime) {
    if (isMoment && typeof runtime.canSubmitMomentComment === 'function') {
      return runtime.canSubmitMomentComment()
    }
    return typeof runtime.canSubmit === 'function' && runtime.canSubmit()
  }

  function canReply(runtime, cfg) {
    return canSubmit(runtime) && !!(cfg.commentOptions && cfg.commentOptions.replyEnabled)
  }

  function configureComments(runtime) {
    const cfg = runtime.getConfig()
    const options = cfg.commentOptions || {}
    this.setData({
      commentEnabled: cfg.commentEnabled === true,
      commentSubmitEnabled: canSubmit(runtime),
      commentReplyEnabled: canReply(runtime, cfg),
      commentMaxLength: options.maxLength || 500,
      privacyUrl: cfg.privacyPolicyUrl || '',
      privacyVersion: cfg.privacyPolicyVersion || '',
      consentGiven: readConsent(cfg.privacyPolicyVersion)
    })
  }

  function readConsent(version) {
    if (!version) return true
    try {
      return wx.getStorageSync(CONSENT_KEY) === version
    } catch (e) {
      return false
    }
  }

  async function fetchComments(page = 1) {
    if (this._commentsLoading || this._unloaded) return
    this._commentsLoading = true
    this.setData({ commentLoading: true, commentLoadError: false })
    try {
      const res = await api.getCommentList({
        ...subject(this),
        page,
        size: COMMENT_PAGE_SIZE,
        withReplies: true,
        replySize: REPLY_FIRST_SIZE
      })
      if (this._unloaded) return
      const { comments, total, hasNext } = normalizeCommentList(res)
      const fresh = comments.map((comment) => ({ ...comment, replyPage: 1 }))
      const list = page === 1
        ? fresh
        : this.data.comments.concat(
            fresh.filter((comment) => !this.data.comments.some((item) => item.name === comment.name))
          )
      this.setData({
        comments: list,
        commentTotal: total,
        commentHasNext: hasNext,
        commentPage: page
      })
    } catch (err) {
      if (!this._unloaded) {
        console.error(isMoment ? '加载瞬间评论失败' : '加载评论失败',
          err && err.type || '', err && err.statusCode || '')
        this.setData({ commentLoadError: true })
      }
    } finally {
      this._commentsLoading = false
      if (!this._unloaded) this.setData({ commentLoading: false })
    }
  }

  function loadMoreComments() {
    if (this.data.commentHasNext && !this.data.commentLoading) {
      return fetchComments.call(this, this.data.commentPage + 1)
    }
  }

  function retryComments() {
    return fetchComments.call(this, this.data.comments.length ? this.data.commentPage : 1)
  }

  async function fetchReplies(e) {
    const name = e.currentTarget.dataset.name
    const index = this.data.comments.findIndex((comment) => comment.name === name)
    if (index < 0 || this._repliesLoading[name]) return
    const comment = this.data.comments[index]
    const nextPage = (comment.replyPage || 1) + 1
    this._repliesLoading[name] = true
    try {
      const res = await api.getCommentReplyList(name, { page: nextPage, size: REPLY_PAGE_SIZE })
      if (this._unloaded) return
      const { replies, hasNext } = normalizeReplyList(res)
      const currentIndex = this.data.comments.findIndex((item) => item.name === name)
      if (currentIndex < 0) return
      const currentComment = this.data.comments[currentIndex]
      const currentReplies = Array.isArray(currentComment.replies) ? currentComment.replies : []
      const merged = currentReplies.concat(
        replies.filter((reply) => !currentReplies.some((item) => item.name === reply.name))
      )
      this.setData({
        [`comments[${currentIndex}].replies`]: merged,
        [`comments[${currentIndex}].replyHasNext`]: hasNext,
        [`comments[${currentIndex}].replyPage`]: nextPage
      })
    } catch (err) {
      if (!this._unloaded) wx.showToast({ title: '回复加载失败，请重试', icon: 'none' })
    } finally {
      delete this._repliesLoading[name]
    }
  }

  async function refreshReplies(commentName) {
    const index = this.data.comments.findIndex((comment) => comment.name === commentName)
    if (index < 0) return
    try {
      const res = await api.getCommentReplyList(commentName, { page: 1, size: REPLY_PAGE_SIZE })
      if (this._unloaded) return
      const { replies, hasNext, total } = normalizeReplyList(res)
      const currentIndex = this.data.comments.findIndex((item) => item.name === commentName)
      if (currentIndex < 0) return
      this.setData({
        [`comments[${currentIndex}].replies`]: replies,
        [`comments[${currentIndex}].replyHasNext`]: hasNext,
        [`comments[${currentIndex}].replyPage`]: 1,
        [`comments[${currentIndex}].replyCount`]: total
      })
    } catch (err) {
      // The write result remains valid; a later expansion retries the read.
    }
  }

  function handleComment() {
    if (!this.data.commentSubmitEnabled) {
      wx.showToast({ title: isMoment ? '暂未开放瞬间评论' : '暂未开放评论', icon: 'none' })
      return
    }
    openSheet.call(this, null)
  }

  function handleReply(e) {
    if (!this.data.commentReplyEnabled) {
      wx.showToast({ title: '暂未开放回复', icon: 'none' })
      return
    }
    const ds = e.currentTarget.dataset
    openSheet.call(this, {
      commentName: ds.commentName,
      quoteReplyName: ds.quoteName || '',
      author: ds.author || '访客'
    })
  }

  function openSheet(target) {
    this._replyTarget = target
    this._idempotencyKey = uuid()
    let initialNickname = ''
    try {
      initialNickname = wx.getStorageSync(NICKNAME_KEY) || ''
    } catch (e) {
      initialNickname = ''
    }
    const app = getApp()
    if (app.authSession && typeof app.authSession.preferredDisplayName === 'function') {
      initialNickname = app.authSession.preferredDisplayName(initialNickname)
    }
    this.setData({
      sheetVisible: true,
      sheetReplyTo: target ? target.author : '',
      initialNickname
    })
  }

  function onSheetClose() {
    this.setData({ sheetVisible: false })
    this._replyTarget = null
    this._idempotencyKey = ''
  }

  function write(page, target, payload, header) {
    const name = subject(page).name
    return target
      ? api.submitPluginReply(target.commentName,
          { ...payload, quoteReplyName: target.quoteReplyName || undefined }, header)
      : isMoment
        ? api.submitPluginMomentComment(name, payload, header)
        : api.submitPluginComment({ ...payload, postName: name }, header)
  }

  async function onSheetSubmit(e) {
    const sheet = typeof this.selectComponent === 'function'
      ? this.selectComponent('#commentSheet')
      : null
    if (!sheet) return
    const { nickname, content, saveNickname } = e.detail
    const target = this._replyTarget
    const runtime = getApp().runtimeConfig
    const cfg = runtime.getConfig()
    const allowed = (target ? this.data.commentReplyEnabled : this.data.commentSubmitEnabled)
      && canSubmit(runtime)
    if (!allowed) {
      sheet.close()
      this.setData({ commentSubmitEnabled: false, commentReplyEnabled: false })
      wx.showToast({ title: isMoment ? '瞬间评论功能已关闭' : '评论功能已关闭', icon: 'none' })
      return
    }
    if (!this.data.consentGiven) {
      try {
        wx.setStorageSync(CONSENT_KEY, cfg.privacyPolicyVersion)
      } catch (err) {
        // Storage failure does not block the current write.
      }
      this.setData({ consentGiven: true })
    }
    const key = this._idempotencyKey || (this._idempotencyKey = uuid())
    const header = (token) => ({
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
      const result = await commentSession.withSession((token) =>
        write(this, target, payload, header(token)))
      if (this._unloaded) return
      try {
        if (saveNickname) wx.setStorageSync(NICKNAME_KEY, nickname)
        else wx.removeStorageSync(NICKNAME_KEY)
      } catch (err) {
        // Local nickname persistence is optional.
      }
      sheet.close()
      if (result && result.status === 'published') {
        wx.showToast({ title: '发表成功', icon: 'success' })
        if (target) refreshReplies.call(this, target.commentName)
        else fetchComments.call(this, 1)
      } else {
        wx.showToast({ title: '已提交，审核后可见', icon: 'none' })
      }
    } catch (err) {
      if (!this._unloaded) handleSubmitError.call(this, err, sheet)
    }
  }

  function handleSubmitError(err, sheet) {
    const code = err && err.data && err.data.code
    const message = err && err.data && err.data.message
    switch (code) {
      case 'VALIDATION_ERROR':
      case 'CONTENT_REVIEW':
      case 'CONTENT_RISKY':
        sheet.setError(message || '内容不符合要求，请修改后重试')
        break
      case 'RATE_LIMITED': {
        const wait = err.data && err.data.retryAfter
        sheet.setError(wait ? `操作过于频繁，请 ${wait} 秒后再试` : message || '操作过于频繁，请稍后再试')
        break
      }
      case 'MOMENT_COMMENT_DISABLED':
      case 'COMMENT_DISABLED':
      case 'REPLY_DISABLED':
        sheet.close()
        this.setData({ commentSubmitEnabled: false, commentReplyEnabled: false })
        wx.showToast({ title: message || (isMoment ? '瞬间评论功能已关闭' : '评论功能已关闭'), icon: 'none' })
        break
      case 'CLIENT_UPDATE_REQUIRED':
        sheet.close()
        this.setData({ commentSubmitEnabled: false, commentReplyEnabled: false })
        wx.showModal({ title: '需要更新', content: message || '请更新小程序后再评论', showCancel: false })
        break
      case 'MOMENT_NOT_FOUND':
      case 'POST_NOT_FOUND':
      case 'COMMENT_NOT_FOUND':
        sheet.close()
        wx.showToast({ title: message || '内容已不存在', icon: 'none' })
        break
      default:
        sheet.setError(message || '提交失败，请稍后重试')
    }
  }

  return {
    configureComments,
    fetchComments,
    loadMoreComments,
    retryComments,
    fetchReplies,
    refreshReplies,
    readConsent,
    handleComment,
    handleReply,
    openSheet,
    onSheetClose,
    onSheetSubmit,
    handleSubmitError
  }
}

module.exports = {
  COMMENT_PAGE_SIZE,
  REPLY_FIRST_SIZE,
  REPLY_PAGE_SIZE,
  createCommentThread
}
