# ART-02 角色合图与战斗预算

2026-10-12。以下是导出的 GLB 和实际蒙皮/几何检查结果；不代表商业游戏级美术验收或真机帧率达标。

|资产|三角面|GLB meshes / primitives|关节|材质|嵌入图像|字节|
|---|---:|---:|---:|---:|---:|---:|
|近景 `ember-mage-realism.glb`（L0）|34,451|1 / 2|60|2|4|4,676,752|
|战斗 `ember-mage-combat.glb`（L1）|14,713|1 / 2|60|2|4|3,852,640|

两个 primitive 分别使用 OPAQUE 与 MASK。Three.js 将该 GLB mesh 的两个 primitive 实例化为两个 SkinnedMesh；GLB 中的一个 mesh 不应写成运行时只有一个绘制对象。两个资产保留 Idle / Walk / Cast、相同关节顺序与动画采样、`face_focus`，原人物 1.91 米接地尺度沿用。

L0 SHA256：`e7e16babefac9fac546739721a885c140b68910ae7672edee6ba498e30b4b2f3`。

L1 SHA256：`79db8bce51b85f97331226e1fc60bcf059c595038326fa4bfb7b8390bae1dfaa`。

## 生成与真实合图

编辑源由 `build-mage-realism.py` 生成完整角色：本次冻结输入为 45,710 面、163 骨骼、10 材质。预算脚本在完整握杖姿态已经烘入 rest pose 后运行。

```sh
blender -b --python scripts/build-mage-realism.py -- /绝对项目路径
blender -b assets-source/ash-archivist/ash-archivist.blend \
  --python scripts/refine-mage-budget.py -- /绝对项目路径
node scripts/check-art-assets.mjs
```

脚本将每个原材质的完整 UV 范围线性映射到独立图集区域。原来的越界 repeat 采样在 SourceUV 中执行，然后由 Cycles 烘到新 UV；每块留 16 像素边距，烘焙扩边 12 像素。报告核验各材质实际 UV 上下界，避免跨 tile 或直接对多边形 UV 取模。原节点的皮肤顶点色乘法、法线强度、粗糙度、金属度、发光强度以及 alpha 阈值参与实际烘焙。

四张 2048×2048 图像真正供两个材质使用：

|图像|保存的通道|本次生成 PNG 字节|
|---|---|---:|
|`atlas-basecolor.png`|基础色 RGB；原 alpha 表达式烘入 A|1,336,780|
|`atlas-normal.png`|切线空间法线 RGB，包含原法线强度|592,165|
|`atlas-orm.png`|G 粗糙度、B 金属度；R 为中性 1，未声称新增 AO|943,362|
|`atlas-emission.png`|含原强度的发光 RGB，保留 amber 法杖焦点|84,876|

源眉毛、眼壳与发卡的 alpha 阈值表达式先烘成遮罩，目的 MASK 阈值为 0.5。GLB 检查确认两个材质均引用基础色、法线、金属/粗糙度和发光纹理，实际嵌入四张图像；这并非仅改材质名称。PNG 可由脚本重建，不作为运行依赖；逐图 SHA256、原 UV 范围和图集矩形记录在 [budget-report.json](../assets-source/ash-archivist/budget-report.json) 的 `atlas` 字段。2048 图集会重采样原重复纹理，不承诺逐像素等同原着色器。

## 骨骼与误差检查

60 根实际导出关节保留全部 30 根手指骨、当前 15 个真正活动的骨骼通道，以及头、颈、脊柱与主要四肢骨。103 根未活动的面部/舌/脚趾等辅助骨，其权重按最近保留祖先求和，再取四个最大权重并归一；删除骨骼时保留绝对 rest 矩阵。减面插值后的权重也显式执行四最大归一。独立面部或脚趾动画需回到完整源 rig，不能把这次合并说成保留了这些未来能力。

Idle、Walk、Cast 各取起点、25%、50%、75%、终点，共 15 个时点。报告保存每时点实际形变位置、BVH 表面距离、全身包围盒及挂点/握杖矩阵比较：

|检查|L0|L1|
|---|---:|---:|
|面部/手部采样表面最大误差|0.000649 mm|1.338 mm|
|全身包围盒最大差|0.920 mm|4.814 mm|
|布尾局部采样表面最大误差|16.564 mm|58.132 mm|

删骨转权重阶段的全角色顶点最大位置差为 0.000769 mm；`face_focus` 与持杖 wrist.R 矩阵的最大元素差为 3.58×10⁻⁷。L0 的脸、手、眼与发剪影保持源几何；L1 降低脸/手和眼球面数，完整保留全部 2,192 发卡三角面及眉毛、头皮、法杖主要几何。

58.1 mm 是 L1 在 Walk 时布尾的局部误差，不能用 1.338 mm 的脸/手数据代表全角色。该局限需结合战斗视距的实际画面判断；后续可对衣物权重边界和减面分配再精修。本次仅证明结构预算、所列采样和资源完整性。真实 Android/iOS 的帧率、GPU 内存、温升和续航尚无数据。

详细统计为 [statistics.json](../assets-source/ash-archivist/statistics.json)、[combat-statistics.json](../assets-source/ash-archivist/combat-statistics.json) 与预算报告。MakeHuman 人体/骨架/眼睛/皮肤基底沿用已登记 CC0 来源；项目原创生成代码、服装与图集未另行选定公开许可证。
