const config = require('../config/index')

/**
 * 序列化查询参数
 * 数组值序列化为重复 key（Halo API 约定 arrayFormat: repeat）：
 *   { sort: ['a,desc', 'b,desc'] } => 'sort=a,desc&sort=b,desc'
 */
function serialize(params) {
  if (!params) return ''
  const parts = []
  Object.keys(params).forEach((key) => {
    const value = params[key]
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      value.forEach((item) => parts.push(`${key}=${encodeURIComponent(item)}`))
    } else {
      parts.push(`${key}=${encodeURIComponent(value)}`)
    }
  })
  return parts.length ? `?${parts.join('&')}` : ''
}

/**
 * wx.request 封装
 * @param {string} method GET / POST / ...
 * @param {string} path 接口路径（/apis/... 开头）
 * @param {object} options { params: query 参数, data: body 数据, header: 自定义请求头 }
 */
function request(method, path, options = {}) {
  const { params, data, header = {} } = options
  const url = `${config.baseUrl}${path}${method === 'GET' ? serialize(params) : ''}`

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      header: { 'content-type': 'application/json', ...header },
      timeout: 10000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(new Error(`请求失败 ${res.statusCode}: ${path}`))
        }
      },
      fail: (err) => reject(err)
    })
  })
}

module.exports = {
  get: (path, params, header) => request('GET', path, { params, header }),
  post: (path, data, header) => request('POST', path, { data, header })
}
