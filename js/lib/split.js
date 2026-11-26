// "Code beside": on wide screens, show the code next to the demo instead of in
// its own tab, with the demo card taking the full width of the section.
const wide = matchMedia('(min-width: 1200px)');

export function initSplit(demo, tabs) {
  const button = demo.querySelector('.split-toggle');
  if (!button) return;
  button.hidden = false;
  const section = demo.closest('.hour');

  function set(on) {
    if (on === demo.hasAttribute('data-split')) return;
    demo.toggleAttribute('data-split', on);
    section.classList.toggle('split', on);
    button.setAttribute('aria-pressed', String(on));
    tabs.refresh();
  }

  button.addEventListener('click', () => {
    set(!demo.hasAttribute('data-split'));
    demo.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  wide.addEventListener('change', () => { if (!wide.matches) set(false); });
}
