const request = require('../../utils/request')
const signup = require('../../utils/signup')
const agenda = require('../../utils/agenda')
const conflict = require('../../utils/conflict')
const reminder = require('../../utils/reminder')

function typeClass(type) {
  if (type === '学术科技') return 'academic'
  if (type === '志愿公益') return 'volunteer'
  if (type === '文体活动') return 'sports'
  if (type === '技能特长') return 'skill'
  return 'other'
}

function decorate(activity) {
  const start = String(activity.start || '')
  const end = String(activity.end || '')
  const credit = activity.credit

  return {
    typeText: activity.type || '其他',
    typeClass: typeClass(activity.type),
    startText: start || '时间待定',
    endText: end,
    organizerText: activity.organizer || '未标注',
    creditText: credit === null || credit === undefined ? '未标注' : credit + ' 学分',
    signupText: activity.signupStart
      ? activity.signupStart + (activity.signupEnd ? ' - ' + activity.signupEnd : '')
      : '未标注'
  }
}

Page({
  data: {
    id: '',
    activity: null,
    loading: true,
    error: '',
    signing: false,
    signed: false,
    followed: false,
    typeText: '',
    typeClass: '',
    startText: '',
    endText: '',
    organizerText: '',
    creditText: '',
    signupText: ''
  },

  onLoad: function (options) {
    const id = String((options && options.id) || '')
    this.setData({ id: id })

    if (!id) {
      this.setData({ loading: false, error: '缺少活动 id' })
      return
    }

    return this.loadActivity()
  },

  loadActivity: function () {
    const that = this
    this.setData({ loading: true, error: '' })

    return request.get('/api/activities/' + encodeURIComponent(this.data.id))
      .then(function (data) {
        if (!data || data.ok === false || !data.activity) {
          throw new Error('活动不存在')
        }

        const view = decorate(data.activity)
        that.setData({
          activity: data.activity,
          loading: false,
          error: '',
          signed: signup.isSignedUp(data.activity.id),
          followed: reminder.isFollowed(data.activity.id),
          typeText: view.typeText,
          typeClass: view.typeClass,
          startText: view.startText,
          endText: view.endText,
          organizerText: view.organizerText,
          creditText: view.creditText,
          signupText: view.signupText
        })
      })
      .catch(function (err) {
        const notFound = err && err.statusCode === 404

        if (notFound) {
          try {
            const cache = wx.getStorageSync('activities_cache')
            if (Array.isArray(cache)) {
              wx.setStorageSync('activities_cache', cache.filter(function (item) {
                return String(item.id) !== String(that.data.id)
              }))
            }
          } catch (cacheErr) {
            // 缓存清理失败不影响错误提示
          }
        }

        that.setData({
          loading: false,
          activity: null,
          error: notFound ? '活动不存在或已删除' : '加载失败，请检查网络或后端是否启动'
        })
      })
  },

  onRetry: function () {
    return this.loadActivity()
  },

  onToggleReminder: function () {
    const activity = this.data.activity
    if (!activity) return

    if (!activity.signupStart) {
      wx.showToast({ title: '这个活动没有报名时间', icon: 'none' })
      return
    }

    if (reminder.isFollowed(activity.id)) {
      reminder.unfollow(activity.id)
      this.setData({ followed: false })
      wx.showToast({ title: '已取消报名提醒', icon: 'none' })
      return
    }

    reminder.follow(activity)
    this.setData({ followed: true })
    wx.showToast({ title: '已设置报名提醒', icon: 'none' })
  },

  onBackToList: function () {
    wx.navigateBack({
      fail: function () {
        wx.switchTab({ url: '/pages/index/index' })
      }
    })
  },

  onShow: function () {
    if (this.data.activity) {
      this.setData({ signed: signup.isSignedUp(this.data.activity.id) })
    }
  },

  onSignup: function () {
    const activity = this.data.activity
    if (!activity || this.data.signing) return

    this.setData({ signing: true })

    try {
      const schedule = agenda.getAgenda().filter(function (item) {
        return String(item.id) !== String(activity.id)
      })
      const conflicts = conflict.findConflicts(activity, schedule)

      if (conflicts.length > 0) {
        const first = conflicts[0]
        const lines = ['与「' + (first.title || '日程') + '」冲突']

        if (first.start || first.end) {
          lines.push('冲突时间：' + (first.start || '') + ' - ' + (first.end || ''))
        }
        if (conflicts.length > 1) {
          lines.push('另有 ' + (conflicts.length - 1) + ' 项日程冲突')
        }

        const slots = conflict.suggestSlots(activity, schedule, { days: 7, limit: 2 })
        if (slots.length > 0) {
          lines.push('')
          lines.push('可以去的时段：')
          slots.forEach(function (slot) {
            lines.push(slot.label)
          })
        } else {
          lines.push('')
          lines.push('本周没有找到合适的替代时段')
        }

        wx.showModal({
          title: '时间冲突',
          content: lines.join('\n'),
          showCancel: false,
          confirmText: '知道了'
        })
      } else {
        const already = signup.isSignedUp(activity.id)
        signup.saveSignup(activity)
        reminder.unfollow(activity.id)
        this.setData({ signed: true, followed: false })

        wx.showModal({
          title: already ? '已报名' : '报名成功',
          content: already ? '你已经报过「' + (activity.title || '活动') + '」' : '已报名「' + (activity.title || '活动') + '」',
          showCancel: false,
          confirmText: '好的'
        })
      }
    } finally {
      this.setData({ signing: false })
    }
  },

  onCancelSignup: function () {
    const activity = this.data.activity
    if (!activity || this.data.signing) return

    const that = this

    wx.showModal({
      title: '取消报名',
      content: '确定取消「' + (activity.title || '活动') + '」的报名？',
      success: function (res) {
        if (!res.confirm) return

        signup.removeSignup(activity.id)
        that.setData({ signed: false })
        wx.showToast({ title: '已取消报名', icon: 'success' })
      }
    })
  }
})
