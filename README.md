# 余烬法师 · Ember Mage

> **新增独立 2D 原型（v0.1）**：采用 Canvas 2D 俯视角渲染，无需加载 Three.js / GLB 模型。与原 3D 版并行维护，互不覆盖。
>
> **[直接体验 2D 版](https://templehao.github.io/Diablo/2d/)** · [2D 实现与测试说明](docs/2D-IMPLEMENTATION.md) · [2D 自动化检查](https://github.com/TempleHao/Diablo/actions/workflows/check-2d.yml)
>
> 2D 版已实现法师移动、火球/霜环/闪现/药水、近战与远程怪物、首领、装备拾取、三槽换装、分解、等级与本机存档，支持键鼠和手机触摸操作。仍为第一幕战斗原型，完整剧情、多职业、打造与完整美术尚未实现。2D 存档独立于 3D 存档。


**版本 0.3.0-preview.2** · 写实暗黑方向的3D美术预览；仍是单人刷怪原型。第一版专注法师，支持电脑与手机浏览器。

[打开游戏](https://templehao.github.io/Diablo/) · [完整游戏策划](docs/bible/README.md) · [在线策划阅读版](https://templehao.github.io/Diablo/design/) · [部署工作流](https://github.com/TempleHao/Diablo/actions/workflows/pages.yml)

游戏地址需要 GitHub Pages 工作流成功部署后才可访问；以工作流结果为准。

项目续做从[断点记录](docs/PROJECT-STATE.md)、[工作队列](docs/WORK-QUEUE.md)和[机器可读状态](docs/project-state.json)恢复。定时任务每5小时尝试继续；实际执行取决于额度、工具与连接可用，不代表能够查询或保证额度恢复时间。

## 完整故事与策划纲领

《余烬纪事》策划基线1.0已整理成[分章文档](docs/bible/README.md)、[完整Markdown](docs/GAME-BIBLE-1.0.md)与[PDF](dist/design/GAME-BIBLE-1.0.pdf)。源章节约11.0万汉字，覆盖五幕故事、法师三系、装备与词条、关卡与怪物、掉落打造、终局和未来在线扩展，并给出美术技术规范及验证方法。它是完整设计提案，与当前Demo实际能力分别标注。

![地窟实机画面](docs/screenshots/gameplay.png)

## 当前可玩内容

- 法师采用连续人体网格、真实皮肤UV、可辨眼睛与手部、发卡、多层衣物和皮革胸带；Idle/Walk/Cast骨骼动作。人物面板支持全身/面部、拖转和滚轮/双指缩放；细节加载失败可重试，关闭不会阻断回到地窟。
- 灰烬地窟重做错缝缺角石板、风化石墙PBR、连续尖拱与断拱、浮雕/空兜帽石像、灰污潮迹和柔边火把，保留既有通路/碰撞。新增接触遮蔽与HDR输出照明。
- 火球远程攻击、冰霜新星范围伤害与减速、闪现、冷却式治疗药水。
- 12 名守卫与灰烬领主、三种品质随机法杖、升级、换装与分解。
- 本机存档保留等级、装备、通关次数；死亡保留已拾取成长，通关后下一轮敌人和掉落提高。
- 存档与备份面板：保留旧0.2.0角色和法杖，支持导出文件、导入前预览与确认、恢复备份。手动替换角色的恢复点与自动保存分开；坏档和高版本档会保护原文件，保存失败有提示。
- 手机左侧摇杆移动、右侧技能按钮；按住火球连续攻击，自动瞄准最近敌人。电脑支持键鼠。

## 操作

| 操作 | 电脑 | 手机 |
| --- | --- | --- |
| 移动 | WASD / 方向键 | 左侧摇杆 |
| 火球 | 鼠标瞄准，按住左键或 1 | 按住火球 |
| 冰霜新星 | 2 | 冰霜按钮 |
| 闪现 | 空格 | 闪现按钮 |
| 药水 | 3 | 药水按钮 |
| 装备 | B / 装备按钮 | 装备按钮 |
| 人物查看 | 人物按钮，拖动旋转 | 人物按钮，拖动旋转 |

建议手机横屏。页面需要 WebGL；所有游戏运行资源都随仓库部署，不依赖外部 CDN。

## 本地启动

需要 Python 3、Node.js 和支持 WebGL 的浏览器，不需要安装 npm 依赖。

```sh
npm run dev
# 浏览器打开 http://localhost:5173
npm run check
```

## 模型源文件

进入游戏使用 `dist/models/ember-mage-combat.glb`（14,713三角面/3,852,640字节）；人物查看才按需加载 `ember-mage-realism.glb`（34,451三角面/4,676,752字节）。两者均60骨骼、2材质/2 primitives、4张嵌入PBR图集，包含相同Idle/Walk/Cast与面部取景挂点。人体、形变、骨架/眼睛和系统皮肤采用已登记的MakeHuman CC0图形资源；服装、装备与生成管线为本项目制作，不把第三方基底称为从零原创。来源清单见 [human-base](assets-source/human-base/README.md)。

已在Blender **4.3.2**生成候选：

```sh
blender -b --python scripts/build-mage-realism.py -- /你的绝对路径/Diablo
blender -b assets-source/ash-archivist/ash-archivist.blend --python scripts/refine-mage-budget.py -- /你的绝对路径/Diablo
python3 scripts/build-environment-textures.py
```

环境生成器本轮使用Pillow12.3.0、NumPy2.3.5；Blender脚本使用其自带NumPy。可编辑`.blend`及原创中间纹理由脚本重建，当前发布GLB不依赖这些未提交文件。旧模型与旧生成器保留，便于对照/回退。环境CC0石材来源与实际结构计数见 [ART-ENVIRONMENT](docs/ART-ENVIRONMENT.md)。

这次交付是角色精修与资源预算的预览，**没有达到D2R/D4级质量，ART-02仍在进行，美术尚未获用户验收**。新增真实发卡、张力衣褶、开领与包杖/施法姿态；战斗与近景资产分别满足策划首轮角色面数/骨骼/材质预算。人脸/头皮质感、衣物高低模雕刻与位置磨损、动作、怪物和完整环境仍需制作；布尾减面局部误差与真机未测明确列出。制作与误差证据见 [角色精修](docs/ART-02-LOOKDEV.md)、[预算记录](docs/ART-02-BUDGET.md)；当前验证见 [ART-02记录](docs/VALIDATION-ART-02.md)。

## GitHub Pages 部署

仓库 Settings → Pages → Build and deployment 的 Source 选择 GitHub Actions。推送 main 后 Deploy GitHub Pages 工作流发布 dist；也可以在 Actions 手动运行。资源使用相对路径，适配 `/Diablo/` 子路径。

## 仍待实现

完整房间关卡、分工怪物 AI、三系构筑、真实词条组合、定向掉落与重铸仍属于[设计计划](docs/bible/README.md)，目前不是现有能力。完整计划为十装备位，D1先做六槽过渡。当前地图是固定场景，怪物位置和法杖数值随机；法杖还只有伤害加成。

暂不提供账号、云存档、多人联机或交易。本机存档不跨域名/设备共享；清除网站数据会丢失存档。真实手机性能与完整 Boss 通关平衡仍需持续测试。

导出JSON文件后可手动在另一设备导入。首次升级会将合法旧档迁移到新版格式，原来的 `ember-mage-v1` 保留。导入会先显示等级、装备和通关次数，确认后替换角色并回到入场画面。跨页改档已有乐观冲突检测；完整跨页事务仍在后续系统阶段。模块边界与保存规则见[架构说明](docs/ARCHITECTURE.md)。

## 第三方声明

Three.js 0.170.0 及其 GLTFLoader、BufferGeometryUtils、SkeletonUtils 使用 MIT 许可证，见 THREE-LICENSE.txt 与 dist/vendor/THREE-LICENSE.txt。MakeHuman图形资产及所列ambientCG石材采用CC0，固定来源/当前许可证据见assets-source清单；本项目原创代码和美术尚未选定公开许可证。

## 验证记录

Chromium 桌面与手机视口检查覆盖模型加载、三段骨骼动画、移动和技能、人物查看与拖动、装备加成、刷新恢复存档。`npm run check` 检查语法和模型资源完整性。桌面自动化渲染结果不能代替真实手机帧率测试。

0.2.1的61项存档迁移/故障/恢复测试与浏览器存档回归通过，复现方法及边界见[D1-01验证记录](docs/VALIDATION-D1-01.md)。可选 `npm run check:browser` 需要另外安装Playwright Core并提供Chromium；游戏运行本身不依赖这些测试工具。

0.3.0美术预览另通过23项桌面/触屏视口交互回归，新GLB与26项来源哈希检查；实际范围见[ART-01验证记录](docs/VALIDATION-ART-01.md)。可选 `npm run check:art-browser` 需要Playwright Core及Chromium。照片/截图与真机性能、美术品质验收分别记录。

0.3.0-preview.2另通过61项存档测试、23项完整游戏浏览器回归、最新6项资源生命周期/取景专项及30次原生动作采样。实际范围和软件渲染限制见[ART-02验证记录](docs/VALIDATION-ART-02.md)；技术通过不表示美术验收通过。
