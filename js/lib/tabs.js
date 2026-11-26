// Tabs for one demo card. The roles are added here, so that without
// JavaScript the panels read as ordinary content. Switching dispatches
// "demo:tab" on the card with the new tab's name.
export function initTabs(demo) {
  const list = demo.querySelector('.tabs');
  const tabs = [...list.querySelectorAll('[data-tab]')];
  const panelFor = (tab) => demo.querySelector(`[data-panel="${tab.dataset.tab}"]`);

  list.setAttribute('role', 'tablist');
  for (const tab of tabs) {
    const panel = panelFor(tab);
    tab.setAttribute('role', 'tab');
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
  }

  function select(selected) {
    for (const tab of tabs) {
      const on = tab === selected;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      // "until-found" keeps hidden panels searchable; elsewhere it just hides
      panelFor(tab).hidden = on ? false : 'until-found';
    }
    demo.dispatchEvent(new CustomEvent('demo:tab', { detail: selected.dataset.tab }));
  }

  list.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) select(tab);
  });
  list.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(e.target);
    if (i < 0) return;
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length];
    next.focus();
    select(next);
  });
  // find-in-page landed in a hidden panel: switch to its tab
  demo.addEventListener('beforematch', (e) => {
    const tab = tabs.find((t) => panelFor(t).contains(e.target));
    if (tab) select(tab);
  });

  select(tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0]);
  demo.dataset.ready = '';
}
