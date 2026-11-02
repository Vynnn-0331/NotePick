import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {buildRecommendationComparison} from '../src/services/recommendationComparison.js';
import {recommendCatalog} from '../src/services/recommendationEngine.js';
import {defaultRequirements} from '../src/services/requirements.js';
import {createEvidenceIndex,modelKey} from '../src/services/hardwareEvidence.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
const catalog=read('frontend/src/data/catalog.json');
const req=(priorities=[])=>({...defaultRequirements(),budget:[5000,20000],scenarios:['documents'],priorities});
const row=(id,changes={})=>({product:{id,model:id,official_price_cny:8000,weight_kg:1.5,ram_gb:32,ssd_gb:1024,screen_inches:14,os:'Windows',gpu_model:null,...changes},needs:{ids:['documents'],channels:{}},reasons:['原始用途依据'],warnings:['原始限制'],suitability:{capacities:{}}});
const flat=c=>[c.summary,c.fitDescription,...c.advantages.map(a=>a.text),...c.cautions,c.neutral].filter(Boolean).join('；');
test('3C: 0/1/2/3 preserves exact membership/order; fewer than two never compares',()=>{
 for(let n=0;n<=3;n++){const rows=Array.from({length:n},(_,i)=>row(String(i),{official_price_cny:6000+i*1000})),out=buildRecommendationComparison(rows,req());assert.deepEqual(out.map(c=>c.id),rows.map(r=>r.product.id));assert(out.every(c=>c.advantages.length<=2&&c.cautions.length<=2));if(n<2)assert(out.every(c=>!c.canCompare&&!c.advantages.length&&!c.neutral));}
 assert.throws(()=>buildRecommendationComparison([row('a'),row('b'),row('c'),row('d')],req()),RangeError);
});
test('3C: relative price, weight, RAM, SSD and screen require strictly better known values for all shown peers',()=>{
 const cases=[['price','official_price_cny',6000,8000],['weight','weight_kg',1.2,1.5],['memory','ram_gb',64,32],['storage','ssd_gb',2048,1024],['screen','screen_inches',16,14]];
 const prefs={price:'value',weight:'portable',memory:'memory',storage:'storage',screen:'large-screen'};
 for(const [key,field,a,b] of cases){const rows=[row('best',{[field]:a}),row('other',{[field]:b}),row('third',{[field]:b})];const result=buildRecommendationComparison(rows,req([prefs[key]]));assert.equal(result[0].advantages[0].kind,key);assert.deepEqual(result[0].advantages[0].otherProductIds,['other','third']);assert(result.slice(1).every(c=>!c.advantages.some(a=>a.kind===key)));
  rows[1].product[field]=a;assert(!buildRecommendationComparison(rows,req())[0].advantages.some(a=>a.kind===key));
  rows[1].product[field]=null;assert(!buildRecommendationComparison(rows,req())[0].advantages.some(a=>a.kind===key));
 }
});
test('3C: unknown/zero/NaN are not cheapness, portability, or capacity advantages; identical specs remain neutral',()=>{
 for(const unknown of [null,undefined,0,NaN]){const rows=[row('a',{official_price_cny:unknown,weight_kg:unknown,ram_gb:unknown,ssd_gb:unknown,screen_inches:unknown}),row('b')];const out=buildRecommendationComparison(rows,req(['portable']));assert(out.every(c=>c.advantages.length===0));assert(out.every(c=>! /0kg|NaN|undefined/.test(flat(c))));}
 const out=buildRecommendationComparison([row('a'),row('b'),row('c')],req());assert(out.every(c=>c.neutral&&c.advantages.length===0));
});
test('3C: active preference determines explanation focus without changing product order; marketing name gives no advantage',()=>{
 const rows=[row('a',{official_price_cny:6000,weight_kg:1,ram_gb:64,ssd_gb:2048,screen_inches:16,model:'AI 电竞 专业 全能 最强'}),row('b')];
 for(const [id,key] of [['portable','weight'],['memory','memory'],['storage','storage'],['value','price'],['large-screen','screen']]){const out=buildRecommendationComparison(rows,req([id]));assert.equal(out[0].advantages[0].kind,key);assert.deepEqual(out.map(c=>c.id),['a','b']);assert(!/专业级|保证流畅|性能最强|完美适合|性价比之王|100%/.test(flat(out[0])));}
});
test('3C: original reasons/limits remain intact, input deep-freeze and explanation contain no internal scores',()=>{
 const rows=JSON.parse(JSON.stringify([row('a',{weight_kg:1}),row('b')]));rows[0].ranking={utility:99.998};const before=JSON.stringify(rows);const freeze=o=>{Object.values(o).forEach(v=>{if(v&&typeof v==='object')freeze(v)});return Object.freeze(o)};freeze(rows);
 const out=buildRecommendationComparison(rows,req(['portable']));assert.equal(JSON.stringify(rows),before);assert.deepEqual(out[0].originalReasons,rows[0].reasons);assert.deepEqual(out[0].originalWarnings,rows[0].warnings);assert(out.every(c=>! /99\.998|[%％]|匹配度|满足度|\/100/.test(flat(c))));
});
test('3C: performance advantage requires common metric, adequate gap, exact scope and traceable evidence; same model no SKU claim',()=>{
 const knowledge={sources:{s:{title:'synthetic test'}},products:{},aliases:{},models:{},relations:[],workloads:[],facts:[]};
 for(const [name,value] of [['Chip A',10000],['Chip B',3000],['Chip C',3000]]){const id=modelKey(name,'cpu');knowledge.models[id]={id};knowledge.aliases[id]=id;knowledge.facts.push({id:name,modelId:id,channel:'cpuMulti',value,level:'comparable',metric:'Multi test',comparisonGroup:'Same platform',samples:100,confidence:'medium',sourceIds:['s']});}
 const index=createEvidenceIndex(knowledge),rows=['Chip A','Chip B','Chip C'].map(name=>({...row(name,{cpu_model:name}),needs:{ids:['large-projects'],channels:{cpuMulti:1}}}));
 let out=buildRecommendationComparison(rows,req(),{evidenceIndex:index});assert.equal(out[0].advantages[0].kind,'cpuMulti');assert.deepEqual(out[0].advantages[0].sourceIds,['s']);
 rows[1].product.cpu_model='Chip A';out=buildRecommendationComparison(rows,req(),{evidenceIndex:index});assert(!out[0].advantages.some(a=>a.kind==='cpuMulti'));
 rows[1].product.cpu_model='unknown';assert(!buildRecommendationComparison(rows,req(),{evidenceIndex:index})[0].advantages.some(a=>a.kind==='cpuMulti'));
 const gpuRows=[row('a',{gpu_model:'RTX5060'}),row('b',{gpu_model:'RTX3050'})];assert(buildRecommendationComparison(gpuRows,req(['gpu-power'])).every(c=>!c.advantages.some(a=>a.kind==='gpuGraph')));
});
test('3C: all 111 frozen 3B cases retain IDs, count, order and internal utilities before/after comparison, covering twelve scenes/seven preferences',()=>{
 const baseline=read('data/processed/phase3c_price_v2_baseline.json');assert.equal(baseline.cases.length,111);
 for(const c of baseline.cases){const matches=recommendCatalog(catalog,c.input);assert.deepEqual(matches.map(m=>m.product.id),c.ids,c.name);assert.deepEqual(matches.map(m=>m.ranking.utility),c.utility,c.name);const before=JSON.stringify(matches);const out=buildRecommendationComparison(matches.slice(0,3),c.input);assert.deepEqual(out.map(c=>c.id),c.ids.slice(0,3));assert.equal(JSON.stringify(matches),before);assert(out.every(c=>! /[%％]|匹配度|满足度|\/100/.test(flat(c))));}
});
test('3C: frozen 3B engines, hardware evidence, hard filter, original data and facts stay byte-identical',()=>{
 for(const [path,expected] of Object.entries(read('data/processed/phase3c_price_v2_baseline.json').hashes)){const actual=crypto.createHash('sha256').update(fs.readFileSync(new URL('../../'+path,import.meta.url))).digest('hex');assert.equal(actual,expected,path);}
});
