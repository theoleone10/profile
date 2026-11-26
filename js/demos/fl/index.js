// Federated learning on DCP as one diagram: the shared model drawn as the single
// neuron it is, the DCP scheduler, and five machines that each keep their own
// data. The training runs in a Web Worker (./worker.js); this module draws it.
const DATA = new URL('../../../data/brfss.json', import.meta.url).href;
const NAMES = {
  alaska: ['Alaska', 'AK'], florida: ['Florida', 'FL'], minnesota: ['Minnesota', 'MN'],
  'new-york': ['New York', 'NY'], washington: ['Washington', 'WA'],
};
const FEATURES = ['Age', 'Female', 'BMI', 'Smoker', 'Ex-smoker', 'Exercise', 'Diabetes', 'Health', 'Education', 'Income'];
const SHOWN = [0, 2, 7, 1]; // the weights drawn on each machine's small copy
const DURATION = { send: 1400, read: 1500, return: 1400, update: 1300 };
const STEP_OF = { send: 'send', read: 'read', return: 'return', update: 'return' }; // which of the three points
const PACKETS = 3;

const svg = (name, attrs = {}, parent) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent?.append(node);
  return node;
};
const set = (node, attrs) => { for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); };

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

// draws the diagram into `stage` and returns what the animation needs to move
function createDiagram(stage, sites) {
  const root = svg('svg', { role: 'img', 'aria-label': 'A shared model, drawn as ten inputs joined to one output, is sent through the DCP scheduler to five machines. Each machine trains on its own data and returns only an update.' }, stage);
  const layer = (name) => svg('g', { class: name }, root);
  const wires = layer('fl-wires');
  const dots = layer('fl-packets');
  const model = layer('fl-model');
  const hub = layer('fl-hub');
  const clients = layer('fl-clients');

  const trunk = svg('path', {}, wires);
  const edges = FEATURES.map(() => svg('line', { class: 'fl-edge' }, model));
  const inputs = FEATURES.map((name) => {
    const text = svg('text', { class: 'fl-feature', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, model);
    text.textContent = name;
    return { text, dot: svg('circle', { class: 'fl-neuron', r: 5 }, model) };
  });
  const output = svg('circle', { class: 'fl-output', r: 22 }, model);
  const sigma = svg('text', { class: 'fl-sigma', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, model);
  sigma.textContent = 'σ';
  const risk = svg('text', { class: 'fl-feature', 'text-anchor': 'middle' }, model);
  risk.textContent = 'arthritis risk';

  const pill = svg('rect', { rx: 18, height: 36, width: 168 }, hub);
  const pillText = svg('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' }, hub);
  pillText.textContent = 'DCP scheduler';

  const machines = sites.map((site) => {
    const group = svg('g', { class: 'fl-machine' }, clients);
    const lines = SHOWN.map(() => svg('line', { class: 'fl-edge' }, group));
    const nodes = SHOWN.map(() => svg('circle', { class: 'fl-neuron', r: 2.5 }, group));
    const out = svg('circle', { class: 'fl-output', r: 6 }, group);
    // a few of the machine's own rows: more dots for more data
    const count = Math.min(21, Math.max(4, Math.round(Math.sqrt(site.rows) / 2.6)));
    const data = Array.from({ length: count }, (_, i) => svg('circle', { class: site.labels[i] ? 'fl-row yes' : 'fl-row' }, group));
    const name = svg('text', { class: 'fl-name', 'text-anchor': 'middle' }, group);
    const wire = svg('path', {}, wires);
    const route = svg('path'); // the whole way from the model to this machine
    const packets = Array.from({ length: PACKETS }, () => svg('circle', { r: 4 }, dots));
    return { full: NAMES[site.name][0], short: NAMES[site.name][1], lines, nodes, out, data, name, wire, route, packets };
  });

  function layout() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (!W || !H) return;
    const small = W < 480;
    set(root, { viewBox: `0 0 ${W} ${H}` });

    // the shared model
    const left = small ? W * 0.34 : W * 0.33;
    const right = small ? W * 0.76 : W * 0.72;
    const top = 24;
    const gap = Math.max(14, (H * 0.43 - top) / 9);
    const middle = top + gap * 4.5;
    inputs.forEach(({ text, dot }, i) => {
      const y = top + gap * i;
      set(dot, { cx: left, cy: y });
      set(text, { x: left - 14, y });
      set(edges[i], { x1: left, y1: y, x2: right, y2: middle });
    });
    set(output, { cx: right, cy: middle });
    set(sigma, { x: right, y: middle });
    set(risk, { x: right, y: middle + 42 });

    // the scheduler
    const hubY = H * 0.575;
    set(pill, { x: W / 2 - 84, y: hubY - 18 });
    set(pillText, { x: W / 2, y: hubY });
    const down = `M${right} ${middle + 48}C${right} ${hubY - 40} ${W / 2} ${hubY - 56} ${W / 2} ${hubY - 18}`;
    set(trunk, { d: down });

    // the machines
    const space = small ? 6 : 16;
    const bw = Math.min(96, (W - 24 - space * 4) / 5);
    const bh = Math.min(118, H * 0.21);
    const boxTop = H - bh - 28;
    const start = (W - bw * 5 - space * 4) / 2;
    machines.forEach((m, k) => {
      const x = start + k * (bw + space);
      const cx = x + bw / 2;
      const from = W / 2 + (k - 2) * 22;
      const bend = (boxTop - hubY - 18) * 0.6;
      const branch = `C${from} ${hubY + 18 + bend} ${cx} ${boxTop - bend} ${cx} ${boxTop}`;
      set(m.wire, { d: `M${from} ${hubY + 18}${branch}` });
      set(m.route, { d: `${down}L${from} ${hubY + 18}${branch}` });
      const netTop = boxTop + 12;
      const netGap = (bh * 0.42) / 3;
      const netY = netTop + netGap * 1.5;
      m.nodes.forEach((node, i) => {
        set(node, { cx: x + bw * 0.24, cy: netTop + netGap * i });
        set(m.lines[i], { x1: x + bw * 0.24, y1: netTop + netGap * i, x2: x + bw * 0.74, y2: netY });
      });
      set(m.out, { cx: x + bw * 0.74, cy: netY });
      const cell = Math.min(10, (bw - 10) / 7);
      const dataTop = boxTop + bh * 0.66;
      const perRow = 7;
      m.data.forEach((dot, i) => set(dot, { cx: cx + ((i % perRow) - (perRow - 1) / 2) * cell, cy: dataTop + Math.floor(i / perRow) * cell, r: cell * 0.3 }));
      set(m.name, { x: cx, y: boxTop + bh + 19 });
      m.name.textContent = small ? m.short : m.full;
    });
  }

  // draw a set of weights on a list of edges
  function paint(lines, weights) {
    lines.forEach((line, i) => {
      const w = weights?.[i] ?? 0;
      const size = Math.min(1, Math.abs(w));
      line.style.strokeWidth = `${1 + size * 6}`;
      line.style.opacity = `${weights ? 0.22 + size * 0.78 : 0.22}`;
      line.toggleAttribute('data-down', w < 0);
    });
  }

  return {
    machines,
    layout,
    // beta[0] is the intercept; the rest follow FEATURES
    showModel(beta) { paint(edges, beta?.slice(1)); },
    showCopies(beta) { for (const m of machines) paint(m.lines, beta && SHOWN.map((j) => beta[j + 1])); },
    // packets travel the routes: 0 at the model, 1 at the machine
    movePackets(t, up) {
      for (const m of machines) {
        const length = m.route.getTotalLength();
        m.packets.forEach((dot, i) => {
          const along = t * (1 + (PACKETS - 1) * 0.12) - i * 0.12;
          const on = along >= 0 && along <= 1;
          dot.style.opacity = on ? `${1 - i * 0.28}` : '0';
          if (!on) return;
          const p = m.route.getPointAtLength(length * (up ? 1 - along : along));
          set(dot, { cx: p.x, cy: p.y });
          dot.toggleAttribute('data-up', up);
        });
      }
    },
    hidePackets() { for (const m of machines) for (const dot of m.packets) dot.style.opacity = '0'; },
    // a wave through each machine's own rows while it trains
    sweep(t) {
      for (const m of machines) {
        m.data.forEach((dot, i) => {
          const at = (i / m.data.length) * 0.8;
          dot.style.opacity = t === null || Math.abs((t * 2) % 1 - at) < 0.18 ? '1' : '0.3';
        });
      }
    },
  };
}

export async function mount(demo, system) {
  const $ = (name) => demo.querySelector(`[data-fl="${name}"]`);
  const stage = $('stage');
  const status = $('status');
  const play = $('play');
  const points = [...demo.closest('.hour').querySelectorAll('[data-step]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const call = connect();

  let sites;
  try {
    ({ sites } = await call('load', { url: DATA }));
  } catch {
    status.textContent = 'The demo couldn’t load its data. The code tab still works.';
    status.classList.remove('vh');
    return;
  }
  const diagram = createDiagram(stage, sites);

  let playing = false;
  let wanted = null; // what the visitor last asked for: null until they choose
  let visible = false;
  let finished = false;
  let queue = Promise.resolve(); // steps run one after another
  let generation = 0;            // bumped to cut short whatever is animating

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const tween = (ms, frame) => new Promise((resolve) => {
    const mine = generation;
    const start = performance.now();
    const tick = (now) => {
      const t = mine === generation ? Math.min(1, Math.max(0, (now - start) / ms)) : 1;
      frame(t);
      if (t < 1) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });

  function mark(phase) {
    demo.dataset.phase = phase ?? '';
    for (const li of points) {
      if (li.dataset.step === STEP_OF[phase]) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    }
  }

  async function reset() {
    await call('reset');
    finished = false;
    mark(null);
    status.textContent = 'Ready';
    diagram.showModel(null);
    diagram.showCopies(null);
    diagram.hidePackets();
    diagram.sweep(null);
  }

  // take the next step of the protocol, and show it unless asked to skip
  async function advance({ animate = true } = {}) {
    const step = await call('advance');
    const { phase } = step;
    if (phase === 'stats') {
      system.ran('fl.workFunction', 'stats');
      return advance({ animate });
    }
    finished = Boolean(step.done);
    mark(phase);
    status.textContent = step.done ? `Trained in ${step.round} rounds` : `Round ${step.round}`;
    if (phase === 'read') system.ran('fl.workFunction', 'newton');
    if (phase === 'update') system.ran('fl.newtonUpdate', step.path);
    if (phase === 'update') diagram.showModel(step.beta);

    const moving = animate && !reduced.matches;
    if (phase === 'send' || phase === 'return') {
      if (moving) await tween(DURATION[phase], (t) => diagram.movePackets(t, phase === 'return'));
      diagram.hidePackets();
      if (phase === 'send') diagram.showCopies(step.beta);
    } else if (phase === 'read') {
      if (moving) await tween(DURATION.read, (t) => diagram.sweep(t));
      diagram.sweep(null);
    } else if (moving) {
      await wait(DURATION.update);
    }
    if (animate && reduced.matches && playing) await wait(1200);
    return step;
  }

  const enqueue = (job) => (queue = queue.then(job).catch((error) => console.error(error)));

  // runs, rests on the trained model, and starts over, until paused
  let looping = false;
  async function loop() {
    if (looping) return;
    looping = true;
    while (playing) {
      await enqueue(async () => {
        if (!playing) return;
        if (finished) await reset();
        await advance();
      });
      if (finished && playing) await wait(3500);
    }
    looping = false;
  }

  function setPlaying(value) {
    playing = value;
    play.setAttribute('aria-label', value ? 'Pause training' : 'Play training');
    play.toggleAttribute('data-playing', value);
    if (value) loop();
  }

  const sync = () => {
    const onScreen = visible && !demo.querySelector('[data-panel="try"]').hidden;
    setPlaying(onScreen && (wanted ?? !reduced.matches));
  };

  play.addEventListener('click', () => {
    wanted = !playing;
    setPlaying(wanted);
  });

  // press one of the three points to see that step
  for (const li of points) {
    li.querySelector('button').addEventListener('click', () => {
      wanted = false;
      setPlaying(false);
      generation++;
      enqueue(async () => {
        if (finished) await reset();
        const target = li.dataset.step;
        let step = await call('advance');
        while (step.phase !== target) {
          if (step.beta && step.phase === 'update') diagram.showModel(step.beta);
          if (step.done) await call('reset');
          step = await call('advance');
        }
        await show(step);
        if (target === 'return') await advance(); // combining happens as the updates arrive
      });
    });
  }

  // show one step that has already been taken
  async function show(step) {
    const { phase } = step;
    mark(phase);
    status.textContent = `Round ${step.round}`;
    if (phase === 'read') {
      system.ran('fl.workFunction', 'newton');
      if (!reduced.matches) await tween(DURATION.read, (t) => diagram.sweep(t));
      diagram.sweep(null);
    } else {
      if (!reduced.matches) await tween(DURATION[phase], (t) => diagram.movePackets(t, phase === 'return'));
      diagram.hidePackets();
      if (phase === 'send') diagram.showCopies(step.beta);
    }
  }

  new ResizeObserver(() => diagram.layout()).observe(stage);
  document.fonts?.ready.then(() => diagram.layout());
  await reset();
  diagram.layout();
  play.disabled = false;
  for (const li of points) li.querySelector('button').disabled = false;

  new IntersectionObserver(([entry]) => {
    if (entry.intersectionRatio >= 0.4) visible = true;
    else if (!entry.isIntersecting) visible = false;
    sync();
  }, { threshold: [0, 0.4] }).observe(stage);
  demo.addEventListener('demo:tab', () => requestAnimationFrame(() => { diagram.layout(); sync(); }));
  reduced.addEventListener('change', () => { wanted = null; sync(); });
}
