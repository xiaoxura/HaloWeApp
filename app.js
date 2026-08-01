const config = require('./config/index')
const { runtimeConfig } = require('./utils/runtime-config')

App({
  // 运行时配置管理器（页面用 canSubmit/canReply/isVersionOk 做写能力判定）
  runtimeConfig,

  globalData: {
    config,
    // 插件实时配置；网络请求完成前为内置安全默认值或未过期缓存
    runtime: runtimeConfig.getConfig()
  },

  onLaunch() {
    this.runtimeReady().then((runtime) => this.loadFont(runtime.site.fontUrl))
  },

  // 页面通过统一的就绪 Promise 获取配置，避免启动时序竞争
  runtimeReady() {
    return runtimeConfig.ready().then((runtime) => {
      this.globalData.runtime = runtime
      return runtime
    })
  },

  // 加载自定义字体（霞鹜文楷），失败不影响系统字体兜底
  loadFont(fontUrl) {
    if (!fontUrl) return
    wx.loadFontFace({
      family: 'LXGW WenKai',
      source: `url("${fontUrl}")`,
      fail: (err) => console.warn('字体加载失败，使用系统字体', err)
    })
  }
})
