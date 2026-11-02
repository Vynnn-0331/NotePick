import {useEffect,useRef,useState} from 'react';
import {requestHardwareReport} from '../services/hardwareClient';
export default function HardwareAnalysis({requirements,targetProductId}){
 const snapshot=JSON.stringify({requirements,targetProductId}),generation=useRef(0),controller=useRef(null),locked=useRef(false);
 const [report,setReport]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[collapsed,setCollapsed]=useState(false);
 useEffect(()=>{generation.current++;controller.current?.abort();locked.current=false;setReport(null);setLoading(false);setError('');setCollapsed(false);return()=>{generation.current++;controller.current?.abort()};},[snapshot]);
 async function analyze(){if(locked.current)return;locked.current=true;setLoading(true);setError('');const epoch=generation.current,abort=new AbortController();controller.current=abort;try{const result=await requestHardwareReport(targetProductId,requirements,{signal:abort.signal});if(epoch===generation.current){setReport(result);setCollapsed(false)}}catch(e){if(epoch===generation.current&&!abort.signal.aborted)setError(e.message)}finally{if(epoch===generation.current){locked.current=false;setLoading(false)}}}
 return <section className="ai-analysis hardware-analysis" aria-labelledby="hardware-analysis-title">
 <div className="section-heading"><div><h2 id="hardware-analysis-title">硬件深度分析</h2><p className="ai-note">Tavily检索，本地核验与规则分析；不调用大语言模型。</p></div><button className="outline-button" type="button" disabled={loading||!targetProductId} onClick={analyze}>{loading?'检索处理中…':report?'重新分析':'开始硬件深度分析'}</button></div>
 {loading&&<p role="status" className="ai-note">正在检索并核验当前型号的规格。</p>}
 {error&&<p role="alert" className="feature-feedback">{error}{report?' 下方保留上次报告。':''}</p>}
 {report&&!loading&&<button type="button" className="outline-button analysis-toggle" aria-expanded={!collapsed} aria-controls="hardware-report" onClick={()=>setCollapsed(v=>!v)}>{collapsed?'展开分析':'收起分析'}</button>}
 {report&&<div id="hardware-report" className="ai-content" hidden={collapsed}>
 <p className="ai-note">硬件性能报告 · {report.cached?'缓存资料':report.research.status==='offline'?'本地分析':'本轮资料'} · {report.queriedAt?.replace('T',' ').slice(0,19)} UTC</p>
 {report.research.status==='offline'&&!report.research.failures.some(f=>f.code!=='MODEL_UNCONFIRMED')&&<p className="ai-note" role="status">本轮采用本地硬件资料。</p>}
 {report.research.failures.filter(f=>f.code!=='MODEL_UNCONFIRMED').length>0&&<p className="ai-note">{[...new Set(report.research.failures.filter(f=>f.code!=='MODEL_UNCONFIRMED').map(f=>f.message))].slice(0,1).join(' ')}</p>}
 {report.narrative?.compact?<>
 <PerformancePart title="CPU性能" part={report.narrative.compact.cpu}/>
 <PerformancePart title="GPU性能" part={report.narrative.compact.gpu}/>
 <section className="ai-product"><h3>整体性能评价</h3><p>{report.narrative.compact.overall}</p></section>
 </>:<p className="ai-note">请点击重新分析，查看新版简洁报告。</p>}
 <section><h3>资料来源</h3><ul>{[...new Map([...report.sources,...report.localSources].filter(s=>s.url).map(s=>[s.url,s])).values()].filter((s,i,all)=>all.findIndex(t=>t.title?.trim().toLowerCase()===s.title?.trim().toLowerCase())===i).slice(0,4).map(s=><li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></li>)}</ul>{!report.sources.length&&!report.localSources.length&&<p className="ai-note">本次仅使用商品已有配置。</p>}</section>
 </div>}
 </section>;
}
function PerformancePart({title,part}){return <section className="ai-product"><h3>{title}</h3><ul><li className="performance-judgment"><strong>{part.judgment}</strong></li><li>{part.analysis}</li><li>{part.focus}</li></ul></section>}
