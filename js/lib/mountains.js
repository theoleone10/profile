// A mountain range along the bottom of the sky. Each mountain has two flat
// faces either side of its peak; the face turned toward the sun catches its
// light, the other stays in shade, and the far ranges fade into the sky.
// Colours are plain [r, g, b] arrays so they can be mixed every frame.

const NS = 'http://www.w3.org/2000/svg';

// [progress, shade, lit]: what the nearest range looks like through the day
const ROCK = [
  [0,    '#10131F', '#2E2536'],
  [0.08, '#2B2A40', '#7A4E5C'],
  [0.17, '#6E7F95', '#D6B4A6'],
  [0.33, '#7D93A6', '#CCDCE3'],
  [0.5,  '#8199AC', '#D7E5EB'],
  [0.67, '#7E91A5', '#DBD8D2'],
  [0.83, '#6E7590', '#D9AE98'],
  [0.92, '#2D2A42', '#7C4A55'],
  [1,    '#0F121E', '#2C2333'],
];

// far to near: how much each range melts into the sky, how tall it stands
const RANGES = [
  { haze: 0.62, low: 0.1, high: 0.2, peaks: 5, seed: 11 },
  { haze: 0.44, low: 0.07, high: 0.15, peaks: 4, seed: 23 },
  { haze: 0.26, low: 0.04, high: 0.1, peaks: 4, seed: 37 },
  { haze: 0.08, low: 0.015, high: 0.06, peaks: 3, seed: 51 },
];

export const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export const css = (c) => `rgb(${c.map((v) => Math.round(v)).join(' ')})`;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

// a colour from a list of [progress, ...colours] stops
export function along(stops, p, which = 1) {
  let i = 1;
  while (i < stops.length - 1 && p > stops[i][0]) i++;
  const a = stops[i - 1];
  const b = stops[i];
  return mix(hex(a[which]), hex(b[which]), clamp((p - a[0]) / (b[0] - a[0])));
}

function random(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// one range: a ridge of peaks and valleys, in fractions of the screen
function shape({ low, high, peaks, seed }) {
  const rand = random(seed);
  const step = 1.16 / peaks;
  const ridge = []; // { x, h, peak }
  let x = -0.08 + rand() * step * 0.3;
  ridge.push({ x, h: low * (0.3 + rand() * 0.4), valley: true });
  for (let k = 0; k < peaks; k++) {
    const top = { x: x + step * (0.35 + rand() * 0.3), h: low + (high - low) * (0.35 + rand() * 0.65), peak: true };
    const next = { x: x + step, h: low * (0.25 + rand() * 0.55), valley: true };
    // a couple of crags on the way up and down
    for (const [from, to] of [[ridge.at(-1), top], [top, next]]) {
      for (const t of [0.35, 0.7]) {
        const jag = (rand() - 0.5) * 0.12 * (high - low);
        ridge.push({ x: from.x + (to.x - from.x) * t, h: from.h + (to.h - from.h) * t + jag });
      }
      if (to === top) ridge.push(top);
    }
    ridge.push(next);
    x = next.x;
  }
  // each peak's two faces: ridge down to the valleys, split by a spine
  const faces = [];
  for (let i = 0; i < ridge.length; i++) {
    if (!ridge[i].peak) continue;
    let l = i - 1; while (!ridge[l].valley) l--;
    let r = i + 1; while (!ridge[r].valley) r++;
    const spine = ridge[i].x + (ridge[r].x - ridge[i].x) * 0.18;
    faces.push({ side: -1, peak: ridge[i], pts: [...ridge.slice(l, i + 1), { x: spine, h: -0.02 }, { x: ridge[l].x, h: -0.02 }] });
    faces.push({ side: 1, peak: ridge[i], pts: [...ridge.slice(i, r + 1), { x: ridge[r].x, h: -0.02 }, { x: spine, h: -0.02 }] });
  }
  return { ridge, faces };
}

export function createMountains(svg) {
  const ranges = RANGES.map((r) => ({ ...r, ...shape(r) }));
  let w = 1;
  let h = 1;
  for (const range of ranges) {
    const g = document.createElementNS(NS, 'g');
    range.base = document.createElementNS(NS, 'path'); // the whole range, under its faces
    g.append(range.base);
    for (const face of range.faces) {
      face.el = document.createElementNS(NS, 'path');
      g.append(face.el);
    }
    svg.append(g);
  }

  const X = (x) => (x * w).toFixed(1);
  const Y = (v) => (h - v * h).toFixed(1);
  const d = (pts) => `M${pts.map((q) => `${X(q.x)} ${Y(q.h)}`).join('L')}Z`;

  return {
    layout(width, height) {
      w = width;
      h = height;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      for (const range of ranges) {
        range.base.setAttribute('d', d([...range.ridge, { x: range.ridge.at(-1).x, h: -0.02 }, { x: range.ridge[0].x, h: -0.02 }]));
        for (const face of range.faces) face.el.setAttribute('d', d(face.pts));
      }
    },
    // the highest ground at x, in pixels from the top
    ridgeAt(px) {
      const x = px / w;
      let best = 0;
      for (const { ridge } of ranges) {
        for (let i = 1; i < ridge.length; i++) {
          const a = ridge[i - 1];
          const b = ridge[i];
          if (x >= a.x && x <= b.x) best = Math.max(best, a.h + (b.h - a.h) * ((x - a.x) / (b.x - a.x || 1)));
        }
      }
      return h - best * h;
    },
    // light the range for the sun at (sx, sy) at progress p, under a sky of colour sky
    light(sx, sy, p, sky) {
      const shade = along(ROCK, p, 1);
      const lit = along(ROCK, p, 2);
      for (const range of ranges) {
        const hazed = (c) => css(mix(c, sky, range.haze));
        range.base.setAttribute('fill', hazed(shade));
        for (const face of range.faces) {
          const px = face.peak.x * w;
          const py = h - face.peak.h * h;
          let lx = sx - px;
          let ly = py - sy; // up is positive
          const len = Math.hypot(lx, ly) || 1;
          lx /= len; ly /= len;
          // the face leans 55° from flat toward its side
          const glow = clamp(face.side * 0.82 * lx + 0.57 * ly);
          face.el.setAttribute('fill', hazed(mix(shade, lit, glow ** 1.4)));
        }
      }
    },
  };
}
