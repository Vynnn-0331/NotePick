/** Offline reference build. No score/UI changes and no network requests. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeHardwareName, matchCPU, matchGPU } from '../frontend/src/services/hardwareMatching.js';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');

export function canonicalModel(raw,kind='cpu') {
  if(raw==null || !String(raw).trim())return null;
  const original=String(raw),trimmed=original.normalize('NFKC').trim();
  if(kind==='cpu'){
    const key=normalizeHardwareName(trimmed,'cpu');
    let name=trimmed.replace(/[®™]/g,'').replace(/酷睿/g,'Core ').replace(/锐龙/g,'Ryzen ')
      .replace(/^Ultra\s*/i,'Core Ultra ').replace(/Core\s+U([579])(?=[\s-])/i,'Core Ultra $1')
      .replace(/Ryzen\s*R([579])(?=[\s-])/i,'Ryzen $1').replace(/^R([579])(?=[\s-])/i,'Ryzen $1')
      .replace(/(Ultra)\s*([579])/i,'$1 $2').replace(/(\d+)\s+HX/ig,'$1HX').replace(/-/g,' ').replace(/\s+/g,' ').trim();
    if(/^Core /i.test(name))name='Intel '+name;
    if(/^Ryzen /i.test(name))name='AMD '+name;
    if(/^[MA]\d/i.test(name))name='Apple '+name;
    return {id:'cpu-'+key,kind,normalizedKey:key,standardName:name,scope:'exact_name_preserving_suffix_and_cores'};
  }
  const desktop=/desktop|桌面/i.test(trimmed),mobile=/laptop|notebook|\bmobile\b|移动版|笔记本/i.test(trimmed);
  const scope=desktop&&mobile?'conflicting':desktop?'desktop':mobile?'laptop':'unspecified';
  const base=normalizeHardwareName(trimmed.replace(/desktop|桌面|laptop|notebook|\bmobile\b|移动版|笔记本/ig,''),'gpu').replace(/gpu/g,'');
  let name=trimmed;
  const rtx=base.match(/^rtx(\d+)(ti|super)?$/);
  if(rtx)name=`NVIDIA GeForce RTX ${rtx[1]}${rtx[2] ? ' '+(rtx[2]==='ti'?'Ti':'Super'):''}${scope==='laptop'?' Laptop GPU':scope==='desktop'?' Desktop GPU':'（桌面/移动版本未明确）'}`;
  else if(/^[ma]\d/.test(base))name='Apple '+trimmed.replace(/\s+/g,' ')+' GPU';
  else name=trimmed.replace(/英特尔锐炫/g,'Intel Arc').replace(/\s+/g,' ');
  return {id:`gpu-${base}-${scope}`,kind,normalizedKey:base,standardName:name,scope};
}

export function buildReference(text) {
  const lines=text.split(/\r?\n/),sections=[];let stack=[];
  for(const line of lines){const m=line.match(/^(#{1,3})\s+(.+)$/);if(m){stack=stack.filter(x=>x.level<m[1].length);stack.push({level:m[1].length,title:m[2]});}sections.push(stack.map(x=>x.title).join(' / '));}
  const evidence=[], evidenceByLine=new Map();
  function quote(index){
    if(!evidenceByLine.has(index)){
      const q={id:'e-'+hash(`${index+1}:${lines[index]}`).slice(0,12),source:'../data/说明文档.md',section:sections[index],lineStart:index+1,lineEnd:index+1,quote:lines[index],documentSha256:hash(text)};
      evidence.push(q);evidenceByLine.set(index,q.id);
    }
    return evidenceByLine.get(index);
  }
  const find=(part,section='')=>{const index=lines.findIndex((l,i)=>l.includes(part)&&sections[i].includes(section));if(index<0)throw new Error('知识库定位失败: '+part);return index;};
  const observations=[],relations=[],tiers=[],workloads=[],restrictions=[],identities=[],scopeRules=[],discrepancies=[],operatingConditions=[];
  const addObservation=(kind,subject,metric,value,index,context)=>{
    assert(Number.isFinite(value)&&value>0);
    // Every value is literally present in this exact source line, not calculated.
    assert(lines[index].replaceAll(',','').includes(String(value)));
    const model=canonicalModel(subject,kind);
    const o={id:'o-'+hash(`${kind}:${subject}:${metric}:${value}:${index}`).slice(0,12),kind,subject:model,metric,value,approximate:true,
      confidence:'document_snapshot_not_independently_reverified',evidenceLevel:'measured_or_compared',context,evidenceRefs:[quote(index)],
      limitations:'原文近似快照；不同整机、平台、功耗与软件条件可能改变表现，不外推FPS、能效或续航。'};
    observations.push(o);return o;
  };
  for(let i=0;i<lines.length;i++){
    const l=lines[i],section=sections[i];
    if(l.startsWith('|')&&section.includes('5B.')&&l.includes('：约')){
      const cells=l.split('|').map(c=>c.trim());
      const subjects=[];
      for(const entry of cells[3].split('；')){
        const m=entry.trim().match(/^(.+?)：约([\d,]+)$/);if(!m)throw new Error('CPU表格结构变化');
        const o=addObservation('cpu',m[1],'PassMark CPU Mark',Number(m[2].replaceAll(',','')),i,'5B移动CPU多核表；2026-10-27汇总');subjects.push(o.subject);
      }
      tiers.push({id:'t-'+hash(l).slice(0,12),kind:'cpu',scope:'mobile',label:cells[1],rangeAsWritten:cells[2],subjects,evidenceLevel:'qualitative_position',confidence:'approximate_overlapping_bands',evidenceRefs:[quote(i)],limitations:cells[4]+'；分档边界重叠，不形成精确排名。'});
    }
    if(l.startsWith('|')&&section.includes('5A-2.')&&l.split('|')[1].trim()&&!l.includes('粗略区间')&&!/^\|[-| ]+$/.test(l))tiers.push({id:'t-'+hash(l).slice(0,12),kind:'cpu',scope:'desktop_or_historical_background_only',label:l.split('|')[1].trim(),subjectsAsWritten:l.split('|')[2].trim(),evidenceLevel:'qualitative_position',confidence:'background_only',evidenceRefs:[quote(i)],limitations:l.split('|')[4].trim()+'；禁止移植给移动版近似名称。'});
    if(l.startsWith('|')&&section.includes('5A-3.')&&l.split('|')[1].trim()&&!l.includes('粗略区间')&&!/^\|[-| ]+$/.test(l))tiers.push({id:'t-'+hash(l).slice(0,12),kind:'gpu',scope:'desktop_or_mixed_background_only',label:l.split('|')[1].trim(),subjectsAsWritten:l.split('|')[2].trim(),evidenceLevel:'qualitative_position',confidence:'background_only',evidenceRefs:[quote(i)],limitations:'不得直接推断：'+l.split('|')[4].trim()+'；不继承为Laptop精确名次。'});
    if(l.startsWith('|')&&section.includes('5C.')&&l.split('|').length===5&&!l.includes('参考定位')&&!/^\|[-| ]+$/.test(l)){
      const cells=l.split('|').map(c=>c.trim());
      tiers.push({id:'t-'+hash(l).slice(0,12),kind:'gpu',scope:'mobile',label:cells[1],subjectsAsWritten:cells[2],evidenceLevel:cells[1]==='未归类'?'identity_only':'qualitative_position',confidence:'conditional_overlapping_bands',evidenceRefs:[quote(i)],limitations:cells[3]+'；原文明确不是严格逐行降序，未知不得归入低性能。'});
    }
    if(l.startsWith('|')&&section.includes('6. 面向')&&!l.includes('使用场景')&&!/^\|[-| ]+$/.test(l)){
      const cells=l.split('|').map(c=>c.trim());workloads.push({name:cells[1],considerations:cells[2],unsupportedConclusions:cells[3],evidenceRefs:[quote(i)]});
    }
    if(/^\d+\. /.test(l)&&section.includes('8. 为什么'))restrictions.push({type:'whole_laptop_limit',text:l,confidence:'document_statement',evidenceRefs:[quote(i)]});
    if(l.startsWith('|')&&section.includes('10. 知识不足')&&!l.includes('已知情况')&&!/^\|[-| ]+$/.test(l))restrictions.push({type:'unknown_handling',text:l,evidenceRefs:[quote(i)]});
    if(l.startsWith('- **')&&section.includes('不同任务下'))workloads.push({name:l.match(/\*\*(.+?)\*\*/)[1],considerations:l,limitations:'应用适配描述，不是对应型号跑分',evidenceRefs:[quote(i)]});
    if(l.startsWith('- **')&&section.includes('CPU 可核验的直接比较')){
      const subjects=[];
      if(l.includes('单线程')){
        const values=l.match(/约 ([\d,]+) vs ([\d,]+)（CPU Mark），以及 ([\d,]+) vs ([\d,]+)（单线程）/);
        assert(values,'CPU直接比较格式发生变化');
        for(const [metric,offset] of [['PassMark CPU Mark',1],['PassMark Single Thread',3]]){
          const models=['Core Ultra X7 358H','Ryzen 7 H 255'];
          const obs=models.map((model,j)=>addObservation('cpu',model,metric,Number(values[offset+j].replaceAll(',','')),i,'5B直接比较；2026-10-27；同口径项目，非所有工作负载'));
          relations.push({id:'r-cpu-'+metric.replaceAll(' ','-'),kind:'cpu',subjects:obs.map(o=>o.subject),relation:'higher_in_named_metric',metric,observationRefs:obs.map(o=>o.id),evidenceLevel:'measured_or_compared',confidence:'document_snapshot',evidenceRefs:[quote(i)],statement:'仅在原文记载的'+metric+'项目中前者领先，不代表所有软件或GPU表现。',limitations:'原文只支持该基准项目，不能推断所有软件或GPU先后。'});
        }
      }else{
        const models=l.includes('相近的高段位')?['Core Ultra 9 290HX Plus','Ryzen 9 9955HX','Apple M5 Max 18核']:['Core Ultra X7 358H','Core Ultra 7 356H'];
        relations.push({id:'r-cpu-group-'+hash(l).slice(0,8),kind:'cpu',subjects:models.map(x=>canonicalModel(x,'cpu')),relation:'similar_broad_multicore_band',statement:'仅表示原文所述多核宽泛段位接近，不代表所有任务相等或严格顺序。',evidenceLevel:'qualitative_position',confidence:'no_strict_internal_order',evidenceRefs:[quote(i)],limitations:l+'；不建立行内全序。'});
      }
    }
    if(l.startsWith('|')&&section.includes('GPU 有实测')&&l.includes(' vs ')){
      const cells=l.split('|').map(c=>c.trim()),pair=cells[1].split(' vs ');
      const names=pair.map(x=>x.startsWith('RTX')?x.replace(/ Laptop$/,' Laptop GPU'):x.startsWith('Arc')?'Intel '+x:x);
      const subjects=names.map(x=>canonicalModel(x,'gpu'));
      const obs=[];
      const nums=cells[2].match(/(?:约 )?([\d,]+) vs ([\d,]+)/);
      if(nums){for(let j=0;j<2;j++)obs.push(addObservation('gpu',names[j],'3DMark Time Spy Graphics',Number(nums[j+1].replaceAll(',','')),i,'5C Notebookcheck移动GPU汇总；2026-10-28记录；GPU功耗/整机条件不统一'));}
      const relation=obs.length?'higher_in_named_metric':cells[1].includes('890M')?'higher_in_tested_projects_not_fixed_ratio':cells[1].includes('4050')?'overlap_depends_on_power':'workload_preference_not_universal_rank';
      relations.push({id:'r-gpu-'+hash(l).slice(0,10),kind:'gpu',subjects,relation,metric:obs.length?'3DMark Time Spy Graphics':null,observationRefs:obs.map(x=>x.id),evidenceLevel:obs.length||cells[1].includes('890M')||cells[1].includes('4050')?'measured_or_compared':'qualitative_position',confidence:'context_limited',evidenceRefs:[quote(i)],statement:'仅在原文所述测试、工作负载和条件下：'+cells[3],prohibitedInference:cells[4],limitations:'不能据此推断：'+cells[4]+'；保留原文语境，不计算额外百分比或生成精确名次。'});
    }
  }
  for(const name of ['Core i5-13420H','Core 5 320','Core Ultra 5 325','Ryzen 5 7530U']){
    const index=find(name,'1. CPU 是什么');
    identities.push({kind:'cpu',subject:canonicalModel(name,'cpu'),evidenceLevel:'identity_only',evidenceRefs:[quote(index)],limitations:'基本知识只识别完整型号，不含此型号的可比基准。'});
  }
  identities.push({kind:'cpu',selector:'Apple M5 family',evidenceLevel:'identity_only',evidenceRefs:[quote(find('| Apple Silicon |'))],limitations:'家族识别，不继承不同核数的基准。'});
  const basic=find('| Apple M 系列内置 GPU |');
  identities.push({kind:'gpu',selector:'Apple M family',type:'integrated_soc_gpu',evidenceLevel:'identity_only',evidenceRefs:[quote(basic)],limitations:'只确认类型/架构，不给Apple GPU性能梯队。'});
  for(const name of ['Intel Arc 130V','Intel Arc B390','AMD Radeon 780M']){
    const index=find('| '+name+' |');identities.push({kind:'gpu',subject:canonicalModel(name,'gpu'),type:'integrated',evidenceLevel:'identity_only',evidenceRefs:[quote(index)],limitations:'仅此明确型号，不能把所有Intel Arc误判成核显。'});
  }
  scopeRules.push({type:'desktop_laptop_separation',statement:'无Laptop标识的桌面天梯型号不能变为Laptop精确证据；目录简写仍保留歧义。',evidenceRefs:[quote(find('这张 GPU 图中的'))]});
  scopeRules.push({type:'suffix_and_platform',statement:'保留K/H/HX/U/V、Plus、AI与Apple核心配置，禁止近似名称代替。',evidenceRefs:[quote(find('不把桌面 CPU 与移动 CPU'))]});
  scopeRules.push({type:'unknown_not_low',statement:'未知不归最低；不由天梯距离制造评分。',evidenceRefs:[quote(find('不把天梯图的纵向距离')),quote(find('未知不是“性能差”'))]});
  const x7=observations.filter(o=>o.subject.id===canonicalModel('Core Ultra X7 358H','cpu').id&&o.metric==='PassMark CPU Mark');
  if(new Set(x7.map(o=>o.value)).size>1)discrepancies.push({subject:x7[0].subject,metric:'PassMark CPU Mark',values:x7.map(o=>o.value),observationRefs:x7.map(o=>o.id),handling:'原文表格33540与直接比较33541均保留为近似快照；不悄悄选择或覆盖，也不合成新数值。'});
  const powerIndex=find('GPU Subsystem Power 为');
  for(const [name,pattern] of [
    ['RTX 5060 Laptop GPU',/RTX 5060 Laptop GPU 列出的 GPU Subsystem Power 为 (\d+)[–-](\d+) W/],
    ['RTX 5070 Ti Laptop GPU',/RTX 5070 Ti Laptop GPU 为 (\d+)[–-](\d+) W/]
  ]){
    const m=lines[powerIndex].match(pattern);assert(m,'功耗原文结构变化');
    operatingConditions.push({subject:canonicalModel(name,'gpu'),kind:'gpu_power_range_as_documented',minimumWatts:Number(m[1]),maximumWatts:Number(m[2]),actualLaptopPowerKnown:false,evidenceLevel:'identity_only',confidence:'document_range_not_product_measurement',sourceRefs:['3'],evidenceRefs:[quote(powerIndex)],limitations:'这是原文记载的GPU范围，不是任一已收录机型的实际功耗；不回填Excel，不默认最大功耗，不据此生成性能分。'});
  }
  const externalSources=[];
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(/^(\d+)\. \*\*(.+?)\*\*.*?(https?:\/\/\S+)/);
    if(m)externalSources.push({id:m[1],title:m[2],url:m[3],evidenceRefs:[quote(i)],networkChecked:false});
  }
  for(const collection of [observations,relations,tiers,workloads,restrictions,identities,scopeRules,operatingConditions])for(const fact of collection){
    fact.confidence ??= 'local_document_statement_not_externally_reverified';
    fact.evidenceLevel ??= collection===workloads?'qualitative_position':'comparison_limit';
    fact.sourceRefs ??= fact.kind==='cpu' && (fact.metric || fact.scope==='mobile') ? [fact.context?.includes('直接比较') || fact.relation==='higher_in_named_metric' ? '6':'5'] : fact.kind==='gpu' && (fact.metric || fact.scope==='mobile' || fact.relation) ? ['7','8'] : [];
  }
  for(const r of relations){
    if(['higher_in_named_metric','higher_in_tested_projects_not_fixed_ratio'].includes(r.relation))r.direction={higherSubjectId:r.subjects[0].id,lowerSubjectId:r.subjects[1].id,onlyInStatedContext:true,universalPerformanceRanking:false};
    else if(r.relation==='workload_preference_not_universal_rank')r.direction={preferredSubjectId:r.subjects[1].id,workloads:['3D游戏','GPU渲染'],onlyInStatedContext:true,universalPerformanceRanking:false};
    else {r.symmetric=true;r.direction={symmetric:true,universalPerformanceRanking:false,onlyInStatedContext:true};}
  }
  for(const collection of [observations,relations,tiers,workloads,restrictions,identities,scopeRules,operatingConditions])for(const fact of collection){
    if(!fact.sourceRefs.length){
      const q=fact.evidenceRefs.map(id=>evidence.find(e=>e.id===id).quote).join(' ');
      fact.sourceRefs=[...new Set([...q.matchAll(/\[(\d+)\]/g)].map(m=>m[1]))].filter(id=>externalSources.some(s=>s.id===id));
    }
  }
  const referenceModels=new Map();
  for(const o of observations)referenceModels.set(o.subject.id,o.subject);
  for(const r of relations)for(const s of r.subjects)referenceModels.set(s.id,s);
  return {schemaVersion:1,source:{file:'../data/说明文档.md',sha256:hash(text),sourceType:'user_local_markdown',networkReverification:false},referenceModels:[...referenceModels.values()],externalSources,observations,relations,tiers,workloads,restrictions,identities,scopeRules,operatingConditions,discrepancies,evidence,
    evidenceLevels:{measured_or_compared:'有明确指标或带条件的实测比较；不代表全部任务',qualitative_position:'只作保守用途定位，不给精确名次',identity_only:'仅识别名称/系列/类型，不参与性能比较',unknown:'文档无可靠资料；缺失GPU不判数据错误'}};
}

export function inventoryFromRows(rows,catalog,reference) {
  const groups={cpu:new Map(),gpu:new Map()},records=[];
  const ids=ref=>reference.observations.filter(o=>o.subject.id===ref.id).map(o=>o.id);
  const identityRefs=m=>reference.identities.filter(f=>f.subject?.id===m.id || (f.selector?.includes('M5') && m.kind==='cpu' && m.normalizedKey.startsWith('m5')) || (f.selector==='Apple M family' && m.kind==='gpu' && m.normalizedKey.startsWith('m'))).flatMap(f=>f.evidenceRefs);

  for(const [offset,raw] of rows.entries()){
    const p=catalog.find(p=>p.source_records.some(s=>s.sheet==='Sheet1'&&s.row===offset+2));assert(p,'Excel行未对应商品');
    assert.equal(String(raw.CPU_model).trim(),p.cpu_model);assert.equal(raw.GPU_model??null,p.gpu_model);
    const record={productId:p.id,row:offset+2,model:p.model,cpuId:null,gpuId:null,gpuModelMissingIntentional:raw.GPU_model==null&&p.gpu_type==='集成显卡',gpuTypeInExcel:raw.GPU_Type,gpuTypeInExistingCatalog:p.gpu_type};
    for(const kind of ['cpu','gpu']){
      const original=raw[kind==='cpu'?'CPU_model':'GPU_model'],m=canonicalModel(original,kind);
      if(!m)continue;record[kind+'Id']=m.id;
      if(!groups[kind].has(m.id)){
        const current=kind==='cpu'?matchCPU(original):matchGPU(original,{laptopContext:true});
        groups[kind].set(m.id,{...m,rawAliases:[],productIds:[],productCount:0,observationRefs:ids(m),existingMatchStatus:current.status,
          performanceLevel:ids(m).length?'measured_or_compared':current.status==='contextual_tier'?'conditional_position':current.status==='identity_only'?'identity_only':'unknown',
          identityEvidenceRefs:identityRefs(m),
          possibleMobileReference:kind==='gpu'&&current.status==='contextual_tier'?canonicalModel(current.canonicalName,'gpu'):null,
          limitations:current.reason,classificationInCatalog:kind==='gpu'?p.gpu_type:null});
      }
      const g=groups[kind].get(m.id);if(!g.rawAliases.includes(original))g.rawAliases.push(original);g.productIds.push(p.id);g.productCount++;
    }
    records.push(record);
  }
  for(const g of groups.gpu.values()){
    g.conditionalEvidenceRefs=g.possibleMobileReference ? reference.relations.filter(r=>r.subjects.some(s=>s.id===g.possibleMobileReference.id)).flatMap(r=>r.evidenceRefs) : [];
  }
  return {schemaVersion:1,source:'../data/电脑数据.xlsx',records,cpuModels:[...groups.cpu.values()],gpuModels:[...groups.gpu.values()],missingGpu:{count:records.filter(r=>!r.gpuId).length,intentionalIntegrated:records.filter(r=>r.gpuModelMissingIntentional).length,discreteMissing:records.filter(r=>!r.gpuId&&r.gpuTypeInExistingCatalog==='独立显卡').length},note:'rawAliases保留Excel精确原文，包括尾随空白；未明确版本的RTX不合并进Laptop模型。分类沿用既有目录，不修改Excel。'};
}

export function validateReference(reference,text) {
  const lines=text.split(/\r?\n/),evidence=new Map(reference.evidence.map(e=>[e.id,e]));
  assert.equal(reference.source.sha256,hash(text));
  for(const e of reference.evidence)assert.equal(lines.slice(e.lineStart-1,e.lineEnd).join('\n'),e.quote);
  for(const collection of ['observations','relations','tiers','workloads','restrictions','identities','scopeRules','operatingConditions','externalSources'])for(const fact of reference[collection]){
    assert(fact.evidenceRefs?.length,collection+'缺少证据');for(const id of fact.evidenceRefs)assert(evidence.has(id));
    if(fact.sourceRefs) for(const id of fact.sourceRefs)assert(reference.externalSources.some(x=>x.id===id));
    if('value' in fact)assert(fact.evidenceRefs.some(id=>evidence.get(id).quote.replaceAll(',','').includes(String(fact.value))));
  }
  assert(!('performanceScore' in reference));return true;
}

export function main(){
  const source=path.join(ROOT,'../data/说明文档.md'),excel=path.join(ROOT,'../data/电脑数据.xlsx');
  const text=fs.readFileSync(source,'utf8'),excelHash=hash(fs.readFileSync(excel));
  const py=String.raw`import json,sys; from openpyxl import load_workbook; w=load_workbook(sys.argv[1],read_only=True,data_only=True); a=list(w['Sheet1'].values); h=a[0]; json.dump([dict(zip(h,r)) for r in a[1:] if any(v is not None for v in r)],sys.stdout,ensure_ascii=False); w.close()`;
  const result=spawnSync('python',['-c',py,excel],{encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  if(result.status!==0)throw new Error(result.stderr);const rows=JSON.parse(result.stdout);
  const catalog=JSON.parse(fs.readFileSync(path.join(ROOT,'frontend/src/data/catalog.json'),'utf8'));
  assert.equal(rows.length,78);assert.equal(catalog.length,rows.length);
  const reference=buildReference(text);validateReference(reference,text);
  const inventory=inventoryFromRows(rows,catalog,reference);
  inventory.sourceSha256=excelHash;
  assert.equal(new Set(inventory.records.map(r=>r.productId)).size,78);
  assert.equal(inventory.missingGpu.intentionalIntegrated,40);assert.equal(inventory.missingGpu.discreteMissing,0);
  const baseline=JSON.parse(fs.readFileSync(path.join(ROOT,'data/processed/hardware_match_report.json'),'utf8'));
  const matchedProducts=(metric)=>inventory.records.filter(r=>reference.observations.some(o=>o.subject.id===r.cpuId&&o.metric===metric)).length;
  const cpuMulti=matchedProducts('PassMark CPU Mark'),cpuSingle=matchedProducts('PassMark Single Thread');
  const gpuStrict=inventory.records.filter(r=>reference.observations.some(o=>o.subject.id===r.gpuId)).length;
  const gpuConditional=inventory.gpuModels.filter(g=>g.performanceLevel==='conditional_position').reduce((n,g)=>n+g.productCount,0);
  const pct=n=>Math.round(n/78*10000)/100;
  const coverage={total:78,rawCpuExactNames:new Set(rows.map(r=>r.CPU_model)).size,trimmedCpuNames:new Set(rows.map(r=>r.CPU_model.trim())).size,normalizedCpuModels:inventory.cpuModels.length,
    rawGpuNames:new Set(rows.map(r=>r.GPU_model).filter(Boolean)).size,normalizedGpuModels:inventory.gpuModels.length,missingGpu:inventory.missingGpu,
    cpuMulticore:{before:baseline.cpu.strictPerformanceMatches,after:cpuMulti,coverage:pct(cpuMulti),increase:cpuMulti-baseline.cpu.strictPerformanceMatches},
    cpuSinglecore:{beforeStructuredRecords:0,after:cpuSingle,coverage:pct(cpuSingle),note:'新增资料维度，不冒充总型号覆盖提升'},
    gpuStrict:{before:baseline.gpu.strictPerformanceMatches,after:gpuStrict,coverage:pct(gpuStrict),increase:gpuStrict-baseline.gpu.strictPerformanceMatches},
    gpuConditional:{before:baseline.gpu.conditionalMobileTierMatches,after:gpuConditional,coverage:pct(gpuConditional),increase:gpuConditional-baseline.gpu.conditionalMobileTierMatches},
    missingCpu:inventory.cpuModels.filter(m=>!m.observationRefs.length).sort((a,b)=>b.productCount-a.productCount||a.id.localeCompare(b.id)),
    missingGpuModels:inventory.gpuModels.filter(m=>!m.observationRefs.length).sort((a,b)=>b.productCount-a.productCount||a.id.localeCompare(b.id)),
    reasons:['旧CPU别名已经覆盖文档可用数值型号，无新增可靠型号可提高35/78；Core和Ultra、H和HX、Plus、AI以及Apple核数不能互代。','40条集显无型号属于允许缺失，不能从CPU补猜；18条RTX简写有移动版歧义，不晋升严格匹配。','Apple GPU、130T/B370、RTX3050/Pro2000及多种CPU原文无可比性能数据。','原有快照遗漏了单核数值、部分关系、逐条原文和条件；本次补齐资料，不改权重和排序实现。']};
  const dir=path.join(ROOT,'data/reference');fs.mkdirSync(dir,{recursive:true});
  const write=(file,data)=>fs.writeFileSync(path.join(ROOT,file),JSON.stringify(data,null,2)+'\n');
  write('data/reference/performance_reference.json',reference);write('data/reference/hardware_models.json',inventory);write('data/processed/performance_reference_coverage.json',coverage);
  const md=['# 3B-1 本地Markdown提取报告（来源层）','', '这是原始Markdown的覆盖统计，不含联网补充。当前合并资料与覆盖率请看hardware_research_report.md及performance_reference_unified.json。','',`读取原始Excel 78条配置：CPU原始精确写法${coverage.rawCpuExactNames}种、去首尾空白${coverage.trimmedCpuNames}种、标准化后${coverage.normalizedCpuModels}种；GPU非空原文${coverage.rawGpuNames}种、标准化后${coverage.normalizedGpuModels}种。空集显40条不是异常，独显缺型号0条。`,
    '', '原始写法53与旧报告52的差别来自尾随空白；不是多出电脑或新的CPU型号。所有原文与标准名的映射在hardware_models.json中保留。',
    '',`结构化数值观察${reference.observations.length}条，明确/定性比较关系${reference.relations.length}条，梯队${reference.tiers.length}条，用途描述${reference.workloads.length}条。没有生成新的性能分数、百分比或精确名次。`,
    '', '|覆盖口径|之前|本次|说明|','|---|---|---|---|',
    `|CPU多核可比较商品|${coverage.cpuMulticore.before}/78|${cpuMulti}/78 (${pct(cpuMulti)}%)|增加${coverage.cpuMulticore.increase}条，不降低标准|`,
    `|CPU单核数值结构化|未提取|${cpuSingle}/78 (${pct(cpuSingle)}%)|新增维度，不能加到总覆盖率|`,
    `|GPU严格性能匹配|${coverage.gpuStrict.before}/78|${gpuStrict}/78|RTX版本歧义未解决|`,
    `|GPU条件性移动定位|${coverage.gpuConditional.before}/78|${gpuConditional}/78 (${pct(gpuConditional)}%)|仍需核验Laptop身份|`,
    '',...coverage.reasons.map(x=>'- '+x),'','## 原文比较关系','', '|类型|对象|关系|条件/限制|','|---|---|---|---|'];
  for(const r of reference.relations)md.push(`|${r.kind}|${r.subjects.map(s=>s.standardName).join(' / ')}|${r.relation}${r.metric?' / '+r.metric:''}|${r.limitations.replaceAll('|','/')}|`);
  md.push('','## 原文数值小差异','','X7 358H多核表格为约33540，直接比较为约33541。本资料分别保存两条来源观察及差异，不覆盖、不取平均、不添加性能百分比。','', '## 缺少可比资料的CPU（按影响条数）','','|标准名称|原始别名|商品数|状态|','|---|---|---|---|');
  for(const m of coverage.missingCpu)md.push(`|${m.standardName}|${m.rawAliases.map(x=>JSON.stringify(x)).join(' / ')}|${m.productCount}|${m.performanceLevel}|`);
  md.push('','## 缺少严格可比资料的GPU（按影响条数）','','40条空型号不新增虚构型号，不计为独立GPU型号，也不视作错误。','', '|标准名称|原始别名|商品数|状态|','|---|---|---|---|');
  for(const m of coverage.missingGpuModels)md.push(`|${m.standardName}|${m.rawAliases.join(' / ')}|${m.productCount}|${m.performanceLevel}|`);
  md.push('','## 范围及读取方法','','本次资料独立保存，不替换3B运行快照，不改变硬件匹配数值行为、评分权重或页面；仅修正非Apple说明模板。这样不会为了覆盖率改变现有排序。下一步如要使用新增单核/关系，需单独设计与验收。',
    '', 'performance_reference.json包含原文行号/章节/完整引文、证据等级、原始来源链接留在引文中、适用条件、数值观察、定性梯队、用途及限制。所有事实均由evidenceRefs反查evidence，证据逐字验证。没有联网核验来源链接，也不把本地文档记载当作本次新实测。',
    '', '硬件型号清单由唯一Excel原件读取并与现有JSON逐行核对；RTX简写独立于Laptop/Desktop标准型号保存。类型沿用现有catalog，Apple和已标集显的Arc不会被改为独显；130T/B370原文无型号性能依据，不借用130V/B390。',
    '', '重建：在项目根目录运行 `node scripts/build_performance_reference.mjs`。依赖现有Node和Python/openpyxl，无新增依赖。');
  fs.writeFileSync(path.join(ROOT,'data/processed/performance_reference_report.md'),md.join('\n')+'\n');
  assert.equal(hash(fs.readFileSync(source)),reference.source.sha256);assert.equal(hash(fs.readFileSync(excel)),excelHash);
  console.log(JSON.stringify({rawCpu:coverage.rawCpuExactNames,trimmedCpu:coverage.trimmedCpuNames,standardCpu:coverage.normalizedCpuModels,rawGpu:coverage.rawGpuNames,standardGpu:coverage.normalizedGpuModels,records:78,observations:reference.observations.length,relations:reference.relations.length,cpuMulti,cpuSingle,gpuStrict,gpuConditional,originalsUnchanged:true},null,2));
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main();
