// Loads the host page with and without the ad unit, N runs each, throttled, and writes
// median/p95 per metric to bench/results/<label>.json.
//   node bench/run.js [label]     RUNS=10 by default
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { start } from './serve.js';

const RUNS = +(process.env.RUNS ?? 10);
const label = process.argv[2] ?? 'latest';
// Lighthouse's mobile profile: 4x CPU slowdown, 150ms RTT, 1.6 Mbps down.
const THROTTLE = { cpu: 4, latency: 150, down: 1.6e6 / 8, up: 750e3 / 8 };
const HOST = 'http://localhost:4173/';
const AD_ORIGIN = 'http://localhost:4174';
const here = import.meta.dirname;
const vitalsLib = fs.readFileSync(path.join(here, '../node_modules/web-vitals/dist/web-vitals.iife.js'), 'utf8');

// Runs in the page before any host script.
const probe = `
  window.__m = { lcp: 0, cls: 0, inp: 0, longtasks: [], loaf: [] };
  webVitals.onLCP(m => __m.lcp = m.value, { reportAllChanges: true });
  webVitals.onCLS(m => __m.cls = m.value, { reportAllChanges: true });
  webVitals.onINP(m => __m.inp = m.value, { reportAllChanges: true, durationThreshold: 0 });
  new PerformanceObserver(l => l.getEntries().forEach(e => __m.longtasks.push([e.startTime, e.duration])))
    .observe({ type: 'longtask', buffered: true });
  new PerformanceObserver(l => l.getEntries().forEach(e => __m.loaf.push({
    start: e.startTime, blocking: e.blockingDuration,
    scripts: e.scripts.map(s => [s.sourceURL, s.duration]),
  }))).observe({ type: 'long-animation-frame', buffered: true });
`;

async function run(browser, withAd) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: THROTTLE.latency, downloadThroughput: THROTTLE.down, uploadThroughput: THROTTLE.up,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE.cpu });
  const urls = new Map();
  const bytes = { total: 0, adCode: 0, adMedia: 0 };
  cdp.on('Network.requestWillBeSent', e => urls.set(e.requestId, e.request.url));
  cdp.on('Network.loadingFinished', e => {
    const u = urls.get(e.requestId) ?? '';
    bytes.total += e.encodedDataLength;
    if (!u.startsWith(AD_ORIGIN)) return;
    if (/\.js(\?|$)/.test(u) || /creative\.json/.test(u)) bytes.adCode += e.encodedDataLength;
    else bytes.adMedia += e.encodedDataLength;
  });
  await page.addInitScript(vitalsLib + probe);

  await page.goto(HOST + (withAd ? '' : '?ad=0'), { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  // Interaction 1, while the page is settling: pick a size.
  await page.click('.sizes button >> nth=4');
  // Scroll the slot (or where it would be) into view and let the ad play.
  await page.evaluate(() => {
    const t = document.querySelector('.adslot') ?? document.querySelector('.reviews');
    scrollTo(0, t.getBoundingClientRect().top + scrollY - 150);
  });
  await page.waitForTimeout(5000);
  // Interaction 2, while the ad is playing: a host button next to it.
  await page.click('.review .link >> nth=0');
  await page.waitForTimeout(500);

  const m = await page.evaluate((origin) => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
    const tbt = __m.longtasks.filter(([s]) => s >= fcp).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
    const mark = n => performance.getEntriesByName(n, 'mark')[0]?.startTime;
    const inView = mark('adslot:in-view'), frame = mark('adslot:first-frame');
    // Long animation frames where the ad origin's scripts ran, and how long those scripts took.
    const adFrames = __m.loaf.filter(f => f.scripts.some(([u]) => u.startsWith(origin)));
    return {
      lcp: __m.lcp, cls: __m.cls, inp: __m.inp, tbt,
      longTasks: __m.longtasks.length,
      adLongFrames: adFrames.length,
      adScriptMs: adFrames.flatMap(f => f.scripts).filter(([u]) => u.startsWith(origin)).reduce((a, [, d]) => a + d, 0),
      viewToFrameMs: inView != null && frame != null ? Math.max(0, frame - inView) : null,
    };
  }, AD_ORIGIN);
  await ctx.close();
  return { ...m, bytes: bytes.total, adCodeBytes: bytes.adCode, adMediaBytes: bytes.adMedia };
}

const pct = (xs, p) => {
  const s = xs.filter(x => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null;
};
const round = x => (x == null ? null : Math.round(x * 1000) / 1000);
function summarize(runs) {
  const out = {};
  for (const k of Object.keys(runs[0])) {
    const xs = runs.map(r => r[k]);
    out[k] = { median: round(pct(xs, 0.5)), p95: round(pct(xs, 0.95)), runs: xs.map(round) };
  }
  return out;
}

const servers = start();
const browser = await chromium.launch({ channel: 'chrome' });
const results = { clean: [], ad: [] };
// Interleave conditions so drift (thermal, background load) hits both equally.
for (let i = 0; i < RUNS; i++) {
  for (const cond of ['clean', 'ad']) {
    const r = await run(browser, cond === 'ad');
    results[cond].push(r);
    console.log(`${cond.padEnd(5)} #${i + 1}  lcp=${r.lcp.toFixed(0)} cls=${r.cls.toFixed(4)} inp=${r.inp} tbt=${r.tbt.toFixed(0)} adCode=${r.adCodeBytes} v2f=${r.viewToFrameMs?.toFixed(0)}`);
  }
}
const version = browser.version();
await browser.close();
servers.forEach(s => s.close());

const clean = summarize(results.clean), ad = summarize(results.ad);
const delta = {};
for (const k of ['lcp', 'cls', 'inp', 'tbt', 'bytes', 'longTasks']) {
  delta[k] = { median: round(ad[k].median - clean[k].median), p95: round(ad[k].p95 - clean[k].p95) };
}
let commit = 'unknown';
try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch {}
const out = {
  meta: { label, runs: RUNS, chrome: version, throttle: THROTTLE, viewport: '1280x800', commit, date: new Date().toISOString() },
  clean, ad, delta,
};
fs.mkdirSync(path.join(here, 'results'), { recursive: true });
fs.writeFileSync(path.join(here, 'results', `${label}.json`), JSON.stringify(out, null, 2) + '\n');
console.log('\nmedian delta (ad - clean):', Object.fromEntries(Object.entries(delta).map(([k, v]) => [k, v.median])));
console.log('ad code bytes:', ad.adCodeBytes.median, ' view->frame ms:', ad.viewToFrameMs.median);
