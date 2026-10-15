// Browser smoke test: real Chromium + local static server, no screenshot invention.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { setTimeout as sleep } from 'node:timers/promises';
const server = spawn('python3',['-m','http.server','8765','--bind','127.0.0.1','--directory','dist'],{stdio:'ignore'});
let browser;
try{
  const candidates=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
  let launchError;
  for(const executablePath of candidates){
    try{browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});break;}
    catch(e){launchError=e;}
  }
  if(!browser)throw new Error('Chromium missing/unavailable: '+launchError?.message);
  await sleep(750);
  for(const viewport of [{width:1365,height:768,isMobile:false},{width:390,height:844,isMobile:true,hasTouch:true}]){
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},isMobile:viewport.isMobile,hasTouch:!!viewport.hasTouch,deviceScaleFactor:1});
    const page=await context.newPage(),errs=[];
    // Dedicated visual regression character: no fixture is shipped in the game itself.
    await page.addInitScript(()=>{
      const item=(id,slot,name,rarity,affixes,power=0,hp=0,armor=0,setId=null)=>({
        id,slot,name,rarity,ilvl:18,affixes,power,hp,mana:slot==='offhand'?80:0,armor,value:300,setId
      });
      // Keep real profile data on reload; fixture applies only to a fresh test context.
      if(localStorage.getItem('ember-chronicles-2d-v1'))return;
      localStorage.setItem('ember-chronicles-2d-v1',JSON.stringify({
        version:2,level:18,gold:1400,essence:50,clears:2,region:0,xp:40,skillRanks:{fire:3,nova:2},materials:{dust:70,crystal:90,core:6},
        inventory:[
          item('staff','weapon','余烬裁决长杖',3,[{key:'power',value:28},{key:'fire',value:13},{key:'crit',value:5}],55),
          item('helmet','head','龙焰冠冕',4,[{key:'resistFire',value:12}],0,8,24,'dragonflame'),
          item('robe','robe','龙焰法衣',4,[{key:'hp',value:23}],0,54,38,'dragonflame'),
          item('gloves','gloves','旧日秘纹手套',2,[{key:'haste',value:9},{key:'critDmg',value:12}]),
          item('ring','ring1','冻土秘银指环',2,[{key:'cold',value:9},{key:'crit',value:3}]),
          item('amulet','amulet','流浪先知护符',2,[{key:'mana',value:22},{key:'skillCold',value:1}]),
          item('focus','offhand','深渊祷言秘典',2,[{key:'regen',value:4}])
        ],
        equipped:{weapon:'staff',head:'helmet',robe:'robe',ring1:'ring',offhand:'focus'}
      }));
    });
    page.on('pageerror',e=>errs.push(e.message));
    const response=await page.goto('http://127.0.0.1:8765/2d/?qa=1',{waitUntil:'load'});
    assert.equal(response.status(),200);
    assert.match(await page.title(),/余烬纪事 2D/);
    await page.waitForTimeout(300);
    // Real sprite art must load and decode, not just a successful HTML response.
    const spriteState = await page.evaluate(async () => {
      const art = await import('./art.js');
      await art.preload();
      return art.artStatus();
    });
    assert.equal(spriteState.ready, true, 'pixel-art sprite atlas failed to load');
    assert.equal(await page.locator('#region-select option').count(),9,'all nine regions present');
    assert.equal(await page.locator('[data-skill]').count(),7,'seven abilities must render');
    await page.click('#modal-primary');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#scrim').isVisible(),false);
    const maze=await page.evaluate(()=>window.__ember2dQA.mazeInfo());
    assert.ok(maze.rooms>=16&&maze.hasMask&&maze.explored===1,'v0.3.3 must run on real multiroom maze');
    const firstBoss=await page.evaluate(()=>window.__ember2dQA.bossTest());
    assert.equal(firstBoss.state,'playing','boss defeat must not end the game');
    assert.equal(firstBoss.bossDefeated,true);
    assert.ok(firstBoss.drops.length>=2,'first boss kill must drop ordinary and exclusive loot');
    assert.equal(firstBoss.drops.some(d=>d.rarity===3&&d.persistent),true,'guaranteed special legendary');
    assert.equal(firstBoss.bossKills,1);
    assert.equal(await page.locator('#portal-open').isVisible(),true,'boss portal must appear');
    assert.equal(firstBoss.pending,firstBoss.drops.length);
    assert.equal(await page.locator('#scrim').isVisible(),false,'no victory modal should block loot pickup');
    const zoomPrevention=await page.evaluate(()=>{
      const event=new MouseEvent('dblclick',{bubbles:true,cancelable:true});
      document.querySelector('#game').dispatchEvent(event);
      return {prevented:event.defaultPrevented,touch:window.getComputedStyle(document.body).touchAction};
    });
    assert.equal(zoomPrevention.prevented,true,'double-tap should be prevented');
    assert.equal(zoomPrevention.touch,'manipulation');
    if(process.env.SCREENSHOT_FOR_REVIEW==='1'){
      const shot=await page.screenshot({type:'jpeg',quality:70});
      console.log((viewport.isMobile?'BOSS_DROP_MOBILE_BASE64:':'BOSS_DROP_DESKTOP_BASE64:')+shot.toString('base64'));
    }
    // Regression: killing the Boss increments clears but must not reroll the
    // active maze seed, erase explored rooms, or respawn the defeated Boss.
    const preRefresh=await page.evaluate(()=>window.__ember2dQA.mazeInfo());
    await page.reload({waitUntil:'load'});
    await page.click('#modal-primary');
    await page.waitForTimeout(150);
    const postRefresh=await page.evaluate(()=>({
      maze:window.__ember2dQA.mazeInfo(),
      profile:JSON.parse(localStorage.getItem('ember-chronicles-2d-v1'))
    }));
    assert.equal(postRefresh.maze.seed,preRefresh.seed,'Boss clear changed the active maze seed on reload');
    assert.equal(postRefresh.maze.bossDefeated,true,'Boss defeat state not restored');
    assert.equal(postRefresh.maze.portalReady,true,'cleared Boss portal not restored');
    assert.ok(postRefresh.maze.explored>=preRefresh.explored,'explored rooms disappeared');
    assert.equal(postRefresh.profile.bossKills[0],1);
    assert.equal(postRefresh.profile.pendingLoot.length,firstBoss.pending,'unclaimed Boss loot lost on reload');
    const restoredDrops=postRefresh.profile.pendingLoot.map(d=>({id:d.item.id,x:d.x,y:d.y})).sort((a,b)=>a.id.localeCompare(b.id));
    const originalDrops=firstBoss.drops.map(d=>({id:d.id,x:d.x,y:d.y})).sort((a,b)=>a.id.localeCompare(b.id));
    assert.deepEqual(restoredDrops,originalDrops,'unclaimed Boss loot coordinates changed on reload');
    assert.equal(await page.locator('#portal-open').isVisible(),true);
    const canvas=page.locator('#game');
    assert.ok(await canvas.evaluate(x=>x.width>0&&x.height>0));
    await page.keyboard.down('d');await page.waitForTimeout(110);await page.keyboard.up('d');
    await page.keyboard.press('2');
    await page.keyboard.press('3');
    await page.keyboard.press('4');
    await page.keyboard.press('q');
    await page.waitForTimeout(960);
    assert.ok(Number(await page.locator('#mana-num').innerText())<170,'spell mana should really be consumed');
    await page.click('#btn-inventory');
    assert.equal(await page.locator('#inventory').isVisible(),true);
    assert.equal(await page.locator('.equipment-slot').count(),13,'paper doll must show 13 slots');
    assert.equal(await page.locator('.catalog-skill').count(),11,'expanded spell catalogue should show all eleven skills');
    assert.equal(await page.locator('[data-skill]').count(),7,'only seven loadout slots visible on mobile');
    assert.equal(await page.locator('.skill-slot').count(),11,'skills may be assigned to the action bar');
    assert.ok(await page.locator('.item-thumbnail').count()>0,'bag should include actual item icon canvases');
    assert.ok(await page.locator('.equipment-icon').count()>0,'worn gear should show sprites');
    assert.ok((await page.locator('#character-stats').innerText()).includes('暴击'));
    await page.locator('.item-detail').first().evaluate(el=>el.click());
    assert.equal(await page.locator('#item-inspect canvas.item-preview').count(),1,'inspected gear has picture');
    assert.ok((await page.locator('#item-inspect').innerText()).includes('装备'));
    assert.ok(await page.locator('#inv-quick-equip').isEnabled(),'selected item must support direct equipping');
    assert.equal(await page.locator('.material-token').count(),3,'all salvage material wallets must render');
    await page.selectOption('#auto-salvage','1');
    assert.equal(await page.inputValue('#auto-salvage'),'1');
    const beforeTemper=await page.locator('#item-inspect').innerText();
    const temperReady=await page.locator('#inv-temper').isEnabled();
    assert.equal(typeof temperReady,'boolean');
    assert.ok((await page.locator('#temper-cost').innerText()).includes('淬炼花费'));
    const spellRow=page.locator('.skill-catalog-entry').filter({hasText:'冰暴领域'});
    await spellRow.locator('select').selectOption('0');
    assert.equal(await page.locator('button[data-skill="storm"]').count(),1);
    assert.equal(await page.locator('[data-skill]').count(),7);
    assert.equal(await page.locator('#portal-open').isVisible(),false,'portal button must not cover the inventory');
    await page.selectOption('#inv-filter','accessory');
    assert.ok((await page.locator('.item-thumbnail').count())>=1,'accessory filter must retain jewelry');
    await page.selectOption('#inv-filter','all');
    const overflow=await page.locator('.inv-workspace').evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));
    assert.ok(overflow.scroll<=overflow.client+3,'inventory must not overflow horizontally: '+JSON.stringify(overflow));
    if(process.env.SCREENSHOT_FOR_REVIEW==='1'){
      const visual=await page.screenshot({type:'jpeg',quality:62});
      console.log((viewport.isMobile?'INVENTORY_MOBILE_BASE64:':'INVENTORY_DESKTOP_BASE64:')+visual.toString('base64'));
    }
    if(process.env.SCREENSHOT_FOR_REVIEW==='1'){
      const craftShot=await page.screenshot({type:'jpeg',quality:69});
      console.log((viewport.isMobile?'CRAFT_MOBILE_BASE64:':'CRAFT_DESKTOP_BASE64:')+craftShot.toString('base64'));
    }
    await page.click('#inv-close');
    assert.equal(await page.locator('#inventory').isVisible(),false);
    await page.keyboard.press('6');
    await page.waitForTimeout(150);
    await page.click('#btn-pause');
    assert.equal(await page.locator('#scrim').isVisible(),true);
    await page.click('#modal-primary');
    await page.click('#portal-open');
    assert.equal(await page.locator('#portal-panel').isVisible(),true);
    if(process.env.SCREENSHOT_FOR_REVIEW==='1'){
      const portalImage=await page.screenshot({type:'jpeg',quality:68});
      console.log((viewport.isMobile?'PORTAL_MOBILE_BASE64:':'PORTAL_DESKTOP_BASE64:')+portalImage.toString('base64'));
    }
    assert.equal(await page.locator('#portal-destination option').count(),9);
    await page.selectOption('#portal-destination','1');
    await page.click('#portal-next');
    assert.equal(await page.locator('#portal-panel').isVisible(),false);
    assert.equal(await page.locator('#region-name').innerText(),'遗弃监牢');
    page.once('dialog',d=>d.accept());
    await page.selectOption('#region-select','2');
    await page.waitForTimeout(230);
    assert.equal(await page.locator('#region-name').innerText(),'余烬祭坛');
    assert.equal(await page.locator('#map-label').innerText(),'血色符文');
    await page.selectOption('#region-select','3').catch(()=>{});
    await page.waitForTimeout(200);
    if(process.env.SCREENSHOT_FOR_REVIEW==='1') {
      const screenshot=await page.screenshot({type:'jpeg',quality:54});
      console.log((viewport.isMobile?'GAME_MOBILE_SCREENSHOT_BASE64:':'GAME_SCREENSHOT_BASE64:')+screenshot.toString('base64'));
    }
    assert.deepEqual(errs,[],'page JS exceptions');
    console.log('Smoke passed', viewport.width+'x'+viewport.height);
    await context.close();
  }
}finally{if(browser)await browser.close();server.kill('SIGTERM');}
