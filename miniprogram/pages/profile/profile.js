const auth = require('../../utils/auth')
const signup = require('../../utils/signup')

const TYPE_META = [
  { name: '学术科技', className: 'academic' },
  { name: '志愿公益', className: 'volunteer' },
  { name: '文体活动', className: 'sports' },
  { name: '技能特长', className: 'skill' },
  { name: '其他', className: 'other' }
]

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function normalizeType(type) {
  const found = TYPE_META.some(function (item) {
    return item.name === type
  })
  return found ? type : '其他'
}

function typeMeta(type) {
  const name = normalizeType(type)
  return TYPE_META.find(function (item) {
    return item.name === name
  })
}

function weekdayName(value) {
  const date = new Date(String(value || '').trim().replace(' ', 'T'))
  if (isNaN(date.getTime())) return ''
  return WEEKDAYS[date.getDay()]
}

function dateText(value) {
  const text = String(value || '')
  return text.length >= 10 ? text.slice(5, 10) : '待定'
}

function timeText(start, end) {
  const from = String(start || '')
  const to = String(end || '')
  if (from.length < 16) return ''
  const startTime = from.slice(11, 16)
  const endTime = to.length >= 16 ? to.slice(11, 16) : ''
  return endTime ? startTime + ' - ' + endTime : startTime
}

function decorate(item) {
  const meta = typeMeta(item.type)

  return {
    id: String(item.id || ''),
    title: item.title || '未命名活动',
    location: item.location || '',
    typeText: meta.name,
    typeClass: meta.className,
    dateText: dateText(item.start),
    weekdayText: weekdayName(item.start),
    timeText: timeText(item.start, item.end)
  }
}

Page({
  data: {
    userName: '',
    studentId: '',
    avatarText: '',
    signups: [],
    totalCount: 0
  },

  onShow: function () {
    if (this._ready) this.loadData()
  },

  onReady: function () {
    this._ready = true
    this.loadData()
  },

  loadData: function () {
    const user = auth.getUser()

    if (!user) {
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }

    const raw = signup.getSignups().slice().sort(function (a, b) {
      return b.signedAt - a.signedAt
    })

    this.setData({
      userName: user.name,
      studentId: user.studentId,
      avatarText: String(user.name || '同').slice(0, 1),
      signups: raw.map(decorate),
      totalCount: raw.length
    })
  },

  onLogout: function () {
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新输入学号和姓名',
      success: function (res) {
        if (!res.confirm) return

        auth.clearUser()
        const app = getApp()
        if (app && app.globalData) app.globalData.user = null
        wx.reLaunch({ url: '/pages/login/login' })
      }
    })
  }
})
