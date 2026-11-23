// The flip-through newspaper. Pages are written in reading order: the cover,
// then left/right pairs. On wide screens two slots show the open spread, and
// each turn builds one sheet whose front is the page you're leaving and whose
// back is the page you're going to; the destination is already waiting
// underneath. On narrow screens it's a swipeable strip. Pages never scroll:
// each is scaled to fit. window.Book exposes go/next/prev.
(() => {
  const book = document.getElementById('book');
  const desk = book.parentElement;
  const pages = [...book.querySelectorAll('.page')];   // [cover, L1, R1, L2, R2, …]
  const SPREADS = (pages.length + 1) / 2;               // spread 0 is the closed cover
  const IDS = ['cover', 'inside', 'paperboy', 'waypass', 'kaeru', 'fl', 'back'];
  const TURN_MS = 900;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const L = (s) => (s > 0 ? pages[2 * s - 1] : null);
  const R = (s) => pages[2 * s] ?? null;
  const div = (cls) => Object.assign(document.createElement('div'), { className: cls });

  // spread-mode furniture
  const slotL = div('slot slot-l');
  const slotR = div('slot slot-r');
  const store = div('store');
  const sheet = div('sheet');
  const front = div('face face-front');
  const back = div('face face-back');
  sheet.append(front, back);
  sheet.hidden = true;
  const ghosts = [0, 1].map(() => { const g = div('ghost'); g.append(document.createElement('i'), document.createElement('i')); g.hidden = true; return g; });

  let mode = null;   // 'spread' | 'linear'
  let cur = 0;       // current spread
  let curPage = 0;   // current page (linear mode)
  let finishTurn = null;
  let busyUntil = 0;

  // ── Layout ──
  // In spread mode every page is laid out at one fixed size and the whole book
  // is scaled as a unit, so type and spacing match from page to page.
  const DW = 640, DH = 840;
  function measure() {
    const w = desk.clientWidth, h = desk.clientHeight;
    const s = Math.min((h - 40) / DH, (w - 150) / (2 * DW), 1.2);
    return { s, spread: s >= 0.55 };
  }

  function layout() {
    const m = measure();
    const root = document.documentElement.style;
    root.setProperty('--pw', `${DW}px`);
    root.setProperty('--ph', `${DH}px`);
    root.setProperty('--s', m.s.toFixed(4));
    const want = m.spread ? 'spread' : 'linear';
    if (want !== mode) {
      finishTurn?.();
      mode = want;
      document.body.dataset.mode = mode;
      if (mode === 'spread') {
        book.className = 'book spread';
        store.append(...pages);
        book.replaceChildren(store, slotL, slotR, ...ghosts, sheet);
        settle();
      } else {
        book.className = 'book linear';
        store.append(...pages);
        book.replaceChildren(store, slotR, sheet);
        curPage = Math.max(0, 2 * cur - 1);
        settleSingle();
      }
      announce('layout');
    }
    fitAll();
  }

  // Put the current spread in the slots; everything else waits in the store
  function settle() {
    book.classList.toggle('closed', cur === 0);
    const want = [L(cur), R(cur)];
    pages.forEach((p) => { if (!want.includes(p) && p.parentElement !== store) store.append(p); });
    slotL.replaceChildren(...(L(cur) ? [L(cur)] : []));
    slotR.replaceChildren(...(R(cur) ? [R(cur)] : []));
  }

  // ── Turning ──
  function turn(target) {
    finishTurn?.();
    const from = cur;
    const fwd = target > from;
    const span = Math.abs(target - from);
    cur = target;

    if (reduced) { settle(); return; }

    // Under the sheet: the destination page on the side being uncovered
    if (fwd) {
      slotR.replaceChildren(...(R(target) ? [R(target)] : []));
      front.replaceChildren(R(from));
      back.replaceChildren(L(target));
      book.classList.remove('closed');
    } else {
      slotL.replaceChildren(...(L(target) ? [L(target)] : []));
      front.replaceChildren(R(target));
      back.replaceChildren(L(from));
      if (target === 0) book.classList.add('closed');
    }
    // Drive the turn frame by frame, so the face we show always matches the real
    // angle: the back of the sheet appears exactly as the sheet passes upright.
    const all = [sheet, ...ghosts.slice(0, Math.min(2, span - 1))];
    const LAG = 28; // a multi-page jump turns as one block, with blank edges riffling just behind it
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const angleAt = (t) => (fwd ? -180 * ease(t) : -180 * (1 - ease(t)));
    const paintAt = (elapsed) => {
      all.forEach((el, i) => {
        const t = Math.min(1, Math.max(0, (elapsed - i * LAG) / TURN_MS));
        const a = angleAt(t);
        el.style.transform = `rotateY(${a}deg)`;
        if (el === sheet) {
          sheet.classList.toggle('show-back', a < -90);
          sheet.style.setProperty('--shade', Math.sin(Math.PI * ease(t)).toFixed(3));
        }
      });
    };
    all.forEach((el) => { el.hidden = false; });
    paintAt(0);
    const t0 = performance.now();
    let raf = requestAnimationFrame(function frame(now) {
      const elapsed = now - t0;
      paintAt(elapsed);
      if (elapsed < TURN_MS + (all.length - 1) * LAG) raf = requestAnimationFrame(frame);
      else finishTurn();
    });
    // background tabs pause rAF; make sure the turn still completes
    const safety = setTimeout(() => finishTurn?.(), TURN_MS + 600);

    finishTurn = () => {
      cancelAnimationFrame(raf);
      clearTimeout(safety);
      finishTurn = null;
      [sheet, ...ghosts].forEach((el) => { el.hidden = true; el.style.transform = ''; });
      sheet.style.setProperty('--shade', 0);
      store.append(...front.children, ...back.children);
      settle();
      fitAll();
    };
    busyUntil = performance.now() + TURN_MS * 0.55;
  }

  // ── One page at a time (phones) ──
  // Still a paper: the page you're on turns over at the spine to show the next
  // one underneath, following your finger if you drag it.
  function settleSingle() {
    pages.forEach((p, i) => { if (i !== curPage && p.parentElement !== store) store.append(p); });
    slotR.replaceChildren(pages[curPage]);
    // the stack of pages still to come, along the edge
    book.style.setProperty('--ahead', Math.min(4, pages.length - 1 - curPage));
  }

  // set up a turn from curPage to target; returns the sheet's resting angles
  function prepareSingle(target) {
    const from = curPage;
    const fwd = target > from;
    if (fwd) {
      slotR.replaceChildren(pages[target]);
      front.replaceChildren(pages[from]);
    } else {
      front.replaceChildren(pages[target]);
    }
    back.replaceChildren();
    sheet.hidden = false;
    sheet.classList.remove('show-back');
    return { from, fwd, open: fwd ? 0 : -180, done: fwd ? -180 : 0 };
  }

  let single = null; // the turn in progress: { from, target, fwd, open, done, a, raf }
  const paintSingle = (a) => {
    sheet.style.transform = `rotateY(${a}deg)`;
    sheet.classList.toggle('show-back', a < -90);
    sheet.style.setProperty('--shade', Math.sin((Math.abs(a) / 180) * Math.PI).toFixed(3));
    single.a = a;
  };
  // animate the sheet to `to`; land on the new page, or put everything back
  function settleTurn(to, commit) {
    const t = single;
    cancelAnimationFrame(t.raf);
    const start = t.a, t0 = performance.now();
    const ms = reduced ? 0 : Math.max(180, (Math.abs(to - start) / 180) * 620);
    const ease = (x) => 1 - Math.pow(1 - x, 3);
    const end = () => {
      sheet.hidden = true;
      sheet.style.transform = '';
      sheet.style.setProperty('--shade', 0);
      store.append(...front.children);
      if (commit) curPage = t.target;
      single = null;
      settleSingle();
      fitAll();
      if (commit) { cur = Math.floor((curPage + 1) / 2); announce(t.source); }
    };
    if (!ms) return end();
    t.raf = requestAnimationFrame(function frame(now) {
      const k = Math.min(1, (now - t0) / ms);
      paintSingle(start + (to - start) * ease(k));
      if (k < 1) t.raf = requestAnimationFrame(frame); else end();
    });
  }
  function turnSingle(target, source) {
    if (single) settleTurn(single.done, true);
    if (single) return;
    if (target === curPage || target < 0 || target >= pages.length) return;
    single = { ...prepareSingle(target), target, source };
    paintSingle(single.open);
    settleTurn(single.done, true);
  }

  // drag a page over with a finger (or mouse)
  let drag = null;
  const NO_DRAG = 'input, select, textarea, canvas, pre, video, iframe, [role="slider"], .editor-files';
  book.addEventListener('pointerdown', (e) => {
    if (mode !== 'linear' || single || e.button > 0 || e.target.closest(NO_DRAG)) return;
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now(), on: false };
  });
  book.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      const target = curPage + (dx < 0 ? 1 : -1);
      if (target < 0 || target >= pages.length) { drag = null; return; }
      drag.on = true;
      book.setPointerCapture(e.pointerId);
      single = { ...prepareSingle(target), target, source: 'user' };
    }
    const w = book.clientWidth;
    const k = Math.min(1, Math.max(0, (single.fwd ? -dx : dx) / (w * 0.85)));
    paintSingle(single.fwd ? -180 * k : -180 * (1 - k));
    drag.v = dx / Math.max(1, performance.now() - drag.t);
  });
  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.on || !single) return;
    // the click that ends a drag isn't a tap on the page
    addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true });
    const progress = Math.abs(single.a - single.open) / 180;
    const flick = Math.abs(d.v || 0) > 0.5 && Math.sign(d.v) === (single.fwd ? -1 : 1);
    const commit = progress > 0.35 || flick;
    settleTurn(commit ? single.done : single.open, commit);
  };
  book.addEventListener('pointerup', release);
  book.addEventListener('pointercancel', release);

  function visiblePages() {
    return mode === 'spread' ? [L(cur), R(cur)].filter(Boolean) : [pages[curPage]];
  }

  let tint;
  const swatch = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  function announce(source) {
    const vis = visiblePages();
    pages.forEach((p) => { p.inert = !vis.includes(p); });
    document.body.dataset.tone = vis[vis.length - 1].dataset.tone;
    document.querySelectorAll('.nav-tabs [data-go], .contents [data-go]').forEach((b) => {
      const on = Number(b.dataset.go) === cur;
      b.classList.toggle('on', on);
      if (on && b.closest('.nav-tabs')) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    const last = vis[vis.length - 1];
    document.body.dataset.kind = last.classList.contains('page-demo') ? 'demo' : 'paper';
    // Safari tints its own bars to match the page
    clearTimeout(tint);
    tint = setTimeout(() => {
      const bar = getComputedStyle(document.querySelector(mode === 'linear' ? '.chrome-top' : 'body')).backgroundColor;
      // as plain rgb: the computed colour can be oklab(), which browsers' bars don't take
      swatch.fillStyle = '#000';
      swatch.fillStyle = bar;
      swatch.fillRect(0, 0, 1, 1);
      const [r, g, b] = swatch.getImageData(0, 0, 1, 1).data;
      document.querySelector('meta[name="theme-color"]').content = `rgb(${r}, ${g}, ${b})`;
    }, 950); // after the bar and desk finish fading
    document.getElementById('contents-at').textContent = `Page ${mode === 'linear' ? curPage + 1 : 2 * cur + (cur ? 0 : 1)} of ${pages.length}`;
    document.getElementById('nav-pages').textContent =
      mode === 'linear' ? `p. ${curPage + 1}` : cur === 0 ? 'p. 1' : `pp. ${2 * cur}–${2 * cur + 1}`;
    const atStart = mode === 'linear' ? curPage === 0 : cur === 0;
    const atEnd = mode === 'linear' ? curPage === pages.length - 1 : cur === SPREADS - 1;
    document.querySelectorAll('[data-turn]').forEach((b) => { b.disabled = b.dataset.turn === 'prev' ? atStart : atEnd; });
    history.replaceState(null, '', cur === 0 ? location.pathname + location.search : `#${IDS[cur]}`);
    document.dispatchEvent(new CustomEvent('spread', { detail: { spread: cur, pages: vis, source } }));
  }

  function go(spread, source = 'user') {
    spread = Math.max(0, Math.min(SPREADS - 1, spread));
    if (mode === 'linear') {
      turnSingle(Math.max(0, 2 * spread - 1), source);
      return;
    } else {
      if (spread === cur) return;
      turn(spread);
    }
    announce(source);
  }
  function step(dir, source = 'user') {
    if (mode === 'linear') turnSingle(curPage + dir, source);
    else go(cur + dir, source);
  }
  const next = (source) => step(1, source);
  const prev = (source) => step(-1, source);

  // ── Fit every page (and every phone screen) without scrolling ──
  const fitTargets = [...document.querySelectorAll('.page-in, .screen')];
  function fit(el) {
    el.style.setProperty('--fit', 1);
    if (!el.clientHeight || el.scrollHeight <= el.clientHeight + 1) return;
    let lo = 0.45, hi = 1;
    for (let i = 0; i < 7; i++) {
      const m = (lo + hi) / 2;
      el.style.setProperty('--fit', m);
      if (el.scrollHeight <= el.clientHeight + 1) lo = m; else hi = m;
    }
    el.style.setProperty('--fit', lo);
  }
  function fitAll() { fitTargets.forEach(fit); }
  const pending = new Set();
  const refit = (el) => {
    if (!pending.size) requestAnimationFrame(() => { pending.forEach(fit); pending.clear(); });
    pending.add(el);
  };
  fitTargets.forEach((el) => new MutationObserver(() => refit(el))
    .observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'] }));
  document.fonts?.ready.then(fitAll);

  // ── Input ──
  document.addEventListener('click', (e) => {
    const turnBtn = e.target.closest('[data-turn]');
    if (turnBtn) { e.preventDefault(); turnBtn.dataset.turn === 'next' ? next() : prev(); return; }
    const g = e.target.closest('[data-go]');
    if (g) {
      e.preventDefault();
      // a link can name an exact page for phones (Contact opens the letters page itself)
      if (mode === 'linear' && g.dataset.page) turnSingle(Number(g.dataset.page) - 1, 'user');
      else go(Number(g.dataset.go));
      return;
    }
    // the closed paper opens when you click its cover
    if ((mode === 'linear' ? curPage === 0 : cur === 0) && e.target.closest('.cover') && !e.target.closest('a, button, input')) { next(); return; }
    // phones: tap the outer edges of the page to turn it, as in Books
    if (mode === 'linear' && e.target.closest('#book') && !e.target.closest('a, button, input, label, canvas, pre, video, iframe, [role="slider"]')) {
      const r = book.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      if (x > 0.8) next(); else if (x < 0.2) prev();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable], [role="tablist"], .wp-role, .cseg, .pb-seg')) return;
    if (performance.now() < busyUntil) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
  });
  window.addEventListener('hashchange', () => {
    const i = IDS.indexOf(location.hash.slice(1));
    if (i >= 0 && i !== cur) go(i);
  });
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 120); });

  // ── Start ──
  const fromHash = IDS.indexOf(location.hash.slice(1));
  cur = fromHash > 0 ? fromHash : 0;
  curPage = Math.max(0, 2 * cur - 1);
  layout();

  window.Book = { go, next, prev, fitAll, get spread() { return cur; }, get mode() { return mode; } };
})();
