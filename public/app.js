import { computeSplit, pickNext } from '/lib/game.js';

const PLAYER_KEY = 'tot.playerId';
const SEEN_KEY = 'tot.seen';

const el = {
  loading: document.getElementById('loading'),
  game: document.getElementById('game'),
  done: document.getElementById('done'),
  failed: document.getElementById('failed'),
  statement: document.getElementById('statement'),
  choices: document.getElementById('choices'),
  skipLine: document.getElementById('skip-line'),
  skip: document.getElementById('skip'),
  result: document.getElementById('result'),
  barTrump: document.getElementById('bar-trump'),
  barToddler: document.getElementById('bar-toddler'),
  pctTrump: document.getElementById('pct-trump'),
  pctToddler: document.getElementById('pct-toddler'),
  legendTrump: document.getElementById('legend-trump'),
  legendToddler: document.getElementById('legend-toddler'),
  tally: document.getElementById('tally'),
  sourceNote: document.getElementById('source-note'),
  next: document.getElementById('next'),
};

/* ------------------------------------------------------------------ *
 * Remembering what this player has seen.
 *
 * localStorage can be missing or throw (private windows, blocked site
 * data). When it does we keep the same set in memory, which still stops
 * repeats for as long as the tab is open.
 * ------------------------------------------------------------------ */

function storage() {
  try {
    const probe = '__tot__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

const store = storage();
let seen = new Set();

function loadSeen() {
  if (!store) return;
  try {
    const raw = JSON.parse(store.getItem(SEEN_KEY) ?? '[]');
    if (Array.isArray(raw)) seen = new Set(raw.filter((n) => Number.isInteger(n)));
  } catch {
    seen = new Set();
  }
}

function markSeen(id) {
  seen.add(id);
  if (!store) return;
  try {
    store.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    /* out of quota, or blocked mid-session -- the in-memory set still works */
  }
}

function playerId() {
  const fresh = () =>
    (crypto.randomUUID?.() ?? `p${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`).replace(
      /[^A-Za-z0-9_-]/g,
      '',
    );
  if (!store) return fresh();
  try {
    let id = store.getItem(PLAYER_KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = fresh();
      store.setItem(PLAYER_KEY, id);
    }
    return id;
  } catch {
    return fresh();
  }
}

/* ------------------------------------------------------------------ *
 * Screens
 * ------------------------------------------------------------------ */

function show(which) {
  for (const name of ['loading', 'game', 'done', 'failed']) {
    el[name].classList.toggle('hidden', name !== which);
  }
}

/* ------------------------------------------------------------------ *
 * The game
 * ------------------------------------------------------------------ */

const me = playerId();
let statements = [];
let current = null;
let busy = false;

async function loadStatements() {
  const response = await fetch('/api/statements', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`statements: ${response.status}`);
  const data = await response.json();
  statements = Array.isArray(data.statements) ? data.statements : [];
}

function showNext() {
  current = pickNext(statements, seen);

  if (!current) {
    show('done');
    return;
  }

  el.statement.textContent = current.text;

  // Back to a clean slate: no result, both answers live again.
  el.result.classList.add('hidden');
  el.sourceNote.classList.add('hidden');
  el.choices.classList.remove('hidden');
  el.skipLine.classList.remove('hidden');
  el.barTrump.style.width = '50%';
  el.barToddler.style.width = '50%';
  el.pctTrump.textContent = '50%';
  el.pctToddler.textContent = '50%';
  el.legendTrump.classList.remove('picked');
  el.legendToddler.classList.remove('picked');
  for (const button of el.choices.querySelectorAll('button')) button.disabled = false;

  show('game');
}

function reveal(counts, choice, sourceNote) {
  const { total, trumpPct, toddlerPct } = computeSplit(counts);

  el.pctTrump.textContent = `${trumpPct}%`;
  el.pctToddler.textContent = `${toddlerPct}%`;

  const picked = choice === 'trump' ? 'Trump' : 'Toddler';
  const votes = total === 1 ? '1 vote so far' : `${total} votes so far`;
  el.tally.textContent = `You said ${picked} \u00b7 ${votes}`;

  el.legendTrump.classList.toggle('picked', choice === 'trump');
  el.legendToddler.classList.toggle('picked', choice === 'toddler');

  if (sourceNote) {
    el.sourceNote.textContent = sourceNote;
    el.sourceNote.classList.remove('hidden');
  }

  el.choices.classList.add('hidden');
  el.skipLine.classList.add('hidden');
  el.result.classList.remove('hidden');

  // The bar is rendered at 50/50 first, then slides to the real split, so the
  // reveal reads as a result arriving rather than a number appearing.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.barTrump.style.width = `${trumpPct}%`;
      el.barToddler.style.width = `${toddlerPct}%`;
    });
  });
}

async function vote(choice) {
  if (busy || !current) return;
  busy = true;
  for (const button of el.choices.querySelectorAll('button')) button.disabled = true;

  const statement = current;
  try {
    const response = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statementId: statement.id, playerId: me, choice }),
    });

    if (!response.ok) throw new Error(`vote: ${response.status}`);
    const data = await response.json();

    // Keep the local copy current so the next pick ranks on fresh numbers.
    statement.trump_votes = data.trump_votes;
    statement.toddler_votes = data.toddler_votes;

    markSeen(statement.id);
    reveal(data, choice, data.source_note ?? statement.source_note);
  } catch {
    // Let them try again rather than losing the statement.
    el.tally.textContent = '';
    for (const button of el.choices.querySelectorAll('button')) button.disabled = false;
    el.statement.textContent = statement.text;
    alert("Couldn't record that vote. Check your connection and try again.");
  } finally {
    busy = false;
  }
}

/* Skipping hides the statement for good but never shows the split -- that is
   the whole point of not having a "reveal without voting" button. */
function skip() {
  if (busy || !current) return;
  markSeen(current.id);
  showNext();
}

el.choices.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-choice]');
  if (button) vote(button.dataset.choice);
});

el.skip.addEventListener('click', skip);
el.next.addEventListener('click', showNext);

loadSeen();
loadStatements()
  .then(showNext)
  .catch(() => show('failed'));
