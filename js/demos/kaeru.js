// Kaeru demo: real grammar cards from the app's content, graded with a port of
// src/review/answerCheck.ts and scheduled with ts-fsrs using the app's settings.
const WANAKANA = 'https://cdn.jsdelivr.net/npm/wanakana@5.3.1/+esm';
const TS_FSRS = 'https://cdn.jsdelivr.net/npm/ts-fsrs@5.4.2/+esm';

// From content/n5.json, n4.json and n3.json
const CARDS = [
  {
    level: 'N5', title: 'は (topic)', japanese: '私は学生です。', english: 'I’m a student.', cloze: 'は',
    accepted: ['は'],
    alternatives: [{ answer: 'が', note: '私が学生です is grammatical but means “I’m the one who is the student”. It singles you out instead of introducing a topic.' }],
    hint: 'Try typing it as it sounds: wa',
  },
  {
    level: 'N4', title: '〜ちゃう／〜じゃう', japanese: 'あ、宿題を忘れちゃった。', english: 'Oh no, I forgot my homework.', cloze: '忘れちゃった',
    accepted: ['忘れちゃった', 'わすれちゃった'],
    alternatives: [
      { answer: '忘れてしまった', note: 'Correct, but this review wants the casual contraction.' },
      { answer: 'わすれてしまった', note: 'Correct, but this review wants the casual contraction.' },
    ],
    hint: '忘れる + (oops, casual)',
  },
  {
    level: 'N3', title: '〜づらい', japanese: '小さい字は読みづらいです。', english: 'Small print is hard to read.', cloze: 'づらい',
    accepted: ['づらい'],
    alternatives: [{ answer: 'にくい', note: 'Also correct, but this review wants the one stressing the reader’s discomfort.' }],
    hint: 'hard to (for me)',
  },
];

// ── src/review/normalize.ts ──
const IGNORED = /[\s。、，．,.!?！？「」『』（）()［］[\]【】・…‥~〜"'“”‘’]/g;
const katakanaToHiragana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const normalizeAnswer = (input) => katakanaToHiragana(input.normalize('NFKC').replace(IGNORED, '')).toLowerCase();

// ── src/review/answerCheck.ts ──
const TRAPS = { わ: 'は', え: 'へ', お: 'を' };
function trapVariants(s) {
  const positions = [...s].flatMap((c, i) => (TRAPS[c] ? [i] : [])).slice(0, 6);
  const chars = [...s];
  const out = [];
  for (let mask = 1; mask < 1 << positions.length; mask++) {
    const copy = [...chars];
    positions.forEach((pos, bit) => { if (mask & (1 << bit)) copy[pos] = TRAPS[copy[pos]]; });
    out.push(copy.join(''));
  }
  return out;
}
function checkAnswer(input, card) {
  const answer = normalizeAnswer(input);
  if (!answer) return { kind: 'empty' };
  const accepted = new Map(card.accepted.map((a) => [normalizeAnswer(a), a]));
  if (accepted.has(answer)) return { kind: 'correct' };
  const alt = card.alternatives.find((a) => normalizeAnswer(a.answer) === answer);
  if (alt) return { kind: 'alternative', note: alt.note };
  if (/[a-z]/.test(answer)) return { kind: 'unconverted' };
  for (const v of trapVariants(answer)) {
    const match = accepted.get(v);
    if (match) return { kind: 'kana-trap', suggestion: match };
  }
  return { kind: 'wrong' };
}

const human = (ms) => {
  const m = ms / 6e4;
  if (m < 60) return `${Math.round(m)}m`;
  const d = m / 1440;
  if (d < 1) return `${Math.round(m / 60)}h`;
  if (d < 31) return `${Math.round(d)}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1)}y`;
};
const ja = (t) => Object.assign(document.createElement('span'), { lang: 'ja', textContent: t });

export async function mount(demo, system) {
  const $ = (name) => demo.querySelector(`[data-kr="${name}"]`);
  const input = $('input');
  const feedback = $('feedback');
  const sched = $('sched');
  const next = $('next');

  // today's date, the way the app's home screen shows it
  const today = new Date();
  if ($('date-jp')) $('date-jp').textContent = `${today.getMonth() + 1}月${today.getDate()}日（${'日月火水木金土'[today.getDay()]}）`;
  if ($('date')) $('date').textContent = today.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });

  let toKana, createEmptyCard, fsrs, generatorParameters, Rating;
  try {
    [{ toKana }, { createEmptyCard, fsrs, generatorParameters, Rating }] =
      await Promise.all([import(WANAKANA), import(TS_FSRS)]);
  } catch {
    $('loading').textContent = 'The libraries couldn’t be loaded. The video and code tabs still work.';
    return;
  }

  // ── src/review/kanaInput.ts ──
  const HAS_ASCII_LETTER = /[A-Za-z]/;
  const convertRomajiInput = (text) => (HAS_ASCII_LETTER.test(text) ? toKana(text.toLowerCase(), { IMEMode: true }) : text);
  const finalizeInput = (text) => {
    const t = text.trim();
    return HAS_ASCII_LETTER.test(t) ? toKana(t.toLowerCase()) : t;
  };

  // ── src/srs/scheduler.ts (fuzz off so the numbers are stable) ──
  const scheduler = fsrs(generatorParameters({
    request_retention: 0.9, enable_fuzz: false, enable_short_term: true,
    learning_steps: ['10m'], relearning_steps: ['10m'], maximum_interval: 36500,
  }));

  let i = 0;
  let done = false;

  function showCard() {
    const c = CARDS[i];
    done = false;
    $('level').textContent = c.level;
    $('title').textContent = c.title;
    $('count').textContent = `${i + 1} of ${CARDS.length}`;
    $('en').textContent = c.english;
    const [before, after] = c.japanese.split(c.cloze);
    const blank = Object.assign(document.createElement('span'), { className: 'blank', textContent: '？' });
    $('jp').replaceChildren(before, blank, after);
    $('hint').textContent = c.hint;
    input.value = '';
    input.disabled = false;
    feedback.replaceChildren();
    delete feedback.dataset.tone;
    sched.hidden = true;
    next.hidden = true;
  }

  function say(tone, label, ...rest) {
    const b = Object.assign(document.createElement('b'), { textContent: label });
    feedback.dataset.tone = tone;
    feedback.replaceChildren(b, ' ', ...rest);
  }

  // Grade one review and show what FSRS schedules next
  function grade(rating) {
    const now = new Date();
    let card = createEmptyCard(now);
    let at = now;
    const first = scheduler.next(card, at, rating);
    const chips = [human(first.card.due - now)];
    // If every later review is correct, how the gaps grow
    card = first.card; at = first.card.due;
    for (let k = 0; k < 4; k++) {
      const r = scheduler.next(card, at, Rating.Good);
      chips.push(human(r.card.due - at));
      card = r.card; at = r.card.due;
    }
    const label = document.createElement('p');
    label.textContent = rating === Rating.Good
      ? 'FSRS: next review, then each gap if you keep getting it right'
      : 'FSRS: back in 10 minutes, then each gap once you get it right';
    const row = Object.assign(document.createElement('div'), { className: 'row' });
    chips.forEach((c, k) => {
      if (k) row.append(Object.assign(document.createElement('span'), { className: 'arr', textContent: '→' }));
      row.append(Object.assign(document.createElement('span'), { className: `iv${k ? '' : ' first'}`, textContent: c }));
    });
    sched.replaceChildren(label, row);
    sched.hidden = false;
    // checkAnswer ran first: keep the pane on it
    system.ran('kaeru.createScheduler', rating === Rating.Good ? 'good' : 'again', { scroll: false });
    system.step('next');
  }

  function finish(rating, answerShown) {
    done = true;
    input.disabled = true;
    const blank = demo.querySelector('.blank');
    blank.textContent = answerShown;
    blank.dataset.filled = '';
    grade(rating);
    next.textContent = i === CARDS.length - 1 ? 'Start again' : 'Next card';
    next.hidden = false;
    next.focus({ preventScroll: true });
  }

  input.addEventListener('input', () => {
    const pos = input.value.length;
    const converted = convertRomajiInput(input.value);
    if (input.value) system.step(converted !== input.value ? 'kana' : 'romaji');
    if (converted !== input.value) {
      input.value = converted;
      if (pos) input.setSelectionRange(converted.length, converted.length);
    }
  });

  $('form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (done) return;
    const c = CARDS[i];
    const value = finalizeInput(input.value);
    input.value = value;
    const r = checkAnswer(value, c);
    system.ran('kaeru.checkAnswer', r.kind);
    system.step('check');
    switch (r.kind) {
      case 'empty': return;
      case 'correct':
        say('ok', 'Correct!', ja(c.cloze));
        return finish(Rating.Good, c.cloze);
      case 'alternative':
        return say('close', 'Close!', r.note, ' Try again.');
      case 'kana-trap':
        return say('close', 'So close.', 'Particles keep their old spelling: you typed it as it sounds. Try ', ja(r.suggestion), '.');
      case 'unconverted':
        return say('close', 'Hmm.', 'Some romaji didn’t turn into kana. Check the spelling.');
      default:
        say('miss', 'Not quite.', 'The answer is ', ja(c.cloze), '.');
        return finish(Rating.Again, c.cloze);
    }
  });

  next.addEventListener('click', () => {
    i = (i + 1) % CARDS.length;
    showCard();
    input.focus({ preventScroll: true });
  });

  $('loading').hidden = true;
  $('check').disabled = false;
  showCard();
}
