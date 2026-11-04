/**
 * server/server.js —— 校园管家后端（零依赖，只用 Node 原生 http）
 *
 * 运行：node server/server.js
 * 健康检查：http://127.0.0.1:3000/api/health
 *
 * 约定（AGENTS.md 第 5 节）：
 *   1. OPTIONS 预检最优先，返回 204
 *   2. 请求体不是合法 JSON 时返回 400，进程不能崩
 *   3. 写接口：POST /api/import（网页/模拟）、POST /api/qq/event（OneBot 11）、
 *      PUT/DELETE /api/activities/:id（后台管理）
 */

const http = require('http')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const path = require('path')
const { spawn } = require('child_process')
const parser = require('../miniprogram/utils/parser')

const HOST = '127.0.0.1'
const PORT = 3000
const DATA_FILE = path.join(__dirname, 'data.json')
const MAX_BODY = 12 * 1024 * 1024
const PUBLIC_DIR = path.join(__dirname, 'public')
const OCR_SCRIPT = path.join(__dirname, 'ocr.ps1')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-QQ-Token',
  'Access-Control-Max-Age': '86400'
}

function ensureDataFile() {
  if (fs.existsSync(DATA_FILE)) return
  fs.writeFileSync(DATA_FILE, JSON.stringify({ activities: [] }, null, 2), 'utf8')
}

function readData() {
  ensureDataFile()
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  } catch (err) {
    return { activities: [] }
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8')
}

/** 从通知文本粗略猜类型，后台可以再改 */
function guessType(text) {
  if (/志愿|公益|献血|支教|义卖|环保/.test(text)) return '志愿公益'
  if (/讲座|学术|科技|论坛|沙龙|竞赛|科研|人工智能|算法/.test(text)) return '学术科技'
  if (/摄影|编程|设计|写作|演讲|辩论|工作坊|培训|技能/.test(text)) return '技能特长'
  if (/篮球|足球|羽毛|乒乓|排球|网球|运动会|歌唱|歌手|舞蹈|演出|晚会|文艺|比赛|电影|动漫|二次元|cos|拍照|打卡/.test(text)) return '文体活动'
  return '其他'
}

const QQ_BOT_TOKEN = process.env.QQ_BOT_TOKEN || ''
const QQ_GROUP_ID = process.env.QQ_GROUP_ID || ''
const qqSeen = new Map()

function importText(text, source, callback) {
  const parsed = parser.parse(text)

  if (!parsed.ok) {
    callback({
      status: 422,
      body: {
        ok: false,
        error: '解析失败，请检查通知内容',
        warnings: parsed.warnings,
        activity: parsed.activity
      }
    })
    return
  }

  const data = readData()
  if (!Array.isArray(data.activities)) data.activities = []

  const activity = {
    id: crypto.randomUUID(),
    title: parsed.activity.title,
    start: parsed.activity.start,
    end: parsed.activity.end,
    location: parsed.activity.location,
    credit: parsed.activity.credit,
    organizer: parsed.activity.organizer,
    type: guessType(text),
    source: source,
    rawText: text,
    createdAt: new Date().toISOString()
  }

  data.activities.unshift(activity)
  writeData(data)

  callback({
    status: 201,
    body: {
      ok: true,
      activity: activity,
      warnings: parsed.warnings
    }
  })
}

/** OneBot 11 消息 → 纯文本；去掉 @、图片等 CQ 码 */
function oneBotText(payload) {
  if (typeof payload.raw_message === 'string' && payload.raw_message.trim()) {
    return payload.raw_message.replace(/\[CQ:[^\]]+\]/g, ' ').replace(/\s+/g, ' ').trim()
  }
  if (typeof payload.message === 'string') {
    return payload.message.replace(/\[CQ:[^\]]+\]/g, ' ').replace(/\s+/g, ' ').trim()
  }
  if (Array.isArray(payload.message)) {
    return payload.message.map(function (segment) {
      if (!segment || segment.type !== 'text' || !segment.data) return ''
      return String(segment.data.text || '')
    }).join(' ').replace(/\s+/g, ' ').trim()
  }
  if (typeof payload.text === 'string') return payload.text.trim()
  return ''
}

function qqAuthorized(req) {
  if (!QQ_BOT_TOKEN) return true
  const authorization = String(req.headers.authorization || '')
  const headerToken = String(req.headers['x-qq-token'] || '')
  return authorization === 'Bearer ' + QQ_BOT_TOKEN || headerToken === QQ_BOT_TOKEN
}

function qqKey(payload, text) {
  if (payload.message_id !== undefined && payload.message_id !== null) {
    return 'id:' + String(payload.message_id)
  }
  const raw = [payload.group_id, payload.user_id, payload.time, text].join('|')
  return 'hash:' + crypto.createHash('sha1').update(raw).digest('hex')
}

function markQQSeen(key) {
  qqSeen.set(key, Date.now())
  if (qqSeen.size > 500) {
    const first = qqSeen.keys().next().value
    qqSeen.delete(first)
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload)

  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*'
  })
  res.end(body)
}

function sendNoContent(res) {
  res.writeHead(204, CORS_HEADERS)
  res.end()
}

/** 托管 server/public 下的静态文件；找不到返回 false */
function serveStatic(pathname, res) {
  const relative = pathname === '/' ? '/index.html' : pathname
  const filePath = path.resolve(PUBLIC_DIR, '.' + relative)

  if (filePath.indexOf(PUBLIC_DIR + path.sep) !== 0) {
    sendJson(res, 403, { ok: false, error: 'Forbidden' })
    return true
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false

  const ext = path.extname(filePath).toLowerCase()
  const body = fs.readFileSync(filePath)

  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Content-Length': body.length,
    'Access-Control-Allow-Origin': '*'
  })
  res.end(body)
  return true
}

function readJsonBody(req, callback) {
  let raw = ''
  let settled = false

  function finish(err, data) {
    if (settled) return
    settled = true
    callback(err, data)
  }

  req.on('data', function (chunk) {
    raw += chunk
    if (raw.length > MAX_BODY) {
      finish(new Error('TOO_LARGE'))
      req.destroy()
    }
  })

  req.on('end', function () {
    if (!raw) {
      finish(null, {})
      return
    }
    try {
      finish(null, JSON.parse(raw))
    } catch (err) {
      finish(new Error('INVALID_JSON'))
    }
  })

  req.on('error', function () {
    finish(new Error('REQUEST_ERROR'))
  })
}

const server = http.createServer(function (req, res) {
  // 1. 预检必须最优先
  if (req.method === 'OPTIONS') {
    sendNoContent(res)
    return
  }

  let pathname = ''
  try {
    pathname = new URL(req.url, 'http://' + HOST + ':' + PORT).pathname
  } catch (err) {
    sendJson(res, 400, { ok: false, error: '非法请求地址' })
    return
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'campus-assistant',
      version: '0.1.0',
      time: new Date().toISOString()
    })
    return
  }

  if (req.method === 'GET' && pathname === '/api/activities') {
    sendJson(res, 200, { ok: true, activities: readData().activities })
    return
  }

  // 单条活动：详情页用
  const singleMatch = pathname.match(/^\/api\/activities\/([^/]+)$/)
  if (req.method === 'GET' && singleMatch) {
    let singleId = singleMatch[1]
    try {
      singleId = decodeURIComponent(singleId)
    } catch (err) {
      // 保持原样
    }

    const data = readData()
    const activity = Array.isArray(data.activities)
      ? data.activities.find(function (item) { return item.id === singleId })
      : null

    if (!activity) {
      sendJson(res, 404, { ok: false, error: '活动不存在' })
      return
    }

    sendJson(res, 200, { ok: true, activity: activity })
    return
  }

  // 只解析不入库，给管理后台做预览
  if (req.method === 'POST' && pathname === '/api/parse') {
    readJsonBody(req, function (err, body) {
      if (err) {
        const tooLarge = err.message === 'TOO_LARGE'
        sendJson(res, tooLarge ? 413 : 400, {
          ok: false,
          error: tooLarge ? '请求体过大' : '请求体不是合法 JSON'
        })
        return
      }

      const payload = body && typeof body === 'object' ? body : {}
      const text = typeof payload.text === 'string' ? payload.text.trim() : ''

      if (!text) {
        sendJson(res, 400, { ok: false, error: 'text 不能为空' })
        return
      }

      const parsed = parser.parse(text)
      sendJson(res, 200, {
        ok: parsed.ok,
        activity: {
          title: parsed.activity.title,
          start: parsed.activity.start,
          end: parsed.activity.end,
          location: parsed.activity.location,
          credit: parsed.activity.credit,
          organizer: parsed.activity.organizer,
          type: guessType(text)
        },
        warnings: parsed.warnings
      })
    })
    return
  }

  // 拍照 OCR：只在 Windows 本机识别，不上传第三方
  if (req.method === 'POST' && pathname === '/api/ocr') {
    readJsonBody(req, function (err, body) {
      if (err) {
        const tooLarge = err.message === 'TOO_LARGE'
        sendJson(res, tooLarge ? 413 : 400, {
          ok: false,
          error: tooLarge ? '图片太大' : '请求体不是合法 JSON'
        })
        return
      }

      const payload = body && typeof body === 'object' ? body : {}
      const image = typeof payload.image === 'string' ? payload.image.trim() : ''
      if (!image) {
        sendJson(res, 400, { ok: false, error: 'image 不能为空' })
        return
      }

      const base64 = image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
      let imageBuffer = null
      try {
        imageBuffer = Buffer.from(base64, 'base64')
      } catch (decodeErr) {
        imageBuffer = null
      }

      if (!imageBuffer || imageBuffer.length < 100) {
        sendJson(res, 400, { ok: false, error: '图片数据无效' })
        return
      }
      if (imageBuffer.length > 8 * 1024 * 1024) {
        sendJson(res, 413, { ok: false, error: '图片不能超过 8MB' })
        return
      }

      const isPng = imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50
      const isJpg = imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8
      if (!isPng && !isJpg) {
        sendJson(res, 400, { ok: false, error: '只支持 PNG / JPG 图片' })
        return
      }

      const tempFile = path.join(os.tmpdir(), 'campus-ocr-' + crypto.randomUUID() + '.png')
      const outFile = tempFile + '.json'

      try {
        fs.writeFileSync(tempFile, imageBuffer)
      } catch (writeErr) {
        sendJson(res, 500, { ok: false, error: '临时图片写入失败' })
        return
      }

      let settled = false
      let timer = null

      function cleanup() {
        try {
          fs.unlinkSync(tempFile)
        } catch (unlinkErr) {
          // 忽略
        }
        try {
          fs.unlinkSync(outFile)
        } catch (unlinkErr) {
          // 忽略
        }
      }

      function finish(statusCode, payload) {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        cleanup()
        sendJson(res, statusCode, payload)
      }

      // 用 stdio:'ignore' + 文件输出，避开沙箱对管道抓输出的限制
      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', OCR_SCRIPT,
        '-Path', tempFile,
        '-OutPath', outFile
      ], {
        windowsHide: true,
        stdio: 'ignore'
      })

      timer = setTimeout(function () {
        try {
          child.kill()
        } catch (killErr) {
          // 忽略
        }
        finish(500, { ok: false, error: 'OCR 超时，请重试或换一张更清晰的图片' })
      }, 30000)

      child.on('error', function (spawnErr) {
        finish(500, { ok: false, error: 'OCR 启动失败：' + (spawnErr.message || '未知错误') })
      })

      child.on('close', function (code) {
        if (settled) return

        let result = null
        try {
          result = JSON.parse(fs.readFileSync(outFile, 'utf8'))
        } catch (readErr) {
          result = null
        }

        if (!result) {
          finish(500, { ok: false, error: 'OCR 没有返回结果（exit ' + code + '）' })
          return
        }
        if (result.ok === false) {
          finish(500, { ok: false, error: result.error || 'OCR 识别失败' })
          return
        }

        const lines = Array.isArray(result.lines)
          ? result.lines.filter(function (line) { return typeof line === 'string' && line.trim() })
          : []

        finish(200, { ok: true, lines: lines, text: lines.join('\n') })
      })
    })
    return
  }

  // OneBot 11 适配器：NapCat / LLOneBot 把群消息 POST 到这里
  if (req.method === 'POST' && (pathname === '/api/qq/event' || pathname === '/api/qq/message')) {
    if (!qqAuthorized(req)) {
      sendJson(res, 401, { ok: false, error: 'QQ bot token 不正确' })
      return
    }

    readJsonBody(req, function (err, body) {
      if (err) {
        const tooLarge = err.message === 'TOO_LARGE'
        sendJson(res, tooLarge ? 413 : 400, {
          ok: false,
          error: tooLarge ? '请求体过大' : '请求体不是合法 JSON'
        })
        return
      }

      const payload = body && typeof body === 'object' ? body : {}

      if (payload.post_type && payload.post_type !== 'message') {
        sendNoContent(res)
        return
      }
      if (payload.message_type && payload.message_type !== 'group') {
        sendNoContent(res)
        return
      }
      if (QQ_GROUP_ID && String(payload.group_id || '') !== QQ_GROUP_ID) {
        sendNoContent(res)
        return
      }

      const text = oneBotText(payload)
      if (!text) {
        sendJson(res, 200, { ok: false, error: '空消息' })
        return
      }

      const key = qqKey(payload, text)
      if (qqSeen.has(key)) {
        sendJson(res, 200, { ok: true, skipped: true })
        return
      }

      importText(text, 'qq', function (result) {
        if (result.status === 201) markQQSeen(key)

        if (result.status === 422) {
          sendJson(res, 200, {
            ok: false,
            error: '解析失败',
            warnings: result.body.warnings,
            activity: result.body.activity
          })
          return
        }

        sendJson(res, 200, result.body)
      })
    })
    return
  }

  // 网页后台 / 模拟上报的导入入口
  if (req.method === 'POST' && pathname === '/api/import') {
    readJsonBody(req, function (err, body) {
      if (err) {
        const tooLarge = err.message === 'TOO_LARGE'
        sendJson(res, tooLarge ? 413 : 400, {
          ok: false,
          error: tooLarge ? '请求体过大' : '请求体不是合法 JSON'
        })
        return
      }

      const payload = body && typeof body === 'object' ? body : {}
      const text = typeof payload.text === 'string' ? payload.text.trim() : ''

      if (!text) {
        sendJson(res, 400, { ok: false, error: 'text 不能为空' })
        return
      }

      const source = payload.source === 'qq' ? 'qq' : 'web'
      importText(text, source, function (result) {
        sendJson(res, result.status, result.body)
      })
    })
    return
  }

  const activityMatch = pathname.match(/^\/api\/activities\/([^/]+)$/)
  let activityId = ''
  if (activityMatch) {
    try {
      activityId = decodeURIComponent(activityMatch[1])
    } catch (err) {
      activityId = activityMatch[1]
    }
  }

  if (activityId && req.method === 'PUT') {
    readJsonBody(req, function (err, body) {
      if (err) {
        const tooLarge = err.message === 'TOO_LARGE'
        sendJson(res, tooLarge ? 413 : 400, {
          ok: false,
          error: tooLarge ? '请求体过大' : '请求体不是合法 JSON'
        })
        return
      }

      const payload = body && typeof body === 'object' ? body : {}
      const data = readData()
      if (!Array.isArray(data.activities)) data.activities = []

      const index = data.activities.findIndex(function (item) {
        return item.id === activityId
      })
      if (index < 0) {
        sendJson(res, 404, { ok: false, error: '活动不存在' })
        return
      }

      const next = Object.assign({}, data.activities[index])
      let invalid = ''

      if (payload.title !== undefined) {
        if (typeof payload.title !== 'string' || !payload.title.trim()) {
          invalid = '标题不能为空'
        } else {
          next.title = payload.title.trim()
        }
      }

      ;['start', 'end'].forEach(function (key) {
        if (invalid) return
        if (payload[key] !== undefined) {
          const value = String(payload[key]).trim()
          if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) {
            invalid = (key === 'start' ? '开始时间' : '结束时间') + '格式应为 YYYY-MM-DD HH:mm'
          } else {
            next[key] = value
          }
        }
      })

      if (payload.location !== undefined) {
        next.location = String(payload.location || '').trim()
      }

      if (payload.credit !== undefined) {
        if (payload.credit === null || payload.credit === '') {
          next.credit = null
        } else {
          const credit = Number(payload.credit)
          if (!isFinite(credit)) invalid = '学分必须是数字'
          else next.credit = credit
        }
      }

      if (payload.type !== undefined) {
        next.type = String(payload.type || '其他').trim() || '其他'
      }

      if (payload.organizer !== undefined) {
        next.organizer = String(payload.organizer || '').trim()
      }

      if (invalid) {
        sendJson(res, 400, { ok: false, error: invalid })
        return
      }

      next.updatedAt = new Date().toISOString()
      data.activities[index] = next
      writeData(data)

      sendJson(res, 200, { ok: true, activity: next })
    })
    return
  }

  if (activityId && req.method === 'DELETE') {
    const data = readData()
    if (!Array.isArray(data.activities)) data.activities = []

    const index = data.activities.findIndex(function (item) {
      return item.id === activityId
    })
    if (index < 0) {
      sendJson(res, 404, { ok: false, error: '活动不存在' })
      return
    }

    const removed = data.activities.splice(index, 1)[0]
    writeData(data)

    sendJson(res, 200, { ok: true, id: activityId, activity: removed })
    return
  }

  if (req.method === 'GET' && pathname.indexOf('/api/') !== 0) {
    if (serveStatic(pathname, res)) return
  }

  sendJson(res, 404, { ok: false, error: 'Not Found', path: pathname })
})

server.on('error', function (err) {
  console.error('服务启动失败：' + err.message)
  process.exit(1)
})

ensureDataFile()

server.listen(PORT, HOST, function () {
  console.log('校园管家后端已启动：http://' + HOST + ':' + PORT)
  console.log('健康检查：http://' + HOST + ':' + PORT + '/api/health')
})
