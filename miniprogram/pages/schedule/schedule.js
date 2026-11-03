const storage = require('../../utils/storage')
const conflict = require('../../utils/conflict')

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad2(number) {
  return number < 10 ? '0' + number : String(number)
}

function todayText() {
  const date = new Date()
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
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
  const startText = String(start || '')
  const endText = String(end || '')
  if (startText.length < 16) return ''

  const from = startText.slice(11, 16)
  const to = endText.length >= 16 ? endText.slice(11, 16) : ''
  return to ? from + ' - ' + to : from
}

Page({
  data: {
    title: '',
    date: todayText(),
    startTime: '08:00',
    endTime: '10:00',
    list: [],
    error: ''
  },

  onShow: function () {
    this.loadList()
  },

  loadList: function () {
    const raw = storage.getSchedule().slice().sort(function (a, b) {
      return conflict.toTimestamp(a.start) - conflict.toTimestamp(b.start)
    })

    const list = raw.map(function (item) {
      return {
        id: String(item.id || ''),
        title: item.title || '未命名日程',
        dateText: dateText(item.start),
        weekdayText: weekdayName(item.start),
        timeText: timeText(item.start, item.end)
      }
    })

    this.setData({ list: list })
  },

  onTitleInput: function (event) {
    this.setData({ title: event.detail.value, error: '' })
  },

  onDateChange: function (event) {
    this.setData({ date: event.detail.value, error: '' })
  },

  onStartTimeChange: function (event) {
    this.setData({ startTime: event.detail.value, error: '' })
  },

  onEndTimeChange: function (event) {
    this.setData({ endTime: event.detail.value, error: '' })
  },

  onAdd: function () {
    const title = String(this.data.title || '').trim()

    if (!title) {
      this.setData({ error: '请填写日程名称' })
      wx.showToast({ title: '请填写名称', icon: 'none' })
      return
    }

    if (!this.data.date) {
      this.setData({ error: '请选择日期' })
      wx.showToast({ title: '请选择日期', icon: 'none' })
      return
    }

    const start = this.data.date + ' ' + this.data.startTime
    const end = this.data.date + ' ' + this.data.endTime
    const startTs = conflict.toTimestamp(start)
    const endTs = conflict.toTimestamp(end)

    if (!isFinite(startTs) || !isFinite(endTs) || endTs <= startTs) {
      this.setData({ error: '结束时间要晚于开始时间' })
      wx.showToast({ title: '结束时间要晚于开始时间', icon: 'none' })
      return
    }

    const item = {
      id: 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      title: title,
      start: start,
      end: end,
      createdAt: Date.now()
    }

    storage.addSchedule(item)
    this.setData({ title: '', error: '' })
    this.loadList()
    wx.showToast({ title: '已添加', icon: 'success' })
  },

  onDelete: function (event) {
    const id = String(event.currentTarget.dataset.id || '')
    if (!id) return

    const item = this.data.list.find(function (entry) {
      return entry.id === id
    })
    const that = this

    wx.showModal({
      title: '删除日程',
      content: '确定删除「' + (item ? item.title : '这条日程') + '」？',
      success: function (res) {
        if (!res.confirm) return

        storage.removeSchedule(id)
        that.loadList()
        wx.showToast({ title: '已删除', icon: 'success' })
      }
    })
  }
})
