const request = require('../../utils/request')
const auth = require('../../utils/auth')
const agenda = require('../../utils/agenda')
const conflict = require('../../utils/conflict')

const CACHE_KEY = 'activities_cache'
const TYPE_OPTIONS = ['全部', '学术科技', '志愿公益', '文体活动', '技能特长']

function typeClass(type) {
  if (type === '学术科技') return 'academic'
  if (type === '志愿公益') return 'volunteer'
  if (type === '文体活动') return 'sports'
  if (type === '技能特长') return 'skill'
  return 'other'
}

function datePart(value) {
  const text = String(value || '')
  return text.length >= 16 ? text.slice(5, 10) : ''
}

function timePart(value) {
  const text = String(value || '')
  return text.length >= 16 ? text.slice(11, 16) : ''
}

function decorate(item) {
  const startDate = datePart(item.start)
  const endDate = datePart(item.end)
  const startTime = timePart(item.start)
  const endTime = timePart(item.end)

  let dateText = startDate || '时间待定'
  if (endDate && endDate !== startDate) dateText += ' → ' + endDate

  return {
    id: String(item.id || ''),
    title: item.title || '未命名活动',
    location: item.location || '',
    dateText: dateText,
    timeText: startTime ? startTime + (endTime ? ' - ' + endTime : '') : '',
    typeText: item.type || '其他',
    typeClass: typeClass(item.type),
    creditText: item.credit === null || item.credit === undefined ? '' : item.credit + ' 学分'
  }
}

Page({
  data: {
    userName: '',
    activities: [],
    filtered: [],
    keyword: '',
    activeType: '全部',
    avoidConflict: false,
    typeOptions: TYPE_OPTIONS,
    loading: true,
    error: '',
    fromCache: false,
    loaded: false
  },

  onLoad: function () {
    const app = getApp()
    const user = (app && app.globalData && app.globalData.user) || auth.getUser()
    this.setData({ userName: user ? user.name : '' })
    return this.loadActivities()
  },

  onShow: function () {
    if (this.data.loaded) {
      return this.loadActivities()
    }
  },

  onPullDownRefresh: function () {
    return this.loadActivities(true)
  },

  loadActivities: function (fromPull) {
    const that = this
    this.setData({ loading: true, error: '' })

    return request.get('/api/activities')
      .then(function (data) {
        if (!data || data.ok === false) {
          throw new Error('接口返回异常')
        }

        const list = Array.isArray(data.activities) ? data.activities : []
        try {
          wx.setStorageSync(CACHE_KEY, list)
        } catch (err) {
          // 缓存失败不影响本次展示
        }

        that.setData({ activities: list, loading: false, fromCache: false, loaded: true })
        that.applyFilters(list)
      })
      .catch(function () {
        let cache = null
        try {
          cache = wx.getStorageSync(CACHE_KEY)
        } catch (err) {
          cache = null
        }

        const list = Array.isArray(cache) ? cache : []
        that.setData({
          activities: list,
          loading: false,
          fromCache: list.length > 0,
          loaded: true,
          error: list.length > 0 ? '' : '网络异常，请检查后端是否启动'
        })
        that.applyFilters(list)
      })
      .then(function () {
        if (fromPull && wx.stopPullDownRefresh) {
          wx.stopPullDownRefresh()
        }
      })
  },

  applyFilters: function (source, keyword, activeType) {
    const activities = Array.isArray(source) ? source : this.data.activities
    const text = String(keyword === undefined ? this.data.keyword : keyword || '').trim().toLowerCase()
    const type = activeType === undefined ? this.data.activeType : activeType
    const avoidConflict = this.data.avoidConflict
    const schedule = avoidConflict ? agenda.getAgenda() : []

    const list = activities.filter(function (item) {
      const itemType = item.type || '其他'
      if (type !== '全部' && itemType !== type) return false
      if (!text) return true

      const title = String(item.title || '').toLowerCase()
      const location = String(item.location || '').toLowerCase()
      return title.indexOf(text) >= 0 || location.indexOf(text) >= 0
    }).filter(function (item) {
      if (!avoidConflict) return true

      const others = schedule.filter(function (entry) {
        return String(entry.id) !== String(item.id)
      })
      return conflict.findConflicts(item, others).length === 0
    }).map(decorate)

    this.setData({ filtered: list })
  },

  onSearchInput: function (event) {
    const keyword = event.detail.value
    this.setData({ keyword: keyword })
    this.applyFilters(this.data.activities, keyword, this.data.activeType)
  },

  onTypeTap: function (event) {
    const activeType = event.currentTarget.dataset.type
    this.setData({ activeType: activeType })
    this.applyFilters(this.data.activities, this.data.keyword, activeType)
  },

  onToggleConflict: function () {
    const that = this
    const next = !this.data.avoidConflict

    this.setData({ avoidConflict: next }, function () {
      that.applyFilters(that.data.activities, that.data.keyword, that.data.activeType)

      if (next) {
        wx.showToast({
          title: that.data.filtered.length > 0 ? '已隐藏冲突活动' : '没有不冲突的活动',
          icon: 'none'
        })
      }
    })
  },

  onCardTap: function (event) {
    const id = String(event.currentTarget.dataset.id || '')
    if (!id) return
    wx.navigateTo({ url: '/pages/detail/detail?id=' + encodeURIComponent(id) })
  },

  onRetry: function () {
    return this.loadActivities()
  }
})
