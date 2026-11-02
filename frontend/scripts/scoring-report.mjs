import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { matchHardware, knowledgeVersion } from '../src/services/hardwareMatching.js';
import { rankCatalog } from '../src/services/scoreCatalog.js';
import { SCENARIOS, POLICY, PREFERENCE_WEIGHTS } from '../src/services/scoringConfig.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=path.join(root,'data/processed');
const catalog=JSON.parse(fs.readFileSync(new URL('../src/data/catalog.json',import.meta.url),'utf8'));
const source=path.join(root,'../data/说明文档.md');
const sha=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
assert.equal(sha,knowledgeVersion.sha256,'Markdown已变化，请先重建硬件知识快照');
const pct=(n,d)=>Math.round(n/d*10000)/100;
const records=catalog.map(p=>({id:p.id,model:p.model,cpu:matchHardware(p).cpu,gpu:matchHardware(p).gpu}));
function coverage(kind){
 const statusCounts={}; for (const r of records) statusCounts[r[kind].status]=(statusCounts[r[kind].status]??0)+1;
 const strict=records.filter(r=>['benchmark','tier'].includes(r[kind].status)).length;
 const conditional=records.filter(r=>r[kind].status==='contextual_tier').length;
 const nonempty=records.filter(r=>r[kind].raw!=null).length;
 const groups=new Map();
 for(const r of records){const h=r[kind];if(['benchmark','tier'].includes(h.status))continue;const key=h.raw??'(空型号)';
  if(!groups.has(key))groups.set(key,{raw:key,status:h.status,reason:h.reason,count:0,ids:[]});const g=groups.get(key);g.count++;g.ids.push(r.id);
 }
 return { total:records.length,nonempty,uniqueRawNames:new Set(records.filter(r=>r[kind].raw!=null).map(r=>r[kind].raw)).size,statusCounts,
 strictPerformanceMatches:strict,strictPerformanceCoverage:pct(strict,records.length),conditionalMobileTierMatches:conditional,
 conditionalMobileTierCoverage:pct(conditional,records.length),conditionalCoverageAmongNonempty:nonempty?pct(conditional,nonempty):0,
 unmatchedOrAmbiguous:[...groups.values()] };
}
const report={knowledgeVersion,cpu:coverage('cpu'),gpu:coverage('gpu'),records,
 interpretation:'严格性能覆盖只计可评分的完整移动证据；identity_only仅识别名称，contextual_tier是笔记本目录语境下的待核实定位，不冒充精确匹配。空GPU记录不删除。'};
fs.writeFileSync(path.join(out,'hardware_match_report.json'),JSON.stringify(report,null,2)+'\n');
const definitions=[
 ['办公学习',{budget:[5000,10000],os:'Windows',scenarios:['办公学习'],priorities:[]}],
 ['游戏娱乐',{budget:[10000,30000],os:'Windows',scenarios:['游戏娱乐'],priorities:[]}],
 ['编程开发',{budget:[7000,18000],os:'不限',scenarios:['编程开发'],priorities:[]}],
 ['设计创作',{budget:[10000,30000],os:'不限',scenarios:['设计创作'],priorities:[]}],
 ['轻薄便携',{budget:[5000,16000],os:'Windows',scenarios:['办公学习'],priorities:['轻薄便携']}],
 ['大屏幕',{budget:[8000,20000],os:'Windows',scenarios:['设计创作'],priorities:['大屏幕']}],
 ['多用途与性价比',{budget:[6000,18000],os:'Windows',scenarios:['办公学习','编程开发'],priorities:['高性价比','长续航']}],
];
const cases=definitions.map(([name,preferences])=>({name,preferences,ranked:rankCatalog(catalog,preferences)}));
fs.writeFileSync(path.join(out,'scoring_cases.json'),JSON.stringify({scoreKind:'匹配度不是硬件跑分',policy:{SCENARIOS,POLICY,PREFERENCE_WEIGHTS},cases},null,2)+'\n');
const md=['# 3B 真实数据库评分案例','', '所有维度均为应用层需求满足度（0—100），不是硬件跑分。CPU优先使用5B多核快照；GPU缺少Laptop标识时只作待核实移动定位。','',
 `CPU严格性能覆盖：${report.cpu.strictPerformanceMatches}/78（${report.cpu.strictPerformanceCoverage}%）。`,
 `GPU严格性能覆盖：${report.gpu.strictPerformanceMatches}/78；待核实移动定位：${report.gpu.conditionalMobileTierMatches}/78（${report.gpu.conditionalMobileTierCoverage}%）。`,
 '未知维度显示“未知(中性50)”；并非测得50分、性能较差或已满足需求。总分是带不确定性的排序估计。完整候选、各维度权重/依据、原始硬件匹配及提示见scoring_cases.json。',''];
const value=d=>d.score==null?'未知(中性50)':d.score.toFixed(1)+(d.estimated?'*':'');
for(const c of cases){
 md.push(`## ${c.name}`,'',`条件：${JSON.stringify(c.preferences)}；候选${c.ranked.length}条。`,'',
 '|顺序|机型及配置|CPU|GPU|内存|SSD|便携|尺寸|价格|价值适配|总分|依据覆盖|',
 '|---|---|---|---|---|---|---|---|---|---|---|---|');
 for(const [i,r] of c.ranked.slice(0,3).entries()){
  const p=r.product,d=r.dimensions;
  md.push(`|${i+1}|${p.model} / ${p.cpu_model} / ${p.gpu_model??'GPU未记录'} / ${p.ram_gb}GB / ${p.ssd_gb}GB / ¥${p.official_price_cny}|${['cpu','gpu','memory','storage','portability','screen','price','value'].map(k=>value(d[k])).join('|')}|${r.totalScore}|${r.dataCoverage}%|`);
 }
 md.push('', '* 表示包含语境推断或未知数据的估计维度；0权重维度虽然展示但不贡献总分。',
 ...c.ranked.slice(0,3).map((r,i)=>`${i+1}. ${r.product.id}：${r.explanation}；不确定区间${r.uncertaintyInterval.join('—')}。${r.warnings.join('；')}`),'');
}
md.push('## 未匹配与有歧义的型号','');
for(const kind of ['cpu','gpu']){
 md.push(`### ${kind.toUpperCase()}`,'','|原始名称|条数|匹配状态|说明|','|---|---|---|---|');
 for(const g of report[kind].unmatchedOrAmbiguous)md.push(`|${g.raw}|${g.count}|${g.status}|${g.reason}|`);
 md.push('');
}
fs.writeFileSync(path.join(out,'scoring_cases.md'),md.join('\n')+'\n');
console.log(JSON.stringify({cpu: {...report.cpu,unmatchedOrAmbiguous:undefined},gpu:{...report.gpu,unmatchedOrAmbiguous:undefined},cases:cases.map(c=>({name:c.name,count:c.ranked.length,top:c.ranked.slice(0,3).map(r=>({model:r.product.model,score:r.totalScore,coverage:r.dataCoverage}))}))},null,2));
