// Display wording only. Relative advantages come exclusively from unchanged 3C judgments.
const value=v=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(v);
const ssd=v=>v>=1024&&v%1024===0?`${v/1024}TB`:`${v}GB`;
const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const has=(req,...ids)=>ids.some(id=>(req.scenarios??[]).includes(id));
export function buildRecommendationCardCopy(comparison,match,requirements={}){
 const description=has(requirements,'modeling-3d')?'3D建模与渲染，侧重图形配置与项目处理能力。':has(requirements,'local-ai')?'本地AI开发，关注框架后端与内存容量。':has(requirements,'mainstream-games','aaa-games','light-games')?'游戏娱乐，关注图形配置与游戏存储空间。':has(requirements,'large-projects','basic-coding')?'编程与项目开发，兼顾多工具使用和工作文件空间。':has(requirements,'video-editing','graphics')?'设计与视频创作，关注项目处理与素材存储。':'文档办公与日常使用，兼顾多程序操作和资料存放。';
 const advantages=comparison.advantages.slice(0,2).map(a=>{
  let title,description;
  switch(a.kind){
   case 'storage':{const files=has(requirements,'video-editing','graphics','modeling-3d')?'创作素材和项目文件':has(requirements,'aaa-games','mainstream-games','light-games')?'游戏与更新文件':has(requirements,'large-projects','basic-coding','local-ai')?'开发项目、本地工具和资料':'课程资料、软件和日常文件';title='更充足的存储空间';description=`${ssd(a.value)} SSD可以容纳更多${files}，适合需要长期保存大量资料的人。`;break;}
   case 'weight':title='更轻便的机身';description=`重量${a.value}kg，${requirements.priorities?.includes('portable')?'适合每天带电脑上课或通勤的人。':'适合经常在不同地点使用电脑的人。'}在这几款中更轻，携带时可以少一份负担。`;break;
   case 'memory':title='更充裕的内存';description=`${a.value}GB内存为同时打开多个程序提供更大的容量余量。${has(requirements,'large-projects','modeling-3d','video-editing','local-ai')?'处理较大项目、切换开发或创作工具时，这份空间更有价值。':'适合经常同时使用浏览器、文档和其他常用软件的人。'}`;break;
   case 'price':title='更低的购机支出';description=`官网参考价${value(a.value)}元，低于另外的推荐项。可以减少购机开销，把预算留给外设或软件。`;break;
   case 'screen':title='更大的观看面积';description=`${a.value}英寸屏幕带来更大的物理观看面积。适合偏爱大屏阅读、查看文档或创作界面的人。`;break;
   case 'cpuMulti':title='同口径多核表现';description='现有同口径测试中，这款CPU的多核结果高于其他推荐项。项目编译、批量处理等偏重多核的工作可以重点比较这一项。';break;
   case 'cpuSingle':title='同口径单核表现';description='现有同口径测试中，这款CPU的单核结果高于其他推荐项。侧重单线程响应的工作可以关注这项差别。';break;
   case 'gpuGraph':title='同口径图形表现';description='现有同口径图形测试中，这款GPU的结果高于其他推荐项。面向图形工作时，可将这项已知差别纳入选择。';break;
   default:return null;
  }
  return {kind:a.kind,title,description,basis:a};
 }).filter(Boolean);
 const p=match?.product??{};
 const features=[valid(p.screen_inches)?`${p.screen_inches}英寸屏幕`:null,valid(p.weight_kg)?`${p.weight_kg}kg机身`:null].filter(Boolean);
 const neutral=features.length?features.join('，')+'，可按观看面积与日常携带方式选择。':valid(p.ram_gb)&&valid(p.ssd_gb)?`${p.ram_gb}GB内存搭配${ssd(p.ssd_gb)} SSD，兼顾常用程序和文件存放。`:'可从处理器、内存与存储组合比较使用取舍。';
 return {id:comparison.id,description,advantages,neutral:advantages.length?null:neutral};
}
