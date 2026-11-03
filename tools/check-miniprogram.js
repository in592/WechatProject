/**
 * tools/check-miniprogram.js —— 小程序静态检查器
 *
 * 用法：
 *   node tools/check-miniprogram.js ./miniprogram
 *
 * 检查内容（对应 AGENTS.md 第 5 节）：
 *   - 页面四件套是否齐全
 *   - bindtap / catchtap 的方法是否在 Page({}) 里定义
 *   - usingComponents 声明的组件路径是否存在
 *   - 是否误用 datetime-local / input[type=date]
 *   - setData 的字段是否在 data 里初始化
 *   - 是否绕过 utils/request.js 直接 wx.request
 *   - JS 语法、JSON 语法、UTF-8 BOM
 *   - miniprogram 里是否混入 .git / node_modules / 超大文件
 *
 * 有 ERROR 时退出码 1；只有 WARN 时退出码 0。
 */

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const ROOT = path.resolve(process.argv[2] || './miniprogram')
const PAGE_EXTS = ['js', 'json', 'wxml', 'wxss']
const RESERVED_KEYS = [
  'data', 'options', 'behaviors', 'properties', 'methods', 'observers',
  'lifetimes', 'pageLifetimes', 'externalClasses', 'relations',
  'definitionFilter', 'componentGenerics'
]

const issues = []
const textCache = new Map()

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/')
}

function addIssue(level, page, message) {
  issues.push({ level: level, page: page || null, message: message })
}

function error(page, message) {
  addIssue('ERROR', page, message)
}

function warn(page, message) {
  addIssue('WARN', page, message)
}

function readText(file, page) {
  if (textCache.has(file)) return textCache.get(file)

  let buffer
  try {
    buffer = fs.readFileSync(file)
  } catch (err) {
    error(page, '读取失败：' + rel(file))
    textCache.set(file, null)
    return null
  }

  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    error(page, '文件带 UTF-8 BOM：' + rel(file))
  }

  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch (err) {
    error(page, '不是合法 UTF-8：' + rel(file))
    textCache.set(file, null)
    return null
  }

  textCache.set(file, text)
  return text
}

function parseJson(file, page) {
  const text = readText(file, page)
  if (text === null) return null

  try {
    return JSON.parse(text)
  } catch (err) {
    error(page, 'JSON 解析失败：' + rel(file) + '（' + err.message + '）')
    return null
  }
}

function checkSyntax(file, page) {
  const text = readText(file, page)
  if (text === null) return

  try {
    new vm.Script(text, { filename: file })
  } catch (err) {
    error(page, 'JS 语法错误：' + rel(file) + '（' + err.message + '）')
  }
}

function skipString(text, index) {
  const quote = text[index]
  let i = index + 1

  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2
      continue
    }
    if (text[i] === quote) return i + 1
    i++
  }
  return i
}

function skipLineComment(text, index) {
  let i = index
  while (i < text.length && text[i] !== '\n') i++
  return i
}

function skipBlockComment(text, index) {
  let i = index + 2
  while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
  return i + 2
}

/** 从 openIndex 处的 '{' 开始，找到匹配的 '}'，返回内部文本和结束位置 */
function findMatchingBrace(text, openIndex) {
  let depth = 0
  let i = openIndex

  while (i < text.length) {
    const ch = text[i]

    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(text, i)
      continue
    }
    if (ch === '/' && text[i + 1] === '/') {
      i = skipLineComment(text, i)
      continue
    }
    if (ch === '/' && text[i + 1] === '*') {
      i = skipBlockComment(text, i)
      continue
    }

    if (ch === '{') {
      depth++
      i++
      continue
    }
    if (ch === '}') {
      depth--
      if (depth === 0) {
        return { body: text.slice(openIndex + 1, i), end: i }
      }
      i++
      continue
    }
    i++
  }

  return null
}

/** 取 Page({...}) 里的对象体 */
function extractPageBody(jsText) {
  const match = jsText.match(/\bPage\s*\(/)
  if (!match) return null

  const openIndex = jsText.indexOf('{', match.index)
  if (openIndex < 0) return null

  const matched = findMatchingBrace(jsText, openIndex)
  return matched ? matched.body : null
}

/** 取对象第一层的 key（方法名 / data / 生命周期等） */
function extractTopLevelKeys(body) {
  const keys = new Set()
  let depth = 0
  let i = 0

  while (i < body.length) {
    const ch = body[i]

    if (ch === '"' || ch === "'" || ch === '`') {
      if (depth === 0 && ch !== '`') {
        const end = skipString(body, i)
        const raw = body.slice(i + 1, end - 1)
        let j = end
        while (j < body.length && /\s/.test(body[j])) j++
        if (body[j] === ':') keys.add(raw)
        i = end
        continue
      }
      i = skipString(body, i)
      continue
    }

    if (ch === '/' && body[i + 1] === '/') {
      i = skipLineComment(body, i)
      continue
    }
    if (ch === '/' && body[i + 1] === '*') {
      i = skipBlockComment(body, i)
      continue
    }

    if (ch === '{' || ch === '[' || ch === '(') {
      depth++
      i++
      continue
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      depth--
      i++
      continue
    }

    if (depth === 0 && /[A-Za-z_$]/.test(ch)) {
      const start = i
      while (i < body.length && /[\w$]/.test(body[i])) i++

      const name = body.slice(start, i)
      let j = i
      while (j < body.length && /\s/.test(body[j])) j++

      if (body[j] === ':' || body[j] === '(') keys.add(name)
      continue
    }

    i++
  }

  return keys
}

/** 取 data:{} 第一层的 key */
function extractDataKeys(body) {
  const match = body.match(/\bdata\s*:\s*\{/)
  if (!match) return new Set()

  const openIndex = match.index + match[0].length - 1
  const matched = findMatchingBrace(body, openIndex)
  return matched ? extractTopLevelKeys(matched.body) : new Set()
}

/** 取 this.setData({...}) 第一层的 key */
function extractSetDataKeys(body) {
  const keys = new Set()
  const re = /this\.setData\s*\(\s*\{/g
  let match

  while ((match = re.exec(body)) !== null) {
    const openIndex = match.index + match[0].length - 1
    const matched = findMatchingBrace(body, openIndex)
    if (!matched) continue

    extractTopLevelKeys(matched.body).forEach(function (key) {
      keys.add(key)
    })
    re.lastIndex = matched.end
  }

  return keys
}

/** 检查 bindtap / catchtap 对应的方法是否存在，以及是否误用日期控件 */
function checkWxml(page, wxmlText, methods) {
  const bindRe = /\b(?:bind|catch):?tap\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let match

  while ((match = bindRe.exec(wxmlText)) !== null) {
    const name = (match[1] || match[2] || '').trim()
    if (!name) continue

    if (name.indexOf('{{') >= 0) {
      warn(page, 'bindtap 使用动态值，无法静态检查：' + name)
      continue
    }
    if (!methods.has(name)) {
      error(page, 'bindtap="' + name + '" 未在 Page({}) 中定义')
    }
  }

  if (/datetime-local/i.test(wxmlText)) {
    error(page, '使用了 datetime-local，小程序不支持（用 picker mode="date" + mode="time"）')
  }
  if (/type\s*=\s*(?:"date"|'date')/i.test(wxmlText)) {
    error(page, '使用了 input[type=date]，小程序不支持（用 picker mode="date"）')
  }
}

function checkUsingComponents(page, pageJson, pageDir) {
  const components = pageJson && pageJson.usingComponents
  if (!components || typeof components !== 'object') return

  Object.keys(components).forEach(function (tag) {
    const componentPath = components[tag]
    if (typeof componentPath !== 'string' || !componentPath) {
      error(page, 'usingComponents.' + tag + ' 路径为空')
      return
    }

    const base = componentPath.charAt(0) === '/'
      ? path.join(ROOT, componentPath.slice(1))
      : path.resolve(pageDir, componentPath)

    ;['js', 'json', 'wxml'].forEach(function (ext) {
      if (!fs.existsSync(base + '.' + ext)) {
        error(page, '组件 ' + tag + ' 缺少文件：' + componentPath + '.' + ext)
      }
    })

    if (!fs.existsSync(base + '.wxss')) {
      warn(page, '组件 ' + tag + ' 没有 .wxss（可选，但建议补齐）')
    }

    const componentJsonFile = base + '.json'
    if (fs.existsSync(componentJsonFile)) {
      const componentJson = parseJson(componentJsonFile, page)
      if (componentJson && componentJson.component !== true) {
        warn(page, '组件 ' + tag + ' 的 json 没有 "component": true')
      }
    }
  })
}

function checkPage(pagePath) {
  const pageBase = path.join(ROOT, pagePath)
  const pageDir = path.dirname(pageBase)
  const pageName = path.basename(pageBase)

  const files = {}
  PAGE_EXTS.forEach(function (ext) {
    const file = pageBase + '.' + ext
    if (!fs.existsSync(file)) {
      error(pagePath, '缺少 ' + pageName + '.' + ext)
      files[ext] = null
      return
    }
    files[ext] = file
  })

  const jsFile = files.js
  const wxmlFile = files.wxml
  const jsonFile = files.json

  if (jsFile) checkSyntax(jsFile, pagePath)

  const jsText = jsFile ? readText(jsFile, pagePath) : null
  const wxmlText = wxmlFile ? readText(wxmlFile, pagePath) : null
  const pageJson = jsonFile ? parseJson(jsonFile, pagePath) : null

  if (jsText) {
    const body = extractPageBody(jsText)

    if (body === null) {
      error(pagePath, '没有找到 Page({...})')
    } else {
      const keys = extractTopLevelKeys(body)
      const methods = new Set()
      keys.forEach(function (key) {
        if (RESERVED_KEYS.indexOf(key) < 0) methods.add(key)
      })

      if (wxmlText) checkWxml(pagePath, wxmlText, methods)

      const dataKeys = extractDataKeys(body)
      extractSetDataKeys(body).forEach(function (key) {
        const topKey = key.split('.')[0]
        if (!dataKeys.has(topKey)) {
          error(pagePath, 'setData 字段 "' + key + '" 未在 data 中初始化')
        }
      })

      if (/console\.log\s*\(/.test(jsText)) {
        warn(pagePath, '存在 console.log，提交前应清理')
      }
      if (/wx\.request\s*\(/.test(jsText)) {
        error(pagePath, 'wx.request 必须走 utils/request.js')
      }
    }
  }

  if (pageJson) checkUsingComponents(pagePath, pageJson, pageDir)
}

function walkFiles(dir, onFile) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(full, onFile)
    } else if (entry.isFile()) {
      onFile(full)
    }
  })
}

function checkPackage() {
  let totalBytes = 0

  walkFiles(ROOT, function (file) {
    const segment = rel(file)
    if (segment.split('/').indexOf('.git') >= 0 || segment.split('/').indexOf('node_modules') >= 0) {
      error(null, 'miniprogram 里不应包含 ' + segment)
      return
    }

    const stat = fs.statSync(file)
    totalBytes += stat.size
    if (stat.size > 2 * 1024 * 1024) {
      warn(null, '单个文件超过 2MB：' + segment)
    }
  })

  if (totalBytes > 2 * 1024 * 1024) {
    warn(null, 'miniprogram 总体积 ' + (totalBytes / 1024 / 1024).toFixed(2) + 'MB，超过 2MB 上传限制')
  }
}

function checkRoot() {
  const appJson = parseJson(path.join(ROOT, 'app.json'), null)
  if (!appJson) {
    error(null, 'app.json 不存在或无法解析')
    return []
  }

  if (!fs.existsSync(path.join(ROOT, 'app.js'))) error(null, '缺少 app.js')
  if (!fs.existsSync(path.join(ROOT, 'app.wxss'))) error(null, '缺少 app.wxss')
  if (!fs.existsSync(path.join(ROOT, 'project.config.json'))) warn(null, '缺少 project.config.json')

  if (appJson.sitemapLocation && !fs.existsSync(path.join(ROOT, appJson.sitemapLocation))) {
    error(null, 'app.json 指向的 sitemap 不存在：' + appJson.sitemapLocation)
  }

  const pages = Array.isArray(appJson.pages) ? appJson.pages : []
  if (pages.length === 0) error(null, 'app.json 的 pages 为空')

  const seen = new Set()
  pages.forEach(function (page) {
    if (typeof page !== 'string' || !page) {
      error(null, 'app.json pages 里有非法项')
      return
    }
    if (seen.has(page)) warn(null, 'app.json pages 重复：' + page)
    seen.add(page)
  })

  if (appJson.tabBar && Array.isArray(appJson.tabBar.list)) {
    appJson.tabBar.list.forEach(function (item) {
      if (item && item.pagePath && pages.indexOf(item.pagePath) < 0) {
        error(null, 'tabBar 页面不在 pages 中：' + item.pagePath)
      }
    })
  }

  return pages
}

function findPages(baseDir, pages) {
  if (!fs.existsSync(baseDir)) return

  fs.readdirSync(baseDir, { withFileTypes: true }).forEach(function (entry) {
    if (!entry.isDirectory()) return

    const full = path.join(baseDir, entry.name)
    const segment = rel(full)
    const hasPageFile = PAGE_EXTS.some(function (ext) {
      return fs.existsSync(path.join(full, entry.name + '.' + ext))
    })

    if (hasPageFile) {
      const registered = pages.some(function (page) {
        return page === segment || page.indexOf(segment + '/') === 0
      })
      if (!registered) {
        warn(null, '页面目录未在 app.json pages 中注册：' + segment)
      }
    }

    findPages(full, pages)
  })
}

function main() {
  console.log('检查目录：' + ROOT)

  if (!fs.existsSync(ROOT)) {
    console.log('\nERROR 目录不存在：' + ROOT)
    process.exitCode = 1
    return
  }

  const pages = checkRoot()

  checkSyntax(path.join(ROOT, 'app.js'), null)
  if (fs.existsSync(path.join(ROOT, 'utils', 'request.js'))) {
    const requestText = readText(path.join(ROOT, 'utils', 'request.js'), null)
    if (requestText && !/fail\s*:/.test(requestText)) {
      error(null, 'utils/request.js 没有 fail 分支（AGENTS.md 第 8 条）')
    }
  }

  pages.forEach(checkPage)
  findPages(path.join(ROOT, 'pages'), pages)
  checkPackage()

  const errorCount = issues.filter(function (item) { return item.level === 'ERROR' }).length
  const warnCount = issues.filter(function (item) { return item.level === 'WARN' }).length

  console.log('页面：' + pages.length + ' 个')

  pages.forEach(function (page) {
    const pageIssues = issues.filter(function (item) { return item.page === page })
    const hasError = pageIssues.some(function (item) { return item.level === 'ERROR' })

    console.log('\n' + (hasError ? '[FAIL] ' : '[PASS] ') + page)
    if (pageIssues.length === 0) {
      console.log('  - 四件套齐全，无静态问题')
      return
    }
    pageIssues.forEach(function (item) {
      console.log('  ' + item.level + '  ' + item.message)
    })
  })

  const globalIssues = issues.filter(function (item) { return item.page === null })
  if (globalIssues.length > 0) {
    console.log('\n全局检查')
    globalIssues.forEach(function (item) {
      console.log('  ' + item.level + '  ' + item.message)
    })
  }

  console.log('\n----------------------------------------')
  console.log('结果：ERROR ' + errorCount + '，WARN ' + warnCount)
  if (errorCount > 0) {
    console.log('未通过')
    process.exitCode = 1
  } else {
    console.log('通过')
  }
}

main()
