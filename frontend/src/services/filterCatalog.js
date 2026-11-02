// Pure phase-3A hard filters. Input uses the converter's domain fields;
// Excel official_price is mapped to official_price_cny without subsidy adjustment.
export function filterCatalog(items, { budget, os = '不限', hardConstraints = {} } = {}) {
  if (!Array.isArray(budget) || budget.length !== 2 || !budget.every(Number.isFinite) || budget[0] < 0 || budget[0] > budget[1]) return [];
  if (!['不限', 'Windows', 'macOS'].includes(os)) return [];
  if (!hardConstraints || typeof hardConstraints !== 'object' || Array.isArray(hardConstraints)) return [];
  const {minRamGb = null,minSsdGb = null,maxWeightKg = null,discreteGpu = false} = hardConstraints;
  if (![null,16,32,64].includes(minRamGb)||![null,512,1024,2048].includes(minSsdGb)||![null,1.3,1.5,2].includes(maxWeightKg)||typeof discreteGpu!=='boolean') return [];
  const known = v => typeof v==='number' && Number.isFinite(v) && v>0;
  return items.filter(item => {
    const price = item.official_price_cny;
    return typeof price === 'number' && Number.isFinite(price) && price > 0 &&
      price >= budget[0] && price <= budget[1] && (os === '不限' || item.os === os) &&
      (minRamGb===null || (known(item.ram_gb)&&item.ram_gb>=minRamGb)) &&
      (minSsdGb===null || (known(item.ssd_gb)&&item.ssd_gb>=minSsdGb)) &&
      (maxWeightKg===null || (known(item.weight_kg)&&item.weight_kg<=maxWeightKg)) &&
      (!discreteGpu || item.gpu_type==='独立显卡');
  });
}

export function visibleResults(items, preferences) {
  return filterCatalog(items, preferences).slice(0, 3);
}
