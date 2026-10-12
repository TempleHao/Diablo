# ART-02 A/B/C 验证记录

本轮候选版本0.3.0-preview.2，策划仍为1.0。仅完成角色精修、双LOD/rig/合图和按需人物查看的有限步骤；ART-02整体美术验收仍未完成。

## 已验证的源码与资产

Blender4.3.2真实生成与导出；脚本Python编译、JavaScript语法和git diff --check通过。`npm run check`通过八模块语法、新旧GLB、26固定来源哈希、两资产SHA/四最大归一蒙皮/骨骼材质面数硬预算与动画采样对齐，以及61项存档测试（0失败）。

|实际指标|上版|本版战斗|本版近景|
|---|---:|---:|---:|
|三角面|40,966|14,713|34,451|
|关节|163|60|60|
|材质 / GLB primitives|9 / 42|2 / 2|2 / 2|
|嵌入图像|20|4|4|
|模型字节|7,783,844|3,852,640|4,676,752|

文件SHA、实际图集通道、15时点误差和命令见[ART-02-BUDGET](ART-02-BUDGET.md)与[budget-report.json](../assets-source/ash-archivist/budget-report.json)。面部/手部最大采样误差1.338mm不能代表全身；L1布尾局部Walk误差58.132mm、全身bounds最大差4.814mm。原模及最终导入离线证据见[ART-02-LOOKDEV](ART-02-LOOKDEV.md)。

## 原生浏览器

Chromium/headless SwiftShader真实运行，最新模块下23项完整游戏回归、6项资源生命周期/取景专项通过；另有两LOD×三clip×五时点共30次原生GLTFLoader/AnimationMixer采样通过。所有实际模块SHA与本地候选一致。固定未入场world的颜色pass已测由158 calls/208,334 triangles降为118 calls/182,081 triangles，最后quad仍1 call/2 triangles。Three.js统计在shadow后重置，数字只含主颜色pass，不包括阴影与全部后期负担；这是结构计数，不是实体设备FPS收益。

23项覆盖键鼠移动/Idle-Walk、火球/冰霜/Cast/闪现，人物暂停、拖转/滚轮/全身/面部/resize，嵌套存档暂停和装备暂停；390×844 CDP触屏摇杆与施法并行、释放摇杆保留按住火球、打开人物清除按住输入、拖动/双指缩放、退出后无粘键和存档布局/恢复暂停。没有把这些面板回归称为完整存档故障UI复测；迁移/故障保护由61项存档单元测试另验。

最新6专项：启动仅请求combat；背面加载完成保留旋转，切面部刷新前方挂点/镜距；三次重开同context且静态bufferData次数85/字节2,301,012与texImage2D次数9不增加；关闭pending后无adopt、RAF/mixer稳定、GPU上传不增；完成后再开用CPU缓存；注入503仍显示combat，按重试请求成功。动态骨骼更新不当成静态资源重上传。

初始检查证据曾保存可变请求数组，后续加载污染初始列表。修成不可变detail快照，并独立重测首次请求，记录为[initial-recheck](qa/art2-initial-recheck.json)；最终6项证据已替换为真实该时点的combat-only列表。前一版未刷新face anchor的7项旧专项不计入最终通过数。

桌面与触屏上下文无pageerror、console warning/error、非预期HTTP失败或requestfailed；503专项的预期故障单独记录。原生30采样检查60骨骼姿态、face_focus逐样一致，bounds有限/接地在容差内；离线预算报告与此运行检查分别保存。

证据：[完整游戏23项](qa/art2-browser-regression.json)、[最新6专项](qa/art2-lifecycle-final.json)、[原生30采样](qa/art2-native-poses.json)、[上版冻结结构与成本](qa/art2-baseline.json)。实际图：[本版全身](screenshots/art2-full-desktop.png)、[本版面部](screenshots/art2-face-desktop.png)、[手机视口](screenshots/art2-mobile-face.png)；相同镜头[上版全身](screenshots/art2-before-full-desktop.png)/[上版面部](screenshots/art2-before-face-desktop.png)。这些都是实际GLB渲染，不是概念图。

Pages尚未集成验证，代码提交成功不等于部署成功。

## 未测试与未达到

- 真实Android/iOS性能、显存、温升、电量与实际玩家体验均未测试。手机视口只是输入与布局模拟。
- github.io直接线上浏览器回归受环境网络策略阻止；发布只能按实际Actions检查/上传/deploy结果登记。
- D2R/D4商业美术质量与用户艺术验收未达；蜡感皮肤、眉毛/胡茬、侧头皮壳感、衣物雕刻/磨损和装备软连接仍有缺口。L0/L1布尾有原模未见的少量黑斑/折线，正常贴图/合图边和衣物减面仍需修整；怪物保持原型，本轮没有重做环境。
- 缺少位置相关高低模表面雕刻/法线烘焙和低档纹理/真实手机验证，当前图集2048；源码无表情/脚趾等独立动画保留承诺。
- 当前按用途选择两级LOD，并非自动距离切换；人物上下文与高模缓存保留到页生命周期，不声称关闭释放显存。

下一有限子步骤ART-02 D：头皮/发束结合、脸部UV细节与皮肤粗糙度、衣物裁剪/张力雕刻与位置磨损/高到低法线烘焙，再做同镜头实际画面对照。美术优先级持续先于ART-03和D1-02。

## 复现测试的边界

仓库保存`tests/art-browser-smoke.cjs`及`tests/art/{runtime,lifecycle,poses}.cjs`，四文件语法通过且无本次scratch路径依赖。保存后的lifecycle与poses路径配置版已在真实本地HTTP、同一Chromium上独立执行通过（6专项、30采样）；23项standalone配置版没有再完整独立执行，验收来自同断言逻辑、实际冻结HTTP模块的23项运行，差异为路径配置与不可变证据复制。不能把语法检查说成独立浏览器运行。

需要另装Playwright Core与Chromium；不属于游戏运行依赖。先`npm run dev`在5173启动，设置`ART_PLAYWRIGHT_MODULE`为安装的模块名/绝对入口，必要时设置`ART_CHROMIUM_PATH`、`ART_QA_URL`、`ART_QA_OUTPUT`，再执行`npm run check:art-browser`、`npm run check:art-lifecycle`或`npm run check:art-poses`。每次脚本按自身检查创建并关闭测试浏览器，不修改生产模块；采样函数只注入截获的测试HTTP响应。
