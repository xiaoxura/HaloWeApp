const { test } = require('node:test')
const assert = require('node:assert')

const apiPath = require.resolve('../utils/api')
const capabilitiesPath = require.resolve('../utils/plugin-capabilities')
const pagePath = require.resolve('../pages/search/search.js')

test('search page: clearing input invalidates an in-flight response', async () => {
  let resolveSearch
  const searchPromise = new Promise((resolve) => {
    resolveSearch = resolve
  })
  const originalApi = require.cache[apiPath]
  const originalCapabilities = require.cache[capabilitiesPath]
  const originalPage = require.cache[pagePath]
  const originalPageGlobal = global.Page
  const originalGetApp = global.getApp
  const originalWx = global.wx
  let page

  require.cache[apiPath] = {
    id: apiPath,
    filename: apiPath,
    loaded: true,
    exports: { search: () => searchPromise }
  }
  delete require.cache[capabilitiesPath]
  delete require.cache[pagePath]
  global.Page = (definition) => {
    page = definition
  }
  global.getApp = () => ({
    runtimeReady: () => Promise.resolve(),
    runtimeConfig: { canReadMoments: () => false }
  })
  global.wx = {
    getStorageSync: () => [],
    setStorageSync: () => {}
  }

  try {
    require(pagePath)
    const instance = {
      data: { ...page.data },
      setData(patch) {
        Object.assign(this.data, patch)
      }
    }
    page.onLoad.call(instance)
    instance.data.keyword = 'old query'
    const request = page.onSearch.call(instance)
    await new Promise((resolve) => setImmediate(resolve))

    page.onClearInput.call(instance)
    resolveSearch({ hits: [] })
    await request

    assert.strictEqual(instance.data.status, 'idle')
    assert.deepStrictEqual(instance.data.results, [])
    assert.strictEqual(instance.data.total, 0)
    assert.deepStrictEqual(instance.data.history, [])
  } finally {
    if (originalApi) require.cache[apiPath] = originalApi
    else delete require.cache[apiPath]
    if (originalCapabilities) require.cache[capabilitiesPath] = originalCapabilities
    else delete require.cache[capabilitiesPath]
    if (originalPage) require.cache[pagePath] = originalPage
    else delete require.cache[pagePath]
    global.Page = originalPageGlobal
    global.getApp = originalGetApp
    global.wx = originalWx
  }
})
