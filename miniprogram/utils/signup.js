/**
 * utils/signup.js —— 已报名活动（本地存储）
 *
 * 只保存在本机；「我的」页据此展示报名列表和学分饼图。
 */

const SIGNUP_KEY = 'my_signups'

function toCredit(value) {
  if (value === null || value === undefined || value === '') return null
  const credit = Number(value)
  return isFinite(credit) ? credit : null
}

function normalize(item) {
  return {
    id: String(item.id || ''),
    title: item.title || '未命名活动',
    start: String(item.start || ''),
    end: String(item.end || ''),
    location: item.location || '',
    type: item.type || '其他',
    credit: toCredit(item.credit),
    organizer: item.organizer || '',
    signedAt: Number(item.signedAt) || Date.now()
  }
}

function getSignups() {
  try {
    const list = wx.getStorageSync(SIGNUP_KEY)
    return Array.isArray(list) ? list.map(normalize) : []
  } catch (err) {
    return []
  }
}

function saveSignup(activity) {
  const id = String(activity.id || '')
  if (!id) return null

  const list = getSignups()
  const item = normalize(Object.assign({}, activity, { signedAt: Date.now() }))
  const index = list.findIndex(function (entry) {
    return entry.id === id
  })

  if (index >= 0) {
    list[index] = item
  } else {
    list.push(item)
  }

  wx.setStorageSync(SIGNUP_KEY, list)
  return item
}

function isSignedUp(id) {
  const target = String(id || '')
  return getSignups().some(function (item) {
    return item.id === target
  })
}

function removeSignup(id) {
  const target = String(id || '')
  const list = getSignups().filter(function (item) {
    return item.id !== target
  })
  wx.setStorageSync(SIGNUP_KEY, list)
  return list
}

module.exports = {
  SIGNUP_KEY: SIGNUP_KEY,
  getSignups: getSignups,
  saveSignup: saveSignup,
  isSignedUp: isSignedUp,
  removeSignup: removeSignup
}
