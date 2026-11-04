# 提交清单

> 截止：**2026-11-04 20:00**。建议 **19:30 前** 完成最后一次 push，留 30 分钟缓冲。

## 1. 提交物

| 项 | 位置 | 状态 |
|---|---|---|
| GitHub 仓库 | <https://github.com/in592/WechatProject> | ✅ 已推送 |
| README | [`README.md`](../README.md) | ✅ |
| AI 使用说明 | [`docs/AI_USAGE.md`](AI_USAGE.md) | ✅ |
| 3 分钟演示脚本 | [`docs/DEMO.md`](DEMO.md) | ✅ |
| Git 历史导出 | [`docs/git-log.txt`](git-log.txt) | ✅ |
| 演示视频（≤3 分钟） | 待录制 | ⬜ |
| 小程序截图 | 待补 | ⬜ |
| 管理后台截图 | 待补 | ⬜ |

> 视频和截图不在仓库里也能提交，但建议放网盘/视频链接，并在最终提交页填写。

---

## 2. 提交前命令

```powershell
cd ea-hackathon

# 1. 算法自测
node tools/selftest.js

# 2. 小程序静态检查
node tools/check-miniprogram.js ./miniprogram

# 3. Git 状态（应为 clean）
git status --short

# 4. 最近提交
git log --oneline -10

# 5. 确认没有运行时数据/密钥
git ls-files | Select-String 'data.json|token|secret|key'
```

预期：

- `selftest.js`：46 项全部通过
- 静态检查：`ERROR 0` / `WARN 0`
- `git status`：无未提交改动
- 没有 `server/data.json`、QQ Token、API Key

---

## 3. 演示视频（≤3 分钟）

按 [`docs/DEMO.md`](DEMO.md) 录，建议：

1. 先录后台导入（真实通知，自动识别活动/报名时间）
2. 再录小程序：列表 → 详情 → 报名冲突 → 替代时段
3. 日程分栏 + 拍照课表弹窗
4. 我的：报名列表

旁白重点：

- 痛点：通知散、课表撞、报名后才发现
- 亮点：报名时拦截 + 给替代时段
- 边界：前台提醒、OCR 需确认、QQ 用同一入口模拟

不要录：

- 现场安装 QQ/NapCat
- 等 10 分钟提醒
- 多个后端/多个小程序实例

---

## 4. 截图清单

建议 4 张：

1. 管理后台：粘贴通知 + 自动解析出活动/报名时间
2. 小程序首页：搜索/类型/「避开冲突」
3. 详情报名冲突弹窗：冲突时间 + 替代时段
4. 日程页：课程/活动分栏 + OCR 识别结果弹窗

> 截图里不要出现 Token、QQ 密码、学号真实个人信息；用演示学号即可。

---

## 5. 仓库最终检查

```powershell
# 确认远端是最新
git log --oneline -1
git push

# 包体积（小程序上传限制 2MB）
Get-ChildItem miniprogram -Recurse -File |
  Measure-Object Length -Sum |
  Select-Object Sum
```

- 小程序目录不含大图/视频/`node_modules`
- `project.config.json` 未改
- `server/data.json` 未入库
- 没有提交 `.tools`、QQ 安装包、日志

---

## 6. 最终提交页要填

- 仓库链接：`https://github.com/in592/WechatProject`
- 视频链接：`（录制后填写）`
- AI 使用说明：仓库内 `docs/AI_USAGE.md`，提交页可摘要
- 一句话介绍：

> 校园管家：把 QQ 群活动通知变成结构化活动，在报名时用课程/已报名活动做冲突拦截，并给出可去的替代时段。

---

## 7. 时间线建议

| 时间 | 事项 |
|---|---|
| 17:00-18:00 | 录视频、补截图 |
| 18:00-18:40 | 按 DEMO 走两遍，修演示数据 |
| 18:40-19:20 | README/文案最后校对 |
| 19:20-19:30 | 最后一次 push，确认远端 |
| 19:30-20:00 | 提交页填写、缓冲 |

---

## 8. 已知限制（提交页/答辩可主动说）

- 后端只监听 `127.0.0.1`，演示在开发者工具
- 拍照 OCR 仅 Windows 本机，彩色课表效果最好，节次需人工确认
- 前台提醒不覆盖小程序退出
- 真实 QQ 登录在本机被客户端注入拦截；OneBot 适配器和模拟上报已完成
