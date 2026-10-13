import { mountPlayer, type Creative, type Player } from './player';

/*
 * Loader. Finds slots, waits until each is near the viewport, then mounts the player.
 * Slots come from `[data-adslot-src]` at load time or from `window.adslotq.push(el)`.
 */

const NEAR_MARGIN = '300px';
const VIEWABLE_RATIO = 0.5; // IAB video: 50% of pixels...
const VIEWABLE_MS = 2000; //   ...for 2 continuous seconds

interface Slot { el: HTMLElement; player?: Player; ratio: number; timer?: number; viewable?: boolean; seen?: boolean }
const slots = new Map<Element, Slot>();

function beacon(slot: Slot, name: string) {
  slot.el.dispatchEvent(new CustomEvent('adslot:event', { detail: { name }, bubbles: true }));
  const origin = new URL(import.meta.url).origin;
  fetch(`${origin}/beacon?e=${name}&t=${Date.now()}`, { method: 'POST', keepalive: true, mode: 'no-cors' });
}

// One observer for every slot: viewability is just a ratio + a timer per slot.
const viewObserver = new IntersectionObserver(entries => {
  for (const e of entries) {
    const s = slots.get(e.target)!;
    s.ratio = e.isIntersecting ? e.intersectionRatio : 0;
    if (s.ratio > 0 && !s.seen) { s.seen = true; performance.mark('adslot:in-view'); }
    update(s);
  }
}, { threshold: [0, VIEWABLE_RATIO] });

function update(s: Slot) {
  const inView = s.ratio >= VIEWABLE_RATIO && document.visibilityState === 'visible';
  s.player?.setInView(inView);
  if (!inView) { clearTimeout(s.timer); s.timer = undefined; return; }
  if (s.viewable || s.timer) return;
  s.timer = window.setTimeout(() => { s.viewable = true; beacon(s, 'viewable'); }, VIEWABLE_MS);
}
document.addEventListener('visibilitychange', () => slots.forEach(update));

const nearObserver = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    nearObserver.unobserve(e.target);
    load(slots.get(e.target)!);
  }
}, { rootMargin: NEAR_MARGIN });

async function load(s: Slot) {
  performance.mark('adslot:near');
  const src = new URL(s.el.dataset.adslotSrc!, location.href).href;
  const creative: Creative = await (await fetch(src)).json();
  const frame = s.el.querySelector<HTMLElement>('.adslot__frame') ?? s.el;
  s.player = mountPlayer(frame, creative, src, name => beacon(s, name));
  beacon(s, 'impression');
  update(s);
}

function add(el: Element) {
  if (slots.has(el) || !(el instanceof HTMLElement)) return;
  slots.set(el, { el, ratio: 0 });
  nearObserver.observe(el);
  viewObserver.observe(el);
}

declare global { interface Window { adslotq?: Element[] | { push(el: Element): void } } }
const q = window.adslotq;
window.adslotq = { push: add };
if (Array.isArray(q)) q.forEach(add);
document.querySelectorAll('[data-adslot-src]').forEach(add);
