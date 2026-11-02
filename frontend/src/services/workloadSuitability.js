// Potential software routes only. Never hardware speed, installed-backend verification, or model-fit certification.
export function computeBackendDirections(product,hardware,knowledge){
 const directions=[];
 const metalFacts=hardware.gpu.facts.filter(f=>f.comparisonGroup?.endsWith('-Metal'));
 if(product.os==='macOS'&&metalFacts.length&&knowledge.sources['policy:mps'])directions.push({
  id:'metal-mps-potential',label:'Metal/MPS潜在后端方向',factIds:metalFacts.map(f=>f.id),
  sourceIds:[...new Set(['policy:mps',...metalFacts.flatMap(f=>f.sourceIds)])],
  basis:'该GPU有Metal API记录且商品OS为macOS；只作为检查MPS设备支持的方向，不把图形成绩解释为AI速度',
  limitations:'macOS版本、PyTorch构建、设备可用性、算子支持及模型占用尚未验证，不能保证MPS可用或运行特定模型'
 });
 // Only previously resolved RTX Laptop identities; unspecified desktop/mobile aliases do not gain this route.
 if(product.os==='Windows'&&hardware.gpu.mobileConfirmed&&/^gpu-rtx/i.test(hardware.gpu.id??'')&&hardware.gpu.facts.length&&knowledge.sources['policy:pytorch'])directions.push({
  id:'cuda-potential',label:'CUDA潜在后端方向',factIds:hardware.gpu.facts.map(f=>f.id),
  sourceIds:[...new Set(['policy:pytorch',...hardware.gpu.facts.flatMap(f=>f.sourceIds)])],
  basis:'已解析的RTX Laptop型号与Windows记录支持考察CUDA路线；不代表驱动、工具链或模型已测试',
  limitations:'CUDA版本、驱动、PyTorch构建、算子和专用显存容量未验证，不能保证运行特定模型'
 });
 return {status:directions.length?'potential_route':'unknown',directions,systemMemoryGb:typeof product.ram_gb==='number'&&product.ram_gb>0?product.ram_gb:null,
  dedicatedVramGb:null,availableUnifiedMemoryGb:null,
  limitations:'主内存不等于专用显存；可供模型使用的显存/统一内存容量未知。没有后端依据不表示不能进行CPU开发或性能较差。'};
}
