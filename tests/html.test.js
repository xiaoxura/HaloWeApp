const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const {
  pickContent,
  sanitizeHtml,
  downgradeCustomTags,
  applyLayoutFixes,
  extractCodeBlocks,
  preparePostContent
} = require('../utils/html')
const config = require('../config/index')

const fixtureDir = path.join(__dirname, 'fixtures')
const detailFixtures = fs
  .readdirSync(fixtureDir)
  .filter((f) => f.startsWith('post-'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(fixtureDir, f), 'utf8')))

test('pickContent: 优先 content.content（B-01）', () => {
  const html = pickContent({ content: '<p>rendered</p>', raw: '# markdown', html: '<p>legacy</p>' })
  assert.strictEqual(html, '<p>rendered</p>')
})

test('pickContent: 兼容 content.html 与 content.raw', () => {
  assert.strictEqual(pickContent({ html: '<p>legacy</p>', raw: 'raw text' }), '<p>legacy</p>')
  assert.strictEqual(pickContent({ raw: '<p>raw html</p>' }), '<p>raw html</p>')
})

test('pickContent: 空值安全返回空字符串', () => {
  assert.strictEqual(pickContent(null), '')
  assert.strictEqual(pickContent({}), '')
  assert.strictEqual(pickContent({ content: '  ', raw: '' }), '')
  assert.strictEqual(pickContent('<p>直接是字符串</p>'), '<p>直接是字符串</p>')
})

test('sanitizeHtml: 移除 script/iframe/style 及内容', () => {
  const html =
    '<style class="pjax">pre{filter:blur(10px)}</style><p>正文</p>' +
    '<script>alert(1)</script><iframe src="https://x.com"></iframe>'
  const out = sanitizeHtml(html)
  assert.ok(!/<style/i.test(out))
  assert.ok(!/<script/i.test(out))
  assert.ok(!/<iframe/i.test(out))
  assert.ok(out.includes('<p>正文</p>'))
})

test('sanitizeHtml: 移除事件属性与 javascript: 协议', () => {
  const out = sanitizeHtml(
    '<p onclick="steal()">x</p><a href="javascript:alert(1)">y</a><img onerror=hack() src="a.png">'
  )
  assert.ok(!/onclick/i.test(out))
  assert.ok(!/onerror/i.test(out))
  assert.ok(!/javascript:/i.test(out))
})

test('sanitizeHtml: 未加引号和控制空白协议同样安全降级', () => {
  const out = sanitizeHtml(
    '<a href=javascript:alert(1)>a</a><img src="java\nscript:alert(2)"><a href="vbscript:evil">b</a>'
  )
  assert.ok(!/(?:javascript|vbscript):/i.test(out), out)
  assert.ok(!/href\s*=\s*javascript/i.test(out), out)
  assert.ok(!/src\s*=\s*java/i.test(out), out)
  assert.match(out, /href="#"/)
  assert.match(out, /src="#"/)
})

test('sanitizeHtml: HTML 实体不能隐藏危险协议', () => {
  const out = sanitizeHtml(
    '<a href="java&#x0a;script:alert(1)">a</a>' +
      '<a href="javascript&colon;alert(2)">b</a>' +
      '<img src="data&#x3a;text/html,<svg onload=alert(3)">' +
      '<div style="background:url( java&#x0a;script:alert(4) )">css</div>' +
      '<div style="background:url(data&#x3a;text/html,evil)">data</div>'
  )
  assert.ok(!/(?:javascript|vbscript):/i.test(out), out)
  assert.ok(!/data:text\/html/i.test(out), out)
  assert.strictEqual((out.match(/href="#"/g) || []).length, 2)
  assert.match(out, /src="#"/)
  assert.ok(!/style=/i.test(out), out)
  const cssOut = sanitizeHtml(
    '<div style="background:url(java/**/script:alert(1))">comment</div>' +
      '<div style="background:url(j\\61vascript:alert(2))">escape</div>' +
      '<div style="background:url(\\000064ata:text/html,evil)">data</div>'
  )
  assert.ok(!/style=/i.test(cssOut), cssOut)
  assert.ok(!/(?:javascript|vbscript):/i.test(cssOut), cssOut)
  assert.ok(!/data:text\/html/i.test(cssOut), cssOut)
})

test('downgradeCustomTags: shiki-code 降级为 div 并保留 pre', () => {
  const html =
    '<shiki-code variant="mac" light-theme="github-light"><pre><code class="language-js">x=1</code></pre></shiki-code>'
  const out = downgradeCustomTags(html)
  assert.ok(!/<shiki-code/i.test(out))
  assert.ok(!/<\/shiki-code/i.test(out))
  assert.ok(out.includes('<div class="shiki-code"'))
  assert.ok(out.includes('<pre><code class="language-js">x=1</code></pre>'))
})

test('downgradeCustomTags: hyperlink-card 降级为链接卡片并保留内部链接', () => {
  const html =
    '<hyperlink-card target="_blank" href="https://x.com"><a href="https://x.com">x</a></hyperlink-card>'
  const out = downgradeCustomTags(html)
  assert.ok(!/<hyperlink-card/i.test(out))
  assert.ok(/<div style="[^"]*background-image:url\(data:image\/svg\+xml/.test(out), out)
  assert.ok(/word-break:break-all/.test(out))
  assert.ok(out.includes('<a href="https://x.com">x</a>'))
})

test('applyLayoutFixes: pre 包裹容器并获得横向滚动样式与复制按钮', () => {
  const out = applyLayoutFixes('<pre><code>code</code></pre><pre style="color:red">x</pre>')
  // 每个 pre 被相对定位容器包裹，内含 copy:// 索引锚点
  const wraps = out.match(/<div style="position:relative;margin:24rpx 0;">/g)
  assert.strictEqual(wraps.length, 2)
  assert.ok(out.includes('href="copy://0"'))
  assert.ok(out.includes('href="copy://1"'))
  const pres = out.match(/<pre[^>]*>/g)
  assert.strictEqual(pres.length, 2)
  pres.forEach((p) => assert.ok(/overflow-x:auto/.test(p), p))
  // 已有 style 不丢失
  assert.ok(/color:red/.test(out))
})

test('extractCodeBlocks: 按文档顺序提取纯文本并解码实体', () => {
  const html = preparePostContent(
    '<p>x</p><pre><code class="language-js">if (a &gt; b &amp;&amp; c) {\n  go();\n}</code></pre>' +
      '<pre>echo &quot;hi&quot;</pre>'
  )
  const blocks = extractCodeBlocks(html)
  assert.strictEqual(blocks.length, 2)
  assert.strictEqual(blocks[0], 'if (a > b && c) {\n  go();\n}')
  assert.strictEqual(blocks[1], 'echo "hi"')
  // 与渲染产物中的 copy:// 索引一一对应
  assert.ok(html.includes('href="copy://0"'))
  assert.ok(html.includes('href="copy://1"'))
})

test('extractCodeBlocks: 单遍解码不二次展开', () => {
  assert.deepStrictEqual(extractCodeBlocks('<pre>&amp;lt;</pre>'), ['&lt;'])
  assert.deepStrictEqual(extractCodeBlocks(''), [])
  assert.deepStrictEqual(extractCodeBlocks(null), [])
})

test('applyLayoutFixes: table 包裹滚动容器', () => {
  const out = applyLayoutFixes('<table><tr><td>1</td></tr></table>')
  assert.ok(/<div style="overflow-x:auto[^"]*"><table>/.test(out))
})

// ===== 真实夹具回归：11 篇不同结构文章 =====

test('fixtures: 所有真实详情夹具都能选出正文且不含危险标签', () => {
  assert.ok(detailFixtures.length >= 10, `夹具数量不足: ${detailFixtures.length}`)
  detailFixtures.forEach((fx) => {
    const prepared = preparePostContent(pickContent(fx.content))
    assert.ok(prepared.length > 100, `${fx.metadata.name} 正文为空或过短`)
    assert.ok(!/<script/i.test(prepared), `${fx.metadata.name} 含 script`)
    assert.ok(!/<iframe/i.test(prepared), `${fx.metadata.name} 含 iframe`)
    assert.ok(!/<style/i.test(prepared), `${fx.metadata.name} 含 style`)
    assert.ok(!/<shiki-code/i.test(prepared), `${fx.metadata.name} 含未降级 shiki-code`)
    assert.ok(!/<hyperlink-card/i.test(prepared), `${fx.metadata.name} 含未降级 hyperlink-card`)
    assert.ok(!/\son[a-z]+\s*=/i.test(prepared), `${fx.metadata.name} 含事件属性`)
  })
})

test('fixtures: 主题注入的全局 style 被清除（pjax）', () => {
  const fx = detailFixtures.find((f) => /<style class="pjax"/.test(f.content.content || ''))
  assert.ok(fx, '缺少含 pjax style 的夹具')
  const prepared = preparePostContent(pickContent(fx.content))
  assert.ok(!/pjax/.test(prepared))
})

test('fixtures: 相对资源地址被补全，CDN 地址不受影响', () => {
  const fx = detailFixtures.find((f) => /cdn\.uomn\.cn/.test(f.content.content || ''))
  assert.ok(fx, '缺少含 CDN 图片的夹具')
  const prepared = preparePostContent(pickContent(fx.content))
  assert.ok(prepared.includes('https://cdn.uomn.cn/'), 'CDN 地址应保留')
})

test('fixtures: 含代码块夹具的 copy:// 锚点与提取块数一致', () => {
  let withPre = 0
  detailFixtures.forEach((fx) => {
    const prepared = preparePostContent(pickContent(fx.content))
    const anchors = (prepared.match(/href="copy:\/\/\d+"/g) || []).length
    const blocks = extractCodeBlocks(prepared).length
    const pres = (prepared.match(/<pre\b/g) || []).length
    assert.strictEqual(anchors, pres, `${fx.metadata.name} 锚点与 pre 数不一致`)
    assert.strictEqual(blocks, pres, `${fx.metadata.name} 提取块数与 pre 数不一致`)
    if (pres) withPre += 1
  })
  assert.ok(withPre > 0, '缺少含代码块的夹具')
})

test('preparePostContent: 合成的相对图片地址补全', () => {
  const out = preparePostContent('<p><img src="/upload/in-post.png"/></p>')
  assert.ok(out.includes(`src="${config.baseUrl}/upload/in-post.png"`))
})
