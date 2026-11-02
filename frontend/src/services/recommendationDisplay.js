// Presentation only. Do not expose match scores, benchmarks or percentages in reasons/tooltips.
export function describeRecommendation(match) {
 if(match.engineVersion==='3B-3')return match.reasons.join('；');
 const p=match.product;
 const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
 const facts=[valid(p.ram_gb)?`${p.ram_gb} GB 内存`:null,valid(p.ssd_gb)?`${p.ssd_gb} GB SSD`:null,valid(p.weight_kg)?`${p.weight_kg} kg`:null].filter(Boolean);
 return `${facts.length?facts.join(' · ')+'。':''}符合已设硬性条件；参考所选用途与已支持偏好排列。${match.dataCoverage<100?'部分性能资料仍需核验。':''}`;
}
