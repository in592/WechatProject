const auth = require('../../utils/auth')

Page({
  data: {
    studentId: '',
    name: '',
    error: ''
  },

  onLoad: function () {
    if (auth.getUser()) {
      this.goHome()
    }
  },

  onStudentIdInput: function (event) {
    this.setData({
      studentId: event.detail.value,
      error: ''
    })
  },

  onNameInput: function (event) {
    this.setData({
      name: event.detail.value,
      error: ''
    })
  },

  onLogin: function () {
    const studentId = String(this.data.studentId || '').trim()
    const name = String(this.data.name || '').trim()

    if (!/^\d{4,}$/.test(studentId)) {
      this.setData({ error: '学号必须是至少 4 位数字' })
      wx.showToast({ title: '学号格式不对', icon: 'none' })
      return
    }

    if (!name) {
      this.setData({ error: '请填写姓名' })
      wx.showToast({ title: '请填写姓名', icon: 'none' })
      return
    }

    const user = {
      studentId: studentId,
      name: name,
      loginAt: Date.now()
    }

    auth.saveUser(user)

    const app = getApp()
    if (app && app.globalData) {
      app.globalData.user = user
    }

    wx.showToast({ title: '登录成功', icon: 'success' })
    this.goHome()
  },

  goHome: function () {
    wx.reLaunch({ url: '/pages/index/index' })
  }
})
