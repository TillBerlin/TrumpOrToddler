import { computeSplit, parseSharedId, pickNext, SHOW_TOTAL_FROM, totalVotes } from '/lib/game.js';

const PLAYER_KEY = 'tot.playerId';
const SEEN_KEY = 'tot.seen';

const el = {
  loading: document.getElementById('loading'),
  game: document.getElementById('game'),
  done: document.getElementById('done'),
  failed: document.getElementById('failed'),
  statement: document.getElementById('statement'),
  choices: document.getElementById('choices'),
  result: document.getElementById('result'),
  barTrump: document.getElementById('bar-trump'),
  barToddler: document.getElementById('bar-toddler'),
  pctTrump: document.getElementById('pct-trump'),
  pctToddler: document.getElementById('pct-toddler'),
  legendTrump: document.getElementById('legend-trump'),
  legendToddler: document.getElementById('legend-toddler'),
  tally: document.getElementById('tally'),
  sourceNote: document.getElementById('source-note'),
  rating: document.querySelector('.rating-buttons'),
  share: document.getElementById('share'),
  restart: document.getElementById('restart'),
  restartDone: document.getElementById('restart-done'),
  voteCount: document.getElementById('vote-count'),
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

let me = playerId();
let statements = [];
let current = null;
let shownAt = 0;
let busy = false;

/* A link like /?s=12 opens on that statement, however the sampler would have
   ranked it -- somebody was sent it on purpose. It applies once, then the
   normal order takes over. */
let pinned = parseSharedId(window.location.search);

function forgetSharedId() {
  try {
    window.history.replaceState({}, '', window.location.pathname);
  } catch {
    /* older browsers just keep the query string; harmless */
  }
}

/** Fresh identity and a clean slate -- for a shared computer, or a replay. */
function startOver() {
  seen = new Set();
  try {
    store?.removeItem(SEEN_KEY);
    store?.removeItem(PLAYER_KEY);
  } catch {
    /* the in-memory reset below still applies */
  }
  me = playerId();
  pinned = null;
  showNext();
}

async function share() {
  if (!current) return;
  const url = `${window.location.origin}/?s=${current.id}`;
  const text = `"${current.text}" — Trump or toddler?`;

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Trump or Toddler', text, url });
      return;
    } catch (err) {
      // Dismissing the share sheet is not a failure; do not then also copy.
      if (err?.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    el.share.textContent = 'Link copied';
  } catch {
    // No clipboard (http, or an older browser): show it so it can be copied.
    el.share.textContent = url;
  }
}

function updateFooterCount() {
  const total = statements.reduce((sum, s) => sum + totalVotes(s), 0);
  if (total < SHOW_TOTAL_FROM) return; // a tiny number looks worse than none
  el.voteCount.textContent = `${total.toLocaleString()} votes so far`;
  el.voteCount.classList.remove('hidden');
}

async function loadStatements() {
  const response = await fetch('/api/statements', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`statements: ${response.status}`);
  const data = await response.json();
  statements = Array.isArray(data.statements) ? data.statements : [];
}

function showNext() {
  current = null;
  if (pinned !== null) {
    current = statements.find((s) => s.id === pinned) ?? null;
    pinned = null;
    if (current) forgetSharedId();
  }
  if (!current) current = pickNext(statements, seen);

  if (!current) {
    show('done');
    return;
  }

  el.statement.textContent = current.text;

  // Back to a clean slate: no result, both answers live again.
  el.result.classList.add('hidden');
  el.sourceNote.classList.add('hidden');
  el.choices.classList.remove('hidden');
  el.barTrump.style.width = '50%';
  el.barToddler.style.width = '50%';
  el.pctTrump.textContent = '50%';
  el.pctToddler.textContent = '50%';
  el.legendTrump.classList.remove('picked');
  el.legendToddler.classList.remove('picked');
  for (const button of el.choices.querySelectorAll('button')) button.disabled = false;
  for (const button of el.rating.querySelectorAll('button')) button.disabled = false;
  el.share.textContent = 'Send this one to someone';

  show('game');
  shownAt = performance.now();
}

function reveal(counts, choice, sourceNote) {
  const { total, trumpPct, toddlerPct } = computeSplit(counts);

  el.pctTrump.textContent = `${trumpPct}%`;
  el.pctToddler.textContent = `${toddlerPct}%`;

  const picked = choice === 'trump' ? 'Trump' : 'Toddler';
  const votes = total === 1 ? '1 vote so far' : `${total} votes so far`;
  el.tally.textContent = `You said ${picked} · ${votes}`;

  el.legendTrump.classList.toggle('picked', choice === 'trump');
  el.legendToddler.classList.toggle('picked', choice === 'toddler');

  if (sourceNote) {
    el.sourceNote.textContent = sourceNote;
    el.sourceNote.classList.remove('hidden');
  }

  el.choices.classList.add('hidden');
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
  const decisionMs = Math.round(performance.now() - shownAt);

  try {
    const response = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statementId: statement.id, playerId: me, choice, decisionMs }),
    });

    if (!response.ok) throw new Error(`vote: ${response.status}`);
    const data = await response.json();

    // Keep the local copy current so the next pick ranks on fresh numbers.
    statement.trump_votes = data.trump_votes;
    statement.toddler_votes = data.toddler_votes;

    markSeen(statement.id);
    reveal(data, choice, data.source_note ?? statement.source_note);
    updateFooterCount();
  } catch {
    // Let them try again rather than losing the statement.
    for (const button of el.choices.querySelectorAll('button')) button.disabled = false;
    alert("Couldn't record that vote. Check your connection and try again.");
  } finally {
    busy = false;
  }
}

/* Rating and "next" are the same tap: whichever button they press records the
   rating and moves on. */
async function rate(rating) {
  if (busy || !current) return;
  busy = true;
  for (const button of el.rating.querySelectorAll('button')) button.disabled = true;

  const statement = current;
  try {
    const response = await fetch('/api/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statementId: statement.id, playerId: me, rating }),
    });
    if (response.ok && (await response.json()).counted) {
      // Keep the local counts in step, so the next pick samples fresh beliefs.
      if (rating === 'funny') statement.funny_votes = (statement.funny_votes ?? 0) + 1;
      else statement.meh_votes = (statement.meh_votes ?? 0) + 1;
    }
  } catch {
    // A lost rating is not worth stranding someone mid-game over.
  } finally {
    busy = false;
    showNext();
  }
}

el.choices.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-choice]');
  if (button) vote(button.dataset.choice);
});

el.rating.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-rating]');
  if (button) rate(button.dataset.rating);
});

el.share.addEventListener('click', share);
el.restart.addEventListener('click', startOver);
el.restartDone.addEventListener('click', startOver);

loadSeen();
loadStatements()
  .then(() => {
    updateFooterCount();
    showNext();
  })
  .catch(() => show('failed'));
