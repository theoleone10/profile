// Federated learning on DCP, drawn as it happens: a coordinator, the DCP
// scheduler and five machines that each keep their own rows. The training runs in
// a Web Worker (./worker.js); this module only shows it.
const DATA = new URL('../../../data/brfss.json', import.meta.url).href;
const NAMES = {
  alaska: ['Alaska', 'AK'], florida: ['Florida', 'FL'], minnesota: ['Minnesota', 'MN'],
  'new-york': ['New York', 'NY'], washington: ['Washington', 'WA'],
};
const FEATURES = ['Age group', 'Female', 'BMI', 'Current smoker', 'Former smoker', 'Exercises', 'Diabetes', 'General health', 'Education', 'Income'];
const DURATION = { stats: 1400, send: 1100, read: 1300, return: 1100, update: 1100 };
const STATUS = { stats: 'summary sent', send: 'job received', read: 'reading locally', return: 'sums sent', update: 'waiting' };
const AUC_RANGE = [0.68, 0.8];
const COLOR = { yes: '#F2B880', no: '#59618A', dim: '#333950' };

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};
const count = (n) => n.toLocaleString('en-US');

function connect() {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  const waiting = new Map();
  let next = 0;
  worker.addEventListener('message', ({ data: { id, result, error } }) => {
    const { resolve, reject } = waiting.get(id);
    waiting.delete(id);
    if (error) reject(new Error(error)); else resolve(result);
  });
  worker.addEventListener('error', (e) => { for (const w of waiting.values()) w.reject(new Error(e.message || 'The worker failed')); });
  return (type, payload) => new Promise((resolve, reject) => {
    waiting.set(++next, { resolve, reject });
    worker.postMessage({ id: next, type, payload });
  });
}

export async function mount(demo, system) {
  const $ = (name) => demo.querySelector(`[data-fl="${name}"]`);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const stage = $('stage');
  const wires = stage.querySelector('svg');
  const say = $('say');
  const run = $('run');
  const call = connect();

  let info;
  try {
    info = await call('load', { url: DATA });
  } catch {
    say.textContent = 'The demo couldn’t load its data. The code tab still works.';
    return;
  }

  // ── The machines ──
  const maxDots = Math.max(...info.sites.map((s) => s.dots.length));
  const machines = info.sites.map((site) => {
    const [full, short] = NAMES[site.name];
    const canvas = el('canvas', { ariaHidden: 'true' });
    const status = el('span', { className: 'fl-status-text', textContent: 'ready' });
    const button = el('button', { type: 'button', ariaPressed: 'true' },
      el('b', {}, el('span', { className: 'full', textContent: full }), el('span', { className: 'short', ariaHidden: 'true', textContent: short })),
      el('small', {}, count(site.rows), el('span', { className: 'full', textContent: ' rows' })),
      canvas, status);
    button.setAttribute('aria-label', `${full}, ${count(site.rows)} rows, taking part`);
    const wire = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const packet = el('span', { className: 'fl-packet', hidden: true, ariaHidden: 'true' });
    return { ...site, full, canvas, status, button, wire, packet, on: true };
  });
  $('machines').replaceChildren(...machines.map((m) => el('li', {}, m.button)));
  wires.replaceChildren(...machines.map((m) => m.wire));
  stage.append(...machines.map((m) => m.packet));
  const active = () => machines.filter((m) => m.on);

  // ── The side panel ──
  const weights = FEATURES.map((name) => {
    const bar = el('b');
    const value = el('em', { textContent: '0.00' });
    $('weights').append(el('li', {}, el('span', { textContent: name }), el('i', {}, bar), value));
    return { bar, value };
  });
  function setWeights(beta) {
    weights.forEach(({ bar, value }, j) => {
      const v = beta ? beta[j + 1] : 0; // beta[0] is the intercept
      const width = Math.min(Math.abs(v) * 62, v < 0 ? 30 : 68);
      bar.style.left = `${v < 0 ? 30 - width : 30}%`;
      bar.style.width = `${width}%`;
      value.textContent = v.toFixed(2);
    });
  }
  const aucRow = (name, className = '') => {
    const dot = el('b');
    const value = el('em', { textContent: '–' });
    $('auc').append(el('li', { className }, el('span', { textContent: name }), el('i', {}, dot), value));
    return (v) => {
      dot.hidden = v == null;
      value.textContent = v == null ? '–' : v.toFixed(3);
      if (v != null) dot.style.left = `${Math.min(1, Math.max(0, (v - AUC_RANGE[0]) / (AUC_RANGE[1] - AUC_RANGE[0]))) * 100}%`;
    };
  };
  [...machines].sort((a, b) => a.alone - b.alone).forEach((m) => aucRow(`${m.full} alone`)(m.alone));
  const together = aucRow('Together', 'together');

  // ── Drawing ──
  function drawDots(m, sweep = null) {
    const { canvas } = m;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // one dot size for every machine, so the boxes compare: the largest just fits
    let cell = 9;
    while (cell > 2.5 && Math.ceil(maxDots / Math.floor(w / cell)) * cell > h) cell -= 0.25;
    const cols = Math.floor(w / cell);
    const rows = Math.ceil(maxDots / cols);
    const left = (w - cols * cell) / 2;
    m.dots.forEach((label, i) => {
      const row = Math.floor(i / cols);
      const reading = sweep != null && Math.abs(row - (sweep * (rows + 8) - 4)) < 3;
      ctx.globalAlpha = sweep == null || reading ? 1 : 0.4;
      ctx.fillStyle = !m.on ? COLOR.dim : label ? COLOR.yes : COLOR.no;
      ctx.beginPath();
      ctx.arc(left + (i % cols) * cell + cell / 2, h - row * cell - cell / 2, reading ? cell * 0.45 : cell * 0.34, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function layout() {
    const box = stage.getBoundingClientRect();
    if (!box.width) return;
    const at = (node) => {
      const r = node.getBoundingClientRect();
      return { x: r.left - box.left + r.width / 2, top: r.top - box.top, bottom: r.bottom - box.top, width: r.width };
    };
    const coord = at($('coord'));
    const sched = at($('sched'));
    wires.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    machines.forEach((m, k) => {
      const end = at(m.button);
      const x = sched.x + (k - 2) * Math.min(22, sched.width / 7);
      const bend = (end.top - sched.bottom) * 0.55;
      m.wire.setAttribute('d', `M${coord.x} ${coord.bottom}V${sched.top}M${x} ${sched.bottom}C${x} ${sched.bottom + bend} ${end.x} ${end.top - bend} ${end.x} ${end.top}`);
      m.wire.toggleAttribute('data-off', !m.on);
      // packets follow the same route, from the coordinator down
      m.route = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      m.route.setAttribute('d', `M${coord.x} ${coord.bottom}L${x} ${sched.top}L${x} ${sched.bottom}C${x} ${sched.bottom + bend} ${end.x} ${end.top - bend} ${end.x} ${end.top}`);
      drawDots(m);
    });
  }

  function placePacket(m, along) {
    const p = m.route.getPointAtLength(m.route.getTotalLength() * along);
    m.packet.style.translate = `${p.x}px ${p.y}px`;
  }

  // ── One step ──
  let generation = 0; // bumped on reset, so a step in flight gives up
  let playing = false;
  let busy = false;
  let finished = false;
  let totals = { out: 0, back: 0, jobs: 0 };

  const tween = (ms, frame) => new Promise((resolve) => {
    const mine = generation;
    const start = performance.now();
    const tick = (now) => {
      if (mine !== generation) return resolve();
      const t = Math.min(1, Math.max(0, (now - start) / ms));
      frame(t);
      if (t < 1) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function describe(step) {
    const n = step.numbersEach;
    switch (step.phase) {
      case 'stats': return `Setup: each machine sends ${n} summary numbers, so every feature gets scaled the same way.`;
      case 'send': return `The coordinator sends each machine ${n} numbers: the weights, and how to scale the features. One DCP job each.`;
      case 'read': return 'Each machine reads only its own rows and works out how the weights should change.';
      case 'return': return `Only ${n} numbers come back from each: a gradient, a Hessian and a loss.`;
      default:
        if (!step.done) return `The coordinator adds them up and takes one Newton step. Test AUC: ${step.auc.toFixed(3)}.`;
        return `Done in ${step.round} rounds: the same model as pooling ${step.machines === 5 ? 'all' : 'these'} ${count(step.rows)} rows, and none of them moved.`;
    }
  }

  function show(step) {
    const { phase } = step;
    $('chip').textContent = step.done ? `Done · ${step.round} rounds` : phase === 'stats' ? 'Round 0 · setup' : `Round ${step.round}`;
    for (const li of $('steps').children) {
      if (li.dataset.phase === phase) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    }
    say.ariaLive = playing && !step.done ? 'off' : 'polite'; // don't narrate every step of a run
    say.textContent = describe(step);
    demo.dataset.phase = phase;
    for (const m of active()) m.status.textContent = STATUS[phase];

    const n = step.machines;
    if (phase === 'stats') { totals.jobs += n; totals.back += n * step.numbersEach; }
    if (phase === 'send') { totals.jobs += n; totals.out += n * step.numbersEach; }
    if (phase === 'return') totals.back += n * step.numbersEach;
    counters();

    if (phase === 'update') {
      setWeights(step.beta);
      together(step.auc);
      if (step.done) {
        $('match').textContent = step.maxDiff != null
          ? `Checked against scikit-learn on the pooled rows: largest difference in any coefficient ${step.maxDiff.toExponential(1)}.`
          : 'Turn all five machines on to compare with scikit-learn on the pooled rows.';
      }
    }

    // light the code that just ran
    if (phase === 'stats') system?.ran('fl.workFunction', 'stats');
    if (phase === 'read') system?.ran('fl.workFunction', 'newton');
    if (phase === 'update') system?.ran('fl.newtonUpdate', step.converged ? 'converged' : 'step');
  }

  function counters() {
    $('out').textContent = count(totals.out);
    $('back').textContent = count(totals.back);
    $('jobs').textContent = `${totals.jobs} ${totals.jobs === 1 ? 'job' : 'jobs'}`;
  }

  async function animate(step) {
    const { phase } = step;
    const moving = active();
    const packets = phase === 'send' || phase === 'return' || phase === 'stats';
    for (const m of moving) {
      m.packet.hidden = !packets;
      m.packet.dataset.up = String(phase !== 'send');
      m.packet.textContent = step.numbersEach ?? '';
    }
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    if (reduced.matches) {
      if (packets) for (const m of moving) placePacket(m, 0.7);
      if (playing) await wait(1100);
      return;
    }
    await tween(DURATION[phase], (t) => {
      if (packets) for (const m of moving) placePacket(m, phase === 'send' ? ease(t) : 1 - ease(t) * 0.97);
      if (phase === 'read') for (const m of moving) drawDots(m, t);
    });
    for (const m of moving) {
      if (phase === 'read') drawDots(m);
      m.packet.hidden = true;
    }
  }

  async function step() {
    if (busy) return;
    busy = true;
    const mine = generation;
    try {
      const next = await call('advance');
      if (mine !== generation) return;
      finished = Boolean(next.done);
      show(next);
      await animate(next);
      if (finished && mine === generation) setPlaying(false);
    } finally {
      busy = false;
    }
  }

  function setPlaying(value) {
    playing = value;
    run.textContent = value ? 'Pause' : finished ? 'Run again' : 'Run';
  }

  async function play() {
    if (playing) return;
    if (finished) await reset();
    setPlaying(true);
    while (playing) {
      if (busy) await wait(60);
      else await step();
    }
  }

  async function reset() {
    generation++;
    finished = false;
    setPlaying(false);
    totals = { out: 0, back: 0, jobs: 0 };
    counters();
    await call('reset', { sites: active().map((m) => m.name) });
    $('chip').textContent = 'Ready';
    for (const li of $('steps').children) li.removeAttribute('aria-current');
    const rows = active().reduce((sum, m) => sum + m.rows, 0);
    say.ariaLive = 'polite';
    say.textContent = `${active().length} machines, ${count(rows)} rows. Press Run to train one model without moving any of them.`;
    $('match').textContent = '';
    delete demo.dataset.phase;
    for (const m of machines) {
      m.packet.hidden = true;
      m.status.textContent = m.on ? 'ready' : 'left out';
      m.button.setAttribute('aria-label', `${m.full}, ${count(m.rows)} rows, ${m.on ? 'taking part' : 'left out'}`);
    }
    setWeights(null);
    together(null);
    layout();
  }

  // ── Wiring ──
  let touched = false;
  run.addEventListener('click', () => { touched = true; if (playing) setPlaying(false); else play(); });
  $('step').addEventListener('click', async () => {
    touched = true;
    setPlaying(false);
    if (finished) await reset();
    step();
  });
  $('reset').addEventListener('click', () => { touched = true; reset(); });
  for (const m of machines) {
    m.button.addEventListener('click', () => {
      touched = true;
      if (m.on && active().length === 2) {
        say.ariaLive = 'polite';
        say.textContent = 'Training needs at least two machines.';
        return;
      }
      m.on = !m.on;
      m.button.setAttribute('aria-pressed', String(m.on));
      reset();
    });
  }
  for (const b of demo.querySelectorAll('.fl-foot button')) b.disabled = false;

  new ResizeObserver(layout).observe(stage);
  document.fonts?.ready.then(layout);
  await reset();

  // the machines start training the first time they're on screen; leaving pauses
  new IntersectionObserver(([entry]) => {
    if (entry.intersectionRatio >= 0.5) {
      if (!touched && !reduced.matches && !demo.querySelector('[data-panel="try"]').hidden) { touched = true; play(); }
    } else if (!entry.isIntersecting) setPlaying(false);
  }, { threshold: [0, 0.5] }).observe(stage);
  demo.addEventListener('demo:tab', (e) => {
    if (e.detail !== 'try' && !demo.hasAttribute('data-split')) setPlaying(false);
    else requestAnimationFrame(layout);
  });
}
