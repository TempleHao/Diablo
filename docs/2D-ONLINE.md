# 2D 角色存档与在线版接入（v0.7）

v0.7 起 2D 版改成「一个账号、多个角色」：角色选择界面列出所有角色，每个角色职业固定，等级、装备、技能、难度进度各自独立；另有一个所有角色共用的 **共享仓库**（40 格）。

现在数据仍保存在浏览器里（按设备识别）。所有读写都经过 `dist/2d/storage.js` 的仓库对象，游戏代码不直接碰 `localStorage`。上线可登录版时，只需要换一个实现同样接口的仓库。

## 当前（本机）数据布局

| localStorage 键 | 内容 |
|---|---|
| `ember-chronicles-2d-roster-v1` | `{version, active, migrated, chars:[{id,name,cls,level,difficulty,created,updated}], stash:[item…]}` |
| `ember-chronicles-2d-roster-v1:<角色ID>` | 该角色完整存档（`core.js` 的 profile，读档时经 `sanitizeSave` 清洗） |
| `ember-chronicles-2d-v1` | 旧版单存档。首次打开 v0.7 时自动迁移成第一个角色（名字「持灯者」，职业沿用旧存档当前职业）；原数据保留不删 |

## 仓库接口（`LocalStore`）

```js
store.migrateLegacy()        // 旧存档 → 第一个角色（只执行一次）
store.list()                 // [{id,name,cls,level,difficulty,created,updated}]
store.active() / setActive(id)
store.load(id)               // 角色完整存档（未清洗）
store.save(id, profile)      // 保存并更新列表摘要
store.create(name, cls, profile) → {id} | {error}
store.remove(id)
store.stash() / saveStash(items)
store.kind                   // 'local'；在线版为 'remote'
```

接口是同步的。在线版建议做法：

1. **本地缓存 + 后台同步**：`RemoteStore` 继承同样的接口，读写先落本地缓存（沿用 `LocalStore` 的实现），同时把变更排队，按 2–5 秒节流 PUT 到服务端；进入角色选择界面时拉取一次列表。这样游戏循环里的 `persist()` 不需要改成异步。
2. **冲突**：每个角色存档带 `updated` 时间戳与版本号；服务端拒绝旧版本覆盖（与 3D 版 `save.js` 的修订号做法一致）。
3. **防作弊**：客户端仍是单机逻辑，服务端至少要对上传的存档跑一遍 `sanitizeSave`/`normalizeItem` 同样的清洗规则（这两个函数没有 DOM 依赖，可直接在 Node 里用）。
4. **迁移**：登录后若本机有角色、账号里没有，提示「上传本机角色」；上传后本机数据保留作为离线缓存。

服务端、账号体系和费用不在本次范围内（按项目约定，不自动开通任何付费服务）。

## 建议的服务端最小 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/2d/characters` | 角色列表（摘要） |
| GET | `/api/2d/characters/:id` | 角色完整存档 |
| PUT | `/api/2d/characters/:id` | 保存（带 `If-Match` 版本号） |
| POST | `/api/2d/characters` | 新建 |
| DELETE | `/api/2d/characters/:id` | 删除 |
| GET/PUT | `/api/2d/stash` | 共享仓库 |
