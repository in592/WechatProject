const request = require('../../utils/request')
const signup = require('../../utils/signup')
const agenda = require('../../utils/agenda')
const conflict = require('../../utils/conflict')

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
          typeText: view.typeText,
          typeClass: view.typeClass,
          startText: view.startText,
          endText: view.endText,
          organizerText: view.organizerText,
          creditText: view.creditText,
          signupText: view.signupText
        })
      })
      .catch(function () {
        that.setData({ loading: false, error: '活动不存在或已删除', activity: null })
      })
  },

  onRetry: function () {
    return this.loadActivity()
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
        this.setData({ signed: true })

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
