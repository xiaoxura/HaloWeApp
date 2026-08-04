const { test } = require('node:test')
const assert = require('node:assert')

const { createMomentMediaSession } = require('../utils/moment-media-session')

function createAudioHarness() {
  const handlers = {}
  const context = {
    paused: true,
    stopCount: 0,
    destroyCount: 0,
    onPlay(fn) { handlers.play = fn },
    onPause(fn) { handlers.pause = fn },
    onStop(fn) { handlers.stop = fn },
    onEnded(fn) { handlers.ended = fn },
    onError(fn) { handlers.error = fn },
    play() {
      this.paused = false
      if (handlers.play) handlers.play()
    },
    pause() {
      this.paused = true
      if (handlers.pause) handlers.pause()
    },
    stop() {
      this.paused = true
      this.stopCount += 1
      if (handlers.stop) handlers.stop()
    },
    destroy() {
      this.destroyCount += 1
    }
  }
  let createCount = 0
  return {
    context,
    wxApi: {
      createInnerAudioContext() {
        createCount += 1
        return context
      }
    },
    get createCount() {
      return createCount
    },
    fail() {
      if (handlers.error) handlers.error({ errMsg: 'failed' })
    }
  }
}

test('media session: 多条音频共享一个 InnerAudioContext，切换时停止上一条', () => {
  const harness = createAudioHarness()
  const session = createMomentMediaSession(harness.wxApi)
  const statesA = []
  const statesB = []

  session.toggleAudio({ key: 'a', url: 'https://cdn.example/a.mp3', onState: (state) => statesA.push(state) })
  session.toggleAudio({ key: 'b', url: 'https://cdn.example/b.mp3', onState: (state) => statesB.push(state) })

  assert.strictEqual(harness.createCount, 1)
  assert.ok(harness.context.stopCount >= 1)
  assert.strictEqual(statesA.at(-1).playing, false)
  assert.strictEqual(statesB.at(-1).playing, true)
  assert.deepStrictEqual(session.inspect(), {
    hasAudioContext: true,
    activeType: 'audio',
    audioPlaying: true
  })
})

test('media session: 视频和音频互斥，启动音频会停止当前视频', () => {
  const harness = createAudioHarness()
  const session = createMomentMediaSession(harness.wxApi)
  let firstVideoStops = 0
  let secondVideoStops = 0
  session.activateVideo('video:1', () => { firstVideoStops += 1 })
  session.activateVideo('video:2', () => { secondVideoStops += 1 })
  assert.strictEqual(firstVideoStops, 1)
  session.toggleAudio({ key: 'audio:1', url: 'https://cdn.example/a.mp3', onState() {} })
  assert.strictEqual(secondVideoStops, 1)
  assert.strictEqual(session.inspect().activeType, 'audio')
})

test('media session: 音频错误可见，页面销毁后释放原生上下文', () => {
  const harness = createAudioHarness()
  const session = createMomentMediaSession(harness.wxApi)
  const states = []
  session.toggleAudio({ key: 'audio:1', url: 'https://cdn.example/a.mp3', onState: (state) => states.push(state) })
  harness.fail()
  assert.strictEqual(states.at(-1).failed, true)
  assert.strictEqual(session.inspect().activeType, '')
  session.destroy()
  assert.strictEqual(harness.context.destroyCount, 1)
  assert.deepStrictEqual(session.inspect(), {
    hasAudioContext: false,
    activeType: '',
    audioPlaying: false
  })
})

test('media session: 非 HTTPS 音频 fail closed 且不创建上下文', () => {
  const harness = createAudioHarness()
  const session = createMomentMediaSession(harness.wxApi)
  const states = []
  const accepted = session.toggleAudio({ key: 'bad', url: 'http://unsafe/audio.mp3', onState: (state) => states.push(state) })
  assert.strictEqual(accepted, false)
  assert.strictEqual(harness.createCount, 0)
  assert.strictEqual(states.at(-1).failed, true)
})
