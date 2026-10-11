#!/usr/bin/env python3
"""Build a self-contained design reader from the authoritative Markdown chapters.

Requires Python-Markdown 3.11: python3 -m pip install Markdown==3.11
Run: python3 scripts/build-bible.py
PDF is a separate browser print step; it is never counted as new source content.
"""

from pathlib import Path
import hashlib
import html
import json
import re

import markdown

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs" / "bible"
OUTPUT = ROOT / "dist" / "design"
CHAPTERS = sorted(p for p in SOURCE.glob("[0-9][0-9]-*.md"))
if len(CHAPTERS) != 9:
    raise SystemExit("Expected chapters 00 through 08")

titles = {}
errors = []
stats = []
for p in CHAPTERS:
    text = p.read_text(encoding="utf-8")
    titles[p.name] = text.splitlines()[0].removeprefix("# ")
    if len(re.findall(r"^```", text, re.M)) % 2:
        errors.append(f"{p.name}: unclosed code fence")
    for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", text):
        if "://" in target or target.startswith("#"):
            continue
        if not (p.parent / target.split("#")[0]).exists():
            errors.append(f"{p.name}: missing link {target}")
    stats.append({
        "file": p.name,
        "title": titles[p.name],
        "hanCharacters": len(re.findall(r"[\u4e00-\u9fff]", text)),
        "totalCharacters": len(text),
        "bytes": p.stat().st_size,
        "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
    })
if errors:
    raise SystemExit("\n".join(errors))

counts = {}
for label, filename, pattern in [
    ("mainQuests", "02-STORY-WORLD-AND-QUESTS.md", r"^\|\s*(MQ-\d+)\b"),
    ("sideQuests", "02-STORY-WORLD-AND-QUESTS.md", r"^\|\s*(SQ-\d+)\b"),
    ("roomTemplates", "04-WORLD-LEVELS-AND-BESTIARY.md", r"^\|\s*(T\d+)\b"),
    ("monsters", "04-WORLD-LEVELS-AND-BESTIARY.md", r"^\|\s*(M\d+)\b"),
    ("eliteModifiers", "04-WORLD-LEVELS-AND-BESTIARY.md", r"^\|\s*(E\d+)\b"),
    ("bosses", "04-WORLD-LEVELS-AND-BESTIARY.md", r"^\|\s*(B\d+)\b"),
    ("itemBases", "05-ITEMS-LOOT-AND-CRAFTING.md", r"^\|\s*(B\d+)\b"),
    ("affixes", "05-ITEMS-LOOT-AND-CRAFTING.md", r"^\|\s*(F\d+)\b"),
    ("uniqueItems", "05-ITEMS-LOOT-AND-CRAFTING.md", r"^\|\s*(U\d+)\b"),
    ("contractModifiers", "06-ENDGAME-ECONOMY-AND-ONLINE.md", r"^\|\s*(C\d+)\b"),
]:
    ids = re.findall(pattern, (SOURCE / filename).read_text(), re.M)
    if len(ids) != len(set(ids)):
        errors.append(f"Duplicate table ID: {label}")
    counts[label] = len(set(ids))
if errors:
    raise SystemExit("\n".join(errors))

expected_counts = {"mainQuests": 35, "sideQuests": 24, "roomTemplates": 35,
                   "monsters": 36, "eliteModifiers": 12, "bosses": 10,
                   "itemBases": 28, "affixes": 48, "uniqueItems": 18,
                   "contractModifiers": 22}
for key, expected in expected_counts.items():
    if counts[key] != expected:
        raise SystemExit(f"{key}: expected {expected} entries, got {counts[key]}")

totals = {
    "hanCharacters": sum(s["hanCharacters"] for s in stats),
    "totalCharacters": sum(s["totalCharacters"] for s in stats),
    "bytes": sum(s["bytes"] for s in stats),
}
index_path = SOURCE / "README.md"
index_text = index_path.read_text(encoding="utf-8")
index_text = re.sub(r"正文约 \*\*[^*]+\*\*",
                    f"正文约 **{totals['hanCharacters']/10000:.1f} 万汉字、{totals['totalCharacters']/10000:.1f} 万总字符**",
                    index_text, count=1)
index_path.write_text(index_text, encoding="utf-8")
repo_readme_path = ROOT / "README.md"
repo_readme_text = repo_readme_path.read_text(encoding="utf-8")
repo_readme_text = re.sub(r"源章节约\d+(?:\.\d+)?万汉字",
                        f"源章节约{totals['hanCharacters']/10000:.1f}万汉字",
                        repo_readme_text, count=1)
repo_readme_path.write_text(repo_readme_text, encoding="utf-8")
manifest = {
    "designVersion": "1.0",
    "designDate": "2026-10-11",
    "gameVersion": "0.2.0",
    "scope": "Unique source chapters 00–08 only; excludes index and generated copies",
    "totals": totals,
    "contentTableCounts": counts,
    "chapters": stats,
    "validation": {
        "relativeChapterLinks": "passed",
        "codeFences": "passed",
        "tableIdUniqueness": "passed",
        "gameBalanceAndRealDevicePerformance": "not measured; proposed methods only",
    },
}
(SOURCE / "MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

toc = "\n".join(f"- [{titles[p.name]}](#chapter-{p.name[:2]})" for p in CHAPTERS)
combined = [
    "# 《余烬纪事》完整故事与游戏策划纲领\n",
    "**策划基线1.0 · 2026-10-11 · 游戏当前版本0.2.0**\n",
    f"源章节去重：{totals['hanCharacters']:,}个汉字，{totals['totalCharacters']:,}个总字符。"
    "这是设计基线与待验证提案，不是已实现功能清单。\n",
    toc,
]
rendered = []
for p in CHAPTERS:
    raw = p.read_text(encoding="utf-8")
    for filename in titles:
        raw = raw.replace(f"]({filename})", f"](#chapter-{filename[:2]})")
    combined.append(f'\n<a id="chapter-{p.name[:2]}"></a>\n\n{raw}')
    converter = markdown.Markdown(extensions=["tables", "fenced_code", "sane_lists", "toc"],
                                  extension_configs={"toc": {"toc_depth": "2-3"}})
    body = converter.convert(raw)
    prefix = f"s{p.name[:2]}-"
    body = re.sub(r'id="([^"]+)"', lambda m: f'id="{prefix}{m.group(1)}"', body)
    body = re.sub(r'href="#(?!chapter-)([^"]+)"',
                  lambda m: f'href="#{prefix}{m.group(1)}"', body)
    subtoc = re.sub(r'href="#([^"]+)"',
                   lambda m: f'href="#{prefix}{m.group(1)}"', converter.toc)
    rendered.append(f'<section id="chapter-{p.name[:2]}" class="chapter">'
                    f'<details class="section-toc"><summary>本章小节目录</summary>{subtoc}</details>{body}</section>')
(ROOT / "docs" / "GAME-BIBLE-1.0.md").write_text("\n\n".join(combined), encoding="utf-8")

nav_titles = {name: re.sub(r"^\d{2}(?:[｜|]\s*|\s+)", "", title.split("：")[-1])
              for name, title in titles.items()}
nav = "".join(f'<a href="#chapter-{p.name[:2]}"><span>{p.name[:2]}</span>'
              f'{html.escape(nav_titles[p.name])}</a>' for p in CHAPTERS)
print_toc = "".join(f'<li><a href="#chapter-{p.name[:2]}">{html.escape(titles[p.name])}</a></li>'
                    for p in CHAPTERS)
css = """
:root {color-scheme:light;--ink:#25292a;--muted:#65696a;--paper:#fcfbf7;--line:#dddcd3;--accent:#9f4d29}
* {box-sizing:border-box} html{scroll-behavior:smooth;scroll-padding-top:75px}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.85 'Noto Sans CJK SC','PingFang SC','Microsoft YaHei',sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}button,input{font:inherit}
.layout{display:grid;grid-template-columns:274px minmax(0,1fr)}
aside{position:sticky;top:0;align-self:start;height:100vh;overflow:auto;background:#202729;color:#eee8dc;padding:28px 20px}
.brand{font-size:21px;letter-spacing:2px;font-weight:700}.edition{color:#b5bcbb;font-size:13px;margin:10px 0 25px}
nav a{display:block;color:#e2e4de;line-height:1.55;padding:11px 4px;border-bottom:1px solid #394143;font-size:14px}
nav span{color:#dca57c;margin-right:10px;font-size:12px}
.downloads a{display:block;font-size:13px;margin-top:15px;color:#dfb288}
main{min-width:0;max-width:1280px;padding:0 52px 80px;margin:auto}
.toolbar{position:sticky;top:0;z-index:2;display:flex;gap:10px;align-items:center;background:#fcfbf7f2;border-bottom:1px solid var(--line);padding:12px 0}
.toolbar input{min-width:0;flex:1;max-width:350px;border:1px solid #c6c6bd;border-radius:4px;padding:6px 10px;font-size:14px;background:white}
button{cursor:pointer;border:1px solid #c6c6bd;background:white;border-radius:4px;padding:6px 10px;font-size:13px;color:#484c4c}
#search-status{font-size:12px;color:var(--muted)}
.cover{padding:48px 0 30px;border-bottom:2px solid #b67b53}.eyebrow{font-size:12px;letter-spacing:2px;color:var(--accent)}
.cover h1{font-size:36px;line-height:1.35;margin:16px 0}.lead{max-width:750px;color:#535858}
.stats{display:flex;flex-wrap:wrap;gap:26px;margin:28px 0}.stat strong{display:block;font-size:25px;line-height:1.2}.stat span{font-size:12px;color:var(--muted)}
.notice{border-left:3px solid #b67b53;background:#f2eee5;padding:12px 17px;font-size:14px}
.chapter{padding-top:42px;scroll-margin-top:75px}.chapter>h1{font-size:28px;line-height:1.45;margin:0 0 24px}
h2{font-size:22px;line-height:1.5;margin:36px 0 15px;border-bottom:1px solid var(--line);padding-bottom:10px}
h3{font-size:18px;line-height:1.5;margin:25px 0 12px}p{margin:12px 0}
table{display:block;max-width:100%;overflow-x:auto;border-collapse:collapse;margin:20px 0;font-size:13px;line-height:1.65}
th,td{border:1px solid var(--line);padding:10px 12px;vertical-align:top;min-width:95px}
th{background:#ebece5;font-weight:600;text-align:left}tr:nth-child(even){background:#f5f5ef}
code{font:0.88em/1.55 'Noto Sans Mono CJK SC',monospace;overflow-wrap:anywhere;background:#efefe8;padding:1px 4px;border-radius:3px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eef0eb;padding:18px;font-size:13px}pre code{padding:0;background:none}
blockquote{border-left:3px solid #aaa;background:#f2f2ec;margin:16px 0;padding:6px 18px;color:#555}
.section-toc{font-size:13px;color:var(--muted);margin:0 0 20px}.section-toc ul{margin:7px 0}.section-toc summary{cursor:pointer}
.found{outline:2px solid #c98539;background:#fff0c9!important;scroll-margin-top:100px}
footer{margin-top:50px;border-top:1px solid var(--line);padding:20px 0;color:var(--muted);font-size:12px}.print-toc{display:none}
@media(max-width:900px){.layout{display:block}aside{position:relative;height:auto;padding:18px}nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px}.edition{margin:6px 0 12px}.downloads{display:flex;gap:20px}.downloads a{margin-top:12px}main{padding:0 20px 40px}.cover{padding-top:30px}.cover h1{font-size:28px}.toolbar{flex-wrap:wrap}.chapter>h1{font-size:24px}}
@media print{
@page{size:A4;margin:16mm 13mm 18mm}
html{scroll-behavior:auto}body{font-size:11.5px;line-height:1.65;background:white;color:#111}
.layout{display:block}aside,.toolbar,.section-toc{display:none}main{padding:0;max-width:none}
.cover{break-after:page;padding:30mm 0 0;border:0}.cover h1{font-size:29px}
.cover .lead,.notice{font-size:12px}.stats{margin:25px 0}.chapter{break-before:page;padding:0}
.print-toc{display:block;break-after:page;padding-top:20mm}.print-toc li{margin:14px 0;font-size:13px}
.chapter>h1{font-size:22px;margin:0 0 18px}h2{font-size:16px;margin:23px 0 10px}h3{font-size:13px}
h1,h2,h3{break-after:avoid}p{orphans:3;widows:3}table{display:table;width:100%;table-layout:fixed;overflow:visible;font-size:9.5px;line-height:1.6;margin:14px 0}
th,td{min-width:0;padding:6px 7px;overflow-wrap:anywhere;word-break:normal}thead{display:table-header-group}tr{break-inside:avoid}
pre{font-size:9.5px;padding:10px;break-inside:avoid}a{color:#222;text-decoration:none}blockquote{break-inside:avoid}.found{outline:none;background:none!important}
}
"""
script = """
const query = document.querySelector('#query');
const status = document.querySelector('#search-status');
let current = -1, matches = [], oldTerm = '';
document.querySelector('#next').addEventListener('click', () => {
  const term = query.value.trim().toLocaleLowerCase();
  document.querySelectorAll('.found').forEach(el => el.classList.remove('found'));
  if (!term) { status.textContent = '输入关键词'; return; }
  if (term !== oldTerm) {
    matches = [...document.querySelectorAll('.chapter p,.chapter td,.chapter h1,.chapter h2,.chapter h3,.chapter li')]
      .filter(el => !el.closest('.section-toc') && el.textContent.toLocaleLowerCase().includes(term));
    current = -1; oldTerm = term;
  }
  if (!matches.length) { status.textContent = '没有匹配'; return; }
  current = (current + 1) % matches.length;
  matches[current].classList.add('found');
  matches[current].scrollIntoView({block:'center'});
  status.textContent = `${current+1} / ${matches.length}`;
});
query.addEventListener('keydown', e => { if (e.key === 'Enter') document.querySelector('#next').click(); });
document.querySelector('#print').addEventListener('click', () => window.print());
"""
OUTPUT.mkdir(parents=True, exist_ok=True)
page = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="余烬纪事完整故事与游戏策划纲领：五幕叙事、法师构筑、装备、怪物、关卡、终局及制作验证。">
<title>余烬纪事 · 完整游戏策划 1.0</title><style>{css}</style></head>
<body><div class="layout"><aside><div class="brand">余烬纪事</div><div class="edition">完整游戏策划 · 基线 1.0</div>
<nav aria-label="章节目录">{nav}</nav><div class="downloads"><a href="GAME-BIBLE-1.0.pdf" download>↓ 下载 PDF</a>
<a href="https://github.com/TempleHao/Diablo/tree/main/docs/bible">查看分章源文件</a></div></aside>
<main><div class="toolbar"><label for="query">检索</label><input id="query" placeholder="技能、词条、人物或规则" type="search">
<button id="next">下一处</button><span id="search-status" role="status"></span><button id="print">打印</button></div>
<header class="cover"><div class="eyebrow">EMBER MAGE / GAME DESIGN BIBLE</div><h1>《余烬纪事》<br>完整故事与游戏策划纲领</h1>
<p class="lead">原创 3D 网页刷宝 ARPG。以法师为首发职业，以手机与键鼠的简单操作承载技能、装备、关卡和终局的长期选择。</p>
<div class="stats"><div class="stat"><strong>{totals['hanCharacters'] / 10000:.1f} 万</strong><span>汉字 · 源章节去重</span></div>
<div class="stat"><strong>5 幕</strong><span>完整故事框架</span></div><div class="stat"><strong>9 章</strong><span>系统规则与制作依据</span></div></div>
<p>策划基线 1.0 · 2026-10-11<br>当前游戏 Demo 0.2.0</p>
<div class="notice">本书是完整设计提案。内容表尚待制作，数值、性能和可玩时长尚待验证；已实现的 Demo 能力另见仓库说明。
建议先读第01、02章，再查各系统。章节目录、关键词检索和离线 PDF 可辅助阅读。</div></header>
<div class="print-toc"><h1>分章目录</h1><ol>{print_toc}</ol><p>先读愿景与故事，再查系统规则。PDF目录链接可跳转，源文件和统计清单保留在仓库。</p></div>
{''.join(rendered)}<footer>源章节去重统计：{totals['hanCharacters']:,}汉字 / {totals['totalCharacters']:,}总字符。
各章哈希与内容数量见 docs/bible/MANIFEST.json。生成阅读副本不增加正文规模。</footer>
</main></div><script>{script}</script></body></html>"""
(OUTPUT / "index.html").write_text(page, encoding="utf-8")
print(json.dumps({"totals": totals, "contentTableCounts": counts,
                  "readerBytes": (OUTPUT / "index.html").stat().st_size}, ensure_ascii=False))
