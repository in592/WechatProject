const auth = require('./utils/auth')

App({
  globalData: {
    user: null
  },

  onLaunch: function () {
    this.globalData.user = auth.getUser()
  }
})
