import fs from 'node:fs';
import {recommendCatalog} from '../src/services/recommendationEngine.js';
import {createEvidenceIndex} from '../src/services/hardwareEvidence.js';
const index=createEvidenceIndex();
import {filterCatalog} from '../src/services/filterCatalog.js';
import {defaultRequirements} from '../src/services/requirements.js';
const base=new URL('../../data/processed/',import.meta.url);
const read=p=>JSON.parse(fs.readFileSync(new URL(p,base),'utf8'));
const before=read('ranking_quality_baseline/recommendation_cases_v3.json'),after=read('recommendation_cases_v3.json');
const catalog=JSON.parse(fs.readFileSync(new URL('../src/data/catalog.json',import.meta.url),'utf8'));
const ids=['np-1d12de8f38fb438b7a8d','np-2f271b787d9913fbf15d','np-3624f9018abd6ce52c0a','np-35041149e93a8cac19f0','np-940310f173ec86e6650b'];
const comparisons=after.cases.map((c,i)=>({scene:c.name,before:before.cases[i].top.map(p=>`${p.model} (${p.id})`),after:c.top.map(p=>`${p.model} (${p.id})`),candidates:c.hardCandidateCount,concerns:c.review.concerns}));
const diagnostics=[];
for(const scene of ['modeling-3d','aaa-games','video-editing','large-projects','documents']){
 // One common budget for all five workloads. Keep the normal 20k budget as an additional eligibility check.
 const req={...defaultRequirements(),budget:[5000,40000],scenarios:[scene],priorities:[]};
 const all=recommendCatalog(catalog,req),normal=filterCatalog(catalog,{...req,budget:[5000,20000]});
 const targets=ids.map(id=>{const p=catalog.find(p=>p.id===id),m=all.find(m=>m.product.id===id);return {product:p,eligible:!!m,eligibleAt20000:normal.some(p=>p.id===id),position:m?all.indexOf(m)+1:null,contributions:m?.ranking,unknowns:m?.warnings,evidence:m?.evidenceSummary,identity:m?.hardware.gpu.id,comparisons:m?ids.filter(x=>x!==id).map(other=>{const b=all.find(m=>m.product.id===other);return b?{other,comparisons:['cpuSingle','cpuMulti','gpuGraph','gpuProfessional'].map(channel=>index.compare(m.hardware,b.hardware,channel))}:null}):[]};});
 diagnostics.push({scene,requirements:req,candidates:all.length,top:all.slice(0,3).map(m=>m.product.model),targets});
}
const out={method:'全体硬筛选合格候选进行成对比较，分量取对手均值后相加；风险只提示。未知性能弃权，不是性能零分。',comparisons,diagnostics};
fs.writeFileSync(new URL('ranking_quality_review.json',base),JSON.stringify(out,null,2)+'\n');
const md=['# 推荐排序质量修正核查','','## 14组修改前后（顺序为第1—3名）','','|用途|候选数|修改前|修改后|','|---|---:|---|---|',...comparisons.map(c=>`|${c.scene}|${c.candidates}|${c.before.join('<br>')}|${c.after.join('<br>')}|`),'','## 排序机制','','取消软风险绝对排序和同风险分组；全部硬筛选合格者参与比较。每台的用途证据、软容量满足度、偏好和价格/重量补充分别取对手均值再相加，按内部效用降序排列，完全相同时保持数据库顺序。没有新增硬过滤。核验完整性不贡献性能或效用。','','同一测试、API、指标的差距超过不确定性阈值才产生方向性贡献；幅度为可靠性上限 × min(1,(相对差距−不确定性阈值)/0.5)。样本量限制贡献上限，重叠区间和接近结果不判领先。同型号同口径为平局，不推断SKU整机差距。0.5为应用影响饱和尺度，不是跑分换算或性能百分比。定性比较保留原有低影响上限。','','内存和SSD各自最多贡献0.3的软满足差，达到用途参考后不继续奖励此项；未知容量弃权。重负载时便携偏好影响乘0.35，屏幕/价格偏好乘0.5，避免非关键因素掩盖明确性能差距；相近性能下仍能改变顺序。七项偏好均保留。主用途证据净贡献绝对值至少0.3时，相反的软贡献限于该证据的0.75倍；未知性能不启动限幅。重图形未主动选择便携时不默认奖励重量。','','## 五台机型诊断','','五个用途统一预算5000—40000元、系统不限、无额外硬条件和偏好；另列常用20000元上限是否合格。位置是全部候选中的位置。内部贡献仅用于开发核查，不显示在网页。'];
for(const d of diagnostics){md.push('',`### ${d.scene}`,`候选${d.candidates}条，前三：${d.top.join(' → ')}`,'','|机型|CPU / GPU / RAM / SSD / 重量 / 价格|位置|2万元内合格|用途证据 / 容量 / 偏好 / 其他 / 总效用|','|---|---|---:|---|---|');for(const t of d.targets){const p=t.product,r=t.contributions;md.push(`|${p.model}|${p.cpu_model} / ${p.gpu_model??'未记录'} / ${p.ram_gb}GB / ${p.ssd_gb}GB / ${p.weight_kg}kg / ¥${p.official_price_cny}|${t.position??'未通过硬筛选'}|${t.eligibleAt20000?'是':'否'}|${r?[r.taskEvidence,r.capacityFit,r.preference,r.fallback,r.utility].map(x=>x.toFixed(5)).join(' / '):'不评分'}|`);}for(const t of d.targets){md.push('',`#### ${t.product.model}`,...(t.unknowns??[]).map(x=>'- '+x));
 if(t.contributions)md.push('- 各维度贡献（已含软因素限幅）：'+JSON.stringify(t.contributions.details));
 for(const [channel,e] of Object.entries(t.evidence??{})){md.push('- '+channel+'：'+e.status);for(const f of e.facts)md.push(`  - ${f.metric}=${f.value}；${f.comparisonGroup}；样本${f.samples??'未知'}；${f.confidence}；来源${f.sourceIds.join(', ')}；${f.context}；${JSON.stringify(f.limitations)}`);}
for(const pair of t.comparisons.filter(Boolean))for(const c of pair.comparisons)md.push(`- 对 ${pair.other}，${c.channel}：${c.status}，方向${c.direction??'弃权'}，影响上限${c.influenceLimit??'无'}，实际贡献强度${c.comparisonStrength??'无'}；${c.reason}；证据${(c.factIds??[]).join(', ')}。`);}}
md.push('','## 14组逐组逻辑核查','','1. 文档办公：价格与适当容量为主，不追求独显；部分CPU未知。','2. 网课学习：价格、容量与重量参与，不推断摄像头质量。','3. 影音娱乐：尺寸与价格参与，无画质和编解码保证。','4. 基础编程：单核与内存、价格参与，未知CPU不赋低性能。','5. 大型项目开发：多核比较生效，M5 Pro与HX候选跨风险比较；编译时间未知。','6. 本地AI开发：内存与已知CPU参与，后端资料完整不自动居前；结果不是已验证AI可用清单，显存、模型、框架仍未知。','7. 平面设计与修图：响应、容量与价格参与，无色准保证。','8. 视频剪辑：多核与容量影响排序，不再受GPU风险隔组；编解码速度未知。','9. 3D建模与渲染：CPU和图形证据跨风险比较，部分前列RTX版本未知；不能解读为已证实渲染速度排名。','10. 轻度网游：不强制独显，目标游戏表现待核验。','11. 主流游戏：仍有GPU型号空的合法候选，保留不等于已确认游戏适配；这是当前资料的重要局限。','12. 大型3A游戏：未选便携时不奖励重量；独显仅弱用途方向，实测优先；未知GPU不保证FPS。','13. 开发与游戏多选：用户主动便携与内存偏好可改变排序，CPU多核和游戏图形分别比较。','14. 创作与七偏好多选：全部偏好参与，不以单一偏好掩盖明确主用途证据。','','这不是整机实测验收；本地AI、游戏和3D仍有关键未知，不能仅凭排序确认软件适配。','','## 外星人未进前三的原因','','原14组2万元预算排除，官网价35478.61元；统一4万元诊断通过硬筛选。32GB/1TB达到容量参考但不独占优势。3D可用CPU多核比较，RTX5060版本未确认，不能借用Laptop跑分；AAA缺可比图形与单核证据，不虚构优势。视频和开发有多核贡献，但真实价格、重量及其他候选CPU证据共同影响顺序；办公不追求高端GPU，价格和重量作用较大。各项实际贡献和位置见上表，位置不代表已实测外星人更慢。');
md.push('','## 解释范围','','外星人是否入围先由价格等硬条件决定；进入候选但不在前三时，可查看上表分量与逐项证据，不能将未确认RTX简写直接当成已验证Laptop GPU。缺失的图形依据意味着不作比较，不是已证实更慢。按未知项目、真实价格和已知CPU等综合排列，不保证未知GPU的实际性能顺序。完整同口径数据、来源、限制和所有重点商品配置保存在配套JSON。');
fs.writeFileSync(new URL('ranking_quality_review.md',base),md.join('\n')+'\n');
console.log(JSON.stringify(diagnostics.map(d=>({scene:d.scene,top:d.top,targets:d.targets.map(t=>({name:t.product.model,price:t.product.official_price_cny,rank:t.position,at20k:t.eligibleAt20000}))})),null,2));

