// 生成 docs/2D-BALANCE.md：node scripts/2d-balance/report.mjs
import {writeFileSync} from 'node:fs';
import {report} from '../../dist/2d/balance.js';
import {CLASSES} from '../../dist/2d/classes.js';
import {TIER,MONSTERS} from '../../dist/2d/monsters.js';
import {affixMax,AFFIXES} from '../../dist/2d/systems.js';
const rows=report(),L=['# 余烬纪事 2D · 数值平衡说明（v0.6）','',
'本文件由 `scripts/2d-balance/report.mjs` 根据游戏里实际使用的模型（`dist/2d/balance.js`）生成，改数值后重新运行即可更新。','',
'## 1. 技能伤害预算','','所有伤害以角色的攻击力/法术强度 **P** 为单位（技能等级 0，不含装备加成）。','',
'| 类型 | 规则 |','|---|---|',
'| 普通攻击 | 每秒 2.2P，不耗资源；随武器攻速变化 |',
'| 主力技能（冷却 ≤ 1.2 秒） | 每秒 3.0P（单次 = 3.0 × 冷却，冷却至少按 0.35 秒算） |',
'| 爆发技能（冷却 > 1.2 秒） | 单次 3.6 + 1.0 ×（冷却 − 1.2），与主力技能叠加，所以折算每秒较低 |',
'| 范围系数 | 单体 1.0 · 穿透/小范围 0.85 · 中范围 0.7 · 大范围 0.6（打得越多，单人伤害越低） |',
'| 控制为主的技能 | 眩晕 ≥ 1.2 秒、冻结 ≥ 1.5 秒、强击退、恐惧、骨墙：再 × 0.5 |',
'| 召唤 | 满编时合计每秒 1.8P（单只大型随从 1.3P） |',
'| 陷阱/图腾 | 满编时合计每秒 2.0P |',
'| 伤害光环 | 对范围内每个敌人每秒 0.8P |','',
'每个技能先按设计数值估算，再乘以系数 bal 对齐预算（bal 限制在 0.3–4）。技能等级每级 +12% 伤害。','',
'| 平均主力技能每秒伤害（P） | '+Object.keys(CLASSES).map(c=>CLASSES[c].name).join(' | ')+' |','|---|'+Object.keys(CLASSES).map(()=>'---').join('|')+'|',
'| 数值 | '+Object.keys(CLASSES).map(c=>{const v=rows.filter(r=>r.cls===c&&r.type==='burst'&&r.cd<=1.2).map(r=>r.dps);return (v.reduce((a,b)=>a+b,0)/v.length).toFixed(2);}).join(' | ')+' |',''];
for(const c of Object.keys(CLASSES)){
  L.push('### '+CLASSES[c].name,'','| 技能 | 类型 | 范围 | 冷却 | 消耗 | 原始估算 | 系数 | 单次 | 每秒 |','|---|---|---|---|---|---|---|---|---|');
  for(const r of rows.filter(r=>r.cls===c&&r.type!=='none'))L.push(`| ${r.name} | ${({basic:'普攻',burst:'伤害',army:'召唤/陷阱',aura:'光环'})[r.type]} | ${({single:'单体',pierce:'穿透',mid:'中',big:'大'})[r.aoe]} | ${r.cd} | ${r.mana} | ${r.raw} | ${r.bal} | ${r.perCast} | ${r.dps} |`);
  L.push('');
}
L.push('## 2. 职业基础','','| 职业 | 生命 | 每级生命 | 资源 | 护甲 | 暴击 | 移速 |','|---|---|---|---|---|---|---|');
for(const [k,c] of Object.entries(CLASSES))L.push(`| ${c.name} | ${c.hp} | ${c.hpLv} | ${c.mana} ${c.resource} | ${c.armor} | +${c.crit}% | ${c.speed} |`);
L.push('','近战职业生命和护甲更高，因为他们要贴身作战；施法职业靠射程与控制。装备本职业擅长的武器伤害 +15%。','',
'## 3. 装备','','- 武器强度 =（6 + 2.5 × 物品等级）×（1 + 0.27 × 品质）× 双手 1.4 ÷ √攻速。慢武器单次更痛、快武器出手更多，普攻每秒伤害基本一致。',
'- 词缀成长：生命、法力、护甲、强度、回复、吸血等固定数值随物品等级线性成长（每级 +5.5%）；暴击、增伤、抗性、攻速、移速等百分比成长平缓（60 级 +70%），避免堆爆。',
'- 品质对词缀数值的加成：普通/魔法 ×1.00，史诗 ×1.08，传奇 ×1.16，暗金 ×1.25；词条数量：魔法 1–2、史诗 2–4、传奇 3–5、暗金 4–5。','',
'| 词缀 | 1 级魔法最大值 | 30 级史诗 | 60 级暗金 |','|---|---|---|---|');
for(const k of ['power','hp','armor','crit','critDmg','haste','fire','resistFire','lifesteal'])L.push(`| ${AFFIXES[k].name} | ${affixMax(k,1,1)} | ${affixMax(k,30,2)} | ${affixMax(k,60,4)} |`);
L.push('','## 4. 怪物','','怪物等级 = 角色等级 + 每两次净化 1 级。生命 = 基础 × 种类倍率 ×（1 + 0.16 ×（等级 − 1））×（1 + 0.06 × 净化次数）；伤害 = 基础 × 种类倍率 ×（1 + 0.085 ×（等级 − 1））。','',
'| 档位 | 基础生命 | 基础伤害 | 移速 | 攻击间隔 | 经验 | 数量 |','|---|---|---|---|---|---|---|');
for(const [k,t] of Object.entries(TIER))L.push(`| ${({normal:'普通',caster:'远程',elite:'精英',boss:'首领'})[k]} | ${t.hp} | ${t.dmg} | ${t.speed} | ${t.attack}s | ${t.xp} | ${Object.values(MONSTERS).filter(m=>m.tier===k).length} |`);
L.push('','所有近战普攻都有 0.22–0.5 秒的蓄力预警（身体后仰、泛起属性色），远程施法有 0.4–0.55 秒手上聚光，首领的冲锋、震地、落雷会在地上画出范围，给玩家走位和闪现的时间。','');
writeFileSync('docs/2D-BALANCE.md',L.join('\n'));console.log('docs/2D-BALANCE.md',L.length,'lines');
