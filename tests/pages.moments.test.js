const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')

const apiPath = require.resolve('../utils/api')
const capabilitiesPath = require.resolve('../utils/plugin-capabilities')
const pagePath = require.resolve('../pages/moments/moments.js')

let pageDefinition
let apiMock
let capabilitiesMock
let instance

function loadPage() {
  let resolveAvailable
  const available = new Promise((resolve) => {
    resolveAvailable = resolve
  })
  const requests = []
  apiMock = {
    getMomentList: async (params) => {
      requests.push(params)
      return { items: [], page: 1, size: 20, total: 0, hasNext: false }
    }
  }
  apiMock.requests = requests
  capabilitiesMock = {
    momentsAvailable: () => available
  }
  capabilitiesMock.resolveAvailable = resolveAvailable

  require.cache[apiPath] = {
    id: apiPath,
    filename: apiPath,
    loaded: true,
    exports: apiMock
  }
  require.cache[capabilitiesPath] = {
    id: capabilitiesPath,
    filename: capabilitiesPath,
    loaded: true,
    exports: { pluginCapabilities: capabilitiesMock }
  }
  delete require.cache[pagePath]

  global.Page = (definition) => {
    pageDefinition = definition
  }
  global.getApp = () => ({
    runtimeReady: () => Promise.resolve(),
    runtimeConfig: { canReadMoments: () => true }
  })
  global.wx = {
    showToast() {},
    stopPullDownRefresh() {},
    pageScrollTo() {},
    switchTab() {},
    navigateTo() {}
  }
  require(pagePath)

  instance = {
    data: { ...pageDefinition.data },
    _unloaded: false,
    setData(patch) {
      Object.assign(this.data, patch)
    }
  }
  Object.entries(pageDefinition).forEach(([name, value]) => {
    if (typeof value === 'function') instance[name] = value.bind(instance)
  })
}

beforeEach(loadPage)

afterEach(() => {
  delete require.cache[pagePath]
  delete require.cache[apiPath]
  delete require.cache[capabilitiesPath]
  delete global.Page
  delete global.getApp
  delete global.wx
})

test('moments page: changing tag during capability probing restarts loading for the new tag', async () => {
  pageDefinition.onLoad.call(instance, { tag: '%E0%A4%A' })
  assert.strictEqual(instance.data.selectedTag, '')
  const change = pageDefinition.changeTag.call(instance, 'new-tag')

  capabilitiesMock.resolveAvailable(true)
  await change

  assert.strictEqual(instance.data.selectedTag, 'new-tag')
  assert.strictEqual(instance.data.status, 'empty')
  assert.strictEqual(instance.data.loading, false)
  assert.strictEqual(apiMock.requests.length, 1)
  assert.strictEqual(apiMock.requests[0].tag, 'new-tag')
})
