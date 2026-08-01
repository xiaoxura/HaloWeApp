const { test } = require('node:test')
const assert = require('node:assert')

const { resolveUrl, resolveHtmlAssets } = require('../utils/asset')
const config = require('../config/index')

const BASE = config.baseUrl

test('resolveUrl: 空值与非法输入返回空字符串', () => {
  assert.strictEqual(resolveUrl(''), '')
  assert.strictEqual(resolveUrl(null), '')
  assert.strictEqual(resolveUrl(undefined), '')
  assert.strictEqual(resolveUrl(123), '')
  assert.strictEqual(resolveUrl('   '), '')
})

test('resolveUrl: 绝对地址不重复处理', () => {
  assert.strictEqual(resolveUrl('https://cdn.x.com/a.png'), 'https://cdn.x.com/a.png')
  assert.strictEqual(resolveUrl('http://cdn.x.com/a.png'), 'http://cdn.x.com/a.png')
  assert.strictEqual(resolveUrl('data:image/png;base64,abc'), 'data:image/png;base64,abc')
  assert.strictEqual(resolveUrl('wxfile://tmp/a.png'), 'wxfile://tmp/a.png')
})

test('resolveUrl: 协议相对地址补 https', () => {
  assert.strictEqual(resolveUrl('//cdn.x.com/a.png'), 'https://cdn.x.com/a.png')
})

test('resolveUrl: 相对地址补全站点域名（B-02）', () => {
  assert.strictEqual(resolveUrl('/upload/a.png'), `${BASE}/upload/a.png`)
  assert.strictEqual(resolveUrl('upload/a.png'), `${BASE}/upload/a.png`)
})

test('resolveHtmlAssets: 仅补全 img 的相对 src', () => {
  const html =
    '<p><img src="/upload/a.png"/></p>' +
    '<p><img src="https://cdn.x.com/b.png"/></p>' +
    '<p><img src="data:image/png;base64,x"/></p>' +
    "<img src='/upload/c.png'>"
  const out = resolveHtmlAssets(html)
  assert.ok(out.includes(`src="${BASE}/upload/a.png"`))
  assert.ok(out.includes('src="https://cdn.x.com/b.png"'))
  assert.ok(out.includes('src="data:image/png;base64,x"'))
  assert.ok(out.includes(`src='${BASE}/upload/c.png'`))
})

test('resolveHtmlAssets: 空输入安全返回', () => {
  assert.strictEqual(resolveHtmlAssets(''), '')
  assert.strictEqual(resolveHtmlAssets(null), '')
})
