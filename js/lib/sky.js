// The page as a day: a clock and a sun that follow the scroll, the current stop
// on the timeline, a top bar that turns dark at night, and each hour's moment
// dropping in. Under reduced motion the clock and sun are left out.
const minutes = (h, m = 0) => h * 60 + m;
const FIRST = minutes(7);
const DUSK = minutes(18, 30);

// where each time of day sits on the page
const HOURS = [
  ['#paperboy', FIRST],
  ['#kaeru', minutes(8, 30)],
  ['#waypass', minutes(14)],
  ['.sunset', DUSK],
  ['#research', minutes(21)],
];

export function initSky() {
  const bar = document.querySelector('.bar');
  const clock = bar.querySelector('.clock');
  const orb = bar.querySelector('.orb');
  const links = [...bar.querySelectorAll('.timeline a')];
  const stops = HOURS.filter(([s]) => s !== '.sunset');
  const sunset = document.querySelector('.sunset');
  const foot = document.querySelector('.foot');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  let marks = [];
  let night = [0, 0];
  let morning = 0;
  let xs = [];

  const top = (el) => el.getBoundingClientRect().top + scrollY;

  function measure() {
    // the line a section has to reach to count as "now": a third of the way down
    const line = bar.offsetHeight + innerHeight * 0.3;
    marks = HOURS.map(([s, t]) => ({ y: Math.max(0, top(document.querySelector(s)) - line), t }));
    morning = top(foot) - innerHeight * 0.6;
    night = [top(sunset) + sunset.offsetHeight * 0.6, top(foot) + 120];
    const base = bar.querySelector('.timeline').getBoundingClientRect().left;
    xs = links.map((a) => {
      const r = a.getBoundingClientRect();
      return { x: r.left - base + r.width / 2, t: stops[links.indexOf(a)][1] };
    });
    update();
  }

  // piecewise-linear lookup through [{ [from]: n, [to]: n }]
  function along(points, value, from, to) {
    if (value <= points[0][from]) return points[0][to];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (value <= b[from]) return a[to] + ((value - a[from]) / (b[from] - a[from] || 1)) * (b[to] - a[to]);
    }
    return points.at(-1)[to];
  }

  function update() {
    const y = scrollY;
    const under = y + bar.offsetHeight;
    bar.toggleAttribute('data-night', under > night[0] && under < night[1]);

    const tomorrow = y >= morning;
    const t = tomorrow ? FIRST : along(marks, y, 'y', 't');

    // the current stop: the last section that has reached the line, until the footer
    let current = -1;
    stops.forEach(([s], i) => { if (y >= marks[HOURS.findIndex((h) => h[0] === s)].y - 4) current = i; });
    if (tomorrow) current = -1;
    links.forEach((a, i) => (i === current ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));

    const still = reduced.matches;
    clock.hidden = orb.hidden = still;
    if (still) return;
    const shown = Math.floor(t / 5) * 5;
    clock.textContent = `${String(Math.floor(shown / 60)).padStart(2, '0')}:${String(shown % 60).padStart(2, '0')}`;
    const x = along(xs, t, 't', 'x');
    const span = xs.at(-1).x - xs[0].x || 1;
    const arc = Math.sin(Math.PI * Math.min(1, Math.max(0, (x - xs[0].x) / span))) * 5;
    orb.style.translate = `${x}px ${-arc}px`;
    orb.toggleAttribute('data-moon', !tomorrow && t >= DUSK);
  }

  let queued = false;
  addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; update(); });
  }, { passive: true });
  addEventListener('resize', measure);
  reduced.addEventListener('change', measure);
  // heights change as demos load and disclosures open
  new ResizeObserver(measure).observe(document.body);
  document.fonts?.ready.then(measure);
  measure();
  initMoments(reduced);
}

function initMoments(reduced) {
  if (reduced.matches) return;
  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      delete e.target.dataset.waiting;
      observer.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -25% 0px' });
  for (const moment of document.querySelectorAll('.moment')) {
    if (moment.getBoundingClientRect().top < innerHeight * 0.75) continue; // already past
    moment.dataset.waiting = '';
    observer.observe(moment);
  }
}
