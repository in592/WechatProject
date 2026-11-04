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
    reminder.start()
  },

  onHide: function () {
    reminder.stop()
  }
})
