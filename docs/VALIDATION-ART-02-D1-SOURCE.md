# ART-02 D1：已验证源布尾修正，最终资产仍待验证

2026-10-13，本轮有限步骤只修正源模型布尾两层的蒙皮关系。当前3D游戏仍为0.3.0-preview.2，策划1.0；独立2D v0.3及所有发布文件保持原样。新法线候选没有发布，ART-02与用户美术验收均未完成。

## 实际修正与验证

原生成器分别按顶点位置挑选最近骨骼。6毫米厚的布尾两层顶点因此可能获得不同的第三根骨骼，行走时最坏层间距离达到20.380971毫米。现在仅让两片`Split coat tail`的Solidify复制层使用对应原始／基准层权重；不改变基准层与其他部位的权重、网格、UV、骨架或动作源码。第一块425顶点是Solidify原始层：在tail -1为物理外侧，在tail +1为物理内侧；不声称两件物理外侧权重均未改变。

实际重新生成源模型：45,710三角面、163源骨骼、22张打包图像、Idle/Walk/Cast。`--source-only`模式保存可编辑源文件和制作收据，不渲染studio图、不导出或覆盖已发布GLB。该源骨架不是游戏的60骨骼预算资产。

独立Blender比较原始与修正后两个实际生成文件：215部件的拓扑、静态位置、UV、基准层/其他部位权重、所有静态骨矩阵与F-curve路径/索引/关键帧数值不变。完整Walk整数帧和选定Idle/Cast共42时点×两片，即84组布尾层采样；修后最坏6.000096毫米，通过6.001毫米上限。该比较没有声称全面比较插值手柄/NLA元数据；本次动作源码未改。收据与完整证据见[source-build-receipt](../assets-source/ash-archivist/source-build-receipt.json)、[源模型比较](qa/surface-source-shell-invariance.json)、[原始层诊断](qa/surface-original-shell-diagnostic.json)。

实际源文件SHA256：原始`b78ee35ce2b8f1e91ef7be5a9da30645bd09aaf07abc9c3c7c0aae5b2ddec503`；修正后`d02212c51ab4c1f130789f28e0c884a2d37d3dffa4045ca8fe6c45d7c06dd64b`。`.blend`是可重建的中间文件，没有提交；跨机器重建的文件哈希可能受Blender元数据影响，应重新生成收据并运行几何/权重比较，而不是沿用本次文件SHA。

隔离候选实际执行`npm run check`通过：26个固定来源哈希、现有两级GLB预算/蒙皮/动作、61项3D存档测试、23项独立2D规则测试及相关语法检查。新增独立2D终版状态审计9项测试与审计命令也通过；没有改动该路线。两张已发布GLB仍为`e7e16b…`/`79db8b…`；本轮没有运行新资产的完整游戏回归，因为新资产未通过视觉门禁。

## 制作与恢复

```sh
blender -b -t 2 --python scripts/build-mage-realism.py -- /绝对路径/Diablo --source-only
blender -b -t 1 --python scripts/check-source-shell.py -- /绝对路径/baseline.blend /绝对路径/current.blend /绝对路径/comparison.json
```

原始源生成器保存在checkpoint提交`d059362fbfbe64a32a56f70cebfd9f87b39b0c26`。用同一套固定人体源资源生成原始与当前源文件，比较前保留两个文件，不依赖旧机器缓存。

法线/UV/减面实验在`checkpoint/art-02-d1`，恢复提交以[project-state.json](project-state.json)为准。实验两级几何的完整Walk双向表面测量达到5.977/13.952毫米，但候选出现新的胸口和袖口黑三角，不能视为通过。实际normalMap移除/平坦法线对照与射线命中定位到PNG中的反向Z像素；新导出字节检查正确拒绝该候选。后续必须先解决真正的UV覆盖、投射和量化检测，再验证最终资产、原生画面及游戏交互。

这里的源权重修正没有改变当前玩家看到的模型。它不证明衣物雕刻、脸部/头皮、全环境、美术品质或真实手机性能已达标；上述目标继续保持未验收/未实测。
