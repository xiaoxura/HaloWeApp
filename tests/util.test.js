const { test } = require('node:test')
const assert = require('node:assert')

const { parseSemver, compareSemver } = require('../utils/util')

test('semver: 解析合法版本', () => {
  assert.deepStrictEqual(parseSemver('0.3.0'), { major: 0, minor: 3, patch: 0, prerelease: [] })
  assert.deepStrictEqual(parseSemver('1.2.3-rc.1'), {
    major: 1,
    minor: 2,
    patch: 3,
    prerelease: ['rc', '1']
  })
  assert.deepStrictEqual(parseSemver('1.0.0+build.5'), { major: 1, minor: 0, patch: 0, prerelease: [] })
})

test('semver: 非法版本返回 null', () => {
  assert.strictEqual(parseSemver('1.0'), null)
  assert.strictEqual(parseSemver('v1.0.0'), null)
  assert.strictEqual(parseSemver('1.0.0.0'), null)
  assert.strictEqual(parseSemver('01.2.3'), null)
  assert.strictEqual(parseSemver('not-a-version'), null)
  assert.strictEqual(parseSemver(''), null)
  assert.strictEqual(parseSemver(null), null)
  assert.strictEqual(parseSemver(undefined), null)
})

test('semver: 主/次/补丁比较', () => {
  assert.strictEqual(compareSemver('0.2.0', '0.3.0'), -1)
  assert.strictEqual(compareSemver('0.3.0', '0.3.0'), 0)
  assert.strictEqual(compareSemver('1.0.0', '0.9.9'), 1)
  assert.strictEqual(compareSemver('0.3.1', '0.3.0'), 1)
})

test('semver: 预发布版本规则（semver.org #11）', () => {
  // 无预发布 > 有预发布
  assert.strictEqual(compareSemver('0.3.0-rc.1', '0.3.0'), -1)
  assert.strictEqual(compareSemver('0.3.0', '0.3.0-rc.1'), 1)
  // 数字标识符按数值比较
  assert.strictEqual(compareSemver('1.0.0-alpha.2', '1.0.0-alpha.10'), -1)
  // 数字 < 字母
  assert.strictEqual(compareSemver('1.0.0-1', '1.0.0-alpha'), -1)
  // 字母按 ASCII
  assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0-beta'), -1)
  // 字段数少者小
  assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1)
})

test('semver: 任一非法返回 null（调用方忽略比较）', () => {
  assert.strictEqual(compareSemver('bad', '0.3.0'), null)
  assert.strictEqual(compareSemver('0.3.0', 'bad'), null)
  assert.strictEqual(compareSemver(null, undefined), null)
})
