/**
 * Moment 音视频页面级协调器。
 *
 * - 全局只创建一个 InnerAudioContext；
 * - 任意音频/视频开始前停止上一媒体；
 * - 页面 hide/unload 时统一 stop + destroy，避免后台残留；
 * - 不持久化媒体 URL 或播放状态。
 */

function createMomentMediaSession(wxApi) {
  let audioContext = null
  let audioOwner = null
  let audioPlaying = false
  let active = null

  function notify(owner, state) {
    if (!owner || typeof owner.onState !== 'function') return
    try {
      owner.onState(state)
    } catch (e) {
      // 组件可能已卸载；媒体清理不能因此中断。
    }
  }

  function clearActive(key) {
    if (active && active.key === key) active = null
  }

  function stopOwnedAudio(key) {
    if (!audioOwner || (key && audioOwner.key !== key)) return
    const owner = audioOwner
    audioOwner = null
    audioPlaying = false
    clearActive(owner.key)
    try {
      if (audioContext) audioContext.stop()
    } catch (e) {
      // stop 失败仍清除 JS 状态。
    }
    notify(owner, { playing: false, failed: false })
  }

  function stopActive() {
    if (!active) return
    const current = active
    active = null
    try {
      current.stop()
    } catch (e) {
      // 单个原生媒体上下文失效不能阻止后续媒体启动。
    }
  }

  function ensureAudioContext() {
    if (audioContext) return audioContext
    if (!wxApi || typeof wxApi.createInnerAudioContext !== 'function') {
      throw new Error('当前环境不支持音频播放')
    }
    const context = wxApi.createInnerAudioContext()
    context.autoplay = false
    context.obeyMuteSwitch = true

    context.onPlay(() => {
      audioPlaying = true
      notify(audioOwner, { playing: true, failed: false })
    })
    context.onPause(() => {
      audioPlaying = false
      if (audioOwner) clearActive(audioOwner.key)
      notify(audioOwner, { playing: false, failed: false })
    })
    context.onStop(() => {
      // stopOwnedAudio 已同步清理旧 owner。若旧音源的 onStop 晚于新音源 onPlay 到达，
      // 不能反向把新音源标成暂停。
      if (!audioPlaying) notify(audioOwner, { playing: false, failed: false })
    })
    context.onEnded(() => {
      const owner = audioOwner
      audioOwner = null
      audioPlaying = false
      if (owner) clearActive(owner.key)
      notify(owner, { playing: false, failed: false, ended: true })
    })
    context.onError(() => {
      const owner = audioOwner
      audioOwner = null
      audioPlaying = false
      if (owner) clearActive(owner.key)
      notify(owner, { playing: false, failed: true })
    })
    audioContext = context
    return context
  }

  function activateVideo(key, stop) {
    if (!key || typeof stop !== 'function') return
    if (active && active.key !== key) stopActive()
    if (audioOwner && audioOwner.key !== key) stopOwnedAudio()
    active = { key, type: 'video', stop }
  }

  function deactivateVideo(key) {
    clearActive(key)
  }

  function toggleAudio({ key, url, onState }) {
    if (!key || !/^https:\/\//i.test(url || '')) {
      if (typeof onState === 'function') onState({ playing: false, failed: true })
      return false
    }

    let context
    try {
      context = ensureAudioContext()
    } catch (e) {
      if (typeof onState === 'function') onState({ playing: false, failed: true })
      return false
    }

    if (audioOwner && audioOwner.key === key) {
      audioOwner.onState = onState
      if (audioPlaying) {
        context.pause()
        return true
      }
      if (active && active.key !== key) stopActive()
      active = { key, type: 'audio', stop: () => stopOwnedAudio(key) }
      context.play()
      return true
    }

    stopActive()
    if (audioOwner) stopOwnedAudio()
    audioOwner = { key, onState }
    active = { key, type: 'audio', stop: () => stopOwnedAudio(key) }
    notify(audioOwner, { playing: false, failed: false, loading: true })
    try {
      context.src = url
      context.play()
      return true
    } catch (e) {
      const owner = audioOwner
      audioOwner = null
      active = null
      notify(owner, { playing: false, failed: true })
      return false
    }
  }

  function release(prefix) {
    if (!prefix) return
    if (active && active.key.indexOf(prefix) === 0) stopActive()
    if (audioOwner && audioOwner.key.indexOf(prefix) === 0) stopOwnedAudio()
  }

  function stopAll() {
    stopActive()
    if (audioOwner) stopOwnedAudio()
  }

  function destroy() {
    stopAll()
    if (audioContext) {
      try {
        audioContext.destroy()
      } catch (e) {
        // 原生上下文已销毁时忽略。
      }
    }
    audioContext = null
    audioOwner = null
    audioPlaying = false
    active = null
  }

  return {
    activateVideo,
    deactivateVideo,
    toggleAudio,
    release,
    stopAll,
    destroy,
    // 仅供纯函数测试断言，不包含 URL、owner 或其他业务数据。
    inspect() {
      return {
        hasAudioContext: !!audioContext,
        activeType: active ? active.type : '',
        audioPlaying
      }
    }
  }
}

let defaultSession = null

function getDefaultSession() {
  if (!defaultSession) {
    defaultSession = createMomentMediaSession({
      createInnerAudioContext: () => wx.createInnerAudioContext()
    })
  }
  return defaultSession
}

const momentMediaSession = {
  activateVideo: (...args) => getDefaultSession().activateVideo(...args),
  deactivateVideo: (...args) => getDefaultSession().deactivateVideo(...args),
  toggleAudio: (...args) => getDefaultSession().toggleAudio(...args),
  release: (...args) => getDefaultSession().release(...args),
  stopAll: (...args) => getDefaultSession().stopAll(...args),
  destroy: (...args) => getDefaultSession().destroy(...args)
}

module.exports = {
  createMomentMediaSession,
  momentMediaSession
}
