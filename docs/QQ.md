# QQ 群消息接入（OneBot 11）

> 本项目不实现 QQ 登录、发消息、群管理。
> QQ 由 **NapCat / LLOneBot** 登录，它们把群消息用 OneBot 11 协议 HTTP 上报给后台；后台只负责解析入库。

## 1 数据流

```text
QQ 群消息
  → NapCat / LLOneBot（登录 QQ，HTTP 上报）
  → POST http://127.0.0.1:3000/api/qq/event
  → server/server.js 提取纯文本
  → 现有 parser.parse()
  → server/data.json（source: "qq"）
  → 管理后台「来源」显示 QQ
```

## 2 启动后台

```powershell
# 可选：上报令牌（NapCat 里填同一个）
$env:QQ_BOT_TOKEN = 'campus-demo-token'

# 可选：只接收某个群
$env:QQ_GROUP_ID = '123456789'

node server/server.js
```

不设 `QQ_GROUP_ID` 时接收所有群消息；不设 `QQ_BOT_TOKEN` 时不校验令牌（仅适合本机演示）。

## 3 配置 NapCat / LLOneBot

在它的「网络配置」里新增 HTTP 上报 / HTTP Server：

| 项 | 值 |
|---|---|
| URL | `http://127.0.0.1:3000/api/qq/event` |
| 方法 | POST |
| 数据格式 | JSON |
| Token | 与 `QQ_BOT_TOKEN` 一致（可选） |
| 消息格式 | `array` 或 `string` 都支持 |

兼容入口：`/api/qq/message`。

后台只处理：

- `post_type = message`
- `message_type = group`
- `QQ_GROUP_ID` 匹配（如果设置）

其他事件直接返回 204，不会入库。

## 4 本机模拟上报

不登录 QQ 也能验证后台：

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

成功返回：

```json
{ "ok": true, "activity": { "source": "qq", "...": "..." } }
```

同一条消息重复上报（相同 `message_id`）返回：

```json
{ "ok": true, "skipped": true }
```

## 5 安全注意

- 后台只监听 `127.0.0.1`，不要直接把 3000 端口暴露到公网。
- 不要把 QQ 账号、密码、Token 提交到仓库。
- NapCat / LLOneBot 是第三方工具，登录 QQ 有账号风险；演示用小号，别用主号。
- 只做「群消息 → 活动导入」，不做自动发广告/自动回复，避免被判定为机器人滥用。

## 6 验收清单

- [ ] NapCat / LLOneBot 能登录 QQ
- [ ] HTTP 上报地址指向 `/api/qq/event`
- [ ] 群里发一条活动通知
- [ ] 后台看到新活动，来源为「QQ」
- [ ] 重复上报不产生重复活动
- [ ] 小程序首页能搜到这条活动
