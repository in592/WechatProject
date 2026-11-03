/**
 * utils/storage.js —— 我的日程（本地存储）
 *
 * 只存在本机 wx storage，不上传；P6 的报名冲突检测、P7 的日程页共用。
 */

const SCHEDULE_KEY = 'my_schedule'

function getSchedule() {
  try {
    const list = wx.getStorageSync(SCHEDULE_KEY)
    return Array.isArray(list) ? list : []
  } catch (err) {
    return []
  }
}

function saveSchedule(list) {
  wx.setStorageSync(SCHEDULE_KEY, Array.isArray(list) ? list : [])
}

function addSchedule(item) {
  const list = getSchedule()
  list.push(item)
  saveSchedule(list)
  return list
}

function removeSchedule(id) {
  const target = String(id)
  const list = getSchedule().filter(function (item) {
    return String(item.id) !== target
  })
  saveSchedule(list)
  return list
}

module.exports = {
  SCHEDULE_KEY: SCHEDULE_KEY,
  getSchedule: getSchedule,
  saveSchedule: saveSchedule,
  addSchedule: addSchedule,
  removeSchedule: removeSchedule
}
