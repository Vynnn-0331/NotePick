import {useState} from 'react';
import BudgetSlider from '../components/BudgetSlider';
import Choices from '../components/Choices';
import { Arrow } from '../components/Icons';
import {SCENARIO_GROUPS,PRIORITIES,HARD_FIELDS} from '../services/requirements';
export default function Requirements({ preferences, setPreferences }) {
 const [error,setError]=useState(false);
 const change=key=>value=>setPreferences(p=>({...p,[key]:value}));
 return <section className="requirements-page page-width">
  <div className="page-intro"><div><span className="eyebrow">01 / YOUR NEEDS</span><h1>先从你的需要开始。</h1></div><a className="text-link" href="#/">返回首页 <Arrow direction="left"/></a></div>
  <form className="requirements-panel" onSubmit={e=>{e.preventDefault();if(!preferences.scenarios.length){setError(true);return;}window.location.hash='/recommendations';}}>
   <BudgetSlider value={preferences.budget} onChange={change('budget')}/>
   <section className="choice-section scenario-section" aria-labelledby="scenario-title"><h2 id="scenario-title">使用场景 <span>至少选一项 · 可多选</span></h2>
    <div className="scenario-groups">{SCENARIO_GROUPS.map(g=><div className="scenario-group" key={g.id}><Choices title={g.label} options={g.options} value={preferences.scenarios} onChange={v=>{change('scenarios')(v);setError(false);}}/></div>)}</div>
    {error&&<p className="input-feedback" role="alert">请至少选择一个使用场景，再生成推荐。</p>}
   </section>
   <div className="personal-priorities"><Choices title="偏好标签" options={PRIORITIES} value={preferences.priorities} onChange={change('priorities')}/></div>
   <Choices title="操作系统" options={['不限','Windows','macOS']} value={preferences.os} onChange={change('os')} single/>
   <details className="more-requirements"><summary>更多配置要求 <span>可选 · 仅明确设置后生效</span></summary>
    <div className="hard-requirements">{HARD_FIELDS.map(f=><label key={f.id}>{f.label}<select aria-label={f.label} value={JSON.stringify(preferences.hardConstraints[f.id])} onChange={e=>setPreferences(p=>({...p,hardConstraints:{...p.hardConstraints,[f.id]:JSON.parse(e.target.value)}}))}>{f.options.map(([v,label])=><option key={String(v)} value={JSON.stringify(v)}>{label}</option>)}</select></label>)}</div>
   </details>
   <div className="submit-row"><span>选好了吗？看看有哪些选择。<small>预算、系统与配置要求严格筛选；用途参考不会额外排除商品。</small><small>用途与个人偏好共同参与比较；标签名称不代表实际性能保证。</small></span><button className="submit-arrow" type="submit" aria-label="生成推荐"><Arrow direction="up"/></button></div>
  </form>
 </section>;
}
