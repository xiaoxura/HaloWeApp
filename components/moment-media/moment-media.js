const { momentMediaSession } = require('../../utils/moment-media-session')
const { safeResourceName } = require('../../utils/resource-name')

let instanceSequence = 0

function isHttps(url) {
  return typeof url === 'string' && /^https:\/\//i.test(url)
}

function isPostName(value) {
  return !!safeResourceName(value)
}

Component({
  properties: {
    momentName: { type: String, value: '' },
    media: { type: Array, value: [] },
    compact: { type: Boolean, value: false }
  },

  data: {
    mediaGeneration: 0,
    photos: [],
    hiddenPhotoCount: 0,
    videos: [],
    audios: [],
    links: []
  },

  observers: {
    'media,momentName,compact': function rebuildOnChange() {
      this.rebuildMedia()
    }
  },

  lifetimes: {
    created() {
      this._instanceId = ++instanceSequence
      this._detached = false
      this._mediaGeneration = 0
    },
    attached() {
      this._detached = false
      this.rebuildMedia()
    },
    detached() {
      this._detached = true
      momentMediaSession.release(this.sessionPrefix())
    }
  },

  methods: {
    sessionPrefix() {
      return `moment-media-${this._instanceId}:`
    },

    mediaKey(type, index) {
      return `${this.sessionPrefix()}${type}:${index}`
    },

    rebuildMedia() {
      if (!this.setData) return
      const generation = ++this._mediaGeneration
      const source = Array.isArray(this.data.media) ? this.data.media : []
      const photos = []
      const videos = []
      const audios = []
      const links = []

      source.forEach((raw, index) => {
        const item = raw && typeof raw === 'object' ? raw : {}
        const type = typeof item.type === 'string' ? item.type : 'UNKNOWN'
        const url = isHttps(item.url) ? item.url : ''
        if (type === 'PHOTO' && item.supported === true && url) {
          photos.push({ index, url, failed: false })
        } else if (type === 'VIDEO' && item.supported === true && url) {
          videos.push({
            index,
            url,
            failed: false,
            playing: false,
            id: `moment-video-${this._instanceId}-${index}`
          })
        } else if (type === 'AUDIO' && item.supported === true && url) {
          audios.push({ index, url, failed: false, playing: false, loading: false })
        } else {
          const postName = type === 'POST' && isPostName(item.postName) ? item.postName : ''
          links.push({
            index,
            type,
            sourceType: item.sourceType || type || 'UNKNOWN',
            originType: item.originType || '',
            url,
            canCopy: !!url,
            postName,
            canOpenPost: !!postName,
            label: type === 'POST' ? '文章链接' : type === 'UNKNOWN' ? '暂不支持的媒体' : '媒体不可用'
          })
        }
      })
      this._allPhotoUrls = photos.map((photo) => photo.url)
      const displayedPhotos = this.data.compact ? photos.slice(0, 3) : photos
      this.setData({
        mediaGeneration: generation,
        photos: displayedPhotos,
        hiddenPhotoCount: Math.max(0, photos.length - displayedPhotos.length),
        videos,
        audios,
        links
      })
    },

    resetPlayback() {
      if (!this.setData) return
      this.setData({
        videos: this.data.videos.map((video) => ({ ...video, playing: false })),
        audios: this.data.audios.map((audio) => ({ ...audio, playing: false, loading: false }))
      })
    },

    noop() {},

    isCurrentGeneration(e) {
      const raw = e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.generation
        : undefined
      return raw === undefined || raw === '' || Number(raw) === this._mediaGeneration
    },

    openDetail() {
      this.triggerEvent('detailtap')
    },

    previewPhoto(e) {
      const position = Number(e.currentTarget.dataset.position)
      const current = this.data.photos[position]
      if (!current || current.failed) return
      const failedUrls = new Set(this.data.photos.filter((photo) => photo.failed).map((photo) => photo.url))
      const urls = (this._allPhotoUrls || []).filter((url) => isHttps(url) && !failedUrls.has(url))
      if (!urls.includes(current.url)) return
      wx.previewImage({ current: current.url, urls })
    },

    onPhotoError(e) {
      if (this._detached || !this.isCurrentGeneration(e)) return
      const position = Number(e.currentTarget.dataset.position)
      if (!this.data.photos[position]) return
      this.setData({ [`photos[${position}].failed`]: true })
    },

    onVideoPlay(e) {
      if (!this.isCurrentGeneration(e)) return
      const position = Number(e.currentTarget.dataset.position)
      const video = this.data.videos[position]
      if (!video || video.failed) return
      const key = this.mediaKey('video', video.index)
      const generation = this._mediaGeneration
      momentMediaSession.activateVideo(key, () => this.stopVideo(position, generation))
      this.setData({ [`videos[${position}].playing`]: true })
    },

    onVideoPause(e) {
      if (!this.isCurrentGeneration(e)) return
      const position = Number(e.currentTarget.dataset.position)
      const video = this.data.videos[position]
      if (!video) return
      momentMediaSession.deactivateVideo(this.mediaKey('video', video.index))
      if (!this._detached) this.setData({ [`videos[${position}].playing`]: false })
    },

    onVideoEnded(e) {
      this.onVideoPause(e)
    },

    onVideoError(e) {
      if (this._detached || !this.isCurrentGeneration(e)) return
      const position = Number(e.currentTarget.dataset.position)
      const video = this.data.videos[position]
      if (!video) return
      momentMediaSession.deactivateVideo(this.mediaKey('video', video.index))
      this.setData({
        [`videos[${position}].playing`]: false,
        [`videos[${position}].failed`]: true
      })
    },

    stopVideo(position, generation = this._mediaGeneration) {
      if (generation !== this._mediaGeneration) return
      const video = this.data.videos[position]
      if (!video) return
      try {
        wx.createVideoContext(video.id, this).stop()
      } catch (e) {
        // 组件隐藏/卸载期间原生上下文可能已释放。
      }
      if (!this._detached) this.setData({ [`videos[${position}].playing`]: false })
    },

    toggleAudio(e) {
      if (!this.isCurrentGeneration(e)) return
      const position = Number(e.currentTarget.dataset.position)
      const audio = this.data.audios[position]
      if (!audio) return
      const key = this.mediaKey('audio', audio.index)
      const generation = this._mediaGeneration
      momentMediaSession.toggleAudio({
        key,
        url: audio.url,
        onState: (state) => {
          if (this._detached || generation !== this._mediaGeneration || !this.data.audios[position]) return
          this.setData({
            [`audios[${position}].playing`]: state.playing === true,
            [`audios[${position}].loading`]: state.loading === true,
            [`audios[${position}].failed`]: state.failed === true
          })
        }
      })
    },

    copyMediaLink(e) {
      const position = Number(e.currentTarget.dataset.position)
      const item = this.data.links[position]
      if (!item || !item.canCopy || !isHttps(item.url)) {
        wx.showToast({ title: '媒体地址不可用', icon: 'none' })
        return
      }
      wx.setClipboardData({ data: item.url })
    },

    openPost(e) {
      const position = Number(e.currentTarget.dataset.position)
      const item = this.data.links[position]
      if (!item || !item.canOpenPost || !isPostName(item.postName)) return
      this.triggerEvent('posttap', { name: item.postName })
    }
  }
})
