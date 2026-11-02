// Presentation only: never filters, sorts, pads, replaces products, or computes ranking utility.
import {createEvidenceIndex} from './hardwareEvidence.js';
const defaultEvidenceIndex=createEvidenceIndex();
const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const unique=xs=>[...new Set(xs)];
const amount=v=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(v);
const storage=v=>v>=1024&&v%1024===0?`${v/1024}TB`:`${v}GB`;
const dimensions={
 price:{field:'official_price_cny',lower:true,label:'官网参考价',format:v=>`${amount(v)}元`,adv:'更低'},
 weight:{field:'weight_kg',lower:true,label:'重量',format:v=>`${v}kg`,adv:'更轻'},
 memory:{field:'ram_gb',label:'内存',format:v=>`${v}GB`,adv:'容量更大'},
 storage:{field:'ssd_gb',label:'SSD',format:storage,adv:'容量更大'},
 screen:{field:'screen_inches',label:'屏幕',format:v=>`${v}英寸`,adv:'尺寸更大'},
};
const preferenceFields={portable:['weight'],memory:['memory'],storage:['storage'],value:['price'],'large-screen':['screen'],'cpu-power':['cpuSingle'],'gpu-power':['gpuGraph']};
const performanceLabels={cpuSingle:'CPU单核',cpuMulti:'CPU多核',gpuGraph:'GPU图形'};
function numericAdvantage(row,others,key){
 const d=dimensions[key],v=row.product[d.field];
 if(!valid(v)||!others.every(m=>valid(m.product[d.field])&&(d.lower?v<m.product[d.field]:v>m.product[d.field])))return null;
 return {kind:key,field:d.field,value:v,otherProductIds:others.map(m=>m.product.id),
  text:`${d.label}${d.format(v)}，比本次其他推荐项${d.adv}。`,basis:'strict_known_values_only'};
}
function performanceAdvantage(row,others,channel,index){
 if(channel==='gpuGraph'&&(!row.product.gpu_model||others.some(m=>!m.product.gpu_model)))return null;
 const hs=[row,...others].map(m=>m.hardware??index.hardwareFor(m.product));
 if(channel==='gpuGraph'&&hs.some(h=>/rtx/i.test(h.gpu.raw??'')&&!h.gpu.mobileConfirmed))return null;
 const comparisons=hs.slice(1).map(h=>index.compare(hs[0],h,channel));
 if(!comparisons.every(c=>c.direction===1&&c.comparisonStrength>0&&c.group&&c.metric&&c.status==='limited_metric_difference'))return null;
 if(!comparisons.every(c=>c.group===comparisons[0].group&&c.metric===comparisons[0].metric))return null;
 const factIds=unique(comparisons.flatMap(c=>c.factIds));
 return {kind:channel,otherProductIds:others.map(m=>m.product.id),factIds,
  sourceIds:unique(hs.flatMap(h=>[...h.cpu.facts,...h.gpu.facts]).filter(f=>factIds.includes(f.id)).flatMap(f=>f.sourceIds??[])),
  group:comparisons[0].group,metric:comparisons[0].metric,
  text:`同口径${performanceLabels[channel]}参考高于其他推荐项；实际整机表现仍需核验。`,basis:'existing_same_metric_evidence_not_system_benchmark'};
}
function cautionList(row,others,requirements,advantages){
 const p=row.product,n=row.needs??{},notes=[];
 if(n.ids?.includes('local-ai'))notes.push(row.suitability?.backend?.status==='potential_route'?'有潜在计算后端方向，但框架、可用显存或统一内存仍需核验，不能保证运行指定模型。':'计算后端资料不足，不能保证用GPU运行指定模型。');
 if(n.heavyGraphics||n.gaming||requirements.priorities?.includes('gpu-power'))notes.push(!p.gpu_model||!row.hardware?.gpu?.performance||/rtx/i.test(p.gpu_model)&&!row.hardware?.gpu?.mobileConfirmed?'显卡具体版本或实际游戏、渲染表现仍需进一步确认。':'图形参考不等于当前整机实测，仍需核验目标软件、显存及功耗。');
 if(n.ids?.includes('graphics'))notes.push('没有色域和色准资料，不能据此判断专业色彩表现。');
 if(n.ids?.includes('video-editing'))notes.push('编解码与软件加速路径未确认，不能保证剪辑或导出速度。');
 if(n.gaming&&p.os==='macOS')notes.unshift('请先确认目标游戏支持macOS，不能保证运行或帧率。');
 for(const id of requirements.priorities??[])for(const key of preferenceFields[id]??[]){
  const d=dimensions[key];if(!d)continue;const v=p[d.field];
  if(!valid(v))notes.push(`${d.label}资料未提供，暂不能判断这一项。`);
  else if(others.some(m=>valid(m.product[d.field])&&(d.lower?m.product[d.field]<v:m.product[d.field]>v)))notes.push(`其他推荐项有${d.label}${d.adv}的选择，可按你重视的方面取舍。`);
 }
 for(const [key,d] of Object.entries(dimensions))if(!valid(p[d.field]))notes.push(`${d.label}资料未提供，需进一步核验。`);
 if(Object.values(row.suitability?.capacities??{}).some(c=>c.status==='below_reference'))notes.push('容量低于本次用途的规划参考，请确认具体任务是否够用；这不是新增硬门槛。');
 if(advantages.some(a=>performanceLabels[a.kind]))notes.push('测试参考不是当前整机实测，功耗、散热和软件版本会影响表现。');
 if(!p.os)notes.push('操作系统未提供，请先确认常用软件是否支持。');
 else if(others.some(m=>m.product.os&&m.product.os!==p.os))notes.push(`操作系统为${p.os}，请先确认常用软件是否支持。`);
 notes.push('官网参考价来自导入资料，不代表实时成交价。');
 return unique(notes).slice(0,2);
}
export function buildRecommendationComparison(matches,requirements={}, {evidenceIndex=defaultEvidenceIndex}={}){
 if(!Array.isArray(matches)||matches.length>3)throw new RangeError('展示层只接收已确定的最多三款结果');
 return matches.map((row,i)=>{
  const p=row.product,others=matches.filter((_,j)=>j!==i),canCompare=others.length>0;
  const taskChannels=Object.keys(row.needs?.channels??{}).filter(c=>performanceLabels[c]);
  const priorityKeys=(requirements.priorities??[]).flatMap(id=>preferenceFields[id]??[]);
  const keys=unique([...priorityKeys,...taskChannels,'price','weight','memory','storage','screen']);
  const advantages=canCompare?keys.map(key=>dimensions[key]?numericAdvantage(row,others,key):performanceAdvantage(row,others,key,evidenceIndex)).filter(Boolean).slice(0,2):[];
  const facts=[valid(p.ram_gb)?`${p.ram_gb}GB内存`:null,valid(p.ssd_gb)?`${storage(p.ssd_gb)}存储`:null,requirements.priorities?.includes('portable')&&valid(p.weight_kg)?`重量${p.weight_kg}kg`:null].filter(Boolean);
  const simpleFacts=facts.length?facts.join('、')+'，可按常用软件和文件量判断是否够用。':'已知配置有限，请先核验具体参数。';
  const focus=priorityKeys.find(key=>advantages.some(a=>a.kind===key));
  const fit={weight:'重视随身携带时，可先看这款的重量差别。',memory:'经常同时使用多个程序时，可重点比较内存容量。',storage:'软件和文件较多时，可重点比较存储空间。',price:'希望控制购机支出时，可先比较这款的价格。',screen:'希望工作区更宽敞时，可比较屏幕尺寸。',cpuSingle:'重视处理器表现时，可参考同口径测试并核验常用软件。',gpuGraph:'有图形用途需求时，请结合测试口径与目标软件选择。'};
  return {id:p.id,summary:'符合已设硬性条件。'+simpleFacts,fitDescription:focus?fit[focus]:null,canCompare,
   advantages,cautions:cautionList(row,others,requirements,advantages),
   neutral:canCompare&&!advantages.length?'未发现可明确标出的相对优势，不强行分配不同角色；不代表性能较差。':null,
   originalReasons:[...(row.reasons??[])],originalWarnings:[...(row.warnings??[])]};
 });
}
