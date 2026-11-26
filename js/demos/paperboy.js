// Paperboy's player, playing a real episode. The audio and the exact start of
// each chapter come from Paperboy's own pipeline (tools/make-edition.mts writes
// audio/edition.mp3 and audio/chapters.json). Controls follow
// components/player/EpisodePlayer.tsx: 1x to 2x, 15s skips, tap or drag the bar
// to seek, tap a chapter to hear it from the start.
const AUDIO = new URL('../../audio/edition.mp3', import.meta.url).href;
const CHAPTERS = new URL('../../audio/chapters.json', import.meta.url).href;
const RATES = [1, 1.25, 1.5, 2];

// how each section shows up in the chapter list
const ROWS = {
  front: { title: 'Welcome & Preview', sub: 'Intro', letter: 'TL' },
  paperboy: { title: 'The App Reading This', sub: 'Paperboy', img: 'img/paperboy-icon-128.webp' },
  waypass: { title: 'Cremations Without Paper', sub: 'Waypass', img: 'img/waypass-mark-128.webp' },
  kaeru: { title: 'Grammar, N5 to N1', sub: 'Kaeru', img: 'img/kaeru-icon-192.webp' },
  fl: { title: 'Training Where Data Lives', sub: 'QMIND × Distributive', img: 'img/research-mark.svg' },
  back: { title: 'One Thing To Remember', sub: 'To wrap up', letter: '1' },
};

const fmt = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

export async function mount(demo) {
  const $ = (name) => demo.querySelector(`[data-pb="${name}"]`);
  const audio = $('audio');
  const play = $('play');
  const speed = $('speed');
  const scrub = $('scrub');
  const transcript = $('transcript');
  const skips = [...demo.querySelectorAll('[data-skip]')];

  let data;
  try {
    const response = await fetch(CHAPTERS);
    if (!response.ok) throw new Error(response.statusText);
    data = await response.json();
  } catch {
    transcript.textContent = 'The episode couldn’t be loaded. The video tab still works.';
    return;
  }

  const chapters = data.chapters.map((c) => ({ ...c, ...ROWS[c.id] }));
  let duration = data.durationSeconds;
  let current = -1;
  let rate = 1;

  const buttons = chapters.map((c) => {
    const mark = c.img
      ? el('img', { className: 'mark', src: c.img, alt: '', width: 28, height: 28, loading: 'lazy' })
      : el('span', { className: 'mark', textContent: c.letter, ariaHidden: 'true' });
    const button = el('button', { type: 'button' }, mark,
      el('span', { className: 'txt' }, el('b', { textContent: c.title }), el('small', { textContent: c.sub })),
      el('span', { className: 't', textContent: fmt(c.start) }));
    button.addEventListener('click', () => seek(c.start, true));
    return button;
  });
  $('chapters').replaceChildren(...buttons.map((b) => el('li', {}, b)));
  $('meta').textContent = `${fmt(duration)} · ${data.voice ?? 'Ashley'}`;

  function show(t) {
    let i = 0;
    chapters.forEach((c, k) => { if (t >= c.start) i = k; });
    const percent = duration ? Math.min(100, (t / duration) * 100) : 0;
    $('fill').style.width = `${percent}%`;
    scrub.setAttribute('aria-valuenow', String(Math.round(percent)));
    scrub.setAttribute('aria-valuetext', `${fmt(t)} of ${fmt(duration)}`);
    $('pos').textContent = fmt(t);
    $('left').textContent = `-${fmt(duration - t)}`;
    if (i === current) return;
    current = i;
    transcript.textContent = chapters[i].text;
    transcript.parentElement.scrollTop = 0;
    buttons.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
  }

  function seek(sec, andPlay = false) {
    const to = Math.min(duration, Math.max(0, sec));
    audio.currentTime = to;
    show(to);
    if (andPlay) audio.play();
  }

  audio.src = AUDIO;
  for (const control of [play, speed, ...skips]) control.disabled = false;

  play.addEventListener('click', () => (audio.paused ? audio.play() : audio.pause()));
  const playing = () => {
    play.toggleAttribute('data-playing', !audio.paused);
    play.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  };
  audio.addEventListener('play', playing);
  audio.addEventListener('pause', playing);
  audio.addEventListener('timeupdate', () => { if (!scrub.dataset.drag) show(audio.currentTime); });
  audio.addEventListener('loadedmetadata', () => { if (Number.isFinite(audio.duration)) duration = audio.duration; });

  for (const b of skips) b.addEventListener('click', () => seek(audio.currentTime + Number(b.dataset.skip)));
  speed.addEventListener('click', () => {
    rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    audio.defaultPlaybackRate = audio.playbackRate = rate;
    speed.textContent = `${rate}×`;
    speed.setAttribute('aria-label', `Playback speed, ${rate}×`);
    speed.toggleAttribute('data-on', rate !== 1);
  });

  // tap or drag the bar
  const at = (x) => {
    const r = scrub.getBoundingClientRect();
    return Math.min(1, Math.max(0, (x - r.left) / r.width)) * duration;
  };
  scrub.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    scrub.setPointerCapture(e.pointerId);
    scrub.dataset.drag = 'true';
    show(at(e.clientX));
  });
  scrub.addEventListener('pointermove', (e) => { if (scrub.dataset.drag) show(at(e.clientX)); });
  scrub.addEventListener('pointerup', (e) => {
    if (!scrub.dataset.drag) return;
    delete scrub.dataset.drag;
    seek(at(e.clientX));
  });
  scrub.addEventListener('pointercancel', () => { delete scrub.dataset.drag; show(audio.currentTime); });
  scrub.addEventListener('keydown', (e) => {
    const t = audio.currentTime;
    const to = { ArrowLeft: t - 5, ArrowRight: t + 5, ArrowDown: t - 5, ArrowUp: t + 5, PageDown: t - 15, PageUp: t + 15, Home: 0, End: duration }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    seek(to);
  });

  // opening another tab pauses the episode
  demo.addEventListener('demo:tab', (e) => { if (e.detail !== 'try') audio.pause(); });

  show(0);
}
