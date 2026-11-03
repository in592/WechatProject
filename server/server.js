/**
 * server/server.js —— 校园管家后端（零依赖，只用 Node 原生 http）
 *
 * 运行：node server/server.js
 * 健康检查：http://127.0.0.1:3000/api/health
 *
 * 约定（AGENTS.md 第 5 节）：
 *   1. OPTIONS 预检最优先，返回 204
 *   2. 请求体不是合法 JSON 时返回 400，进程不能崩
 *   3. 唯一写入口是 POST /api/import，解析入库下一步实现
 */

const http = require('http')
const fs = require('fs')
const crypto = require('crypto')
const path = require('path')
const parser = require('../miniprogram/utils/parser')

const HOST = '127.0.0.1'
const PORT = 3000
const DATA_FILE = path.join(__dirname, 'data.json')
const MAX_BODY = 1024 * 1024

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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

  // 唯一写入口：解析入库下一步接上
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
      const parsed = parser.parse(text)

      if (!parsed.ok) {
        sendJson(res, 422, {
          ok: false,
          error: '解析失败，请检查通知内容',
          warnings: parsed.warnings,
          activity: parsed.activity
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
        source: source,
        rawText: text,
        createdAt: new Date().toISOString()
      }

      data.activities.unshift(activity)
      writeData(data)

      sendJson(res, 201, {
        ok: true,
        activity: activity,
        warnings: parsed.warnings
      })
    })
    return
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
