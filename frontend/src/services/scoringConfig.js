// Application matching policies, not measured CPU/GPU scores. All scales are fixed,
// independent of candidate-set min/max. Adjustable without changing evidence facts.
export const SCENARIOS = {
  '办公学习': { weights: { cpu:.12, gpu:0, memory:.25, storage:.10, portability:.18, screen:0, price:.35 }, targets: { cpu:20000, gpu:12000, memory:16, storage:512 } },
  '编程开发': { weights: { cpu:.35, gpu:0, memory:.35, storage:.20, portability:0, screen:0, price:.10 }, targets: { cpu:40000, gpu:14000, memory:32, storage:1024 } },
  '设计创作': { weights: { cpu:.25, gpu:.25, memory:.25, storage:.12, portability:0, screen:.08, price:.05 }, targets: { cpu:45000, gpu:16000, memory:32, storage:1024 } },
  '游戏娱乐': { weights: { cpu:.20, gpu:.50, memory:.20, storage:.05, portability:0, screen:0, price:.05 }, targets: { cpu:30000, gpu:18000, memory:24, storage:1024 } },
};
export const DEFAULT_SCENARIO = { weights: { cpu:.15, gpu:.10, memory:.25, storage:.15, portability:.10, screen:.05, price:.20 }, targets: { cpu:30000, gpu:14000, memory:16, storage:512 } };
export const PREFERENCE_WEIGHTS = { '轻薄便携': { portability:.35 }, '大屏幕': { screen:.35 }, '高性价比': { value:.30 } };
export const POLICY = {
  unknownPrior: { cpu:.50, gpu:.50, memory:.50, storage:.50, portability:.50, screen:.50, price:.50, value:.50 },
  weightKg: { best:1, least:3 }, screenInches: { least:12, best:18 }, priceCny: { best:5000, least:25000 },
  valuePriceInfluence:.35,
  gpuTierFulfillment: { extreme_mobile:1, high_mobile:.95, mainstream_discrete:.70, overlap:.55, mainstream_integrated:.40, entry_integrated:.25 },
};
export function resolveScoringConfig(preferences = {}) {
  const selected = Object.keys(SCENARIOS).filter(x => (preferences.scenarios ?? []).includes(x));
  const sources = selected.length ? selected.map(x => SCENARIOS[x]) : [DEFAULT_SCENARIO];
  const weights = {}, targets = {};
  for (const entry of sources) {
    for (const [key,value] of Object.entries(entry.weights)) weights[key] = (weights[key] ?? 0) + value / sources.length;
    for (const [key,value] of Object.entries(entry.targets)) targets[key] = Math.max(targets[key] ?? 0, value);
  }
  for (const tag of new Set(preferences.priorities ?? [])) {
    for (const [key,value] of Object.entries(PREFERENCE_WEIGHTS[tag] ?? {})) weights[key] = (weights[key] ?? 0) + value;
  }
  const sum = Object.values(weights).reduce((a,b)=>a+b,0);
  for (const key of Object.keys(weights)) weights[key] /= sum;
  return { weights, targets, scenarios:selected, ignoredPreferences:(preferences.priorities ?? []).filter(x=>x==='长续航') };
}
