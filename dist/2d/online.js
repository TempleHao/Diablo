/* 归墟 · 在线账号与云存档（Supabase，直接调用它的 REST 接口，不依赖第三方脚本）。
 *
 * 账号：账号名 + 密码。Supabase 只认邮箱，所以账号名映射成「账号名@players.guixu.game」，玩家看不到。
 * 存档：CloudStore 继承 LocalStore，读写先落到本机缓存（按账号隔离），再在后台合并上传，
 *       所以游戏里的保存仍是同步的、断网也能玩；重新登录时按 updated 时间合并（新的为准）。
 * 测试员：players.is_tester 只能在数据库里设置，玩家自己改不了；只有测试员能看到 GM 面板。
 */
import {SUPABASE_URL,SUPABASE_ANON_KEY} from './online-config.js';
import {LocalStore,ROSTER_KEY} from './storage.js';

export const onlineEnabled=()=>!!(SUPABASE_URL&&SUPABASE_ANON_KEY);
const SESSION_KEY='guixu-session-v1';
const EMAIL_DOMAIN='players.guixu.game';
export const USERNAME_RE=/^[A-Za-z0-9_]{3,16}$/;
const toEmail=u=>u.toLowerCase()+'@'+EMAIL_DOMAIN;

/** 本机缓存：给每个账号一个独立的 localStorage 前缀，LocalStore 照常使用。 */
export class PrefixedStorage{
  constructor(base,prefix){this.b=base;this.p=prefix;}
  getItem(k){return this.b.getItem(this.p+k);}
  setItem(k,v){this.b.setItem(this.p+k,v);}
  removeItem(k){this.b.removeItem(this.p+k);}
  _keys(){const out=[];for(let i=0;i<this.b.length;i++){const k=this.b.key(i);if(k&&k.startsWith(this.p))out.push(k.slice(this.p.length));}return out;}
  get length(){return this._keys().length;}
  key(i){return this._keys()[i]??null;}
}

// ───── 底层请求 ─────
async function api(path,{method='GET',body,token,prefer,keepalive}={}){
  const headers={apikey:SUPABASE_ANON_KEY,'Content-Type':'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  if(prefer)headers.Prefer=prefer;
  let res;
  try{res=await fetch(SUPABASE_URL+path,{method,headers,body:body==null?undefined:JSON.stringify(body),keepalive});}
  catch{throw new Error('网络连接失败，请稍后再试');}
  const text=await res.text();let data=null;try{data=text?JSON.parse(text):null;}catch{data=text;}
  if(!res.ok){
    const msg=(data&&(data.msg||data.error_description||data.message||data.error))||('HTTP '+res.status);
    throw new Error(translate(String(msg)));
  }
  return data;
}
function translate(m){
  if(/Invalid login credentials/i.test(m))return '账号或密码不正确';
  if(/already registered|already exists|User already/i.test(m))return '这个账号名已被注册';
  if(/Password should be at least/i.test(m))return '密码至少 6 位';
  if(/rate limit|too many/i.test(m))return '操作太频繁，请稍后再试';
  if(/Email not confirmed/i.test(m))return '账号未确认（请在 Supabase 后台关闭「Confirm email」）';
  if(/JWT expired/i.test(m))return '登录已过期，请重新登录';
  return m;
}

// ───── 会话 ─────
export class Session{
  constructor(){this.s=null;try{this.s=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{}}
  get user(){return this.s?.user||null;}
  get username(){return this.s?.username||null;}
  get isTester(){return !!this.s?.isTester;}
  _save(){try{localStorage.setItem(SESSION_KEY,JSON.stringify(this.s));}catch{}}
  async _apply(data,username){
    this.s={access:data.access_token,refresh:data.refresh_token,expires:Date.now()+(data.expires_in||3600)*1000,user:{id:data.user.id},username};
    // 读玩家资料（账号名、是否测试员）
    try{const p=await api('/rest/v1/players?select=username,is_tester&id=eq.'+data.user.id,{token:this.s.access});
      if(p?.[0]){this.s.username=p[0].username;this.s.isTester=!!p[0].is_tester;}}catch{}
    this._save();return this;
  }
  async signUp(username,password){
    if(!USERNAME_RE.test(username))throw new Error('账号名 3–16 位，只能用字母、数字、下划线');
    if(String(password).length<6)throw new Error('密码至少 6 位');
    const d=await api('/auth/v1/signup',{method:'POST',body:{email:toEmail(username),password,data:{username}}});
    if(!d?.access_token)throw new Error('注册成功，但需要邮箱确认（请在 Supabase 后台关闭「Confirm email」）');
    return this._apply(d,username);
  }
  async signIn(username,password){
    if(!USERNAME_RE.test(username))throw new Error('账号名 3–16 位，只能用字母、数字、下划线');
    const d=await api('/auth/v1/token?grant_type=password',{method:'POST',body:{email:toEmail(username),password}});
    return this._apply(d,username);
  }
  async token(){
    if(!this.s)throw new Error('未登录');
    if(Date.now()<this.s.expires-60000)return this.s.access;
    const d=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:this.s.refresh}});
    await this._apply(d,this.s.username);return this.s.access;
  }
  async restore(){if(!this.s)return null;try{await this.token();await this._apply({access_token:this.s.access,refresh_token:this.s.refresh,expires_in:(this.s.expires-Date.now())/1000,user:this.s.user},this.s.username);return this;}catch{this.signOut();return null;}}
  signOut(){const t=this.s?.access;this.s=null;try{localStorage.removeItem(SESSION_KEY);}catch{}if(t)api('/auth/v1/logout',{method:'POST',token:t}).catch(()=>{});}
}

/** 云存档仓库：本机缓存 + 后台上传。接口与 LocalStore 相同（游戏代码不用改）。 */
export class CloudStore extends LocalStore{
  constructor(session){
    super(new PrefixedStorage(globalThis.localStorage,'guixu-acct:'+session.user.id+':'));
    this.kind='cloud';this.session=session;this.dirty=new Set();this.stashDirty=false;this.timer=0;this.status='synced';this.onStatus=null;
    addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')this.flush(true);});
    addEventListener('pagehide',()=>this.flush(true));
  }
  migrateLegacy(){return null;}
  _mark(id){if(id)this.dirty.add(id);this._schedule();}
  _schedule(){clearTimeout(this.timer);this._setStatus('pending');this.timer=setTimeout(()=>this.flush(),3000);}
  _setStatus(s){this.status=s;this.onStatus?.(s);}
  save(id,profile){const ok=super.save(id,profile);const r=this.roster(),c=r.chars.find(x=>x.id===id);if(c){c.updated=Date.now();this._saveRoster(r);}this._mark(id);return ok;}
  create(name,cls,profile){const r=super.create(name,cls,profile);if(r.id)this._mark(r.id);return r;}
  remove(id){const ok=super.remove(id);if(ok)this._delete(id);return ok;}
  saveStash(items){const ok=super.saveStash(items);this.stashDirty=true;this._schedule();return ok;}
  async _delete(id){try{const t=await this.session.token();await api('/rest/v1/characters?id=eq.'+encodeURIComponent(id),{method:'DELETE',token:t});}catch(e){this._setStatus('error');}}
  /** 上传有改动的角色和共享仓库。keepalive：页面关闭时也尽量发出去。 */
  async flush(keepalive=false){
    clearTimeout(this.timer);
    if(!this.dirty.size&&!this.stashDirty)return;
    const ids=[...this.dirty];this.dirty.clear();const stash=this.stashDirty;this.stashDirty=false;
    try{
      const t=await this.session.token(),r=this.roster(),rows=[];
      for(const id of ids){const c=r.chars.find(x=>x.id===id),data=this.load(id);if(!c||!data)continue;
        rows.push({id,owner:this.session.user.id,name:c.name,cls:c.cls,level:c.level|0,difficulty:c.difficulty|0,data,updated_at:new Date(c.updated||Date.now()).toISOString()});}
      if(rows.length)await api('/rest/v1/characters?on_conflict=id',{method:'POST',body:rows,token:t,prefer:'resolution=merge-duplicates,return=minimal',keepalive});
      if(stash)await api('/rest/v1/stashes?on_conflict=owner',{method:'POST',body:[{owner:this.session.user.id,items:r.stash,updated_at:new Date().toISOString()}],token:t,prefer:'resolution=merge-duplicates,return=minimal',keepalive});
      this._setStatus('synced');
    }catch(e){for(const id of ids)this.dirty.add(id);if(stash)this.stashDirty=true;this._setStatus('error');if(!keepalive)this.timer=setTimeout(()=>this.flush(),15000);}
  }
  /** 登录后拉取服务器存档，与本机缓存按更新时间合并。 */
  async pull(){
    const t=await this.session.token();
    const [chars,stash]=await Promise.all([
      api('/rest/v1/characters?select=id,name,cls,level,difficulty,data,updated_at&order=updated_at.asc',{token:t}),
      api('/rest/v1/stashes?select=items,updated_at',{token:t})]);
    const r=this.roster(),seen=new Set();
    for(const row of chars||[]){
      seen.add(row.id);const remote=Date.parse(row.updated_at)||0,local=r.chars.find(c=>c.id===row.id);
      if(local&&(local.updated||0)>remote+1000){this.dirty.add(row.id);continue;}   // 本机更新（离线玩过）→ 上传
      this.s.setItem(ROSTER_KEY+':'+row.id,JSON.stringify(row.data));
      const sum={id:row.id,name:row.name,cls:row.cls,level:row.level,difficulty:row.difficulty,created:local?.created||remote,updated:remote};
      if(local)Object.assign(local,sum);else r.chars.push(sum);
    }
    for(const c of r.chars)if(!seen.has(c.id))this.dirty.add(c.id);                // 只在本机的 → 上传
    if(stash?.[0]&&Array.isArray(stash[0].items))r.stash=stash[0].items;
    if(!r.chars.some(c=>c.id===r.active))r.active=r.chars[0]?.id||null;
    this._saveRoster(r);
    if(this.dirty.size)this.flush();
    this._setStatus('synced');
  }
}
