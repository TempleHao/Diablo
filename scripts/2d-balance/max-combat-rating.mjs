/* 满配战力上限估算（v1.4）：每个职业 × 每个流派，100 级、地狱最终图，每个部位随机生成 N 件 100 级传奇 / 暗金 / 套装（本职业能穿的），
 * 全部淬炼一次，每部位按单件试穿战力留前十几件，再用游戏的一键换装 + 巅峰天赋贪心分配求最高战力。
 * 用法：node scripts/2d-balance/max-combat-rating.mjs [每部位每品质件数=2500] [随机种子=1234]
 * 结果有随机波动（N=2500 时约 ±4%），比较职业时用两三个种子取平均。 */
const R=new URL('../../dist/2d/',import.meta.url).href;
const S=await import(R+'systems.js'),C=await import(R+'core.js'),K=await import(R+'crafting.js');
const N=+process.argv[2]||2500,SEED=+process.argv[3]||1234;
const SLOTS=['weapon','offhand','head','shoulders','robe','gloves','belt','boots','amulet','ring1'];
const out={};const BB=await import(R+'builds.js');
for(const cls0 of S.CLASS_IDS)for(const bld of BB.buildsOf(cls0)){const cls=cls0;
  const rng=C.mulberry32(SEED+cls.length);
  const p=C.freshSave();p.heroClass=cls;p.level=100;p.difficulty=2;p.region=8;p.gold=1e9;
  p.materials=Object.fromEntries(Object.keys(K.MATERIALS).map(k=>[k,1e9]));
  p.inventory=[];p.equipped=Object.fromEntries(Object.keys(p.equipped).map(k=>[k,null]));p.paragon={};p.builds={[cls]:bld.id};
  let id=0;const pool={};
  for(const slot of SLOTS){pool[slot]=[];for(const force of ['unique','legendary','set'])for(let i=0;i<N;i++){
    const it=C.normalizeItem?null:null;const x=S.makeLoot(rng,100,'i'+(id++),{cls,slot,force,strict:true,source:'boss',difficulty:2});if(S.canUseItem(x,cls))pool[slot].push(x);}}
  // 每件先淬炼一次（第一条词缀 +35%）
  const temp=x=>{p.inventory=[x];return K.temper(p,x.id)?p.inventory.find(i=>i.id===x.id):x;};
  for(const slot of SLOTS)pool[slot]=pool[slot].map(temp);
  // 初步：所有候选一起 smartEquip 太慢，按「单件试穿后的战力」每部位留前 14
  p.inventory=[];
  const keep=[];
  const base=()=>C.combatRating(p);
  for(const slot of SLOTS){
    const scored=pool[slot].map(x=>{const q={...p,inventory:[x],equipped:{...p.equipped}};C.equip(q,x.id,slot==='ring1'?'ring1':null);return [C.combatRating(q),x];}).sort((a,b)=>b[0]-a[0]);
    keep.push(...scored.slice(0,slot==='ring1'?20:14).map(s=>s[1]));
  }
  p.inventory=keep;
  for(let round=0;round<3;round++){
    C.smartEquip(p);
    // 巅峰天赋：40 点，每点给提升最大的一项
    p.paragon={};for(let k=0;k<S.paragonPoints(100);k++){let best=null,bv=-1;for(const key of Object.keys(S.PARAGON)){if((p.paragon[key]||0)>=S.PARAGON[key].max)continue;p.paragon[key]=(p.paragon[key]||0)+1;const v=C.combatRating(p);p.paragon[key]--;if(!p.paragon[key])delete p.paragon[key];if(v>bv){bv=v;best=key;}}if(!best)break;p.paragon[best]=(p.paragon[best]||0)+1;}
  }
  const hell=C.combatRating(p);
  const q={...p,difficulty:0,region:0};const normal=C.combatRating(q);
  const st=C.stats(p);
  const w=p.inventory.find(i=>i.id===p.equipped.weapon),o=p.inventory.find(i=>i.id===p.equipped.offhand);
  const off=st.power*(1+(st.dmgPct||0)/100)*(st.proficient?1.15:.85)*(1+st.crit/100*st.critDmg/100)*(1+st.haste/100)*(1+.12*(st.classSkill||0));
  const mlvl=100,res=(st.resistFire+st.resistCold+st.resistDark)/3,def=st.hp/(1-Math.min(.75,st.armor/(st.armor+70+12*mlvl)))*(1+Math.max(-50,res)/200)*(1+(st.regen||0)/100);
  if(!out[cls]||out[cls].hell<hell)out[cls]={hell,build:bld.id};
  const B=(await import(R+'builds.js')).buildById(cls,p.builds?.[cls]);const wts=B?.weights||{};let ew=0,ev=0;for(const k of ['fire','cold','lightning','physical','poison','holy','shadow']){ew+=wts[k]||0;ev+=(wts[k]||0)*(st[k]||0);}const elem=ew?ev/ew:0;
  let pw=0;for(const id of Object.values(p.equipped)){const it=p.inventory.find(i=>i.id===id);if(it)pw+=S.itemPowers(it).length;}
  console.log((cls+'/'+bld.id).padEnd(22),'CR',hell,'| elem',Math.round(elem),'powers',pw,'cdr',st.cdr,'regen',Math.round(st.regen),'res',Math.round(res),'def',Math.round(def),'| power',st.power,'dmg%',st.dmgPct|0,'crit',st.crit,'critDmg',st.critDmg,'haste',st.haste,'skill',st.classSkill,'| hp',st.hp,'armor',st.armor,'| wpn',S.catalogEntry(w)?.sub,w?.hands,'wpnPower',w?.power,'off',S.catalogEntry(o)?.sub,'| offScore',Math.round(off));
}

const v=Object.values(out).map(o=>o.hell);console.log('spread max/min',(Math.max(...v)/Math.min(...v)).toFixed(2));
