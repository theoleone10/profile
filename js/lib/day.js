// The page as one day. Each section is its own page (a "scene"), and one sun
// crosses the sky behind them all: up from the bottom-left corner at sunrise,
// over the top middle at noon, and down into the bottom-right corner at sunset.
// The sun passes behind the text; the pages stay put. Scrolling
// moves the sun (and with it the day); so do dragging it, ← →, swipes and the
// links. Without JavaScript the scenes simply stack into one long page.

import { createMountains, along, css } from './mountains.js';

const SUNRISE = 6 * 60; // minutes
const DAY = 12 * 60;    // sunrise to sunset
const WHEEL_PER_STOP = 320; // pixels of wheel that move the sun from one page to the next

// the sky through the day, one flat colour at a time: night-dark at the
// start, rose at dawn, blue through the day, rose again, dark by the end
const SKY = [
  [0,    '#171A2B'],
  [0.07, '#3A3352'],
  [0.12, '#B89AAF'],
  [0.17, '#CFDAE8'],
  [0.35, '#C9DFF2'],
  [0.5,  '#C4DDF3'],
  [0.65, '#C9DFF2'],
  [0.83, '#D6D4E4'],
  [0.88, '#BE9AA8'],
  [0.93, '#3A3150'],
  [1,    '#161829'],
];

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const wideQuery = matchMedia('(min-width: 941px)');

export function initDay() {
  const root = document.documentElement;
  const day = document.querySelector('.day');
  const scenes = [...day.querySelectorAll('.scene')];
  if (scenes.length < 2) return;
  const bar = document.querySelector('.bar');
  const clock = bar.querySelector('.clock');
  const dial = bar.querySelector('.bar-clock');
  const hands = { h: bar.querySelector('.hand-h'), m: bar.querySelector('.hand-m') };
  const navLinks = [...bar.querySelectorAll('.timeline a')];
  const stops = scenes.map((_, i) => i / (scenes.length - 1));
  const gap = stops[1];
  root.classList.add('paged');

  // ── The sky and the sun ──
  const sky = document.createElement('div');
  sky.className = 'sky';
  sky.setAttribute('aria-hidden', 'true');
  sky.innerHTML = '<div class="sun"><div class="sun-glow"></div><div class="sun-disc"></div></div><svg class="mountains" preserveAspectRatio="none"></svg>';
  document.body.prepend(sky);
  const sun = sky.querySelector('.sun');
  const mountains = createMountains(sky.querySelector('.mountains'));

  // ── The pager: the page before, bottom left; the page after, bottom right ──
  const pager = document.createElement('nav');
  pager.className = 'pager';
  pager.setAttribute('aria-label', 'Through the day');
  pager.innerHTML = `<button type="button" class="pager-step pager-prev" data-step="-1"><span aria-hidden="true">←</span> <span class="vh">Back to </span><span class="pager-name"></span></button>
    <p class="vh" aria-live="polite"></p>
    <button type="button" class="pager-step pager-next" data-step="1"><span class="vh">On to </span><span class="pager-name"></span> <span aria-hidden="true">→</span></button>`;
  document.body.append(pager);
  const [prevBtn, nextBtn] = pager.querySelectorAll('.pager-step');
  const now = pager.querySelector('[aria-live]');
  pager.addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (step) go(index + Number(step.dataset.step), { push: true });
  });

  // ── Geometry of the arc, in viewport pixels ──
  let geo = null;
  function measure() {
    const w = root.clientWidth;
    const h = innerHeight;
    const r = clamp(Math.min(w, h) * 0.038, 18, 38);
    const top = bar.offsetHeight + r + 14;
    const side = Math.max(r + 10, w * 0.04);
    mountains.layout(w, h);
    // the sun rises and sets from behind the peaks at either end
    const horizon = Math.min(mountains.ridgeAt(side), mountains.ridgeAt(w - side)) + r * 0.2;
    geo = { w, h, r, cx: w / 2, rx: w / 2 - side, horizon, ry: horizon - top, wide: wideQuery.matches };
    sun.style.setProperty('--r', `${r}px`);
    paint(p);
  }
  // where the sun is at progress q, 0 (sunrise) to 1 (sunset)
  function at(q) {
    const a = Math.PI * (1 - q);
    return { x: geo.cx + geo.rx * Math.cos(a), y: geo.horizon - geo.ry * Math.sin(a) };
  }
  // the progress of the point on the arc closest to (x, y)
  function progressNear(x, y) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i <= 400; i++) {
      const s = at(i / 400);
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bestD) { bestD = d; best = i / 400; }
    }
    return best;
  }

  // ── Draw one moment of the day ──
  let p = 0;
  function paint(q) {
    p = clamp(q);
    if (!geo) return;
    const s = at(p);
    const set = (k, v) => root.style.setProperty(k, v);
    const skyColour = along(SKY, p);
    set('--sky', css(skyColour));
    mountains.light(s.x, s.y, p, skyColour);
    // under a dark sky the words turn light
    const [r, g, b] = skyColour.map((v) => v / 255);
    root.toggleAttribute('data-dark', 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.42);
    set('--sun-x', `${s.x.toFixed(1)}px`);
    set('--sun-y', `${s.y.toFixed(1)}px`);
    set('--low', (1 - Math.sin(Math.PI * p)).toFixed(3));
    // things cast their shadows away from the sun
    set('--sx', `${((geo.cx - s.x) / geo.w * 14).toFixed(1)}px`);
    set('--sy', `${(4 + (geo.h * 0.55 - s.y) / geo.h * 10).toFixed(1)}px`);
    sun.style.translate = `${s.x.toFixed(1)}px ${s.y.toFixed(1)}px`;
    const minutes = Math.round((SUNRISE + p * DAY) / 5) * 5;
    clock.textContent = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const exact = SUNRISE + p * DAY;
    hands.h?.setAttribute('transform', `rotate(${((exact / 60) % 12) * 30} 12 12)`);
    hands.m?.setAttribute('transform', `rotate(${(exact % 60) * 6} 12 12)`);
  }

  // the sun glides to a point of the day
  let glide = 0;
  function glideTo(target, ms = 800) {
    cancelAnimationFrame(glide);
    const from = p;
    if (reduced.matches || Math.abs(target - from) < 0.001) return paint(target);
    const duration = ms * clamp(Math.abs(target - from) / gap, 0.45, 1.6);
    const start = performance.now();
    const frame = (now) => {
      const t = clamp((now - start) / duration);
      paint(from + (target - from) * ease(t));
      if (t < 1) glide = requestAnimationFrame(frame);
    };
    glide = requestAnimationFrame(frame);
  }

  // ── Switching scenes ──
  let index = -1;
  const running = new Map(); // scene → its animation

  function show(i, { fromEnd = false, focus = false, instant = false } = {}) {
    if (i === index || i < 0 || i >= scenes.length) return;
    const from = scenes[index];
    const to = scenes[i];
    const dir = Math.sign(i - index);
    index = i;

    for (const s of scenes) {
      running.get(s)?.cancel();
      running.delete(s);
      if (s !== to && s !== from) hide(s);
    }
    to.hidden = false;
    to.inert = false;
    to.scrollTop = fromEnd ? to.scrollHeight : 0;
    if (from) { from.inert = true; from.dataset.leaving = ''; }
    dropMoments(to);

    if (instant || reduced.matches || !from) {
      if (from) hide(from);
    } else {
      const shift = Math.min(56, innerWidth * 0.04) * dir;
      const opts = { duration: 560, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' };
      running.set(to, to.animate([{ opacity: 0, translate: `${shift}px 0` }, { opacity: 1, translate: '0 0' }], opts));
      const out = from.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `${-shift}px 0` }], { ...opts, duration: 380, fill: 'forwards' });
      running.set(from, out);
      out.finished.then(() => hide(from)).catch(() => {});
    }
    if (focus) to.focus({ preventScroll: true });

    navLinks.forEach((a) => (a.hash === `#${to.id}` ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
    prevBtn.hidden = i === 0;
    nextBtn.hidden = i === scenes.length - 1;
    if (i > 0) prevBtn.querySelector('.pager-name').textContent = scenes[i - 1].dataset.name;
    if (i < scenes.length - 1) nextBtn.querySelector('.pager-name').textContent = scenes[i + 1].dataset.name;
    now.textContent = `${to.dataset.time}, ${to.dataset.name}`;
    root.dataset.scene = to.id;
  }
  function hide(s) {
    running.get(s)?.cancel();
    running.delete(s);
    delete s.dataset.leaving;
    s.inert = true;
    s.hidden = 'until-found'; // still found by find-in-page; see beforematch below
  }

  // settle on a page: the sun glides to its hour and the address follows
  function go(i, { push = false, ...opts } = {}) {
    i = clamp(i, 0, scenes.length - 1);
    if (i !== index) show(i, { focus: true, ...opts });
    glideTo(stops[i]);
    if (push) {
      const url = i === 0 ? location.pathname + location.search : `#${scenes[i].id}`;
      if (url !== location.pathname + location.search + location.hash) history.pushState(null, '', url);
    }
  }
  const nearest = (q) => Math.round(clamp(q) / gap);

  const sceneFor = (hash) => {
    if (!hash || hash === '#' || hash === '#top') return 0;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    const scene = el?.closest('.scene');
    return scene ? scenes.indexOf(scene) : -1;
  };

  // in-page links: go to the scene the target lives in
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const i = sceneFor(a.hash);
    if (i < 0) return;
    e.preventDefault();
    go(i, { push: true });
  });
  addEventListener('popstate', () => { const i = sceneFor(location.hash); if (i >= 0) go(i); });
  // find-in-page found text in a hidden scene
  for (const s of scenes) s.addEventListener('beforematch', () => go(scenes.indexOf(s), { instant: true }));

  // ── Dragging the sun ──
  let drag = null;
  const isControl = (el) => el.closest('a, button, input, textarea, select, summary, label, video, audio, iframe, [role="slider"], [role="tab"], [contenteditable], pre, .pager, .bar');
  const onSun = (x, y) => geo && Math.hypot(x - at(p).x, y - at(p).y) <= geo.r * 1.35;

  addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !onSun(e.clientX, e.clientY) || isControl(e.target)) return;
    e.preventDefault();
    cancelAnimationFrame(glide);
    const s = at(p);
    drag = { id: e.pointerId, dx: e.clientX - s.x, dy: e.clientY - s.y };
    root.dataset.dragging = '';
  });
  addEventListener('pointermove', (e) => {
    if (!drag) {
      if (e.pointerType === 'mouse') root.toggleAttribute('data-over-sun', !!onSun(e.clientX, e.clientY) && !isControl(e.target));
      return;
    }
    if (e.pointerId !== drag.id) return;
    paint(progressNear(e.clientX - drag.dx, e.clientY - drag.dy));
    const near = nearest(p);
    if (near !== index) show(near, { fromEnd: near < index });
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    delete root.dataset.dragging;
    go(nearest(p), { push: true });
  };
  addEventListener('pointerup', endDrag);
  addEventListener('pointercancel', endDrag);
  // on touch screens, a finger on the sun moves the sun, not the page
  addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });

  // ── Scrolling moves the sun ──
  // Only things with their own scroll (code, a transcript, notes opened up)
  // still scroll under the wheel. On narrow screens, where a page is taller
  // than the screen, the page scrolls first and the sun moves on at its end.
  const canScroll = (el, axis, dir, upTo) => {
    for (let node = el; node && node !== upTo && node !== document.body; node = node.parentElement) {
      if (!(node instanceof HTMLElement)) continue;
      const style = getComputedStyle(node);
      if (!/(auto|scroll)/.test(axis === 'y' ? style.overflowY : style.overflowX)) continue;
      const pos = axis === 'y' ? node.scrollTop : node.scrollLeft;
      const room = axis === 'y' ? node.scrollHeight - node.clientHeight : node.scrollWidth - node.clientWidth;
      if (dir > 0 ? pos < room - 1 : pos > 1) return true;
    }
    return false;
  };

  let wheel = null;
  let wheelEnd = 0;
  addEventListener('wheel', (e) => {
    if (e.ctrlKey || drag || !geo || document.querySelector('dialog[open]')) return;
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
    const delta = (horizontal ? e.deltaX : e.deltaY) * scale;
    if (!delta) return;
    const dir = Math.sign(delta);
    const scene = scenes[index];

    clearTimeout(wheelEnd);
    wheelEnd = setTimeout(settle, 160);
    if (!wheel) wheel = { start: index, dir, moved: false, scrolled: false };

    // inner scrolling (and, when narrow, the page itself) comes first
    const upTo = geo.wide ? scene : scene.parentElement;
    if (canScroll(e.target, horizontal ? 'x' : 'y', dir, upTo)) {
      if (!wheel.moved) { wheel.scrolled = true; return; }
    }
    if (wheel.scrolled) return; // momentum that reached the end of something: stay
    e.preventDefault();
    cancelAnimationFrame(glide);
    wheel.moved = true;
    wheel.dir = dir;
    paint(p + (delta / WHEEL_PER_STOP) * gap);
    const near = nearest(p);
    if (near !== index) show(near, { fromEnd: near < index && !geo.wide });
  }, { passive: false });

  // when the wheel stops, the sun settles on the page it was heading for
  function settle() {
    const w = wheel;
    wheel = null;
    if (!w || !w.moved) return;
    const f = p / gap;
    const base = Math.floor(f + 1e-6);
    const frac = f - base;
    let target;
    if (w.dir > 0) target = frac > 0.12 ? base + 1 : base;
    else target = frac < 0.88 && frac > 1e-6 ? base : base + (frac > 1e-6 ? 1 : 0);
    if (target === w.start && Math.abs(f - w.start) > 0.12) target = w.start + w.dir;
    go(target, { push: true, fromEnd: target < w.start && !geo.wide });
  }

  // ── Swipes ──
  let touch = null;
  day.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || drag) { touch = null; return; }
    const t = e.touches[0];
    const scene = scenes[index];
    touch = {
      x: t.clientX, y: t.clientY, target: e.target,
      top: scene.scrollTop <= 1, bottom: scene.scrollTop >= scene.scrollHeight - scene.clientHeight - 1,
    };
  }, { passive: true });
  day.addEventListener('touchend', (e) => {
    if (!touch || drag) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.x;
    const dy = t.clientY - touch.y;
    const start = touch;
    touch = null;
    if (start.target.closest('input, textarea, [role="slider"], .pb-scrub')) return;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (canScroll(start.target, 'x', -Math.sign(dx), scenes[index])) return;
      go(index - Math.sign(dx), { push: true });
    } else if (Math.abs(dy) > 80 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      if (dy < 0 && start.bottom) go(index + 1, { push: true });
      if (dy > 0 && start.top && index > 0) go(index - 1, { push: true, fromEnd: true });
    }
  }, { passive: true });

  // ── Keys ──
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')) return;
    const t = e.target;
    if (t.closest?.('input, textarea, select, [contenteditable], [role="slider"], [role="tab"], [role="tablist"], video, audio')) return;
    const scene = scenes[index];
    const free = t === document.body || t === scene || t === day;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      if (!free && t.closest('.code, .pb-script')) return; // let wide code scroll sideways
      e.preventDefault();
      if (!e.repeat) go(index + (e.key === 'ArrowRight' ? 1 : -1), { push: true });
      return;
    }
    const step = { ArrowDown: 80, ArrowUp: -80, PageDown: 0.85, PageUp: -0.85, ' ': e.shiftKey ? -0.85 : 0.85 }[e.key];
    if (step === undefined || (!free && e.key === ' ')) return;
    if (!free && !scene.contains(t)) return;
    const dir = Math.sign(step);
    // on wide screens the page doesn't scroll: down and up move the day
    if (!geo.wide && canScroll(scene, 'y', dir, scene.parentElement)) {
      if (!free) return; // focus is in the scene: the browser scrolls it
      e.preventDefault();
      scene.scrollBy({ top: Math.abs(step) < 1 ? step * scene.clientHeight : step, behavior: reduced.matches ? 'instant' : 'smooth' });
    } else if (!e.repeat) {
      e.preventDefault();
      go(index + dir, { push: true, fromEnd: dir < 0 && !geo.wide });
    }
  });

  // ── Start ──
  for (const s of scenes) { s.inert = true; s.hidden = 'until-found'; }
  const first = Math.max(0, sceneFor(location.hash));
  measure();
  show(first, { instant: true });
  paint(stops[first]);
  clock.hidden = false;
  if (dial) dial.hidden = false;
  addEventListener('resize', measure);
  reduced.addEventListener('change', () => paint(stops[index]));

  // the first visit: the sun rises into place
  if (first === 0 && !reduced.matches) {
    sun.animate([{ translate: `${at(0).x}px ${geo.horizon + geo.r * 2}px` }, { translate: `${at(0).x}px ${at(0).y}px` }],
      { duration: 1600, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
  }
}

// each page's moment drops in as you arrive
function dropMoments(scene) {
  if (reduced.matches) return;
  for (const m of scene.querySelectorAll('.moment')) {
    m.dataset.waiting = '';
    requestAnimationFrame(() => requestAnimationFrame(() => delete m.dataset.waiting));
  }
}
