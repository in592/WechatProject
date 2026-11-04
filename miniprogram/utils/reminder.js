/**
 * utils/reminder.js —— 前台活动提醒（本地）
 *
 * 只在小程序打开/回到前台时检查：
 *   1. 用户点过「提醒我报名」的活动：报名开始前 10 分钟
 *   2. 已报名活动：活动开始前 10 分钟
 *
 * 小程序退出/后台时无法弹窗；真正退出后的通知需要微信订阅消息。
 */

const signup = require('./signup')

const FOLLOW_KEY = 'reminder_followed'
const NOTIFIED_KEY = 'reminder_notified'
const WINDOW = 10 * 60 * 1000
const CHECK_INTERVAL = 30 * 1000

let timer = null

function toTimestamp(value) {
  const text = String(value || '').trim().replace(' ', 'T')
  if (!text) return NaN
  return new Date(text).getTime()
}

function getFollowed() {
  try {
    const list = wx.getStorageSync(FOLLOW_KEY)
    return Array.isArray(list) ? list : []
  } catch (err) {
    return []
  }
}

function saveFollowed(list) {
  try {
    wx.setStorageSync(FOLLOW_KEY, list)
  } catch (err) {
    // 本地存储失败不影响页面
  }
}

function follow(activity) {
  const id = String(activity.id || '')
  if (!id) return []

  const list = getFollowed().filter(function (item) {
    return String(item.id) !== id
  })

  list.push({
    id: id,
    title: activity.title || '未命名活动',
    signupStart: String(activity.signupStart || ''),
    start: String(activity.start || ''),
    location: activity.location || '',
    followedAt: Date.now()
  })

  saveFollowed(list)
  return list
}

function unfollow(id) {
  const target = String(id || '')
  const list = getFollowed().filter(function (item) {
    return String(item.id) !== target
  })
  saveFollowed(list)
  return list
}

function isFollowed(id) {
  const target = String(id || '')
  return getFollowed().some(function (item) {
    return String(item.id) === target
  })
}

function getNotified() {
  try {
    const map = wx.getStorageSync(NOTIFIED_KEY)
    return map && typeof map === 'object' ? map : {}
  } catch (err) {
    return {}
  }
}

function markNotified(key) {
  const map = getNotified()
  map[key] = Date.now()

  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  Object.keys(map).forEach(function (itemKey) {
    if (Number(map[itemKey]) < cutoff) delete map[itemKey]
  })

  try {
    wx.setStorageSync(NOTIFIED_KEY, map)
  } catch (err) {
    // 忽略
  }
}

function dueList(now) {
  const current = now instanceof Date ? now.getTime() : Date.now()
  const notified = getNotified()
  const due = []
  const seen = {}

  function push(item) {
    if (seen[item.key]) return
    seen[item.key] = true
    due.push(item)
  }

  getFollowed().forEach(function (item) {
    const signupTs = toTimestamp(item.signupStart)
    if (!isFinite(signupTs)) return

    const diff = signupTs - current
    const key = 'signup:' + String(item.id)
    if (diff < 0 || diff > WINDOW || notified[key]) return

    const signed = signup.isSignedUp(item.id)
    push({
      key: key,
      title: item.title || '活动',
      time: item.signupStart,
      content: '「' + (item.title || '活动') + '」报名将在 10 分钟内开始' + (signed ? '（你已报名）' : '')
    })
  })

  signup.getSignups().forEach(function (item) {
    const signupTs = toTimestamp(item.signupStart)
    const signupDiff = signupTs - current
    const signupKey = 'signup:' + String(item.id)

    // B 方案：已报名活动也提醒报名开始时间
    if (isFinite(signupTs) && signupDiff >= 0 && signupDiff <= WINDOW && !notified[signupKey]) {
      push({
        key: signupKey,
        title: item.title || '活动',
        time: item.signupStart,
        content: '「' + (item.title || '活动') + '」报名将在 10 分钟内开始（你已报名）'
      })
    }

    const startTs = toTimestamp(item.start)
    if (!isFinite(startTs)) return

    const diff = startTs - current
    const key = 'start:' + String(item.id)
    if (diff < 0 || diff > WINDOW || notified[key]) return

    push({
      key: key,
      title: item.title || '活动',
      time: item.start,
      content: '「' + (item.title || '活动') + '」将在 10 分钟内开始'
    })
  })

  return due
}

function showNext(due) {
  if (!due.length) return

  const first = due[0]
  markNotified(first.key)

  wx.showModal({
    title: '活动提醒',
    content: first.content + '\n时间：' + first.time,
    showCancel: false,
    confirmText: '知道了',
    success: function () {
      setTimeout(function () {
        showNext(due.slice(1))
      }, 300)
    }
  })
}

function checkAndShow() {
  const due = dueList(new Date())
  if (due.length > 0) showNext(due)
}

function start() {
  stop()
  checkAndShow()
  timer = setInterval(checkAndShow, CHECK_INTERVAL)
}

function stop() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

module.exports = {
  getFollowed: getFollowed,
  follow: follow,
  unfollow: unfollow,
  isFollowed: isFollowed,
  dueList: dueList,
  checkAndShow: checkAndShow,
  start: start,
  stop: stop
}
