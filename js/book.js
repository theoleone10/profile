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
        book.replaceChildren(...pages);
        curPage = Math.max(0, 2 * cur - 1);
        requestAnimationFrame(() => scrollToPage(curPage, false));
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

  function scrollToPage(i, animate) {
    book.scrollTo({ left: pages[i].offsetLeft - 12, behavior: animate && !reduced && !document.hidden ? 'smooth' : 'auto' });
  }

  function visiblePages() {
    return mode === 'spread' ? [L(cur), R(cur)].filter(Boolean) : [pages[curPage]];
  }

  function announce(source) {
    const vis = visiblePages();
    pages.forEach((p) => { p.inert = mode === 'spread' && !vis.includes(p); });
    document.body.dataset.tone = vis[vis.length - 1].dataset.tone;
    document.querySelectorAll('.nav-tabs [data-go]').forEach((b) => {
      const on = Number(b.dataset.go) === cur;
      b.classList.toggle('on', on);
      if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
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
      curPage = Math.max(0, 2 * spread - 1);
      cur = spread;
      scrollToPage(curPage, true);
    } else {
      if (spread === cur) return;
      turn(spread);
    }
    announce(source);
  }
  function step(dir, source = 'user') {
    if (mode === 'linear') {
      const i = curPage + dir;
      if (i < 0 || i >= pages.length) return;
      curPage = i;
      cur = Math.floor((i + 1) / 2);
      scrollToPage(curPage, true);
      announce(source);
    } else go(cur + dir, source);
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
    if (g) { e.preventDefault(); go(Number(g.dataset.go)); return; }
    // the closed paper opens when you click its cover
    if (cur === 0 && e.target.closest('.cover') && !e.target.closest('a, button, input')) next();
  });
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable], [role="tablist"], .wp-role, .cseg, .pb-seg')) return;
    if (performance.now() < busyUntil) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
  });
  let raf = 0;
  book.addEventListener('scroll', () => {
    if (mode !== 'linear') return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const i = Math.round(book.scrollLeft / (pages[0].offsetWidth + 12));
      if (i !== curPage && i >= 0 && i < pages.length) { curPage = i; cur = Math.floor((i + 1) / 2); announce('user'); }
    });
  }, { passive: true });
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
