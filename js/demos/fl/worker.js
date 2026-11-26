// The five machines and the coordinator, run off the main thread. All the maths
// is the project's own code (./lr); this file only walks through one round of the
// protocol a step at a time, so the page can show each step as it happens.
import { workFunction } from './lr/workFunction.js';
import { processStats, initialNewtonState, newtonUpdate, validateResult } from './lr/coordinator.js';
import { resolveHyperparameters } from './lr/hyperparameters.js';
import { exportModel, predictProba } from './lr/model.js';
import { auc } from './lr/metrics.js';

// the settings of the showcase demo (demo/run.js)
const h = resolveHyperparameters({ l2: 1, siteSizeCheck: 'warn', tolerance: 1e-8, maxRounds: 10 });

let data;
let session;

function createSession(names) {
  const sites = names.map((name) => data.sites.find((s) => s.site === name));
  const rows = (s) => ({ X: s.X, y: s.y, featureNames: data.featureNames, site: s.site });
  let phase = 'stats';
  let round = 0;
  let rawStats, stats, state, args, results;

  const score = () => {
    const model = exportModel({ betaStd: state.beta, stats, h, training: {} });
    return { model, auc: auc(data.test.y, data.test.X.map((x) => predictProba(model, x))) };
  };

  // one step of the protocol; returns what happened, for the page to show
  return function advance() {
    const step = { phase, round, machines: names.length };
    switch (phase) {
      case 'stats': {
        rawStats = sites.map((s) => workFunction(rows(s), { stage: 'stats', site: s.site }));
        rawStats.forEach((r, k) => validateResult(r, 'stats', { site: names[k] }));
        stats = processStats(names, rawStats, h);
        state = initialNewtonState(stats.d, h);
        const r = rawStats[0];
        step.numbersEach = r.sum.length + r.sumSq.length + r.classCounts.length + 1;
        phase = 'send';
        round = 1;
        break;
      }
      case 'send':
        args = { stage: 'newton', round, beta: state.beta, mean: stats.mean, std: stats.std, classWeights: stats.classWeights, fitIntercept: h.fitIntercept };
        step.numbersEach = args.beta.length + args.mean.length + args.std.length + args.classWeights.length;
        phase = 'read';
        break;
      case 'read':
        results = sites.map((s) => workFunction(rows(s), { ...args, site: s.site }));
        phase = 'return';
        break;
      case 'return':
        results.forEach((r, k) => validateResult(r, 'newton', { site: names[k], n: rawStats[k].n, d: stats.d }));
        step.numbersEach = results[0].gradient.length + results[0].hessian.length + 1; // and the loss
        phase = 'update';
        break;
      case 'update': {
        const u = newtonUpdate(state, results, h);
        state = u.state;
        const { model, auc: score_ } = score();
        step.beta = state.beta;
        step.auc = score_;
        step.converged = u.converged;
        step.done = u.converged || round === h.maxRounds;
        step.rows = stats.N;
        if (step.done && names.length === data.sites.length) {
          // how far from scikit-learn trained on every row in one place
          const ref = data.reference;
          step.maxDiff = Math.max(
            Math.abs(model.intercept - ref.intercept),
            ...model.coefficients.map((c, j) => Math.abs(c - ref.coefficients[j])),
          );
        }
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

// each machine training by itself, scored on the same held-out rows
function alone(name) {
  const advance = createSession([name]);
  let step;
  do step = advance(); while (!step.done);
  return step.auc;
}

const handlers = {
  async load({ url }) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load the data (${response.status})`);
    data = await response.json();
    return {
      // one dot per ten rows: only the label is needed to draw it
      sites: data.sites.map((s) => ({ name: s.site, rows: s.y.length, dots: s.y.filter((_, i) => i % 10 === 0), alone: alone(s.site) })),
      testRows: data.test.y.length,
    };
  },
  reset({ sites }) { session = createSession(sites); return {}; },
  advance() { return session(); },
};

self.addEventListener('message', async ({ data: { id, type, payload } }) => {
  try {
    self.postMessage({ id, result: await handlers[type](payload ?? {}) });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
});
