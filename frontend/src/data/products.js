import { describeRecommendation } from '../services/recommendationDisplay';
import { recommendCatalog } from '../services/recommendationEngine';
import { filterCatalog } from '../services/filterCatalog';
import { getCatalog } from '../services/catalog';

export const money = (value) => value == null ? '暂无价格' : new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
const unit = (value, suffix) => value == null ? '未提供' : `${value} ${suffix}`;
function toViewModel(row) {
  return {
    id: row.id, name: row.model, brand: row.brand, series: row.series,
    category: row.series ?? '系列未提供', price: row.official_price_cny, image: row.image,
    sourceUrl: row.source_url, raw: row,
    reason: `${unit(row.ram_gb, 'GB 内存')} · ${unit(row.ssd_gb, 'GB SSD')}`,
    description: `${row.brand ?? '品牌未提供'} · ${row.series ?? '系列未提供'}。配置信息来自导入资料；性能判断受知识库覆盖、功耗和软件条件限制。`,
    specs: { cpu: row.cpu_model ?? '未提供', gpu: row.gpu_model ?? '未提供', gpuType: row.gpu_type ?? '未提供',
      ram: unit(row.ram_gb, 'GB'), ssd: unit(row.ssd_gb, 'GB'), screen: unit(row.screen_inches, '英寸'),
      weight: unit(row.weight_kg, 'kg'), os: row.os ?? '未提供' },
  };
}
export const products = getCatalog().map(toViewModel);
export function getFilteredProducts(preferences) { return filterCatalog(getCatalog(), preferences).map(toViewModel); }
export function getRankedProducts(preferences) {
  return recommendCatalog(getCatalog(), preferences).map(match => ({
    ...toViewModel(match.product), match,
    reason: describeRecommendation(match),
  }));
}
// Fixed examples, one complete record per brand in source order. No user preferences or scoring.
const valid = products.filter(p => p.raw.model && p.raw.cpu_model && (p.raw.gpu_model || p.raw.gpu_type === '集成显卡') && p.raw.ram_gb && p.raw.ssd_gb && p.raw.screen_inches && p.price && p.sourceUrl && !p.raw.quality_issues.some(i => ['invalid_number', 'duplicate_conflict', 'homepage_not_configuration', 'corrected_classification'].includes(i.kind)));
const firstByBrand = [...new Map(valid.map(p => [p.brand, valid.find(v => v.brand === p.brand)])).values()];
export const recommendations = [...firstByBrand, ...valid.filter(p => !firstByBrand.includes(p))].slice(0, 3);
export const specLabels = { cpu: 'CPU（原始名称）', gpu: 'GPU（原始名称）', gpuType: 'GPU 类型', ram: '内存', ssd: 'SSD', screen: '屏幕尺寸', weight: '重量', os: '操作系统' };
