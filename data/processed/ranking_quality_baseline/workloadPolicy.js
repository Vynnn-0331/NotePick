// Soft planning references, NOT software certification and NEVER additional hard filters.
// Primary/secondary roles are merged across all selected tasks; there are no twelve additive score sheets.
const rule=(label,ram,ssd,primary,secondary,workload,limits,extra={})=>({label,ram,ssd,primary,secondary,workload,limits,...extra});
export const WORKLOAD_RULES={
 documents:rule('文档办公',16,512,['responsive'],[],'日常学习与办公',['文档软件版本与系统兼容性需核验']),
 'online-study':rule('网课学习',16,512,['responsive'],['portable'],'网页、Office、网课',['摄像头、麦克风、网络与网课平台要求未确认']),
 media:rule('影音娱乐',16,512,['screen'],[],'网页、Office、网课',['缺少编解码、音响、亮度与HDR数据，不按游戏跑分评价影音']),
 'basic-coding':rule('基础编程',16,512,['cpuSingle'],['cpuMulti'],'编程开发',['先核验课程工具链与系统兼容性，CPU跑分不等于代码响应实测']),
 'large-projects':rule('大型项目开发',32,1024,['cpuMulti'],['cpuSingle'],'编程开发',['编译速度取决于项目、工具链、持续功耗与散热，不作时间保证']),
 'local-ai':rule('本地AI开发',32,1024,['memory'],['cpuMulti'],'GPU计算/AI',['显存/统一内存可用量、具体模型和框架后端尚未确认，不能保证运行目标模型','3D图形分数不能代表AI计算能力；CUDA、ROCm或MPS需逐项核验'],{backendCritical:true,capacityRationale:'32GB与1TB为项目规划参考，并非所有AI模型的最低要求'}),
 graphics:rule('平面设计与修图',16,512,['cpuSingle'],['screen'],'平面设计',['数据库没有色域、色准，不保证专业色彩；插件和软件版本需核验'],{capacitySource:'photoshop'}),
 'video-editing':rule('视频剪辑',32,1024,['cpuMulti'],['memory'],'视频剪辑',['未指定素材规格，按较重工作流预留容量；编解码和软件加速未核验，不按3DMark保证导出速度'],{capacitySource:'premiere',capacityRationale:'32GB参考Windows较重/4K工作流；macOS官方建议口径不同，不能视作跨平台最低要求'}),
 'modeling-3d':rule('3D建模与渲染',32,1024,['gpuGraph','cpuMulti'],['gpuProfessional'],'3D建模/渲染',['显存、渲染后端、模型规模未确认；通用3D测试只作图形代理，不代表渲染速度'],{backendCritical:true,heavyGraphics:true}),
 'light-games':rule('轻度网游',16,512,['gpuGraph'],['cpuSingle'],'游戏',['目标游戏、系统兼容及FPS未知；集显仍可作为候选'],{lightGaming:true}),
 'mainstream-games':rule('主流游戏',16,1024,['gpuGraph'],['cpuSingle'],'游戏',['需核验具体游戏、显存、驱动与整机功耗，不保证帧率'],{heavyGraphics:true,gaming:true}),
 'aaa-games':rule('大型3A游戏',32,1024,['gpuGraph'],['cpuSingle'],'大型3D游戏',['32GB仅为较重任务规划参考；显存、具体游戏、功耗和散热未知，不保证最高画质'],{heavyGraphics:true,gaming:true}),
};
export const RANKING_POLICY={
 workflowRisk:{documented:.25,lowSample:.45,discreteUnverified:.45,noGraphics:.65,macGames:.55,possibleBackend:.35,backendDiscrete:.5,backendUnknown:.65},
 scales:{price:10000,weight:1,screen:4,memory:32,storage:1024},
 graphicFocus:{heavy:1.5,light:.35,normal:1},
 studyPortabilityBoost:.4,taskMemoryContribution:.3,memorySmoothnessContribution:.25,
 primaryInfluence:1,secondaryInfluence:.3,responsiveInfluence:.1,
 preferences:{portable:1.8,'cpu-power':1.8,'gpu-power':1.8,memory:1.8,storage:1.8,'large-screen':1.8,value:2},
 fallback:{lightPrice:1.4,heavyPrice:.1,lightWeight:.45,heavyWeight:.05,screen:.3},
 directions:{confirmedMobile:.12,discrete:.08,platform:.12},
 capacityCaps:{memory:64,storage:2048},
 note:'内部排序效用不是跑分。优先软容量缺口与关键用途核验风险，再合并同口径证据投票、偏好与已知价格/重量；未知性能弃权，不赋0/50性能值。',
};
export function resolveNeeds(requirements){
 const ids=[...new Set(requirements.scenarios??[])].sort();
 if(ids.some(id=>!WORKLOAD_RULES[id]))throw new Error('未知用途ID');
 const rules=ids.map(id=>({id,...WORKLOAD_RULES[id]})),channels={};
 for(const r of rules){for(const c of r.primary)channels[c]=Math.max(channels[c]??0,c==='responsive'?RANKING_POLICY.responsiveInfluence:RANKING_POLICY.primaryInfluence);for(const c of r.secondary)channels[c]=Math.max(channels[c]??0,RANKING_POLICY.secondaryInfluence);}
 return {ids,rules,ram:Math.max(0,...rules.map(r=>r.ram)),ssd:Math.max(0,...rules.map(r=>r.ssd)),channels,heavyGraphics:rules.some(r=>r.heavyGraphics),gaming:rules.some(r=>r.gaming),backendCritical:rules.some(r=>r.backendCritical),heavy:rules.some(r=>r.ram>=32||r.heavyGraphics)};
}

// Application influence ceilings, not statistical confidence probabilities or hardware scores.
export const EVIDENCE_POLICY={sampleBands:[[20,.8],[5,.4],[2,.25],[1,.2]],unknownSampleLimit:.25,lowConfidenceLimit:.15,localOrMixedLimit:.15,closeMinimum:.08,uncertainMargin:.35,qualitativeLimit:.12,workflowReliableThreshold:.5};
