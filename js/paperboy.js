// Paperboy's player screen, playing a real episode about this paper. The audio
// and the exact start of each chapter come from Paperboy's own pipeline
// (tools/make-edition.mts writes audio/edition.mp3 and audio/chapters.json).
// Controls follow components/player/EpisodePlayer.tsx: 1x to 2x, 15s skips,
// tap or drag the bar to seek, tap a chapter to hear it from the start.
(() => {
  const $ = (id) => document.getElementById(id);
  const audio = $('pb-audio');
  const play = $('pb-play');
  const scrub = $('pb-scrub');
  const fill = $('pb-fill');
  const list = $('pb-chapters');
  const transcript = $('pb-transcript');
  const RATES = [1, 1.25, 1.5, 2];
  const WPM = 195; // chatgptDigest.ts

  // how each section shows up in "What's inside"
  const ROWS = {
    front: { title: 'Welcome & Preview', sub: 'Intro', icon: 'sun' },
    paperboy: { title: 'The App Reading This', sub: 'Paperboy', img: 'img/paperboy-icon.png' },
    waypass: { title: 'Cremations Without Paper', sub: 'Waypass', img: 'img/waypass.png', wide: true },
    kaeru: { title: 'Grammar, N5 to N1', sub: 'Kaeru', img: 'img/kaeru-icon.png' },
    fl: { title: 'Training Where Data Lives', sub: 'QMIND × Distributive', letter: 'Q' },
    back: { title: 'One Thing To Remember', sub: 'To wrap up', icon: 'bulb' },
  };
  const ICONS = {
    sun: '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="3"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3"/></g></svg>',
    bulb: '<svg width="13" height="16" viewBox="0 0 13 16" fill="currentColor"><path d="M6.5 0A5.5 5.5 0 0 0 3.2 9.9c.5.4.8 1 .8 1.6V12h5v-.5c0-.6.3-1.2.8-1.6A5.5 5.5 0 0 0 6.5 0z"/><rect x="4" y="13" width="5" height="1.4" rx=".7"/><rect x="4.8" y="14.8" width="3.4" height="1.2" rx=".6"/></svg>',
    wave: '<svg width="16" height="14" viewBox="0 0 16 14" fill="currentColor"><rect x="0" y="5" width="2" height="4" rx="1"/><rect x="3.5" y="2" width="2" height="10" rx="1"/><rect x="7" y="0" width="2" height="14" rx="1"/><rect x="10.5" y="3" width="2" height="8" rx="1"/><rect x="14" y="5.5" width="2" height="3" rx="1"/></svg>',
  };

  let chapters = [];
  let duration = 0;
  let current = -1;
  let rate = 1;
  let ready = false;

  const fmt = (sec) => {
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const el = (tag, cls, html) => Object.assign(document.createElement(tag), { className: cls || '', innerHTML: html || '' });

  function build(data, texts) {
    chapters = data.chapters.map((c) => ({ ...c, ...ROWS[c.id], text: c.text ?? texts[c.id] ?? '' }));
    duration = data.durationSeconds;
    $('pb-left').textContent = `-${fmt(duration)}`;
    $('pb-meta').textContent = `${fmt(duration)} · ${data.voice ?? 'Ashley'}`;
    document.querySelectorAll('[data-listen-dur]').forEach((n) => { n.textContent = fmt(duration); });
    list.replaceChildren(...chapters.map((c, i) => {
      const li = el('li');
      const b = el('button', '');
      b.type = 'button';
      const mark = c.img ? el('img', c.wide ? 'logo wide' : 'logo') : el('span', c.letter ? 'logo letter' : 'sym', c.letter ?? ICONS[c.icon]);
      if (c.img) { mark.src = c.img; mark.alt = ''; }
      const text = el('span', 'txt');
      text.append(el('b', '', c.title), el('small', '', c.sub));
      b.append(mark, text, el('span', 't', fmt(c.start)));
      b.setAttribute('aria-label', `${c.title}, at ${fmt(c.start)}. Plays from here.`);
      b.addEventListener('click', () => playFrom(c.start));
      li.append(b);
      return li;
    }));
    show(0);
  }

  function show(t) {
    let i = 0;
    chapters.forEach((c, k) => { if (t >= c.start) i = k; });
    fill.style.width = `${duration ? Math.min(100, (t / duration) * 100) : 0}%`;
    scrub.setAttribute('aria-valuenow', String(Math.round(duration ? (t / duration) * 100 : 0)));
    $('pb-pos').textContent = fmt(t);
    $('pb-left').textContent = `-${fmt(duration - t)}`;
    if (i !== current) {
      current = i;
      transcript.textContent = chapters[i]?.text ?? '';
    }
    [...list.children].forEach((li, k) => {
      const on = k === current && t > 0;
      li.classList.toggle('on', on);
      const tEl = li.querySelector('.t');
      const wave = on && !audio.paused;
      if (wave !== tEl.classList.contains('wave')) {
        tEl.classList.toggle('wave', wave);
        tEl.innerHTML = wave ? ICONS.wave : fmt(chapters[k].start);
      }
    });
  }

  function playFrom(sec) {
    if (!ready) return;
    audio.currentTime = sec;
    audio.play();
  }

  // the edition itself, or (before it has been recorded) the script with
  // estimated timings so the screen still reads right
  Promise.all([
    fetch('audio/chapters.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('tools/edition.json').then((r) => r.json()).catch(() => ({ sections: [] })),
  ]).then(([data, script]) => {
    const texts = Object.fromEntries(script.sections.map((s) => [s.id, s.text]));
    if (data) {
      ready = true;
      audio.src = 'audio/edition.mp3';
      audio.preload = 'metadata';
      play.disabled = false;
      document.querySelectorAll('[data-listen-cover]').forEach((b) => { b.hidden = false; });
    } else {
      let t = 0;
      data = {
        voice: script.voice,
        chapters: script.sections.map((s) => { const c = { id: s.id, start: t }; t += (s.text.split(/\s+/).length / WPM) * 60; return c; }),
        durationSeconds: t,
      };
      play.title = 'Recording not generated yet';
    }
    build(data, texts);
  });

  play.addEventListener('click', () => (audio.paused ? audio.play() : audio.pause()));
  audio.addEventListener('play', () => { play.classList.add('playing'); play.setAttribute('aria-label', 'Pause'); show(audio.currentTime); });
  audio.addEventListener('pause', () => { play.classList.remove('playing'); play.setAttribute('aria-label', 'Play'); show(audio.currentTime); });
  audio.addEventListener('ended', () => { play.setAttribute('aria-label', 'Play again'); });
  audio.addEventListener('timeupdate', () => show(audio.currentTime));
  audio.addEventListener('loadedmetadata', () => { if (audio.duration && isFinite(audio.duration)) duration = audio.duration; });

  document.querySelectorAll('.pb-skip').forEach((b) => b.addEventListener('click', () => {
    if (!ready) return;
    audio.currentTime = Math.min(duration, Math.max(0, audio.currentTime + Number(b.dataset.skip)));
    show(audio.currentTime);
  }));
  $('pb-speed').addEventListener('click', (e) => {
    rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    audio.playbackRate = rate;
    e.currentTarget.textContent = `${rate}×`;
    e.currentTarget.classList.toggle('on', rate !== 1);
  });
  $('pb-save').addEventListener('click', (e) => {
    const b = e.currentTarget;
    b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
  });

  // tap or drag the bar; it thickens while you drag
  const at = (x) => { const r = scrub.getBoundingClientRect(); return Math.min(1, Math.max(0, (x - r.left) / r.width)) * duration; };
  scrub.addEventListener('pointerdown', (e) => {
    if (!ready) return;
    scrub.setPointerCapture(e.pointerId);
    scrub.classList.add('drag');
    show(at(e.clientX));
    const move = (ev) => show(at(ev.clientX));
    const up = (ev) => {
      audio.currentTime = at(ev.clientX);
      scrub.classList.remove('drag');
      scrub.removeEventListener('pointermove', move);
      scrub.removeEventListener('pointerup', up);
    };
    scrub.addEventListener('pointermove', move);
    scrub.addEventListener('pointerup', up);
  });
  scrub.addEventListener('keydown', (e) => {
    if (!ready) return;
    const d = e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    audio.currentTime = Math.min(duration, Math.max(0, audio.currentTime + d));
  });

  // the cover's Listen button lands here
  document.addEventListener('listen', () => { if (ready) audio.play(); });
  // turning away pauses it
  document.addEventListener('spread', (e) => {
    if (!e.detail.pages.some((p) => p.contains(audio))) audio.pause();
  });
})();
