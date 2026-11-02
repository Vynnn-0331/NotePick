import knowledge from '../data/hardwareKnowledge.json' with { type: 'json' };

// Preserve every suffix, AI marker, Pro/Max and Apple core count. Never match by numeric order.
export function normalizeHardwareName(raw, kind = 'cpu') {
  let text = String(raw ?? '').normalize('NFKC').toLowerCase()
    .replace(/[®™]/g, '').replace(/酷睿/g, 'core ').replace(/锐龙/g, 'ryzen ')
    .replace(/英特尔锐炫|英特尔 锐炫|锐炫/g, 'arc ').replace(/英特尔/g, 'intel ')
    .replace(/\b(intel|amd|apple|nvidia|geforce)\b/g, ' ').trim();
  if (kind === 'cpu') {
    text = text.replace(/^ultra\s*/, 'core ultra ')
      .replace(/core\s+u([579])(?=[\s-])/g, 'core ultra $1')
      .replace(/ryzen\s*r([579])(?=[\s-])/g, 'ryzen $1')
      .replace(/^r([579])(?=[\s-])/, 'ryzen $1')
      .replace(/(\d+)\s*核/g, '$1cores');
  }
  return text.replace(/(\d+)\s*核/g, '$1cores').replace(/[^a-z0-9]/g, '');
}
const unknown = (raw, reason, extra = {}) => ({ raw: raw ?? null, status: 'unknown', evidence: null, benchmark: null, tier: null, reason, ...extra });

export function matchCPU(raw) {
  const key = normalizeHardwareName(raw);
  if (!key) return unknown(raw, 'CPU型号缺失，未推断性能');
  const evidence = knowledge.cpus.find(x => normalizeHardwareName(x.name) === key);
  if (evidence) return { raw, status: 'benchmark', canonicalName: evidence.name, benchmark: evidence.benchmark, tier: null, evidence, reason: evidence.name.startsWith('Apple ') ? 'Apple完整型号及核数匹配5B移动端多核基准快照；仅估计通用多核需求满足度' : '完整CPU型号与后缀匹配5B移动端多核基准快照；仅估计通用多核需求满足度' };
  const identity = knowledge.cpuIdentityOnly.find(x => normalizeHardwareName(x) === key);
  if (identity) return unknown(raw, '仅基础知识提及型号，没有可比移动端性能数据', { status: 'identity_only', canonicalName: identity });
  if (/^m5(pro|max)?\d+cores$/.test(key)) return unknown(raw, '识别到Apple M5家族，但此核数配置没有对应CPU基准，不能套用另一核数', { status: 'identity_only', canonicalName: raw });
  return unknown(raw, '知识库未覆盖该完整CPU型号，不按型号数字、价格或品牌赋性能分');
}

export function matchGPU(raw, { laptopContext = false } = {}) {
  const key = normalizeHardwareName(raw, 'gpu');
  if (!key) return unknown(raw, '具体GPU型号未记录；显卡类别不等于性能，未从CPU反推GPU');
  const desktop = /desktop|桌面/i.test(raw);
  if (desktop) return unknown(raw, '桌面GPU不套用移动端位置', { status: 'scope_mismatch' });
  const explicit = /laptop|notebook|移动版/i.test(raw);
  const strip = x => x.replace(/laptop|notebook|gpu|移动版/g, '');
  const evidence = knowledge.gpus.find(x => strip(normalizeHardwareName(x.name, 'gpu')) === strip(key));
  if (evidence) {
    const mobileNvidia = evidence.name.startsWith('RTX');
    if (mobileNvidia && !explicit && !laptopContext) return unknown(raw, 'RTX简写缺少Laptop标识，桌面/移动版本不明', { status: 'ambiguous', possibleMatch: evidence.name });
    const contextual = mobileNvidia && !explicit;
    return { raw, canonicalName: evidence.name, status: contextual ? 'contextual_tier' : evidence.benchmark ? 'benchmark' : 'tier',
      benchmark: contextual ? null : evidence.benchmark, tier: evidence.tier, evidence,
      reason: contextual ? '按笔记本目录语境暂作移动版定位，版本和功耗未独立核验；不套用精确跑分' : evidence.limitations,
      ambiguous: contextual, confidence: contextual ? 'conditional' : 'document_snapshot' };
  }
  if (/^m5(pro|max)?\d+cores$/.test(key)) return unknown(raw, 'Apple GPU在知识库中未归入可比移动图形梯队，需同软件工作流测试', { status: 'identity_only', canonicalName: raw });
  return unknown(raw, '无该GPU的可比移动性能依据；未借用桌面榜或显卡类别代替');
}
export function matchHardware(product) {
  return { cpu: matchCPU(product.cpu_model), gpu: matchGPU(product.gpu_model, { laptopContext: true }) };
}
export const knowledgeVersion = { version: knowledge.version, source: knowledge.source, sha256: knowledge.sourceSha256 };
