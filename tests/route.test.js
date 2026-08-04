const { test } = require('node:test')
const assert = require('node:assert')

const { decodeRouteParam } = require('../utils/route')

test('route: malformed, empty and oversized parameters fail closed', () => {
  assert.strictEqual(decodeRouteParam('post%2Fname'), 'post/name')
  assert.strictEqual(decodeRouteParam('%E4%B8%AD%E6%96%87'), '中文')
  assert.strictEqual(decodeRouteParam('%E0%A4%A'), '')
  assert.strictEqual(decodeRouteParam(''), '')
  assert.strictEqual(decodeRouteParam('x'.repeat(129)), '')
  assert.strictEqual(decodeRouteParam('x'.repeat(11), 10), '')
  assert.strictEqual(decodeRouteParam(encodeURIComponent('tag\u0000value')), '')
  assert.strictEqual(decodeRouteParam(encodeURIComponent('zero\u200bwidth')), '')
  assert.strictEqual(decodeRouteParam(encodeURIComponent('bidi\u202evalue')), '')
  assert.strictEqual(decodeRouteParam(encodeURIComponent('word\u2060joiner')), '')
  assert.strictEqual(decodeRouteParam(encodeURIComponent('\ufeffbom')), '')
})
