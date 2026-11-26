// Light up the lines of a code excerpt that just ran:
//   highlight('kaeru.checkAnswer', 'kana-trap')
import { CODE_MAP } from './code-map.js';

// wrap every line of an excerpt in a span, once, keeping the comment styling
function linesOf(code) {
  const existing = code.querySelectorAll('.line');
  if (existing.length) return [...existing];
  const lines = [[]];
  for (const node of code.childNodes) {
    node.textContent.split('\n').forEach((text, i) => {
      if (i) lines.push([]);
      if (!text) return;
      if (node.nodeType === Node.TEXT_NODE) lines.at(-1).push(text);
      else lines.at(-1).push(Object.assign(document.createElement('span'), { className: node.className, textContent: text }));
    });
  }
  const spans = lines.map((parts, i) => {
    const span = document.createElement('span');
    span.className = 'line';
    span.append(...parts, i < lines.length - 1 ? '\n' : '');
    return span;
  });
  code.replaceChildren(...spans);
  return spans;
}

const waiting = new WeakMap(); // code pane → line to show once its tab opens

function bringIntoView(pane, line) {
  if (pane.closest('.panel').hidden) return false;
  const offset = line.getBoundingClientRect().top - pane.getBoundingClientRect().top;
  // scroll the pane only, never the page
  if (offset < 48 || offset > pane.clientHeight - 80) pane.scrollTop += offset - Math.min(96, pane.clientHeight / 4);
  return true;
}

export function highlight(excerpt, key, { label = 'ran just now', scroll = true } = {}) {
  const figure = document.querySelector(`figure[data-excerpt="${excerpt}"]`);
  const ranges = CODE_MAP[excerpt]?.[key];
  if (!figure || !ranges) return;
  const lines = linesOf(figure.querySelector('code'));
  lines.forEach((line, i) => {
    line.classList.toggle('ran', ranges.some(([a, b]) => i + 1 >= a && i + 1 <= b));
  });

  const caption = figure.querySelector('figcaption');
  caption.querySelector('.ran-mark')?.remove();
  caption.append(Object.assign(document.createElement('span'), { className: 'ran-mark', textContent: label }));

  const pane = figure.closest('.code');
  const demo = figure.closest('[data-demo]');
  const first = lines[ranges.at(-1)[0] - 1];
  if (pane.closest('.panel').hidden) demo.querySelector('[data-tab="code"]')?.setAttribute('data-fresh', '');
  if (scroll && !bringIntoView(pane, first)) waiting.set(pane, first);
}

// show the highlighted lines when someone opens the Code tab
export function followHighlights(demo) {
  demo.addEventListener('demo:tab', (e) => {
    if (e.detail !== 'code') return;
    demo.querySelector('[data-tab="code"]').removeAttribute('data-fresh');
    const pane = demo.querySelector('.code');
    const line = waiting.get(pane);
    if (line) requestAnimationFrame(() => bringIntoView(pane, line));
  });
}
