# AdSlot

An embeddable video ad unit with a performance budget, measured against the page it lands on.

Sponsored video ads get injected into product pages owned by other teams. Every kilobyte the unit downloads, every layout shift it causes and every main-thread task it runs is paid for by someone else's page, someone else's Core Web Vitals and someone else's conversion rate. A video player isn't hard to build. The hard part is a unit that proves, on every push, that it doesn't hurt its host. This repo is the unit, a realistic host page to measure the damage against, a harness that measures it, and a CI gate that fails the build when the unit goes over budget.

## Results

Host page: mock retail product page (React, hero image, gallery, specs, 24 reviews, related products). Each condition was run 10 times in Chrome 155 with 4× CPU throttling, 150 ms RTT and 1.6 Mbps down (Lighthouse's mobile profile), at a 1280×800 viewport. The table shows **median / p95**.

| Metric | Host page, no ad | + ad unit, before | + ad unit, after |
|---|---|---|---|
| LCP | 1176 / 1184 ms | 4112 / 4124 ms | **1188 / 1196 ms** |
| CLS | 0 / 0 | 0 / 0 | **0 / 0** |
| INP | 32 / 40 ms | 40 / 48 ms | **32 / 40 ms** |
| TBT | 0 / 0 ms | 0 / 0 ms | **0 / 0 ms** |
| Ad code transferred (JS + creative JSON, gzip) | – | 176.3 KB | **5.5 KB** |
| Ad media transferred (poster, playlists, ~5 s of video) | – | 666 KB | 606 KB |
| Slot in viewport → first video frame | – | 1561 / 1678 ms | 1996 / 2119 ms |
| Long animation frames attributed to the ad | – | 0 | 0 |

**Delta, after vs. clean page: +12 ms LCP, 0 CLS, +0 ms INP, +0 ms TBT, 5.5 KB of code.** Every CI run gates these numbers (see [Budget gate](#budget-gate)).

Raw data: [before.json](bench/results/before.json), [after.json](bench/results/after.json), plus one file per optimization step in [bench/results/](bench/results/).

## What changed and why

### 1. Code split the player and hls.js. LCP delta: +2936 ms → +16 ms

v1 statically imported hls.js, so the "lazy" unit shipped 176 KB gzipped in its first script, right as the page started loading. On a 1.6 Mbps link that script competed with the hero image for bandwidth, which pushed LCP back by almost 3 seconds. The unit had *rendered* nothing yet, and it was already the most expensive thing on the page.

After the split there are three pieces:
- `adslot.js` (1.5 KB): the loader. It finds slots and runs the IntersectionObservers.
- `player-*.js` (3 KB): DOM, controls and quartiles. It's fetched only when a slot comes within 300 px of the viewport, in parallel with the creative JSON.
- `hls.light-*.js` (114 KB): fetched only when the browser has no native HLS. Chrome 155 and Safari play HLS natively, so they never download it. The light build drops EME, subtitles and alternate audio, which an ad doesn't need.

**Cost:** slot-to-first-frame went *up* 635 ms (1561 → 2196), because the player code now takes an extra round trip after the slot is near instead of already being in memory. I accepted that: it costs the ad 0.6 s on its own first frame, where the old version cost the host 2.9 s on LCP.

### 2. Low-resolution poster. First frame: 2196 → 1998 ms

With autoplay, the poster is on screen for about a second, and the full poster (65 KB) was competing with the first video segment. The unit now uses a 4 KB 320×180 poster whenever it will autoplay or when Save-Data is on. The full poster only loads when it will sit at rest, which happens on the click-to-play path under reduced motion.

### 3. Beacons via `sendBeacon` on idle. No measurable change (1998 → 1997 ms)

The impression and quartile beacons were `fetch()` calls fired the moment the player mounted. They now go through `requestIdleCallback` + `navigator.sendBeacon`. The payload is a few bytes, so the harness can't measure any difference. I kept the change because it costs nothing and it's the right default on a page we don't own.

### Tried and reverted: `fetchpriority="low"` on the embed tag. No change (+12 ms either way)

The remaining +12 ms LCP looked like the loader request competing with the hero. Lowering its priority didn't move it. Result: [opt4-low-priority.json](bench/results/opt4-low-priority.json). Clean-page LCP varies by about 30 ms run to run, so 12 ms is close to the noise floor.

### Not done, on purpose

- **Preconnect to the video origin.** Here the media is served from the same origin as the loader script, so the connection is already warm by the time the slot gets near. Preconnect only helps when video comes from a separate CDN.
- **A single rAF viewability loop.** See below. The unit uses one shared IntersectionObserver instead.

## Design decisions and trade-offs

**The host page reserves the space, as a function of width only.** [`embed.css`](packages/adslot/src/embed.css) is about 300 bytes that the publisher inlines with their own CSS. It makes the slot a size container and gives `.adslot__frame` its final height from `cqw` units before any ad code exists: `100cqw × 9/25` for wide, `100cqw × 9/16 + 64px` for mobile, `100cqw + 112px` for sidebar. The unit then lays itself out to fill exactly that box, so it cannot cause a layout shift. The [regression branch](#budget-gate) shows what happens without it: CLS 0.112.

**Container queries, not media queries.** The unit doesn't know what page it's on. A 1440 px desktop viewport can hold a 300 px sidebar slot, and a phone can hold a full-width one. The only fact that matters is the slot's own width, so the three layouts ([see them side by side](packages/host-demo/layouts.html)) switch on `@container` breakpoints at 320 px and 560 px. These are shared between `embed.css` (height) and `player.css` (layout).

**Shadow DOM.** Host CSS like `button { … }` or `img { max-width: 100% }` can't reach into the unit, and the unit's CSS can't leak out. This isolates styles only, not scripts (see Limitations).

**Viewability with one shared IntersectionObserver, not a rAF loop.** IAB video viewability means 50% of pixels visible for 2 continuous seconds. The unit uses a single observer for every slot, with thresholds `[0, 0.5]`, plus one timer per slot that starts when the slot crosses 50% and clears when it drops below 50% or the tab is hidden. That keeps the logic in one place. An rAF loop would mean calling `getBoundingClientRect()` on every frame, 60 main-thread wakeups a second on a page we don't own, to compute what the observer computes off our critical path and reports only on threshold crossings. **Given up:** IntersectionObserver v1 measures clipping, not occlusion. A sticky header covering the slot still counts as visible.

**Autoplay that doesn't fight the browser.** The video is always muted with `playsinline`, and only plays when at least 50% is in view. It pauses when the slot scrolls out, and it never resumes after the user paused it. If `prefers-reduced-motion` or `saveData` is set, it doesn't autoplay at all. If `play()` rejects because of gesture policy, the unit shows a click-to-play button instead of retrying.

**Accessibility.** All controls are real `<button>`s with ARIA labels. Shortcuts `k` (play/pause), `m` (mute) and `c` (captions) work when focus is inside the unit. The focus ring is a double ring (white outline plus black shadow), so it shows on any background. Captions use a WebVTT track, on by default. A `forced-colors` block swaps in system colors and adds borders. State is never shown by color alone: captions on/off is an underline vs. a strike-through plus `aria-pressed`, play/pause swaps the icon and the label, and progress is shown as text (`0:04 / 0:15`) as well as a bar. The CTA says "(opens in new tab)" to screen readers.

## Limitations

- **One machine.** All numbers come from an Apple Silicon Mac. Even at 4× CPU throttling it's fast enough that TBT is 0 and no long tasks are attributed to the ad, with or without the unit. Here, the TBT budget would only catch a large regression. GitHub's runners are slower and will be stricter.
- **Synthetic throttling.** The bench uses DevTools network emulation and CPU throttling, not a real device on a real radio.
- **10 runs.** p95 over 10 samples is close to the maximum.
- **The bench jumps straight to the slot.** It calls `scrollTo` instead of scrolling like a user, so the 300 px `rootMargin` never gets to preload ahead of entry. Slot-to-first-frame is therefore a worst case. Real scrolling would hide most of it.
- **The hls.js path isn't benchmarked.** Chrome 155 has native HLS. Firefox and older Chromium will download the 114 KB light build, but only after the slot is near, so after LCP in this layout. That path is checked by hand (force `canPlayType` to `''`), not gated.
- **No real ad server.** The creative is a static JSON file and a synthetic `testsrc2` video. Beacons hit a 204 endpoint.
- **No cross-origin iframe isolation.** The unit runs in the host's JS realm. Shadow DOM isolates styles, not globals, prototypes or errors. A production unit from an untrusted ad source belongs in a sandboxed cross-origin iframe, which would change the byte and timing numbers.
- **No Lighthouse CI.** The Playwright harness already collects the same vitals across N interleaved runs with percentiles, and it can attribute bytes and frames to the ad origin. LHCI would add a large dependency to report a subset of that.
- **The HLS ladder is synthetic.** It has 3 renditions (240p/480p/720p, H.264 + AAC, 2 s segments).

## Budget gate

[`.github/workflows/budget.yml`](.github/workflows/budget.yml) runs on every push and PR. It generates the media, builds both packages, runs the harness (10 runs per condition), then runs [`bench/gate.js`](bench/gate.js), which exits non-zero if any of these is over budget:

| Check | Budget |
|---|---|
| Added LCP (median) | 150 ms |
| Added CLS (median and p95) | 0.01 |
| Ad code transferred, gzip (median) | 40 KB |
| Added TBT (median) | 50 ms |

The v1 build fails it on LCP (+2936 ms) and bytes (176 KB). The branch `regress/drop-slot-reservation` deliberately removes the reserved height from `embed.css`. The gate fails it on CLS (0.112, [regression.json](bench/results/regression.json)), and restoring the reservation brings it back to 0.

Proof: [PR #1](https://github.com/shamathmika/adslot/pull/1). The check is red on the regression commit and green after the fix.

## How to run

Requires Node 22+, ffmpeg and Google Chrome.

```sh
npm install
npm run media              # HLS ladder, posters, captions, host images -> media/
npm run build              # builds packages/adslot and packages/host-demo
npm run serve              # host http://localhost:4173 (?ad=0 = clean), ad origin http://localhost:4174
                           # layouts demo: http://localhost:4173/layouts.html
npm run bench -- mylabel   # RUNS=10 by default -> bench/results/mylabel.json
npm run gate  -- mylabel   # exit 1 if over budget
```

Layout: `packages/adslot` is the unit (TypeScript; its only dependency is hls.js, loaded lazily). `packages/host-demo` is the React host page. `bench/` holds the media script, a two-origin static server, the Playwright harness and the gate.
