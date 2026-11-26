// The five machines and the coordinator, run off the main thread. All the maths
// is the project's own code (./lr); this file only walks through one round of the
// protocol a step at a time, so the page can show each step as it happens.
import { workFunction } from './lr/workFunction.js';
import { processStats, initialNewtonState, newtonUpdate, validateResult } from './lr/coordinator.js';
import { resolveHyperparameters } from './lr/hyperparameters.js';

// the settings of the showcase demo (demo/run.js)
const h = resolveHyperparameters({ l2: 1, siteSizeCheck: 'warn', tolerance: 1e-8, maxRounds: 10 });

let data;
let session;

function createSession() {
  const names = data.sites.map((s) => s.site);
  const rows = (s) => ({ X: s.X, y: s.y, featureNames: data.featureNames, site: s.site });
  let phase = 'stats';
  let round = 0;
  let rawStats, stats, state, args, results;

  // one step of the protocol; returns what happened, for the page to show
  return function advance() {
    const step = { phase, round };
    switch (phase) {
      case 'stats':
        // round 0: every machine summarises its features so they can be scaled alike
        rawStats = data.sites.map((s) => workFunction(rows(s), { stage: 'stats', site: s.site }));
        rawStats.forEach((r, k) => validateResult(r, 'stats', { site: names[k] }));
        stats = processStats(names, rawStats, h);
        state = initialNewtonState(stats.d, h);
        phase = 'send';
        round = 1;
        break;
      case 'send':
        args = { stage: 'newton', round, beta: state.beta, mean: stats.mean, std: stats.std, classWeights: stats.classWeights, fitIntercept: h.fitIntercept };
        step.beta = state.beta;
        phase = 'read';
        break;
      case 'read':
        results = data.sites.map((s) => workFunction(rows(s), { ...args, site: s.site }));
        phase = 'return';
        break;
      case 'return':
        results.forEach((r, k) => validateResult(r, 'newton', { site: names[k], n: rawStats[k].n, d: stats.d }));
        phase = 'update';
        break;
      case 'update': {
        const u = newtonUpdate(state, results, h);
        state = u.state;
        step.beta = state.beta;
        // which branch of newtonUpdate this round took
        step.path = u.rejected ? 'rejected' : u.converged && u.maxStep === 0 ? 'settled' : 'step';
        step.done = u.converged || round === h.maxRounds;
        if (step.done) phase = 'done';
        else { phase = 'send'; round++; }
        break;
      }
      default:
        step.done = true;
    }
    return step;
  };
}

const handlers = {
  async load({ url }) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load the data (${response.status})`);
    data = await response.json();
    return { sites: data.sites.map((s) => ({ name: s.site, rows: s.y.length, labels: s.y.slice(0, 24) })) };
  },
  reset() { session = createSession(); return {}; },
  advance() { return session(); },
};

self.addEventListener('message', async ({ data: { id, type, payload } }) => {
  try {
    self.postMessage({ id, result: await handlers[type](payload ?? {}) });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
});
