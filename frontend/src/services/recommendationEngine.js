import {filterCatalog} from './filterCatalog.js';
import {createEvidenceIndex,evidenceReliability} from './hardwareEvidence.js';
import {resolveNeeds,RANKING_POLICY as P,EVIDENCE_POLICY as E} from './workloadPolicy.js';
import {computeBackendDirections} from './workloadSuitability.js';
import {PRIORITIES} from './requirements.js';
const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const clamp=(v,lo=-1,hi=1)=>Math.max(lo,Math.min(hi,v));
const unique=xs=>[...new Set(xs)];
const defaultIndex=createEvidenceIndex();
function capacity(actual,target){return {actual:valid(actual)?actual:null,reference:target,fulfillment:valid(actual)?Math.min(actual/target,1):null,status:!valid(actual)?'unknown':actual>=target?'at_reference':'below_reference'};}
export function assessCandidate(product,requirements,index=defaultIndex){
 const needs=resolveNeeds(requirements),hardware=index.hardwareFor(product);
 const backend=needs.ids.includes('local-ai')?computeBackendDirections(product,hardware,index.knowledge):null;
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
  const risk=backend.status==='potential_route'?P.workflowRisk.possibleBackend:product.gpu_type==='独立显卡'?P.workflowRisk.backendDiscrete:P.workflowRisk.backendUnknown;
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
 return {product,engineVersion:'3B-3-price-v2',needs,hardware,suitability:{backend,capacities,capacityGap:gap,workflowRisk,workflowBasis,softConcern:Math.max(gap,workflowRisk),scenarios:scenarioFits,confirmation:'conditional_not_software_certification'},warnings:unique(warnings),evidenceSummary:{cpuSingle:summary('cpuSingle'),cpuMulti:summary('cpuMulti'),gpuGraph:summary('gpuGraph'),gpuProfessional:summary('gpuProfessional')},ranking:{utility:null,taskEvidence:0,preference:0,fallback:0,abstentions:0},comparisonExamples:[],reasons:[]};
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
  case 'cpu-power':{const c=index.compare(a.hardware,b.hardware,'cpuSingle');const mem=actualCompare(a,b,'ram_gb',P.scales.memory,true,32);return c.direction===null?mem===null?null:mem*P.memorySmoothnessContribution:c.direction*c.comparisonStrength+(mem??0)*P.memorySmoothnessContribution;}
  case 'gpu-power':{const c=index.compare(a.hardware,b.hardware,'gpuGraph');return c.direction===null?null:c.direction*c.comparisonStrength;}
  default:throw new Error('未知偏好ID');
 }
}
function taskPair(a,b,index){
 let value=0,abstentions=0;const contributions={};const channels={...a.needs.channels};if(channels.responsive){channels.cpuSingle=Math.max(channels.cpuSingle??0,channels.responsive);delete channels.responsive;}
 let graphCompared=false;
 for(const [channel,influence] of Object.entries(channels)){
  if(!['cpuSingle','cpuMulti','gpuGraph','gpuProfessional'].includes(channel))continue;
  const c=index.compare(a.hardware,b.hardware,channel);
  if(c.direction===null){abstentions++;continue;}
  if(channel==='gpuGraph')graphCompared=true;
  const role=channel==='gpuGraph'?(a.needs.heavyGraphics?P.graphicFocus.heavy:a.needs.rules.some(r=>r.lightGaming)?P.graphicFocus.light:P.graphicFocus.normal):1;
  const delta=c.direction*c.comparisonStrength*influence*role;value+=delta;contributions[channel]=delta;
  if(c.direction&&a.comparisonExamples.length<6)a.comparisonExamples.push({otherProductId:b.product.id,...c});
 }
 if(a.needs.heavyGraphics&&!graphCompared){
  // Identity verification alone gives no performance advantage. Unknown pairs abstain.
  // Only a weak workload direction when a reliable common metric is absent. It cannot override a measured iGPU win.
  const discrete=p=>p.gpu_type==='独立显卡'?(a.needs.gaming?P.gamingFit.unmeasuredDiscreteDirection:P.directions.discrete):0;
  const delta=discrete(a.product)-discrete(b.product);value+=delta;contributions.graphicsWorkloadDirection=delta;
 }
 if(a.needs.ids.includes('local-ai')){
  const route=m=>m.suitability.backend.status==='potential_route'?P.localAiFit.potentialBackendInfluence:0;
  const delta=route(a)-route(b);value+=delta;contributions.computeBackendDirection=delta;
 }
 if(a.needs.gaming){const risk=p=>p.os==='macOS'?P.directions.platform:0;const delta=risk(b.product)-risk(a.product);value+=delta;contributions.platformCompatibility=delta;}
 return {value,abstentions,contributions};
}
export function buildReasons(match,requirements){
 const p=match.product,n=match.needs,c=match.suitability.capacities;
 const purposes=n.rules.slice(0,2).map(r=>r.label).join('、')+(n.rules.length>2?'等用途':'');
 const facts=[valid(p.ram_gb)?`${p.ram_gb}GB内存`:null,valid(p.ssd_gb)?`${p.ssd_gb}GB SSD`:null].filter(Boolean).join('、');
 const refs=Object.values(c).every(c=>c.status==='at_reference')?'达到本次用途的容量参考':'容量或资料需结合任务规模核验';
 const reasons=['符合已设硬性条件',`针对${purposes}，结合已知容量、可比用途证据与个人偏好`,`${facts||'容量信息不完整'}，${refs}；这是软参考，不是软件运行保证`];
 for(const id of [...new Set(requirements.priorities)].sort()){
  if(id==='portable'&&valid(p.weight_kg))reasons.push(`实际重量${p.weight_kg}kg，用于比较便携性`);
  if(id==='memory'&&valid(p.ram_gb))reasons.push(`以${p.ram_gb}GB内存比较多任务容量余量，不保证所有软件同时流畅`);
  if(id==='storage'&&valid(p.ssd_gb))reasons.push(`以${p.ssd_gb}GB SSD比较存储空间，不推断硬盘速度`);
  if(id==='large-screen'&&valid(p.screen_inches))reasons.push(`屏幕${p.screen_inches}英寸，用于比较工作区，不代表色准或画质`);
  if(id==='value')reasons.push(`结合用途容量参考比较官网参考价${p.official_price_cny}元，不以最低价替代适配`);
  if(id==='cpu-power')reasons.push(match.evidenceSummary.cpuSingle.status==='unknown'?'单核资料不足，运行流畅偏好结合已知内存，CPU比较弃权':'运行流畅偏好参考同口径单核资料与适当内存，不保证绝对不卡顿');
  if(id==='gpu-power')reasons.push(match.evidenceSummary.gpuGraph.status==='unknown'?'图形资料不足，游戏畅玩偏好不虚构GPU性能':'游戏畅玩偏好只参考同口径图形资料，不保证游戏帧率或专业计算速度');
 }
 if(n.gaming)reasons.push('图形与目标游戏支持须核验；无共同实测时独显仅作有限用途方向，低价不代表游戏适配');
 if(n.ids.includes('local-ai')){const backend=match.suitability.backend;reasons.push(backend.status==='potential_route'?backend.directions.map(d=>d.label).join('、')+'；仅作适配考察，驱动、系统及框架仍须核验，不能保证运行特定模型':'计算后端资料不足，保留CPU开发候选，不宣称可进行特定模型的GPU推理或训练');reasons.push('专用显存和可用统一内存未知，不把主内存当显存，也不以图形跑分推断AI速度');}
 if(n.channels.cpuMulti&&match.evidenceSummary.cpuMulti.status!=='unknown')reasons.push('CPU多核测试可作参考，实际持续表现仍受软件、功耗和散热影响');
 if(n.heavyGraphics&&p.gpu_type==='独立显卡')reasons.push('独显仅作重图形用途的考察方向，不表示一定胜过所有核显');
 reasons.push(...match.warnings.slice(0,2));return unique(reasons);
}
export function recommendCatalog(items,requirements,{evidenceIndex=defaultIndex}={}){
 const needs=resolveNeeds(requirements);if(!needs.ids.length)return [];
 if((requirements.priorities??[]).some(id=>!PRIORITIES.some(p=>p.id===id&&p.enabled)))throw new Error('未知或停用的偏好');
 const req={...requirements,scenarios:needs.ids,priorities:[...new Set(requirements.priorities??[])].sort()};
 const performanceFocused=needs.rules.some(r=>r.primary.some(c=>['cpuSingle','cpuMulti','gpuGraph','gpuProfessional'].includes(c)))||req.priorities.some(id=>['cpu-power','gpu-power'].includes(id));
 const rows=filterCatalog(items,req).map((p,sourceOrder)=>({...assessCandidate(p,req,evidenceIndex),sourceOrder}));
 for(const a of rows){let task=0,pref=0,fallback=0,capacityFit=0,abstentions=0;const details={};const add=(key,v)=>{details[key]=(details[key]??0)+v;};
  // Every hard-qualified candidate participates. Verification completeness never awards utility.
  const peers=rows.filter(b=>b!==a);
  for(const b of peers){
   const previous={capacityFit,pref,fallback,details:{...details}};
   for(const dimension of ['memory','storage']){
    const ac=a.suitability.capacities[dimension].fulfillment,bc=b.suitability.capacities[dimension].fulfillment;
    if(ac!==null&&bc!==null){const delta=(ac-bc)*P.softCapacityInfluence;capacityFit+=delta;add('capacity:'+dimension,delta);}
   }
   const vote=taskPair(a,b,evidenceIndex);task+=vote.value;abstentions+=vote.abstentions;for(const [key,v] of Object.entries(vote.contributions))add('task:'+key,v);
   let pp=0;for(const id of req.priorities){const v=preferencePair(a,b,id,evidenceIndex);if(v!==null){const delta=v*P.preferences[id]*(needs.heavy?(P.heavyPreferenceScale[id]??1):1);pp+=delta;add('preference:'+id,delta/Math.max(1,req.priorities.length));}else abstentions++;}pref+=pp/Math.max(1,req.priorities.length);
   const price=actualCompare(a,b,'official_price_cny',P.scales.price,false)??0,weight=actualCompare(a,b,'weight_kg',P.scales.weight,false)??0;
   const priceDelta=price*(needs.gaming?P.gamingFit.defaultPriceInfluence:needs.heavy||performanceFocused?P.fallback.heavyPrice:P.fallback.lightPrice),weightDelta=weight*((needs.heavyGraphics?0:needs.heavy?P.fallback.heavyWeight:P.fallback.lightWeight)+(needs.channels.portable??0)*P.studyPortabilityBoost);fallback+=priceDelta+weightDelta;add('fallback:price',priceDelta);add('fallback:weight',weightDelta);
   if(needs.channels.screen){const delta=(actualCompare(a,b,'screen_inches',P.scales.screen,true,18)??0)*P.fallback.screen*needs.channels.screen;fallback+=delta;add('fallback:screen',delta);}
   if(needs.channels.memory){const delta=(actualCompare(a,b,'ram_gb',P.scales.memory,true,64)??0)*P.taskMemoryContribution*needs.channels.memory;fallback+=delta;add('fallback:memory',delta);}
   // A clear, adequately supported primary-task difference cannot be reversed solely by soft extras.
   const primary=new Set(needs.rules.flatMap(r=>r.primary));
   const critical=Object.entries(vote.contributions).filter(([key])=>primary.has(key)).reduce((sum,[,v])=>sum+v,0);
   const extras=(capacityFit-previous.capacityFit)+(pref-previous.pref)+(fallback-previous.fallback);
   if(Math.abs(critical)>=P.criticalEvidenceThreshold&&critical*extras<0&&Math.abs(extras)>Math.abs(critical)*P.opposingSoftLimit){
    const factor=Math.abs(critical)*P.opposingSoftLimit/Math.abs(extras);
    capacityFit=previous.capacityFit+(capacityFit-previous.capacityFit)*factor;
    pref=previous.pref+(pref-previous.pref)*factor;fallback=previous.fallback+(fallback-previous.fallback)*factor;
    for(const key of Object.keys(details))if(!key.startsWith('task:'))details[key]=(previous.details[key]??0)+(details[key]-(previous.details[key]??0))*factor;
   }
  }
  const den=Math.max(1,peers.length);a.ranking={utility:(task+pref+fallback+capacityFit)/den,capacityFit:capacityFit/den,taskEvidence:task/den,preference:pref/den,fallback:fallback/den,abstentions,details:Object.fromEntries(Object.entries(details).map(([key,v])=>[key,v/den])),meaning:'bounded application ordering utility; not benchmark or match percentage'};
  a.reasons=buildReasons(a,req);
 }
 return rows.sort((a,b)=>b.ranking.utility-a.ranking.utility||a.sourceOrder-b.sourceOrder);
}
