Component({
  properties: {
    moment: { type: Object, value: null },
    compact: { type: Boolean, value: false },
    showTags: { type: Boolean, value: true }
  },

  methods: {
    noop() {},

    openDetail() {
      const moment = this.data.moment
      if (!moment || !moment.name) return
      this.triggerEvent('detail', { name: moment.name })
    },

    selectTag(e) {
      const tag = e.currentTarget.dataset.tag
      if (!tag) return
      this.triggerEvent('tagtap', { tag })
    }
  }
})
