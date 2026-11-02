import { useEffect, useRef, useState } from 'react';
import Home from './pages/Home';
import {normalizeRequirements,defaultRequirements} from './services/requirements';
import Requirements from './pages/Requirements';
import Recommendations from './pages/Recommendations';
import ProductDetail from './pages/ProductDetail';
import { products } from './data/products';

function initialPreferences() {
  try { return normalizeRequirements(JSON.parse(sessionStorage.getItem('notepick.preferences.v2') ?? sessionStorage.getItem('notepick.preferences.v1'))); }
  catch { return defaultRequirements(); }
}
const getRoute = () => window.location.hash.slice(1) || '/';

export default function App() {
  const [route, setRoute] = useState(getRoute);
  const [preferenceState, updatePreferences] = useState(initialPreferences);
  // Also normalize an old state retained by Vite Fast Refresh during the schema upgrade.
  const preferences = normalizeRequirements(preferenceState);
  const setPreferences = update => updatePreferences(previous => typeof update === 'function' ? update(normalizeRequirements(previous)) : normalizeRequirements(update));
  const main = useRef(null);
  const firstRender = useRef(true);
  useEffect(() => { const listener = () => setRoute(getRoute()); window.addEventListener('hashchange', listener); return () => window.removeEventListener('hashchange', listener); }, []);
  useEffect(() => { try { sessionStorage.setItem('notepick.preferences.v2', JSON.stringify(preferences)); } catch { /* private browser modes may deny storage */ } }, [preferences]);
  useEffect(() => {
    window.scrollTo(0, 0);
    if (!firstRender.current) main.current?.focus({ preventScroll: true });
    firstRender.current = false;
  }, [route]);
  const product = products.find(p => route === `/products/${p.id}`);
  let page;
  if (route === '/') page = <Home />;
  else if (route === '/requirements') page = <Requirements preferences={preferences} setPreferences={setPreferences} />;
  else if (route === '/recommendations') page = <Recommendations preferences={preferences} />;
  else if (product) page = <ProductDetail key={product.id} product={product} preferences={preferences} />;
  else page = <section className="not-found"><h1>这个页面暂时不在这里。</h1><a className="text-link" href="#/">返回首页 →</a></section>;
  return <><a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); main.current?.focus(); }}>跳到主要内容</a><header className="site-header"><a href="#/" className="wordmark" aria-label="NotePick 首页">NotePick<span className="brand-dot" /></a><span className="header-caption">让选择，清晰一点。</span><span className="phase-label">交互原型 / 01</span></header><main id="main-content" ref={main} tabIndex="-1"><div className="page-enter" key={route}>{page}</div></main><footer className="site-footer"><span>NOTEPICK</span><span>为你的下一台笔记本，留一点思考的空间。</span></footer></>;
}
