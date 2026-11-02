import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {recommendCatalog} from '../src/services/recommendationEngine.js';
import {filterCatalog} from '../src/services/filterCatalog.js';
import {WORKLOAD_RULES,RANKING_POLICY} from '../src/services/workloadPolicy.js';
import {defaultRequirements,PRIORITIES} from '../src/services/requirements.js';
import {performanceRuntime} from '../src/services/hardwareEvidence.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const catalog=JSON.parse(fs.readFileSync(new URL('../src/data/catalog.json',import.meta.url),'utf8'));
const definitions=Object.entries(WORKLOAD_RULES).map(([id,r])=>({name:r.label,requirements:{...defaultRequirements(),budget:[5000,20000],scenarios:[id],priorities:[]}}));
definitions.push({name:'开发与游戏多选',requirements:{...defaultRequirements(),budget:[8000,20000],os:'Windows',scenarios:['large-projects','mainstream-games'],priorities:['portable','memory']}},{name:'创作与七项偏好多选',requirements:{...defaultRequirements(),budget:[8000,20000],scenarios:['graphics','video-editing'],priorities:PRIORITIES.map(p=>p.id)}});
const cases=definitions.map(({name,requirements})=>{
 const all=recommendCatalog(catalog,requirements);
 const top=all.slice(0,3).map(m=>({id:m.product.id,model:m.product.model,cpu:m.product.cpu_model,gpu:m.product.gpu_model,gpuType:m.product.gpu_type,ram:m.product.ram_gb,ssd:m.product.ssd_gb,weight:m.product.weight_kg,price:m.product.official_price_cny,reasons:m.reasons,warnings:m.warnings,suitability:m.suitability,ranking:m.ranking,hardwareIdentity:{cpuId:m.hardware.cpu.id,gpuId:m.hardware.gpu.id,mobileConfirmed:m.hardware.gpu.mobileConfirmed,binding:m.hardware.binding,mapping:m.hardware.gpu.identityMapping},evidence:m.evidenceSummary,comparisonExamples:m.comparisonExamples}));
 const concerns=[];
 if(top.some(t=>t.evidence.cpuSingle.status==='unknown'&&t.evidence.cpuMulti.status==='unknown'))concerns.push('前列存在CPU性能未覆盖的商品；排序依赖已知容量、价格和重量，需人工核验');
 if(top.some(t=>/RTX/i.test(t.gpu??'')&&!t.hardwareIdentity.mobileConfirmed))concerns.push('部分RTX简写尚未确认移动版本，未使用Laptop数值；只作条件性用途方向');
 if(requirements.scenarios.includes('local-ai'))concerns.push('未验证显存/统一内存可用量、框架与模型；均为待核验候选，不是已验证可运行AI清单');
 if(requirements.scenarios.some(s=>['modeling-3d','aaa-games','mainstream-games'].includes(s)))concerns.push('图形证据跨API不可直接比较，显存/游戏/渲染实测缺失，不保证FPS或渲染后端');
 const obvious=[];if(name==='文档办公'&&top.every(t=>t.gpuType==='独立显卡'))obvious.push('办公前三均独显，需要检查是否过度配置');
 return {name,input:requirements,hardCandidateCount:filterCatalog(catalog,requirements).length,rankedCount:all.length,top,review:{automatedObviousIssues:obvious,manualReviewRequired:concerns.length>0,concerns,note:'自动检查不是人工验收结论；完整限制和证据见每台商品'} };
});
const out={engine:'3B-3 native requirements',generatedFrom:performanceRuntime.sourceFile,sourceSha256:performanceRuntime.sourceSha256,policy:RANKING_POLICY,method:'硬筛选→全部合格候选间的有限综合比较：同口径性能差距、软容量、偏好、价格/重量；核验风险只作提示；内部utility不是硬件跑分或匹配百分比',sources:performanceRuntime.sources,cases};
fs.writeFileSync(path.join(root,'data/processed/recommendation_cases_v3.json'),JSON.stringify(out,null,2)+'\n');
const md=['# 3B-3 真实商品推荐验证（14组）','','所有候选来自78条真实配置；没有硬编码任何型号的顺序。内部排序参数不在网页展示。这里展示真实配置和依据，数据不足不等于性能差。','',out.method,'','## 快速检查','','|用途|硬筛选候选|前三款（实际配置/价格）|人工核验关注|','|---|---|---|---|'];
for(const c of cases)md.push(`|${c.name}|${c.hardCandidateCount}|${c.top.map(p=>`${p.model} / ${p.ram}GB / ${p.ssd}GB / ¥${p.price}`).join('<br>')}|${c.review.concerns.join('；')||'未发现自动规则指出的明显问题，仍需核验具体软件'}|`);
for(const c of cases){md.push('',`## ${c.name}`,'',`输入：${JSON.stringify(c.input)}；硬筛选${c.hardCandidateCount}条；保留${c.rankedCount}条，展示${c.top.length}条。`,'');for(const [i,p] of c.top.entries()){
 md.push(`### ${i+1}. ${p.model}`,'',`ID：${p.id}；${p.cpu} / ${p.gpu??'集显型号未记录'} / ${p.ram}GB / ${p.ssd}GB / ${p.weight}kg / ¥${p.price}。`,'',...p.reasons.map(r=>'- '+r),'',`关键排序原因：容量缺口 ${p.suitability.capacityGap}，用途核验风险 ${p.suitability.workflowRisk}，风险仅提示不决定先后；全体候选内部utility=${p.ranking.utility.toFixed(4)}（不是跑分）。${p.suitability.workflowBasis}。`,'');
 md.push('- 实际排序贡献（仅开发报告）：'+JSON.stringify(p.ranking.details));
 if(p.suitability.backend){const backend=p.suitability.backend;md.push('- 计算后端：'+backend.status+'；'+backend.limitations);for(const d of backend.directions){md.push('  - '+d.label+'：'+d.basis+'；'+d.limitations);for(const id of d.sourceIds){const source=out.sources[id];md.push(`    - ${source?.url?`[${source.title}](${source.url})`:id}`);}}}
 for(const [channel,e] of Object.entries(p.evidence)){md.push(`- ${channel}：${e.status}。`);for(const f of e.facts){md.push(`  - ${f.metric}：${f.value}；口径 ${f.comparisonGroup}；样本${f.samples??'未明确'}；可信程度${f.confidence}。${f.context}。`);for(const id of f.sourceIds){const s=out.sources[id];md.push(`    - ${s.url?`[${s.title}](${s.url})`:`原始Markdown ${s.title}，行${s.lineStart}—${s.lineEnd}`}；${id}。`);}}}
 md.push('','限制：'+p.warnings.join('；')+'。','');
 }md.push('人工检查意见：'+(c.review.automatedObviousIssues.join('；')||'未触发已定义的明显异常规则，这不是所有任务适配的保证。'),...c.review.concerns.map(x=>'- '+x));}
md.push('','## 统计与维护','','这14组覆盖全部12用途，另有多用途/多偏好组合。相同预算与数据库仍可能在相邻用途产生相同结果，这是资料和任务需求交叠，不强行制造差异。','', '日常办公、基础编程和轻度网游可能出现未覆盖CPU/核显型号的低价候选，必须核验具体CPU/目标游戏；重负载仅比较可比用途资料，完整性不单独加分，没有把未知产品删除。AI、3D、3A候选均有软件/显存限制；本报告不承诺自动检测不到的全部问题均不存在。',
 '', '执行 `npm run report:recommendations` 重建。先运行 `npm run knowledge:runtime` 更新由统一资料生成的前端参考。不修改唯一原始Excel/Markdown。旧scoring_cases.json保留为旧算法回归基线，现行结果以本文件为准。');
fs.writeFileSync(path.join(root,'data/processed/recommendation_cases_v3.md'),md.join('\n')+'\n');
console.log(JSON.stringify(cases.map(c=>({scene:c.name,candidates:c.hardCandidateCount,top:c.top.map(p=>({id:p.id,name:p.model,price:p.price,softConcern:p.suitability.softConcern})),issues:c.review.concerns})),null,2));
