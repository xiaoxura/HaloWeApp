const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const {
  htmlToText,
  normalizeComment,
  normalizeCommentList,
  normalizeReplyList
} = require('../utils/adapters/comment')
const config = require('../config/index')

const fixtureDir = path.join(__dirname, 'fixtures')
const load = (f) => JSON.parse(fs.readFileSync(path.join(fixtureDir, f), 'utf8'))

// ===== htmlToText =====

test('htmlToText: <p> 与 <br> 转为换行', () => {
  assert.strictEqual(htmlToText('<p>第一段</p><p>第二段</p>'), '第一段\n第二段')
  assert.strictEqual(htmlToText('第一行<br>第二行<br/>第三行'), '第一行\n第二行\n第三行')
})

test('htmlToText: 解码常见 HTML 实体', () => {
  assert.strictEqual(htmlToText('&lt;tag&gt; &amp; &quot;引号&quot; &#39;单引号&#39;'), '<tag> & "引号" \'单引号\'')
  assert.strictEqual(htmlToText('a&nbsp;b'), 'a b')
  // 单遍解码，不二次解码
  assert.strictEqual(htmlToText('&amp;lt;'), '&lt;')
})

test('htmlToText: 剥离 script / 事件属性 / 未知标签', () => {
  const dirty = '<p>正常</p><script>alert("xss")</script><p onclick="hack()">段落</p>'
  const text = htmlToText(dirty)
  assert.strictEqual(text, '正常\n段落')
  assert.ok(!text.includes('alert'))
  assert.ok(!text.includes('onclick'))
})

test('htmlToText: 空值与异常输入安全降级', () => {
  assert.strictEqual(htmlToText(''), '')
  assert.strictEqual(htmlToText(null), '')
  assert.strictEqual(htmlToText(undefined), '')
  assert.strictEqual(htmlToText(123), '')
})

// ===== normalizeCommentList（Halo 2.25 分页对象结构） =====

test('commentList: 2.25 夹具转换（replies 为分页对象，C-01）', () => {
  const res = load('comments-paged.json')
  const out = normalizeCommentList(res)
  assert.strictEqual(out.comments.length, 3)
  assert.strictEqual(out.total, 23)
  assert.strictEqual(out.hasNext, true)

  const pinned = out.comments[0]
  assert.strictEqual(pinned.top, true)
  assert.strictEqual(pinned.author, '置顶读者')
  // 相对头像补全域名
  assert.strictEqual(pinned.avatar, `${config.baseUrl}/upload/avatar-reader-01.png`)
  // HTML 转纯文本 + 实体解码（解码后的 < 是纯文本字符，不会被渲染）
  assert.strictEqual(pinned.content, '置顶评论：欢迎留言讨论。<友好交流>&&共同进步')

  const withReplies = out.comments[1]
  assert.strictEqual(withReplies.replyCount, 5)
  assert.strictEqual(withReplies.replyHasNext, true)
  assert.strictEqual(withReplies.replies.length, 2)
  assert.strictEqual(withReplies.content, '写得很清楚，收藏了 👍\n请问有配套源码吗？')

  const reply = withReplies.replies[0]
  assert.strictEqual(reply.author, '博主')
  assert.strictEqual(reply.content, '感谢支持！\n后续会更新第二部分。')

  // 引用回复
  const quoted = withReplies.replies[1]
  assert.strictEqual(quoted.quoteAuthor, '博主')
  assert.strictEqual(quoted.quoteContent, '感谢支持！\n后续会更新第二部分。')

  // 真实 <script> 标签连同内容被移除；实体编码的 <script> 按纯文本展示（不执行，C-02 安全）
  const xss = out.comments[2]
  assert.ok(!xss.content.includes('xss'))
  assert.ok(!xss.content.includes('onclick'))
  assert.ok(xss.content.includes('试试特殊字符 <script>alert(1)</script>'))
  assert.ok(xss.content.includes('带事件的段落'))
})

test('commentList: 第二页夹具分页字段正确', () => {
  const out = normalizeCommentList(load('comments-paged-page2.json'))
  assert.strictEqual(out.page, 2)
  assert.strictEqual(out.hasNext, false)
  assert.strictEqual(out.comments.length, 1)
})

// ===== normalizeCommentList（旧版本数组结构） =====

test('commentList: 旧版夹具转换（replies 为数组）', () => {
  const out = normalizeCommentList(load('comments-legacy-array.json'))
  assert.strictEqual(out.comments.length, 2)

  const first = out.comments[0]
  assert.strictEqual(first.replies.length, 1)
  // 数组结构无法分页
  assert.strictEqual(first.replyHasNext, false)
  assert.strictEqual(first.replyCount, 1)
  assert.strictEqual(first.replies[0].content, '旧版本回复结构（数组形式）')

  const second = out.comments[1]
  assert.strictEqual(second.replies.length, 0)
  assert.strictEqual(second.replyCount, 0)
})

// ===== 空与降级 =====

test('commentList: 空列表夹具', () => {
  const out = normalizeCommentList(load('comments-empty.json'))
  assert.strictEqual(out.comments.length, 0)
  assert.strictEqual(out.total, 0)
  assert.strictEqual(out.hasNext, false)
})

test('commentList: 缺失 owner/spec/replies 安全降级（不崩溃）', () => {
  const out = normalizeCommentList(load('comments-degraded.json'))
  assert.strictEqual(out.comments.length, 3)
  out.comments.forEach((c) => {
    assert.strictEqual(typeof c.author, 'string')
    assert.strictEqual(typeof c.content, 'string')
    assert.ok(Array.isArray(c.replies))
  })
  assert.strictEqual(out.comments[0].author, '访客')
  assert.strictEqual(out.comments[0].content, '缺失 owner 的评论')

  const empty = normalizeCommentList(null)
  assert.strictEqual(empty.comments.length, 0)

  const single = normalizeComment(null)
  assert.strictEqual(single.name, '')
  assert.strictEqual(single.author, '访客')
  assert.strictEqual(single.content, '')
  assert.strictEqual(single.approved, false)
})

// ===== normalizeReplyList =====

test('replyList: 回复分页夹具转换', () => {
  const out = normalizeReplyList(load('comment-replies-page1.json'))
  assert.strictEqual(out.replies.length, 2)
  assert.strictEqual(out.hasNext, true)
  assert.strictEqual(out.total, 12)
  assert.strictEqual(out.replies[1].quoteAuthor, '博主')

  const page2 = normalizeReplyList(load('comment-replies-page2.json'))
  assert.strictEqual(page2.page, 2)
  assert.strictEqual(page2.hasNext, false)
  assert.strictEqual(page2.replies[0].content, '第二页的回复 >> 测试')
})
