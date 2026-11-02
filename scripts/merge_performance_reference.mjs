/** Offline merge only: supplementary evidence never enters the current scorer. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validateReference} from './build_performance_reference.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex');
export function canCompareFacts(a,b){
 return a.kind===b.kind && a.level==='comparable' && b.level==='comparable' && Number.isFinite(a.value) && Number.isFinite(b.value) && !!a.comparisonGroup && a.comparisonGroup===b.comparisonGroup && a.metric===b.metric;
}
export function validateSupplement(external,inventory,mapping,catalog){
 const sources=new Map(external.sources.map(s=>[s.id,s]));
 assert.equal(sources.size,external.sources.length,'来源ID重复');
 assert.equal(new Set(external.facts.map(f=>f.id)).size,external.facts.length,'事实ID重复');
 const models=new Set([...inventory.cpuModels,...inventory.gpuModels].map(m=>m.id));
 const extraGpu=new Set(['gpu-rtx5060-laptop','gpu-rtx5070ti-laptop','gpu-rtxpro2000blackwell-laptop','gpu-rtx30504gb-laptop']);
 for(const f of external.facts){
  assert(models.has(f.modelId)||extraGpu.has(f.modelId),'未知型号ID '+f.modelId);
  assert(sources.has(f.sourceId),'缺少来源 '+f.id);
  const s=sources.get(f.sourceId);assert.equal(s.access,'opened_verified');
  assert(/^https:\/\//.test(s.url)&&s.title&&s.locator&&s.verifiedAt);
  assert(f.fullModelName&&f.context&&f.proof&&f.limitations&&f.confidence&&f.mobileScope);
  assert(['comparable','qualitative','identity_only'].includes(f.level));
  if(f.level==='comparable'){
   assert(Number.isFinite(f.value)&&f.value>0&&f.metric&&f.unit&&f.comparisonGroup);
   assert(f.proof.replaceAll(',','').includes(String(f.value)),'数值不在核验摘记中 '+f.id);
   assert(!/desktop_only/.test(f.mobileScope),'桌面证据不得计入移动可比资料');
  }else assert.equal(f.value,null,'仅定性或身份资料不能填数值');
 }
 assert.equal(new Set(mapping.mappings.map(m=>m.productId)).size,mapping.mappings.length);
 for(const m of mapping.mappings){
  const r=inventory.records.find(r=>r.productId===m.productId),p=catalog.find(p=>p.id===m.productId);
  assert(r&&p&&r.gpuId&&!r.gpuModelMissingIntentional,'映射不能指向空GPU或不存在商品');
  assert.equal(r.cpuId,m.expectedCpuId,'CPU锚点发生变化');assert.equal(r.gpuId,m.expectedGpuId,'GPU锚点发生变化');
  assert.equal(m.status,'confirmed_mobile_identity');assert.equal(m.gpuIdentityVerified,true);
  assert(m.resolvedGpuId.endsWith('-laptop')&&extraGpu.has(m.resolvedGpuId));
  assert(m.sourceIds.length&&m.sourceIds.every(id=>sources.has(id)));
  assert(m.basis&&m.skuVerified===false,'芯片身份核验不冒充商城SKU与价格核验');
  for(const [key,value] of Object.entries(m.expectedCatalogFields??{})) assert.equal(p[key],value,'商品配置锚点改变 '+key);
 }
 return true;
}
export function mergeReference(local,external,inventory,mapping,pending,catalog){
 validateSupplement(external,inventory,mapping,catalog);
 const factsFor=(id)=>external.facts.filter(f=>f.modelId===id);
 const status=(id,kind)=>{
  const fs=factsFor(id),localNumeric=local.observations.filter(o=>o.kind===kind&&o.subject.id===id);
  if(localNumeric.length||fs.some(f=>f.level==='comparable'))return 'comparable';
  const model=inventory[kind+'Models'].find(m=>m.id===id);
  if(fs.some(f=>f.level==='qualitative')||model?.performanceLevel==='conditional_position')return 'qualitative_only';
  if(fs.some(f=>f.level==='identity_only')||model?.performanceLevel==='identity_only')return 'identity_only';
  return 'unknown';
 };
 const products=inventory.records.map(r=>{
  const map=mapping.mappings.find(m=>m.productId===r.productId);
  const gpuId=map?.resolvedGpuId??r.gpuId;
  return {...r,resolvedGpuId:gpuId,cpuStatus:status(r.cpuId,'cpu'),gpuStatus:gpuId?status(gpuId,'gpu'):'missing_model_allowed',gpuIdentityMapping:map??null,
   cpuExternalFactIds:factsFor(r.cpuId).map(f=>f.id),gpuExternalFactIds:gpuId?factsFor(gpuId).map(f=>f.id):[]};
 });
 const count=kind=>Object.fromEntries(['comparable','qualitative_only','identity_only','unknown','missing_model_allowed'].map(s=>[s,products.filter(p=>p[kind+'Status']===s).length]));
 const modelAudit=[...inventory.cpuModels,...inventory.gpuModels].map(m=>({modelId:m.id,fullModelName:m.standardName,rawAliases:m.rawAliases,kind:m.kind,productCount:m.productCount,status:status(m.id,m.kind),
   localObservationIds:local.observations.filter(o=>o.subject.id===m.id).map(o=>o.id),externalFactIds:factsFor(m.id).map(f=>f.id),
   resolvedMobileProducts:products.filter(p=>p.gpuId===m.id&&p.gpuIdentityMapping).map(p=>p.productId),
   pending:pending.items.filter(p=>p.modelId===m.id)}));
 const relation=(a,b,statement)=>{
  const aa=external.facts.find(f=>f.modelId===a&&f.metric==='3DMark Steel Nomad'),bb=external.facts.find(f=>f.modelId===b&&f.metric==='3DMark Steel Nomad');
  assert(canCompareFacts(aa,bb));return {id:'web-relation-'+a+'-'+b,kind:'gpu',factIds:[aa.id,bb.id],sourceIds:[aa.sourceId,bb.sourceId],statement,
   direction:{higher:a,lower:b,onlyInStatedContext:true,universalPerformanceRanking:false},limitations:'仅这些样本、同一测试与Metal平台成立；不是所有游戏/功耗设置的结论，不生成百分比、FPS或精确总排名。'};
 };
 const externalRelations=[relation('gpu-m5pro20cores-unspecified','gpu-m5pro16cores-unspecified','仅在已记录Metal Steel Nomad样本中，M5 Pro20核2323高于16核1980；机身与CPU不同。'),relation('gpu-m510cores-unspecified','gpu-m58cores-unspecified','仅在已记录MacBook Air样本Metal Steel Nomad中，M5 GPU10核1070高于8核941；不是对所有整机的保证。')];
 return {schemaVersion:1,purpose:'下一阶段唯一统一性能对照入口；尚未接入当前推荐评分',generatedFrom:{local:'performance_reference.json',external:'external_verified.json',inventory:'hardware_models.json',mapping:'product_gpu_mappings.json',pending:'research_pending.json'},
  localKnowledge:local,externalKnowledge:external,externalRelations,productAssessments:products,modelAudit,
  coverage:{denominator:78,definition:'每条商品每种硬件只计一次；comparable=完整型号有同口径数值依据，GPU须明确版本/核数；qualitative不充当实测。CPU聚合基准不等于整机实测，含来源允许的混合提交；跨测试/平台不自动排名。',baseline:{cpuComparable:35,gpuComparable:0,gpuConditional:18},cpu:count('cpu'),gpu:count('gpu'),
   externalComparableCpuModels:new Set(external.facts.filter(f=>f.kind==='cpu'&&f.level==='comparable').map(f=>f.modelId)).size,
   externalComparableGpuModels:new Set(external.facts.filter(f=>f.kind==='gpu'&&f.level==='comparable').map(f=>f.modelId)).size,
   confirmedRtxMobileProducts:mapping.mappings.length},pendingResearch:pending,principles:external.principles};
}
export function main(){
 const local=read('data/reference/performance_reference.json'), external=read('data/reference/external_verified.json'), inventory=read('data/reference/hardware_models.json'), mapping=read('data/reference/product_gpu_mappings.json'),pending=read('data/reference/research_pending.json'),catalog=read('frontend/src/data/catalog.json');
 validateReference(local,fs.readFileSync(path.join(ROOT,'../data/说明文档.md'),'utf8'));
 assert.equal(sha('../data/电脑数据.xlsx'),inventory.sourceSha256,'Excel更新后需先重建基础资料');
 for(const [p,h] of Object.entries(read('data/reference/runtime_preservation.json')))assert.equal(sha(p),h,'当前评分/数据发生变化 '+p);
 const result=mergeReference(local,external,inventory,mapping,pending,catalog);
 assert.equal(result.productAssessments.length,78);assert.equal(result.coverage.gpu.missing_model_allowed,40);
 for(const k of ['cpu','gpu'])assert.equal(Object.values(result.coverage[k]).reduce((a,b)=>a+b,0),78);
 const write=(p,data)=>fs.writeFileSync(path.join(ROOT,p),JSON.stringify(data,null,2)+'\n');
 write('data/reference/performance_reference_unified.json',result);
 write('data/processed/hardware_research_coverage.json',result.coverage);
 const lines=['# 3B硬件知识质量与联网核验报告','', '核验日期：2026-10-29。补充资料不导入当前评分。Excel、Markdown、UI、权重与当前排序保持原样。','',
 '## 提取修复','', '全部9条本地比较关系逐条保留否定、范围限制及原文证据。GPU表格的“不能据此推断”列此前单独取值丢失否定，本次在生成器保留列语义；禁止把局部观察写成通用领先。非Apple CPU说明改为完整CPU型号及后缀匹配，数值逻辑不变。','',
 '## 统一覆盖口径','', '|维度|原有可比较|补充后可比较|仅定性|仅身份|未知|合法空型号|','|---|---|---|---|---|---|---|',
 `|CPU|35/78|${result.coverage.cpu.comparable}/78|${result.coverage.cpu.qualitative_only}|${result.coverage.cpu.identity_only}|${result.coverage.cpu.unknown}|0|`,
 `|GPU|0/78|${result.coverage.gpu.comparable}/78|${result.coverage.gpu.qualitative_only}|${result.coverage.gpu.identity_only}|${result.coverage.gpu.unknown}|${result.coverage.gpu.missing_model_allowed}|`,
 '',result.coverage.definition,'',`联网数值依据覆盖CPU ${result.coverage.externalComparableCpuModels}种；GPU ${result.coverage.externalComparableGpuModels}种（其中部分Laptop基准已有，但商品身份仍不明确，未计为商品覆盖）。41CPU及13非空GPU逐型号审计如下。`,
 '', '### 必须保留的限制','',...external.principles.map(p=>'- '+p),
 '- PassMark列表为聚合快照，分类由提交者填写，不能保证每个样本均为笔记本；H270同时标Desktop/Laptop且仅1样本。H450仅1样本、H465仅8样本，误差较大。',
 '- CPU同时保留单线程与多线程，69/78并不表示所有型号都具备这两个维度，也不意味着每对CPU都有同口径数据。',
 '- M5 Pro16核GPU页面简介错写20核；表格明确16核/15CPU/Mac17,9，仅以该条测试行记录，可信程度低并待进一步交叉复核。',
 '- M6只保存官方身份和用途定位。GPU可见数值来自Mac mini，不转成MacBook实测；M5 Max32核无数值。RTX3050有4GB/6GB/A变体，当前简写不晋升。',
 '', '## 全部型号审计','', '|型号|影响商品|结论|新事实条数|待核验说明|','|---|---|---|---|---|'];
 for(const m of result.modelAudit.sort((a,b)=>b.productCount-a.productCount||a.modelId.localeCompare(b.modelId)))lines.push(`|${m.fullModelName}|${m.productCount}|${m.status}${m.resolvedMobileProducts.length?'，其中'+m.resolvedMobileProducts.length+'条已确认移动身份':''}|${m.externalFactIds.length}|${m.pending.map(p=>p.reason).join('；')||'—'}|`);
 lines.push('','## RTX逐商品身份核验','','|商品ID|型号 / CPU / 内存 / SSD|结论|依据|','|---|---|---|---|');
 for(const p of productsSorted(result.productAssessments.filter(p=>p.gpuId?.startsWith('gpu-rtx')))){
  const c=catalog.find(c=>c.id===p.productId),m=p.gpuIdentityMapping;
  lines.push(`|${p.productId}|${c.model} / ${c.cpu_model} / ${c.ram_gb}GB / ${c.ssd_gb}GB|${m?'已确认Laptop芯片身份，未确认商城SKU/价格':'版本未明确，不直接套用Laptop数值'}|${m?m.sourceIds.map(id=>{const s=external.sources.find(s=>s.id===id);return `[${s.title}](${s.url})`;}).join('、'):'原始链接：'+c.source_url}|`);
 }
 lines.push('','两条确认仅限同产品名称与CPU/内存/SSD/尺寸吻合的芯片身份。没有全局修改RTX5060别名，也没有改Excel价格。天选7Pro当前官方页CPU与Excel251HX不符；不强行对应。联想首页、HP403、机械革命无正文均保留待核。','', '## 新增受限比较关系','',...result.externalRelations.map(r=>'- '+r.statement+' '+r.limitations),
 '', 'CPU新数值按测试口径分组保存，不自动生成跨测试排名。336H/338H数值差距小，不据微小均值差断言真实整体领先。RTX5070Ti有65–140W扫描，不把它当当前SKU的实际功耗。专业GPU SPECviewperf帧率只代表专业视窗测试。','', '## 本次已打开核验的来源','');
 for(const s of external.sources)lines.push(`- [${s.title}](${s.url})：${s.locator}。核验${s.verifiedAt}，测试/发布日期${s.publishedOrTestedAt??'页面未明确或动态更新'}。`);
 lines.push('','## 访问失败、受限和未完成线索','');for(const a of pending.accessAttempts)lines.push(`- ${a.url}：${a.result}。未绕过限制。`);
 lines.push('','## 重建与维护','', '`external_verified.json`、`product_gpu_mappings.json`、`research_pending.json`是独立维护输入，不能由本地Markdown生成器覆盖；`performance_reference_unified.json`是下一阶段唯一合并入口。当前网页仍读取原有`frontend/src/data/hardwareKnowledge.json`，这是兼容快照而非新资料正式接入。',
 '', '项目根目录运行：`node scripts/build_performance_reference.mjs`，随后 `node scripts/merge_performance_reference.mjs`。两个步骤均离线，合并前检查唯一Excel/Markdown及当前运行文件校验和；不需要实时网络。',
 '', '验证：新增来源、否定语义、移动身份、空集显、输入完整性及资料不影响当前七组排序的测试。完整测试、构建和浏览器结果见最终验证记录。');
 fs.writeFileSync(path.join(ROOT,'data/processed/hardware_research_report.md'),lines.join('\n')+'\n');
 console.log(JSON.stringify(result.coverage,null,2));return result;
}
function productsSorted(ps){return [...ps].sort((a,b)=>a.productId.localeCompare(b.productId));}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main();

