import css from './player.css?inline';
import Hls from 'hls.js';

export interface Creative {
  id: string; advertiser: string; headline: string; body: string; cta: string; clickUrl: string;
  hls: string; poster: string; posterLo: string; captions: string; durationSec: number;
}

export interface Player {
  /** Called by the viewability tracker when the slot crosses 50% visible. */
  setInView(inView: boolean): void;
}

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/></svg>',
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>',
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function mountPlayer(frame: HTMLElement, c: Creative, base: string, track: (name: string) => void): Player {
  const url = (p: string) => new URL(p, base).href;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const saveData = !!conn?.saveData;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const autoplay = !saveData && !reducedMotion;

  const root = frame.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${css}</style>
<div class="as" role="region" aria-label="Sponsored video from ${esc(c.advertiser)}">
  <div class="media">
    <video playsinline muted preload="none" crossorigin="anonymous" poster="${url(c.poster)}">
      <track kind="captions" srclang="en" label="English" src="${url(c.captions)}" default>
    </video>
    <span class="badge">Sponsored</span>
    <button class="bigplay" hidden aria-label="Play video ad">${ICON.play}<span>Play</span></button>
    <div class="controls">
      <button class="play" aria-label="Play">${ICON.play}</button>
      <button class="mute" aria-label="Unmute">${ICON.muted}</button>
      <button class="cc" aria-pressed="true" aria-label="Captions">CC</button>
      <span class="time" aria-live="off">0:00 / ${fmt(c.durationSec)}</span>
    </div>
    <div class="progress" aria-hidden="true"><div></div></div>
  </div>
  <div class="copy">
    <div class="text">
      <p class="adv">${esc(c.advertiser)}</p>
      <h3>${esc(c.headline)}</h3>
      <p class="body">${esc(c.body)}</p>
    </div>
    <a class="cta" href="${esc(c.clickUrl)}" target="_blank" rel="noopener sponsored">${esc(c.cta)}<span class="sr"> (opens in new tab)</span></a>
  </div>
</div>`;
  const $ = <T extends Element>(s: string) => root.querySelector(s) as T;
  const video = $<HTMLVideoElement>('video');
  const big = $<HTMLButtonElement>('.bigplay');
  const playBtn = $<HTMLButtonElement>('.play');
  const muteBtn = $<HTMLButtonElement>('.mute');
  const ccBtn = $<HTMLButtonElement>('.cc');
  const time = $<HTMLElement>('.time');
  const bar = $<HTMLElement>('.progress > div');
  $<HTMLElement>('.sr').style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)';

  let attached = false;
  let userPaused = false;
  let inView = false;
  const fired = new Set<string>();
  const once = (n: string) => { if (!fired.has(n)) { fired.add(n); track(n); } };

  function attach() {
    if (attached) return;
    attached = true;
    const src = url(c.hls);
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src; // Safari: native HLS, no hls.js
    } else if (Hls.isSupported()) {
      // ponytail: short buffer, an ad shouldn't hoard the host page's bandwidth.
      const hls = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 8 });
      hls.loadSource(src);
      hls.attachMedia(video);
    }
    video.preload = 'auto';
  }

  function play(fromUser: boolean) {
    attach();
    if (fromUser) userPaused = false;
    // Gesture policy: if the browser refuses, stop fighting and offer click-to-play.
    video.play().then(() => { big.hidden = true; }, () => { big.hidden = false; });
  }

  function markFirstFrame() {
    const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => void };
    const mark = () => performance.mark('adslot:first-frame');
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(mark);
    else video.addEventListener('playing', mark, { once: true });
  }
  markFirstFrame();

  big.onclick = () => play(true);
  playBtn.onclick = () => (video.paused ? play(true) : (userPaused = true, video.pause()));
  muteBtn.onclick = () => { video.muted = !video.muted; if (!video.muted) once('unmute'); };
  ccBtn.onclick = () => {
    const t = video.textTracks[0];
    t.mode = t.mode === 'showing' ? 'hidden' : 'showing';
    ccBtn.setAttribute('aria-pressed', String(t.mode === 'showing'));
  };
  $<HTMLAnchorElement>('.cta').onclick = () => track('click');
  // Keyboard shortcuts while focus is inside the unit (k/m/c, like most players).
  root.addEventListener('keydown', e => {
    const k = (e as KeyboardEvent).key.toLowerCase();
    const btn = k === 'k' ? playBtn : k === 'm' ? muteBtn : k === 'c' ? ccBtn : null;
    if (btn) { e.preventDefault(); btn.click(); }
  });

  video.addEventListener('play', () => { playBtn.innerHTML = ICON.pause; playBtn.ariaLabel = 'Pause'; once('start'); });
  video.addEventListener('pause', () => { playBtn.innerHTML = ICON.play; playBtn.ariaLabel = 'Play'; });
  video.addEventListener('volumechange', () => {
    muteBtn.innerHTML = video.muted ? ICON.muted : ICON.sound;
    muteBtn.ariaLabel = video.muted ? 'Unmute' : 'Mute';
  });
  video.addEventListener('timeupdate', () => {
    const d = video.duration || c.durationSec;
    const f = video.currentTime / d;
    time.textContent = `${fmt(video.currentTime)} / ${fmt(d)}`;
    bar.style.width = `${Math.min(100, f * 100)}%`;
    if (f >= 0.25) once('firstQuartile');
    if (f >= 0.5) once('midpoint');
    if (f >= 0.75) once('thirdQuartile');
  });
  video.addEventListener('ended', () => once('complete'));
  video.textTracks[0].mode = 'showing';

  if (autoplay) attach();
  else big.hidden = false;

  return {
    setInView(v) {
      inView = v;
      if (inView && autoplay && !userPaused && video.paused && !video.ended) play(false);
      else if (!inView && !video.paused) video.pause();
    },
  };
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
}
