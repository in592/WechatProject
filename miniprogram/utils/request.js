/**
 * utils/request.js —— 小程序唯一的 HTTP 出口
 *
 * 所有 wx.request 都必须经过这里：
 *   - 统一 BASE_URL
 *   - 失败必须给用户可见提示（AGENTS.md 第 5 节第 8 条），禁止静默失败
 *
 * 用法：
 *   const request = require('../../utils/request')
 *   request.get('/api/activities').then(function (data) { ... })
 *   request.post('/api/import', { text: '...' }).then(function (data) { ... })
 */

const BASE_URL = 'http://127.0.0.1:3000'

function request(options) {
  const opts = options || {}

  return new Promise(function (resolve, reject) {
    wx.request({
      url: BASE_URL + (opts.url || ''),
      method: opts.method || 'GET',
      data: opts.data,
      header: opts.header || { 'Content-Type': 'application/json' },
      timeout: opts.timeout || 10000,
      success: function (res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }

        const message = (res.data && res.data.error) || ('请求失败（' + res.statusCode + '）')
        wx.showToast({ title: message, icon: 'none' })
        reject(new Error(message))
      },
      fail: function (err) {
        const message = '网络异常，请检查后端是否启动'
        wx.showToast({ title: message, icon: 'none' })
        reject(new Error(err && err.errMsg ? err.errMsg : message))
      }
    })
  })
}

function get(url, data) {
  return request({ url: url, method: 'GET', data: data })
}

function post(url, data) {
  return request({ url: url, method: 'POST', data: data })
}

module.exports = {
  BASE_URL: BASE_URL,
  request: request,
  get: get,
  post: post
}
