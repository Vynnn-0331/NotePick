import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {canonicalModel} from './build_performance_reference.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
export function compileRuntime(unified,catalog,policy={sources:{}}){
 const sourceMap=Object.fromEntries(unified.externalKnowledge.sources.map(s=>['web:'+s.id,{...s,id:'web:'+s.id}]));
 for(const e of unified.localKnowledge.evidence)sourceMap['local:'+e.id]={id:'local:'+e.id,title:e.section,url:null,document:e.source,lineStart:e.lineStart,lineEnd:e.lineEnd,sha256:e.documentSha256,confidence:'local_document_not_reverified'};
 for(const [id,s] of Object.entries(policy.sources))sourceMap['policy:'+id]={...s,id:'policy:'+id};
 const facts=unified.externalKnowledge.facts.map(f=>({...f,sourceIds:['web:'+f.sourceId],channel:f.kind==='gpu'?f.metric.startsWith('3DMark')?'gpuGraph':f.metric.startsWith('SPECviewperf')?'gpuProfessional':null:/Single|单核/.test(f.metric)?'cpuSingle':f.level==='comparable'?'cpuMulti':null}));
 for(const o of unified.localKnowledge.observations){
  if(facts.some(f=>f.modelId===o.subject.id&&f.metric===o.metric))continue; // Keep verified snapshots ahead of local approximations.
  facts.push({id:o.id,modelId:o.subject.id,fullModelName:o.subject.standardName,kind:o.kind,metric:o.metric,value:o.value,level:'comparable',comparisonGroup:'local-snapshot:'+o.metric,channel:o.kind==='gpu'?'gpuGraph':/Single|单核/.test(o.metric)?'cpuSingle':'cpuMulti',samples:null,confidence:'local_only',mobileScope:'local_document_context',context:o.context,limitations:o.limitations,sourceIds:o.evidenceRefs.map(id=>'local:'+id)});
 }
 const models={};
 for(const m of unified.modelAudit)models[m.modelId]={id:m.modelId,name:m.fullModelName,kind:m.kind,aliases:m.rawAliases,status:m.status};
 for(const f of facts)if(!models[f.modelId])models[f.modelId]={id:f.modelId,name:f.fullModelName,kind:f.kind,aliases:[f.fullModelName],status:f.level};
 const aliases={};for(const m of Object.values(models))for(const name of [...m.aliases,m.name]){const id=canonicalModel(name,m.kind)?.id;if(id){if(aliases[id]&&aliases[id]!==m.id)throw new Error('型号别名冲突 '+name);aliases[id]=m.id;}}
 // Explicit variant names absent from the original inventory must never promote unspecified RTX aliases.
 for(const id of ['gpu-rtx5060-laptop','gpu-rtx5070ti-laptop'])aliases[id]=id;
 const assessments=catalog.map(p=>unified.productAssessments.find(a=>a.productId===p.id)??{productId:p.id,cpuId:canonicalModel(p.cpu_model,'cpu')?.id??null,gpuId:canonicalModel(p.gpu_model,'gpu')?.id??null,gpuTypeInExistingCatalog:p.gpu_type,resolvedGpuId:null,gpuIdentityMapping:null});
 const products={};for(const a of assessments){const p=catalog.find(p=>p.id===a.productId);assert(p);assert.equal(canonicalModel(p.cpu_model,'cpu')?.id,a.cpuId);assert.equal(canonicalModel(p.gpu_model,'gpu')?.id??null,a.gpuId);assert.equal(p.gpu_type,a.gpuTypeInExistingCatalog);if(a.gpuIdentityMapping)for(const [k,v] of Object.entries(a.gpuIdentityMapping.expectedCatalogFields))assert.equal(p[k],v,'映射配置已变化');products[p.id]={productId:p.id,cpuId:a.cpuId,gpuId:a.gpuId,resolvedGpuId:a.resolvedGpuId,gpuIdentityMapping:a.gpuIdentityMapping,signature:Object.fromEntries(['model','cpu_model','gpu_model','gpu_type','ram_gb','ssd_gb','screen_inches'].map(k=>[k,p[k]]))};}
 const relations=unified.localKnowledge.relations.map(r=>({...r,sourceIds:r.evidenceRefs.map(id=>'local:'+id)}));
 // External relations reference exact fact observations; preserve their limitations and provenance.
 relations.push(...unified.externalRelations.map(r=>({...r,relation:'higher_in_named_metric',metric:facts.find(f=>r.factIds.includes(f.id))?.metric??null,observationRefs:r.factIds,direction:{...r.direction,higherSubjectId:r.direction.higher,lowerSubjectId:r.direction.lower},sourceIds:r.sourceIds.map(id=>'web:'+id)})));
 const result={schemaVersion:1,version:'3B-3',sourceFile:'data/reference/performance_reference_unified.json',workloadPolicySources:policy,models,aliases,facts,products,relations,sources:sourceMap,workloads:unified.localKnowledge.workloads.map(w=>({...w,sourceIds:w.evidenceRefs.map(id=>'local:'+id)})),principles:unified.principles};
 assert.equal(Object.keys(products).length,catalog.length);for(const f of facts)assert(f.sourceIds.every(id=>sourceMap[id]));return result;
}
export function main(){
 const bytes=fs.readFileSync(path.join(root,'data/reference/performance_reference_unified.json'));
 const out=compileRuntime(JSON.parse(bytes),read('frontend/src/data/catalog.json'),read('data/reference/workload_policy_sources.json'));out.sourceSha256=crypto.createHash('sha256').update(bytes).digest('hex');
 fs.writeFileSync(path.join(root,'frontend/src/data/performanceRuntime.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({products:Object.keys(out.products).length,facts:out.facts.length,sources:Object.keys(out.sources).length,offline:true}));return out;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main();
