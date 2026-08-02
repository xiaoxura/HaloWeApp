const api = require('../../utils/api')
const config = require('../../config/index')
const { formatCount } = require('../../utils/util')
const { validDisplayName } = require('../../utils/auth-session')

const app = getApp()
const authSession = app.authSession
const initialSite = app.runtimeConfig.getConfig().site

const BUSY_STATES = new Set(['logging-in', 'restoring', 'logging-out', 'deleting'])

function firstCharacter(value) {
  const chars = [...(value || '').trim()]
  return chars[0] || '读'
}

function stateText(snapshot) {
  switch (snapshot.state) {
    case 'logging-in': return '正在登录…'
    case 'restoring': return snapshot.operation === 'relogin' ? '会话已过期，正在恢复…' : '正在恢复登录…'
    case 'authenticated':
      return snapshot.error
        ? snapshot.error.message
        : (snapshot.authenticated ? '已登录微信读者' : '会话已过期，将在下次使用时恢复')
    case 'consent-required': return '隐私政策已更新，请重新确认后登录'
    case 'logging-out': return '正在退出…'
    case 'deleting': return '正在注销账号…'
    case 'error': return (snapshot.error && snapshot.error.message) || '登录状态恢复失败，可稍后重试'
    default: return snapshot.profile ? '缓存资料待恢复，当前未认证' : '登录后可跨设备恢复昵称'
  }
}

function errorMessage(err, fallback = '操作失败，请稍后重试') {
  return (err && err.data && err.data.message) || (err && err.message) || fallback
}

Page({
  data: {
    blogName: initialSite.blogName,
    blogDesc: initialSite.blogDesc,
    version: config.version,
    stats: {
      postCount: '--',
      categoryCount: '--',
      tagCount: '--',
      visitCount: '--'
    },
    commentEnabled: false,

    // 微信读者身份。cached profile 只用于展示，不等于 authenticated。
    authState: 'anonymous',
    authenticated: false,
    authProfile: null,
    avatarText: '读',
    authStatusText: '登录后可跨设备恢复昵称',
    authBusy: false,
    authOperation: '',
    authAvailable: false,
    readerFeatureEnabled: false,
    privacyUrl: '',
    privacyVersion: '',

    loginPanelVisible: false,
    loginNickname: '',
    loginConsentChecked: false,
    keepLogin: true,
    editVisible: false,
    editNickname: '',
    formError: ''
  },

  onLoad() {
    this._unloaded = false
    this._authAction = null
    this._unsubscribeAuth = authSession.subscribe((snapshot) => {
      if (!this._unloaded) this.applyAuth(snapshot)
    })
    app.runtimeReady().then((runtime) => {
      if (!this._unloaded) this.applyRuntime(runtime)
    })
    this.fetchStats()
  },

  onShow() {
    this.applyRuntime(app.globalData.runtime)
    this.applyAuth(authSession.getSnapshot())
  },

  onUnload() {
    this._unloaded = true
    if (this._unsubscribeAuth) this._unsubscribeAuth()
    this._unsubscribeAuth = null
  },

  applyRuntime(runtime) {
    const safeRuntime = runtime || app.runtimeConfig.getConfig()
    const site = safeRuntime.site || initialSite
    const features = safeRuntime.features || {}
    const reader = features.readerAccount || {}
    this.setData({
      blogName: site.blogName,
      blogDesc: site.blogDesc,
      commentEnabled: !!safeRuntime.commentEnabled,
      authAvailable: app.runtimeConfig.canLogin(),
      readerFeatureEnabled: reader.enabled === true,
      privacyUrl: safeRuntime.privacyPolicyUrl || '',
      privacyVersion: safeRuntime.privacyPolicyVersion || ''
    })
  },

  applyAuth(snapshot) {
    const profile = snapshot.profile
    const authenticated = snapshot.authenticated === true
    const busy = BUSY_STATES.has(snapshot.state) || !!snapshot.operation
    const next = {
      authState: snapshot.state,
      authenticated,
      authProfile: profile,
      avatarText: firstCharacter(profile && profile.displayName),
      authStatusText: stateText(snapshot),
      authBusy: busy,
      authOperation: snapshot.operation || '',
      keepLogin: snapshot.keepLogin !== false
    }
    if (authenticated) {
      next.loginPanelVisible = false
      next.loginConsentChecked = false
      if (!this.data.editVisible) next.editNickname = profile.displayName
      if (!snapshot.error) next.formError = ''
    }
    this.setData(next)
  },

  onPullDownRefresh() {
    const tasks = [this.fetchStats()]
    if (authSession.getState() === 'authenticated') {
      tasks.push(authSession.refreshProfile().catch(() => null))
    }
    Promise.allSettled(tasks).finally(() => wx.stopPullDownRefresh())
  },

  // 文章/分类/阅读来自 stats；标签数取标签列表响应 total。
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
      next.tagCount = formatCount((tagRes.value && tagRes.value.total) || 0)
    } else {
      console.error('加载标签数失败', tagRes.reason)
    }
    if (Object.keys(next).length && !this._unloaded) {
      this.setData({ stats: { ...this.data.stats, ...next } })
    } else if (!this._statsToastShown && !this._unloaded) {
      this._statsToastShown = true
      wx.showToast({ title: '加载失败，请检查网络', icon: 'none' })
    }
  },

  handleLogin() {
    if (this.data.authBusy || this.data.authenticated) return
    if (!app.runtimeConfig.canLogin()) {
      wx.showToast({
        title: this.data.readerFeatureEnabled ? '登录配置暂时不可用' : '微信读者登录暂未开放',
        icon: 'none'
      })
      return
    }
    const cached = authSession.getProfile()
    let nickname = (cached && cached.displayName) || ''
    if (!nickname) {
      try {
        nickname = wx.getStorageSync('commentNickname') || ''
      } catch (e) {
        nickname = ''
      }
    }
    this.setData({
      loginPanelVisible: true,
      loginNickname: nickname,
      loginConsentChecked: false,
      keepLogin: true,
      editVisible: false,
      formError: ''
    })
  },

  handlePrimaryAuth() {
    if (this.data.authState === 'authenticated' && this.data.authProfile) {
      this.retryRestore()
    } else {
      this.handleLogin()
    }
  },

  cancelLogin() {
    if (this.data.authBusy) return
    this.setData({ loginPanelVisible: false, loginConsentChecked: false, formError: '' })
  },

  onLoginNicknameInput(e) {
    this.setData({ loginNickname: e.detail.value || '', formError: '' })
  },

  onLoginConsentChange(e) {
    this.setData({ loginConsentChecked: !!(e.detail.value && e.detail.value.length), formError: '' })
  },

  onKeepLoginChange(e) {
    this.setData({ keepLogin: !!(e.detail.value && e.detail.value.length) })
  },

  copyPrivacyUrl() {
    if (!this.data.privacyUrl) return
    wx.setClipboardData({ data: this.data.privacyUrl })
  },

  async submitLogin() {
    if (this._authAction || this.data.authBusy) return
    const displayName = (this.data.loginNickname || '').trim()
    if (!validDisplayName(displayName)) {
      this.setData({ formError: '昵称需为 2～20 个字符' })
      return
    }
    if (!this.data.loginConsentChecked) {
      this.setData({ formError: '请先阅读并同意当前隐私政策' })
      return
    }
    const action = authSession.login({
      displayName,
      privacyConsentVersion: this.data.privacyVersion,
      consentGiven: true,
      keepLogin: this.data.keepLogin
    })
    this._authAction = action
    try {
      await action
      if (!this._unloaded) {
        this.setData({ loginPanelVisible: false, formError: '' })
        wx.showToast({ title: '登录成功', icon: 'success' })
      }
    } catch (err) {
      if (!this._unloaded) this.setData({ formError: errorMessage(err, '登录失败，请稍后重试') })
    } finally {
      if (this._authAction === action) this._authAction = null
    }
  },

  async retryRestore() {
    if (this._authAction || this.data.authBusy) return
    if (this.data.authState === 'consent-required' || !authSession.getSnapshot().keepLogin) {
      this.handleLogin()
      return
    }
    const action = authSession.restore()
    this._authAction = action
    try {
      await action
    } finally {
      if (this._authAction === action) this._authAction = null
    }
  },

  beginEdit() {
    if (!this.data.authenticated || this.data.authBusy) return
    if (!app.runtimeConfig.canLogin()) {
      wx.showToast({ title: '资料修改暂不可用', icon: 'none' })
      return
    }
    this.setData({
      editVisible: true,
      editNickname: this.data.authProfile.displayName,
      loginPanelVisible: false,
      formError: ''
    })
  },

  cancelEdit() {
    if (this.data.authBusy) return
    this.setData({ editVisible: false, formError: '' })
  },

  onEditNicknameInput(e) {
    this.setData({ editNickname: e.detail.value || '', formError: '' })
  },

  async submitEdit() {
    if (this._authAction || this.data.authBusy) return
    const displayName = (this.data.editNickname || '').trim()
    if (!validDisplayName(displayName)) {
      this.setData({ formError: '昵称需为 2～20 个字符' })
      return
    }
    const action = authSession.updateProfile(displayName)
    this._authAction = action
    try {
      await action
      if (!this._unloaded) {
        this.setData({ editVisible: false, formError: '' })
        wx.showToast({ title: '昵称已更新', icon: 'success' })
      }
    } catch (err) {
      if (!this._unloaded) {
        const consentRequired = err && err.data && err.data.code === 'PRIVACY_CONSENT_REQUIRED'
        this.setData({
          editVisible: !consentRequired,
          formError: errorMessage(err, '修改失败，请稍后重试')
        })
      }
    } finally {
      if (this._authAction === action) this._authAction = null
    }
  },

  handleLogout() {
    if (this._authAction || this.data.authBusy) return
    wx.showModal({
      title: '退出登录',
      content: '将退出当前设备并清除本机缓存资料，其他设备不受影响。',
      confirmText: '退出',
      success: (res) => {
        if (res.confirm) this.performLogout()
      }
    })
  },

  async performLogout() {
    if (this._authAction) return
    const action = authSession.logout()
    this._authAction = action
    try {
      await action
      if (!this._unloaded) wx.showToast({ title: '已退出', icon: 'none' })
    } catch (err) {
      // 本地会话已在 finally 清除；只提示服务端撤销可能因网络延迟。
      if (!this._unloaded) wx.showToast({ title: '已退出本机，请稍后检查网络', icon: 'none' })
    } finally {
      if (this._authAction === action) this._authAction = null
    }
  },

  handleDeleteAccount() {
    if (this._authAction || this.data.authBusy || !this.data.authenticated) return
    wx.showModal({
      title: '确认注销读者账号？',
      content: '注销后将删除微信读者资料并退出所有设备。已有公开评论不会自动删除。此操作不可撤销。',
      confirmText: '确认注销',
      confirmColor: '#e5484d',
      success: (res) => {
        if (res.confirm) this.performDeleteAccount()
      }
    })
  },

  async performDeleteAccount() {
    if (this._authAction) return
    const action = authSession.deleteAccount()
    this._authAction = action
    try {
      await action
      if (!this._unloaded) wx.showToast({ title: '账号已注销', icon: 'none' })
    } catch (err) {
      if (!this._unloaded) this.setData({ formError: errorMessage(err, '注销失败，请稍后重试') })
    } finally {
      if (this._authAction === action) this._authAction = null
    }
  }
})
