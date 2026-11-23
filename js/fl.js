// Federated learning demo: five clients each hold private 2-D points and train
// one logistic regression model together. Only model numbers leave a client.
(() => {
  // ── The math (shown in the Code tab) ──

  function sigmoid(z) {
    return 1 / (1 + Math.exp(-z));
  }

  // Gradient and Hessian of the log-loss on one client's data,
  // at the model w = [w1, w2, b].
  function gradHess(w, data) {
    const g = [0, 0, 0];
    const H = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const { x, y } of data) {
      const xt = [x[0], x[1], 1];
      const p = sigmoid(w[0] * xt[0] + w[1] * xt[1] + w[2]);
      for (let i = 0; i < 3; i++) {
        g[i] += (p - y) * xt[i];
        for (let j = 0; j < 3; j++) {
          H[i][j] += p * (1 - p) * xt[i] * xt[j];
        }
      }
    }
    return { g, H };
  }

  // A few epochs of gradient descent, run on the client. The data never leaves.
  function localTrain(w, data, epochs = 5, lr = 0.5) {
    let local = [...w];
    for (let e = 0; e < epochs; e++) {
      const { g } = gradHess(local, data);
      local = local.map((wi, i) => wi - (lr * g[i]) / data.length);
    }
    return local;
  }

  // FedAvg: every client trains locally from the global model, then
  // the server averages the returned weights, weighted by how many
  // points each client has.
  function fedAvgRound(global, clients) {
    const updates = clients.map((c) => ({
      w: localTrain(global, c.data),
      n: c.data.length,
    }));
    const total = updates.reduce((s, u) => s + u.n, 0);
    const w = [0, 1, 2].map(
      (i) => updates.reduce((s, u) => s + u.w[i] * u.n, 0) / total
    );
    // each client sends 3 weights and a count
    return { w, locals: updates.map((u) => u.w), sentPerClient: 3 + 1 };
  }

  // Newton-style: clients send their gradient and Hessian at the
  // global model. The server sums them and takes one Newton step:
  // w ← w − (H + λI)⁻¹ g.
  function newtonRound(global, clients, ridge = 1e-3) {
    const parts = clients.map((c) => gradHess(global, c.data));
    const sum = (f) => parts.reduce((s, p) => s + f(p), 0);
    const g = [0, 1, 2].map((i) => sum((p) => p.g[i]));
    const H = [0, 1, 2].map((i) => [0, 1, 2].map(
      (j) => sum((p) => p.H[i][j]) + (i === j ? ridge : 0)
    ));
    const step = solve3(H, g);
    const w = global.map((wi, i) => wi - step[i]);
    // a gradient (3) and a symmetric Hessian (6)
    return { w, locals: [], sentPerClient: 3 + 6 };
  }

  // ── Helpers ──

  function solve3(A, b) {
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < 3; c++) {
      let p = c;
      for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < 3; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
      }
    }
    return [0, 1, 2].map((i) => M[i][3] / M[i][i]);
  }

  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const N_CLIENTS = 5;
  const PER_CLIENT = 36;
  const MAX_ROUNDS = 30;

  function makeClients(split) {
    const rand = rng(7);
    const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
    const point = (y, shift = 0) => ({
      x: y ? [0.9 + gauss() + shift, 0.7 + gauss()] : [-0.7 + gauss() + shift, -0.9 + gauss()],
      y,
    });
    if (split === 'iid') {
      const all = Array.from({ length: N_CLIENTS * PER_CLIENT }, (_, i) => point(i % 2));
      for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
      return Array.from({ length: N_CLIENTS }, (_, k) => ({ data: all.slice(k * PER_CLIENT, (k + 1) * PER_CLIENT) }));
    }
    // Skewed: each client sees mostly one class, and its points sit in a different region
    const ratio = [0.9, 0.75, 0.5, 0.25, 0.1];
    return ratio.map((r, k) => ({
      data: Array.from({ length: PER_CLIENT }, (_, i) => point(i < r * PER_CLIENT ? 1 : 0, (k - 2) * 0.5)),
    }));
  }

  // ── State ──
  const $ = (id) => document.getElementById(id);
  const canvas = $('fl-canvas');
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CLIENT = Array(5).fill('#d9e6e1'); // one ink for every client; only the global model is accented
  const C = { grid: '#1b302b', text: '#93aaa3', line: '#2b413c', accent: '#7fd8c3', white: '#ffffff' };
  let method = 'fedavg';
  let split = 'iid';
  let clients, w, locals, round, sent, history, timer, anim;

  function reset() {
    stop();
    clients = makeClients(split);
    w = [0, 0, 0];
    locals = [];
    round = 0;
    sent = 0;
    history = [];
    cancelAnimationFrame(anim);
    stats();
    draw();
  }

  function accuracy(model) {
    let ok = 0, n = 0;
    for (const c of clients) for (const { x, y } of c.data) {
      ok += (sigmoid(model[0] * x[0] + model[1] * x[1] + model[2]) >= 0.5) === (y === 1);
      n++;
    }
    return ok / n;
  }

  function step() {
    if (round >= MAX_ROUNDS) return stop();
    const r = method === 'fedavg' ? fedAvgRound(w, clients) : newtonRound(w, clients);
    w = r.w;
    locals = r.locals;
    round++;
    sent += N_CLIENTS * (r.sentPerClient + 3); // up: the update; down: the new global model
    history.push(accuracy(w));
    stats();
    if (reduced) draw(); else animate();
  }

  function run() {
    if (timer) return stop();
    if (round >= MAX_ROUNDS) reset();
    $('fl-run').innerHTML = '&#10074;&#10074; Pause';
    step();
    timer = setInterval(step, 1100);
  }
  function stop() {
    clearInterval(timer);
    timer = null;
    $('fl-run').innerHTML = '&#9654; Run';
  }

  function stats() {
    $('fl-round').textContent = `round ${round} / ${MAX_ROUNDS}`;
    $('fl-acc').textContent = round ? `${(history[history.length - 1] * 100).toFixed(1)}%` : '–';
    $('fl-sent').textContent = sent.toLocaleString();
    const pts = history.map((a, i) => `${(i / (MAX_ROUNDS - 1)) * 120},${28 - (a - 0.5) * 2 * 26}`).join(' ');
    $('fl-spark').innerHTML = history.length ? `<polyline points="${pts}"/>` : '';
  }

  // ── Drawing ──
  let W = 0, H = 0;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function layout() {
    const stacked = W < 460;
    // stacked (narrow): the server and clients keep a fixed-height strip under the plot
    const strip = 76;
    const plot = stacked ? { x: 0, y: 0, w: W, h: H - strip } : { x: 0, y: 0, w: W * 0.62, h: H };
    const net = stacked ? { x: 0, y: H - strip, w: W, h: strip } : { x: W * 0.62, y: 0, w: W * 0.38, h: H };
    const server = { x: net.x + net.w / 2, y: net.y + (stacked ? 16 : net.h * 0.2) };
    const nodes = Array.from({ length: N_CLIENTS }, (_, k) => ({
      x: net.x + net.w * ((k + 0.5) / N_CLIENTS),
      y: net.y + (stacked ? net.h - 18 : net.h * 0.76),
    }));
    return { plot, net, server, nodes, stacked };
  }

  function draw(t = null) {
    if (!W) return;
    const { plot, net, server, nodes, stacked } = layout();
    ctx.clearRect(0, 0, W, H);

    // Scatter in data space [-3.5, 3.5]²
    const pad = 12;
    const side = Math.min(plot.w, plot.h) - pad * 2;
    const ox = plot.x + (plot.w - side) / 2, oy = plot.y + (plot.h - side) / 2;
    const sx = (v) => ox + ((v + 3.5) / 7) * side;
    const sy = (v) => oy + side - ((v + 3.5) / 7) * side;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, side, side);
    ctx.clip();
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    for (let g = -3; g <= 3; g++) {
      ctx.beginPath(); ctx.moveTo(sx(g), oy); ctx.lineTo(sx(g), oy + side); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, sy(g)); ctx.lineTo(ox + side, sy(g)); ctx.stroke();
    }

    const linePts = (m) => {
      if (Math.abs(m[0]) + Math.abs(m[1]) < 1e-6) return null;
      if (Math.abs(m[1]) > Math.abs(m[0])) return [[-3.5, (-m[2] + m[0] * 3.5) / m[1]], [3.5, (-m[2] - m[0] * 3.5) / m[1]]];
      return [[(-m[2] + m[1] * 3.5) / m[0], -3.5], [(-m[2] - m[1] * 3.5) / m[0], 3.5]];
    };
    // Shade the side the global model calls "filled"
    const gl = linePts(w);
    if (gl) {
      const [[ax, ay], [bx, by]] = gl;
      const far = 50;
      const nx = w[0], ny = w[1], nl = Math.hypot(nx, ny);
      ctx.fillStyle = 'rgba(127, 216, 195, 0.07)';
      ctx.beginPath();
      ctx.moveTo(sx(ax), sy(ay)); ctx.lineTo(sx(bx), sy(by));
      ctx.lineTo(sx(bx + (nx / nl) * far), sy(by + (ny / nl) * far));
      ctx.lineTo(sx(ax + (nx / nl) * far), sy(ay + (ny / nl) * far));
      ctx.fill();
    }
    const stroke = (m, color, width, dash = []) => {
      const p = linePts(m);
      if (!p) return;
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(sx(p[0][0]), sy(p[0][1])); ctx.lineTo(sx(p[1][0]), sy(p[1][1])); ctx.stroke();
      ctx.setLineDash([]);
    };
    locals.forEach((m) => stroke(m, 'rgba(217, 230, 225, 0.35)', 1, [4, 4]));

    clients.forEach((c, k) => {
      for (const { x, y } of c.data) {
        ctx.beginPath();
        ctx.arc(sx(x[0]), sy(x[1]), 3.2, 0, Math.PI * 2);
        if (y) { ctx.fillStyle = CLIENT[k]; ctx.fill(); }
        else { ctx.strokeStyle = CLIENT[k]; ctx.lineWidth = 1.3; ctx.stroke(); }
      }
    });
    stroke(w, C.accent, 2.6);
    ctx.restore();

    // Network
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    nodes.forEach((n) => { ctx.beginPath(); ctx.moveTo(server.x, server.y); ctx.lineTo(n.x, n.y); ctx.stroke(); });
    ctx.font = 'italic 13px Newsreader, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pill = (x, y, w2, h2, fill, text, textColor) => {
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.roundRect(x - w2 / 2, y - h2 / 2, w2, h2, h2 / 2); ctx.fill();
      ctx.fillStyle = textColor; ctx.fillText(text, x, y + 0.5);
    };
    pill(server.x, server.y, 66, 22, C.accent, 'server', '#0f1e1b');
    const nw = Math.min(42, net.w / N_CLIENTS - 6);
    nodes.forEach((n, k) => pill(n.x, n.y, nw, 20, '#2b3f3a', `C${k + 1}`, '#d9e6e1'));
    if (!stacked) {
      ctx.fillStyle = C.text;
      ctx.font = 'italic 12px Newsreader, Georgia, serif';
      ctx.fillText('data stays on each client', net.x + net.w / 2, nodes[0].y + 24);
    }

    // Packets: each client's update travels up, the new model travels back down
    if (t !== null) {
      const up = t < 0.5;
      const f = up ? t / 0.5 : (t - 0.5) / 0.5;
      const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
      nodes.forEach((n, k) => {
        const a = up ? n : server, b = up ? server : n;
        ctx.fillStyle = up ? C.white : C.accent;
        ctx.beginPath();
        ctx.arc(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  function animate() {
    cancelAnimationFrame(anim);
    const start = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - start) / 900);
      draw(t);
      if (t < 1) anim = requestAnimationFrame(frame); else draw();
    };
    anim = requestAnimationFrame(frame);
  }

  // ── Wiring ──
  $('fl-run').addEventListener('click', run);
  $('fl-step').addEventListener('click', () => { stop(); if (round >= MAX_ROUNDS) reset(); step(); });
  $('fl-reset').addEventListener('click', reset);
  document.querySelectorAll('[data-method]').forEach((b) => b.addEventListener('click', () => {
    method = b.dataset.method;
    document.querySelectorAll('[data-method]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    reset();
  }));
  document.querySelectorAll('[data-split]').forEach((b) => b.addEventListener('click', () => {
    split = b.dataset.split;
    document.querySelectorAll('[data-split]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    reset();
  }));

  // Pause when the page turns away or another tab is shown
  document.addEventListener('spread', (e) => {
    if (!e.detail.pages.some((p) => p.contains(canvas))) stop();
    else requestAnimationFrame(resize);
  });
  canvas.closest('[data-tabs]').addEventListener('tabchange', (e) => {
    if (e.detail !== 'fl-try') stop(); else requestAnimationFrame(resize);
  });
  new ResizeObserver(resize).observe(canvas);

  // The Code tab shows these exact functions
  // The Code tab shows these functions as they run on this page, one per file tab
  const editor = $('fl-source').closest('.editor');
  editor.replaceChildren(...[fedAvgRound, newtonRound, gradHess, localTrain].flatMap((f) => {
    const tab = Object.assign(document.createElement('div'), { className: 'editor-tab mono', textContent: `${f.name}()` });
    const pre = document.createElement('pre');
    pre.append(Object.assign(document.createElement('code'), { textContent: f.toString().replace(/\n {2}/g, '\n') }));
    return [tab, pre];
  }));
  window.editorTabs?.(editor);

  reset();
})();
