const api = require('../../utils/api')
const { normalizePostSummary } = require('../../utils/adapters/post')
const { normalizeMomentList } = require('../../utils/adapters/moment')
const { pluginCapabilities } = require('../../utils/plugin-capabilities')
const { momentMediaSession } = require('../../utils/moment-media-session')

const app = getApp()

// 公告关闭状态按 announcement.version 保存：版本变化后再次展示
const ANNOUNCE_KEY = 'announcementDismissed'

Page({
  data: {
    bannerList: [],   // 置顶/带封面文章（轮播）
    postList: [],     // 文章列表
    page: 1,
    hasMore: true,
    loading: false,
    // 首屏加载失败标记（分页失败不清空列表，仅提示）
    loadFailed: false,
    showBackTop: false,
    // 远程公告（null = 不展示）
    announcement: null,
    // 可选 Moment 首页模块；任何依赖失败时静默隐藏，不占用文章状态。
    latestMoments: []
  },

  onLoad() {
    this._unloaded = false
    this._momentSequence = 0
    // 不阻塞首屏：先用内置默认值/有效缓存加载；首次拿到插件配置后，如分页大小不同，
    // 自动重载第一页，确保管理员在插件中配置的 pageSize 当次启动即可生效。
    const initialLoad = this.fetchPosts(true)
    this.applyRuntimeConfig(initialLoad)
    // Moment 分支只能在文章首屏请求已经启动后运行，并等待该请求结束；失败不影响文章。
    this.loadLatestMoments(initialLoad)
  },

  onHide() {
    momentMediaSession.destroy()
  },

  onUnload() {
    this._unloaded = true
    this._momentSequence += 1
    momentMediaSession.destroy()
  },

  // 远程配置消费：公告条与最低版本提示（C-06）
  applyRuntimeConfig(initialLoad) {
    app.runtimeReady().then(async () => {
      const rc = app.runtimeConfig
      const cfg = rc.getConfig()

      if (this._pageSize !== cfg.site.pageSize) {
        await initialLoad
        this._pageSize = cfg.site.pageSize
        await this.fetchPosts(true)
      }

      // 公告：可关闭，关闭状态按版本记录；降级缓存可展示公告但写入口仍关闭
      const ann = cfg.announcement || {}
      if (ann.enabled && ann.content) {
        let dismissed = ''
        try {
          dismissed = wx.getStorageSync(ANNOUNCE_KEY) || ''
        } catch (e) {
          dismissed = ''
        }
        if ((ann.version || '') !== dismissed) {
          this.setData({ announcement: { version: ann.version || '', content: ann.content } })
        }
      }

      // 最低版本：低于 minVersion 时提示更新机制，但不锁死文章阅读（写能力已在 runtime-config 关闭）
      if (!rc.isVersionOk()) {
        wx.showModal({
          title: '发现新版本',
          content:
            '当前小程序版本较低，互动功能已关闭。请等待微信自动更新，或删除小程序后重新打开。',
          showCancel: false,
          confirmText: '我知道了'
        })
      }
    })
  },

  dismissAnnouncement() {
    const ann = this.data.announcement
    if (!ann) return
    try {
      wx.setStorageSync(ANNOUNCE_KEY, ann.version || '')
    } catch (e) {
      // 存储失败仅影响本次关闭状态
    }
    this.setData({ announcement: null })
  },

  onPullDownRefresh() {
    // 刷新与触底加载互斥：请求进行中直接结束刷新动画
    if (this.data.loading) {
      wx.stopPullDownRefresh()
      return
    }
    const posts = this.fetchPosts(true)
    const moments = this.loadLatestMoments(posts)
    Promise.allSettled([posts, moments]).finally(() => wx.stopPullDownRefresh())
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
    // 一轮分页固定使用同一个 pageSize，避免远程配置在翻页中途更新导致跳项。
    if (refresh || !this._pageSize) {
      const cfg = app.runtimeConfig.getConfig()
      this._pageSize = cfg.site.pageSize
    }
    this.setData({ loading: true, loadFailed: false })

    try {
      const res = await api.getPostList({
        page,
        size: this._pageSize,
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

  async loadLatestMoments(afterPosts) {
    const sequence = ++this._momentSequence
    try {
      // Promise.resolve 同时兼容 fetchPosts 因单飞而返回 undefined 的分支。
      await Promise.resolve(afterPosts)
      if (this._unloaded || sequence !== this._momentSequence) return
      await app.runtimeReady()
      if (this._unloaded || sequence !== this._momentSequence) return
      if (!app.runtimeConfig.canReadMoments()) {
        this.setData({ latestMoments: [] })
        return
      }
      const available = await pluginCapabilities.momentsAvailable()
      if (this._unloaded || sequence !== this._momentSequence) return
      if (!available) {
        this.setData({ latestMoments: [] })
        return
      }
      const response = await api.getMomentList({
        page: 1,
        size: 3,
        sort: ['spec.releaseTime,desc']
      })
      if (this._unloaded || sequence !== this._momentSequence) return
      this.setData({ latestMoments: normalizeMomentList(response).moments.slice(0, 3) })
    } catch (err) {
      // 可选依赖 fail-soft：不弹 toast、不修改文章 loading/error 状态。
      if (!this._unloaded && sequence === this._momentSequence) {
        this.setData({ latestMoments: [] })
      }
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
  },

  goMoments() {
    wx.navigateTo({ url: '/pages/moments/moments' })
  },

  goMomentDetail(e) {
    const name = e.detail && e.detail.name
    if (!name) return
    wx.navigateTo({ url: `/pages/moment-detail/moment-detail?name=${encodeURIComponent(name)}` })
  },

  goMomentTag(e) {
    const tag = e.detail && e.detail.tag
    if (!tag) return
    wx.navigateTo({ url: `/pages/moments/moments?tag=${encodeURIComponent(tag)}` })
  }
})
