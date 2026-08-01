const config = require('./config/index')
const { runtimeConfig } = require('./utils/runtime-config')

App({
  // 运行时配置管理器（页面用 canSubmit/canReply/isVersionOk 做写能力判定）
  runtimeConfig,

  globalData: {
    config,
    // 运行时可被远程配置覆盖（配套插件下发），默认本地配置
    runtime: {
      commentEnabled: !!config.commentEnabled
    }
  },

  onLaunch() {
    this.loadFont()
    // 远程配置就绪后覆盖运行时配置；任何异常都保持本地默认值
    runtimeConfig.ready().then((runtime) => {
      Object.assign(this.globalData.runtime, runtime)
    })
  },

  // 页面通过统一的就绪 Promise 获取配置，避免启动时序竞争
  runtimeReady() {
    return runtimeConfig.ready().then(() => this.globalData.runtime)
  },

  // 加载自定义字体（霞鹜文楷），失败不影响系统字体兜底
  loadFont() {
    if (!config.fontUrl) return
    wx.loadFontFace({
      family: 'LXGW WenKai',
      source: `url("${config.fontUrl}")`,
      fail: (err) => console.warn('字体加载失败，使用系统字体', err)
    })
  }
})
