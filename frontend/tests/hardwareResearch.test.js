import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {canCompareFacts,validateSupplement,mergeReference} from '../../scripts/merge_performance_reference.mjs';
import {canonicalModel,validateReference} from '../../scripts/build_performance_reference.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
const external=read('data/reference/external_verified.json'),local=read('data/reference/performance_reference.json'),inventory=read('data/reference/hardware_models.json'),mapping=read('data/reference/product_gpu_mappings.json'),pending=read('data/reference/research_pending.json'),catalog=read('frontend/src/data/catalog.json');
const merge=()=>mergeReference(local,external,inventory,mapping,pending,catalog);
test('all facts trace to opened original pages and literal numeric verification notes',()=>{
 assert(validateSupplement(external,inventory,mapping,catalog));
 const allowed=['cpubenchmark.net','notebookcheck.net','notebookcheck.com','laptopmedia.com','apple.com','asus.com.cn','rog.asus.com.cn','dell.com'];
 for(const s of external.sources) assert(allowed.some(d=>new URL(s.url).hostname===d||new URL(s.url).hostname.endsWith('.'+d)));
 assert(validateReference(local,fs.readFileSync(new URL('../../../data/说明文档.md',import.meta.url),'utf8')));
 const bad=structuredClone(external);bad.facts[0].value=123456789;assert.throws(()=>validateSupplement(bad,inventory,mapping,catalog));
 bad.facts[0]=structuredClone(external.facts[0]);bad.sources[0].access='snippet_only';assert.throws(()=>validateSupplement(bad,inventory,mapping,catalog));
});
test('all 41 CPUs and 13 nonempty GPUs have an audit entry; coverage is disjoint per product',()=>{
 const u=merge();assert.equal(u.modelAudit.length,54);assert.equal(u.productAssessments.length,78);
 for(const kind of ['cpu','gpu']) assert.equal(Object.values(u.coverage[kind]).reduce((a,b)=>a+b),78);
 assert.equal(u.coverage.cpu.comparable,69);assert.equal(u.coverage.gpu.comparable,17);
 assert.equal(u.coverage.cpu.qualitative_only,3);assert.equal(u.coverage.gpu.qualitative_only,18);
 assert.equal(u.coverage.externalComparableCpuModels,33);assert.equal(u.coverage.externalComparableGpuModels,11);
});
test('RTX mobile identities require product-specific official evidence and stable configuration anchors',()=>{
 const u=merge();assert.equal(u.coverage.confirmedRtxMobileProducts,2);
 const all=u.productAssessments.filter(p=>p.gpuId==='gpu-rtx5060-unspecified');assert.equal(all.length,15);
 assert.equal(all.filter(p=>p.resolvedGpuId==='gpu-rtx5060-laptop').length,2);
 assert(all.filter(p=>!p.gpuIdentityMapping).every(p=>p.resolvedGpuId==='gpu-rtx5060-unspecified'&&p.gpuStatus!=='comparable'));
 const bad=structuredClone(mapping);bad.mappings[0].productId=all.find(p=>!p.gpuIdentityMapping).productId;assert.throws(()=>validateSupplement(external,inventory,bad,catalog));
 const changed=structuredClone(catalog);changed.find(p=>p.id===mapping.mappings[0].productId).ram_gb=128;assert.throws(()=>validateSupplement(external,inventory,mapping,changed));
 assert.notEqual(canonicalModel('RTX5060','gpu').id,canonicalModel('RTX5060 Laptop GPU','gpu').id);
 assert.notEqual(canonicalModel('RTX5060 Desktop GPU','gpu').id,canonicalModel('RTX5060 Laptop GPU','gpu').id);
});
test('Apple core counts, Intel Arc suffixes, CPU H/HX and Ultra names are not silently merged',()=>{
 const u=merge();
 for(const id of ['gpu-m58cores-unspecified','gpu-m510cores-unspecified','gpu-m5pro16cores-unspecified','gpu-m5pro20cores-unspecified'])assert(u.modelAudit.some(m=>m.modelId===id));
 for(const [a,b] of [['Core5 325','Core Ultra5 325'],['Core Ultra7 251H','Core Ultra7 251HX'],['Core Ultra9 290HX','Core Ultra9 290HX Plus']])assert.notEqual(canonicalModel(a).id,canonicalModel(b).id);
 assert.equal(u.modelAudit.find(m=>m.modelId==='cpu-coreultra9290hx').status,'unknown');
 const arc=external.facts.filter(f=>['gpu-arc130t-unspecified','gpu-arcb370-unspecified'].includes(f.modelId));assert(arc.length===2&&arc.every(f=>f.gpuType==='integrated'));
 const apple=external.facts.filter(f=>f.kind==='gpu'&&f.fullModelName.startsWith('Apple'));assert(apple.every(f=>f.gpuType==='integrated'));
});
test('40 empty integrated models remain legal, unmapped and have no fabricated benchmark',()=>{
 const u=merge(),missing=u.productAssessments.filter(p=>p.gpuModelMissingIntentional);assert.equal(missing.length,40);
 assert(missing.every(p=>p.gpuStatus==='missing_model_allowed'&&p.resolvedGpuId===null&&p.gpuExternalFactIds.length===0));
 const bad=structuredClone(mapping);bad.mappings[0].productId=missing[0].productId;assert.throws(()=>validateSupplement(external,inventory,bad,catalog));
});
test('specifications, desktop-only samples, unavailable pages and unknown variants cannot inflate measured coverage',()=>{
 const u=merge();assert(u.productAssessments.filter(p=>p.cpuId==='cpu-m612cores').every(p=>p.cpuStatus==='qualitative_only'));
 assert(u.productAssessments.filter(p=>p.gpuId==='gpu-m612cores-unspecified').every(p=>p.gpuStatus==='qualitative_only'));
 assert(!external.facts.some(f=>f.modelId==='gpu-m5max32cores-unspecified'&&f.value!==null));
 assert(!external.facts.some(f=>f.modelId==='gpu-m612cores-unspecified'&&f.value!==null));
 assert(u.productAssessments.filter(p=>p.gpuId==='gpu-rtx5070ti-unspecified').every(p=>p.gpuStatus!=='comparable'));
 assert(pending.accessAttempts.some(p=>p.result.includes('403')));
 assert(pending.items.every(p=>p.usableAsPerformance===false));
});
test('benchmark software, dimensions and graphics APIs remain separate, no universal comparisons',()=>{
 const a=external.facts.find(f=>f.modelId==='cpu-coreultra5336h'&&f.metric==='PassMark CPU Mark');
 const b=external.facts.find(f=>f.modelId==='cpu-coreultra5338h'&&f.metric==='PassMark CPU Mark');
 assert(canCompareFacts(a,b));assert(!canCompareFacts(a,external.facts.find(f=>f.metric==='PassMark Single Thread')));
 assert(!canCompareFacts(a,external.facts.find(f=>f.kind==='gpu')));
 assert(!canCompareFacts(external.facts.find(f=>f.comparisonGroup==='3DMark-SteelNomad-DX12'),external.facts.find(f=>f.comparisonGroup==='3DMark-SteelNomad-Metal')));
 assert(merge().externalRelations.every(r=>r.direction.universalPerformanceRanking===false&&r.statement.startsWith('仅')));
 assert(external.facts.filter(f=>f.gpuWatts).length===6);
});
test('supplements survive regeneration inputs and current runtime files are byte-identical',()=>{
 const before=JSON.stringify({external,local,inventory,mapping,pending,catalog});assert.deepEqual(merge(),merge());assert.equal(JSON.stringify({external,local,inventory,mapping,pending,catalog}),before);
 for(const [p,h] of Object.entries(read('data/reference/runtime_preservation.json')))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('../../'+p,import.meta.url))).digest('hex'),h);
 const saved=read('data/reference/performance_reference_unified.json');assert.deepEqual(saved,merge());
});
