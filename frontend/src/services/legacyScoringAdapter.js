// TEMPORARY 3B-2 bridge. Remove in 3B-3; it does not understand granular workloads.
import { SCENARIOS, PRIORITIES } from './requirements.js';
import { filterCatalog } from './filterCatalog.js';
import { rankCatalog } from './scoreCatalog.js';
const broad={daily:'办公学习',development:'编程开发',creation:'设计创作',gaming:'游戏娱乐'};
const oldPriority={portable:'轻薄便携','large-screen':'大屏幕',value:'高性价比'};
export function adaptLegacyScoring(requirements){
 const selected=requirements.scenarios.map(id=>SCENARIOS.find(o=>o.id===id));
 if(selected.some(o=>!o)||requirements.priorities.some(id=>!PRIORITIES.some(o=>o.id===id&&o.enabled)))throw new Error('需求含未知或禁用标签，请返回重新选择');
 return {preferences:{budget:requirements.budget,os:requirements.os,scenarios:[...new Set(selected.map(o=>broad[o.category]))],priorities:requirements.priorities.map(id=>oldPriority[id]).filter(Boolean)},
  scenarioMappings:selected.map(o=>({id:o.id,label:o.label,legacyScenario:broad[o.category]})),
  pendingPriorities:requirements.priorities.filter(id=>!oldPriority[id]).map(id=>PRIORITIES.find(o=>o.id===id)),
  notice:'细分用途暂按旧四类映射，尚未实现细分推荐；运行流畅、游戏畅玩、多开流畅、海量存储暂仅保存意向，不代表实际性能保证。'};
}
export function rankForRequirements(items,requirements){
 if(requirements.schemaVersion!==2)return rankCatalog(items,requirements); // Existing programmatic 3B callers remain supported.
 if(!requirements.scenarios.length)return [];
 const {preferences}=adaptLegacyScoring(requirements);
 return rankCatalog(filterCatalog(items,requirements),preferences);
}
