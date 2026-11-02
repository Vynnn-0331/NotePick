import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchCPU, matchGPU, normalizeHardwareName } from '../src/services/hardwareMatching.js';
import { rankCatalog, scoreCandidate } from '../src/services/scoreCatalog.js';
import { resolveScoringConfig } from '../src/services/scoringConfig.js';
const product = (id, extra={})=>({id,brand:'test fixture',model:id,official_price_cny:9000,os:'Windows',cpu_model:'Core Ultra X7 358H',gpu_model:'RTX 5060 Laptop GPU',gpu_type:'独立显卡',ram_gb:32,ssd_gb:1024,weight_kg:1.7,screen_inches:14,...extra});
const pref = (scenarios=[],priorities=[])=>({budget:[2000,50000],os:'不限',scenarios,priorities});
const top = (rows,p)=>rankCatalog(rows,p)[0].product.id;

test('office prioritizes affordable adequate configuration instead of high-end dGPU',()=>{
 const cheap=product('office',{official_price_cny:6000,ram_gb:16,ssd_gb:512,weight_kg:1.2,gpu_model:null,gpu_type:'集成显卡'});
 const game=product('game',{official_price_cny:24000,weight_kg:2.8,gpu_model:'RTX 5070 Ti Laptop GPU'});
 assert.equal(top([game,cheap],pref(['办公学习'])),'office');
});
test('gaming distinguishes documented GPUs and recognizes contextual shorthand uncertainty',()=>{
 const a=product('5060'),b=product('5070',{gpu_model:'RTX 5070 Ti Laptop GPU'});
 assert.equal(top([a,b],pref(['游戏娱乐'])),'5070');
 assert.equal(matchGPU('RTX5060').status,'ambiguous');
 const contextual=matchGPU('RTX5060',{laptopContext:true});
 assert.equal(contextual.status,'contextual_tier');assert.equal(contextual.benchmark,null);
});
test('programming memory need changes ranking, capacity caps prevent infinite gains',()=>{
 const a=product('16',{ram_gb:16,official_price_cny:8000}),b=product('32',{ram_gb:32,official_price_cny:10000});
 assert.equal(top([a,b],pref(['编程开发'])),'32');
 assert.equal(scoreCandidate(product('128',{ram_gb:128}),pref(['编程开发'])).dimensions.memory.score,100);
});
test('design assigns meaningful CPU/GPU and memory weights with explicit color caveat',()=>{
 const p=pref(['设计创作']),w=resolveScoringConfig(p).weights;
 assert(w.cpu>=.25 && w.gpu>=.25 && w.memory>=.25);
 const a=product('low',{cpu_model:'Ryzen 7 H 255',gpu_model:'Radeon 780M',ram_gb:16});
 const b=product('high',{cpu_model:'Core Ultra 9 290HX Plus',gpu_model:'RTX 5070 Ti Laptop GPU'});
 assert.equal(top([a,b],p),'high');assert(scoreCandidate(b,p).warnings.some(x=>x.includes('色域')));
});
test('portability changes similar candidates without inferring battery life',()=>{
 const heavy=product('heavy',{weight_kg:2.5,official_price_cny:8000}),light=product('light',{weight_kg:1.1,official_price_cny:9000});
 assert.equal(top([heavy,light],pref(['编程开发'])),'heavy');
 assert.equal(top([heavy,light],pref(['编程开发'],['轻薄便携'])),'light');
});
test('large-screen preference uses measured inches and changes order',()=>{
 const small=product('small',{screen_inches:13,official_price_cny:8000}),big=product('big',{screen_inches:17,official_price_cny:9000});
 assert.equal(top([small,big],pref(['编程开发'])),'small');
 assert.equal(top([small,big],pref(['编程开发'],['大屏幕'])),'big');
});
test('multiple scenarios average all weights and satisfy the strongest capacity target',()=>{
 const mixed=resolveScoringConfig(pref(['办公学习','游戏娱乐']));
 assert(Math.abs(mixed.weights.gpu-.25)<1e-12);assert.equal(mixed.targets.memory,24);
 assert.deepEqual(resolveScoringConfig(pref(['办公学习','游戏娱乐'])),resolveScoringConfig(pref(['游戏娱乐','办公学习'])));
});
test('unknown hardware stays null, neutral aggregate is not a lowest-performance claim',()=>{
 const scored=scoreCandidate(product('unknown',{cpu_model:'unknown CPU',gpu_model:null,gpu_type:'集成显卡'}),pref(['游戏娱乐']));
 assert.equal(scored.dimensions.cpu.score,null);assert.equal(scored.dimensions.gpu.score,null);
 assert.equal(scored.dimensions.gpu.usedForAggregation,50);
 assert(scored.uncertaintyInterval[1]>scored.uncertaintyInterval[0]);assert(scored.warnings.length>0);
 const ranked=rankCatalog([product('unknown',{gpu_model:null,gpu_type:'集成显卡'})],pref());assert.equal(ranked.length,1);
});
test('3A hard conditions cannot be bypassed by any score',()=>{
 const rows=[product('pass'),product('over',{official_price_cny:50001}),product('wrong-os',{os:'macOS'})];
 assert.deepEqual(rankCatalog(rows,{...pref(['游戏娱乐']),os:'Windows'}).map(p=>p.product.id),['pass']);
});
test('battery preference adds zero score and explicit insufficient-data notice',()=>{
 const p=product('battery');const plain=scoreCandidate(p,pref(['办公学习']));const battery=scoreCandidate(p,pref(['办公学习'],['长续航']));
 assert.equal(plain.totalScore,battery.totalScore);assert.deepEqual(plain.weights,battery.weights);
 assert(battery.warnings.some(x=>x.includes('长续航：数据不足，暂未评估')));
});
test('same database and preferences are reproducible, immutable and candidate-independent',()=>{
 const rows=Object.freeze([Object.freeze(product('a')),Object.freeze(product('b'))]);const p=pref(['编程开发']);
 assert.deepEqual(rankCatalog(rows,p),rankCatalog(rows,p));assert.equal(top(rows,p),'a');
 assert.equal(scoreCandidate(rows[0],p).totalScore,rankCatalog([...rows,product('extra',{official_price_cny:49000})],p).find(x=>x.product.id==='a').totalScore);
});
test('aliases preserve CPU suffixes, Apple core counts and desktop scope',()=>{
 assert.equal(matchCPU('酷睿 Ultra X7 358H').benchmark,33540);
 assert.equal(matchCPU('锐龙 R9-9955HX').benchmark,56367);
 assert.equal(matchCPU('M5 Pro 15核').benchmark,49093);
 assert.equal(matchCPU('M5 Pro 18核').benchmark,null);
 assert.equal(matchCPU('Ultra 9 290HX').benchmark,null);
 assert.notEqual(normalizeHardwareName('Core Ultra 7 251H'),normalizeHardwareName('Core Ultra 7 251HX'));
 assert.notEqual(normalizeHardwareName('Core 5 325'),normalizeHardwareName('Core Ultra 5 325'));
 assert.equal(matchGPU('RTX 5060 Desktop',{laptopContext:true}).tier,null);
 assert.equal(matchGPU('RTX3050',{laptopContext:true}).tier,null);
});
test('missing numerical data is not zero weight, cheapness or maximum performance',()=>{
 const p=scoreCandidate(product('missing',{weight_kg:null,screen_inches:null,ram_gb:null}),pref([],['轻薄便携','大屏幕']));
 assert.equal(p.dimensions.portability.score,null);assert.equal(p.dimensions.screen.score,null);assert.equal(p.dimensions.memory.score,null);
});
test('value preference depends on workload adequacy, not just the cheapest price',()=>{
 const cheap=product('cheap',{official_price_cny:5000,cpu_model:'Ryzen 7 H 255',gpu_model:'Radeon 780M',ram_gb:8,ssd_gb:256});
 const adequate=product('adequate',{official_price_cny:14000,gpu_model:'RTX 5070 Ti Laptop GPU'});
 const p=pref(['游戏娱乐'],['高性价比']);assert.equal(top([cheap,adequate],p),'adequate');
 assert(scoreCandidate(adequate,p).dimensions.value.score>scoreCandidate(cheap,p).dimensions.value.score);
});
test('real catalog retains all hard-qualified records including 40 null integrated GPUs',()=>{
 const rows=JSON.parse(readFileSync(new URL('../src/data/catalog.json',import.meta.url),'utf8'));
 const ranked=rankCatalog(rows,{...pref(['编程开发']),budget:[0,100000]});assert.equal(ranked.length,78);
 assert.equal(ranked.filter(x=>x.product.gpu_model===null && x.product.gpu_type==='集成显卡').length,40);
});

test('non-Apple CPU explanation never claims Apple core matching',()=>{
 assert(!matchCPU('Core Ultra X7 358H').reason.includes('Apple'));
 assert(matchCPU('M5 10核').reason.includes('Apple'));
});
