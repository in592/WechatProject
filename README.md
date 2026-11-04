# 校园管家

> 把 QQ 群里的活动通知，变成能和小程序课表自动对撞的结构化活动。

**校园管家** 面向在校学生和社团负责人：社团把通知发进群，负责人粘贴/转发到后台，系统解析成活动；学生在小程序里搜索活动，点报名时如果和课程/已报名活动冲突，会当场拦截并给出可去的替代时段。

- 仓库：<https://github.com/in592/WechatProject>
- 赛时窗口：2026-11-03 10:00 — 2026-11-04 20:00
- 形态：微信原生小程序 + 零依赖 Node 后端 + 网页管理后台

---

## 1. 解决什么问题

社团通知散落在 QQ 群里，学生看到时往往已经和课表撞了；报名后才发现去不了，又没有替代场次。

校园管家做了三件事：

1. **通知结构化**：粘贴整段通知，自动识别标题、活动时间、报名时间、地点、主办方、类型
2. **报名前拦截**：点「报名」时，用课程日程 + 已报名活动一起做时间重叠检测
3. **冲突后给方案**：不仅说「去不了」，还推荐最近 7 天内的可去时段

---

## 2. 已实现功能

### 管理后台

- 粘贴整段通知，**粘贴后自动解析**，也可手动点「解析」
- 识别「活动时间」优先，不会把「报名时间」当成活动时间
- 编辑 / 删除活动；显示来源（网页 / QQ）
- 通知里的「二课美育分 4 分」「主办方」「地点」等可识别
- 后台表格显示活动时间与报名时间两列

### 小程序

- 学号 + 姓名登录（本地态）
- 活动列表、标题/地点搜索、类型筛选
- **「避开冲突」过滤**：手动开启后只显示与当前日程不冲突的活动（不显示常驻冲突徽章）
- 活动详情、报名、已报名可取消
- 报名冲突拦截 + 替代时段推荐
- 我的日程分「课程日程」「活动日程」两栏
- 课程日程支持手动添加、节次时间规则、15 分钟课间开关
- **拍照识别课表**：Windows 本机 OCR + 网格横线 + 彩色课程块，自动定位星期和起止节次；逐条确认后批量导入
- **前台活动提醒**：已报名活动开始前 10 分钟；点过「提醒我报名」的活动，报名开始前 10 分钟
- 我的：已报名活动（本地态）

### 后端

- 零依赖 Node `http` 服务
- `POST /api/import`：通知文本 → 解析 → 入库
- `POST /api/parse`：只解析预览，不落库
- `GET/PUT/DELETE /api/activities...`：后台管理
- `POST /api/ocr`：Windows 本机 OCR（不上传第三方）
- `POST /api/qq/event`：OneBot 11 群消息适配器（兼容 `/api/qq/message`）
  - 群消息过滤、CQ 码清理、`message_id` 去重
  - 可选 `QQ_BOT_TOKEN` / `QQ_GROUP_ID`
  - 入库 `source='qq'`

---

## 3. 关键设计

### 冲突判定

时间统一 `YYYY-MM-DD HH:mm`，用 `new Date()` 解析，**不做字符串比较**；重叠用半开区间：

```text
aStart < bEnd && bStart < aEnd
```

首尾相接（14:00-16:00 与 16:00-18:00）不算冲突。

### 课表时间规则

- 第 1 节 08:10 开始
- 每节 40 分钟
- 普通课间 10 分钟
- 不同课程之间 15 分钟（表单开关控制）
- 第 6 节固定 14:00

### 拍照课表识别

1. Windows OCR 返回每行文字 + 坐标
2. 扫描横向网格线，得到 11 个节次行
3. 识别「周一～周日」表头，推算 7 列
4. 扫描彩色课程块上下边界，得到跨节次范围
5. 同一格多行文字合并（课程名 + 教室号）
6. 弹窗里逐条确认起止节次；**未确认不能导入**

当前依赖彩色课程块判断跨节次；纯黑白课表会退回文字位置估算，仍可手动改。

### 前台提醒

- App `onShow` 启动 30 秒检查，`onHide` 停止
- 已报名活动：开始前 10 分钟
- 关注活动：报名开始前 10 分钟
- 本地记录已提醒，避免重复弹窗

**限制**：小程序退出/后台时无法弹窗；订阅消息需要 AppID/Secret/模板/授权，本期不做。

---

## 4. 快速开始

### 环境

- Node.js（本项目在 v26 上开发，v18+ 应可）
- Windows 10/11（拍照 OCR 使用 Windows 自带中文 OCR）
- 微信开发者工具

### 启动后端

```powershell
cd ea-hackathon
node server/server.js
```

- 管理后台：<http://127.0.0.1:3000>
- 健康检查：<http://127.0.0.1:3000/api/health>

### 小程序

1. 微信开发者工具导入 `miniprogram/`
2. 详情 → 本地设置 → 勾选「不校验合法域名」
3. 编译

> 后端只监听 `127.0.0.1`，真机不能直接用这个地址；比赛演示在开发者工具中进行。

### 自测

```powershell
node tools/check-miniprogram.js ./miniprogram
node tools/selftest.js
```

当前结果：

- 静态检查：5 个页面 PASS，`ERROR 0`
- 算法自测：46 项全部通过

---

## 5. 3 分钟演示主线

详见 [`docs/DEMO.md`](docs/DEMO.md)。

```text
0:00  痛点：通知散、课表撞、报名后才发现
0:20  后台粘贴真实通知 → 自动识别 → 导入
0:50  小程序首页搜索/筛选 → 进详情
1:20  报名 → 与「高数补习」冲突 → 替代时段
2:00  我的日程：课程 / 活动分栏
2:30  拍照识别课表 → 网格定位 → 确认导入
3:00  我的：报名记录
```

QQ 真实登录在当前机器上被 QQ 注入拦截，演示用后台「来源：QQ 群消息」或 `POST /api/qq/event` 模拟，和真实机器人走同一接口。

---

## 6. 目录

```text
ea-hackathon/
  AGENTS.md                 项目约束 / 演示主线
  README.md                 本文件
  docs/
    DEMO.md                 3 分钟演示脚本
    AI_USAGE.md             AI 使用说明
    SUBMISSION.md           提交清单
    QQ.md                   OneBot 11 接入说明
    PLAYBOOK.md             工程手册
    UI.md                   配色与页面规范
  server/
    server.js               零依赖 HTTP 服务
    data.json               运行时数据（gitignore）
    ocr.ps1                 Windows OCR + 网格/色块坐标
    public/                 管理后台
  miniprogram/
    pages/login|index|detail|schedule|profile
    utils/
      conflict.js           重叠 + 替代时段
      parser.js             通知解析（活动/报名时间）
      agenda.js             课程 + 活动日程合并
      reminder.js           前台提醒
      storage.js / signup.js / auth.js / request.js
  tools/
    selftest.js             46 项算法自测
    check-miniprogram.js    页面静态检查
```

---

## 7. API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/activities` | 活动列表 |
| GET | `/api/activities/:id` | 活动详情 |
| POST | `/api/parse` | 解析预览，不落库 |
| POST | `/api/import` | 导入，`{ text, source }` |
| PUT | `/api/activities/:id` | 编辑 |
| DELETE | `/api/activities/:id` | 删除 |
| POST | `/api/ocr` | 图片 base64 → OCR 文字/坐标/网格线 |
| POST | `/api/qq/event` | OneBot 11 群消息上报 |

QQ 上报示例：

```powershell
$body = @{
  post_type = 'message'
  message_type = 'group'
  group_id = 123456789
  message_id = 1001
  raw_message = '【活动通知】11月6日下午3点到5点，在图书馆三楼报告厅举办《人工智能前沿讲座》，可获0.5学分，欢迎参加！'
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri 'http://127.0.0.1:3000/api/qq/event' `
  -ContentType 'application/json' `
  -Body $body
```

---

## 8. 已知限制

- 后端只监听 `127.0.0.1`，不能直接给真机/公网访问
- 拍照 OCR 只在 Windows 本机运行；彩色块识别依赖课表截图有颜色
- 前台提醒在小程序退出/后台时不弹
- 真实 QQ 机器人登录在本机被 QQ 注入拦截；OneBot 适配器已完成并通过模拟上报验证
- 学分字段仍保留在数据结构中，但不再统计或展示

---

## 9. AI 使用

本项目使用 DeepSeek Harness（deepseek-flash）辅助开发。具体范围、边界和可复核方式见 [`docs/AI_USAGE.md`](docs/AI_USAGE.md)。

提交材料见 [`docs/SUBMISSION.md`](docs/SUBMISSION.md)。
