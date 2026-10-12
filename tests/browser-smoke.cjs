// Optional browser QA: install playwright-core@1.64.0 and provide Chromium.
// Only ephemeral browser contexts are seeded; production files are unchanged.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const URL = process.env.D1_QA_URL || 'http://127.0.0.1:5173';
const mode = process.argv[2] || 'final';
const screenshotDir = process.env.D1_QA_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'ember-mage-qa-'));
fs.mkdirSync(screenshotDir, {recursive:true});
const screenshots = path.join(screenshotDir, 'd1-qa-');
const legacy = {
  level: 3, xp: 2, clears: 1,
  items: [
    { id: 'legacy-ember', name: '旧版余烬秘杖', rarity: 2, power: 20 },
    { id: 'legacy-frost', name: '旧版寒霜法杖', rarity: 1, power: 11 }
  ],
  equipped: null
};
const results = { mode, url: URL, checks: [], errors: [], limitations: ['Headless Chromium desktop/mobile viewport only; no real mobile device or performance claim.'] };
let browser;
const check = (name, detail) => { results.checks.push({ name, detail }); console.log(`PASS ${name}: ${JSON.stringify(detail)}`); };

async function pageFor(options = {}, storage = null) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, ...options });
  if (storage) await context.addInitScript(({ origin, values }) => {
    if (location.origin !== origin) return;
    if (sessionStorage.getItem('d1-qa-seeded')) return;
    localStorage.clear();
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    sessionStorage.setItem('d1-qa-seeded', '1');
  }, { origin: new globalThis.URL(URL).origin, values: storage });
  const page = await context.newPage();
  page.on('pageerror', error => results.errors.push(error.message));
  // Read-only snapshots are appended to the HTTP response, never to a project file.
  await page.route('**/game.js', async route => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({ response, body: source + `\nwindow.__d1QA = { snapshot: () => ({ x:player.position.x,z:player.position.z,hp,mana,maxhp:maxhp(),running,elapsed,keys:[...keys],cd:{...cd},data:JSON.parse(JSON.stringify(data)),enemies:enemies.map(e=>({x:e.g.position.x,z:e.g.position.z,hp:e.hp})),shots:shots.length,mageLoaded:!!mage,clips:mage?.clips.map(c=>c.name),saveStatus:typeof saveManager==='undefined'?null:saveManager.getStatus() }) };\n` });
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__d1QA?.snapshot().mageLoaded && !document.getElementById('start').disabled, null, { timeout: 60000 });
  return { page, context };
}
const snapshot = page => page.evaluate(() => window.__d1QA.snapshot());
async function start(page) { await page.click('#start'); await page.waitForFunction(() => window.__d1QA.snapshot().running); }
async function keyFor(page, key, ms) { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); }
async function closeDialog(page, selector, button) {
  await page.evaluate(selector=>{
    window.__d1QACloseDone=false;
    document.querySelector(selector).addEventListener('close',()=>{window.__d1QACloseDone=true;},{once:true});
  },selector);
  await page.click(button);
  await page.waitForFunction(()=>window.__d1QACloseDone,null,{timeout:20000});
}
async function actualGameplay(page, label) {
  await start(page);
  const beforeMove = await snapshot(page);
  await page.keyboard.down('d');
  await page.waitForFunction(x=>window.__d1QA.snapshot().x>x+.25,beforeMove.x,{timeout:20000});
  await page.keyboard.up('d');
  const afterMove = await snapshot(page);
  assert(afterMove.x > beforeMove.x + .1, 'D movement must change world position');
  await page.keyboard.press('2');
  const ice = await snapshot(page);
  assert(ice.cd.ice > 0 && ice.mana < afterMove.mana - 20, 'Ice must consume mana and enter cooldown');
  await page.keyboard.press('Space');
  const blink = await snapshot(page);
  assert(blink.cd.blink > 0 && Math.hypot(blink.x - ice.x, blink.z - ice.z) > .8, 'Blink must move the player');
  await page.keyboard.down('1');
  await page.waitForFunction(()=>{const s=window.__d1QA.snapshot();return s.cd.fire>0||s.shots>0;},null,{timeout:20000});
  const fire = await snapshot(page);
  await page.keyboard.up('1');
  assert(fire.cd.fire > 0 || fire.shots > 0, 'Fire must spawn a projectile or show cooldown: '+JSON.stringify(fire));
  // Walk toward a genuine spawned enemy and wait for an actual attack.
  for (let i = 0; i < 24; i++) {
    const s = await snapshot(page);
    if (s.hp < s.maxhp) break;
    const enemy = s.enemies.filter(e=>Math.abs(e.x)<6).reduce((best, e) => !best || Math.hypot(e.x - s.x, e.z - s.z) < Math.hypot(best.x - s.x, best.z - s.z) ? e : best, null);
    if (!enemy) break;
    const dx = enemy.x - s.x, dz = enemy.z - s.z;
    const keys = Math.hypot(dx, dz) > 1.2 ? [Math.abs(dx)>Math.abs(dz)?(dx>0?'d':'a'):(dz>0?'s':'w')] : [];
    for (const key of keys) await page.keyboard.down(key);
    if(keys.length) await page.waitForFunction(({x,z})=>{const n=window.__d1QA.snapshot();return n.hp<n.maxhp||Math.hypot(n.x-x,n.z-z)>.7;},{x:s.x,z:s.z},{timeout:20000});
    else await page.waitForFunction(()=>{const n=window.__d1QA.snapshot();return n.hp<n.maxhp;},null,{timeout:20000});
    for (const key of keys) await page.keyboard.up(key);
  }
  await page.waitForFunction(() => {const s=window.__d1QA.snapshot();return s.hp<s.maxhp&&s.hp>0;}, null, {timeout:15000});
  const hurt = await snapshot(page);
  await page.keyboard.press('3');
  const healed = await snapshot(page);
  assert(healed.hp > hurt.hp && healed.cd.heal > 0, 'Potion must heal damage and enter cooldown');
  await page.click('#hero');
  await page.locator('#character').waitFor({state:'visible'});
  const canvas = await page.locator('#model-preview').boundingBox();
  assert(canvas && canvas.width > 100 && canvas.height > 100, 'Character preview must have a visible canvas');
  await page.mouse.move(canvas.x + canvas.width * .4, canvas.y + canvas.height * .5);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * .75, canvas.y + canvas.height * .55, {steps:8});
  await page.mouse.up();
  await page.screenshot({path:screenshots+label+'-character.png'});
  await closeDialog(page,'#character','#closehero');
  await page.screenshot({path:screenshots+label+'-desktop.png'});
  await page.click('#bag');
  await page.locator('#inventory').waitFor({state:'visible'});
  check(label+'-gameplay', {movement:[beforeMove.x,afterMove.x], iceMana:ice.mana, blinkDistance:Math.hypot(blink.x-ice.x,blink.z-ice.z), fire:true, potion:[hurt.hp,healed.hp], model:true, characterDrag:true, inventory:true});
}
async function baseline() {
  const { page, context } = await pageFor();
  assert((await page.locator('.brand').innerText()).includes('0.2.0'));
  await actualGameplay(page, 'baseline');
  await context.close();
  const seeded = await pageFor({}, {'ember-mage-v1':JSON.stringify(legacy)});
  assert((await seeded.page.locator('#savehint').innerText()).includes('Lv. 3'), 'Legacy hint must restore level');
  await start(seeded.page);
  await seeded.page.click('#bag');
  await seeded.page.getByRole('button',{name:'装备',exact:true}).first().click();
  assert((await seeded.page.locator('#stats').innerText()).includes('法术伤害 50'), 'Legacy staff must add 20 to Lv3 power');
  await seeded.page.reload();
  await seeded.page.waitForFunction(()=>window.__d1QA?.snapshot().mageLoaded);
  assert((await snapshot(seeded.page)).data.equipped==='legacy-ember', 'Legacy equipment must persist across refresh');
  check('baseline-legacy-save-equipment', {level:3,power:50,equipped:'legacy-ember',refresh:true});
  await seeded.context.close();
  await mobile('baseline');
}
async function mobile(label) {
  const {page,context}=await pageFor({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await start(page);
  assert(await page.locator('#joystick').isVisible(),'Mobile joystick visible');
  const joy=await page.locator('#joystick').boundingBox();
  const before=await snapshot(page);
  const cdp=await context.newCDPSession(page);
  const joyTouch={x:joy.x+joy.width/2+29,y:joy.y+joy.height/2,id:7};
  const iceBounds=await page.locator('[data-skill="ice"]').boundingBox();
  const iceTouch={x:iceBounds.x+iceBounds.width/2,y:iceBounds.y+iceBounds.height/2,id:8};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[joyTouch]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[joyTouch,iceTouch]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[joyTouch]});
  await page.waitForFunction(x=>window.__d1QA.snapshot().x>x+.2,before.x,{timeout:20000});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const after=await snapshot(page);
  assert(after.x>before.x+.1&&after.cd.ice>0,'Mobile movement and skill must run together');
  await page.click('#hero');
  const bounds=await page.locator('#character').boundingBox();
  assert(bounds && bounds.height<=844 && bounds.width<=390,'Portrait modal must fit viewport');
  await closeDialog(page,'#character','#closehero');
  await page.waitForFunction(()=>window.__d1QA.snapshot().running,null,{timeout:20000});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No mobile horizontal page overflow');
  await page.screenshot({path:screenshots+label+'-mobile.png'});
  if(label==='final') {
    await page.click('#saves');
    await page.locator('#save-dialog').waitFor({state:'visible'});
    const saveBounds=await page.locator('#save-dialog').boundingBox();
    assert(saveBounds.width<=390&&saveBounds.height<=844,'Mobile save panel must fit viewport');
    assert(await page.locator('#export-save').isVisible(),'Mobile export action must be visible');
    await page.screenshot({path:screenshots+'final-mobile-save.png'});
    await closeDialog(page,'#save-dialog','#close-save');
    await page.waitForFunction(()=>window.__d1QA.snapshot().running,null,{timeout:20000});
    assert((await snapshot(page)).running,'Closing save panel should resume mobile play');
  }
  check(label+'-mobile-viewport',{joystick:true,movementAndIce:true,characterFits:true,noHorizontalOverflow:true});
  await context.close();
}
async function storageSnapshot(page) { return page.evaluate(()=>Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>{const key=localStorage.key(i);return [key,localStorage.getItem(key)];}))); }
async function openSave(page) {
  if(await page.locator('#save-dialog').isVisible())return;
  if(await page.locator('#intro').isVisible())await page.click('#open-save-intro');
  else await page.click('#saves');
  await page.locator('#save-dialog').waitFor({state:'visible'});
}
async function exportText(page, original=false) {
  const downloadPromise=page.waitForEvent('download');
  await page.click(original?'#export-original':'#export-save');
  const download=await downloadPromise;
  const file=await download.path();
  const raw=fs.readFileSync(file,'utf8');
  await download.delete();
  return raw;
}
async function selectImport(page, raw, name='test-save.json') {
  await page.locator('#import-save-file').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(raw)});
  await page.waitForFunction(()=>document.getElementById('save-message').textContent!=='正在读取存档…');
}
async function final() {
  const seeded=await pageFor({}, {'ember-mage-v1':JSON.stringify(legacy)});
  const {page,context}=seeded;
  const meta=await page.evaluate(async()=>{const m=await import('./save.js');return {keys:m.SAVE_KEYS};});
  const keys=meta.keys;
  assert((await page.locator('.brand').innerText()).includes('0.2.1'));
  let s=await snapshot(page);
  assert.deepEqual(s.data,legacy,'Migration must preserve all legacy character and staff fields');
  assert.deepEqual([...s.clips].sort(),['Cast','Idle','Walk'],'Original model clips retained');
  let stored=await storageSnapshot(page);
  assert.equal(stored[keys.legacy],JSON.stringify(legacy),'Legacy key must remain byte-for-byte');
  assert.equal(JSON.parse(stored[keys.main]).schemaVersion,2);
  assert(stored[keys.backup],'Migration must create a reliable backup');
  check('final-legacy-migration',{schema:2,legacyPreserved:true,level:s.data.level,xp:s.data.xp,clears:s.data.clears,items:s.data.items.length,clips:s.clips});
  await start(page);
  await page.click('#bag');
  await page.getByRole('button',{name:'装备',exact:true}).first().click();
  assert((await page.locator('#stats').innerText()).includes('法术伤害 50'));
  await page.reload();
  await page.waitForFunction(()=>window.__d1QA?.snapshot().mageLoaded);
  assert.equal((await snapshot(page)).data.equipped,'legacy-ember');
  await openSave(page);
  const originalRole=(await snapshot(page)).data;
  const exported=await exportText(page);
  const envelope=JSON.parse(exported);
  assert.equal(envelope.format,'ember-mage-save');
  assert.equal(envelope.schemaVersion,2);
  assert.deepEqual(envelope.data,originalRole);
  check('final-export-equipment-refresh',{level:3,power:50,equipped:'legacy-ember',exportedEnvelope:true,refresh:true});
  const good=await storageSnapshot(page);
  const badInputs=[
    ['invalid-json','{bad json'],
    ['negative-level',JSON.stringify({...legacy,level:-1})],
    ['missing-equipped-staff',JSON.stringify({...legacy,equipped:'not-an-item'})],
    ['duplicate-id',JSON.stringify({...legacy,items:[legacy.items[0],legacy.items[0]]})],
    ['bad-checksum',JSON.stringify({...envelope,data:{...envelope.data,level:4}})],
    ['future-version',JSON.stringify({...envelope,schemaVersion:3})],
    ['oversized',' '.repeat(1024*1024+1)]
  ];
  for(const [name,raw] of badInputs) {
    await selectImport(page,raw,name+'.json');
    assert.equal(await page.locator('#save-message').getAttribute('data-error'),'true',name+' must report an error');
    assert(!(await page.locator('#import-preview').isVisible()),name+' must not show confirmation');
    assert.deepEqual(await storageSnapshot(page),good,name+' must preserve every stored key');
  }
  check('final-rejected-imports',{cases:badInputs.map(x=>x[0]),allStoredBytesPreserved:true});
  const importedRole={...legacy,level:7,xp:123,clears:3,equipped:'legacy-frost'};
  const imported=await page.evaluate(async data=>{const m=await import('./save.js');return m.createSaveManager({storage:null}).exportSave(data);},importedRole);
  await selectImport(page,imported);
  await page.locator('#import-preview').waitFor({state:'visible'});
  assert((await page.locator('#import-summary').innerText()).includes('Lv. 7'));
  assert.deepEqual(await storageSnapshot(page),good,'Preview must not commit');
  await page.click('#cancel-import');
  assert.deepEqual(await storageSnapshot(page),good,'Cancel must not commit');
  await selectImport(page,imported);
  await page.click('#confirm-import');
  await page.locator('#save-dialog').waitFor({state:'hidden'});
  assert(await page.locator('#intro').isVisible(),'Import returns to entrance');
  assert.deepEqual((await snapshot(page)).data,importedRole);
  assert(!(await snapshot(page)).running,'Imported character must not resume old encounter');
  stored=await storageSnapshot(page);
  assert(stored[keys.restorePoint],'Manual import creates recovery point');
  const restoreBytes=stored[keys.restorePoint];
  await start(page);
  await page.click('#bag');
  await page.getByRole('button',{name:'装备',exact:true}).first().click();
  await page.click('#closebag');
  assert.equal((await storageSnapshot(page))[keys.restorePoint],restoreBytes,'Ordinary save must preserve manual recovery point');
  await openSave(page);
  await page.click('#recover-save');
  assert((await page.locator('#import-summary').innerText()).includes('Lv. 3'));
  assert.equal((await snapshot(page)).data.level,7,'Recovery preview must not commit');
  await page.screenshot({path:screenshots+'final-save-preview.png'});
  await page.click('#confirm-import');
  await page.locator('#save-dialog').waitFor({state:'hidden'});
  assert.deepEqual((await snapshot(page)).data,originalRole,'Recovery restores previous complete role');
  assert(await page.locator('#intro').isVisible());
  check('final-import-preview-cancel-confirm-recover',{cancelPreservesBytes:true,importLevel:7,oldEncounterStopped:true,recoveryLevel:3,recoveryPointSurvivesOrdinarySave:true});
  const goodRaw=(await storageSnapshot(page))[keys.main];
  await context.close();
  for(const [name,bad] of [['corrupt-primary','{truncated'],['future-primary',JSON.stringify({...JSON.parse(goodRaw),schemaVersion:99})]]) {
    const broken=await pageFor({}, {[keys.main]:bad,[keys.backup]:goodRaw});
    assert.equal((await storageSnapshot(broken.page))[keys.main],bad,'Loading bad primary must not overwrite it');
    assert.equal((await snapshot(broken.page)).saveStatus.canSave,false,'Bad primary must disable ordinary save');
    await openSave(broken.page);
    assert(!(await broken.page.locator('#pick-import').isDisabled()),'Protected primary must allow explicit legal external import');
    assert.equal(await exportText(broken.page,true),bad,'Original export preserves the bad/future raw bytes');
    await broken.page.click('#recover-save');
    assert((await broken.page.locator('#import-summary').innerText()).includes('Lv. 3'));
    assert.equal((await storageSnapshot(broken.page))[keys.main],bad,'Recovery preview preserves protected primary');
    await broken.page.click('#confirm-import');
    await broken.page.locator('#save-dialog').waitFor({state:'hidden'});
    assert.deepEqual((await snapshot(broken.page)).data,originalRole);
    const after=await storageSnapshot(broken.page);
    assert(JSON.parse(after[keys.rejected]).entries.some(e=>e.raw===bad),'Confirmed recovery archives the raw protected primary');
    assert.equal(JSON.parse(after[keys.main]).schemaVersion,2);
    check('final-'+name,{initiallyProtected:true,originalExport:true,previewNoWrite:true,explicitRecovery:true,rawArchived:true});
    await broken.page.evaluate(({keys,bad,goodRaw})=>{localStorage.clear();localStorage.setItem(keys.main,bad);localStorage.setItem(keys.backup,goodRaw);},{keys,bad,goodRaw});
    await broken.page.reload();
    await broken.page.waitForFunction(()=>window.__d1QA?.snapshot().mageLoaded);
    await openSave(broken.page);
    await selectImport(broken.page,imported);
    await broken.page.locator('#import-preview').waitFor({state:'visible'});
    assert.equal((await storageSnapshot(broken.page))[keys.main],bad,'Legal external import preview preserves protected primary');
    await broken.page.click('#confirm-import');
    await broken.page.locator('#save-dialog').waitFor({state:'hidden'});
    assert.deepEqual((await snapshot(broken.page)).data,importedRole);
    assert(JSON.parse((await storageSnapshot(broken.page))[keys.rejected]).entries.some(e=>e.raw===bad));
    check('final-'+name+'-external-import',{previewNoWrite:true,explicitLegalImport:true,rawArchived:true,level:7});
    await broken.context.close();
  }
  await regression();
}
async function regression({combat=true}={}) {
  const gameplay=await pageFor();
  const importedRole={...legacy,level:7,xp:123,clears:3,equipped:'legacy-frost'};
  const imported=await gameplay.page.evaluate(async data=>{const m=await import('./save.js');return m.createSaveManager({storage:null}).exportSave(data);},importedRole);
  if(combat)await actualGameplay(gameplay.page,'final');
  else {await start(gameplay.page);await gameplay.page.click('#bag');}
  // Exercise the real dialog handlers with a second modal already open.
  await gameplay.page.evaluate(()=>document.getElementById('saves').click());
  await gameplay.page.locator('#save-dialog').waitFor({state:'visible'});
  await closeDialog(gameplay.page,'#save-dialog','#close-save');
  assert(await gameplay.page.locator('#inventory').isVisible());
  assert(!(await snapshot(gameplay.page)).running,'Closing save above inventory must not resume combat');
  await closeDialog(gameplay.page,'#inventory','#closebag');
  await gameplay.page.waitForFunction(()=>window.__d1QA.snapshot().running,null,{timeout:20000});
  await openSave(gameplay.page);
  assert(!(await snapshot(gameplay.page)).running,'Save panel pauses encounter');
  const pausedElapsed=(await snapshot(gameplay.page)).elapsed;
  await gameplay.page.waitForTimeout(250);
  assert.equal((await snapshot(gameplay.page)).elapsed,pausedElapsed,'No simulation advancement while saving');
  await closeDialog(gameplay.page,'#save-dialog','#close-save');
  await gameplay.page.waitForFunction(()=>window.__d1QA.snapshot().running,null,{timeout:20000});
  assert((await snapshot(gameplay.page)).running,'Closing unchanged save panel resumes encounter');
  check('final-save-modal-pause-resume',{paused:true,elapsedStable:true,resumed:true});
  await gameplay.page.click('#hero');
  await gameplay.page.evaluate(()=>document.getElementById('saves').click());
  await gameplay.page.locator('#save-dialog').waitFor({state:'visible'});
  await closeDialog(gameplay.page,'#save-dialog','#close-save');
  assert(await gameplay.page.locator('#character').isVisible());
  assert(!(await snapshot(gameplay.page)).running,'Closing save above character must not resume combat');
  await gameplay.page.evaluate(()=>document.getElementById('saves').click());
  await selectImport(gameplay.page,imported);
  await closeDialog(gameplay.page,'#save-dialog','#confirm-import');
  await gameplay.page.locator('#save-dialog').waitFor({state:'hidden'});
  await gameplay.page.waitForTimeout(250);
  assert(!(await gameplay.page.locator('#character').isVisible()));
  assert(await gameplay.page.locator('#intro').isVisible());
  assert(!(await snapshot(gameplay.page)).running,'Applying import that closes character must leave combat stopped');
  check('final-nested-modal-regression',{inventoryCloseStaysPaused:true,characterCloseStaysPaused:true,importClosesCharacterAndStopsEncounter:true});
  await gameplay.context.close();
  await mobile('final');
}
async function writeFailure() {
  const {page,context}=await pageFor({}, {'ember-mage-v1':JSON.stringify(legacy)});
  const keys=await page.evaluate(async()=>{const m=await import('./save.js');return m.SAVE_KEYS;});
  const before=await storageSnapshot(page);
  await page.evaluate(main=>{
    window.__d1QAOriginalSetItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(key===main)throw new DOMException('Injected primary write failure','QuotaExceededError');
      return window.__d1QAOriginalSetItem.call(this,key,value);
    };
  },keys.main);
  await start(page);
  await page.click('#bag');
  await page.getByRole('button',{name:'装备',exact:true}).first().click();
  const unsaved=(await snapshot(page)).data;
  assert.equal(unsaved.equipped,'legacy-ember');
  assert.equal((await storageSnapshot(page))[keys.main],before[keys.main],'Failed primary write preserves original primary');
  assert(!(await snapshot(page)).saveStatus.canSave,'Storage write failure must be visible');
  await closeDialog(page,'#inventory','#closebag');
  await page.waitForFunction(()=>window.__d1QA.snapshot().running);
  await openSave(page);
  assert(!(await snapshot(page)).running,'Failure save panel still pauses combat');
  const exported=await exportText(page);
  assert.deepEqual(JSON.parse(exported).data,unsaved,'Export must include unsaved in-memory equipment');
  assert.equal((await storageSnapshot(page))[keys.main],before[keys.main],'Export during failure does not overwrite primary');
  await page.screenshot({path:screenshots+'final-write-failure.png'});
  await page.evaluate(()=>{Storage.prototype.setItem=window.__d1QAOriginalSetItem;});
  const replacement={...legacy,level:7,xp:123,clears:3,equipped:'legacy-frost'};
  await selectImport(page,JSON.stringify(replacement),'legacy-0.2.0.json');
  await page.locator('#import-preview').waitFor({state:'visible'});
  await closeDialog(page,'#save-dialog','#confirm-import');
  assert.deepEqual((await snapshot(page)).data,replacement);
  assert(!(await snapshot(page)).running);
  await openSave(page);
  await page.click('#recover-save');
  assert((await page.locator('#import-summary').innerText()).includes('旧版余烬秘杖'),'Recovery preview must retain unsaved equipped staff');
  await closeDialog(page,'#save-dialog','#confirm-import');
  assert.deepEqual((await snapshot(page)).data,unsaved,'Restoration must retain the complete unsaved pre-import role');
  check('final-write-failure-export-memory-recovery',{fault:'Injected primary Storage.setItem failure',primaryBytesPreserved:true,exportIncludesUnsavedEquipment:true,legacyRawImport:true,recoveryRetainsUnsavedRole:true,modalPauses:true});
  await context.close();
}
async function invalidLegacyOriginal() {
  const raw='{broken';
  const {page,context}=await pageFor({}, {'ember-mage-v1':raw});
  const keys=await page.evaluate(async()=>{const m=await import('./save.js');return m.SAVE_KEYS;});
  const before=await storageSnapshot(page);
  assert.equal(before[keys.legacy],raw);
  assert.equal(before[keys.main],undefined,'Bad legacy must not create a replacement main on load');
  await openSave(page);
  assert.equal(await exportText(page,true),raw,'Original file export must fall back to the exact bad legacy bytes');
  assert.deepEqual(await storageSnapshot(page),before,'Exporting bad legacy must not alter storage');
  await selectImport(page,JSON.stringify(legacy),'good-legacy-fixture.json');
  await page.locator('#import-preview').waitFor({state:'visible'});
  assert((await page.locator('#import-summary').innerText()).includes('Lv. 3'));
  assert.deepEqual(await storageSnapshot(page),before,'Good import preview must preserve bad legacy');
  await closeDialog(page,'#save-dialog','#confirm-import');
  assert.deepEqual((await snapshot(page)).data,legacy,'Confirmed import must apply the complete good fixture');
  const after=await storageSnapshot(page);
  assert.equal(after[keys.legacy],raw,'Confirmed recovery import must preserve bad legacy original bytes');
  assert.equal(JSON.parse(after[keys.main]).schemaVersion,2);
  assert(await page.locator('#intro').isVisible());
  assert(!(await snapshot(page)).running);
  await openSave(page);
  await page.screenshot({path:screenshots+'final-invalid-legacy-original.png'});
  check('final-invalid-legacy-original-export-import',{noMainOnLoad:true,originalExportExactBytes:true,exportNoWrite:true,previewNoWrite:true,goodImportLevel:3,legacyOriginalUnchanged:true,returnsToIntro:true});
  await context.close();
}
(async()=>{
  browser=await chromium.launch({executablePath:process.env.D1_CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  if(mode==='baseline')await baseline(); else if(mode==='final'){await final();await writeFailure();await invalidLegacyOriginal();} else if(mode==='regression')await regression({combat:false}); else if(mode==='write-failure')await writeFailure(); else if(mode==='invalid-legacy')await invalidLegacyOriginal(); else throw Error('Unknown mode: '+mode);
  assert.equal(results.errors.length,0,'No page runtime errors');
  console.log(JSON.stringify(results,null,2));
})().catch(error=>{console.error(error);console.log(JSON.stringify(results,null,2));process.exitCode=1;}).finally(async()=>{await browser?.close();});
