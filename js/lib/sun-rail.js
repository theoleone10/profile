// The scrollbar as the sky: a sun that leaves the right edge, climbs, and sets
// again as you scroll, followed by the moon, and the next sunrise at the very
// bottom. It can be dragged like a scrollbar thumb. CSS decides where it shows
// (wide screens, motion allowed); everywhere else the browser's own bar stays.
const SIZE = 64;
const EDGE = 8; // centre's distance from the edge on the horizon: half set

export function initSunRail() {
  const rail = document.createElement('div');
  rail.className = 'sun-rail';
  rail.setAttribute('aria-hidden', 'true'); // keyboard and screen readers scroll natively
  rail.innerHTML = '<svg><path></path></svg><div class="sun-body"><div class="sun-disc"></div></div>';
  document.body.append(rail);
  const svg = rail.querySelector('svg');
  const path = rail.querySelector('path');
  const body = rail.querySelector('.sun-body');
  const disc = rail.querySelector('.sun-disc');

  let max = 1;      // furthest scroll position
  let dusk = 0.8;   // as fractions of it
  let morning = 0.95;
  let height = 0;
  let reach = 80;   // how far from the edge the sun gets at its highest

  // where the sun or moon is at progress p: how far in, and how close to the horizon
  function sky(p) {
    let lift;
    let moon = false;
    if (p <= dusk) lift = Math.sin(Math.PI * (p / dusk));
    else if (p <= morning) { moon = true; lift = Math.sin(Math.PI * ((p - dusk) / (morning - dusk))); }
    else lift = 0.7 * Math.sin((Math.PI / 2) * ((p - morning) / (1 - morning)));
    lift = Math.max(0, lift);
    return { x: EDGE + lift * (reach - EDGE), y: p * (height - SIZE) + SIZE / 2, low: 1 - lift, moon };
  }

  function update(y = scrollY) {
    if (!height) return;
    const at = sky(Math.min(1, Math.max(0, y / max)));
    body.style.translate = `${SIZE / 2 - at.x}px ${at.y - SIZE / 2}px`;
    body.toggleAttribute('data-moon', at.moon);
    disc.style.setProperty('--low', at.low.toFixed(3));
  }

  function measure(times) {
    height = rail.clientHeight;
    if (!height) return;
    max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    dusk = Math.min(0.9, Math.max(0.1, times.dusk / max));
    morning = Math.min(0.98, Math.max(dusk + 0.05, times.morning / max));
    const margin = (document.documentElement.clientWidth - document.querySelector('.bar-in').offsetWidth) / 2;
    reach = Math.min(190, Math.max(40, margin - 30));
    const width = reach + SIZE;
    svg.setAttribute('width', width);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const points = Array.from({ length: 161 }, (_, i) => sky(i / 160))
      .map((s) => `${(width - s.x).toFixed(1)} ${s.y.toFixed(1)}`);
    path.setAttribute('d', `M${points.join('L')}`);
    update();
  }

  let grab = null; // pointer's offset from the sun's centre while dragging
  body.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    body.setPointerCapture(e.pointerId);
    const r = body.getBoundingClientRect();
    grab = e.clientY - (r.top + r.height / 2);
  });
  body.addEventListener('pointermove', (e) => {
    if (grab === null) return;
    const p = (e.clientY - grab - rail.getBoundingClientRect().top - SIZE / 2) / (height - SIZE);
    scrollTo({ top: Math.min(1, Math.max(0, p)) * max, behavior: 'instant' });
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    body.addEventListener(type, () => { grab = null; });
  }

  return { measure, update };
}
