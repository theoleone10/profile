// Videos and embeds inside a demo card: embeds load when their tab is open and
// in view, videos pause when they're out of sight, and only one thing makes
// sound at a time.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// starting anything with sound pauses everything else with sound
document.addEventListener('play', (e) => {
  if (e.target.muted) return;
  for (const other of document.querySelectorAll('video, audio')) {
    if (other !== e.target && !other.muted) other.pause();
  }
}, true);

export function initMedia(demo) {
  const video = demo.querySelector('video');
  const frame = demo.querySelector('iframe[data-src]');
  if (!video && !frame) return;

  let inView = false;
  const videoOpen = () => demo.querySelector('[data-panel="video"]')?.hidden === false;
  const sync = () => {
    const showing = inView && videoOpen();
    if (showing && frame?.dataset.src) {
      frame.src = frame.dataset.src;
      delete frame.dataset.src;
    }
    if (video && !showing) video.pause();
    loop?.sync(showing);
  };

  let loop = null;
  if (video?.hasAttribute('data-loop')) loop = initLoop(video, demo.querySelector('.loop-toggle'), () => sync());
  else if (video) initClickToPlay(video, demo.querySelector('.bigplay'));

  demo.addEventListener('demo:tab', sync);
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    sync();
  }, { threshold: 0.2 }).observe(demo);
}

function initClickToPlay(video, button) {
  video.controls = false;
  button.hidden = false;
  button.addEventListener('click', () => {
    video.controls = true;
    video.play();
    video.focus();
  });
  video.addEventListener('play', () => {
    video.controls = true;
    button.hidden = true;
  });
}

// A silent looping preview: plays by itself while in view, unless the visitor
// paused it or asked for reduced motion.
function initLoop(video, button, resync) {
  let wanted = null; // null: no choice made yet
  video.controls = false;
  button.hidden = false;
  const label = () => { button.textContent = video.paused ? 'Play' : 'Pause'; };
  video.addEventListener('play', label);
  video.addEventListener('pause', label);
  button.addEventListener('click', () => {
    wanted = video.paused;
    resync();
  });
  reducedMotion.addEventListener('change', () => { wanted = null; resync(); });
  return {
    sync(showing) {
      if (showing && (wanted ?? !reducedMotion.matches)) video.play().catch(label);
      else video.pause();
    },
  };
}
