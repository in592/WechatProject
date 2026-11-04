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

function normalizeScanLine(line) {
  if (typeof line === 'string') {
    return { text: compactText(line), x: 0, y: 0, w: 0, h: 0 }
  }

  return {
    text: compactText(line && line.text),
    x: Number(line && line.x) || 0,
    y: Number(line && line.y) || 0,
    w: Number(line && line.w) || 0,
    h: Number(line && line.h) || 0,
    blockTop: Number(line && line.blockTop) || 0,
    blockBottom: Number(line && line.blockBottom) || 0
  }
}

function detectGrid(lines, meta) {
  const width = Number(meta && meta.width) || 0
  const rows = (meta && Array.isArray(meta.rowLines) ? meta.rowLines : [])
    .map(Number)
    .filter(function (value) { return isFinite(value) })
    .sort(function (a, b) { return a - b })

  if (!width || rows.length < 4) return null

  const headers = []

  lines.forEach(function (line) {
    const match = line.text.match(/^周([一二三四五六日天])$/)
    if (!match || WEEKDAY_INDEX[match[1]] === undefined) return
    headers.push({
      index: WEEKDAY_INDEX[match[1]],
      x: line.x + line.w / 2
    })
  })

  if (!headers.length) return null
  headers.sort(function (a, b) { return a.index - b.index })

  let spacing = width / 7
  if (headers.length >= 2) {
    const first = headers[0]
    const last = headers[headers.length - 1]
    if (last.index > first.index) {
      spacing = (last.x - first.x) / (last.index - first.index)
    }
  }
  if (spacing <= 0) return null

  const columns = []
  for (let i = 0; i < 7; i++) {
    const known = headers.filter(function (item) { return item.index === i })[0]
    columns[i] = known ? known.x : headers[0].x + (i - headers[0].index) * spacing
  }

  const heights = []
  for (let i = 1; i < rows.length; i++) heights.push(rows[i] - rows[i - 1])
  heights.sort(function (a, b) { return a - b })
  const rowHeight = heights[Math.floor(heights.length / 2)] || 120

  return {
    width: width,
    rows: rows,
    columns: columns,
    spacing: spacing,
    rowHeight: rowHeight
  }
}

function rowIndexAt(grid, y) {
  for (let i = 0; i < grid.rows.length - 1; i++) {
    if (y >= grid.rows[i] && y < grid.rows[i + 1]) return i
  }
  return -1
}

function buildGridDrafts(lines, weekStart, grid) {
  const buckets = {}
  const columnNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

  lines.forEach(function (line) {
    if (isNoiseLine(line.text)) {
      // 纯数字可能是教室号（如 301），保留为同一门课的续行
      if (!/^\d{1,4}$/.test(line.text)) return
      if (line.y < grid.rows[1]) return
      if (line.x < grid.columns[0] - grid.spacing * 0.5) return
    }

    const centerX = line.x + line.w / 2
    let column = -1
    let best = Infinity

    grid.columns.forEach(function (x, index) {
      const distance = Math.abs(x - centerX)
      if (distance < best) {
        best = distance
        column = index
      }
    })

    if (column < 0 || best > grid.spacing * 0.7) return

    const centerY = line.y + line.h / 2
    if (rowIndexAt(grid, centerY) < 0) return

    if (!buckets[column]) buckets[column] = []
    buckets[column].push(line)
  })

  const drafts = []

  Object.keys(buckets).map(Number).sort(function (a, b) { return a - b }).forEach(function (column) {
    const list = buckets[column].slice().sort(function (a, b) { return a.y - b.y })
    let cluster = []

    function flush() {
      if (!cluster.length) return

      const joined = compactText(cluster.map(function (line) { return line.text }).join(' '))
      let title = joined
      let location = ''
      const at = joined.indexOf('@')

      if (at >= 0) {
        title = joined.slice(0, at).trim()
        location = joined.slice(at + 1).trim()
      }

      title = title.replace(/周[一二三四五六日天]/g, '')
      title = title.replace(/第?\s*\d+\s*[-~至到]\s*\d+\s*节?/g, '')
      title = title.replace(/\d{4}\s*[-/年]\s*\d{1,2}\s*[-/月]\s*\d{1,2}\s*[日号]?/g, '')
      title = title.replace(/\d{1,2}\s*月\s*\d{1,2}\s*[日号]/g, '')
      title = title.replace(/[《》]/g, '').trim()
      location = location.replace(/\s+/g, '').trim()

      if (title && title.length >= 2) {
        let blockTop = Infinity
        let blockBottom = -Infinity

        cluster.forEach(function (line) {
          if (line.blockTop > 0 && line.blockBottom > 0) {
            blockTop = Math.min(blockTop, line.blockTop)
            blockBottom = Math.max(blockBottom, line.blockBottom)
          }
        })

        let startIndex = -1
        let endIndex = -1

        if (isFinite(blockTop) && isFinite(blockBottom)) {
          startIndex = rowIndexAt(grid, blockTop + 1)
          endIndex = rowIndexAt(grid, blockBottom - 1)
        }

        if (startIndex < 0) {
          startIndex = rowIndexAt(grid, cluster[0].y + cluster[0].h / 2)
        }
        if (endIndex < startIndex) {
          const lastLine = cluster[cluster.length - 1]
          endIndex = rowIndexAt(grid, lastLine.y + lastLine.h / 2)
        }
        if (endIndex < startIndex) endIndex = startIndex

        if (startIndex >= 0) {
          const times = periodTimes(startIndex, endIndex, false)
          const periodText = startIndex === endIndex
            ? '第' + (startIndex + 1) + '节'
            : '第' + (startIndex + 1) + '-' + (endIndex + 1) + '节'

          drafts.push({
            id: 'd_' + Date.now().toString(36) + '_' + drafts.length,
            title: title,
            location: location,
            weekdayIndex: column,
            date: addDaysText(weekStart, column),
            startPeriodIndex: startIndex,
            endPeriodIndex: endIndex,
            changeBreak: false,
            confirmed: false,
            gridText: columnNames[column] + ' · ' + periodText,
            startTime: times.start,
            endTime: times.end
          })
        }
      }

      cluster = []
    }

    list.forEach(function (line) {
      if (cluster.length) {
        const previous = cluster[cluster.length - 1]
        if (line.y - previous.y > grid.rowHeight * 0.7) flush()
      }
      cluster.push(line)
    })

    flush()
  })

  return drafts.slice(0, 20)
}

function buildDrafts(lines, weekStart, meta) {
  const scans = (Array.isArray(lines) ? lines : []).map(normalizeScanLine)
  const grid = detectGrid(scans, meta || {})

  if (grid) {
    const drafts = buildGridDrafts(scans, weekStart, grid)
    if (drafts.length > 0) return drafts
  }

  const drafts = []

  scans.forEach(function (scan) {
    const text = scan.text
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

    let previousDate = ''
    const list = raw.map(function (item) {
      const itemDate = dateText(item.start)
      const dateGap = previousDate !== '' && itemDate !== previousDate
      previousDate = itemDate

      return {
        id: String(item.id || ''),
        title: item.title || '未命名日程',
        location: item.location || '',
        dateText: itemDate,
        weekdayText: weekdayName(item.start),
        timeText: timeText(item.start, item.end),
        dateGap: dateGap
      }
    })

    let previousActivityDate = ''
    const activities = signup.getSignups().slice().sort(function (a, b) {
      return conflict.toTimestamp(a.start) - conflict.toTimestamp(b.start)
    }).map(function (item) {
      const itemDate = dateText(item.start)
      const dateGap = previousActivityDate !== '' && itemDate !== previousActivityDate
      previousActivityDate = itemDate

      return {
        id: String(item.id || ''),
        title: item.title || '未命名活动',
        location: item.location || '',
        dateText: itemDate,
        weekdayText: weekdayName(item.start),
        timeText: timeText(item.start, item.end),
        typeText: item.type || '其他',
        typeClass: typeClass(item.type),
        creditText: item.credit === null || item.credit === undefined ? '未标注' : item.credit + ' 学分',
        dateGap: dateGap
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
      const lines = Array.isArray(data.lines) ? data.lines : []
      const drafts = buildDrafts(lines, that.data.weekStartDate, {
        width: Number(data.width) || 0,
        height: Number(data.height) || 0,
        rowLines: Array.isArray(data.rowLines) ? data.rowLines : []
      })

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
