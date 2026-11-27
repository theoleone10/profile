// Which lines of each code excerpt run for each thing a demo does.
// excerpt id (data-excerpt) → event → [first, last] line ranges, counted from 1.
export const CODE_MAP = {
  'paperboy.generateSectionedAudio': {
    'voice-sections': [[4, 13]],
    'chapter-start': [[14, 19]],
  },
  'kaeru.checkAnswer': {
    empty: [[6, 6]],
    correct: [[11, 11]],
    alternative: [[13, 15]],
    unconverted: [[17, 17]],
    'kana-trap': [[2, 2], [19, 22]],
    wrong: [[23, 23]],
  },
  'kaeru.createScheduler': {
    good: [[9, 16]],
    again: [[13, 14]],
  },
  'fl.workFunction': {
    stats: [[1, 17]],
    newton: [[33, 66]],
  },
  'fl.newtonUpdate': {
    step: [[32, 53]],
    settled: [[25, 29]],
    rejected: [[11, 22]],
  },
};
