const config = require('./config/index')

App({
  globalData: {
    config,
    // 运行时可被远程配置覆盖（配套插件下发）
    runtime: {
      commentEnabled: config.commentEnabled
    }
  },

  onLaunch() {
    this.loadFont()
    this.fetchRemoteConfig()
  },

  // 加载自定义字体（霞鹜文楷），失败不影响系统字体兜底
  loadFont() {
    if (!config.fontUrl) return
    wx.loadFontFace({
      family: 'LXGW WenKai',
      source: `url("${config.fontUrl}")`,
      fail: (err) => console.warn('字体加载失败，使用系统字体', err)
    })
  },

  // 拉取配套插件下发的远程配置；插件未安装/请求失败时使用本地默认
  fetchRemoteConfig() {
    const stored = wx.getStorageSync('remoteConfig')
    if (stored) this.applyRemoteConfig(stored)

    wx.request({
      url: `${config.baseUrl}/apis/api.weapp.halo.run/v1alpha1/config`,
      timeout: 5000,
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          wx.setStorageSync('remoteConfig', res.data)
          this.applyRemoteConfig(res.data)
        }
      },
      fail: () => {
        // 插件不存在或网络异常，静默使用本地配置
      }
    })
  },

  applyRemoteConfig(remote) {
    if (typeof remote.commentEnabled === 'boolean') {
      this.globalData.runtime.commentEnabled = remote.commentEnabled
    }
  }
})
