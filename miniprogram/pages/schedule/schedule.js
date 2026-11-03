const storage = require('../../utils/storage')
const conflict = require('../../utils/conflict')
const request = require('../../utils/request')

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const PERIOD_STARTS = [
  '08:10', '09:00', '09:50', '10:40', '11:30',
  '14:00', '14:50', '15:40', '16:30', '17:20', '18:10'
]

function pad2(number) {
  return number < 10 ? '0' + number : String(number)
}

function toMinutes(text) {
  const parts = String(text).split(':')
  return Number(parts[0]) * 60 + Number(parts[1])
}

function fromMinutes(total) {
  return pad2(Math.floor(total / 60)) + ':' + pad2(total % 60)
}

function addMinutes(text, minutes) {
  return fromMinutes(toMinutes(text) + minutes)
}

function periodTimes(startIndex, endIndex, changeBreak) {
  const startPeriod = Math.max(1, Math.min(11, Number(startIndex) + 1))
  const endPeriod = Math.max(startPeriod, Math.min(11, Number(endIndex) + 1))

  let start = toMinutes(PERIOD_STARTS[startPeriod - 1])
  let end = toMinutes(PERIOD_STARTS[endPeriod - 1]) + 40

  // 第 6 节固定 14:00；其他节次如果前一节是不同课程，课间从 10 分钟变 15 分钟
  if (changeBreak && startPeriod > 1 && startPeriod !== 6) {
    start += 5
    end += 5
  }

  return {
    start: fromMinutes(start),
    end: fromMinutes(end)
  }
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

function compactText(value) {
  return String(value || '')
    .replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '$1')
    .replace(/([\u4e00-\u9fa5])\s+(?=\d)/g, '$1')
    .replace(/(\d)\s+(?=[\u4e00-\u9fa5])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function nextWeekday(character) {
  const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 }
  const target = map[character]

  if (target === undefined) return todayText()

  const today = new Date()
  const delta = (target - today.getDay() + 7) % 7
  const date = new Date(today)
  date.setDate(date.getDate() + delta)
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
}

function pickBestLine(lines) {
  let bestIndex = 0
  let bestScore = -1

  lines.forEach(function (line, index) {
    const text = compactText(line)
    if (!text) return
    if (/^第?\s*\d+\s*周/.test(text)) return
    if (/^周[一二三四五六日天]$/.test(text)) return
    if (/我的日程|课程表|节次/.test(text)) return

    let score = 0
    if (text.indexOf('@') >= 0) score += 3
    if (/[\u4e00-\u9fa5]{2,}/.test(text)) score += 2
    if (!/^\d+$/.test(text)) score += 1

    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })

  return bestIndex
}

Page({
  data: {
    title: '',
    location: '',
    date: todayText(),
    startTime: '08:10',
    endTime: '09:40',
    periodLabels: ['第1节', '第2节', '第3节', '第4节', '第5节', '第6节', '第7节', '第8节', '第9节', '第10节', '第11节'],
    startPeriodIndex: 0,
    endPeriodIndex: 1,
    changeBreak: false,
    list: [],
    error: '',
    ocrLines: [],
    ocrLoading: false,
    ocrModalVisible: false,
    ocrSelectedIndex: -1
  },

  onLoad: function () {
    this.updatePeriodTimes()
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
        location: item.location || '',
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

  onLocationInput: function (event) {
    this.setData({ location: event.detail.value, error: '' })
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

  onStartPeriodChange: function (event) {
    const that = this
    const start = Number(event.detail.value)
    const end = Math.max(start, this.data.endPeriodIndex)

    this.setData({
      startPeriodIndex: start,
      endPeriodIndex: end,
      error: ''
    }, function () {
      that.updatePeriodTimes()
    })
  },

  onEndPeriodChange: function (event) {
    const that = this
    const end = Number(event.detail.value)
    const start = Math.min(this.data.startPeriodIndex, end)

    this.setData({
      startPeriodIndex: start,
      endPeriodIndex: end,
      error: ''
    }, function () {
      that.updatePeriodTimes()
    })
  },

  onChangeBreakChange: function (event) {
    const that = this
    this.setData({ changeBreak: event.detail.value }, function () {
      that.updatePeriodTimes()
    })
  },

  updatePeriodTimes: function () {
    const times = periodTimes(
      this.data.startPeriodIndex,
      this.data.endPeriodIndex,
      this.data.changeBreak
    )
    this.setData({ startTime: times.start, endTime: times.end })
  },

  onOcrTap: function () {
    if (this.data.ocrLoading) return

    const that = this

    wx.showActionSheet({
      itemList: ['拍照', '从相册选择图片', '从微信聊天选择文件'],
      success: function (res) {
        if (res.tapIndex === 0) that.chooseOcrImage('camera')
        if (res.tapIndex === 1) that.chooseOcrImage('album')
        if (res.tapIndex === 2) that.chooseOcrFile()
      }
    })
  },

  chooseOcrImage: function (source) {
    const that = this

    function handle(path) {
      if (path) that.readImage(path)
    }

    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: [source],
        sizeType: ['compressed'],
        success: function (res) {
          const file = res.tempFiles && res.tempFiles[0]
          handle(file && file.tempFilePath)
        }
      })
      return
    }

    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: [source],
      success: function (res) {
        handle(res.tempFilePaths && res.tempFilePaths[0])
      }
    })
  },

  chooseOcrFile: function () {
    const that = this

    if (!wx.chooseMessageFile) {
      wx.showToast({ title: '当前环境不支持选择文件', icon: 'none' })
      return
    }

    wx.chooseMessageFile({
      count: 1,
      type: 'all',
      success: function (res) {
        const file = res.tempFiles && res.tempFiles[0]
        const path = file && (file.path || file.tempFilePath)
        if (path) that.readImage(path)
      }
    })
  },

  readImage: function (filePath) {
    const that = this
    const fs = wx.getFileSystemManager()

    fs.readFile({
      filePath: filePath,
      encoding: 'base64',
      success: function (res) {
        that.sendOcr(res.data)
      },
      fail: function () {
        wx.showToast({ title: '读取图片失败', icon: 'none' })
      }
    })
  },

  sendOcr: function (base64) {
    const that = this

    this.setData({ ocrLoading: true })
    wx.showLoading({ title: '识别中…', mask: true })

    request.request({
      url: '/api/ocr',
      method: 'POST',
      data: { image: base64 },
      timeout: 30000
    }).then(function (data) {
      const lines = Array.isArray(data.lines)
        ? data.lines.filter(function (line) { return line && line.trim() }).map(compactText)
        : []

      if (lines.length === 0) {
        that.setData({ ocrLines: [] })
        wx.showToast({ title: '没识别到文字，换张清晰点的', icon: 'none' })
        return
      }

      that.setData({
        ocrLines: lines,
        ocrModalVisible: true,
        ocrSelectedIndex: -1
      }, function () {
        that.selectOcrLine(pickBestLine(lines))
      })
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '识别失败', icon: 'none' })
    }).then(function () {
      wx.hideLoading()
      that.setData({ ocrLoading: false })
    })
  },

  onOcrLineTap: function (event) {
    this.selectOcrLine(Number(event.currentTarget.dataset.index))
  },

  selectOcrLine: function (index) {
    const raw = this.data.ocrLines[index]
    if (!raw) return

    const line = compactText(raw)
    let title = line
    let location = ''
    const at = line.indexOf('@')

    if (at >= 0) {
      title = line.slice(0, at).trim()
      location = line.slice(at + 1).trim()
    }

    let date = this.data.date
    const weekday = title.match(/周([一二三四五六日天])/)
    if (weekday) {
      title = title.replace(/周[一二三四五六日天]/, '').trim()
      date = nextWeekday(weekday[1])
    }

    title = title.replace(/第?\s*\d+\s*[-~至到]\s*\d+\s*节?/g, '').trim()
    if (!title) title = line

    this.setData({
      title: title,
      location: location,
      date: date,
      ocrSelectedIndex: index,
      error: ''
    })

    wx.showToast({ title: '已填入，请确认节次和时间', icon: 'none' })
  },

  onOcrModalClose: function () {
    this.setData({ ocrModalVisible: false })
  },

  noop: function () {},

  onOcrAdd: function () {
    if (this.addScheduleFromForm()) {
      this.setData({
        ocrModalVisible: false,
        ocrLines: [],
        ocrSelectedIndex: -1
      })
    }
  },

  onAdd: function () {
    this.addScheduleFromForm()
  },

  addScheduleFromForm: function () {
    const title = String(this.data.title || '').trim()

    if (!title) {
      this.setData({ error: '请填写日程名称' })
      wx.showToast({ title: '请填写名称', icon: 'none' })
      return false
    }

    if (!this.data.date) {
      this.setData({ error: '请选择日期' })
      wx.showToast({ title: '请选择日期', icon: 'none' })
      return false
    }

    const start = this.data.date + ' ' + this.data.startTime
    const end = this.data.date + ' ' + this.data.endTime
    const startTs = conflict.toTimestamp(start)
    const endTs = conflict.toTimestamp(end)

    if (!isFinite(startTs) || !isFinite(endTs) || endTs <= startTs) {
      this.setData({ error: '结束时间要晚于开始时间' })
      wx.showToast({ title: '结束时间要晚于开始时间', icon: 'none' })
      return false
    }

    const item = {
      id: 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      title: title,
      location: String(this.data.location || '').trim(),
      start: start,
      end: end,
      createdAt: Date.now()
    }

    storage.addSchedule(item)
    this.setData({ title: '', location: '', error: '' })
    this.loadList()
    wx.showToast({ title: '已添加', icon: 'success' })
    return true
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
