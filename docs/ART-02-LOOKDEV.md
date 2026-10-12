# ART-02 A · 原模角色精修与实渲

本步骤改动 `scripts/build-mage-realism.py`，保留原CC0连续人体/皮肤/眼睛、Idle/Walk/Cast、1.91米人体尺度及`face_focus`。没有下载新的外部素材或采用商业游戏资产。

## 本次实际制作

- 原创512×1024发束RGBA图：28条长向纤维、根部淡入、尾端收窄及少量灰丝。144张低层数发卡（冠顶72、前额8、侧颅/鬓角44、后颈20；共2,192三角面）沿真实头颅方向梳向后方，以阈值透明显示纤维。原近贴头皮网格保留作深色底层。三次实际生成后修正了粗估头颅中心错误，额头发卡已位于皮肤外侧，而不是藏在帽壳内。
- 上衣加入腰带压缩褶、腋下斜向张力，袖管加入肘部压褶和袖口聚褶；尾摆补腰髋张力与不同幅度垂褶，披肩加入重力起伏。它们是几何表面变化，不能当作完成的高模布料雕刻。
- 缩短并弯曲贴肩皮革yoke，添加有座落面的边缝、少量鞍针线及胸带滚边；前低后高的软立领及顶端卷边暴露一小段颈部。保留朴素装备，没有增加夸张尖肩或装饰小物。
- 眉宽/色及胡茬过渡有小幅调整。连续人脸、手部和原皮肤UV保留。
- 握杖以实际掌横轴对齐竖杖，四指在杖轴周围逐节包合，再把姿态烘焙为rest pose。Cast增加施法手腕与指根、躯干旋转及轻微右腿承重；仍是手工首轮动作。

## 生成与证据

Blender 4.3.2实际生成的冻结原模为45,710三角面、163骨骼、10材质。这是交给预算管线的中间原模，**不是最终战斗资产预算**。

```sh
blender -b --python scripts/build-mage-realism.py -- /absolute/project/path
blender -b assets-source/ash-archivist/ash-archivist.blend --python scripts/render-mage-inspection.py -- /absolute/project/path
```

本次冻结原模`.blend` SHA256：`8950626de6f9d7116c1e227e0e1452aacfea9312078b673ff91d82958cc9ddd7`。它以程序生成的纹理、完整原rig与已烘焙握杖rest pose保存。`.blend`和可重建中间纹理按现有`.gitignore`保留于本地；持久化来源为生成脚本。

已实际检查以下Cycles32样本studio证据；没有把这些离线渲染称为游戏实机或真机性能：

|证据|实际内容|
|---|---|
|[全身原模](screenshots/art2-raw-character-studio.png)|Idle首帧、衣物/发际轮廓与站姿|
|[面部原模](screenshots/art2-raw-face-studio.png)|真实皮肤与发束/领口近景|
|[握杖原模](screenshots/art2-raw-grip-studio.png)|手掌面、四指包杖、袖口接触|
|[施法原模](screenshots/art2-raw-cast-studio.png)|Cast第16帧，施法手与身体姿态|

此环境Blender未编入OpenImageDenoise，初次额外证据渲染失败后已关闭denoise重新完整渲染。生成脚本与证据脚本通过Python语法编译。

## 未达到的目标

**本次没有达到D2R/D4商业美术品质，也没有完成用户美术验收。**前额发际及握杖已有可见改进，仍有侧颅底层反光偏壳状、眉/胡茬偏淡、皮肤苍白及蜡感、衣物褶皱幅度偏保守的问题。肩袖连接、皮革层次、装备连接与手部细小缝隙需要进一步人工近景修整，材质缺少位置相关磨损和高低模法线烘焙。Walk仍是循环角度首稿；没有动捕、碰撞布料或表情动画。

下一阶段预算管线必须另验真实skin joints数、材质/primitive数、L0/L1和表面误差；本步骤的离线高模证据不代替最终GLB的近景、动作和游戏镜头复查。没有实际Android/iOS设备测试。
