# 3D 小样素材接入（dist/proto）

## 照片扫描材质（Poly Haven，CC0）
1. 下载 2K JPG：Diffuse、Normal（GL）、Rough、AO、Displacement，可以是 zip。
2. `python3 scripts/import-polyhaven.py 下载目录或zip...` → 生成 `dist/proto/tex/<材质名>/{diff,nor,rah}.jpg`（另有 1k/ 给中低画质）并更新 `tex/index.json`。
3. 槽位与优先顺序在 `dist/proto/pbr.js` 的 `SLOTS`；单个材质的真实尺寸（米）写进 `SLUG_SIZE`。
   - floor：monastery_stone_floor　floor2：mossy_cobblestone　mud：mud_forest / gravel_floor_02
   - wall：medieval_blocks_02 / castle_brick_broken_06　pillar：castle_wall_slates　rubble：castle_brick_broken_06
4. 没有照片材质时用 `scripts/bake-proto-textures.py` 烘焙的 baked-* 替身。

## 代码建模角色（默认）
- dist/proto/actors.js 里的 DEFS：每个角色是一段建模代码 + 动作映射；骨架/动作来自 models/rig/humanoid.glb（KayKit CC0，已剥离模型）。
- 重新生成动作文件：`python3 scripts/strip-kaykit-rig.py Skeleton_Warrior.glb dist/proto/models/rig/humanoid.glb`

## 骨骼角色（可选：混元3D → Mixamo）
1. 每个角色一个目录 `dist/proto/models/<id>/`，放 Mixamo 导出的 FBX：第一个 With Skin，其余动作 Without Skin。
2. 写 `rig.json`：`{"files":["mage.fbx","Idle.fbx","Running.fbx",...],"height":1.85,"runSpeed":4.6}`。
   动作按文件名自动识别：idle / run / walk / 1H…Attack(cast) / 2H…Area(cast2) / React(hit) / Dying(die) / Zombie Attack(attack)；
   认不出的用 `"clips":{"cast":"文件名"}` 指定。
3. 在 `models/index.json` 的 `hero` 列表最前面加上 `<id>`。
4. 缺的单次动作（施法、受击、死亡）会用程序化骨骼姿态补位。
