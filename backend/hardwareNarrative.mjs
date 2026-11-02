// Presentation only: consume accepted facts/benchmarks; never search, extract, score or rank.
const supported=(chip,field)=>chip.fields.find(f=>f.field===field&&f.status==='supported')??null;
const value=(chip,field)=>supported(chip,field)?.value??null;
const unique=items=>[...new Set(items)];
const specRefs=(chip,fields)=>unique(chip.fields.filter(f=>fields.includes(f.field)&&f.status==='supported').flatMap(f=>f.evidence.map(e=>e.url)));

// Separate the existing evidence/judgment from Chinese wording so both can be tested independently.
export function narrativeEvidence(report,{benchmarks=[],sources={},gpuType,ramGb,cpuAmbiguous=false,gpuAmbiguous=false}={}){
 const tests=benchmarks.filter(f=>f.level==='comparable'&&Number.isFinite(f.value)&&f.value>0&&(f.sourceIds??[]).some(id=>sources[id]?.url));
 return {
  cpu:{name:report.cpu.model,ambiguous:cpuAmbiguous,architecture:value(report.cpu,'architecture'),cores:value(report.cpu,'cores'),threads:value(report.cpu,'threads'),base:value(report.cpu,'basePower'),turbo:value(report.cpu,'maxTurboPower'),single:tests.filter(f=>f.kind==='cpu'&&f.channel==='cpuSingle'),multi:tests.filter(f=>f.kind==='cpu'&&f.channel==='cpuMulti'),conflicts:report.cpu.fields.filter(f=>f.status==='conflict').map(f=>f.label)},
  gpu:{name:report.gpu.model,ambiguous:gpuAmbiguous,type:gpuType,ram:ramGb,integrated:value(report.gpu,'integratedGpu'),integratedCores:value(report.gpu,'integratedGpuCores'),integratedCoreUnit:supported(report.gpu,'integratedGpuCores')?.unit,architecture:value(report.gpu,'architecture'),vram:value(report.gpu,'vram'),power:value(report.gpu,'tgp'),graphics:tests.filter(f=>f.kind==='gpu'&&f.channel==='gpuGraph'),professional:tests.filter(f=>f.kind==='gpu'&&f.channel==='gpuProfessional'),conflicts:report.gpu.fields.filter(f=>f.status==='conflict').map(f=>f.label)},
  sources
 };
}
function benchmarkText(tests,sources){
 const groups=new Set(),selected=[];
 for(const fact of tests){const group=fact.metric+'|'+(fact.comparisonGroup??'');if(groups.has(group))continue;groups.add(group);selected.push(fact);if(selected.length===2)break;}
 return {text:selected.map(f=>f.metric+'为'+f.value.toLocaleString('zh-CN')+(f.unit==='points'?'分':f.unit??'')+(Number.isInteger(f.samples)&&f.samples>0?'（'+f.samples+'份提交记录）':'')).join('；'),conditions:unique(selected.map(f=>f.context).filter(Boolean)),refs:unique(selected.flatMap(f=>f.sourceIds.map(id=>sources[id]?.url).filter(Boolean))),records:selected.map(f=>({metric:f.metric,value:f.value,unit:f.unit,comparisonGroup:f.comparisonGroup,samples:f.samples,sourceIds:f.sourceIds,context:f.context}))};
}
export function buildHardwareNarrative(report,context={}){
 const data=narrativeEvidence(report,context),cpu=data.cpu,gpu=data.gpu;
 const cpuSections=[],gpuSections=[];
 const add=(sections,title,text,refs=[])=>{if(text)sections.push({title,text,sourceUrls:unique(refs)})};
 const structure=[];
 if(cpu.cores){structure.push('这颗处理器有'+cpu.cores+'个核心，可以把能够拆分的计算交给多个核心同时处理。');if(cpu.threads){structure.push('它提供'+cpu.threads+'个线程，也就是操作系统可以安排计算的执行通道。'+(cpu.threads>cpu.cores?'线程数高于核心数，表示部分或全部核心支持同时安排多个线程，但不等于有'+cpu.threads+'个物理核心，也不会按线程数成倍提速。':'核心和线程数量相同，但这不足以判断它比支持更多线程的处理器更快或更慢。'));}}
 else if(cpu.threads)structure.push('已确认可安排'+cpu.threads+'个执行线程；物理核心数量还没有确认，不能把线程数直接当成核心数。');
 if(cpu.architecture)structure.push(cpu.architecture+'是其架构或设计代号，描述芯片内部采用的设计；它本身不是性能分数，需要结合单核、多核测试理解实际能力。');
 if(!structure.length)structure.push(cpu.ambiguous?'现有记录还没有明确到完整处理器型号，因此这里不套用同系列其他芯片的核心参数。':'现有结构参数尚不完整，下面优先依据这颗处理器已经记录的测试资料解释性能。');
 add(cpuSections,'结构与架构',structure.join(''),specRefs(report.cpu,['cores','threads','architecture']));
 const single=benchmarkText(cpu.single,data.sources),multi=benchmarkText(cpu.multi,data.sources);
 add(cpuSections,'单核与多核性能',
  (single.text?'单核能力主要影响需要依次执行的计算，以及部分程序的响应。现有资料中，'+single.text+'。':'单核能力关系到单条计算任务和部分程序响应，不能仅用核心数量判断。')+
  (multi.text?'多核资料更适合观察并行计算的能力。'+multi.text+'；它能帮助理解多线程计算的表现，但不是当前电脑的编译或视频导出计时。':'多核能力要看软件能否把计算分给多个核心；其具体多核定位需补充同型号测试。')+
  (single.text||multi.text?'这些是同型号处理器已记录的测试结果；不同测试的分数不能互比，也不等于这台笔记本的实测成绩。':''),[...single.refs,...multi.refs]);
 let cpuPower;
 if(cpu.base!==null){cpuPower='规格中的基础功耗/TDP为'+cpu.base+'W，可理解为处理器供电和散热设计的参考，而不是整台电脑的耗电量。';if(cpu.turbo!==null)cpuPower+='最大Turbo功耗为'+cpu.turbo+'W，表示加速时允许的功耗上限，不代表一定达到或能长期维持。';cpuPower+='长时间运算能维持多少速度，还要看笔记本的功耗设置、散热和温度。';}
 else if(cpu.turbo!==null)cpuPower='资料标注最大Turbo功耗'+cpu.turbo+'W，这是处理器加速时的上限，不是持续功耗或整机耗电。持续性能仍取决于供电与散热设置。';
 else cpuPower='处理器长时间运算时，散热和功耗设置会影响能够维持的频率。当前没有确认这台电脑的持续功耗设置，因此不从短时成绩推断长时间运行速度。';
 add(cpuSections,'功耗与持续性能',cpuPower,specRefs(report.cpu,['basePower','maxTurboPower']));
 const cpuSummary=(cpu.cores?'可确认的结构特点是'+cpu.cores+'核'+(cpu.threads?cpu.threads+'线程':'')+'；':'')+(single.text&&multi.text?'单核与多核均有对应测试，可以分别观察单任务和并行计算能力。':single.text?'已有单核参考，多核定位仍需补充对应测试。':multi.text?'已有多核参考，但不能据此代替单核性能判断。':'目前只能解释已知结构，不能确定具体性能档次。')+(cpu.conflicts.length?'其中'+cpu.conflicts.join('、')+'的资料有冲突，未用于确定结论。':'');
 add(cpuSections,'CPU综合评价',cpuSummary);
 let gpuIdentity=gpu.type==='独立显卡'?'商品记录使用独立显卡：'+gpu.name+'。独立显卡是与CPU分开的图形处理芯片，图形计算资源不等同于CPU核心。':'商品记录使用集成显卡，图形处理单元集成在处理器中。';
 if(gpu.integrated)gpuIdentity+=(gpu.type==='独立显卡'?'CPU资料还标注了'+gpu.integrated+'，这是处理器另有的集成图形单元，不能用它代表上面的独显。':'准确CPU资料将集成图形单元标为'+gpu.integrated+'。');
 else if(gpu.type!=='独立显卡'&&!gpu.ambiguous)gpuIdentity+='已记录型号为'+gpu.name+'。';
 if(/\b\d+\s*EUs?\b/.test(gpu.integrated??''))gpuIdentity+='名称中的EU是执行单元，指GPU内部执行图形运算的组件；它的数量不能直接等同于CPU核心数。';
 if(gpu.integratedCores!==null)gpuIdentity+='其中'+gpu.integratedCores+'个'+(gpu.integratedCoreUnit??'').replace(/核心/g,'')+'图形核心'+'描述该集成单元的图形计算资源；不能把这个数量与其他架构显卡的核心数直接比快慢。';
 if(gpu.ambiguous&&gpu.type==='独立显卡')gpuIdentity+='当前记录未明确桌面版或笔记本版，不借用同名桌面显卡的参数。';
 if(gpu.architecture)gpuIdentity+='其架构标注为'+gpu.architecture+'，架构名称与核心数量需要结合相应图形测试理解。';
 add(gpuSections,'型号与图形结构',gpuIdentity,specRefs(report.gpu,['integratedGpu','integratedGpuCores','architecture']));
 const graph=benchmarkText(gpu.graphics,data.sources),professional=benchmarkText(gpu.professional,data.sources);
 const gpuBench=(graph.text?'已记录的图形测试中，'+graph.text+'。这类测试主要观察绘制和图形计算的表现，不等于具体游戏帧率。'+(graph.conditions.length?'资料中的测试设备或条件是：'+graph.conditions[0]+' 这是原测试条件，不能直接当成当前商品的实测成绩。':'这些是已记录的同型号GPU测试，不是当前商品的实测成绩。'):'当前没有与已确认GPU身份对应的图形基准测试，因此只能解释规格特点，不能判断具体图形性能处于什么水平。')+(professional.text?'另有'+professional.text+'；它只说明该测试中的表现，不直接代表所有三维软件或渲染器的速度。':'');
 add(gpuSections,'图形性能与测试',gpuBench,[...graph.refs,...professional.refs]);
 const memory=gpu.type==='集成显卡'?'集成显卡通常与CPU共享系统内存，图形处理也会受到内存带宽（单位时间能传输的数据量）和配置方式影响。'+(Number.isFinite(gpu.ram)?'这台电脑的'+gpu.ram+'GB是系统内存容量，不等于显卡拥有同等容量的专用显存。':'系统内存容量不能直接当作专用显存容量。')+'这里没有据此推断内存通道数或带宽。':gpu.vram!==null?'芯片资料标注显存'+gpu.vram+'GB。显存用于保存图形和计算数据，容量影响可同时容纳的数据量，但还要结合数据传输带宽与GPU计算能力看表现；这条芯片资料也不能替代当前商品版本的配置确认。':'独立显卡通常有自己的显存，用来存放图形和计算数据。当前记录没有确认本机的显存容量或带宽，这里不把整机内存当成显存，也不据此断言存在显存瓶颈。';
 const gpuPower=gpu.power!==null?'相关芯片资料标注图形功耗'+gpu.power+'W，这不是已经确认的本机设置。':'当前没有确认本机GPU的功耗设置。';
 add(gpuSections,'内存与持续性能',memory+gpuPower+'同一GPU在不同供电与散热条件下，能够维持的频率和持续性能也可能不同。',specRefs(report.gpu,['vram','tgp']));
 add(gpuSections,'GPU综合评价',gpu.type==='独立显卡'?(graph.text?'有独立图形资源和对应测试参考，具体表现仍要结合本机的显存、功耗与散热条件。':'独显与CPU集成图形是不同的计算资源，不能用CPU或集成单元的成绩代替本机独显的表现。'):(graph.text?'这颗集成GPU已有图形测试记录可作参考；评价它时，应结合图形计算资源、内存配置和持续频率，而不是只看“集成显卡”这个类别。':gpu.integrated?'它的图形资源集成在处理器中，评价时应把图形测试、内存配置和散热条件放在一起看，不能只按“集成显卡”这个类别下结论。':'集成图形依靠自身的计算单元和共享内存协同工作，具体定位需要对应型号的图形测试。')+(gpu.conflicts.length?' '+gpu.conflicts.join('、')+'存在冲突，未采用单一数值作结论。':''));
 const cpuJudgment=cpu.cores>=12&&multi.text?'这颗CPU具备较多并行计算资源，多任务、代码编译和可并行的内容处理是值得关注的方向。':cpu.cores>=8?'这颗CPU能够将多项计算分配给多个核心，适合日常程序处理与多任务协作。':single.text||multi.text?'这颗CPU已有对应性能测试，可分别观察日常程序响应与并行计算能力。':'可以先依据商品记录评估日常计算需求，处理器的具体性能档次仍需对应测试支持。';
 const gpuJudgment=gpu.type==='独立显卡'?'这台电脑配有独立图形处理资源，可分担三维绘制等图形计算；能承担多大规模的任务，还取决于具体版本和显存。':graph.text?'这颗集成显卡已有实际图形测试参考，能够独立评估图形计算能力，而不只是按“集显”分类判断。':gpu.integrated?'这台电脑的图形处理由处理器内置单元承担，优先关注桌面显示与日常图形任务；重型三维和高画质游戏需要对应测试再评估。':'商品记录为集成显卡，先按日常显示需求理解；具体图形性能需要明确型号及测试。';
 const overall=cpuJudgment+(Number.isFinite(gpu.ram)?'整机配有'+gpu.ram+'GB系统内存，内存容量决定同时容纳程序与数据的空间，并不直接代表运算速度。':'')+(gpu.type==='独立显卡'?'CPU与独显分别承担通用计算和图形计算。涉及大型三维项目或本地模型时，需要进一步确认显存及软件兼容要求。':'CPU计算与集成图形共同使用整机资源。办公、编程及日常内容处理可优先看CPU与内存；复杂三维、重型图形计算应另核对GPU测试和内存需求。');
 return {version:'plain-performance-v2',cpu:{judgment:cpuJudgment,sections:cpuSections},gpu:{judgment:gpuJudgment,sections:gpuSections},overall,benchmarks:[...single.records,...multi.records,...graph.records,...professional.records]};
}


// Short public report. Detailed records above remain available for provenance/tests, not rendered.
export function buildCompactReport(report,{gpuType,ramGb}={}){
 const get=(chip,field)=>chip?.fields?.find(f=>f.field===field&&f.status==='supported')?.value??null;
 const cores=get(report.cpu,'cores'),threads=get(report.cpu,'threads'),base=get(report.cpu,'basePower');
 const benchmarks=report.narrative?.benchmarks??[],single=benchmarks.find(b=>/Single Thread|single-core/i.test(b.metric)),multi=benchmarks.find(b=>/CPU Mark|multi-core/i.test(b.metric)),graph=benchmarks.find(b=>/3DMark|G3D|graphics/i.test(b.metric));
 const score=b=>b.metric+' '+b.value.toLocaleString('zh-CN')+'分';
 const cpuJudgment=cores>=12?'这颗CPU的多核心配置侧重多任务与并行计算，编程和内容处理是值得关注的方向。':cores>=8?'这颗CPU能兼顾日常程序和多任务，支持将较复杂的计算分给多个核心处理。':multi?'这颗CPU已有多核测试依据，可以重点评估多任务与能够并行的计算。':single?'这颗CPU已有单核测试依据，主要用于观察程序响应与单项计算能力。':'先按已确认配置评估日常计算，具体性能档次还缺少对应测试。';
 const cpuAnalysis=report.cpu.model+'。'+(cores?'已核验'+cores+'核'+(threads?threads+'线程':'')+'，可同时分担不同计算。':'')+(single?score(single)+'，反映单项计算能力。':'')+(multi?score(multi)+'，反映并行计算能力。':'')+(!cores&&!single&&!multi?'当前没有可准确对应的核心规格或性能测试，不套用相似型号成绩。':'');
 const cpuLimit=(base?'基础功耗为'+base+'W；':'')+'长时间编译或导出时，散热和功耗设置会影响持续速度。';
 const reference=report.gpu.reference,knownVram=get(report.gpu,'vram')??get(reference,'vram'),discrete=gpuType==='独立显卡';
 const gpuJudgment=discrete?'独立显卡提供单独的图形计算资源，可重点关注游戏画面、剪辑加速和三维绘制。':graph?'这颗集成显卡已有图形测试依据，可以结合测试与内存配置评估图形计算能力。':'图形任务由处理器内置显卡承担，日常显示与轻量图形处理是优先评估的方向。';
 const gpuAnalysis=(reference?'':report.gpu.model+'。')+(discrete?(reference?'已取得'+reference.model+'资料。'+(knownVram?'该芯片版本标注'+knownVram+'GB显存，用于容纳纹理、场景和图形数据。':''):'商品记录了独显型号，但本轮尚未取得可核验的对应规格。'):(get(report.gpu,'integratedGpu')?'处理器资料标注'+get(report.gpu,'integratedGpu')+'。':'')+(get(report.gpu,'integratedGpuCores')?'已核验'+get(report.gpu,'integratedGpuCores')+'个图形核心。':'')+'集显通常共享系统内存，其表现也受内存带宽影响。');
 const gpuTest=graph?score(graph)+'；'+(graph.samples?'样本'+graph.samples+'份。':'')+(graph.context?'原测试条件：'+graph.context.slice(0,100)+'。':'')+'这不是当前整机实测。':'';
 const gpuLimit=discrete?(reference?.fields?.length?'以上是笔记本版芯片资料，不代表本机版本、显存和功耗已核实。':'桌面/移动版本及功耗尚未完整核验，不混用桌面版测试。')+'大场景、重型渲染及本地模型还需核对显存需求。':'复杂三维和高画质游戏需要对应测试；不能把系统内存当成专用显存。';
 const overall=(cores||multi?'可优先用于多任务、编程和可并行的内容处理。':'日常使用先以已确认的CPU及内存配置为依据。')+(Number.isFinite(ramGb)?ramGb+'GB内存影响同时容纳程序和项目的空间。':'')+(discrete?'独显可承担图形计算；大型三维、重型游戏和本地AI还需要更强的图形能力或足够显存，不能仅凭型号保证表现。':'复杂三维、重型游戏或GPU计算应另核对显卡测试，必要时选择图形资源更充足的配置。');
 return {cpu:{judgment:cpuJudgment,analysis:cpuAnalysis,focus:cpuLimit},gpu:{judgment:gpuJudgment,analysis:gpuAnalysis+gpuTest,focus:gpuLimit},overall};
}
