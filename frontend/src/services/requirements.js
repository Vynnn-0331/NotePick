// Labels and availability are metadata; selection state stores stable IDs only.
export const SCENARIO_GROUPS = [
 {id:'daily',label:'日常使用',options:[['documents','文档办公'],['online-study','网课学习'],['media','影音娱乐']]},
 {id:'development',label:'编程与开发',options:[['basic-coding','基础编程'],['large-projects','大型项目开发'],['local-ai','本地AI开发']]},
 {id:'creation',label:'设计与创作',options:[['graphics','平面设计与修图'],['video-editing','视频剪辑'],['modeling-3d','3D建模与渲染']]},
 {id:'gaming',label:'游戏',options:[['light-games','轻度网游'],['mainstream-games','主流游戏'],['aaa-games','大型3A游戏']]},
].map(g=>({...g,options:g.options.map(([id,label])=>({id,label,category:g.id,enabled:true}))}));
export const SCENARIOS = SCENARIO_GROUPS.flatMap(g=>g.options);
export const PRIORITIES = [
 ['portable','轻薄便携'],['cpu-power','运行流畅'],['gpu-power','游戏畅玩'],['memory','多开流畅'],['storage','海量存储'],['large-screen','大屏体验'],['value','经济实惠'],
].map(([id,label])=>({id,label,category:'priority',enabled:true}));
export const HARD_FIELDS = [
 {id:'minRamGb',label:'最低内存',options:[[null,'不限'],[16,'至少16GB'],[32,'至少32GB'],[64,'至少64GB']]},
 {id:'minSsdGb',label:'最低SSD容量',options:[[null,'不限'],[512,'至少512GB'],[1024,'至少1TB'],[2048,'至少2TB']]},
 {id:'maxWeightKg',label:'最大重量',options:[[null,'不限'],[1.3,'不超过1.3kg'],[1.5,'不超过1.5kg'],[2,'不超过2kg']]},
 {id:'discreteGpu',label:'独立显卡',options:[[false,'不限'],[true,'必须独显']]},
];
export function defaultRequirements(){return {schemaVersion:2,budget:[5000,12000],os:'不限',scenarios:[],priorities:[],hardConstraints:{minRamGb:null,minSsdGb:null,maxWeightKg:null,discreteGpu:false},unavailableSelections:[]};}
const oldScenarios={'办公学习':'documents','编程开发':'basic-coding','设计创作':'graphics','游戏娱乐':'mainstream-games'};
const oldPriorities={'轻薄便携':'portable','大屏幕':'large-screen','高性价比':'value'};
export function normalizeRequirements(saved){
 const d=defaultRequirements();if(!saved||typeof saved!=='object')return d;
 if(Array.isArray(saved.budget)&&saved.budget.length===2&&saved.budget.every(Number.isFinite)&&saved.budget[0]>=2000&&saved.budget[1]<=30000&&saved.budget[1]-saved.budget[0]>=500)d.budget=[...saved.budget];
 if(['不限','Windows','macOS'].includes(saved.os))d.os=saved.os;
 const select=(values,metadata,legacy)=>[...new Set((Array.isArray(values)?values:[]).map(v=>saved.schemaVersion===2?v:legacy[v]).filter(v=>metadata.some(o=>o.id===v&&o.enabled)))];
 d.scenarios=select(saved.scenarios,SCENARIOS,oldScenarios);d.priorities=select(saved.priorities,PRIORITIES,oldPriorities);
 d.unavailableSelections=((Array.isArray(saved.priorities)&&saved.priorities.some(v=>['长续航','battery'].includes(v)))||(Array.isArray(saved.unavailableSelections)&&saved.unavailableSelections.includes('battery')))?['battery']:[];
 for(const f of HARD_FIELDS)if(f.options.some(([v])=>v===saved.hardConstraints?.[f.id]))d.hardConstraints[f.id]=saved.hardConstraints[f.id];
 return d;
}
export function selectedLabels(requirements){return [...SCENARIOS,...PRIORITIES].filter(o=>requirements.scenarios.includes(o.id)||requirements.priorities.includes(o.id)).map(o=>o.label);}
export function hardRequirementLabels(requirements){return HARD_FIELDS.filter(f=>requirements.hardConstraints[f.id]!==null&&requirements.hardConstraints[f.id]!==false).map(f=>f.label+'：'+f.options.find(([v])=>v===requirements.hardConstraints[f.id])[1]);}
