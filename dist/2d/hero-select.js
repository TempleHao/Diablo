/* 归墟 · 角色选择（v0.7，参照《暗黑破坏神 2》）
 *
 * 两个画面：
 *   角色列表：左侧是已有角色卡，中间是选中角色站在石台上的展示，右侧是信息、难度选择与「进入游戏」。
 *   创建角色：七位英雄并排站在石台上（手机端是一次一位的轮播），点选后右侧显示职业介绍、四项属性、代表技能，输入名字创建。
 * 角色数据通过 storage.js 的仓库读写（现在是本机存档，以后可换成在线账号）。
 */
import {SELECT_ART} from './select-art.js';
// v0.8：选角用高清立绘（7 职业 × 站立 / 戒备 / 攻击 / 施法），不再用游戏内的小像素图放大
const selImg=new Image();let selReady=false;selImg.onload=()=>{selReady=true;};selImg.src=new URL('./art/select-heroes.webp',import.meta.url).href;
import {CLASSES,SKILLS} from './systems.js';
import {DIFFICULTIES,difficultyUnlocked} from './progression.js';
import {skillIcon} from './ui-icons.js';
import {cleanName,MAX_CHARACTERS} from './storage.js';

export const CLASS_ORDER=['barbarian','amazon','assassin','paladin','necro','druid','mage'];
export const CLASS_INFO=Object.freeze({
  barbarian:{en:'BARBARIAN',color:'#ff7a3c',attr:[7,3,6,1],sig:['bar_whirl','bar_leap','bar_warcry','bar_battleorders'],
    desc:'来自北方高地的战士。挥舞双手巨斧，以旋风斩撕开敌阵，用战吼震慑群敌。'},
  amazon:{en:'AMAZON',color:'#ffd27a',attr:[3,6,4,3],sig:['ama_multi','ama_lightfury','ama_freezearrow','ama_valkyrie'],
    desc:'长矛与弓的猎手。标枪化作雷霆，箭矢落成暴雨，危急时召来女武神并肩作战。'},
  assassin:{en:'ASSASSIN',color:'#ff4a4a',attr:[4,6,3,3],sig:['asn_phoenix','asn_lightsentry','asn_shadowwarrior','asn_dragonflight'],
    desc:'行走于暗影中的刺客。爪刃连击蓄力爆发，布下闪电与死亡哨兵，召唤影子替身作战。'},
  paladin:{en:'PALADIN',color:'#ffd760',attr:[6,3,5,3],sig:['pal_hammer','pal_zeal','pal_fist','pal_holyshield'],
    desc:'圣光的骑士。以光环强化自身，盾牌守护己方，祝福之锤与天堂之拳审判邪恶。'},
  necro:{en:'NECROMANCER',color:'#b45cff',attr:[2,3,3,6],sig:['nec_bonespear','nec_skeleton','nec_corpse','nec_amplify'],
    desc:'骷髅、骨与诅咒的主宰。驱使亡者大军，以骨矛贯穿敌阵，用尸体爆炸清扫战场。'},
  druid:{en:'DRUID',color:'#66ff70',attr:[4,2,5,4],sig:['dru_tornado','dru_werewolf','dru_grizzly','dru_volcano'],
    desc:'荒野的守护者。呼唤火焰与风暴，化身狼人和熊人，召唤灰熊与狼群为伴。'},
  mage:{en:'SORCERESS',color:'#6fb6ff',attr:[2,3,2,7],sig:['fireball','frozenorb','chain','blackhole'],
    desc:'掌控元素之力，远离战场的毁灭者。火、冰、雷与奥术四系法术，闪现穿越墙壁。'}
});
const ATTR=['力量','敏捷','体力','精力'];
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
// 手机：竖屏（≤760 宽）或横屏（触屏且 ≤560 高）都用单人轮播布局；横屏另加 is-land 改成左右两栏
const mobile=()=>window.matchMedia('(max-width:760px), (max-height:560px) and (pointer:coarse)').matches;
const landscape=()=>mobile()&&window.matchMedia('(orientation:landscape)').matches;

/**
 * root：挂载节点；store：角色仓库；fresh(cls)：新角色存档；onEnter(id,difficulty)：进入游戏。
 */
export function createHeroSelect({root,store,fresh,onEnter}){
  let mode='list',pick='barbarian',selId=null,diff=0,raf=0,t0=performance.now(),open=false;
  const actors=Object.fromEntries(CLASS_ORDER.map(c=>[c,{x:0,y:0,cls:c,angle:0,moving:false,walk:0,cast:0,invuln:0,swing:null}]));
  root.className='hero-select';root.hidden=true;
  const bg=el('div','hs-bg');
  const title=el('div','hs-title');title.append(el('span','hs-title-text','选择你的英雄'),el('small',null,'七条道路 · 同一个黑暗世界'));
  const stage=el('div','hs-stage');
  const canvas=el('canvas','hs-canvas');canvas.setAttribute('aria-hidden','true');
  const plates=el('div','hs-plates');
  stage.append(canvas,plates);
  const side=el('aside','hs-side');
  const listBox=el('section','hs-list');
  const bottom=el('div','hs-bottom');
  const account=el('div','hs-account');
  const logo=el('img','hs-logo');logo.src=new URL('./art/logo-guixu.webp',import.meta.url).href;logo.alt='归墟 GUIXU';
  root.append(bg,title,logo,stage,listBox,side,bottom,account);
  const ctx=canvas.getContext('2d');

  function chars(){return store.list();}
  function selected(){return chars().find(c=>c.id===selId)||null;}

  // ───── 渲染 ─────
  function render(){
    root.dataset.mode=mode;root.classList.toggle('is-mobile',mobile());root.classList.toggle('is-land',landscape());
    plates.replaceChildren();stage.querySelector('.hs-carousel')?.remove();side.replaceChildren();listBox.replaceChildren();bottom.replaceChildren();account.replaceChildren();
    account.append(el('span','hs-account-dot'),el('span',null,store.kind==='local'?'本机存档 · 数据保存在当前浏览器':'在线账号'),el('small',null,'在线登录版开发中，届时可把本机角色上传到账号'));
    if(store.wiped)account.append(el('small','hs-wiped','· 测试数据已清零，从头开始'));
    if(mode==='create')renderCreate();else renderList();
  }
  function plate(cls,onClick,active){
    const b=el('button','hs-plate'+(active?' is-active':''));b.type='button';b.style.setProperty('--cc',CLASS_INFO[cls].color);
    b.append(el('span','hs-sigil','✦'),el('b',null,CLASSES[cls].name),el('small',null,CLASS_INFO[cls].en));
    b.onclick=onClick;b.setAttribute('aria-pressed',String(!!active));b.setAttribute('aria-label','选择 '+CLASSES[cls].name);
    return b;
  }
  function classPanel(cls){
    const C=CLASSES[cls],I=CLASS_INFO[cls],box=el('div','hs-info');box.style.setProperty('--cc',I.color);
    box.append(el('h2',null,C.name),el('small','hs-en',I.en+' · '+C.title),el('p','hs-desc',I.desc));
    const attrs=el('div','hs-attrs');
    I.attr.forEach((v,i)=>{const row=el('div','hs-attr');row.append(el('span',null,ATTR[i]));const bar=el('span','hs-bar');for(let k=0;k<7;k++)bar.append(el('i',k<v?'on':''));row.append(bar);attrs.append(row);});
    box.append(attrs);
    const trees=el('p','hs-trees','技能系：'+Object.values(C.trees).join(' · '));box.append(trees);
    const sig=el('div','hs-skills');
    for(const id of I.sig){const s=el('span','hs-skill');s.title=SKILLS[id]?.name||id;s.append(skillIcon(id,46),el('small',null,SKILLS[id]?.name||''));sig.append(s);}
    box.append(sig);
    return box;
  }
  function renderCreate(){
    const back=chars().length>0;
    title.querySelector('.hs-title-text').textContent='创建英雄';
    if(mobile()){
      const nav=el('div','hs-carousel');
      const prev=el('button','hs-arrow','‹'),next=el('button','hs-arrow','›');prev.type=next.type='button';
      prev.setAttribute('aria-label','上一个职业');next.setAttribute('aria-label','下一个职业');
      const step=d=>{const i=CLASS_ORDER.indexOf(pick);pick=CLASS_ORDER[(i+d+CLASS_ORDER.length)%CLASS_ORDER.length];render();};
      prev.onclick=()=>step(-1);next.onclick=()=>step(1);
      nav.append(prev,next);stage.append(nav);
      const thumbs=el('div','hs-thumbs');
      for(const c of CLASS_ORDER)thumbs.append(plate(c,()=>{pick=c;render();},c===pick));
      side.append(thumbs);
    }else{
      for(const c of CLASS_ORDER)plates.append(plate(c,()=>{pick=c;render();},c===pick));
      side.append(classPanel(pick));
    }
    const form=el('form','hs-form');
    const input=el('input');input.maxLength=12;input.placeholder='角色名（最多 12 字）';input.value=defaultName(pick);input.setAttribute('aria-label','角色名');
    const msg=el('small','hs-msg');
    form.append(input,msg);
    const create=el('button','primary hs-go','创建并进入 →');create.type='submit';form.append(create);
    form.onsubmit=e=>{
      e.preventDefault();
      const name=cleanName(input.value);
      const res=store.create(name,pick,fresh(pick));
      if(res.error){msg.textContent=res.error;return;}
      selId=res.id;diff=0;close();onEnter(res.id,0);
    };
    side.append(form);
    if(mobile())side.append(classPanel(pick));
    if(back){const b=el('button','hs-ghost','← 返回角色列表');b.type='button';b.onclick=()=>{mode='list';render();};bottom.append(b);}
  }
  function defaultName(cls){
    const base={barbarian:'北境战士',amazon:'苍穹猎手',assassin:'无声之刃',paladin:'晨曦骑士',necro:'骸骨低语',druid:'林间守望',mage:'星火术士'}[cls];
    const names=new Set(chars().map(c=>c.name));let n=base,k=2;while(names.has(n))n=base+(k++);return n;
  }
  function renderList(){
    title.querySelector('.hs-title-text').textContent='选择你的英雄';
    const list=chars();
    if(!list.length){mode='create';renderCreate();root.dataset.mode='create';return;}
    if(!list.some(c=>c.id===selId))selId=store.active()||list[0].id;
    const cur=selected();
    for(const c of list){
      const card=el('button','hs-card'+(c.id===selId?' is-active':''));card.type='button';card.style.setProperty('--cc',CLASS_INFO[c.cls]?.color||'#ccc');
      card.append(el('b',null,c.name),el('small',null,'LV '+c.level+' · '+(CLASSES[c.cls]?.name||c.cls)),el('span','hs-card-diff',DIFFICULTIES[c.difficulty|0]?.name||'普通'));
      card.onclick=()=>{selId=c.id;store.setActive(c.id);render();};
      card.ondblclick=()=>enter();
      listBox.append(card);
    }
    const add=el('button','hs-card hs-new','＋ 创建新英雄');add.type='button';add.disabled=list.length>=MAX_CHARACTERS;
    add.onclick=()=>{mode='create';pick=CLASS_ORDER[(list.length)%CLASS_ORDER.length];render();};listBox.append(add);
    // 右侧：角色信息与难度
    const raw=store.load(cur.id)||{};
    const info=el('div','hs-info');info.style.setProperty('--cc',CLASS_INFO[cur.cls]?.color||'#ccc');
    info.append(el('h2',null,cur.name),el('small','hs-en',(CLASSES[cur.cls]?.name||'')+' · '+(CLASS_INFO[cur.cls]?.en||'')+' · 等级 '+cur.level));
    const facts=el('dl','hs-facts');
    const kills=(raw.bossKills||[]).map(r=>Array.isArray(r)?r.filter(Boolean).length:0);
    for(const [k,v] of [['已净化',raw.clears|0],['金币',raw.gold|0],['背包',(raw.inventory?.length|0)+' 件'],['普通 / 噩梦 / 地狱 首领',(kills[0]|0)+' / '+(kills[1]|0)+' / '+(kills[2]|0)+'（共 9）']]){facts.append(el('dt',null,k),el('dd',null,String(v)));}
    info.append(facts);
    const pseudo={level:cur.level,bossKills:raw.bossKills&&Array.isArray(raw.bossKills[0])?raw.bossKills:[raw.bossKills||[]]};
    if(!difficultyUnlocked(pseudo,diff))diff=0;
    const dbox=el('div','hs-diffs');dbox.append(el('span','hs-diff-label','难度'));
    for(const D of DIFFICULTIES){
      const ok=difficultyUnlocked(pseudo,D.id),b=el('button','hs-diff'+(D.id===diff?' is-active':''),D.name+(ok?'':' 🔒'));b.type='button';b.disabled=!ok;
      b.title=ok?'怪物等级 '+D.area[0]+'–'+Math.min(100,D.cap)+'+':'需要 '+D.unlockLevel+' 级，或击败上一难度第 9 区首领';
      b.onclick=()=>{diff=D.id;render();};dbox.append(b);
    }
    info.append(dbox);
    const D=DIFFICULTIES[diff];
    info.append(el('p','hs-note',D.id===0?'普通：区域等级 1–36，怪物随你成长到 45 级。':D.id===1?'噩梦：区域等级 38–70，全部抗性 -20%，传奇掉率 ×1.3。':'地狱：区域等级 68–98（首领可达 100），全部抗性 -40%，传奇掉率 ×1.6。'));
    side.append(info);
    const go=el('button','primary hs-go','进入游戏 →');go.type='button';go.onclick=enter;
    const del=el('button','hs-ghost hs-danger','删除角色');del.type='button';
    del.onclick=()=>{if(!confirm('永久删除「'+cur.name+'」？装备与进度都会消失，无法恢复。（共享仓库里的物品会保留）'))return;store.remove(cur.id);selId=null;render();};
    side.append(go);bottom.append(del);
  }
  function enter(){const c=selected();if(!c)return;store.setActive(c.id);close();onEnter(c.id,diff);}

  // ───── 画布：石台 + 英雄 ─────
  function size(){
    const r=canvas.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);
    const w=Math.max(1,Math.round(r.width*d)),h=Math.max(1,Math.round(r.height*d));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    return {w:r.width,h:r.height,d};
  }
  function pedestal(x,y,r,color,active,t){
    ctx.save();
    if(active){
      const g=ctx.createRadialGradient(x,y,0,x,y,r*1.7);g.addColorStop(0,color+'66');g.addColorStop(1,color+'00');
      ctx.fillStyle=g;ctx.fillRect(x-r*1.8,y-r*1.4,r*3.6,r*2.4);
    }
    // 柱身
    ctx.fillStyle='#1b1714';ctx.fillRect(x-r,y,r*2,r*.55);
    ctx.fillStyle='#120f0d';ctx.beginPath();ctx.ellipse(x,y+r*.55,r,r*.28,0,0,Math.PI);ctx.fill();
    for(let k=-2;k<=2;k++){ctx.fillStyle='#2a231e';ctx.fillRect(x+k*r*.38-1,y+2,2,r*.5);}
    // 台面
    ctx.fillStyle='#3a312a';ctx.beginPath();ctx.ellipse(x,y,r,r*.28,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=active?color:'#5b4b3c';ctx.lineWidth=active?2:1.2;ctx.beginPath();ctx.ellipse(x,y,r*.82,r*.22,0,0,Math.PI*2);ctx.stroke();
    if(active){
      ctx.globalCompositeOperation='lighter';
      ctx.strokeStyle=color;ctx.globalAlpha=.55+.25*Math.sin(t*3);ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,y,r*.9,r*.25,0,0,Math.PI*2);ctx.stroke();
      // 上升的光点
      for(let k=0;k<14;k++){const p=((t*.35+k*.137)%1),px=x+Math.sin(k*12.9+t*.7)*r*.7,py=y-p*r*2.6;
        ctx.globalAlpha=(1-p)*.8;ctx.fillStyle=color;ctx.fillRect(px,py,2.2,2.2);}
    }
    ctx.restore();
  }
  // 立绘：脚底对齐；待机呼吸；选中后循环「戒备 → 攻击 → 施法 → 站立」，姿势之间淡入淡出
  const POSE_CYCLE=[[0,1.6],[1,.9],[2,1.1],[1,.5],[3,1.4]];
  function poseAt(t){const total=POSE_CYCLE.reduce((n,p)=>n+p[1],0);let k=t%total;for(const [i,[f,d]] of POSE_CYCLE.entries()){if(k<d)return {f,prev:POSE_CYCLE[(i+POSE_CYCLE.length-1)%POSE_CYCLE.length][0],q:Math.min(1,k/.18)};k-=d;}return {f:0,prev:0,q:1};}
  function drawArt(cls,fi,x,y,sc,alpha,breath){
    const r=SELECT_ART[cls]?.[fi];if(!r)return;
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.scale(sc,sc*(1+breath));
    ctx.imageSmoothingEnabled=sc<1;ctx.imageSmoothingQuality='high';
    ctx.drawImage(selImg,r[0],r[1],r[2],r[3],-r[4],-r[3],r[2],r[3]);ctx.restore();
  }
  function frame(now){
    if(!open)return;
    raf=requestAnimationFrame(frame);
    const t=(now-t0)/1000,{w,h,d}=size();
    ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);
    const show=mode==='create'?(mobile()?[pick]:CLASS_ORDER):[selected()?.cls||'mage'];
    const n=show.length,colW=w/n,platesOn=n>1;
    // 立绘站立高约 285 像素：多人时按列宽缩放，单人时按舞台高度
    const scale=n===1?Math.min(1.25,(h*.8)/290):Math.min(1.05,(h-130)/300,colW/150);
    show.forEach((cls,i)=>{
      const x=colW*(i+.5),y=platesOn?h-112:h*.88,active=n===1||cls===pick,color=CLASS_INFO[cls].color;
      pedestal(x,y+4,Math.min(colW*.4,95*scale),color,active,t);
      if(!selReady)return;
      const breath=Math.sin(t*2+i)*.008,a=actors[cls];
      if(active){
        if(a.selT==null)a.selT=t;
        const P=poseAt(t-a.selT),sc=scale*(n>1?1.1:1);
        if(P.q<1)drawArt(cls,P.prev,x,y,sc,1-P.q,breath);
        drawArt(cls,P.f,x,y,sc,P.q<1?P.q:1,breath);
        // 攻击 / 施法时脚下光圈更亮
        if(P.f>=2){ctx.save();ctx.globalCompositeOperation='lighter';const g=ctx.createRadialGradient(x,y,0,x,y,90*sc);g.addColorStop(0,color+'55');g.addColorStop(1,color+'00');ctx.fillStyle=g;ctx.fillRect(x-100*sc,y-60*sc,200*sc,90*sc);ctx.restore();}
      }else{
        a.selT=null;
        ctx.save();if('filter' in ctx)ctx.filter='brightness(.4) saturate(.5)';drawArt(cls,0,x,y,scale,1,breath);ctx.restore();
      }
    });
  }
  function close(){open=false;root.hidden=true;cancelAnimationFrame(raf);}
  function show(m){mode=m||(chars().length?'list':'create');open=true;root.hidden=false;render();cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);}
  window.addEventListener('resize',()=>{if(open)render();});
  return {show,close,get open(){return open;}};
}
