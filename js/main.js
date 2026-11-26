// Entry point. Wires the tabs and media in each demo card, and loads a demo's
// own module only when its card is getting close to the screen.
import { initTabs } from './lib/tabs.js';
import { initMedia } from './lib/media.js';
import { whenNear } from './lib/lazy.js';
import { initCopy } from './lib/copy.js';
import { initSky } from './lib/sky.js';
import { initFlow } from './lib/flow.js';
import { initSplit } from './lib/split.js';
import { highlight, followHighlights } from './lib/highlight.js';

const DEMOS = {
  paperboy: () => import('./demos/paperboy.js'),
  kaeru: () => import('./demos/kaeru.js'),
  fl: () => import('./demos/fl/index.js'),
};

for (const demo of document.querySelectorAll('[data-demo]')) {
  followHighlights(demo);
  const tabs = initTabs(demo);
  initMedia(demo);
  initSplit(demo, tabs);
  const flow = initFlow(demo);
  // what a demo reports back: which code ran, and which pipeline stage
  const system = { ran: highlight, step: flow.step };
  const load = DEMOS[demo.dataset.demo];
  if (load) whenNear(demo, async () => (await load()).mount(demo, system));
}

initCopy();
initSky();
