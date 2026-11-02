import runtime from '../data/performanceRuntime.json' with {type:'json'};
import {EVIDENCE_POLICY as E} from './workloadPolicy.js';
import {normalizeHardwareName} from './hardwareMatching.js';
export {runtime as performanceRuntime};
export function modelKey(raw,kind='cpu'){
 if(raw==null||!String(raw).trim())return null;
 let text=String(raw).normalize('NFKC').replace(/(\d+)[ -]*cores?\b/ig,'$1核');
 if(kind==='cpu')return 'cpu-'+normalizeHardwareName(text,'cpu');
 const desktop=/desktop|桌面/i.test(text),mobile=/laptop|notebook|\bmobile\b|移动版|笔记本/i.test(text);
 const scope=desktop&&mobile?'conflicting':desktop?'desktop':mobile?'laptop':'unspecified';
 text=text.replace(/desktop|桌面|laptop|notebook|\bmobile\b|移动版|笔记本|\bgpu\b/ig,'');
 return 'gpu-'+normalizeHardwareName(text,'gpu').replace(/gpu/g,'')+'-'+scope;
}
export function evidenceReliability(f){
 if(f.level!=='comparable')return null;
 let q=E.sampleBands.find(([minimum])=>f.samples!==null&&f.samples>=minimum)?.[1]??E.unknownSampleLimit;
 if(f.confidence==='low')q=Math.min(q,E.lowConfidenceLimit);
 if(f.confidence==='local_only'||f.mobileScope==='mixed_unknown_system')q=Math.min(q,E.localOrMixedLimit);
 return q;
}
export function createEvidenceIndex(knowledge=runtime){
 const byModel=new Map();for(const f of knowledge.facts){if(!byModel.has(f.modelId))byModel.set(f.modelId,[]);byModel.get(f.modelId).push(f);}
 const resolve=(raw,kind)=>{const key=modelKey(raw,kind);return key?(knowledge.aliases[key]??(knowledge.models[key]?key:null)):null;};
 function hardwareFor(product){
  const reg=knowledge.products[product.id];
  const anchored=!!reg&&Object.entries(reg.signature).every(([k,v])=>product[k]===v);
  const cpuId=anchored?reg.cpuId:resolve(product.cpu_model,'cpu');
  // A stale product ID never carries an old SKU's Laptop mapping onto changed hardware.
  const gpuId=product.gpu_model==null?null:anchored?reg.resolvedGpuId:resolve(product.gpu_model,'gpu');
  const cpuFacts=byModel.get(cpuId)??[],gpuFacts=byModel.get(gpuId)??[];
  return {cpu:{id:cpuId,raw:product.cpu_model??null,facts:cpuFacts,performance:cpuFacts.some(f=>f.level==='comparable')?'documented':null},
   gpu:{id:gpuId,raw:product.gpu_model??null,type:product.gpu_type??null,facts:gpuFacts,performance:gpuFacts.some(f=>f.level==='comparable'&&!f.gpuWatts)?'documented':null,
    mobileConfirmed:!!gpuId?.endsWith('-laptop'),identityMapping:anchored?reg.gpuIdentityMapping:null},binding:anchored?'product_and_configuration':'exact_alias_or_unknown',sources:knowledge.sources};
 }
 const cache=new Map();
 function compare(a,b,channel){
  const kind=channel.startsWith('cpu')?'cpu':'gpu',aa=a[kind],bb=b[kind],key=[aa.id,bb.id,channel].join('|');
  if(cache.has(key))return cache.get(key);
  const unknown={direction:null,influenceLimit:null,status:'not_comparable',channel,factIds:[],reason:'缺少相同完整型号口径、API或平台的可比较证据'};
  const eligible=h=>h.facts.filter(f=>f.channel===channel&&f.level==='comparable'&&Number.isFinite(f.value)&&f.value>0&&!f.gpuWatts&&f.comparisonGroup);
  const af=eligible(aa),bf=eligible(bb),cohort=f=>f.comparisonGroup+'::metric::'+f.metric,groups=[...new Set(af.map(cohort))].filter(g=>bf.some(f=>cohort(f)===g));
  if(groups.length){
   // Choose ONE shared metric cohort by conservative reliability; never sum tests or pick the best score.
   const options=groups.map(g=>{const x=af.filter(f=>cohort(f)===g),y=bf.filter(f=>cohort(f)===g);return {x,y,q:Math.min(...[...x,...y].map(evidenceReliability)),g};}).sort((a,b)=>b.q-a.q||a.g.localeCompare(b.g));
   const {x,y,q,g}=options[0],median=xs=>{const vs=xs.map(f=>f.value).sort((a,b)=>a-b);return (vs[Math.floor((vs.length-1)/2)]+vs[Math.ceil((vs.length-1)/2)])/2;};
   const av=median(x),bv=median(y),tolerance=Math.max(E.closeMinimum,(1-q)*E.uncertainMargin);
   const overlap=(x.length>1||y.length>1)&&Math.min(...x.map(f=>f.value))<=Math.max(...y.map(f=>f.value))&&Math.min(...y.map(f=>f.value))<=Math.max(...x.map(f=>f.value));
   const direction=av===bv||overlap||Math.abs(av-bv)/Math.min(av,bv)<=tolerance?0:av>bv?1:-1;
   const relativeGap=Math.abs(av-bv)/Math.min(av,bv);
   const comparisonStrength=direction?q*Math.min(1,Math.max(0,relativeGap-tolerance)/0.5):0;
   const result={direction,influenceLimit:q,comparisonStrength,relativeGap,uncertaintyMargin:tolerance,status:direction?'limited_metric_difference':'close_or_overlapping',channel,group:x[0].comparisonGroup,metric:x[0].metric,factIds:[...x,...y].map(f=>f.id),reason:'仅在同测试/API/平台快照下作有限比较；低样本减弱影响，接近或区间交叠不判领先'};cache.set(key,result);return result;
  }
  // Only explicit scoped relations; neither series tiers nor arbitrary text order becomes a rank.
  for(const r of knowledge.relations){
   const hi=r.direction?.higherSubjectId,lo=r.direction?.lowerSubjectId;
   const channelFits=channel==='cpuSingle'?/Single|单核/.test(r.metric??''):channel==='cpuMulti'?/CPU Mark|多核/.test(r.metric??''):channel==='gpuGraph'&&r.kind==='gpu'&&['higher_in_named_metric','higher_in_tested_projects_not_fixed_ratio'].includes(r.relation);
   if(!channelFits||!r.direction?.onlyInStatedContext||r.direction.universalPerformanceRanking!==false)continue;
   if((aa.id===hi&&bb.id===lo)||(aa.id===lo&&bb.id===hi)){const result={direction:aa.id===hi?1:-1,influenceLimit:E.qualitativeLimit,comparisonStrength:E.qualitativeLimit,status:'qualitative_scoped_relation',channel,factIds:r.observationRefs??[],relationId:r.id,reason:r.limitations};cache.set(key,result);return result;}
  }
  cache.set(key,unknown);return unknown;
 }
 return {hardwareFor,compare,knowledge};
}
