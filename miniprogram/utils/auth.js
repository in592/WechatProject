/**
 * utils/auth.js —— 学号 + 姓名登录态（本地存储）
 *
 * 只存在本机 wx storage，不上传；所有页面统一通过这里读写。
 */

const STORAGE_KEY = 'campus_user'

function getUser() {
  try {
    const user = wx.getStorageSync(STORAGE_KEY)
    if (!user || typeof user !== 'object') return null
    if (!user.studentId || !user.name) return null
    return user
  } catch (err) {
    return null
  }
}

function saveUser(user) {
  wx.setStorageSync(STORAGE_KEY, user)
}

function clearUser() {
  try {
    wx.removeStorageSync(STORAGE_KEY)
  } catch (err) {
    // 忽略：没有登录态时删除失败不影响使用
  }
}

function isLoggedIn() {
  return Boolean(getUser())
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  getUser: getUser,
  saveUser: saveUser,
  clearUser: clearUser,
  isLoggedIn: isLoggedIn
}
