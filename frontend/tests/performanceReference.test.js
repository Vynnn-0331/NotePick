import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { rankCatalog } from '../src/services/scoreCatalog.js';
import { SCENARIOS, POLICY, PREFERENCE_WEIGHTS } from '../src/services/scoringConfig.js';
import { canonicalModel, buildReference, validateReference } from '../../scripts/build_performance_reference.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const reference=JSON.parse(fs.readFileSync(path.join(root,'data/reference/performance_reference.json'),'utf8'));
const inventory=JSON.parse(fs.readFileSync(path.join(root,'data/reference/hardware_models.json'),'utf8'));
const coverage=JSON.parse(fs.readFileSync(path.join(root,'data/processed/performance_reference_coverage.json'),'utf8'));
const text=fs.readFileSync(path.join(root,'../data/说明文档.md'),'utf8');
const id=(s,k='cpu')=>canonicalModel(s,k)?.id;

test('all 78 records resolve to an explicit model or allowed missing GPU',()=>{
 assert.equal(inventory.records.length,78);assert.equal(new Set(inventory.records.map(r=>r.productId)).size,78);
 for(const r of inventory.records){
  assert(inventory.cpuModels.some(m=>m.id===r.cpuId));
  if(r.gpuId)assert(inventory.gpuModels.some(m=>m.id===r.gpuId));
  else assert(r.gpuModelMissingIntentional);
 }
 assert.equal(inventory.cpuModels.length,41);assert.equal(inventory.gpuModels.length,13);
 assert.equal(inventory.missingGpu.intentionalIntegrated,40);assert.equal(inventory.missingGpu.discreteMissing,0);
});
test('exact original aliases including whitespace remain represented and counts reconcile',()=>{
 assert.equal(inventory.cpuModels.reduce((n,m)=>n+m.productCount,0),78);
 assert.equal(inventory.gpuModels.reduce((n,m)=>n+m.productCount,0),38);
 assert.equal(new Set(inventory.cpuModels.flatMap(m=>m.rawAliases)).size,53);
 assert.equal(new Set(inventory.gpuModels.flatMap(m=>m.rawAliases)).size,14);
 const core=inventory.cpuModels.find(m=>m.rawAliases.includes('酷睿 5 320 '));assert(core);assert(core.rawAliases.includes('Intel Core 5 320'));
});
test('safe language and punctuation aliases unify without inventing CPUs',()=>{
 assert.equal(id('酷睿 Ultra X7 358H'),id('Intel Core Ultra X7-358H'));
 assert.equal(id('锐龙 R9-9955HX'),id('AMD Ryzen 9 9955HX'));
 assert.equal(id(' M5 10核 '),id('Apple M5 10核'));
});
test('CPU suffixes, Plus, family, AI and Apple cores never collapse',()=>{
 for(const [a,b] of [['Core Ultra 7 251H','Core Ultra 7 251HX'],['Core Ultra 9 290HX','Core Ultra 9 290HX Plus'],['Core 5 325','Core Ultra 5 325'],['Ryzen AI 9 H 465','Ryzen 9 H 465'],['M5 Pro 15核','M5 Pro 18核'],['M5 Pro 18核','M5 Max 18核'],['Core Ultra 9 285K','Core Ultra 9 285H']])assert.notEqual(id(a),id(b));
});
test('explicit Laptop aliases unify, unspecified and Desktop variants stay separate',()=>{
 assert.equal(id('RTX 5060移动版','gpu'),id('NVIDIA GeForce RTX 5060 Laptop GPU','gpu'));
 assert.equal(id('RTX 5070Ti Notebook GPU','gpu'),id('RTX 5070 Ti Laptop','gpu'));
 assert.equal(id('RTX5070Ti','gpu'),id('RTX5070 Ti','gpu'));
 assert.notEqual(id('RTX5060','gpu'),id('RTX 5060 Laptop GPU','gpu'));
 assert.notEqual(id('RTX 5060 Desktop GPU','gpu'),id('RTX 5060 Laptop GPU','gpu'));
 assert.notEqual(id('M5 8核','gpu'),id('M5 10核','gpu'));
});
test('Apple and current integrated Arc remain integrated, without blanket Arc inference',()=>{
 for(const m of inventory.gpuModels.filter(m=>/^Apple |^Intel Arc /.test(m.standardName)))assert.equal(m.classificationInCatalog,'集成显卡');
 const b390=reference.identities.find(f=>f.subject?.id===id('Intel Arc B390','gpu'));assert.equal(b390.type,'integrated');
 assert(!reference.identities.some(f=>f.subject?.id===id('Intel Arc A770','gpu')));
});
test('every performance fact resolves to exact source words and numeric observations',()=>{
 assert(validateReference(reference,text));
 assert.equal(reference.observations.length,20);assert.equal(reference.relations.length,9);
 for(const o of reference.observations){
  assert(o.metric);assert(o.confidence);assert(o.context);assert(o.sourceRefs.length);
  assert(o.evidenceRefs.every(id=>reference.evidence.some(e=>e.id===id)));
 }
 assert(reference.observations.filter(o=>o.metric==='PassMark Single Thread').some(o=>o.value===4057));
 assert(reference.observations.filter(o=>o.metric==='PassMark Single Thread').some(o=>o.value===3669));
 assert.equal(reference.operatingConditions.length,2);
 assert.equal(reference.operatingConditions[0].minimumWatts,45);
 assert.equal(reference.operatingConditions[0].maximumWatts,100);
 assert.equal(reference.operatingConditions[0].actualLaptopPowerKnown,false);
 assert(reference.relations.filter(r=>r.relation==='higher_in_named_metric').every(r=>r.direction.onlyInStatedContext));
 assert.equal(reference.discrepancies.length,1);
 assert.deepEqual([...new Set(reference.discrepancies[0].values)],[33540,33541]);
});
test('unknown hardware has no generated benchmark, and conditional RTX is not promoted',()=>{
 const m6=inventory.cpuModels.find(m=>m.rawAliases.includes('M6 12核'));assert.equal(m6.observationRefs.length,0);
 const pro18=inventory.cpuModels.find(m=>m.rawAliases.includes('M5 Pro 18核'));assert.equal(pro18.observationRefs.length,0);
 const rtx=inventory.gpuModels.find(m=>m.rawAliases.includes('RTX5060'));assert.equal(rtx.scope,'unspecified');assert.equal(rtx.observationRefs.length,0);assert.equal(rtx.performanceLevel,'conditional_position');assert(rtx.conditionalEvidenceRefs.length);
 for(const m of [...inventory.cpuModels,...inventory.gpuModels]){assert(!('performanceScore' in m));assert(!('rank' in m));}
});
test('coverage does not inflate from aliases, background tiers or new singlecore observations',()=>{
 assert.equal(coverage.cpuMulticore.after,35);assert.equal(coverage.cpuMulticore.increase,0);
 assert.equal(coverage.gpuStrict.after,0);assert.equal(coverage.gpuConditional.after,18);
 assert.equal(coverage.cpuSinglecore.after,8);
 for(const list of [coverage.missingCpu,coverage.missingGpuModels])for(let i=1;i<list.length;i++)assert(list[i-1].productCount>=list[i].productCount);
});
test('reference extraction is deterministic and source files match recorded hashes',()=>{
 assert.deepEqual(buildReference(text),buildReference(text));
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'../data/电脑数据.xlsx'))).digest('hex'),inventory.sourceSha256);
 assert.equal(crypto.createHash('sha256').update(text).digest('hex'),reference.source.sha256);
});

test('new reference does not change existing 3B policies or seven real-case rankings',()=>{
 const old=JSON.parse(fs.readFileSync(path.join(root,'data/processed/scoring_cases.json'),'utf8'));
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'frontend/src/data/catalog.json'),'utf8'));
 assert.deepEqual(old.policy,{SCENARIOS,POLICY,PREFERENCE_WEIGHTS});
 for(const c of old.cases){
  const simple=rows=>rows.map(r=>({id:r.product.id,total:r.totalScore,dimensions:r.dimensions}));
  assert.deepEqual(simple(rankCatalog(catalog,c.preferences)),simple(c.ranked));
 }
});

test('all nine relations retain negation, scoped statements and non-universal directions',()=>{
 assert.equal(reference.relations.length,9);
 for(const r of reference.relations){
  assert(r.statement.includes('仅'));
  assert(/不能|不代表|不建立/.test(r.limitations));
  assert.equal(r.direction.universalPerformanceRanking,false);
  assert.equal(r.direction.onlyInStatedContext,true);
  if(r.kind==='gpu'){
   assert(r.limitations.startsWith('不能据此推断：'));
   assert(r.limitations.includes(r.prohibitedInference));
  }
 }
 const r=reference.relations.find(r=>r.subjects.some(s=>s.standardName.includes('4060')));
 assert(r.limitations.includes('不能据此推断：所有游戏、功耗设置均领先'));
});
