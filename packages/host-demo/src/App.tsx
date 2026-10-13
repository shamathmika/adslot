import { useEffect, useRef, useState } from 'react';
import { related, reviews, specs } from './data';

declare global {
  interface Window { ADSLOT_ON: boolean; ADSLOT_ORIGIN: string; adslotq?: Element[] }
}

function AdSlot() {
  const ref = useRef<HTMLDivElement>(null);
  // Command-queue pattern: works whether the ad script loads before or after React mounts.
  useEffect(() => { (window.adslotq ||= []).push(ref.current!); }, []);
  return (
    <aside className="adslot" ref={ref} data-adslot-src={`${window.ADSLOT_ORIGIN}/creative/creative.json`}>
      <div className="adslot__frame" />
    </aside>
  );
}

function Stars({ n }: { n: number }) {
  return <span className="stars" aria-label={`${n} out of 5 stars`}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>;
}

export function App() {
  const [img, setImg] = useState('/img/hero.jpg');
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;

  return (
    <>
      <header className="top">
        <a className="logo" href="#">Stride&amp;Co</a>
        <nav>{['Men', 'Women', 'Kids', 'Trail', 'Sale'].map(x => <a key={x} href="#">{x}</a>)}</nav>
        <input type="search" placeholder="Search shoes" aria-label="Search" />
        <button className="cart">Cart ({added ? qty : 0})</button>
      </header>

      <main className="pdp">
        <section className="gallery">
          <img className="hero" src={img} width={1200} height={900} alt="Trailblaze Runner X, side view" fetchPriority="high" />
          <div className="thumbs">
            {['/img/hero.jpg', 1, 2, 3, 4, 5].map((g, i) => {
              const src = typeof g === 'string' ? g : `/img/gallery${g}.jpg`;
              return (
                <button key={i} onClick={() => setImg(src)} aria-label={`View image ${i + 1}`}>
                  <img src={src} width={120} height={90} alt="" loading="lazy" />
                </button>
              );
            })}
          </div>
        </section>

        <section className="buy">
          <p className="crumbs">Shoes / Running / Road</p>
          <h1>Trailblaze Runner X</h1>
          <p><Stars n={Math.round(avg)} /> {avg.toFixed(1)} · {reviews.length} reviews</p>
          <p className="price"><span className="now">$129.99</span> <s>$159.99</s> <span className="save">Save 19%</span></p>
          <p>A lightweight daily trainer with a supercritical foam midsole and a carbon-rubber outsole for wet-road grip.</p>
          <fieldset className="sizes">
            <legend>Size (US)</legend>
            {[7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12].map(s => (
              <button key={s} aria-pressed={size === String(s)} onClick={() => setSize(String(s))}>{s}</button>
            ))}
          </fieldset>
          <label>Qty <select value={qty} onChange={e => setQty(+e.target.value)}>{[1, 2, 3, 4].map(n => <option key={n}>{n}</option>)}</select></label>
          <button id="add-to-cart" className="primary" disabled={!size} onClick={() => setAdded(true)}>
            {added ? 'Added ✓' : size ? 'Add to cart' : 'Select a size'}
          </button>
          <ul className="perks"><li>Free shipping over $75</li><li>60-day returns</li><li>Pickup today at 3 stores</li></ul>
        </section>

        <section className="specs">
          <h2>Specifications</h2>
          <table><tbody>{specs.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody></table>
        </section>

        {window.ADSLOT_ON && <AdSlot />}

        <section className="reviews">
          <h2>Customer reviews</h2>
          {reviews.map(r => (
            <article key={r.id} className="review">
              <header><Stars n={r.rating} /> <strong>{r.title}</strong></header>
              <p className="meta">{r.author} · {r.date} · Verified purchase</p>
              <p>{r.body}</p>
              <button className="link">Helpful ({r.helpful})</button>
            </article>
          ))}
        </section>

        <section className="related">
          <h2>You may also like</h2>
          <ul>
            {related.map(p => (
              <li key={p.id}>
                <img src={p.img} width={400} height={400} alt="" loading="lazy" />
                <a href="#">{p.name}</a> <span>${p.price}.00</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="foot">© 2026 Stride&amp;Co · Mock retail page for AdSlot benchmarking</footer>
    </>
  );
}
