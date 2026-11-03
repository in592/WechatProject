/**
 * utils/agenda.js —— 合并「课程日程」与「活动日程」
 *
 * 课程：utils/storage.js 的 my_schedule（手动 / OCR 添加）
 * 活动：utils/signup.js 的 my_signups（报名成功）
 *
 * 冲突检测必须用合并后的日程，否则已报名活动之间不会互相拦截。
 */

const storage = require('./storage')
const signup = require('./signup')

function getAgenda() {
  const courses = storage.getSchedule().map(function (item) {
    return Object.assign({}, item, { source: 'course' })
  })

  const activities = signup.getSignups().map(function (item) {
    return Object.assign({}, item, { source: 'activity' })
  })

  return courses.concat(activities)
}

module.exports = {
  getAgenda: getAgenda
}
