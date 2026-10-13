# 《余烬纪事 2D》实施说明（v0.3）

更新日期：2026-10-13

## 目标与入口

- 原仓库：TempleHao/Diablo，原 3D 版本保持 \`dist/index.html\`、\`dist/game.js\` 和所有 GLB 资源不变，原有 3D 存档格式不变。
- 2D 版本：\`dist/2d/index.html\`，预计在原有 GitHub Pages 地址后添加 \`/2d/\` 即可访问。
- 2D 使用自带 CC0 授权精灵图集、Canvas 2D 绘图和 JavaScript ES Modules，不引用 Three.js、CDN 和服务端接口。
- 同一仓库内两个版本分别维护；“2D v0.2”独立于 3D 预览版 \`0.3.0-preview.2\`。

## 当前已经实现

1. 动态镜头跟随、确定性生成的石板地窟、柱体碰撞、可行走中央通路、火把光晕、小地图。
2. 法师四技能：无需法力的余烬箭、消耗法力且减速的冰霜新星、受碰撞约束的闪现、冷却药水。
3. 三类普通怪物：追击徘徊者、保持距离的远程弓手、血量较高的重装怪；通关条件包含一次多发远程弹幕首领战。
4. 随机武器、法袍和护符；普通/魔法/稀有/独特品质分级，伤害/生命/法力属性真实进入面板；拾取、换装、精华分解、30 件背包上限。
5. 战利品金币、经验升级、生命和法力恢复、通关轮回强化，以及独立的浏览器本机存档。
6. PC 键鼠控制与手机左摇杆/右技能按钮，背包、暂停、操作帮助、存档导入导出。

## 技术文件

| 文件 | 用途 |
|---|---|
| \`dist/2d/art.js\` | 真正的 2D 精灵动画、地砖、墙体与正确场景遮挡 |
| \`dist/2d/art/0x72-dungeon-atlas.png\` | 本地 CC0 精灵图集，来源另见 2D-ART-SOURCES.md |
| \`dist/2d/index.html\` | 独立页面、HUD、菜单和操作区域 |
| \`dist/2d/style.css\` | 响应式界面与幻想风格 |
| \`dist/2d/game.js\` | Canvas 绘制、状态机、AI、战斗和输入 |
| \`dist/2d/core.js\` | 无 DOM 依赖的地图、碰撞、角色成长、装备与存档规则 |
| \`tests/2d-core.test.mjs\` | 地图、边界、碰撞、战利品、等级、装备与存档自动化单测 |
| \`tests/2d-browser.test.mjs\` | Chromium 桌面与手机视口真实页面冒烟检查 |
| \`.github/workflows/check-2d.yml\` | 分支及 PR 自动校验 |

## 运行与测试

\`\`\`bash
npm run dev
# http://localhost:5173/2d/

node --check dist/2d/core.js
node --check dist/2d/game.js
node --test tests/2d-core.test.mjs
npm run check
\`\`\`

Playwright Core 和 Chrome 是**浏览器自动化测试**的可选依赖，玩家运行游戏不需要它们。在能联网的测试环境，可额外安装 \`playwright-core@1.56.1\` 然后执行 \`node tests/2d-browser.test.mjs\`。

## 验证边界

- 已检查：游戏模块语法，地图生成及关键碰撞和存档规则；在真实 Chromium 的桌面/手机视口加载 2D 页面、开始游戏、移动和施法、打开关闭背包、暂停恢复（以 GitHub Actions 运行结果为准）。
- 尚未检查：真实手机性能、长时间完整通关、各等级掉落概率、完整 Boss 战难度、无障碍键盘导航、全部设备兼容性和长期留存。
- 界面当前是基于可追溯 CC0 图集的像素 2D 原型美术，不是达到商业 2D 游戏的逐帧精灵动画或正式像素美术完成版。
- 自动保存使用 \`ember-chronicles-2d-v1\`；它**不读取、修改或迁移**原 3D 的 \`ember-mage-v1\` 等存档。清理网站数据可能造成角色丢失，建议使用背包内导出功能。
- 没有账号、云存档、多人联机、服务器经济或付费服务。GitHub Pages 是静态托管。

## 后续有限工作包（按顺序）

1. **2D-ART-01**：完成原创角色/怪物/环境统一风格的 2D spritesheet、可读打击帧、受击和行走动作；制作截图并人工验收。
2. **2D-COMBAT-02**：增补怪物技能前摇、寻路绕障碍、Boss 阶段和控制/伤害公式测试；可重演战斗数据。
3. **2D-LOOT-03**：根据策划 1.0 开发 6 槽装备、真实词条、比较面板、定向掉落与掉落边界。
4. **2D-ACT-04**：完整第一幕任务、随机房间组合、场景出口、营地与有意义的短局刷装循环。
5. **2D-QA-05**：通关、死亡/刷新/存档、低性能手机、平衡和性能回归，形成单独验收报告。

3D 版原有 ART-02 队列和自动任务没有因本次新建 2D 版本而被擅自修改或删除。

## 发布与回滚

既有 \`.github/workflows/pages.yml\` 发布整个 \`dist/\`，因此只要主分支包含 \`dist/2d/\`，原有 Pages 成功发布后 \`/Diablo/2d/\` 就会作为子目录可用。不要为 2D 覆盖根目录 3D index。

发生 2D 阻断故障时，仅撤销新增的 2D 相关入口或代码提交，不删除既有 3D 发布文件；通过 PR 与部署记录定位版本。


## 真实画面证据（2026-10-13）

- GitHub Actions 工作流：https://github.com/TempleHao/Diablo/actions/runs/38295741221
- Chromium 桌面图：../docs/screenshots/2d-v0.2-desktop.jpg
- Chromium 模拟手机 390 × 844（实际指定 viewport、isMobile 和 hasTouch）截图：../docs/screenshots/2d-v0.2-mobile.jpg
- 这两张由相同仓库提交在浏览器中实际执行战斗场景后截取，没有用绘图软件或生成式概念图代替游戏画面。
- 真实 iOS 设备上帧率、触控手感与持久运行仍未测试，必须与浏览器模拟测试区分。

## v0.3 系统更新

13 装备位、随机词缀、两套套装、七主动技能及技能等级、五区域遭遇已经以可测试规则接入。详情、旧存档兼容、实际界面截图、视觉 A 方向尚未达成的范围及验收准则，均记录于 [2D-SYSTEMS-V0.3.md](2D-SYSTEMS-V0.3.md)。
