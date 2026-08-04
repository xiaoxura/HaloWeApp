const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const sessionPath = require.resolve('../utils/moment-media-session')
const componentPath = require.resolve('../components/moment-media/moment-media.js')
const componentWxml = fs.readFileSync(
  path.join(__dirname, '../components/moment-media/moment-media.wxml'),
  'utf8'
)
const componentWxss = fs.readFileSync(
  path.join(__dirname, '../components/moment-media/moment-media.wxss'),
  'utf8'
)
const cardWxml = fs.readFileSync(
  path.join(__dirname, '../components/moment-card/moment-card.wxml'),
  'utf8'
)

let componentDefinition
let sessionMock
let previewCalls

function setPath(target, path, value) {
  const tokens = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  const last = tokens.pop()
  const parent = tokens.reduce((current, token) => {
    if (!current[token] || typeof current[token] !== 'object') {
      current[token] = /^\d+$/.test(token) ? [] : {}
    }
    return current[token]
  }, target)
  parent[last] = value
}

function createInstance(media, compact = false) {
  const instance = {
    data: {
      media,
      momentName: 'moment-name',
      compact,
      mediaGeneration: 0,
      photos: [],
      hiddenPhotoCount: 0,
      videos: [],
      audios: [],
      links: []
    },
    setData(patch) {
      Object.entries(patch).forEach(([path, value]) => setPath(this.data, path, value))
    },
    events: [],
    triggerEvent(name, detail) {
      this.events.push({ name, detail })
    }
  }
  Object.entries(componentDefinition.methods).forEach(([name, method]) => {
    instance[name] = method.bind(instance)
  })
  componentDefinition.lifetimes.created.call(instance)
  componentDefinition.lifetimes.attached.call(instance)
  return instance
}

function loadComponent() {
  sessionMock = {
    activateVideo(key, stop) {
      this.videoKey = key
      this.videoStop = stop
    },
    deactivateVideo(key) {
      this.deactivatedKey = key
    },
    toggleAudio({ key, onState }) {
      this.audioKey = key
      onState({ loading: true, playing: false, failed: false })
      onState({ loading: false, playing: true, failed: false })
    },
    release(prefix) {
      this.releasedPrefix = prefix
    }
  }
  require.cache[sessionPath] = {
    id: sessionPath,
    filename: sessionPath,
    loaded: true,
    exports: { momentMediaSession: sessionMock }
  }
  delete require.cache[componentPath]
  componentDefinition = null
  global.Component = (definition) => {
    componentDefinition = definition
  }
  previewCalls = []
  global.wx = {
    previewImage(value) {
      previewCalls.push(value)
    },
    createVideoContext() {
      return { stop() {} }
    },
    setClipboardData() {},
    showToast() {}
  }
  require(componentPath)
}

beforeEach(loadComponent)

afterEach(() => {
  delete require.cache[componentPath]
  delete require.cache[sessionPath]
  delete global.Component
  delete global.wx
})

test('moment media component: compact photos cap at three and preview filters failed photos', () => {
  const media = [1, 2, 3, 4].map((n) => ({
    type: 'PHOTO',
    supported: true,
    url: `https://cdn.example/photo-${n}.jpg`
  }))
  const instance = createInstance(media, true)
  assert.strictEqual(instance.data.photos.length, 3)
  assert.strictEqual(instance.data.hiddenPhotoCount, 1)

  componentDefinition.methods.onPhotoError.call(instance, {
    currentTarget: { dataset: { position: 1 } }
  })
  componentDefinition.methods.previewPhoto.call(instance, {
    currentTarget: { dataset: { position: 0 } }
  })

  assert.strictEqual(previewCalls.length, 1)
  assert.deepStrictEqual(previewCalls[0], {
    current: 'https://cdn.example/photo-1.jpg',
    urls: [
      'https://cdn.example/photo-1.jpg',
      'https://cdn.example/photo-3.jpg',
      'https://cdn.example/photo-4.jpg'
    ]
  })

  const fullInstance = createInstance([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
    type: 'PHOTO',
    supported: true,
    url: `https://cdn.example/full-photo-${n}.jpg`
  })))
  assert.strictEqual(fullInstance.data.photos.length, 9)
  assert.strictEqual(fullInstance.data.hiddenPhotoCount, 0)
  componentDefinition.methods.previewPhoto.call(fullInstance, {
    currentTarget: { dataset: { position: 8 } }
  })
  assert.strictEqual(previewCalls.length, 2)
  assert.strictEqual(previewCalls[1].urls.length, 9)
  assert.strictEqual(previewCalls[1].current, 'https://cdn.example/full-photo-9.jpg')
})

test('moment media component: video/audio events update state and detach releases media ownership', () => {
  const instance = createInstance([
    { type: 'VIDEO', supported: true, url: 'https://cdn.example/video.mp4' },
    { type: 'AUDIO', supported: true, url: 'https://cdn.example/audio.mp3' }
  ])

  componentDefinition.methods.onVideoPlay.call(instance, {
    currentTarget: { dataset: { position: 0 } }
  })
  assert.match(sessionMock.videoKey, /^moment-media-\d+:video:0$/)
  assert.strictEqual(instance.data.videos[0].playing, true)

  sessionMock.videoStop()
  assert.strictEqual(instance.data.videos[0].playing, false)
  componentDefinition.methods.onVideoError.call(instance, {
    currentTarget: { dataset: { position: 0 } }
  })
  assert.strictEqual(instance.data.videos[0].failed, true)

  componentDefinition.methods.toggleAudio.call(instance, {
    currentTarget: { dataset: { position: 0 } }
  })
  assert.strictEqual(instance.data.audios[0].playing, true)
  assert.strictEqual(instance.data.audios[0].loading, false)
  assert.match(sessionMock.audioKey, /^moment-media-\d+:audio:1$/)

  componentDefinition.methods.resetPlayback.call(instance)
  assert.strictEqual(instance.data.videos[0].playing, false)
  assert.strictEqual(instance.data.audios[0].playing, false)
  assert.strictEqual(instance.data.audios[0].loading, false)

  componentDefinition.lifetimes.detached.call(instance)
  assert.match(sessionMock.releasedPrefix, /^moment-media-\d+:$/)
})

test('moment media component: late photo/video errors after detach do not write state', () => {
  const instance = createInstance([
    { type: 'PHOTO', supported: true, url: 'https://cdn.example/photo.jpg' },
    { type: 'VIDEO', supported: true, url: 'https://cdn.example/video.mp4' }
  ])
  let setDataCalls = 0
  const setData = instance.setData
  instance.setData = function (patch) {
    setDataCalls += 1
    setData.call(this, patch)
  }

  componentDefinition.lifetimes.detached.call(instance)
  componentDefinition.methods.onPhotoError.call(instance, {
    currentTarget: { dataset: { position: 0 } }
  })
  componentDefinition.methods.onVideoError.call(instance, {
    currentTarget: { dataset: { position: 0 } }
  })

  assert.strictEqual(setDataCalls, 0)
  assert.strictEqual(instance.data.photos[0].failed, false)
  assert.strictEqual(instance.data.videos[0].failed, false)
})

test('moment media component: events from a previous media generation are ignored', () => {
  let lateAudioState
  sessionMock.toggleAudio = ({ onState }) => {
    lateAudioState = onState
  }
  const instance = createInstance([
    { type: 'PHOTO', supported: true, url: 'https://cdn.example/old-photo.jpg' },
    { type: 'VIDEO', supported: true, url: 'https://cdn.example/old-video.mp4' },
    { type: 'AUDIO', supported: true, url: 'https://cdn.example/old-audio.mp3' }
  ])
  const staleGeneration = instance.data.mediaGeneration
  instance.toggleAudio({ currentTarget: { dataset: { position: 0, generation: staleGeneration } } })
  instance.data.media = [
    { type: 'PHOTO', supported: true, url: 'https://cdn.example/new-photo.jpg' },
    { type: 'VIDEO', supported: true, url: 'https://cdn.example/new-video.mp4' },
    { type: 'AUDIO', supported: true, url: 'https://cdn.example/new-audio.mp3' }
  ]
  instance.rebuildMedia()
  let setDataCalls = 0
  const setData = instance.setData
  instance.setData = function (patch) {
    setDataCalls += 1
    setData.call(this, patch)
  }

  componentDefinition.methods.onPhotoError.call(instance, {
    currentTarget: { dataset: { position: 0, generation: staleGeneration } }
  })
  componentDefinition.methods.onVideoError.call(instance, {
    currentTarget: { dataset: { position: 0, generation: staleGeneration } }
  })
  lateAudioState({ loading: false, playing: false, failed: true })

  assert.strictEqual(setDataCalls, 0)
  assert.strictEqual(instance.data.photos[0].failed, false)
  assert.strictEqual(instance.data.videos[0].failed, false)
  assert.strictEqual(instance.data.audios[0].failed, false)
})

test('moment media component: compact video/audio summaries open the detail event', () => {
  const instance = createInstance([
    { type: 'VIDEO', supported: true, url: 'https://cdn.example/video.mp4' },
    { type: 'AUDIO', supported: true, url: 'https://cdn.example/audio.mp3' }
  ], true)

  componentDefinition.methods.openDetail.call(instance)

  assert.deepStrictEqual(instance.events, [{ name: 'detailtap', detail: undefined }])
})

test('moment media markup wires compact summaries through the card detail event', () => {
  const summaryBindings = componentWxml.match(
    /class="media-link media-summary" bindtap="openDetail"/g
  ) || []
  assert.strictEqual(summaryBindings.length, 2)
  assert.match(componentWxml, /class="photo-grid photo-count-\{\{photos\.length\}\}"/)
  assert.match(componentWxss, /\.photo-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, 1fr\)/)
  assert.match(componentWxss, /\.photo-count-1\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/)
  assert.match(componentWxss, /\.photo-count-1 \.photo-item\s*\{[\s\S]*?height:\s*380rpx/)
  assert.match(componentWxss, /\.photo-count-2,\s*\.photo-count-4\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, 1fr\)/)
  assert.match(componentWxss, /\.photo-count-2 \.photo-item,\s*\.photo-count-4 \.photo-item\s*\{[\s\S]*?height:\s*292rpx/)
  for (const count of [3, 5, 6, 7, 8, 9]) {
    assert.doesNotMatch(componentWxss, new RegExp(`\\.photo-count-${count}\\b`))
  }
  assert.match(componentWxml, /binderror="onPhotoError"/)
  assert.match(componentWxml, /controls\s+autoplay="\{\{false\}\}"/)
  assert.match(componentWxml, /bindplay="onVideoPlay"/)
  assert.match(componentWxml, /bindended="onVideoEnded"/)
  assert.match(componentWxml, /binderror="onVideoError"/)
  assert.match(componentWxml, /catchtap="toggleAudio"/)
  assert.match(componentWxml, /autoplay="\{\{false\}\}"/)
  assert.match(cardWxml, /binddetailtap="openDetail"/)
})
