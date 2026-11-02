import { Arrow } from '../components/Icons';

export default function Home() {
  return <section className="home-page">
    <div className="home-title"><span className="eyebrow">A LITTLE CLARITY. A BETTER CHOICE.</span><h1>Choose your laptop</h1></div>
    <a className="start-link" href="#/requirements"><span className="start-arrow"><Arrow direction="up" /></span><span>Start Recommendation</span></a>
  </section>;
}
