/**
 * 评论/回复底部弹层（纯展示 + 本地校验，提交状态机由页面驱动）。
 *
 * 职责：
 * - 昵称 2～20 字、内容 1～maxLength 字（Unicode 字符）本地校验与实时字数；
 * - 首次提交展示隐私说明（未同意当前 privacyVersion 时强制勾选）；
 * - 昵称「仅保存在本机」由用户勾选，正文绝不持久化；
 * - 提交具备单飞锁（submitting），重复点击不重复触发；
 * - 页面通过 selectComponent 调用 setSubmitting / setError / close。
 */

// Unicode 字符数（按码点，emoji 算 1 个）
function charCount(str) {
  return str ? [...str].length : 0
}

Component({
  properties: {
    visible: { type: Boolean, value: false },
    maxLength: { type: Number, value: 500 },
    // 回复目标昵称；空串 = 评论模式
    replyTo: { type: String, value: '' },
    privacyUrl: { type: String, value: '' },
    privacyVersion: { type: String, value: '' },
    // 当前 privacyVersion 是否已被用户同意过
    consentGiven: { type: Boolean, value: false },
    initialNickname: { type: String, value: '' }
  },

  data: {
    nickname: '',
    content: '',
    contentCount: 0,
    saveNickname: true,
    consentChecked: false,
    submitting: false,
    errorMsg: ''
  },

  observers: {
    visible(visible) {
      if (visible) {
        this.setData({
          nickname: this.data.initialNickname || '',
          content: '',
          contentCount: 0,
          consentChecked: false,
          submitting: false,
          errorMsg: ''
        })
      }
    }
  },

  methods: {
    onNicknameInput(e) {
      this.setData({ nickname: e.detail.value, errorMsg: '' })
    },

    onContentInput(e) {
      const content = e.detail.value || ''
      this.setData({ content, contentCount: charCount(content), errorMsg: '' })
    },

    onSaveNicknameChange(e) {
      this.setData({ saveNickname: !!e.detail.value.length })
    },

    onConsentChange(e) {
      this.setData({ consentChecked: !!e.detail.value.length, errorMsg: '' })
    },

    // 隐私政策：小程序无法直接打开外链，复制 URL 供浏览器查看
    copyPrivacyUrl() {
      if (!this.data.privacyUrl) return
      wx.setClipboardData({ data: this.data.privacyUrl })
    },

    /** 本地校验；通过返回 null，否则返回错误文案 */
    validate() {
      const name = this.data.nickname.trim()
      const nameLen = charCount(name)
      if (nameLen < 2 || nameLen > 20) return '昵称需为 2～20 个字符'
      const content = this.data.content.trim()
      if (!content) return '评论内容不能为空'
      if (charCount(content) > this.data.maxLength) {
        return `评论内容不能超过 ${this.data.maxLength} 个字符`
      }
      if (!this.data.consentGiven && !this.data.consentChecked) {
        return '请先阅读并同意隐私政策'
      }
      return null
    },

    handleSubmit() {
      // 单飞锁：重复点击不重复触发
      if (this.data.submitting) return
      const error = this.validate()
      if (error) {
        this.setData({ errorMsg: error })
        return
      }
      this.setData({ submitting: true, errorMsg: '' })
      this.triggerEvent('submit', {
        nickname: this.data.nickname.trim(),
        content: this.data.content.trim(),
        saveNickname: this.data.saveNickname
      })
    },

    handleClose() {
      if (this.data.submitting) return
      this.close()
    },

    // ===== 供页面调用的方法 =====

    /** 提交结束后解除单飞锁 */
    setSubmitting(submitting) {
      this.setData({ submitting: !!submitting })
    },

    /** 展示服务端/网络错误，表单内容保留 */
    setError(msg) {
      this.setData({ errorMsg: msg || '', submitting: false })
    },

    /** 结束表单并清理正文（页面卸载/远程关闭/版本过低时调用） */
    close() {
      this.setData({
        submitting: false,
        errorMsg: '',
        content: '',
        contentCount: 0
      })
      this.triggerEvent('close')
    }
  }
})
