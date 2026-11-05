const auth = require('./utils/auth')
const reminder = require('./utils/reminder')

App({
  globalData: {
    user: null
  },

  onLaunch: function () {
    this.globalData.user = auth.getUser()
  },

  onShow: function () {
    // 防止上次 OCR/请求的 loading 遮罩残留，导致页面看起来“按钮全失效”
    wx.hideLoading()
    reminder.start()
  },

  onHide: function () {
    reminder.stop()
  }
})
