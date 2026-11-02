import {filterCatalog} from './filterCatalog.js';
import {createEvidenceIndex,evidenceReliability} from './hardwareEvidence.js';
import {resolveNeeds,RANKING_POLICY as P,EVIDENCE_POLICY as E} from './workloadPolicy.js';
import {PRIORITIES} from './requirements.js';
const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const clamp=(v,lo=-1,hi=1)=>Math.max(lo,Math.min(hi,v));
const unique=xs=>[...new Set(xs)];
const defaultIndex=createEvidenceIndex();
function capacity(actual,target){return {actual:valid(actual)?actual:null,reference:target,fulfillment:valid(actual)?Math.min(actual/target,1):null,status:!valid(actual)?'unknown':actual>=target?'at_reference':'below_reference'};}
export function assessCandidate(product,requirements,index=defaultIndex){
 const needs=resolveNeeds(requirements),hardware=index.hardwareFor(product);
 const capacities={memory:capacity(product.ram_gb,needs.ram),storage:capacity(product.ssd_gb,needs.ssd)};
 const gap=Math.max(0,...Object.values(capacities).filter(c=>c.fulfillment!==null).map(c=>1-c.fulfillment));
 const scenarioFits=needs.rules.map(r=>({id:r.id,label:r.label,memory:capacity(product.ram_gb,r.ram),storage:capacity(product.ssd_gb,r.ssd),status:'conditional_task_reference',limits:r.limits,sourceIds:[...(index.knowledge.workloads.find(w=>w.name===r.workload)?.sourceIds??[]),...(r.capacitySource?['policy:'+r.capacitySource]:[]),...(r.id==='local-ai'?['policy:pytorch','policy:mps']:[])]}));
 // Verification risk is a workflow uncertainty indicator, NEVER a hardware performance score.
 let workflowRisk=0,workflowBasis='本用途不要求已知GPU加速证据';
 const graphKnown=hardware.gpu.facts.some(f=>f.channel==='gpuGraph'&&f.level==='comparable');
 if(needs.heavyGraphics){
  const graphicReliability=Math.max(0,...hardware.gpu.facts.filter(f=>f.channel==='gpuGraph'&&f.level==='comparable').map(evidenceReliability));
  workflowRisk=graphKnown?(graphicReliability>=E.workflowReliableThreshold?P.workflowRisk.documented:P.workflowRisk.lowSample):product.gpu_type==='独立显卡'?P.workflowRisk.discreteUnverified:P.workflowRisk.noGraphics;
  workflowBasis=graphKnown?'有该GPU版本图形参考，但显存/后端/整机仍未确认':product.gpu_type==='独立显卡'?'仅有独显用途方向，版本和性能待核验':'重图形所需GPU资料缺失，不能作强适配判断';
  if(needs.gaming&&product.os==='macOS'){workflowRisk=Math.max(workflowRisk,P.workflowRisk.macGames);workflowBasis+='；目标游戏的macOS支持需先核验';}
 }
 if(needs.rules.some(r=>r.id==='local-ai')){
  const metal=hardware.gpu.facts.some(f=>f.comparisonGroup?.endsWith('-Metal'));
  const cudaDirection=hardware.gpu.mobileConfirmed&&/rtx/i.test(hardware.gpu.id??'')&&product.os==='Windows';
  const risk=metal||cudaDirection?P.workflowRisk.possibleBackend:product.gpu_type==='独立显卡'?P.workflowRisk.backendDiscrete:P.workflowRisk.backendUnknown;
  workflowRisk=Math.max(workflowRisk,risk);workflowBasis='仅作Metal或已核验NVIDIA平台的后端候选方向；没有模型、显存与框架实际可用性证明，不用3DMark推断AI速度';
 }
 const warnings=[];
 if(needs.backendCritical)warnings.push('显存/统一内存可用量、目标框架或渲染后端未确认，不能保证运行指定模型或项目');
 if(needs.gaming&&product.os==='macOS')warnings.push('macOS需先核验目标游戏是否支持，不能保证运行或帧率');
 if(needs.gaming&&!product.os)warnings.push('操作系统未知，目标游戏兼容性需核验');
 if(needs.rules.some(r=>r.id==='graphics'))warnings.push('没有屏幕色域/色准数据，不作专业色彩保证');
 if(needs.rules.some(r=>r.id==='video-editing'))warnings.push('编解码和软件加速路径未知，通用GPU跑分不代表剪辑导出速度');
 if(needs.channels.cpuSingle||needs.channels.responsive||requirements.priorities.includes('cpu-power'))if(!hardware.cpu.facts.some(f=>f.channel==='cpuSingle'&&f.level==='comparable'))warnings.push('CPU单核资料不足，不据此判定响应性能较差');
 if(needs.channels.cpuMulti&&!hardware.cpu.facts.some(f=>f.channel==='cpuMulti'&&f.level==='comparable'))warnings.push('CPU多核资料不足，不据此判定持续性能较差');
 if((needs.channels.gpuGraph||requirements.priorities.includes('gpu-power'))&&!hardware.gpu.facts.some(f=>f.channel==='gpuGraph'&&f.level==='comparable'))warnings.push('GPU图形资料不足，保留候选且不虚构性能值');
 if(/rtx/i.test(product.gpu_model??'')&&!hardware.gpu.mobileConfirmed)warnings.push('RTX桌面/移动版本未确认，不套用Laptop基准');
 if(hardware.gpu.raw===null)warnings.push(product.gpu_type==='集成显卡'?'集显具体型号未记录，保持空值，不从CPU推断':'GPU具体型号未记录，保持空值，不从CPU推断');
 for(const r of needs.rules)warnings.push(...r.limits);
 for(const [name,c] of Object.entries(capacities))if(c.status!=='at_reference')warnings.push(`${name==='memory'?'内存':'SSD'}${c.status==='unknown'?'信息不足':'低于本次用途软参考'}；仅提示，不额外排除`);
 if([...hardware.cpu.facts,...hardware.gpu.facts].some(f=>f.level==='comparable'&&(f.samples!==null&&f.samples<5||f.confidence==='low')))warnings.push('部分性能资料样本较少或可信程度低，仅作有限参考，不据微小差异宣称领先');
 const summary=channel=>{const f=[...hardware.cpu.facts,...hardware.gpu.facts].filter(f=>f.channel===channel&&f.level==='comparable');return {status:f.length?'documented_metric':'unknown',facts:f.map(f=>({id:f.id,metric:f.metric,value:f.value,comparisonGroup:f.comparisonGroup,samples:f.samples,confidence:f.confidence,gpuWatts:f.gpuWatts??null,context:f.context,limitations:f.limitations,sourceIds:f.sourceIds}))};};
 return {product,engineVersion:'3B-3',needs,hardware,suitability:{capacities,capacityGap:gap,workflowRisk,workflowBasis,softConcern:Math.max(gap,workflowRisk),scenarios:scenarioFits,confirmation:'conditional_not_software_certification'},warnings:unique(warnings),evidenceSummary:{cpuSingle:summary('cpuSingle'),cpuMulti:summary('cpuMulti'),gpuGraph:summary('gpuGraph'),gpuProfessional:summary('gpuProfessional')},ranking:{utility:null,taskEvidence:0,preference:0,fallback:0,abstentions:0},comparisonExamples:[],reasons:[]};
}
function actualCompare(a,b,field,scale,higher=true,cap=Infinity){
 const x=a.product[field],y=b.product[field];if(!valid(x)||!valid(y))return null;
 return clamp((Math.min(x,cap)-Math.min(y,cap))/scale)*(higher?1:-1);
}
function preferencePair(a,b,id,index){
 switch(id){
  case 'portable':return actualCompare(a,b,'weight_kg',P.scales.weight,false);
  case 'memory':return actualCompare(a,b,'ram_gb',P.scales.memory,true,P.capacityCaps.memory);
  case 'storage':return actualCompare(a,b,'ssd_gb',P.scales.storage,true,P.capacityCaps.storage);
  case 'large-screen':return actualCompare(a,b,'screen_inches',P.scales.screen,true,18);
  case 'value':return actualCompare(a,b,'official_price_cny',P.scales.price,false);
  case 'cpu-power':{const c=index.compare(a.hardware,b.hardware,'cpuSingle');const mem=actualCompare(a,b,'ram_gb',P.scales.memory,true,32);return c.direction===null?mem===null?null:mem*P.memorySmoothnessContribution:c.direction*c.influenceLimit+(mem??0)*P.memorySmoothnessContribution;}
  case 'gpu-power':{const c=index.compare(a.hardware,b.hardware,'gpuGraph');return c.direction===null?null:c.direction*c.influenceLimit;}
  default:throw new Error('未知偏好ID');
 }
}
function taskPair(a,b,index){
 let value=0,abstentions=0;const channels={...a.needs.channels};if(channels.responsive){channels.cpuSingle=Math.max(channels.cpuSingle??0,channels.responsive);delete channels.responsive;}
 let graphCompared=false;
 for(const [channel,influence] of Object.entries(channels)){
  if(!['cpuSingle','cpuMulti','gpuGraph','gpuProfessional'].includes(channel))continue;
  const c=index.compare(a.hardware,b.hardware,channel);
  if(c.direction===null){abstentions++;continue;}
  if(channel==='gpuGraph')graphCompared=true;
  const role=channel==='gpuGraph'?(a.needs.heavyGraphics?P.graphicFocus.heavy:a.needs.rules.some(r=>r.lightGaming)?P.graphicFocus.light:P.graphicFocus.normal):1;
  value+=c.direction*c.influenceLimit*influence*role;
  if(c.direction&&a.comparisonExamples.length<6)a.comparisonExamples.push({otherProductId:b.product.id,...c});
 }
 if(a.needs.heavyGraphics&&!graphCompared){
  const direction=h=>h.gpu.mobileConfirmed&&h.gpu.facts.some(f=>f.channel==='gpuGraph'&&f.level==='comparable')?P.directions.confirmedMobile:0;
  value+=direction(a.hardware)-direction(b.hardware);
  // Only a weak workload direction when a reliable common metric is absent. It cannot override a measured iGPU win.
  const discrete=p=>p.gpu_type==='独立显卡'?P.directions.discrete:0;
  value+=discrete(a.product)-discrete(b.product);
 }
 if(a.needs.gaming){const risk=p=>p.os==='macOS'?P.directions.platform:0;value+=risk(b.product)-risk(a.product);}
 return {value,abstentions};
}
export function buildReasons(match,requirements){
 const p=match.product,n=match.needs,c=match.suitability.capacities;
 const purposes=n.rules.slice(0,2).map(r=>r.label).join('、')+(n.rules.length>2?'等用途':'');
 const facts=[valid(p.ram_gb)?`${p.ram_gb}GB内存`:null,valid(p.ssd_gb)?`${p.ssd_gb}GB SSD`:null].filter(Boolean).join('、');
 const refs=Object.values(c).every(c=>c.status==='at_reference')?'达到本次用途的容量参考':'容量或资料需结合任务规模核验';
 const reasons=['符合已设硬性条件',`针对${purposes}，先核对容量与关键用途资料，再比较个人偏好`,`${facts||'容量信息不完整'}，${refs}；这是软参考，不是软件运行保证`];
 for(const id of [...new Set(requirements.priorities)].sort()){
  if(id==='portable'&&valid(p.weight_kg))reasons.push(`实际重量${p.weight_kg}kg，用于比较便携性`);
  if(id==='memory'&&valid(p.ram_gb))reasons.push(`以${p.ram_gb}GB内存比较多任务容量余量，不保证所有软件同时流畅`);
  if(id==='storage'&&valid(p.ssd_gb))reasons.push(`以${p.ssd_gb}GB SSD比较存储空间，不推断硬盘速度`);
  if(id==='large-screen'&&valid(p.screen_inches))reasons.push(`屏幕${p.screen_inches}英寸，用于比较工作区，不代表色准或画质`);
  if(id==='value')reasons.push(`在用途容量参考之后比较官网参考价${p.official_price_cny}元，不以最低价替代适配`);
  if(id==='cpu-power')reasons.push(match.evidenceSummary.cpuSingle.status==='unknown'?'单核资料不足，运行流畅偏好结合已知内存，CPU比较弃权':'运行流畅偏好参考同口径单核资料与适当内存，不保证绝对不卡顿');
  if(id==='gpu-power')reasons.push(match.evidenceSummary.gpuGraph.status==='unknown'?'图形资料不足，游戏畅玩偏好不虚构GPU性能':'游戏畅玩偏好只参考同口径图形资料，不保证游戏帧率或专业计算速度');
 }
 if(n.channels.cpuMulti&&match.evidenceSummary.cpuMulti.status!=='unknown')reasons.push('CPU多核测试可作参考，实际持续表现仍受软件、功耗和散热影响');
 if(n.heavyGraphics&&p.gpu_type==='独立显卡')reasons.push('独显仅作重图形用途的考察方向，不表示一定胜过所有核显');
 reasons.push(...match.warnings.slice(0,2));return unique(reasons);
}
export function recommendCatalog(items,requirements,{evidenceIndex=defaultIndex}={}){
 const needs=resolveNeeds(requirements);if(!needs.ids.length)return [];
 if((requirements.priorities??[]).some(id=>!PRIORITIES.some(p=>p.id===id&&p.enabled)))throw new Error('未知或停用的偏好');
 const req={...requirements,scenarios:needs.ids,priorities:[...new Set(requirements.priorities??[])].sort()};
 const rows=filterCatalog(items,req).map((p,sourceOrder)=>({...assessCandidate(p,req,evidenceIndex),sourceOrder}));
 for(const a of rows){let task=0,pref=0,fallback=0,abstentions=0;
  // Only peers with the same soft-capacity / workflow-verification concern vote. Unknown hardware abstains, never gets a fake performance value.
  const peers=rows.filter(b=>b!==a&&Math.abs(b.suitability.softConcern-a.suitability.softConcern)<1e-9);
  for(const b of peers){const vote=taskPair(a,b,evidenceIndex);task+=vote.value;abstentions+=vote.abstentions;
   let pp=0;for(const id of req.priorities){const v=preferencePair(a,b,id,evidenceIndex);if(v!==null)pp+=v*P.preferences[id];else abstentions++;}pref+=pp/Math.max(1,req.priorities.length);
   const price=actualCompare(a,b,'official_price_cny',P.scales.price,false)??0,weight=actualCompare(a,b,'weight_kg',P.scales.weight,false)??0;
   fallback+=price*(needs.heavy?P.fallback.heavyPrice:P.fallback.lightPrice)+weight*((needs.heavy?P.fallback.heavyWeight:P.fallback.lightWeight)+(needs.channels.portable??0)*P.studyPortabilityBoost);
   if(needs.channels.screen)fallback+=(actualCompare(a,b,'screen_inches',P.scales.screen,true,18)??0)*P.fallback.screen*needs.channels.screen;
   if(needs.channels.memory)fallback+=(actualCompare(a,b,'ram_gb',P.scales.memory,true,64)??0)*P.taskMemoryContribution*needs.channels.memory;
  }
  const den=Math.max(1,peers.length);a.ranking={utility:(task+pref+fallback)/den,taskEvidence:task/den,preference:pref/den,fallback:fallback/den,abstentions,meaning:'bounded application ordering utility; not benchmark or match percentage'};
  a.reasons=buildReasons(a,req);
 }
 return rows.sort((a,b)=>a.suitability.softConcern-b.suitability.softConcern||b.ranking.utility-a.ranking.utility||a.sourceOrder-b.sourceOrder);
}
