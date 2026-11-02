export default function Choices({ title, options, value, onChange, single = false }) {
 return <fieldset className="choice-section"><legend>{title}<span>{single?'单选':'可多选'}</span></legend>
  <div className={`choices ${single?'single':''}`}>{options.map(raw=>{
   const option=typeof raw==='string'?{id:raw,label:raw,enabled:true}:raw;
   const selected=single?value===option.id:value.includes(option.id);
   return <label key={option.id} className={`choice ${selected?'selected':''} ${option.enabled===false?'disabled':''}`}>
    <input type={single?'radio':'checkbox'} name={title} value={option.id} checked={selected} disabled={option.enabled===false}
     onChange={()=>onChange(single?option.id:selected?value.filter(v=>v!==option.id):[...value,option.id])}/>
    <span className="choice-indicator" aria-hidden="true">{selected&&<span/>}</span>{option.label}
   </label>;
  })}</div></fieldset>;
}
