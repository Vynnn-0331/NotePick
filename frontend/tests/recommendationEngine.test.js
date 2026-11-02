import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createEvidenceIndex,evidenceReliability,modelKey,performanceRuntime} from '../src/services/hardwareEvidence.js';
import {recommendCatalog,assessCandidate} from '../src/services/recommendationEngine.js';
import {WORKLOAD_RULES,resolveNeeds} from '../src/services/workloadPolicy.js';
import {SCENARIOS,PRIORITIES,defaultRequirements} from '../src/services/requirements.js';
import {filterCatalog} from '../src/services/filterCatalog.js';
import {describeRecommendation} from '../src/services/recommendationDisplay.js';
import {compileRuntime} from '../../scripts/build_recommendation_knowledge.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
const catalog=read('frontend/src/data/catalog.json');
const pref=(scenarios=['documents'],priorities=[])=>({...defaultRequirements(),budget:[2000,30000],scenarios,priorities});
const product=(id,extra={})=>({id,model:id,cpu_model:'CPU A',gpu_model:'GPU A',gpu_type:'独立显卡',ram_gb:32,ssd_gb:1024,weight_kg:1.5,screen_inches:14,official_price_cny:6000,os:'Windows',...extra});
function fixture({samples=100,groupA='Test-Graphics-DX12',groupB=groupA}={}){
 const facts=[],aliases={},models={};
 const add=(kind,name,channel,value,group,n=samples)=>{const id=modelKey(name,kind);aliases[id]=id;models[id]={id,name,kind};facts.push({id:kind+'-'+channel+name,modelId:id,fullModelName:name,kind,channel,value,metric:channel,comparisonGroup:group,level:'comparable',samples:n,confidence:'medium',context:'synthetic test fixture',sourceIds:['test'],mobileScope:'mobile'});};
 add('cpu','CPU A','cpuSingle',3000,'Test-Single');add('cpu','CPU B','cpuSingle',6000,'Test-Single');add('cpu','CPU A','cpuMulti',15000,'Test-Multi');add('cpu','CPU B','cpuMulti',45000,'Test-Multi');
 add('gpu','GPU A','gpuGraph',5000,groupA);add('gpu','GPU B','gpuGraph',20000,groupB);
 return createEvidenceIndex({facts,aliases,models,products:{},relations:[],sources:{test:{title:'Test fixture'}},workloads:[]});
}
const idx=fixture();const run=(rows,p)=>recommendCatalog(rows,p,{evidenceIndex:idx});
const first=(rows,p)=>run(rows,p)[0]?.product.id;
test('all twelve scene IDs are distinct native rules with task focus, limits and soft references',()=>{
 assert.deepEqual(Object.keys(WORKLOAD_RULES).sort(),SCENARIOS.map(s=>s.id).sort());
 for(const s of SCENARIOS){const n=resolveNeeds(pref([s.id]));assert.equal(n.rules.length,1);assert.equal(n.rules[0].id,s.id);assert(n.rules[0].primary.length&&n.rules[0].limits.length);assert(n.ram>0&&n.ssd>0);}
 const both=resolveNeeds(pref(['documents','large-projects','aaa-games']));assert.equal(both.ram,32);assert.equal(both.ssd,1024);assert(both.channels.cpuMulti&&both.channels.gpuGraph&&both.channels.responsive);
});
test('runtime is deterministically generated only from unified data and explicit policy sources',()=>{
 const u=read('data/reference/performance_reference_unified.json'),policy=read('data/reference/workload_policy_sources.json');const compiled=compileRuntime(u,catalog,policy);const {sourceSha256,...saved}=performanceRuntime;assert.deepEqual(saved,compiled);
 assert.equal(performanceRuntime.relations.length,11);assert(performanceRuntime.relations.filter(r=>r.id.startsWith('web-relation-')).every(r=>r.direction.higherSubjectId&&r.direction.lowerSubjectId&&r.observationRefs.length));
 assert.equal(sourceSha256,crypto.createHash('sha256').update(fs.readFileSync(new URL('../../data/reference/performance_reference_unified.json',import.meta.url))).digest('hex'));
 for(const f of performanceRuntime.facts){assert(f.sourceIds.every(s=>performanceRuntime.sources[s]));if(f.id.startsWith('web-'))assert.equal(f.value,u.externalKnowledge.facts.find(x=>x.id===f.id).value);}
});
test('all 78 resolve safely; 40 intentionally empty integrated GPUs remain null and eligible',()=>{
 const e=createEvidenceIndex();const ranked=recommendCatalog(catalog,pref());assert.equal(ranked.length,filterCatalog(catalog,pref()).length);
 const missing=catalog.filter(p=>p.gpu_model===null&&p.gpu_type==='集成显卡');assert.equal(missing.length,40);
 for(const p of missing){const h=e.hardwareFor(p);assert.equal(h.gpu.id,null);assert.equal(h.gpu.performance,null);assert.deepEqual(h.gpu.facts,[]);}
 for(const p of catalog){const h=e.hardwareFor(p);if(p.brand==='Apple'||/Arc|锐炫/.test(p.gpu_model??''))assert.equal(h.gpu.type,'集成显卡');}
});
test('Laptop mapping is product-specific, signature guarded and desktop identity never collapses',()=>{
 const e=createEvidenceIndex(),rtx=catalog.filter(p=>/RTX5060/.test(p.gpu_model??''));assert.equal(rtx.length,15);assert.equal(rtx.filter(p=>e.hardwareFor(p).gpu.mobileConfirmed).length,2);
 const p=rtx.find(p=>e.hardwareFor(p).gpu.mobileConfirmed);assert(!e.hardwareFor({...p,gpu_model:'RTX 5060 Desktop GPU'}).gpu.mobileConfirmed);
 assert(!e.hardwareFor({...p,ram_gb:128}).gpu.mobileConfirmed);
 assert.notEqual(modelKey('RTX5060','gpu'),modelKey('RTX5060 Laptop GPU','gpu'));assert.notEqual(modelKey('Core Ultra7 251H'),modelKey('Core Ultra7 251HX'));
});
test('CPU single and multicore stay separate; unlike tests / API groups abstain',()=>{
 const a=idx.hardwareFor(product('a')),b=idx.hardwareFor(product('b',{cpu_model:'CPU B',gpu_model:'GPU B'}));assert.equal(idx.compare(a,b,'cpuSingle').direction,-1);assert.equal(idx.compare(a,b,'cpuMulti').direction,-1);
 const diff=fixture({groupB:'Other-Graphics-Metal'});assert.equal(diff.compare(diff.hardwareFor(product('a')),diff.hardwareFor(product('b',{gpu_model:'GPU B'})),'gpuGraph').direction,null);
 const mismatched=fixture();mismatched.knowledge.facts.find(f=>f.kind==='gpu'&&f.fullModelName==='GPU B').channel='gpuProfessional'; // separate index required after editing test data
 const separate=createEvidenceIndex(mismatched.knowledge);assert.equal(separate.compare(separate.hardwareFor(product('a')),separate.hardwareFor(product('b',{gpu_model:'GPU B'})),'gpuGraph').direction,null);
});
test('low samples have bounded influence, close scores abstain, and no power-scan cherry picking',()=>{
 const single=fixture({samples:1}),reliable=fixture({samples:100});const pair=i=>i.compare(i.hardwareFor(product('a')),i.hardwareFor(product('b',{gpu_model:'GPU B'})),'gpuGraph');
 assert(pair(single).influenceLimit<=.2);assert(pair(single).influenceLimit<pair(reliable).influenceLimit);
 const k=fixture().knowledge;k.facts.find(f=>f.kind==='gpu'&&f.fullModelName==='GPU B').value=5050;const close=createEvidenceIndex(k);assert.equal(pair(close).direction,0);
 assert.equal(evidenceReliability({level:'identity_only',samples:100}),null);
 const known=createEvidenceIndex();const p=known.hardwareFor(product('x',{gpu_model:'RTX5070Ti Laptop GPU'}));assert(known.compare(p,p,'gpuGraph').direction===null); // only TGP scan in supplement
});
test('unknown performance remains null, not zero/50, and can still win by actual affordable configuration',()=>{
 const rows=[product('unknown',{cpu_model:'not covered',gpu_model:null,gpu_type:'集成显卡',official_price_cny:5000,weight_kg:1}),product('known',{official_price_cny:12000,weight_kg:2})];const r=run(rows,pref());assert.equal(r[0].product.id,'unknown');assert.equal(r[0].hardware.cpu.performance,null);assert.equal(r[0].hardware.gpu.performance,null);assert.equal(r[0].evidenceSummary.cpuSingle.status,'unknown');assert.deepEqual(r[0].evidenceSummary.cpuSingle.facts,[]);
});
test('office avoids paying for high-end GPU; heavy graphic tasks favor supported graph capability',()=>{
 const rows=[product('office',{official_price_cny:5500,weight_kg:1.2,gpu_type:'集成显卡'}),product('gaming',{official_price_cny:12000,weight_kg:3,cpu_model:'CPU B',gpu_model:'GPU B'})];
 assert.equal(first(rows,pref(['documents'])),'office');assert.equal(first(rows,pref(['aaa-games'])),'gaming');
});
test('a proven stronger integrated GPU can beat a weaker discrete GPU on a common metric',()=>{
 const rows=[product('discrete',{gpu_model:'GPU A'}),product('integrated',{gpu_model:'GPU B',gpu_type:'集成显卡'})];assert.equal(first(rows,pref(['aaa-games'])),'integrated');
});
test('all seven stable preferences have an explicit, observable role without filtering',()=>{
 const cases=[
 ['portable',product('a',{weight_kg:1.5}),product('b',{weight_kg:1.3,official_price_cny:7000}),'a','b'],
 ['cpu-power',product('a'),product('b',{cpu_model:'CPU B',official_price_cny:7000}),'a','b'],
 ['gpu-power',product('a'),product('b',{gpu_model:'GPU B',official_price_cny:6500}),'a','b'],
 ['memory',product('a'),product('b',{ram_gb:64,official_price_cny:6500}),'a','b'],
 ['storage',product('a'),product('b',{ssd_gb:2048,official_price_cny:6500}),'a','b'],
 ['large-screen',product('a'),product('b',{screen_inches:16,official_price_cny:6500}),'a','b'],
 ['value',product('a',{cpu_model:'CPU B',official_price_cny:6500}),product('b'),'a','b']];
 for(const [id,a,b,before,after] of cases){assert.equal(first([a,b],pref()),before,id+' baseline');assert.equal(first([a,b],pref(['documents'],[id])),after,id+' affects ranking');assert.equal(run([a,b],pref(['documents'],[id])).length,2);}
});
test('soft task references never remove records; hard budget/OS/RAM/SSD/weight/discrete still dominate',()=>{
 const p=pref(['aaa-games']);p.os='Windows';p.budget=[5000,8000];p.hardConstraints={minRamGb:32,minSsdGb:1024,maxWeightKg:1.5,discreteGpu:true};
 const rows=[product('pass'),product('budget',{official_price_cny:8001}),product('os',{os:'macOS'}),product('ram',{ram_gb:16}),product('ssd',{ssd_gb:512}),product('weight',{weight_kg:1.6}),product('gpu',{gpu_type:'集成显卡'})];assert.deepEqual(run(rows,p).map(r=>r.product.id),['pass']);
 const low=product('low',{ram_gb:8,ssd_gb:256});assert.equal(run([low],pref(['aaa-games'])).length,1);assert(run([low],pref(['aaa-games']))[0].warnings.some(w=>w.includes('软参考')));
 for(let n=0;n<=3;n++)assert.equal(run(Array.from({length:n},(_,i)=>product(String(i))),pref()).slice(0,3).length,n);
});
test('AI and video do not equate general graphics scores with compute or export performance',()=>{
 const rows=[product('a'),product('b',{gpu_model:'GPU B'})];for(const scene of ['local-ai','video-editing']){const r=run(rows,pref([scene]));assert(r.every(r=>r.comparisonExamples.every(c=>c.channel!=='gpuGraph')));assert(r.every(r=>r.warnings.some(w=>/后端|导出/.test(w))));}
});
test('multi-scene / preference order is deterministic, finite, immutable and displays no score',()=>{
 const rows=Object.freeze(catalog.map(p=>Object.freeze({...p})));const before=JSON.stringify(rows);const p=pref(['documents','local-ai','aaa-games'],PRIORITIES.map(p=>p.id));const a=recommendCatalog(rows,p),b=recommendCatalog(rows,{...p,scenarios:[...p.scenarios].reverse(),priorities:[...p.priorities].reverse()});
 assert.deepEqual(a,b);assert.deepEqual(a,recommendCatalog(rows,p));assert.equal(JSON.stringify(rows),before);assert(a.every(r=>Number.isFinite(r.ranking.utility)&&! /[%％]|匹配度|满足度|\/100/.test(describeRecommendation(r))));
});
test('every scenario and software rule source resolves locally and manufacturer identity is never numeric',()=>{
 for(const id of SCENARIOS.map(s=>s.id)){const r=recommendCatalog(catalog,pref([id]));assert(r.every(r=>r.engineVersion==='3B-3-price-v2'&&r.suitability.scenarios[0].id===id));for(const x of r.slice(0,1))for(const f of x.suitability.scenarios)assert(f.sourceIds.every(id=>performanceRuntime.sources[id]));}
 const m6=catalog.find(p=>p.cpu_model==='M6 12核');const r=assessCandidate(m6,pref());assert.equal(r.hardware.cpu.performance,null);assert(r.hardware.cpu.facts.every(f=>f.value===null));
});

test('metric names must agree even if a source accidentally uses the same comparison-group label',()=>{
 const k=fixture().knowledge;k.facts.find(f=>f.kind==='gpu'&&f.fullModelName==='GPU B').metric='Different benchmark';const i=createEvidenceIndex(k);
 assert.equal(i.compare(i.hardwareFor(product('a')),i.hardwareFor(product('b',{gpu_model:'GPU B'})),'gpuGraph').direction,null);
});
test('explicit qualitative relations remain scoped and cannot claim a universal ranking',()=>{
 const k=fixture().knowledge;k.facts=k.facts.filter(f=>f.kind!=='gpu');k.relations=[{id:'limited-test',kind:'gpu',relation:'higher_in_named_metric',direction:{higherSubjectId:modelKey('GPU B','gpu'),lowerSubjectId:modelKey('GPU A','gpu'),onlyInStatedContext:true,universalPerformanceRanking:false},limitations:'only named workload',observationRefs:[]}];const i=createEvidenceIndex(k);
 const c=i.compare(i.hardwareFor(product('b',{gpu_model:'GPU B'})),i.hardwareFor(product('a')),'gpuGraph');assert.equal(c.direction,1);assert(c.influenceLimit<=.12);assert.equal(c.status,'qualitative_scoped_relation');
 k.relations[0].direction.universalPerformanceRanking=true;const unsafe=createEvidenceIndex(k);assert.equal(unsafe.compare(unsafe.hardwareFor(product('b',{gpu_model:'GPU B'})),unsafe.hardwareFor(product('a')),'gpuGraph').direction,null);
});
test('new runtime compiler rejects stale SKU mapping and retains user hard conditions unchanged',()=>{
 const u=read('data/reference/performance_reference_unified.json'),p=read('data/reference/workload_policy_sources.json');const changed=structuredClone(catalog);changed[0].cpu_model='another CPU';assert.throws(()=>compileRuntime(u,changed,p));
 const req=pref(['large-projects']);req.hardConstraints={minRamGb:64,minSsdGb:2048,maxWeightKg:1.3,discreteGpu:true};const before=JSON.stringify(req);recommendCatalog(catalog,req);assert.equal(JSON.stringify(req),before);
});

test('quality: cross-risk candidates compare CPU, capacity and cost; verification alone cannot win',()=>{
 const index=fixture();
 const weak=product('verified',{cpu_model:'CPU A',ram_gb:16,ssd_gb:512,official_price_cny:9000});
 const strong=product('unknown-gpu',{cpu_model:'CPU B',gpu_model:null,ram_gb:32,ssd_gb:1024,official_price_cny:7000});
 const rows=recommendCatalog([weak,strong],pref(['modeling-3d']),{evidenceIndex:index});
 assert.notEqual(rows[0].suitability.softConcern,rows[1].suitability.softConcern);
 assert.equal(rows[0].product.id,'unknown-gpu');
 assert(rows[0].ranking.taskEvidence>0);assert(rows[0].ranking.capacityFit>0);
 assert.equal(rows.length,2);
});
test('quality: risk diagnostics alone do not enter utility and all qualified peers vote',()=>{
 const rows=run([product('a',{ram_gb:16}),product('b',{ram_gb:32}),product('c',{gpu_model:null})],pref(['modeling-3d']));
 assert(rows.every(r=>Number.isFinite(r.ranking.utility)));
 assert(rows.some(r=>r.ranking.capacityFit!==0));
 for(const r of rows)assert.equal(r.ranking.utility,r.ranking.taskEvidence+r.ranking.preference+r.ranking.fallback+r.ranking.capacityFit);
});
test('quality: same chip different SKUs do not assert measured whole-system differences',()=>{
 const a=idx.hardwareFor(product('a')),b=idx.hardwareFor(product('b',{weight_kg:2,official_price_cny:9000}));
 for(const ch of ['cpuSingle','cpuMulti','gpuGraph']){const c=idx.compare(a,b,ch);assert.equal(c.direction,0);assert.equal(c.comparisonStrength,0);}
});
test('quality: numerical gap matters only above uncertainty; sparse samples cap influence',()=>{
 const index=fixture(),a=index.hardwareFor(product('a')),b=index.hardwareFor(product('b',{cpu_model:'CPU B'}));
 const far=index.compare(a,b,'cpuMulti');
 const knowledge=structuredClone(index.knowledge);
 knowledge.facts.find(f=>f.modelId===modelKey('CPU B','cpu')&&f.channel==='cpuMulti').value=20000;
 const closer=createEvidenceIndex(knowledge),close=closer.compare(closer.hardwareFor(product('a')),closer.hardwareFor(product('b',{cpu_model:'CPU B'})),'cpuMulti');
 assert(far.comparisonStrength>close.comparisonStrength);
 const sparse=fixture({samples:1});const low=sparse.compare(sparse.hardwareFor(product('a')),sparse.hardwareFor(product('b',{cpu_model:'CPU B'})),'cpuMulti');assert(low.comparisonStrength<=.2);
});
test('quality: unknown remains an abstention, and heavy graphics has no default weight bonus',()=>{
 const unknown=idx.hardwareFor(product('u',{cpu_model:'uncovered',gpu_model:null}));
 assert.equal(idx.compare(unknown,idx.hardwareFor(product('a')),'gpuGraph').direction,null);
 const rows=run([product('a',{weight_kg:1}),product('b',{weight_kg:3})],pref(['aaa-games']));
 assert.equal(rows[0].ranking.utility,rows[1].ranking.utility);
 assert.equal(first([product('a',{weight_kg:3}),product('b',{weight_kg:1})],pref(['aaa-games'],['portable'])),'b');
});

test('quality: clear heavy-graphics evidence is not reversed solely by soft portability or spare memory',()=>{
 const a=product('fast-graphics',{gpu_model:'GPU B',ram_gb:32,weight_kg:3}),b=product('extras',{gpu_model:'GPU A',ram_gb:64,weight_kg:1});
 assert.equal(first([b,a],pref(['aaa-games'],['portable','memory'])),'fast-graphics');
});

function backendFixture(){
 const k=structuredClone(fixture().knowledge);
 k.sources['policy:pytorch']={title:'offline CUDA installation conditions'};k.sources['policy:mps']={title:'offline MPS device availability conditions'};
 const id=modelKey('RTX 5060 Laptop GPU','gpu');k.models[id]={id,name:'RTX 5060 Laptop GPU',kind:'gpu'};k.aliases[id]=id;
 k.facts.push({id:'cuda-device-identity',modelId:id,kind:'gpu',channel:null,level:'identity',value:null,sourceIds:['test']});
 k.facts.find(f=>f.modelId===modelKey('GPU B','gpu')).comparisonGroup='Test-Graphics-Metal';
 return createEvidenceIndex(k);
}
test('workload fit: low default price alone does not outrank conditional gaming graphics direction; neither candidate is filtered',()=>{
 const cheap=product('cheap-unknown',{gpu_model:null,gpu_type:'集成显卡',official_price_cny:5000});
 const direction=product('conditional-graphics',{gpu_model:'unresolved discrete',official_price_cny:19000});
 for(const scene of ['mainstream-games','aaa-games']){
  const result=run([cheap,direction],pref([scene]));assert.equal(result[0].product.id,direction.id);assert.equal(result.length,2);
  assert.equal(result[0].evidenceSummary.gpuGraph.status,'unknown');assert.equal(result[1].hardware.gpu.id,null);
  assert(result[0].reasons.some(s=>s.includes('有限用途方向')));
 }
 assert.equal(run([cheap],pref(['mainstream-games']))[0].product.id,cheap.id);
});
test('workload fit: measured integrated graphics can beat discrete; platform remains a conditional gaming factor',()=>{
 const integrated=product('measured-integrated',{gpu_model:'GPU B',gpu_type:'集成显卡',official_price_cny:10000});
 assert.equal(first([product('discrete'),integrated],pref(['mainstream-games'])),integrated.id);
 const windows=product('windows',{official_price_cny:10000}),mac=product('mac',{os:'macOS',official_price_cny:5000});
 assert.equal(first([mac,windows],pref(['mainstream-games'])),windows.id);
});
test('workload fit: CUDA and Metal/MPS directions both have finite AI role, source links and unknown usable VRAM',()=>{
 const index=backendFixture(),unknown=product('unknown AI marketing',{gpu_model:null,gpu_type:'集成显卡',official_price_cny:5000});
 for(const p of [product('cuda',{gpu_model:'RTX 5060 Laptop GPU',official_price_cny:14000}),product('metal',{gpu_model:'GPU B',gpu_type:'集成显卡',os:'macOS',official_price_cny:14000})]){
  const all=recommendCatalog([unknown,p],pref(['local-ai']),{evidenceIndex:index});assert.equal(all[0].product.id,p.id);assert.equal(all.length,2);
  const backend=all[0].suitability.backend;assert.equal(backend.status,'potential_route');assert(backend.directions[0].sourceIds.every(id=>index.knowledge.sources[id]));
  assert.equal(backend.dedicatedVramGb,null);assert.equal(backend.availableUnifiedMemoryGb,null);assert(all[0].ranking.details['task:computeBackendDirection']>0);
  assert(all[0].comparisonExamples.every(c=>c.channel!=='gpuGraph'));assert(all[0].reasons.some(s=>s.includes('不能保证')));
 }
});
test('workload fit: AI name, missing GPU, unresolved RTX scope or wrong OS cannot manufacture backend evidence',()=>{
 const index=backendFixture();
 for(const p of [product('AI AI',{gpu_model:null}),product('RTX-unresolved',{gpu_model:'RTX5060'}),product('cuda-wrong-os',{gpu_model:'RTX 5060 Laptop GPU',os:'macOS'}),product('metal-wrong-os',{gpu_model:'GPU B'})]){
  const r=assessCandidate(p,pref(['local-ai']),index);assert.equal(r.suitability.backend.status,'unknown');assert.deepEqual(r.suitability.backend.directions,[]);
 }
});
test('workload fit: graphics benchmark values never change AI order; memory remains meaningful within a supported route',()=>{
 const k=backendFixture().knowledge,a=product('a',{gpu_model:'GPU B',os:'macOS',ram_gb:32,official_price_cny:11000}),b=product('b',{gpu_model:'GPU B',os:'macOS',ram_gb:16,official_price_cny:10000});
 const index=createEvidenceIndex(k),one=recommendCatalog([a,b],pref(['local-ai']),{evidenceIndex:index});assert.equal(one[0].product.id,'a');
 for(const f of k.facts.filter(f=>f.channel==='gpuGraph'))f.value*=1000;
 const two=recommendCatalog([a,b],pref(['local-ai']),{evidenceIndex:createEvidenceIndex(k)});assert.deepEqual(two.map(r=>r.ranking),one.map(r=>r.ranking));
});
test('workload fit: all 14 hard-candidate sets stay identical; unrelated complete rankings stay unchanged',()=>{
 const baseline=read('data/processed/workload_fit_before.json'),v2=read('data/processed/workload_fit_price_v2.json');let untouched=0;
 for(const c of baseline.cases){const rows=recommendCatalog(catalog,c.input);assert.deepEqual([...rows.map(r=>r.product.id)].sort(),[...c.allProductIds].sort());
  assert.deepEqual(rows.map(r=>r.product.id),v2.cases.find(x=>x.name===c.name).allProductIds,c.name);const n=resolveNeeds(c.input),priceAffected=!n.heavy&&!n.gaming&&(n.rules.some(r=>r.primary.some(k=>['cpuSingle','cpuMulti','gpuGraph','gpuProfessional'].includes(k)))||c.input.priorities.some(k=>['cpu-power','gpu-power'].includes(k)));if(!priceAffected&&!c.input.scenarios.some(s=>['local-ai','mainstream-games','aaa-games'].includes(s))){assert.deepEqual(rows.map(r=>r.product.id),c.allProductIds,c.name);untouched++;}
 }
 assert.equal(untouched,7);
 const ai=recommendCatalog(catalog,pref(['local-ai'])).slice(0,3);assert(ai.every(m=>m.suitability.backend.status==='potential_route'));
 const gaming=recommendCatalog(catalog,{...pref(['mainstream-games']),budget:[5000,20000]}).slice(0,3);assert(gaming.every(m=>m.product.gpu_type==='独立显卡'||m.evidenceSummary.gpuGraph.status!=='unknown'));
});
