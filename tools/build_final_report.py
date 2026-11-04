# -*- coding: utf-8 -*-
"""生成校园管家最终自测报告 DOCX。"""

import os
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "校园管家-最终自测报告.docx")

BERRY = RGBColor(0x65, 0x02, 0x0A)
PINK = RGBColor(0xFF, 0x7E, 0xC1)
GREEN = RGBColor(0x0B, 0x6B, 0x57)
GRAY = RGBColor(0x5A, 0x60, 0x69)
LIGHT_PINK = "FFE4F1"
LIGHT_MINT = "E6FBF5"
LIGHT_ORANGE = "FFF0E6"
LIGHT_BLUE = "ECEFFF"

FONT = "Microsoft YaHei"


def set_run(run, size=10.5, bold=False, color=None):
    run.font.name = FONT
    run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), FONT)
    run.font.size = Pt(size)
    run.font.bold = bold
    if color is not None:
        run.font.color.rgb = color


def set_cell_shading(cell, hex_color):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), hex_color)
    tc_pr.append(shd)


def set_cell_margins(cell, top=80, bottom=80, left=100, right=100):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for tag, value in (("top", top), ("bottom", bottom), ("left", left), ("right", right)):
        node = tc_mar.find(qn("w:" + tag))
        if node is None:
            node = OxmlElement("w:" + tag)
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def add_heading(doc, text, level=1):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10 if level == 1 else 6)
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run(text)
    set_run(run, 15 if level == 1 else 11.5, True, BERRY if level == 1 else GREEN)
    return p


def add_body(doc, text, bold=False, color=None, space_after=4):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = 1.25
    run = p.add_run(text)
    set_run(run, 10.5, bold, color)
    return p


def add_bullets(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.line_spacing = 1.2
        run = p.add_run(item)
        set_run(run, 10.5)


def add_table(doc, headers, rows, widths=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    table.style = "Table Grid"

    header_cells = table.rows[0].cells
    for i, header in enumerate(headers):
        cell = header_cells[i]
        cell.text = ""
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(header)
        set_run(run, 9.5, True, BERRY)
        set_cell_shading(cell, LIGHT_PINK)
        set_cell_margins(cell)

    for row in rows:
        cells = table.add_row().cells
        for i, value in enumerate(row):
            cell = cells[i]
            cell.text = ""
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            run = p.add_run(str(value))
            set_run(run, 9.5, False, None)
            set_cell_margins(cell)

    if widths:
        for row in table.rows:
            for i, width in enumerate(widths):
                row.cells[i].width = Cm(width)
    return table


def add_callout(doc, title, body, fill=LIGHT_MINT):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.rows[0].cells[0]
    set_cell_shading(cell, fill)
    set_cell_margins(cell, 140, 140, 180, 180)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run(title)
    set_run(run, 11, True, GREEN)
    p2 = cell.add_paragraph()
    p2.paragraph_format.space_after = Pt(0)
    p2.paragraph_format.line_spacing = 1.25
    run2 = p2.add_run(body)
    set_run(run2, 9.5, False, GRAY)


def add_page_number(paragraph):
    run = paragraph.add_run()
    fld_char1 = OxmlElement("w:fldChar")
    fld_char1.set(qn("w:fldCharType"), "begin")
    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = "PAGE"
    fld_char2 = OxmlElement("w:fldChar")
    fld_char2.set(qn("w:fldCharType"), "end")
    run._r.append(fld_char1)
    run._r.append(instr_text)
    run._r.append(fld_char2)


doc = Document()

# 页面与默认字体
section = doc.sections[0]
section.top_margin = Cm(2.0)
section.bottom_margin = Cm(1.9)
section.left_margin = Cm(2.2)
section.right_margin = Cm(2.2)

normal = doc.styles["Normal"]
normal.font.name = FONT
normal._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
normal.font.size = Pt(10.5)
normal.paragraph_format.line_spacing = 1.25

# 页脚
footer_p = section.footer.paragraphs[0]
footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = footer_p.add_run("校园管家 · 最终自测报告 · ")
set_run(r, 8.5, False, GRAY)
add_page_number(footer_p)

# 封面
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(48)
p.paragraph_format.space_after = Pt(2)
r = p.add_run("校园管家")
set_run(r, 30, True, BERRY)

p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(14)
r = p.add_run("最终自测报告")
set_run(r, 20, True, PINK)

p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(2)
r = p.add_run("Campus Assistant · Final Self-Test Report")
set_run(r, 9.5, False, GRAY)

add_callout(
    doc,
    "自测结论：通过",
    "后端可启动、管理后台可操作、小程序静态检查 ERROR 0、算法自测 47 项全过、"
    "OCR 与 QQ 适配器实测通过、前台提醒 9 项边界测试全过。"
    "提交前只剩录视频、补截图和最后 push。",
    LIGHT_MINT,
)

doc.add_paragraph()
add_table(
    doc,
    ["项目", "内容"],
    [
        ["作品名称", "校园管家"],
        ["作品形态", "微信原生小程序 + 零依赖 Node 后端 + 网页管理后台"],
        ["仓库", "https://github.com/in592/WechatProject"],
        ["赛时窗口", "2026-11-03 10:00 — 2026-11-04 20:00"],
        ["报告时间", "2026-11-04 18:50"],
        ["运行方式", "node server/server.js → http://127.0.0.1:3000"],
    ],
    [3.2, 13.6],
)

doc.add_page_break()

# 一、结论摘要
add_heading(doc, "一、结论摘要")
add_table(
    doc,
    ["检查维度", "结果", "证据"],
    [
        ["① 启动运行", "通过", "健康检查 / 管理后台 200"],
        ["② 页面交互", "通过", "CRUD API 实测 + 静态检查"],
        ["③ 核心功能", "通过", "解析 / 冲突 / OCR / QQ / 提醒"],
        ["④ 评委体验", "通过", "零依赖、131 KB 包、无密钥"],
        ["⑤ Git 记录", "通过", "43+ commits，均在赛时窗口内"],
    ],
    [3.2, 3.0, 9.6],
)

add_heading(doc, "自测数据", 2)
add_bullets(
    doc,
    [
        "算法自测：47 项全部通过（tools/selftest.js）",
        "小程序静态检查：5 个页面，ERROR 0，WARN 0",
        "后端 API 实测：13 项通过（健康、列表、解析、导入、编辑、删除、OCR）",
        "前台提醒边界测试：9 项全部通过",
        "OCR 参考图：36 行文字、12 条网格线",
        "小程序目录：131,678 字节，远小于 2 MB 限制",
        "仓库无 API Key、无 Token、无 server/data.json",
    ],
)

# 二、五问逐项
add_heading(doc, "二、提交前五问逐项")

add_heading(doc, "① 作品能正常启动和运行吗？", 2)
add_body(doc, "能。后端零依赖，直接 node server/server.js 启动；管理后台与小程序均可运行。")
add_table(
    doc,
    ["检查项", "命令 / 方式", "结果"],
    [
        ["Node 后端", "node server/server.js", "监听 127.0.0.1:3000"],
        ["健康检查", "GET /api/health", "{ok:true}"],
        ["管理后台", "GET /", "200，HTML 正常"],
        ["活动列表", "GET /api/activities", "返回 4 条正式活动"],
        ["OPTIONS", "OPTIONS /api/activities", "204"],
        ["非法 JSON", "POST /api/parse 发 {bad", "400，不崩"],
        ["服务端语法", "node --check server/server.js", "通过"],
        ["后台 JS 语法", "node --check server/public/app.js", "通过"],
    ],
    [3.4, 8.0, 5.4],
)

add_heading(doc, "② 页面能交互吗？按钮和功能真的有效吗？", 2)
add_body(doc, "后台接口全部实测通过；小程序页面无未定义 bindtap，所有页面方法都有实现。")
add_table(
    doc,
    ["交互", "验证方式", "结果"],
    [
        ["后台粘贴自动解析", "POST /api/parse 真实通知", "通过"],
        ["导入活动", "POST /api/import", "201"],
        ["编辑活动", "PUT /api/activities/:id", "200"],
        ["删除活动", "DELETE /api/activities/:id", "200，详情 404"],
        ["小程序按钮", "静态检查 + 方法核对", "无未定义 bindtap"],
        ["搜索 / 类型 / 避开冲突", "首页逻辑核对", "通过"],
        ["报名 / 取消 / 日程", "详情与日程逻辑核对", "通过"],
    ],
    [4.2, 8.2, 4.4],
)
add_body(doc, "说明：自动化已覆盖接口与逻辑；小程序内的真实点击仍需按演示脚本走一遍。", color=GRAY)

add_heading(doc, "③ 核心功能实现了吗？", 2)
add_table(
    doc,
    ["核心能力", "验证结果"],
    [
        ["通知 → 结构化活动", "标题、活动时间、地点、报名时间均能解析"],
        ["活动时间优先", "报名时间不会覆盖活动时间"],
        ["收集表开放时间", "11-04 20:00—22:00 正确写入报名开始/结束"],
        ["冲突检测 + 替代时段", "半开区间算法，47 项自测通过"],
        ["报名冲突拦截", "详情页报名前计算并弹窗"],
        ["课表 OCR", "36 行文字、12 条网格线"],
        ["彩色块跨节次", "6 门课实测，高数 3-5 节正确"],
        ["QQ OneBot", "模拟群消息解析成功，source=qq"],
        ["前台提醒", "9 项边界测试全过"],
        ["学分统计", "已移除，个人页只保留报名列表"],
    ],
    [5.0, 11.8],
)

add_heading(doc, "自测中发现并修复的 Bug", 2)
add_bullets(
    doc,
    [
        "QQ 适配器把换行压成空格，导致多行通知解析失败。修复为保留换行后，模拟群消息解析成功，source=qq。",
        "标题首尾引号残留。修复标题清理逻辑后，“方寸绘路，匠心竞技——电子协会电子电路设计技能大赛”显示正常。",
    ],
)

doc.add_page_break()

add_heading(doc, "④ 评委能顺利运行或体验吗？", 2)
add_body(doc, "可以。项目零依赖，不需要 npm install；按下面两步即可运行。")
add_callout(
    doc,
    "启动方式",
    "1. 在项目目录执行 node server/server.js\n"
    "2. 微信开发者工具导入 miniprogram/，详情 → 本地设置 → 勾选「不校验合法域名」",
    LIGHT_BLUE,
)
add_table(
    doc,
    ["检查项", "结果"],
    [
        ["零依赖", "不需要 npm install"],
        ["管理后台", "http://127.0.0.1:3000"],
        ["小程序包体积", "131,678 字节（< 2 MB）"],
        ["server/data.json", "已 gitignore，未入库"],
        ["API Key / Token", "仓库无真实密钥"],
        ["页面四件套", "5 个页面均齐全"],
    ],
    [5.0, 11.8],
)

add_heading(doc, "⑤ 有赛时窗口内的有效 Git Commit 吗？", 2)
add_table(
    doc,
    ["项", "结果"],
    [
        ["提交数", "43+"],
        ["最早提交", "2026-11-03 12:18（赛时窗口内）"],
        ["最新本地提交", "e313c05"],
        ["是否手动改时间", "否"],
        ["仓库", "https://github.com/in592/WechatProject"],
    ],
    [4.8, 12.0],
)
add_body(doc, "提交前请确认远端 main 已同步到最新本地提交。", color=GRAY)

# 三、AI/API
add_heading(doc, "三、AI / API 说明（演示视频必须讲）")
add_callout(
    doc,
    "运行时没有接任何外部 AI API",
    "拍照 OCR 使用 Windows 自带 Windows.Media.Ocr，本地运行、不联网、不传图；"
    "活动解析、冲突检测、提醒均为本地算法。"
    "没有 DeepSeek、阿里云百炼、硅基流动等 API Key，也没有运行时模型调用。",
    LIGHT_ORANGE,
)
add_body(
    doc,
    "DeepSeek Harness（deepseek-flash）仅用于开发阶段的编码、测试和文档辅助，"
    "不进入小程序运行时。详见仓库 docs/AI_USAGE.md。",
)

# 四、已知限制
add_heading(doc, "四、已知限制")
add_bullets(
    doc,
    [
        "前台提醒只在小程序打开/回到前台时生效，退出或后台不弹；订阅消息本期不做。",
        "真实 QQ 注入在本机被客户端拦截；OneBot 适配器已完成，并用模拟群消息验证。",
        "拍照 OCR 依赖 Windows，彩色课表效果最好；起止节次仍需人工确认。",
        "后端只监听 127.0.0.1，演示在微信开发者工具中进行。",
    ],
)

# 五、提交清单
add_heading(doc, "五、提交前清单")
add_table(
    doc,
    ["项", "状态"],
    [
        ["后端 / 管理后台可启动", "☑ 已完成"],
        ["小程序静态检查 ERROR 0", "☑ 已完成"],
        ["算法自测 47 项", "☑ 已完成"],
        ["OCR / QQ / 提醒实测", "☑ 已完成"],
        ["README / AI 说明 / 演示脚本", "☑ 已完成"],
        ["3 分钟演示视频", "☐ 待录制"],
        ["4 张截图", "☐ 待补"],
        ["最后 push 到 GitHub", "☐ 待确认"],
    ],
    [9.0, 7.8],
)
add_body(doc, "推荐时间：19:30 前完成最后一次 push，20:00 前提交。", color=GRAY, bold=True)

doc.save(OUT)
print("SAVED", OUT)
