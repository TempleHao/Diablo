# ART-01 连续人体法师候选

本页记录可运行资产与制作来源，不能作为D2R/D4美术目标已验收的证明。

当前候选 `dist/models/ember-mage-realism.glb`：7,783,844字节，40,966三角面、163骨骼、9材质、20嵌入图像，Idle/Walk/Cast与`face_focus`挂点；人体高度约1.91米。运行缩放1.12，人物查看按原始比例展示。统计来自GLB与生成器产物，不是品质或性能评分。

连续人体、成熟形变、原始骨架/权重与眼睛来自MakeHuman CC0图形资源。皮肤使用官方目录明确列为CC0的`middleage_caucasian_male`系统资产，字节取自固定GitHub镜像；未对比官方ZIP字节。多源固定提交、SHA与许可原文/证据见 [human-base](../assets-source/human-base/README.md)。没有复用商业游戏角色资源，不把人体基底称为从零原创。

`scripts/build-mage-realism.py`生成合体内衣、袖管、分叉衣摆、肩部皮革、扁平胸带、靴子、腰带和法杖，并将合法权重归一化。原创材质包含基本色、法线与粗糙度；真实系统皮肤保留原始UV。眼睛按原生proxy附着，外角膜透明区通过Alpha MASK处理，避免遮住内眼。头部挂点供近景取景，非用法杖包围盒猜人脸位置。

已修首次候选的黑眼、尖齿发际边界、部分颈部裁切和粗圆胸带。当前头发仍为几何头皮/纹理，衣物折褶、缝线、磨损、握杖、手指动作及动画过渡仍需精修；不等于完成商业级角色雕刻/贴图/动作制作。

本轮重建使用Blender **4.3.2**及其自带NumPy：

```sh
blender -b --python scripts/build-mage-realism.py -- /绝对路径/Diablo
node scripts/check-art-assets.mjs
```

脚本生成GLB、可编辑`.blend`、原创中间纹理、studio渲染和统计。中间输出可重建，运行GLB内嵌图像与缓冲，不依赖未提交`.blend`或外部CDN。studio证据是Blender渲染；浏览器截图另外记录，不能混作游戏画面。

当前超过策划首轮LOD0 20k–35k、≤60骨骼与受限材质预算，尚未制作战斗LOD1/LOD2。单角色结构合法和浏览器动作通过不能证明移动端成本达标；真实手机、显存、温升/续航均未测。具体回归和下一项见 [VALIDATION-ART-01](VALIDATION-ART-01.md)。
