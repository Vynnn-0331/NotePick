const {chromium}=require(process.env.NOTEPICK_PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {recommendCatalog}=require('../src/services/recommendationEngine.js');
const {buildRecommendationCardCopy}=require('../src/services/recommendationCardCopy.js');
const {buildRecommendationComparison}=require('../src/services/recommendationComparison.js');
const {defaultRequirements}=require('../src/services/requirements.js');
const catalog=require('../src/data/catalog.json');
const examples=require('../../data/processed/phase3c_examples.json').cases;
const out=path.resolve(__dirname,'../test-results');fs.mkdirSync(out,{recursive:true});
const inputs=[...examples.map(c=>({name:c.name,input:c.input})),...[2500,6000,6500,10000].map((max,i)=>({name:`count-${i}`,count:i,input:{...defaultRequirements(),budget:[max===2500?2000:5000,max],os:'macOS',scenarios:['documents']}}))];
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[],external=[],checks=[];
 try{for(const c of inputs){const page=await browser.newPage({viewport:{width:1366,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5173')&&!r.url().startsWith('data:')&&!(r.resourceType()==='image'&&r.url().startsWith('https://wjcc.mechrevo.com/')))external.push(r.url());});
  await page.addInitScript(p=>sessionStorage.setItem('notepick.preferences.v2',JSON.stringify(p)),c.input);await page.goto('http://127.0.0.1:5173/#/recommendations');
  const matches=recommendCatalog(catalog,c.input).slice(0,3),compared=buildRecommendationComparison(matches,c.input);const cards=page.locator('.product-grid > a');
  if(matches.length)await cards.first().waitFor();else await page.getByRole('heading',{name:'没有符合当前硬性条件的电脑'}).waitFor();
  assert.equal(await cards.count(),matches.length);if(c.count!==undefined)assert.equal(matches.length,c.count);
  assert.deepEqual(await cards.evaluateAll(ns=>ns.map(n=>n.getAttribute('href'))),matches.map(m=>'#/products/'+m.product.id));
  for(let i=0;i<matches.length;i++){
   const copy=buildRecommendationCardCopy(compared[i],matches[i],c.input);
   assert.equal(await cards.nth(i).locator('.product-reason').innerText(),copy.description);
   assert.deepEqual(await cards.nth(i).locator('.advantage-title').allTextContents(),copy.advantages.map(a=>a.title));
   assert.deepEqual(await cards.nth(i).locator('.advantage-description').allTextContents(),copy.advantages.map(a=>a.description));
   assert.equal(await cards.nth(i).locator('.choice-cautions').count(),0);
   assert(!(await cards.nth(i).innerText()).includes('留意一下'));
   assert.equal(await cards.nth(i).locator('.product-reason').getAttribute('title'),null);
  }
  assert.equal(await page.locator('.ai-analysis').count(),0);
  assert(!/[%％]|匹配度|满足度|\/100/.test(await page.locator('main').innerText()));
  assert.equal(await page.locator('.comparison-evidence-list').count(),0);
  if(matches.length){await cards.first().click();await page.locator('.detail-layout').waitFor();assert.equal(await page.locator('.detail-comparison,.analysis-entry,.recommendation-evidence').count(),0);assert(!(await page.locator('main').innerText()).includes('本次选择说明'));
   await page.getByRole('link',{name:'返回推荐结果'}).click();await cards.first().waitFor();await page.reload();await cards.first().waitFor();assert.deepEqual(await cards.evaluateAll(ns=>ns.map(n=>n.getAttribute('href'))),matches.map(m=>'#/products/'+m.product.id));
  }
  await page.getByRole('link',{name:'修改需求'}).click();await page.getByRole('heading',{name:'先从你的需要开始。'}).waitFor();const state=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('notepick.preferences.v2')));assert.deepEqual(state.scenarios,c.input.scenarios);assert.deepEqual(state.priorities,c.input.priorities);
  await page.getByRole('button',{name:'生成推荐'}).click();if(matches.length)await cards.first().waitFor();else await page.getByRole('heading',{name:'没有符合当前硬性条件的电脑'}).waitFor();
  for(const width of [390,768,1366]){await page.setViewportSize({width,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  if(c===inputs[0]||c===inputs[3]){await page.setViewportSize({width:1366,height:1000});await page.screenshot({path:path.join(out,c===inputs[0]?'phase3c-office.png':'phase3c-game.png'),fullPage:true,animations:'disabled'});await page.setViewportSize({width:390,height:950});await page.screenshot({path:path.join(out,c===inputs[0]?'phase3c-office-mobile.png':'phase3c-game-mobile.png'),fullPage:true,animations:'disabled'});}
  checks.push({name:c.name,count:matches.length,ids:matches.map(m=>m.product.id),originalReasonsRetainedInData:true,scoreHidden:true,detailContextRemoved:true,returnRefreshPreserved:true,widths:[390,768,1366]});await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);const report={status:'passed',browser:'Installed Chrome headless',checks,errors,externalRequests:external};fs.writeFileSync(path.join(out,'phase3c-browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:'passed',cases:checks.length,counts:checks.map(c=>c.count),errors,externalRequests:external}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
