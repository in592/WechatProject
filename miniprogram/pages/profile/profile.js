const auth = require('../../utils/auth')
const signup = require('../../utils/signup')

const TYPE_META = [
  { name: '学术科技', color: '#4F5BD5', className: 'academic' },
  { name: '志愿公益', color: '#0B6B57', className: 'volunteer' },
  { name: '文体活动', color: '#B85516', className: 'sports' },
  { name: '技能特长', color: '#6B3FD4', className: 'skill' },
  { name: '其他', color: '#8A9099', className: 'other' }
]

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function round1(number) {
  return Math.round(number * 10) / 10
}

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

function buildStats(list) {
  const sums = {}

  list.forEach(function (item) {
    const type = normalizeType(item.type)
    const credit = Number(item.credit) || 0
    sums[type] = (sums[type] || 0) + credit
  })

  return TYPE_META.map(function (meta) {
    return {
      name: meta.name,
      color: meta.color,
      value: round1(sums[meta.name] || 0)
    }
  }).filter(function (item) {
    return item.value > 0
  })
}

function decorate(item) {
  const meta = typeMeta(item.type)
  const credit = item.credit

  return {
    id: String(item.id || ''),
    title: item.title || '未命名活动',
    location: item.location || '',
    typeText: meta.name,
    typeClass: meta.className,
    dateText: dateText(item.start),
    weekdayText: weekdayName(item.start),
    timeText: timeText(item.start, item.end),
    creditText: credit === null || credit === undefined ? '未标注' : credit + ' 学分'
  }
}

Page({
  data: {
    userName: '',
    studentId: '',
    avatarText: '',
    signups: [],
    totalCount: 0,
    totalCredit: 0,
    typeStats: [],
    hasCredits: false
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

    const stats = buildStats(raw)
    const totalCredit = round1(stats.reduce(function (sum, item) {
      return sum + item.value
    }, 0))

    const that = this
    this.setData({
      userName: user.name,
      studentId: user.studentId,
      avatarText: String(user.name || '同').slice(0, 1),
      signups: raw.map(decorate),
      totalCount: raw.length,
      totalCredit: totalCredit,
      typeStats: stats,
      hasCredits: stats.length > 0 && totalCredit > 0
    }, function () {
      if (stats.length > 0) that.drawChart(stats)
    })
  },

  drawChart: function (stats) {
    if (!wx.createSelectorQuery) return

    const query = wx.createSelectorQuery()
    query.select('#creditChart').fields({ node: true, size: true }).exec(function (res) {
      if (!res || !res[0] || !res[0].node) return

      const canvas = res[0].node
      const width = res[0].width
      const height = res[0].height
      if (!width || !height) return

      const ctx = canvas.getContext('2d')
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const dpr = (info && info.pixelRatio) || 2

      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)

      const centerX = width / 2
      const centerY = height / 2
      const radius = Math.min(width, height) / 2 - 6
      const total = stats.reduce(function (sum, item) {
        return sum + item.value
      }, 0)

      let start = -Math.PI / 2

      stats.forEach(function (slice) {
        const angle = Math.PI * 2 * (slice.value / total)
        ctx.beginPath()
        ctx.moveTo(centerX, centerY)
        ctx.arc(centerX, centerY, radius, start, start + angle)
        ctx.closePath()
        ctx.fillStyle = slice.color
        ctx.fill()
        start += angle
      })

      ctx.beginPath()
      ctx.arc(centerX, centerY, radius * 0.58, 0, Math.PI * 2)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()
    })
  },

  onLogout: function () {
    const that = this

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
