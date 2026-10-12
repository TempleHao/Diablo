# ART-01 美术预览：实际验证与未达目标

候选版本0.3.0-preview.1，日期2026-10-12；策划仍为1.0。此记录是人物与代表地窟切片，不代表整个游戏美术已达到D2R/D4质量。首次美术切片技术验证已完成；发布提交和Pages结果另记于PROJECT-STATE及JSON，不能把本页验证通过等同线上部署成功。

## 产物与检查

- 新连续人体、真实皮肤、眼睛、衣物/皮革和骨骼法师；细节与来源见 [ART-CHARACTER](ART-CHARACTER.md)。旧模型保留。
- 地窟错缝缺角石板、风化石墙PBR、尖拱/断拱、浮雕/石像、灰污潮迹和柔边火焰；接口/通路保持，见 [ART-ENVIRONMENT](ART-ENVIRONMENT.md)。
- 接触遮蔽/HDR输出与反射照明；人物全身/面部取景、拖转与滚轮/双指缩放。修复负预览时间步长、多触点释放与模态输入残留。
- `npm run check`通过：7运行JS语法、旧资产检查、新GLB/所有蒙皮权重与关节范围/内嵌贴图/三动作/面部挂点、14+12源文件哈希、61项存档测试。
- `git diff --check`通过。生成依赖实际为Blender4.3.2、环境贴图Pillow12.3.0/NumPy2.3.5；不保证任意旧版本Blender可以重建。

## 浏览器已测与当前待测

Headless Chromium与SwiftShader，本地HTTP服务使用待发布文件；不是实体手机。

- 桌面：模型加载200、Idle脊椎/头骨实际变化、键盘移动并Idle→Walk→Idle、冰霜扣蓝30及Cast肩臂变化、火球/闪现；人物暂停、拖转/滚轮、面部取景与非负预览时钟、resize适配；存档叠层/装备暂停与正确恢复已通过。
- 390×844：摇杆与冰霜双触点、松摇杆后保留火球触点并实际产生新投射物、松冰霜后继续移动、人物中释放摇杆后恢复Idle且不残留位移、拖转/捏合、人物/存档布局均通过。23项最终检查全部成功。两次早期失败来自QA结束触点/剩余触点混用；按当前Chromium实际DOM pointerup target与ID核对结束点，不调低断言。
- 原生人脸/全身/背面与游戏截图已产生，无pageerror/资源404/Shader警告。当前新填光截图、23项JSON证据已保存：[浏览器证据](qa/art-01-browser.json)、[桌面面部](screenshots/art-face-desktop.png)、[手机游戏](screenshots/art-gameplay-mobile.png)、[手机面部](screenshots/art-face-mobile.png)、[手机存档](screenshots/art-save-mobile.png)。两端game/hero/模型SHA一致，页面错误、console error、404及失败请求均为0。
- 本环境不能直接浏览github.io，线上URL浏览器回归未执行。Pages发布结果仅根据Actions的检查/上传/部署步骤确认。

## 资源成本与目标缺口

|项目|实际候选|策划起点/缺口|
|---|---:|---|
|角色三角面|40,966|超出LOD0 20k–35k；战斗LOD待制作|
|角色骨骼|163|超过首轮≤60；需精简无用面部/脚趾骨或建立战斗rig|
|角色材质/图像|9 / 20|尚未合图与降低材质切换|
|角色GLB|7,783,844字节|全部内嵌；实际网络/解码与缓存未在真机测量|
|环境全结构三角面|179,936|含实例总计，不是每帧可见数|
|环境真实点光/纹理|4 / 16|运行贴图2,581,320字节；真实GPU成本未测|

已有结构合批不能作为移动性能达标证据。头发、衣物裁剪/折褶/磨损、手与握杖动作、怪物造型和整场景构图仍有差距，现有怪物继续使用原型外观。目标不是用提交成功或多面数替代视觉验收。

## 复现

```sh
npm run check
npm run dev
# 打开 http://localhost:5173，开始游戏后进入 人物→全身/面部
```

存档schema仍为2，旧0.2.0与0.2.1角色继续使用；导入先预览/确认，失败不替换。完整策划不重建。下一工作是明确的ART-02角色精修与战斗LOD/rig、随后ART-03环境和怪物美术；用户美术目标未验收前不回到D1-02。

可选浏览器复现：安装 `playwright-core@1.64.0`（`npm install --no-save --package-lock=false playwright-core@1.64.0`），启动本地服务后另终端运行 `npm run check:art-browser`。`tests/art-browser-smoke.cjs`默认URL为5173、Chromium为/usr/bin/chromium，ART_QA_URL/ART_CHROMIUM_PATH/ART_QA_OUTPUT可覆盖。测试使用临时上下文，HTTP响应内注入只读快照，不向生产源码添加调试入口。本轮23项实际脚本通过；归入仓库时仅路径/loader/辅助代码收为单文件，已核对测试函数相同并做语法检查，未另重复完整回归。
