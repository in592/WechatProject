# AGENTS.md · 校园管家

> 放在项目根目录，DSH 会自动读取。**每个新会话不用再解释任何背景。**

---

## 1 项目一句话

**校园管家** —— 社团活动通知散落在 QQ 群里，学生看到时往往已经和课表撞了。
把通知变成结构化活动，在点「报名」的那一刻就告诉你：这个时间去不了，或者哪个时段能去。

- 用户：在校学生（找活动）+ 社团负责人（发活动）

### 功能范围（已定稿，不要自行增删）

| # | 功能 | 在哪一端 |
|---|---|---|
| 1 | 通知文本 → 结构化活动（解析），统一入口 `POST /api/import` | 网页后台 |
| 2 | 活动列表 + **搜索** + **类型筛选** | 小程序 |
| 3 | 活动详情页 | 小程序 |
| 4 | 我的日程：课程日程 + 活动日程分栏管理（本地存储，可增删/取消） | 小程序 |
| 5 | **报名冲突拦截** + **替代时段推荐** | 小程序 |
| 6 | 管理端：导入、**编辑**、**删除** | 网页后台 |
| 7 | 学号 + 姓名登录（本地态） | 小程序 |
| 8 | **我的**：已报名活动 + 按类型的学分饼图（本地态） | 小程序 |
| 9 | **拍照识别课表**：Windows 本机 OCR，识别多门课程后批量确认导入 | 小程序 + 本机后端 |
| 10 | **QQ 群消息 → 活动导入**：OneBot 11（NapCat / LLOneBot）HTTP 上报 | 后端 |

> 学分饼图只统计「已报名」的活动，数据保存在本机，不做云端汇总。
> 拍照 OCR 只用 Windows 自带中文 OCR，不上传第三方；识别结果仅用于预填，最终由用户确认后写入日程。
> 课表时间规则：第 1 节 08:10 开始，每节 40 分钟；普通课间 10 分钟，不同课程之间 15 分钟；第 6 节固定 14:00。
> 我的日程分「课程日程」「活动日程」：活动日程来自报名记录，和课程日程一起参与冲突检测。

### 明确不做（不要加回来）

- ❌ **列表上的红黄绿冲突徽章**（冲突只在点报名时算）
- ❌ 云端报名记录 / 跨设备学分同步（本期只做本机）
- ❌ 云 OCR / 第三方 OCR API（只允许 Windows 本机 OCR）
- ❌ 云端部署、数据库、第三方 UI 库

> 冲突计算只发生在“点报名”这一处。列表页**不**计算状态，不要自作主张加回徽章。

### QQ 导入（OneBot 11 适配器）

QQ 登录/收发由 **NapCat / LLOneBot** 负责；本项目只接收 OneBot 11 的 HTTP 上报，**不实现 QQ 登录、发消息、群管理**。

- 上报入口：**`POST /api/qq/event`**（兼容 `/api/qq/message`）
- 只处理群消息：`post_type=message`、`message_type=group`；可选 `QQ_GROUP_ID` 白名单
- 可选令牌：`QQ_BOT_TOKEN`，支持 `Authorization: Bearer <token>` 或 `X-QQ-Token`
- 提取纯文本后走现有 `parser.parse()`，入库 `source='qq'`，管理后台来源显示 QQ
- 去重：优先 `message_id`；缺失时用 `group_id + user_id + time + text` 哈希
- 保留 **`POST /api/import`**，请求体 `{ text, source }`，供网页后台和模拟上报使用
- 不要把 QQ 账号、密码、Token 提交到仓库；只做接收消息，不做自动发广告/自动回复

> 详细配置见 `docs/QQ.md`。

## 2 演示主线（3 分钟必须走通）

1. 网页后台粘贴一段真实通知 → 解析出字段 → 导入
2. 小程序登录 → 首页看到新活动 → 搜索/筛选命中它
3. 进详情 → 点「报名」
4. 弹窗：与「周五 15:00-17:00 高数补习」冲突 → 同时推荐「本周四 19:00 你有空」

> 这条线走不通，功能再多也没用。

## 3 技术栈

- 小程序：微信原生（WXML/WXSS/JS），**无 npm、无 TS、无构建**
- 后端：Node 原生 `http` 模块，**零依赖**，不需要 `npm install`
- 数据：`server/data.json`（后端）+ `wx.setStorageSync`（日程、登录态、报名记录）
- 降级：后端挂了，小程序退回本地数据，不白屏

## 4 目录

```
ea-hackathon/
  AGENTS.md              本文件
  docs/PLAYBOOK.md       完整工程手册
  docs/QQ.md             OneBot 11 接入说明
  server/
    server.js            零依赖 HTTP 服务
    data.json            运行时数据（不入库）
    ocr.ps1              Windows 本机 OCR（拍照识别课表）
    public/index.html    管理后台：导入 / 编辑 / 删除
    public/app.js
    public/style.css
  miniprogram/
    app.js app.json app.wxss sitemap.json project.config.json
    pages/login/         学号 + 姓名
    pages/index/         列表 + 搜索 + 类型筛选
    pages/detail/        详情 + 报名
    pages/schedule/      我的日程
    pages/profile/       我的：已报名 + 学分饼图
    utils/request.js     HTTP 封装（唯一出口）
    utils/conflict.js    重叠判定 + 替代时段
    utils/parser.js      通知解析
    utils/storage.js     本地存储（课程日程）
    utils/agenda.js      合并课程日程 + 活动日程（冲突检测用）
    utils/signup.js      报名记录（本地）
    utils/auth.js        登录态
  tools/check-miniprogram.js   静态检查
```

## 5 硬约束（违反即返工）

1. 每个页面必须有同名 `.js/.json/.wxml/.wxss` 四件套
2. **小程序没有 `datetime-local`**，也没有 `input[type=date]`。日期用 `<picker mode="date">`，时间用 `<picker mode="time">`
3. `setData` 用到的字段必须在 `data:{}` 里初始化
4. `.wxml` 里每个 `bindtap="xxx"`，`xxx` 必须在 `Page({})` 里定义（拼错不报错，点了没反应）
5. 自定义组件必须在页面 `.json` 的 `usingComponents` 声明，路径以当前页面目录为基准
6. 时间字符串统一 `'YYYY-MM-DD HH:mm'`；解析前必须 `String(v).trim().replace(' ', 'T')` 再 `new Date()`；**禁止字符串比较**
7. 时间重叠用半开区间 `aStart < bEnd && bStart < aEnd`（首尾相接不算冲突）
8. 所有 `wx.request` 必须写 `fail` 分支并给用户可见提示，禁止静默失败
9. Node 端必须最优先处理 `OPTIONS` 返回 204；JSON 解析失败返回 400，不能让进程崩
10. 不要把 `.git`、`node_modules`、大图放进 `miniprogram/`（上传包 2MB 限制）
11. `onShow` 里启动的定时器，必须在 `onHide`/`onUnload` 清掉
12. 页面间传参的 id，接收方统一 `String()` 再比较
13. 文件统一 UTF-8 无 BOM
14. 页面方法用普通 `function`，不用箭头函数（避免 `this` 丢失）

## 6 不要做的事

- ❌ 不引入 npm 包 / UI 库 / TypeScript / 构建工具
- ❌ 不改 `project.config.json`
- ❌ 不删现有页面
- ❌ 不「重写整个文件」，除非明确要求
- ❌ 一次不改多个不相关文件
- ❌ 不加回第 1 节「明确不做」里的功能

## 7 每次改完的自检

1. 新页面加进 `app.json` 的 `pages` 了吗？
2. `bindtap` 的方法都定义了吗？
3. `setData` 的字段都初始化了吗？
4. 组件声明了吗？
5. 时间解析处理了 `T`/空格两种格式吗？
6. 有没有残留 `console.log`？

**然后跑检查：**
```bash
node tools/check-miniprogram.js ./miniprogram
```

## 8 运行

```bash
node server/server.js          # 后端，127.0.0.1:3000
node tools/check-miniprogram.js ./miniprogram
```

小程序：开发者工具导入 `miniprogram/`，勾选「详情 → 本地设置 → 不校验合法域名」。

## 9 这台机器的已知问题

**Node 尚未安装。**`node -v` 识别不到。装完 Node 才能跑后端和检查脚本。
Git 已有（2.56.0）。
