const {chromium}=require(process.env.NOTEPICK_PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
const {SCENARIOS,PRIORITIES,HARD_FIELDS,normalizeRequirements}=require('../src/services/requirements.js');
const {recommendCatalog:rankForRequirements}=require('../src/services/recommendationEngine.js');const catalog=require('../src/data/catalog.json');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const selected=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('notepick.preferences.v2')));
 const links=()=>page.locator('.product-grid > a').evaluateAll(ns=>ns.map(n=>n.getAttribute('href')));
 const assertResults=async()=>{const p=normalizeRequirements(await selected());assert.deepEqual(await links(),rankForRequirements(catalog,p).slice(0,3).map(r=>'#/products/'+r.product.id));};
 try{
  await page.addInitScript(()=>{if(!sessionStorage.getItem('notepick.preferences.v2'))sessionStorage.setItem('notepick.preferences.v2',JSON.stringify({schemaVersion:2,budget:[5000,12000],os:'不限',scenarios:[],priorities:['battery'],unavailableSelections:['battery']}));});
  await page.goto('http://127.0.0.1:5173/#/requirements');await page.getByRole('button',{name:'生成推荐'}).click();await page.getByRole('alert').waitFor();assert(page.url().endsWith('/requirements'));
  assert.equal(await page.locator('.more-requirements').getAttribute('open'),null);
  assert(!(await page.locator('main').innerText()).includes('续航'));
  const labels=await page.locator('.personal-priorities .choice').allTextContents();assert.deepEqual(labels,PRIORITIES.map(p=>p.label));assert(labels.every(t=>/^[\p{Script=Han}]{4}$/u.test(t)));
  for(const s of SCENARIOS){const box=page.getByRole('checkbox',{name:s.label,exact:true});await box.check();assert(await box.isChecked());await box.uncheck();assert(!(await box.isChecked()));await box.check();}
  for(const p of PRIORITIES.filter(p=>p.enabled)){const box=page.getByRole('checkbox',{name:p.label,exact:true});await box.check();await box.uncheck();await box.check();}
  assert.equal(await page.getByRole('checkbox',{name:/长续航/}).count(),0);await page.reload();
  for(const s of SCENARIOS)assert(await page.getByRole('checkbox',{name:s.label,exact:true}).isChecked());assert.equal((await selected()).priorities.length,7);
  await page.getByRole('button',{name:'生成推荐'}).click();await page.getByRole('link',{name:'修改需求'}).waitFor();await assertResults();assert.equal(await page.getByText('用途容量为软参考',{exact:false}).count(),0);assert(await page.getByText(/^找到 \d+ 款，展示 \d+ 款$/).count()>0);assert(!(await page.locator('body').innerText()).includes('NaN'));
  await page.getByRole('link',{name:'修改需求'}).click();await page.getByRole('slider',{name:'最高预算'}).focus();await page.getByRole('slider',{name:'最高预算'}).press('End');await page.getByRole('slider',{name:'最低预算'}).focus();await page.getByRole('slider',{name:'最低预算'}).press('Home');const cases=[];
  for(const values of [{minRamGb:32,minSsdGb:1024,maxWeightKg:1.5,discreteGpu:true},{minRamGb:64,minSsdGb:2048,maxWeightKg:1.3,discreteGpu:true},{minRamGb:null,minSsdGb:null,maxWeightKg:null,discreteGpu:false}]){
   if(!await page.locator('.more-requirements').evaluate(e=>e.open))await page.locator('.more-requirements summary').click();
   for(const f of HARD_FIELDS)await page.getByLabel(f.label,{exact:true}).selectOption(JSON.stringify(values[f.id]));
   await page.reload();assert.deepEqual((await selected()).hardConstraints,values);await page.getByRole('button',{name:'生成推荐'}).click();await page.getByRole('link',{name:'修改需求'}).waitFor();await assertResults();cases.push({hardConstraints:values,displayed:(await links()).length});await page.getByRole('link',{name:'修改需求'}).click();
  }
  assert.equal(cases[0].displayed,1);assert.equal(cases[1].displayed,0);const responsive=[];for(const width of [390,768,1366]){await page.setViewportSize({width,height:950});if(!await page.locator('.more-requirements').evaluate(e=>e.open))await page.locator('.more-requirements summary').click();const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert(!overflow);const boxes=await page.locator('.personal-priorities .choice').evaluateAll(ns=>ns.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,clipped:n.scrollWidth>n.clientWidth+1})));assert.equal(boxes.length,7);assert(boxes.every(b=>!b.clipped));assert(Math.max(...boxes.map(b=>b.width))-Math.min(...boxes.map(b=>b.width))<1);responsive.push({width,expandedControlsOverflow:overflow});}
  await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:'test-results/3b2-requirements.png',fullPage:true});await page.setViewportSize({width:390,height:950});await page.screenshot({path:'test-results/3b2-requirements-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);const report={status:'passed',scenarioCheckboxes:12,enabledPriorities:7,batteryRemoved:true,historicalBatteryStateSafe:true,fourHanLabels:true,equalLabelWidths:true,emptySelectionBlocked:true,refreshAndReturnPreserveState:true,hardCases:cases,responsive,consoleErrors:errors};fs.writeFileSync('test-results/3b2-browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
