/**
 * tools/selftest.js —— utils/conflict.js + utils/parser.js 自测
 *
 * 零依赖，直接跑：
 *   node tools/selftest.js
 *
 * 全部通过时退出码 0；有失败时退出码 1（方便以后接 CI / pre-commit）。
 */

const assert = require('assert')
const path = require('path')

const conflict = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'conflict.js'))
const parser = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'parser.js'))

const ts = conflict.toTimestamp

let total = 0
const failures = []

function test(name, fn) {
  total++
  try {
    fn()
    console.log('  PASS  ' + name)
  } catch (err) {
    failures.push({ name: name, err: err })
    console.log('  FAIL  ' + name)
    console.log('        ' + String(err && err.message ? err.message : err).replace(/\n/g, '\n        '))
  }
}

function group(name) {
  console.log('\n' + name)
}

// ---------------------------------------------------------------------------
// 1. 时间解析
// ---------------------------------------------------------------------------
group('1. 时间解析 toTimestamp / formatTimestamp')

test('空格格式与 T 格式解析为同一时刻', function () {
  assert.strictEqual(ts('2026-11-06 15:00'), ts('2026-11-06T15:00'))
  assert.strictEqual(ts('2026-11-06 15:00'), new Date(2026, 10, 6, 15, 0, 0, 0).getTime())
})

test('首尾空格不影响解析', function () {
  assert.strictEqual(ts(' 2026-11-06 15:00 '), ts('2026-11-06 15:00'))
})

test('接受 Date 与毫秒时间戳', function () {
  const date = new Date(2026, 10, 6, 15, 0, 0, 0)
  assert.strictEqual(ts(date), date.getTime())
  assert.strictEqual(ts(date.getTime()), date.getTime())
})

test('空值 / 非法字符串返回 NaN（不是 0）', function () {
  assert.ok(Number.isNaN(ts('')))
  assert.ok(Number.isNaN(ts('   ')))
  assert.ok(Number.isNaN(ts(null)))
  assert.ok(Number.isNaN(ts(undefined)))
  assert.ok(Number.isNaN(ts('不是时间')))
  assert.ok(Number.isNaN(ts('2026-13-01 00:00')))
})

test('formatTimestamp 补零且格式统一', function () {
  assert.strictEqual(conflict.formatTimestamp(ts('2026-01-02 03:04')), '2026-01-02 03:04')
  assert.strictEqual(conflict.formatTimestamp(ts('2026-11-06 15:00')), '2026-11-06 15:00')
})

test('formatTimestamp 对非法输入返回空串', function () {
  assert.strictEqual(conflict.formatTimestamp(NaN), '')
  assert.strictEqual(conflict.formatTimestamp(undefined), '')
})

// ---------------------------------------------------------------------------
// 2. 半开区间重叠
// ---------------------------------------------------------------------------
group('2. 重叠判定 isOverlapping（半开区间）')

const A_START = '2026-11-06 15:00'
const A_END = '2026-11-06 17:00'

test('完全相同的区间重叠', function () {
  assert.strictEqual(conflict.isOverlapping(A_START, A_END, A_START, A_END), true)
})

test('部分重叠（两侧都算）', function () {
  assert.strictEqual(conflict.isOverlapping('2026-11-06 16:00', '2026-11-06 18:00', A_START, A_END), true)
  assert.strictEqual(conflict.isOverlapping(A_START, A_END, '2026-11-06 14:00', '2026-11-06 15:30'), true)
})

test('一个区间包含另一个', function () {
  assert.strictEqual(conflict.isOverlapping('2026-11-06 14:00', '2026-11-06 18:00', A_START, A_END), true)
  assert.strictEqual(conflict.isOverlapping(A_START, A_END, '2026-11-06 15:30', '2026-11-06 16:30'), true)
})

test('首尾相接不算冲突', function () {
  assert.strictEqual(conflict.isOverlapping(A_START, A_END, '2026-11-06 17:00', '2026-11-06 18:00'), false)
  assert.strictEqual(conflict.isOverlapping(A_START, A_END, '2026-11-06 13:00', '2026-11-06 15:00'), false)
})

test('完全不相交不算冲突', function () {
  assert.strictEqual(conflict.isOverlapping(A_START, A_END, '2026-11-06 18:00', '2026-11-06 19:00'), false)
})

test('任一时间非法时按不冲突处理（不能抛错）', function () {
  assert.strictEqual(conflict.isOverlapping('坏时间', A_END, A_START, A_END), false)
  assert.strictEqual(conflict.isOverlapping(A_START, A_END, A_START, '坏时间'), false)
})

// ---------------------------------------------------------------------------
// 3. 冲突列表
// ---------------------------------------------------------------------------
group('3. 冲突列表 findConflicts')

const activity = { title: '社团活动', start: '2026-11-06 15:00', end: '2026-11-06 17:00' }
const schedule = [
  { title: '高数补习', start: '2026-11-06 15:00', end: '2026-11-06 17:00' },
  { title: '英语角', start: '2026-11-06 16:00', end: '2026-11-06 18:00' },
  { title: 'T格式', start: '2026-11-06T15:30', end: '2026-11-06T16:00' },
  { title: '晨跑', start: '2026-11-06 14:00', end: '2026-11-06 15:00' },
  { title: '电影', start: '2026-11-06 17:00', end: '2026-11-06 19:00' },
  { title: '坏数据', start: 'x', end: 'y' }
]

test('找出全部冲突并保持原顺序', function () {
  const list = conflict.findConflicts(activity, schedule)
  assert.deepStrictEqual(list.map(function (item) { return item.title }), ['高数补习', '英语角', 'T格式'])
})

test('空 / 非法日程不报错', function () {
  assert.deepStrictEqual(conflict.findConflicts(activity, null), [])
  assert.deepStrictEqual(conflict.findConflicts(activity, []), [])
  assert.deepStrictEqual(conflict.findConflicts(null, schedule), [])
})

test('活动时间非法时返回空数组', function () {
  assert.deepStrictEqual(conflict.findConflicts({ start: 'bad', end: '2026-11-06 17:00' }, schedule), [])
  assert.deepStrictEqual(conflict.findConflicts({ start: '2026-11-06 17:00', end: '2026-11-06 15:00' }, schedule), [])
})

// ---------------------------------------------------------------------------
// 4. 状态判定
// ---------------------------------------------------------------------------
group('4. 状态判定 check')

const NOW = ts('2026-11-03 10:00')

test('没冲突 → ok', function () {
  const result = conflict.check(activity, [], NOW)
  assert.strictEqual(result.status, conflict.STATUS.OK)
  assert.strictEqual(result.text, '可参加')
  assert.deepStrictEqual(result.conflicts, [])
})

test('有冲突 → conflict，文案带日程名', function () {
  const result = conflict.check(activity, schedule, NOW)
  assert.strictEqual(result.status, conflict.STATUS.CONFLICT)
  assert.strictEqual(result.text, '与「高数补习」冲突')
  assert.strictEqual(result.conflicts.length, 3)
})

test('两小时内开始 → soon', function () {
  const result = conflict.check({ start: '2026-11-03 11:30', end: '2026-11-03 13:00' }, [], NOW)
  assert.strictEqual(result.status, conflict.STATUS.SOON)
})

test('已经结束 → ended', function () {
  const result = conflict.check({ start: '2026-11-03 08:00', end: '2026-11-03 09:00' }, [], NOW)
  assert.strictEqual(result.status, conflict.STATUS.ENDED)
})

test('时间非法 → unknown，不是 conflict', function () {
  const result = conflict.check({ start: 'bad', end: '2026-11-06 17:00' }, schedule, NOW)
  assert.strictEqual(result.status, conflict.STATUS.UNKNOWN)
  assert.strictEqual(result.text, '时间待确认')
  assert.deepStrictEqual(result.conflicts, [])
})

// ---------------------------------------------------------------------------
// 5. 每日空闲区间
// ---------------------------------------------------------------------------
group('5. 空闲区间 findFreeSlots')

test('两段课之间留出三段空闲', function () {
  const day = ts('2026-11-06 00:00')
  const slots = conflict.findFreeSlots(day, [
    { start: '2026-11-06 10:00', end: '2026-11-06 12:00' },
    { start: '2026-11-06 15:00', end: '2026-11-06 17:00' }
  ])
  assert.deepStrictEqual(slots, [
    { start: ts('2026-11-06 08:00'), end: ts('2026-11-06 10:00') },
    { start: ts('2026-11-06 12:00'), end: ts('2026-11-06 15:00') },
    { start: ts('2026-11-06 17:00'), end: ts('2026-11-06 22:00') }
  ])
})

test('重叠日程先合并', function () {
  const day = ts('2026-11-06 00:00')
  const slots = conflict.findFreeSlots(day, [
    { start: '2026-11-06 10:00', end: '2026-11-06 12:00' },
    { start: '2026-11-06 11:00', end: '2026-11-06 13:00' }
  ])
  assert.deepStrictEqual(slots, [
    { start: ts('2026-11-06 08:00'), end: ts('2026-11-06 10:00') },
    { start: ts('2026-11-06 13:00'), end: ts('2026-11-06 22:00') }
  ])
})

test('窗口外的日程被裁掉', function () {
  const day = ts('2026-11-06 00:00')
  const slots = conflict.findFreeSlots(day, [
    { start: '2026-11-06 07:00', end: '2026-11-06 09:00' },
    { start: '2026-11-06 21:00', end: '2026-11-06 23:00' }
  ])
  assert.deepStrictEqual(slots, [
    { start: ts('2026-11-06 09:00'), end: ts('2026-11-06 21:00') }
  ])
})

test('没有日程时返回整个窗口', function () {
  assert.deepStrictEqual(conflict.findFreeSlots(ts('2026-11-06 00:00'), []), [
    { start: ts('2026-11-06 08:00'), end: ts('2026-11-06 22:00') }
  ])
})

test('可自定义每日窗口', function () {
  assert.deepStrictEqual(
    conflict.findFreeSlots(ts('2026-11-06 00:00'), [], { dailyStart: '09:30', dailyEnd: '11:15' }),
    [{ start: ts('2026-11-06 09:30'), end: ts('2026-11-06 11:15') }]
  )
})

test('窗口非法时返回空数组', function () {
  assert.deepStrictEqual(
    conflict.findFreeSlots(ts('2026-11-06 00:00'), [], { dailyStart: '22:00', dailyEnd: '08:00' }),
    []
  )
})

test('日程时间非法时跳过，不影响其它日程', function () {
  const day = ts('2026-11-06 00:00')
  const slots = conflict.findFreeSlots(day, [
    { start: 'bad', end: '2026-11-06 10:00' },
    { start: '2026-11-06 15:00', end: '2026-11-06 17:00' }
  ])
  assert.deepStrictEqual(slots, [
    { start: ts('2026-11-06 08:00'), end: ts('2026-11-06 15:00') },
    { start: ts('2026-11-06 17:00'), end: ts('2026-11-06 22:00') }
  ])
})

// ---------------------------------------------------------------------------
// 6. 替代时段
// ---------------------------------------------------------------------------
group('6. 替代时段 suggestSlots')

const busyWeek = [
  { title: '白天课', start: '2026-11-05 08:00', end: '2026-11-05 19:00' },
  { title: '高数补习', start: '2026-11-06 15:00', end: '2026-11-06 17:00' }
]

test('从周四找起：周四 19:00 有空（演示主线的文案）', function () {
  const slots = conflict.suggestSlots(activity, busyWeek, {
    from: ts('2026-11-05 00:00'),
    days: 2,
    limit: 2,
    now: 0
  })
  assert.deepStrictEqual(slots, [
    {
      date: '2026-11-05',
      start: '2026-11-05 19:00',
      end: '2026-11-05 21:00',
      label: '周四 19:00 有空',
      durationMinutes: 120
    },
    {
      date: '2026-11-06',
      start: '2026-11-06 08:00',
      end: '2026-11-06 10:00',
      label: '周五 08:00 有空',
      durationMinutes: 120
    }
  ])
})

test('limit 生效', function () {
  const slots = conflict.suggestSlots(activity, busyWeek, {
    from: ts('2026-11-05 00:00'),
    days: 7,
    limit: 1,
    now: 0
  })
  assert.strictEqual(slots.length, 1)
  assert.strictEqual(slots[0].label, '周四 19:00 有空')
})

test('结束时间按活动时长计算，不会超出空闲区间', function () {
  const slots = conflict.suggestSlots(activity, busyWeek, {
    from: ts('2026-11-05 00:00'),
    days: 1,
    now: 0
  })
  assert.strictEqual(slots[0].start, '2026-11-05 19:00')
  assert.strictEqual(slots[0].end, '2026-11-05 21:00')
  assert.ok(ts(slots[0].end) <= ts('2026-11-05 22:00'))
})

test('起始时间按 stepMinutes 对齐', function () {
  const shortActivity = { start: '2026-11-05 12:07', end: '2026-11-05 13:07' }
  const slots = conflict.suggestSlots(shortActivity, [
    { start: '2026-11-05 08:00', end: '2026-11-05 12:07' }
  ], { from: ts('2026-11-05 00:00'), days: 1, stepMinutes: 30, now: 0 })
  assert.strictEqual(slots[0].start, '2026-11-05 12:30')
  assert.strictEqual(slots[0].end, '2026-11-05 13:30')
})

test('默认跳过已经过去的时段', function () {
  const slots = conflict.suggestSlots(activity, [
    { start: '2026-11-06 15:00', end: '2026-11-06 17:00' }
  ], { from: ts('2026-11-06 00:00'), days: 1, now: ts('2026-11-06 18:00') })
  assert.strictEqual(slots[0].start, '2026-11-06 18:00')
})

test('skipPast:false 时保留当天更早的时段', function () {
  const slots = conflict.suggestSlots(activity, [
    { start: '2026-11-06 15:00', end: '2026-11-06 17:00' }
  ], { from: ts('2026-11-06 00:00'), days: 1, now: ts('2026-11-06 18:00'), skipPast: false })
  assert.strictEqual(slots[0].start, '2026-11-06 08:00')
})

test('活动时间非法时可用 durationMinutes 兜底', function () {
  const slots = conflict.suggestSlots({ start: 'bad', end: '' }, [], {
    from: ts('2026-11-07 00:00'),
    days: 1,
    durationMinutes: 60,
    now: 0
  })
  assert.deepStrictEqual(slots, [
    {
      date: '2026-11-07',
      start: '2026-11-07 08:00',
      end: '2026-11-07 09:00',
      label: '周六 08:00 有空',
      durationMinutes: 60
    }
  ])
})

test('既没有活动时长也没有兜底时长时返回空数组', function () {
  assert.deepStrictEqual(conflict.suggestSlots({}, [], { from: ts('2026-11-07 00:00') }), [])
})

test('空闲区间放不下活动时长时不硬塞', function () {
  const slots = conflict.suggestSlots(activity, [
    { start: '2026-11-06 08:00', end: '2026-11-06 16:30' },
    { start: '2026-11-06 17:30', end: '2026-11-06 22:00' }
  ], { from: ts('2026-11-06 00:00'), days: 1, now: 0 })
  assert.deepStrictEqual(slots, [])
})

// ---------------------------------------------------------------------------
// 7. 接口稳定性
// ---------------------------------------------------------------------------
group('7. 接口与常量')

test('STATUS 常量齐全', function () {
  assert.strictEqual(conflict.STATUS.OK, 'ok')
  assert.strictEqual(conflict.STATUS.SOON, 'soon')
  assert.strictEqual(conflict.STATUS.CONFLICT, 'conflict')
  assert.strictEqual(conflict.STATUS.ENDED, 'ended')
  assert.strictEqual(conflict.STATUS.UNKNOWN, 'unknown')
})

test('导出的方法都是函数', function () {
  const names = ['toTimestamp', 'formatTimestamp', 'isOverlapping', 'findConflicts', 'check', 'findFreeSlots', 'suggestSlots']
  names.forEach(function (name) {
    assert.strictEqual(typeof conflict[name], 'function', name + ' 应该是函数')
  })
})

// ---------------------------------------------------------------------------
// 8. 通知解析
// ---------------------------------------------------------------------------
group('8. 通知解析 parse')

const NOW_DATE = new Date(2026, 10, 3, 10, 0, 0, 0)

test('完整通知：标题、时间、地点、学分', function () {
  const result = parser.parse('【活动通知】周五下午3点到5点，在图书馆三楼报告厅举办《人工智能前沿讲座》，由计算机学院主办，可获0.5学分，欢迎参加！', { now: NOW_DATE })
  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.activity.title, '人工智能前沿讲座')
  assert.strictEqual(result.activity.start, '2026-11-06 15:00')
  assert.strictEqual(result.activity.end, '2026-11-06 17:00')
  assert.strictEqual(result.activity.location, '图书馆三楼报告厅')
  assert.strictEqual(result.activity.credit, 0.5)
  assert.strictEqual(result.activity.organizer, '计算机学院')
  assert.deepStrictEqual(result.warnings, [])
})

test('真实通知：活动时间优先于报名时间', function () {
  const text = [
    '📣活动主题',
    '“校园寻景，次元同游”',
    '⏰️报名时间。',
    '2026年11月4日晚上21：30～22：00',
    '📍活动地点：',
    '师生活动中心（春兰居）',
    '🕰活动时间：',
    '2026年11月10日19：45～21：00',
    '🔥主办方：',
    '动漫协会',
    '2、按时提交作品可获得二课美育分4分。'
  ].join('\n')

  const result = parser.parse(text, { now: NOW_DATE })
  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.activity.title, '校园寻景，次元同游')
  assert.strictEqual(result.activity.start, '2026-11-10 19:45')
  assert.strictEqual(result.activity.end, '2026-11-10 21:00')
  assert.strictEqual(result.activity.location, '师生活动中心（春兰居）')
  assert.strictEqual(result.activity.credit, 4)
  assert.strictEqual(result.activity.organizer, '动漫协会')
  assert.strictEqual(result.activity.signupStart, '2026-11-04 21:30')
  assert.strictEqual(result.activity.signupEnd, '2026-11-04 22:00')
  assert.deepStrictEqual(result.warnings, [])
})

test('带字段标签的通知', function () {
  const text = [
    '活动主题：校园歌手大赛',
    '时间：2026年11月7日 19:00-21:30',
    '地点：大学生活动中心',
    '学分：1.5'
  ].join('\n')
  const result = parser.parse(text, { now: NOW_DATE })
  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.activity.title, '校园歌手大赛')
  assert.strictEqual(result.activity.start, '2026-11-07 19:00')
  assert.strictEqual(result.activity.end, '2026-11-07 21:30')
  assert.strictEqual(result.activity.location, '大学生活动中心')
  assert.strictEqual(result.activity.credit, 1.5)
})

test('明天 + 上午9点 + 默认 2 小时', function () {
  const result = parser.parse('明天上午9点在操场举行《晨跑活动》，2学分', { now: NOW_DATE })
  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.activity.title, '晨跑活动')
  assert.strictEqual(result.activity.start, '2026-11-04 09:00')
  assert.strictEqual(result.activity.end, '2026-11-04 11:00')
  assert.strictEqual(result.activity.location, '操场')
  assert.strictEqual(result.activity.credit, 2)
  assert.ok(result.warnings.indexOf('未识别到结束时间，已默认 2 小时') >= 0)
})

test('下周三 + 晚上7点半', function () {
  const result = parser.parse('下周三晚上7点半，在报告厅举办《摄影分享会》', { now: NOW_DATE })
  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.activity.start, '2026-11-11 19:30')
  assert.strictEqual(result.activity.end, '2026-11-11 21:30')
  assert.strictEqual(result.activity.location, '报告厅')
})

test('缺时间时 ok=false，但保留已识别字段', function () {
  const result = parser.parse('【讲座】人工智能\n地点：图书馆', { now: NOW_DATE })
  assert.strictEqual(result.ok, false)
  assert.strictEqual(result.activity.title, '人工智能')
  assert.strictEqual(result.activity.location, '图书馆')
  assert.strictEqual(result.activity.start, '')
  assert.ok(result.warnings.indexOf('未识别到活动时间') >= 0)
})

test('跨天时间 23:00-01:00', function () {
  const result = parser.parse('11月6日 23:00-01:00 在宿舍楼下集合，参加《夜间拉练》', { now: NOW_DATE })
  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.activity.start, '2026-11-06 23:00')
  assert.strictEqual(result.activity.end, '2026-11-07 01:00')
  assert.ok(result.warnings.indexOf('结束时间早于开始时间，已按次日处理') >= 0)
})

test('空文本返回 ok=false', function () {
  const result = parser.parse('   ', { now: NOW_DATE })
  assert.strictEqual(result.ok, false)
  assert.deepStrictEqual(result.warnings, ['通知内容为空'])
})

// ---------------------------------------------------------------------------
// 收尾
// ---------------------------------------------------------------------------
console.log('\n----------------------------------------')
if (failures.length === 0) {
  console.log('全部通过：' + total + ' 项')
} else {
  console.log('失败 ' + failures.length + ' / ' + total + ' 项')
  failures.forEach(function (item) {
    console.log('- ' + item.name)
  })
  process.exitCode = 1
}
