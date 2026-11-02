import { filterCatalog } from './filterCatalog.js';
import { matchHardware, knowledgeVersion } from './hardwareMatching.js';
import { resolveScoringConfig, POLICY } from './scoringConfig.js';

const clamp = value => Math.max(0,Math.min(1,value));
const valid = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const round = value => Math.round(value * 100) / 100;
const LABELS = { cpu:'CPU多核需求', gpu:'通用3D图形需求', memory:'内存', storage:'SSD', portability:'重量', screen:'屏幕尺寸', price:'价格', value:'配置与价格适配' };

export function scoreCandidate(product, preferences = {}) {
  const config = resolveScoringConfig(preferences), hardware = matchHardware(product);
  const dimensions = {}, warnings = [];
  function add(key, value, basis, evidence = null, estimated = false) {
    dimensions[key] = { score:value == null ? null : round(clamp(value)*100), weight:config.weights[key] ?? 0,
      basis, evidence, estimated:estimated || value == null };
  }
  add('cpu', hardware.cpu.benchmark == null ? null : hardware.cpu.benchmark / config.targets.cpu,
    hardware.cpu.benchmark == null ? hardware.cpu.reason : `5B多核基准快照${hardware.cpu.benchmark} / 应用需求阈值${config.targets.cpu}，封顶；非单核响应或编译实测`,hardware.cpu.evidence);
  const gpuValue = hardware.gpu.benchmark != null ? hardware.gpu.benchmark / config.targets.gpu : hardware.gpu.tier ? POLICY.gpuTierFulfillment[hardware.gpu.tier] : null;
  add('gpu',gpuValue,hardware.gpu.benchmark != null ? `5C Time Spy快照${hardware.gpu.benchmark} / 需求阈值${config.targets.gpu}；非帧率预测` : hardware.gpu.tier ? `5C${hardware.gpu.evidence.tierLabel}；采用应用层保守满足度，不是硬件跑分。${hardware.gpu.reason}` : hardware.gpu.reason,hardware.gpu.evidence,Boolean(hardware.gpu.ambiguous));
  add('memory',valid(product.ram_gb) ? product.ram_gb / config.targets.memory : null,`${product.ram_gb ?? '未知'} GB / ${config.targets.memory} GB需求，达到后封顶`);
  add('storage',valid(product.ssd_gb) ? product.ssd_gb / config.targets.storage : null,`${product.ssd_gb ?? '未知'} GB / ${config.targets.storage} GB需求，达到后封顶`);
  add('portability',valid(product.weight_kg) ? (POLICY.weightKg.least-product.weight_kg)/(POLICY.weightKg.least-POLICY.weightKg.best) : null,`实际重量${product.weight_kg ?? '未知'} kg；固定1—3kg线性便携满足度`);
  add('screen',valid(product.screen_inches) ? (product.screen_inches-POLICY.screenInches.least)/(POLICY.screenInches.best-POLICY.screenInches.least) : null,`实际尺寸${product.screen_inches ?? '未知'}英寸；固定12—18英寸；未评价色域或色准`);
  add('price',valid(product.official_price_cny) ? (POLICY.priceCny.least-product.official_price_cny)/(POLICY.priceCny.least-POLICY.priceCny.best) : null,`官网参考价${product.official_price_cny ?? '未知'}元；固定5000—25000元锚点，仅作价格负担度`);
  const effective = key => dimensions[key].score == null ? POLICY.unknownPrior[key] : dimensions[key].score/100;
  const fitKeys = ['cpu','gpu','memory','storage','screen'];
  const fitWeight = fitKeys.reduce((sum,k)=>sum+(config.weights[k]??0),0);
  const fit = fitKeys.reduce((sum,k)=>sum+effective(k)*(config.weights[k]??0),0)/fitWeight;
  const hasUnknownFit = fitKeys.some(k=>(config.weights[k]??0)>0 && dimensions[k].score == null);
  const value = fit * ((1-POLICY.valuePriceInfluence)+POLICY.valuePriceInfluence*effective('price'));
  add('value',value,'用途配置满足度 × (0.65 + 0.35 × 价格负担度)，不是单纯最低价或市场性价比实测',null,hasUnknownFit || dimensions.price.score == null);
  let sum=0, known=0, lower=0, upper=0;
  for (const [key, dimension] of Object.entries(dimensions)) {
    const used=dimension.score == null ? POLICY.unknownPrior[key] : dimension.score/100;
    dimension.usedForAggregation=round(used*100);
    dimension.contribution=round(used*dimension.weight*100);
    sum+=used*dimension.weight;
    if (dimension.estimated) { upper+=dimension.weight; }
    else { known+=dimension.weight; lower+=used*dimension.weight; upper+=used*dimension.weight; }
    if (dimension.weight>0 && dimension.score == null) warnings.push(`${LABELS[key]}数据不足，维度分数为空；汇总使用公开中性占位，不代表性能高低`);
  }
  if (hardware.gpu.ambiguous) warnings.push(hardware.gpu.reason);
  if (dimensions.gpu.score == null && !dimensions.gpu.weight) warnings.push('GPU性能依据不足；当前用途GPU权重为0，未参与性能判断');
  if (config.scenarios.includes('设计创作')) warnings.push('无色域/色准与目标创作软件资料，不保证专业色彩或渲染兼容性');
  if (config.scenarios.includes('游戏娱乐')) warnings.push('GPU功耗、散热、显存及目标游戏资料不足，不保证FPS；macOS需另核验游戏兼容性');
  if (config.ignoredPreferences.length) warnings.push('长续航：数据不足，暂未评估（权重0）');
  if (product.os === 'macOS' && config.scenarios.some(x=>['设计创作','编程开发'].includes(x))) warnings.push('跨平台软件和工具链兼容性需核验，未由芯片或总分保证');
  const explanations=Object.entries(dimensions).filter(([,d])=>d.weight>0 && d.score!=null)
    .sort((a,b)=>b[1].weight-a[1].weight).slice(0,3).map(([k,d])=>k==='gpu' && hardware.gpu.tier ? `图形用途定位：${hardware.gpu.evidence.tierLabel}${hardware.gpu.ambiguous ? '（移动版待核验）' : ''}` : `${LABELS[k]}满足度${Math.round(d.score)}%`);
  return { product, totalScore:round(sum*100), scoreKind:'用途与偏好匹配度，非CPU/GPU实测跑分',
    dimensions, weights:config.weights, targets:config.targets, hardware, warnings,
    dataCoverage:round(known*100), totalIsEstimated:known < 1-1e-12, uncertaintyInterval:[round(lower*100),round(upper*100)],
    explanation:explanations.join('；'), knowledgeVersion, ignoredPreferences:config.ignoredPreferences };
}

// Hard conditions always run first. Ties preserve original database order, no role assignment.
export function rankCatalog(items, preferences) {
  return filterCatalog(items,preferences).map((product,index)=>({ ...scoreCandidate(product,preferences), sourceOrder:index }))
    .sort((a,b)=>b.totalScore-a.totalScore || a.sourceOrder-b.sourceOrder);
}
