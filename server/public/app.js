(function () {
  'use strict'

  var state = {
    activities: [],
    editingId: null,
    parsed: null
  }

  function $(id) {
    return document.getElementById(id)
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function toast(message, type) {
    var el = $('toast')
    el.textContent = message
    el.className = 'toast' + (type === 'error' ? ' error' : '')
    window.clearTimeout(toast.timer)
    toast.timer = window.setTimeout(function () {
      el.className = 'toast hidden'
    }, 2600)
  }

  function setServerStatus(ok) {
    $('serverStatus').className = 'server-status ' + (ok ? 'ok' : 'bad')
    $('serverStatusText').textContent = ok ? '后端已连接' : '后端连接失败'
  }

  function toInputValue(value) {
    if (!value) return ''
    return String(value).replace(' ', 'T').slice(0, 16)
  }

  function fromInputValue(value) {
    if (!value) return ''
    return String(value).replace('T', ' ').slice(0, 16)
  }

  function fillForm(activity) {
    var item = activity || {}
    $('fTitle').value = item.title || ''
    $('fStart').value = toInputValue(item.start)
    $('fEnd').value = toInputValue(item.end)
    $('fLocation').value = item.location || ''
    $('fSignupStart').value = toInputValue(item.signupStart)
    $('fSignupEnd').value = toInputValue(item.signupEnd)
    $('fType').value = item.type || '其他'
  }

  function clearFields() {
    fillForm({})
  }

  function collectForm() {
    return {
      title: $('fTitle').value.trim(),
      start: fromInputValue($('fStart').value),
      end: fromInputValue($('fEnd').value),
      location: $('fLocation').value.trim(),
      signupStart: fromInputValue($('fSignupStart').value),
      signupEnd: fromInputValue($('fSignupEnd').value),
      type: $('fType').value
    }
  }

  function setWarnings(list) {
    var box = $('warnings')
    if (!Array.isArray(list) || list.length === 0) {
      box.className = 'warnings hidden'
      box.innerHTML = ''
      return
    }

    box.className = 'warnings'
    box.innerHTML = '<strong>解析提示</strong><ul>' + list.map(function (item) {
      return '<li>' + escapeHtml(item) + '</li>'
    }).join('') + '</ul>'
  }

  function resetForm() {
    $('noticeText').value = ''
    $('source').value = 'web'
    clearFields()
    setWarnings([])
    state.parsed = null
    state.editingId = null
    $('importBtn').textContent = '导入'
    $('cancelEditBtn').className = 'btn text hidden'
  }

  function sourceLabel(source) {
    return source === 'qq' ? 'QQ' : '网页'
  }

  function typeClass(type) {
    if (type === '学术科技') return 'academic'
    if (type === '志愿公益') return 'volunteer'
    if (type === '文体活动') return 'sports'
    if (type === '技能特长') return 'skill'
    return 'other'
  }

  function renderActivities() {
    var body = $('activityBody')
    $('count').textContent = state.activities.length + ' 条'

    if (state.activities.length === 0) {
      body.innerHTML = '<tr><td colspan="7" class="empty">还没有活动，先在上面导入一条通知</td></tr>'
      return
    }

    body.innerHTML = state.activities.map(function (item) {
      var type = item.type || '其他'
      var signupText = item.signupStart
        ? item.signupStart + (item.signupEnd ? ' → ' + item.signupEnd : '')
        : '—'
      return '<tr>' +
        '<td class="title-cell" title="' + escapeHtml(item.title || '') + '">' + escapeHtml(item.title || '未命名活动') + '</td>' +
        '<td class="time-cell">' + escapeHtml(item.start || '—') +
          (item.end ? '<span class="muted">→ ' + escapeHtml(item.end) + '</span>' : '') + '</td>' +
        '<td>' + escapeHtml(item.location || '—') + '</td>' +
        '<td class="time-cell">' + escapeHtml(signupText) + '</td>' +
        '<td><span class="tag ' + typeClass(type) + '">' + escapeHtml(type) + '</span></td>' +
        '<td class="source">' + escapeHtml(sourceLabel(item.source)) + '</td>' +
        '<td class="ops">' +
          '<button type="button" class="link edit" data-id="' + escapeHtml(item.id) + '">编辑</button>' +
          '<button type="button" class="link danger delete" data-id="' + escapeHtml(item.id) + '">删除</button>' +
        '</td>' +
      '</tr>'
    }).join('')
  }

  async function api(path, options) {
    var opts = options || {}
    var init = { method: opts.method || 'GET' }
    if (opts.body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' }
      init.body = JSON.stringify(opts.body)
    }

    var response = await fetch(path, init)
    var data = null

    try {
      data = await response.json()
    } catch (err) {
      throw new Error('服务端返回不是 JSON')
    }

    if (!response.ok) {
      var requestError = new Error((data && data.error) || ('请求失败（' + response.status + '）'))
      requestError.data = data
      throw requestError
    }

    return data
  }

  async function loadActivities() {
    try {
      var data = await api('/api/activities')
      state.activities = Array.isArray(data.activities) ? data.activities : []
      renderActivities()
      setServerStatus(true)
    } catch (err) {
      setServerStatus(false)
      $('activityBody').innerHTML = '<tr><td colspan="7" class="empty">加载失败：' + escapeHtml(err.message) + '</td></tr>'
      toast(err.message, 'error')
    }
  }

  async function parseNotice() {
    if (state.editingId) cancelEdit()

    var text = $('noticeText').value.trim()
    if (!text) {
      toast('先粘贴通知原文')
      return
    }

    try {
      var data = await api('/api/parse', { method: 'POST', body: { text: text } })
      state.parsed = data.activity
      fillForm(data.activity)
      setWarnings(data.warnings || [])
      toast(data.ok ? '解析成功' : '解析不完整，请手动补充')
    } catch (err) {
      setWarnings(err.data && err.data.warnings)
      toast(err.message, 'error')
    }
  }

  async function importActivity() {
    if (state.editingId) {
      await saveEdit()
      return
    }

    var text = $('noticeText').value.trim()
    if (!text) {
      toast('先粘贴通知原文')
      return
    }

    try {
      var data = await api('/api/import', {
        method: 'POST',
        body: { text: text, source: $('source').value }
      })

      if (state.parsed) {
        await api('/api/activities/' + encodeURIComponent(data.activity.id), {
          method: 'PUT',
          body: collectForm()
        })
      }

      toast('导入成功')
      resetForm()
      await loadActivities()
    } catch (err) {
      setWarnings(err.data && err.data.warnings)
      toast(err.message, 'error')
    }
  }

  function startEdit(id) {
    var item = state.activities.find(function (activity) {
      return activity.id === id
    })
    if (!item) return

    state.editingId = id
    state.parsed = null
    fillForm(item)
    $('importBtn').textContent = '保存修改'
    $('cancelEditBtn').className = 'btn text'
    $('noticeText').value = item.rawText || ''
    setWarnings([])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveEdit() {
    if (!state.editingId) return

    var payload = collectForm()
    if (!payload.title || !payload.start || !payload.end) {
      toast('标题、开始时间、结束时间不能为空')
      return
    }

    try {
      await api('/api/activities/' + encodeURIComponent(state.editingId), {
        method: 'PUT',
        body: payload
      })
      toast('已保存')
      state.editingId = null
      $('importBtn').textContent = '导入'
      $('cancelEditBtn').className = 'btn text hidden'
      await loadActivities()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  function cancelEdit() {
    state.editingId = null
    state.parsed = null
    $('importBtn').textContent = '导入'
    $('cancelEditBtn').className = 'btn text hidden'
    clearFields()
    setWarnings([])
  }

  async function removeActivity(id) {
    var item = state.activities.find(function (activity) {
      return activity.id === id
    })
    var title = item ? item.title : '这条活动'

    if (!window.confirm('确定删除「' + title + '」？')) return

    try {
      await api('/api/activities/' + encodeURIComponent(id), { method: 'DELETE' })
      toast('已删除')
      if (state.editingId === id) cancelEdit()
      await loadActivities()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  $('parseBtn').addEventListener('click', parseNotice)
  $('importBtn').addEventListener('click', importActivity)
  $('cancelEditBtn').addEventListener('click', cancelEdit)
  $('noticeText').addEventListener('paste', function () {
    // 等浏览器把剪贴板内容写入 textarea 后再自动识别
    setTimeout(function () {
      if ($('noticeText').value.trim()) parseNotice()
    }, 80)
  })
  $('noticeText').addEventListener('input', function () {
    state.parsed = null
    setWarnings([])
  })
  $('activityBody').addEventListener('click', function (event) {
    var button = event.target.closest('button[data-id]')
    if (!button) return

    var id = button.getAttribute('data-id')
    if (button.classList.contains('edit')) startEdit(id)
    if (button.classList.contains('delete')) removeActivity(id)
  })

  loadActivities()
})()
