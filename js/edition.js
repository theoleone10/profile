// Shared behaviour: edition date, latest GitHub push, demo tabs, videos,
// copy-email, and the cover's Listen button.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ── Edition line ──
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
  const vol = ['I', 'II', 'III', 'IV', 'V', 'VI'][now.getFullYear() - 2025] || String(now.getFullYear() - 2024);
  $('#edition-no').textContent = `Vol. ${vol} · No. ${dayOfYear}`;
  $('#edition-date').textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  // ── Latest dispatch: most recent push to a public repo ──
  const ago = (iso) => {
    const s = (Date.now() - new Date(iso)) / 1000;
    for (const [u, n] of [['year', 31536e3], ['month', 2592e3], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
      if (s >= n) { const v = Math.floor(s / n); return `${v} ${u}${v > 1 ? 's' : ''} ago`; }
    }
    return 'just now';
  };
  const showDispatch = (d) => {
    const el = $('#dispatch');
    const label = Object.assign(document.createElement('span'), { className: 'muted', textContent: 'Latest dispatch' });
    const a = Object.assign(document.createElement('a'), { href: `https://github.com/${d.repo}`, target: '_blank', rel: 'noopener', textContent: d.repo.split('/')[1] });
    el.replaceChildren(label, ' — pushed to ', a, ` · ${ago(d.at)}`);
  };
  (async () => {
    const KEY = 'dispatch-v1';
    try { const c = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (c) return showDispatch(c); } catch {}
    try {
      const res = await fetch('https://api.github.com/users/theoleone10/events/public?per_page=30');
      if (!res.ok) return;
      const push = (await res.json()).find((e) => e.type === 'PushEvent' && !/\/profile$/.test(e.repo.name));
      if (!push) return;
      const d = { repo: push.repo.name, at: push.created_at };
      showDispatch(d);
      try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch {}
    } catch {}
  })();

  // ── Demo tabs ──
  $$('[data-tabs]').forEach((stage) => {
    const tabs = $$('[role="tab"]', stage);
    const select = (tab) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        panel.hidden = !on;
        if (!on) $$('video', panel).forEach((v) => v.pause());
        if (on) $$('iframe[data-src]', panel).forEach((f) => { f.src = f.dataset.src; f.removeAttribute('data-src'); });
      });
      stage.dispatchEvent(new CustomEvent('tabchange', { detail: tab.getAttribute('aria-controls') }));
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        const n = tabs[(i + d + tabs.length) % tabs.length];
        n.focus();
        select(n);
      });
    });
  });

  // ── Code panes: one file at a time, picked from tabs like an editor ──
  // fl.js fills its editor later and calls this itself
  const editorTabs = (ed) => {
    const names = $$('.editor-tab', ed);
    const files = names.map((n) => n.nextElementSibling);
    const bar = Object.assign(document.createElement('div'), { className: 'editor-files' });
    const path = Object.assign(document.createElement('div'), { className: 'editor-path' });
    const pick = (i) => {
      [...bar.children].forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
      files.forEach((f, k) => { f.hidden = k !== i; });
      path.textContent = names[i].textContent;
    };
    names.forEach((n, i) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: n.textContent.split('/').pop() });
      b.addEventListener('click', () => pick(i));
      bar.append(b);
      n.remove();
    });
    ed.prepend(bar, path);
    pick(0);
  };
  window.editorTabs = editorTabs;
  $$('.editor').forEach((ed) => { if (!ed.querySelector('#fl-source')) editorTabs(ed); });

  // ── Click-to-play videos; one at a time, paused when the page turns ──
  const videos = $$('[data-video] video');
  $$('[data-video]').forEach((wrap) => {
    const v = $('video', wrap);
    $('.play', wrap).addEventListener('click', () => v.play());
    v.addEventListener('play', () => {
      wrap.classList.add('is-playing');
      v.controls = true;
      videos.forEach((o) => { if (o !== v) o.pause(); });
      document.querySelectorAll('audio').forEach((a) => a.pause());
    });
  });
  document.addEventListener('spread', (e) => {
    // an embed that is the open tab loads once its page is in view
    e.detail.pages.forEach((p) => $$('.panel:not([hidden]) iframe[data-src]', p).forEach((f) => { f.src = f.dataset.src; f.removeAttribute('data-src'); }));
    videos.forEach((v) => { if (!e.detail.pages.some((p) => p.contains(v))) v.pause(); });
  });

  // ── Copy email ──
  const copy = $('#copy-mail');
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(copy.dataset.mail); copy.textContent = 'Copied ✓'; }
    catch { copy.textContent = copy.dataset.mail; }
    setTimeout(() => { copy.textContent = 'Copy email'; }, 2000);
  });

  // ── Listen: the cover button turns to Paperboy and plays the edition there ──
  $$('[data-listen-cover]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    window.Book?.go(2);
    document.dispatchEvent(new CustomEvent('listen'));
  }));
})();
