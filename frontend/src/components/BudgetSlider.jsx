import { useRef } from 'react';
import { money } from '../data/products';

const MIN = 2000, MAX = 30000, STEP = 500;

export default function BudgetSlider({ value, onChange }) {
  const dragging = useRef(null);
  const track = useRef(null);
  const percent = (v) => (v - MIN) / (MAX - MIN) * 100;
  function update(index, amount) {
    const next = [...value];
    next[index] = index === 0 ? Math.max(MIN, Math.min(amount, value[1] - STEP)) : Math.min(MAX, Math.max(amount, value[0] + STEP));
    onChange(next);
  }
  function amountAt(event) {
    const box = track.current.getBoundingClientRect();
    return Math.max(MIN, Math.min(MAX, Math.round((MIN + (event.clientX - box.left) / box.width * (MAX - MIN)) / STEP) * STEP));
  }
  return <div>
    <div className="budget-heading"><h2>价格预算</h2><output aria-live="polite">{money(value[0])}<span>—</span>{money(value[1])}</output></div>
    <div className="budget-slider" ref={track} style={{ '--low': `${percent(value[0])}%`, '--high': `${percent(value[1])}%` }}
      onPointerDown={e => {
        if (e.target.tagName === 'INPUT') return;
        const amount = amountAt(e);
        dragging.current = Math.abs(amount - value[0]) <= Math.abs(amount - value[1]) ? 0 : 1;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(dragging.current, amount);
      }}
      onPointerMove={e => { if (dragging.current !== null) update(dragging.current, amountAt(e)); }}
      onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}>
      <div className="range-track" /><div className="range-fill" />
      <input aria-label="最低预算" type="range" min={MIN} max={MAX} step={STEP} value={value[0]} aria-valuetext={money(value[0])} onChange={e => update(0, Number(e.target.value))} />
      <input aria-label="最高预算" type="range" min={MIN} max={MAX} step={STEP} value={value[1]} aria-valuetext={money(value[1])} onChange={e => update(1, Number(e.target.value))} />
    </div>
    <div className="range-endpoints"><span>{money(MIN)}</span><span>{money(MAX)}</span></div>
  </div>;
}
