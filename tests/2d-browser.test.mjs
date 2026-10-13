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
    page.on('pageerror',e=>errs.push(e.message));
    const response=await page.goto('http://127.0.0.1:8765/2d/',{waitUntil:'load'});
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
    assert.equal(await page.locator('#region-select option').count(),5,'all five regions present');
    assert.equal(await page.locator('[data-skill]').count(),7,'seven abilities must render');
    await page.click('#modal-primary');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#scrim').isVisible(),false);
    const canvas=page.locator('#game');
    assert.ok(await canvas.evaluate(x=>x.width>0&&x.height>0));
    await page.keyboard.down('d');await page.waitForTimeout(110);await page.keyboard.up('d');
    await page.keyboard.press('2');
    await page.click('#btn-inventory');
    assert.equal(await page.locator('#inventory').isVisible(),true);
    assert.equal(await page.locator('.equipment-slot').count(),13,'paper doll must show 13 slots');
    assert.equal(await page.locator('.catalog-skill').count(),7);
    assert.ok((await page.locator('#character-stats').innerText()).includes('暴击'));
    await page.click('#inv-close');
    assert.equal(await page.locator('#inventory').isVisible(),false);
    await page.click('#btn-pause');
    assert.equal(await page.locator('#scrim').isVisible(),true);
    await page.click('#modal-primary');
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
