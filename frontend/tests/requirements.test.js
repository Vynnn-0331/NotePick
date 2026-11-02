import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultRequirements,normalizeRequirements,SCENARIOS,SCENARIO_GROUPS,PRIORITIES,selectedLabels,hardRequirementLabels} from '../src/services/requirements.js';
import {adaptLegacyScoring,rankForRequirements} from '../src/services/legacyScoringAdapter.js';
import {filterCatalog} from '../src/services/filterCatalog.js';
import {rankCatalog} from '../src/services/scoreCatalog.js';
const req=()=>({...defaultRequirements(),budget:[2000,30000],scenarios:['documents']});
const product=(id,extra={})=>({id,official_price_cny:5000,os:'Windows',ram_gb:32,ssd_gb:1024,weight_kg:1.5,gpu_type:'独立显卡',cpu_model:'unknown',gpu_model:null,...extra});
test('12 stable scene IDs in four categories and seven enabled preferences round-trip without loss',()=>{
 assert.equal(SCENARIO_GROUPS.length,4);assert.equal(SCENARIOS.length,12);assert.equal(new Set(SCENARIOS.map(s=>s.id)).size,12);
 const p=req();p.scenarios=SCENARIOS.map(s=>s.id);p.priorities=PRIORITIES.filter(p=>p.enabled).map(p=>p.id);
 assert.equal(p.priorities.length,7);assert.deepEqual(normalizeRequirements(JSON.parse(JSON.stringify(p))),p);
 assert.equal(selectedLabels(p).length,19);
 p.scenarios=p.scenarios.filter(id=>id!=='local-ai');assert(!normalizeRequirements(p).scenarios.includes('local-ai'));
});
test('legacy saved state migrates once; battery cannot become an enabled selection',()=>{
 const old={budget:[5000,12000],os:'macOS',scenarios:['办公学习','编程开发','设计创作','游戏娱乐'],priorities:['长续航','轻薄便携']};
 const next=normalizeRequirements(old);assert.deepEqual(next.scenarios,['documents','basic-coding','graphics','mainstream-games']);
 assert.deepEqual(next.priorities,['portable']);assert.deepEqual(next.unavailableSelections,['battery']);
 assert.deepEqual(normalizeRequirements(next),next);assert.deepEqual(normalizeRequirements(null),defaultRequirements());
 assert(!normalizeRequirements({...req(),priorities:['battery']}).priorities.includes('battery'));
});
test('bridge maps every selected scene and explicitly lists unsupported soft preferences',()=>{
 const p=req();p.scenarios=SCENARIOS.map(s=>s.id);p.priorities=PRIORITIES.filter(p=>p.enabled).map(p=>p.id);
 const a=adaptLegacyScoring(p);assert.equal(a.scenarioMappings.length,12);assert.equal(a.preferences.scenarios.length,4);
 assert.equal(a.pendingPriorities.length,4);assert.deepEqual(a.preferences.priorities,['轻薄便携','大屏幕','高性价比']);
 assert.throws(()=>adaptLegacyScoring({...p,scenarios:['unknown-scene']}));
 assert.throws(()=>adaptLegacyScoring({...p,priorities:['battery']}));
});
test('memory, SSD, maximum weight include endpoints and reject unknown or invalid required fields',()=>{
 for(const [key,field,bound,fail] of [['minRamGb','ram_gb',32,16],['minSsdGb','ssd_gb',1024,512],['maxWeightKg','weight_kg',1.5,2]]){
  const p=req();p.hardConstraints[key]=bound;
  const rows=[product('pass'),product('out',{[field]:fail}),...['bad',null,undefined,0,NaN].map((v,i)=>product('missing'+i,{[field]:v}))];
  assert.deepEqual(filterCatalog(rows,p).map(p=>p.id),['pass']);
 }
});
test('GPU type uses corrected exact data, does not infer from names or require a discrete model',()=>{
 const p=req();p.hardConstraints.discreteGpu=true;
 const rows=[product('discrete'),product('apple',{gpu_type:'集成显卡',gpu_model:'M5 10核'}),product('arc',{gpu_type:'集成显卡',gpu_model:'Intel Arc B370'}),product('unknown',{gpu_type:null,gpu_model:'RTX5060'})];
 assert.deepEqual(filterCatalog(rows,p).map(p=>p.id),['discrete']);
 p.hardConstraints.discreteGpu=false;assert.equal(filterCatalog(rows,p).length,4);
});
test('combined hard conditions, budget and OS always run before scoring; no padding',()=>{
 const p=req();p.os='Windows';p.budget=[4000,8000];p.hardConstraints={minRamGb:32,minSsdGb:1024,maxWeightKg:1.5,discreteGpu:true};
 const rows=[product('yes'),product('price',{official_price_cny:8001}),product('os',{os:'macOS'}),product('ram',{ram_gb:16}),product('ssd',{ssd_gb:512}),product('weight',{weight_kg:1.6}),product('gpu',{gpu_type:'集成显卡'})];
 assert.deepEqual(rankForRequirements(rows,p).map(r=>r.product.id),['yes']);
 for(let n=0;n<=3;n++)assert.equal(rankForRequirements(Array.from({length:n},(_,i)=>product(String(i))),p).slice(0,3).length,n);
 assert.deepEqual(filterCatalog(rows,{...p,hardConstraints:{minRamGb:-1}}),[]);
});
test('optional soft selections never exclude candidates; pending preferences do not change old scores',()=>{
 const p=req(),rows=[product('a'),product('b',{gpu_type:'集成显卡',gpu_model:null})];
 const a=rankForRequirements(rows,p);const b=rankForRequirements(rows,{...p,priorities:['cpu-power','gpu-power','memory','storage']});
 assert.deepEqual(a,b);assert.equal(a.length,2);
 assert.deepEqual(rankForRequirements(rows,{...p,scenarios:[]}),[]);
 assert.deepEqual(a,rankCatalog(rows,{budget:p.budget,os:p.os,scenarios:['办公学习'],priorities:[]}));
});
test('real data, refresh/edit cycle, immutable inputs and finite scores across all 12 scenes',()=>{
 const rows=JSON.parse(fs.readFileSync(new URL('../src/data/catalog.json',import.meta.url),'utf8'));assert.equal(rows.length,78);
 const before=JSON.stringify(rows);
 for(const s of SCENARIOS){const p={...req(),scenarios:[s.id]};assert(rankForRequirements(rows,p).every(r=>Number.isFinite(r.totalScore)));}
 const p=req();p.hardConstraints={minRamGb:32,minSsdGb:1024,maxWeightKg:1.5,discreteGpu:true};
 assert.deepEqual(rankForRequirements(rows,p),rankForRequirements(rows,normalizeRequirements(JSON.parse(JSON.stringify(p)))));
 assert.equal(hardRequirementLabels(p).length,4);
 p.hardConstraints.maxWeightKg=1.3;assert(rankForRequirements(rows,p).every(r=>r.product.weight_kg<=1.3));assert.equal(JSON.stringify(rows),before);
});
