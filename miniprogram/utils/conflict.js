/**
 * utils/conflict.js —— 时间冲突判定 + 空闲时段推荐
 *
 * 纯函数：不读写存储、不发请求，可以直接在 Node 里自测（tools/selftest.js）。
 *
 * 时间约定
 *   统一使用 'YYYY-MM-DD HH:mm'（也接受 'YYYY-MM-DDTHH:mm'）。
 *   解析前必须 String(v).trim().replace(' ', 'T') 再交给 new Date()；
 *   否则部分运行时会得到 NaN，而 NaN < x 恒为 false，冲突会被静默漏掉。
 *   所有比较先转时间戳，禁止直接比较字符串。
 *
 * 区间约定
 *   一律半开区间 [start, end)，判定式：aStart < bEnd && bStart < aEnd。
 *   所以 14:00-15:00 和 15:00-16:00 首尾相接，不算冲突。
 *
 * 导出的 API
 *   toTimestamp(value)                       时间字符串 / Date / 时间戳 → 毫秒，失败 NaN
 *   formatTimestamp(ts)                      → 'YYYY-MM-DD HH:mm'，失败 ''
 *   isOverlapping(aStart, aEnd, bStart, bEnd) → boolean
 *   findConflicts(activity, schedule)        → 与 activity 冲突的日程项数组
 *   check(activity, schedule, nowTs)         → { status, text, conflicts }
 *   findFreeSlots(dayTs, schedule, options)  → 某天窗口内的空闲区间 [{ start, end }]（时间戳）
 *   suggestSlots(activity, schedule, options)→ 替代时段（字符串，带 label）
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

/** check() 的返回值；页面直接拿 status 做样式，不要散落魔法字符串 */
const STATUS = {
  OK: 'ok',
  SOON: 'soon',
  CONFLICT: 'conflict',
  ENDED: 'ended',
  UNKNOWN: 'unknown'
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const DEFAULT_DAILY_START = '08:00'
const DEFAULT_DAILY_END = '22:00'

function isFiniteNumber(value) {
  return typeof value === 'number' && isFinite(value)
}

function pad2(number) {
  return number < 10 ? '0' + number : String(number)
}

/**
 * 时间字符串 / Date / 时间戳 → 毫秒时间戳。
 * 解析失败返回 NaN（调用方必须用 isFiniteNumber 判断，不要直接比大小）。
 */
function toTimestamp(value) {
  if (value === null || value === undefined) return NaN
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value

  const text = String(value).trim().replace(' ', 'T')
  if (!text) return NaN
  return new Date(text).getTime()
}

/** 毫秒时间戳 → 'YYYY-MM-DD HH:mm'；非法输入返回 '' */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp)
  if (!isFiniteNumber(timestamp) || isNaN(date.getTime())) return ''

  return (
    date.getFullYear() +
    '-' + pad2(date.getMonth() + 1) +
    '-' + pad2(date.getDate()) +
    ' ' + pad2(date.getHours()) +
    ':' + pad2(date.getMinutes())
  )
}

/** 半开区间重叠：首尾相接不算冲突 */
function isOverlapping(aStart, aEnd, bStart, bEnd) {
  const startA = toTimestamp(aStart)
  const endA = toTimestamp(aEnd)
  const startB = toTimestamp(bStart)
  const endB = toTimestamp(bEnd)

  if (
    !isFiniteNumber(startA) || !isFiniteNumber(endA) ||
    !isFiniteNumber(startB) || !isFiniteNumber(endB)
  ) {
    return false
  }

  return startA < endB && startB < endA
}

function titleOf(item) {
  if (!item) return '未命名日程'
  return item.title || item.name || '未命名日程'
}

function validRange(start, end) {
  return isFiniteNumber(start) && isFiniteNumber(end) && end > start
}

/** 找出与 activity 冲突的日程项（保持 schedule 原顺序），结果可能是空数组 */
function findConflicts(activity, schedule) {
  const list = Array.isArray(schedule) ? schedule : []
  if (!activity) return []

  const start = toTimestamp(activity.start)
  const end = toTimestamp(activity.end)
  if (!validRange(start, end)) return []

  const conflicts = []
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (!item) continue

    const itemStart = toTimestamp(item.start)
    const itemEnd = toTimestamp(item.end)
    if (!validRange(itemStart, itemEnd)) continue

    if (start < itemEnd && itemStart < end) conflicts.push(item)
  }
  return conflicts
}

/**
 * 活动状态判定。
 * @param {object} activity  { start, end, title? }
 * @param {Array}  schedule  本地日程 [{ start, end, title? }]
 * @param {number|Date} [nowTs] 便于测试；默认 Date.now()
 * @returns {{status:string, text:string, conflicts:Array}}
 */
function check(activity, schedule, nowTs) {
  const nowValue = nowTs === undefined ? Date.now() : toTimestamp(nowTs)
  const now = isFiniteNumber(nowValue) ? nowValue : Date.now()

  const start = toTimestamp(activity && activity.start)
  const end = toTimestamp(activity && activity.end)

  if (!validRange(start, end)) {
    return { status: STATUS.UNKNOWN, text: '时间待确认', conflicts: [] }
  }

  if (end <= now) {
    return { status: STATUS.ENDED, text: '已结束', conflicts: [] }
  }

  const conflicts = findConflicts(activity, schedule)
  if (conflicts.length > 0) {
    return {
      status: STATUS.CONFLICT,
      text: '与「' + titleOf(conflicts[0]) + '」冲突',
      conflicts: conflicts
    }
  }

  if (start - now <= 2 * HOUR) {
    return { status: STATUS.SOON, text: '即将开始', conflicts: [] }
  }

  return { status: STATUS.OK, text: '可参加', conflicts: [] }
}

function startOfDay(timestamp) {
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return NaN
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function addDays(timestamp, days) {
  const date = new Date(timestamp)
  date.setDate(date.getDate() + days)
  return date.getTime()
}

/** 'HH:mm' → 当日分钟数；非法格式返回 fallback */
function clockToMinutes(text, fallback) {
  if (typeof text !== 'string') return fallback

  const parts = text.trim().split(':')
  if (parts.length !== 2) return fallback

  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  if (!isFiniteNumber(hours) || !isFiniteNumber(minutes)) return fallback
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return fallback

  return hours * 60 + minutes
}

/**
 * 某一天内的空闲区间（已按开始时间排序、已合并重叠）。
 * @param {number} dayTs  当天的任意时间戳
 * @param {Array}  schedule
 * @param {object} [options] { dailyStart:'08:00', dailyEnd:'22:00' }
 * @returns {Array<{start:number,end:number}>} 时间戳
 */
function findFreeSlots(dayTs, schedule, options) {
  const opt = options || {}
  const day = startOfDay(toTimestamp(dayTs))
  if (!isFiniteNumber(day)) return []

  const windowStart = day + clockToMinutes(opt.dailyStart, 8 * 60) * MINUTE
  const windowEnd = day + clockToMinutes(opt.dailyEnd, 22 * 60) * MINUTE
  if (windowEnd <= windowStart) return []

  const list = Array.isArray(schedule) ? schedule : []
  const busy = []

  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (!item) continue

    const itemStart = toTimestamp(item.start)
    const itemEnd = toTimestamp(item.end)
    if (!validRange(itemStart, itemEnd)) continue

    const clippedStart = Math.max(itemStart, windowStart)
    const clippedEnd = Math.min(itemEnd, windowEnd)
    if (clippedEnd > clippedStart) busy.push([clippedStart, clippedEnd])
  }

  busy.sort(function (a, b) { return a[0] - b[0] })

  const merged = []
  for (let i = 0; i < busy.length; i++) {
    const last = merged[merged.length - 1]
    if (last && busy[i][0] <= last[1]) {
      if (busy[i][1] > last[1]) last[1] = busy[i][1]
    } else {
      merged.push([busy[i][0], busy[i][1]])
    }
  }

  const slots = []
  let cursor = windowStart
  for (let i = 0; i < merged.length; i++) {
    if (merged[i][0] > cursor) slots.push({ start: cursor, end: merged[i][0] })
    if (merged[i][1] > cursor) cursor = merged[i][1]
  }
  if (cursor < windowEnd) slots.push({ start: cursor, end: windowEnd })

  return slots
}

function alignUp(timestamp, step, dayStart) {
  return dayStart + Math.ceil((timestamp - dayStart) / step) * step
}

function weekdayName(timestamp) {
  return WEEKDAYS[new Date(timestamp).getDay()]
}

function dateText(timestamp) {
  return formatTimestamp(timestamp).slice(0, 10)
}

function clockText(timestamp) {
  return formatTimestamp(timestamp).slice(11)
}

/**
 * 从活动当天起，找长度不短于活动时长的空闲时段，用于「替代时段推荐」。
 *
 * @param {object} activity  { start, end }；时间非法时可用 options.durationMinutes
 * @param {Array}  schedule  本地日程
 * @param {object} [options]
 *   from            从哪天开始找（默认活动开始时间）
 *   days            往后看几天（默认 7）
 *   durationMinutes 活动时长兜底（activity 时间非法时使用）
 *   dailyStart/End  每日可预约窗口（默认 08:00 / 22:00）
 *   stepMinutes     起始时间对齐粒度（默认 30 分钟）
 *   limit           最多返回几个（默认 3）
 *   now             当前时间戳，用于跳过已过去的时段（默认 Date.now()）
 *   skipPast        是否跳过已过去的时段（默认 true）
 * @returns {Array<{date:string,start:string,end:string,label:string,durationMinutes:number}>}
 */
function suggestSlots(activity, schedule, options) {
  const opt = options || {}

  const activityStart = toTimestamp(activity && activity.start)
  const activityEnd = toTimestamp(activity && activity.end)

  let duration = activityEnd - activityStart
  if (!isFiniteNumber(duration) || duration <= 0) {
    duration = Number(opt.durationMinutes) * MINUTE
  }
  if (!isFiniteNumber(duration) || duration <= 0) return []

  const fromValue = toTimestamp(opt.from)
  const base = isFiniteNumber(fromValue)
    ? fromValue
    : (isFiniteNumber(activityStart) ? activityStart : Date.now())

  const firstDay = startOfDay(base)
  if (!isFiniteNumber(firstDay)) return []

  const days = Math.min(31, Math.max(1, Math.floor(Number(opt.days) || 7)))
  const step = Math.max(1, Math.floor(Number(opt.stepMinutes) || 30)) * MINUTE
  const limit = Math.max(1, Math.floor(Number(opt.limit) || 3))
  const nowValue = opt.now === undefined ? Date.now() : toTimestamp(opt.now)
  const now = isFiniteNumber(nowValue) ? nowValue : Date.now()
  const skipPast = opt.skipPast !== false

  const slots = []

  for (let i = 0; i < days && slots.length < limit; i++) {
    const day = addDays(firstDay, i)
    const gaps = findFreeSlots(day, schedule, opt)

    for (let j = 0; j < gaps.length && slots.length < limit; j++) {
      const gap = gaps[j]

      let start = gap.start
      if (skipPast && start < now) start = now
      start = alignUp(start, step, day)

      const end = start + duration
      if (end > gap.end) continue

      slots.push({
        date: dateText(start),
        start: formatTimestamp(start),
        end: formatTimestamp(end),
        label: weekdayName(start) + ' ' + clockText(start) + ' 有空',
        durationMinutes: Math.round(duration / MINUTE)
      })
    }
  }

  return slots
}

module.exports = {
  STATUS: STATUS,
  toTimestamp: toTimestamp,
  formatTimestamp: formatTimestamp,
  isOverlapping: isOverlapping,
  findConflicts: findConflicts,
  check: check,
  findFreeSlots: findFreeSlots,
  suggestSlots: suggestSlots
}
