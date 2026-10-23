/* 归墟 2D · 角色存档仓库（v0.7）
 *
 * 和《暗黑破坏神 2》一样，一个账号下有多个角色：每个角色职业固定，等级、装备、技能各自独立；
 * 另有一个所有角色共用的「共享仓库」，用来把别的职业的装备转给对应角色。
 *
 * 现在是「本机存档」：LocalStore 把数据放在浏览器 localStorage 里（按设备识别）。
 * 以后上线可登录版时，只要实现同样接口的远端仓库（例如 RemoteStore：list/load/save/create/remove/stash 走 HTTPS），
 * 游戏代码不用改；接口约定与迁移方案见 docs/2D-ONLINE.md。
 *
 * 数据布局（本机）：
 *   ember-chronicles-2d-roster-v1            → {version, active, chars:[{id,name,cls,level,difficulty,created,updated}], stash:[item…]}
 *   ember-chronicles-2d-roster-v1:<角色ID>    → 该角色完整存档（core.js 的 profile，读档时用 sanitizeSave 清洗）
 *   ember-chronicles-2d-v1（旧版单存档）      → 首次打开 v0.7 时自动迁移成第一个角色，原数据保留不删。
 */
export const ROSTER_KEY='ember-chronicles-2d-roster-v1';
export const LEGACY_KEY='ember-chronicles-2d-v1';
export const MAX_CHARACTERS=12;
export const STASH_SIZE=40;
/** 数据纪元：改这个值 = 所有玩家的 2D 存档（角色、共享仓库、旧版单存档）在下次打开时清零一次。
 *  v0.7.2（2026-10-20）：按测试需要全部清零，从头开始。只清 2D（ember-chronicles-2d*），3D 版存档不动。 */
export const DATA_EPOCH='2026-10-20-reset';
export const EPOCH_KEY='ember-chronicles-2d-epoch';
const PREFIX='ember-chronicles-2d';
const now=()=>Date.now();
const newId=()=>'c'+now().toString(36)+Math.floor(Math.random()*1e6).toString(36);
/** 角色名：1-12 个字符，去掉首尾空白与控制字符。 */
export function cleanName(name){
  const s=String(name??'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,12);
  return s;
}
export class LocalStore{
  constructor(storage=globalThis.localStorage){this.s=storage;this.kind='local';this.wiped=this._checkEpoch();}
  /** 纪元不一致时清空本机全部 2D 数据，返回是否清空过。 */
  _checkEpoch(){
    try{
      if(!this.s||this.s.getItem(EPOCH_KEY)===DATA_EPOCH)return false;
      const keys=[];for(let i=0;i<this.s.length;i++){const k=this.s.key(i);if(k&&k.startsWith(PREFIX))keys.push(k);}
      for(const k of keys)this.s.removeItem(k);
      this.s.setItem(EPOCH_KEY,DATA_EPOCH);
      return keys.length>0;
    }catch{return false;}
  }
  _get(key){try{const v=this.s?.getItem(key);return v?JSON.parse(v):null;}catch{return null;}}
  _set(key,val){try{this.s?.setItem(key,JSON.stringify(val));return true;}catch{return false;}}
  _del(key){try{this.s?.removeItem(key);}catch{}}
  roster(){
    let r=this._get(ROSTER_KEY);
    if(!r||typeof r!=='object'||!Array.isArray(r.chars))r={version:1,active:null,chars:[],stash:[]};
    r.chars=r.chars.filter(c=>c&&typeof c.id==='string'&&c.id.length<40).slice(0,MAX_CHARACTERS);
    if(!Array.isArray(r.stash))r.stash=[];
    return r;
  }
  _saveRoster(r){return this._set(ROSTER_KEY,r);}
  /** 旧版单存档 → 第一个角色（只迁移一次；原数据保留）。返回新角色 ID 或 null。 */
  migrateLegacy(){
    const r=this.roster();if(r.chars.length||r.migrated)return null;
    const old=this._get(LEGACY_KEY);r.migrated=true;
    if(!old||typeof old!=='object'){this._saveRoster(r);return null;}
    const id=newId(),name=cleanName(old.name)||'持灯者';
    old.name=name;
    this._set(ROSTER_KEY+':'+id,old);
    r.chars.push({id,name,cls:old.heroClass||'mage',level:old.level|0||1,difficulty:old.difficulty|0,created:now(),updated:now()});
    r.active=id;this._saveRoster(r);return id;
  }
  list(){return this.roster().chars.map(c=>({...c}));}
  active(){const r=this.roster();return r.chars.some(c=>c.id===r.active)?r.active:null;}
  setActive(id){const r=this.roster();if(!r.chars.some(c=>c.id===id))return false;r.active=id;return this._saveRoster(r);}
  load(id){return this._get(ROSTER_KEY+':'+id);}
  /** 保存角色存档并更新角色列表里的摘要（等级、难度）。 */
  save(id,profile){
    const ok=this._set(ROSTER_KEY+':'+id,profile);
    const r=this.roster(),c=r.chars.find(x=>x.id===id);
    if(c&&(c.level!==profile.level||c.difficulty!==profile.difficulty||c.name!==profile.name)){c.level=profile.level;c.difficulty=profile.difficulty|0;c.name=profile.name||c.name;c.updated=now();this._saveRoster(r);}
    return ok;
  }
  create(name,cls,profile){
    const r=this.roster();name=cleanName(name);
    if(!name)return {error:'请输入角色名'};
    if(r.chars.length>=MAX_CHARACTERS)return {error:'角色已满（最多 '+MAX_CHARACTERS+' 个）'};
    if(r.chars.some(c=>c.name===name))return {error:'已有同名角色'};
    const id=newId();profile.name=name;profile.heroClass=cls;
    this._set(ROSTER_KEY+':'+id,profile);
    r.chars.push({id,name,cls,level:profile.level|0||1,difficulty:0,created:now(),updated:now()});
    r.active=id;this._saveRoster(r);return {id};
  }
  remove(id){
    const r=this.roster(),i=r.chars.findIndex(c=>c.id===id);if(i<0)return false;
    r.chars.splice(i,1);if(r.active===id)r.active=r.chars[0]?.id||null;
    this._del(ROSTER_KEY+':'+id);return this._saveRoster(r);
  }
  stash(){return this.roster().stash;}
  saveStash(items){const r=this.roster();r.stash=items.slice(0,STASH_SIZE);return this._saveRoster(r);}
}
/** 内存版仓库：给测试与「无法保存」的浏览器用。 */
export class MemoryStorage{
  constructor(){this.m=new Map();}
  getItem(k){return this.m.has(k)?this.m.get(k):null;}
  setItem(k,v){this.m.set(k,String(v));}
  removeItem(k){this.m.delete(k);}
  get length(){return this.m.size;}
  key(i){return [...this.m.keys()][i]??null;}
}
