/**
 * utils/parser.js —— 通知文本 → 结构化活动
 *
 * 纯函数，不依赖 wx.*，可以直接在 Node 里自测（tools/selftest.js）。
 *
 * parse(text, options) 返回：
 *   {
 *     ok: boolean,
 *     activity: { title, start, end, location, credit },
 *     warnings: string[]
 *   }
 *
 * 时间统一输出 'YYYY-MM-DD HH:mm'；解析不出来时 start/end 为空字符串。
 * options.now 可传 Date / 时间戳 / 字符串，方便测试。
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const DEFAULT_DURATION = 2 * HOUR

const WEEKDAY_MAP = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }

function pad2(number) {
  return number < 10 ? '0' + number : String(number)
}

function formatDateTime(date) {
  return (
    date.getFullYear() +
    '-' + pad2(date.getMonth() + 1) +
    '-' + pad2(date.getDate()) +
    ' ' + pad2(date.getHours()) +
    ':' + pad2(date.getMinutes())
  )
}

function startOfDay(date) {
  const copy = new Date(date.getTime())
  copy.setHours(0, 0, 0, 0)
  return copy
}

function addDays(date, days) {
  const copy = new Date(date.getTime())
  copy.setDate(copy.getDate() + days)
  return copy
}

function buildDate(year, month, day) {
  const date = new Date(year, month - 1, day, 0, 0, 0, 0)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

function resolveNow(options) {
  const value = options && options.now

  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getTime())
  }
  if (typeof value === 'number') {
    const fromNumber = new Date(value)
    if (!isNaN(fromNumber.getTime())) return fromNumber
  }
  if (typeof value === 'string' && value.trim()) {
    const fromString = new Date(value.trim().replace(' ', 'T'))
    if (!isNaN(fromString.getTime())) return fromString
  }
  return new Date()
}

/** 识别日期：显式年月日 > 今天/明天/后天 > 周几 */
function extractDate(text, now) {
  const full = text.match(/(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*[日号]?/)
  if (full) {
    const date = buildDate(Number(full[1]), Number(full[2]), Number(full[3]))
    if (date) return { date: date, explicitYear: true }
  }

  const monthDay = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/)
  if (monthDay) {
    const month = Number(monthDay[1])
    const day = Number(monthDay[2])
    let year = now.getFullYear()
    let date = buildDate(year, month, day)

    // 没写年份时，如果日期已经过去很久，按明年算
    if (date && date.getTime() < startOfDay(now).getTime() - 180 * DAY) {
      const nextYear = buildDate(year + 1, month, day)
      if (nextYear) date = nextYear
    }
    if (date) return { date: date, explicitYear: false }
  }

  const relative = text.match(/今天|今日|明天|明日|后天/)
  if (relative) {
    const word = relative[0]
    const offset = word === '后天' ? 2 : (word === '明天' || word === '明日' ? 1 : 0)
    return { date: addDays(startOfDay(now), offset), explicitYear: false }
  }

  const weekday = text.match(/(本|这|下)?\s*(?:周|星期)\s*([一二三四五六日天])/)
  if (weekday) {
    const prefix = weekday[1]
    const target = WEEKDAY_MAP[weekday[2]]
    const current = now.getDay() === 0 ? 7 : now.getDay()
    let delta = target - current

    if (prefix === '下') {
      delta += 7
    } else if (prefix !== '本' && prefix !== '这' && delta < 0) {
      delta += 7
    }

    return { date: addDays(startOfDay(now), delta), explicitYear: false }
  }

  return null
}

function applyPeriod(hour, period) {
  if (period === '下午' || period === '晚上') {
    return hour < 12 ? hour + 12 : hour
  }
  if (period === '中午') {
    return hour < 11 ? hour + 12 : hour
  }
  if (period === '上午' || period === '早上') {
    return hour === 12 ? 0 : hour
  }
  return hour
}

function parseMinute(value) {
  if (value === '半') return 30
  if (value === undefined || value === null || value === '') return 0
  const minute = Number(value)
  return minute >= 0 && minute <= 59 ? minute : 0
}

/** 识别时间：区间优先，其次单个时间 */
function extractTime(text) {
  const colonRange = text.match(
    /(\d{1,2})\s*[:：]\s*(\d{2})\s*(?:-|~|—|–|至|到)\s*(\d{1,2})\s*[:：]\s*(\d{2})/
  )
  if (colonRange) {
    return {
      startHour: Number(colonRange[1]),
      startMinute: Number(colonRange[2]),
      endHour: Number(colonRange[3]),
      endMinute: Number(colonRange[4]),
      inferredEnd: false
    }
  }

  const pointRange = text.match(
    /(上午|下午|晚上|中午|早上)?\s*(\d{1,2})\s*[点時时]\s*(半|\d{1,2})?\s*分?\s*(?:-|~|—|–|至|到)\s*(上午|下午|晚上|中午|早上)?\s*(\d{1,2})\s*[点時时]\s*(半|\d{1,2})?\s*分?/
  )
  if (pointRange) {
    const period1 = pointRange[1]
    const period2 = pointRange[4] || period1
    return {
      startHour: applyPeriod(Number(pointRange[2]), period1),
      startMinute: parseMinute(pointRange[3]),
      endHour: applyPeriod(Number(pointRange[5]), period2),
      endMinute: parseMinute(pointRange[6]),
      inferredEnd: false
    }
  }

  const colonSingle = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})/)
  if (colonSingle) {
    return {
      startHour: Number(colonSingle[1]),
      startMinute: Number(colonSingle[2]),
      inferredEnd: true
    }
  }

  const pointSingle = text.match(
    /(上午|下午|晚上|中午|早上)?\s*(\d{1,2})\s*[点時时]\s*(半|\d{1,2})?\s*分?/
  )
  if (pointSingle) {
    return {
      startHour: applyPeriod(Number(pointSingle[2]), pointSingle[1]),
      startMinute: parseMinute(pointSingle[3]),
      inferredEnd: true
    }
  }

  return null
}

function isValidTime(time) {
  if (!time) return false
  if (time.startHour < 0 || time.startHour > 23) return false
  if (time.startMinute < 0 || time.startMinute > 59) return false
  if (time.inferredEnd) return true
  return (
    time.endHour >= 0 && time.endHour <= 23 &&
    time.endMinute >= 0 && time.endMinute <= 59
  )
}

function extractTitle(text) {
  const book = text.match(/《([^》]{1,60})》/)
  if (book) return book[1].trim()

  const labeled = text.match(/(?:活动主题|主题|活动名称|名称)\s*[:：]\s*([^\n，。；;,]{1,60})/)
  if (labeled) return labeled[1].trim()

  const firstLine = text
    .split(/\r?\n/)
    .map(function (line) { return line.trim() })
    .filter(Boolean)[0] || ''

  const cleaned = firstLine
    .replace(/^[【\[][^】\]]*[】\]]\s*/, '')
    .replace(/^(活动)?通知\s*[:：]?\s*/, '')
    .replace(/[，。；;、\s]+$/, '')
    .trim()

  if (!cleaned) return ''
  // 首行如果直接是时间/地点，不硬当标题
  if (/^(周|星期|今天|今日|明天|明日|后天|在|于|时间|地点)/.test(cleaned)) return ''

  return cleaned.slice(0, 60)
}

function extractLocation(text) {
  const labeled = text.match(/(?:活动地点|地点|地址|场所)\s*[:：]\s*([^\n，。；;,]{1,50})/)
  if (labeled) return labeled[1].trim()

  const at = text.match(/(?:在|于)\s*([^\n，。；;,]{2,40}?)\s*(?:举办|举行|开展|进行|集合|签到)/)
  if (at) return at[1].trim()

  return ''
}

function extractCredit(text) {
  const before = text.match(/(\d+(?:\.\d+)?)\s*(?:个)?\s*学分/)
  if (before) return Number(before[1])

  const after = text.match(/学分\s*[:：]?\s*(\d+(?:\.\d+)?)/)
  if (after) return Number(after[1])

  return null
}

function emptyActivity() {
  return {
    title: '未命名活动',
    start: '',
    end: '',
    location: '',
    credit: null
  }
}

/**
 * @param {string} text 通知原文
 * @param {object} [options] { now: Date|number|string }
 * @returns {{ok:boolean, activity:object, warnings:string[]}}
 */
function parse(text, options) {
  const raw = typeof text === 'string' ? text.trim() : ''

  if (!raw) {
    return {
      ok: false,
      activity: emptyActivity(),
      warnings: ['通知内容为空']
    }
  }

  const now = resolveNow(options)
  const title = extractTitle(raw)
  const dateInfo = extractDate(raw, now)
  const timeInfo = extractTime(raw)
  const location = extractLocation(raw)
  const credit = extractCredit(raw)

  const warnings = []
  let start = null
  let end = null

  if (!title) warnings.push('未识别到活动标题')
  if (!dateInfo) warnings.push('未识别到活动日期')
  if (!timeInfo) warnings.push('未识别到活动时间')

  if (dateInfo && timeInfo && isValidTime(timeInfo)) {
    start = new Date(
      dateInfo.date.getFullYear(),
      dateInfo.date.getMonth(),
      dateInfo.date.getDate(),
      timeInfo.startHour,
      timeInfo.startMinute,
      0,
      0
    )

    if (timeInfo.inferredEnd) {
      end = new Date(start.getTime() + DEFAULT_DURATION)
      warnings.push('未识别到结束时间，已默认 2 小时')
    } else {
      end = new Date(
        dateInfo.date.getFullYear(),
        dateInfo.date.getMonth(),
        dateInfo.date.getDate(),
        timeInfo.endHour,
        timeInfo.endMinute,
        0,
        0
      )
      // 23:00-01:00 这种跨天
      if (end.getTime() <= start.getTime()) {
        end = new Date(end.getTime() + DAY)
        warnings.push('结束时间早于开始时间，已按次日处理')
      }
    }

    if (start.getTime() < now.getTime()) {
      warnings.push('活动时间已经过去')
    }
  } else if (dateInfo && timeInfo) {
    warnings.push('活动时间格式无法识别')
  }

  if (!location) warnings.push('未识别到活动地点')
  if (credit === null) warnings.push('未识别到学分')

  return {
    ok: Boolean(title && start && end),
    activity: {
      title: title || '未命名活动',
      start: start ? formatDateTime(start) : '',
      end: end ? formatDateTime(end) : '',
      location: location,
      credit: credit
    },
    warnings: warnings
  }
}

module.exports = {
  parse: parse
}
