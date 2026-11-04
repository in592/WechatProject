const storage = require('../../utils/storage')
const signup = require('../../utils/signup')
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

function typeClass(type) {
  if (type === '学术科技') return 'academic'
  if (type === '志愿公益') return 'volunteer'
  if (type === '文体活动') return 'sports'
  if (type === '技能特长') return 'skill'
  return 'other'
}

const WEEKDAY_INDEX = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6, 天: 6 }

function formatDate(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
}

function mondayText() {
  const today = new Date()
  const day = today.getDay() === 0 ? 7 : today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day - 1))
  return formatDate(monday)
}

function addDaysText(dateText, days) {
  const parts = String(dateText).split('-')
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  if (isNaN(date.getTime())) return dateText
  date.setDate(date.getDate() + days)
  return formatDate(date)
}

function buildDate(year, month, day) {
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

function explicitDate(text) {
  let match = text.match(/(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})\s*[日号]?/)
  if (match) {
    const date = buildDate(Number(match[1]), Number(match[2]), Number(match[3]))
    if (date) return formatDate(date)
  }

  match = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/)
  if (match) {
    const date = buildDate(new Date().getFullYear(), Number(match[1]), Number(match[2]))
    if (date) return formatDate(date)
  }

  return ''
}

function isNoiseLine(text) {
  if (!text || text.length < 2) return true
  if (/^第?\s*\d+\s*周/.test(text)) return true
  if (/我的日程|课程表|节次/.test(text)) return true
  if (/^周[一二三四五六日天]$/.test(text)) return true
  if (/^星期[一二三四五六日天]$/.test(text)) return true
  if (/^\d+$/.test(text)) return true
  if (/^[a-z0-9.:/_-]+$/i.test(text)) return true
  if (/^[\d\s:：.,，。;；\-—/]+$/.test(text)) return true
  return false
}

function buildDrafts(lines, weekStart) {
  const drafts = []

  lines.forEach(function (line) {
    const text = compactText(line)
    if (isNoiseLine(text)) return

    let title = text
    let location = ''
    const at = text.indexOf('@')
    if (at >= 0) {
      title = text.slice(0, at).trim()
      location = text.slice(at + 1).trim()
    }

    let weekdayIndex = -1
    const weekday = title.match(/周([一二三四五六日天])/)
    if (weekday && WEEKDAY_INDEX[weekday[1]] !== undefined) {
      weekdayIndex = WEEKDAY_INDEX[weekday[1]]
      title = title.replace(/周[一二三四五六日天]/, '').trim()
    }

    let date = weekdayIndex >= 0 ? addDaysText(weekStart, weekdayIndex) : weekStart
    const dateInText = explicitDate(text)
    if (dateInText) {
      date = dateInText
      weekdayIndex = -1
    }

    let startIndex = 0
    let endIndex = 1
    const periodMatch = text.match(/第?\s*(\d{1,2})\s*[-~至到]\s*(\d{1,2})\s*节?/)
    if (periodMatch) {
      startIndex = Math.max(0, Math.min(10, Number(periodMatch[1]) - 1))
      endIndex = Math.max(startIndex, Math.min(10, Number(periodMatch[2]) - 1))
    }

    title = title.replace(/第?\s*\d+\s*[-~至到]\s*\d+\s*节?/g, '')
    title = title.replace(/\d{4}\s*[-/年]\s*\d{1,2}\s*[-/月]\s*\d{1,2}\s*[日号]?/g, '')
    title = title.replace(/\d{1,2}\s*月\s*\d{1,2}\s*[日号]/g, '')
    title = title.replace(/[《》]/g, '').trim()
    if (!title || title.length < 2) return

    const times = periodTimes(startIndex, endIndex, false)

    drafts.push({
      id: 'd_' + Date.now().toString(36) + '_' + drafts.length,
      title: title,
      location: location,
      weekdayIndex: weekdayIndex,
      date: date,
      startPeriodIndex: startIndex,
      endPeriodIndex: endIndex,
      changeBreak: false,
      confirmed: Boolean(periodMatch),
      startTime: times.start,
      endTime: times.end
    })
  })

  return drafts.slice(0, 20)
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
    activityList: [],
    activeTab: 'course',
    error: '',
    ocrLoading: false,
    ocrModalVisible: false,
    ocrDrafts: [],
    weekStartDate: mondayText()
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

    const activities = signup.getSignups().slice().sort(function (a, b) {
      return conflict.toTimestamp(a.start) - conflict.toTimestamp(b.start)
    }).map(function (item) {
      return {
        id: String(item.id || ''),
        title: item.title || '未命名活动',
        location: item.location || '',
        dateText: dateText(item.start),
        weekdayText: weekdayName(item.start),
        timeText: timeText(item.start, item.end),
        typeText: item.type || '其他',
        typeClass: typeClass(item.type),
        creditText: item.credit === null || item.credit === undefined ? '未标注' : item.credit + ' 学分'
      }
    })

    this.setData({ list: list, activityList: activities })
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

  onTabTap: function (event) {
    this.setData({ activeTab: event.currentTarget.dataset.tab })
  },

  onCancelSignup: function (event) {
    const id = String(event.currentTarget.dataset.id || '')
    if (!id) return

    const item = this.data.activityList.find(function (entry) {
      return entry.id === id
    })
    const that = this

    wx.showModal({
      title: '取消报名',
      content: '确定取消「' + (item ? item.title : '这个活动') + '」的报名？',
      success: function (res) {
        if (!res.confirm) return

        signup.removeSignup(id)
        that.loadList()
        wx.showToast({ title: '已取消', icon: 'success' })
      }
    })
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

      const drafts = buildDrafts(lines, that.data.weekStartDate)

      if (drafts.length === 0) {
        that.setData({ ocrDrafts: [] })
        wx.showToast({ title: '没识别到有效课程，换张清晰点的', icon: 'none' })
        return
      }

      that.setData({
        ocrDrafts: drafts,
        ocrModalVisible: true,
        error: ''
      })
      wx.showToast({ title: '识别到 ' + drafts.length + ' 门课', icon: 'none' })
    }).catch(function (err) {
      wx.showToast({ title: (err && err.message) || '识别失败', icon: 'none' })
    }).then(function () {
      wx.hideLoading()
      that.setData({ ocrLoading: false })
    })
  },

  onOcrModalClose: function () {
    this.setData({ ocrModalVisible: false })
  },

  noop: function () {},

  onWeekStartChange: function (event) {
    const weekStart = event.detail.value
    const drafts = this.data.ocrDrafts.map(function (draft) {
      if (draft.weekdayIndex >= 0) {
        return Object.assign({}, draft, { date: addDaysText(weekStart, draft.weekdayIndex) })
      }
      return draft
    })

    this.setData({ weekStartDate: weekStart, ocrDrafts: drafts })
  },

  updateDraft: function (index, patch) {
    const drafts = this.data.ocrDrafts.slice()
    if (!drafts[index]) return

    const draft = Object.assign({}, drafts[index], patch)
    const times = periodTimes(draft.startPeriodIndex, draft.endPeriodIndex, draft.changeBreak)
    draft.startTime = times.start
    draft.endTime = times.end

    drafts[index] = draft
    this.setData({ ocrDrafts: drafts })
  },

  onDraftTitleInput: function (event) {
    this.updateDraft(Number(event.currentTarget.dataset.index), { title: event.detail.value })
  },

  onDraftLocationInput: function (event) {
    this.updateDraft(Number(event.currentTarget.dataset.index), { location: event.detail.value })
  },

  onDraftDateChange: function (event) {
    this.updateDraft(Number(event.currentTarget.dataset.index), { date: event.detail.value })
  },

  onDraftStartPeriodChange: function (event) {
    const index = Number(event.currentTarget.dataset.index)
    const start = Number(event.detail.value)
    const draft = this.data.ocrDrafts[index]
    if (!draft) return

    this.updateDraft(index, {
      startPeriodIndex: start,
      endPeriodIndex: Math.max(start, draft.endPeriodIndex),
      confirmed: true
    })
  },

  onDraftEndPeriodChange: function (event) {
    const index = Number(event.currentTarget.dataset.index)
    const end = Number(event.detail.value)
    const draft = this.data.ocrDrafts[index]
    if (!draft) return

    this.updateDraft(index, {
      startPeriodIndex: Math.min(draft.startPeriodIndex, end),
      endPeriodIndex: end,
      confirmed: true
    })
  },

  onDraftConfirm: function (event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ error: '' })
    this.updateDraft(index, { confirmed: true })
  },

  onDraftChangeBreak: function (event) {
    this.updateDraft(Number(event.currentTarget.dataset.index), { changeBreak: event.detail.value })
  },

  onDraftDelete: function (event) {
    const index = Number(event.currentTarget.dataset.index)
    const drafts = this.data.ocrDrafts.filter(function (draft, i) {
      return i !== index
    })

    this.setData({
      ocrDrafts: drafts,
      ocrModalVisible: drafts.length > 0
    })
  },

  onImportDrafts: function () {
    const drafts = this.data.ocrDrafts
    if (!drafts.length) return

    const pending = drafts.filter(function (draft) {
      return !draft.confirmed
    }).length
    if (pending > 0) {
      this.setData({ error: '还有 ' + pending + ' 门课没确认节次，请点「确认节次」或修改节次' })
      return
    }

    let invalid = false
    drafts.forEach(function (draft) {
      if (!String(draft.title || '').trim() || !draft.date) invalid = true
    })
    if (invalid) {
      this.setData({ error: '有课程缺少名称或日期，请检查' })
      return
    }

    let added = 0
    drafts.forEach(function (draft) {
      storage.addSchedule({
        id: 's_' + Date.now().toString(36) + '_' + added + '_' + Math.random().toString(36).slice(2, 5),
        title: String(draft.title).trim(),
        location: String(draft.location || '').trim(),
        start: draft.date + ' ' + draft.startTime,
        end: draft.date + ' ' + draft.endTime,
        createdAt: Date.now()
      })
      added++
    })

    this.setData({ ocrModalVisible: false, ocrDrafts: [], error: '' })
    this.loadList()
    wx.showToast({ title: '已导入 ' + added + ' 门课', icon: 'success' })
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
