import { computeSplit } from '/lib/game.js';

const TOKEN_KEY = 'tot.adminToken';

const login = document.getElementById('login');
const panel = document.getElementById('panel');
const tokenInput = document.getElementById('token');
const message = document.getElementById('message');
const summary = document.getElementById('summary');

const lists = {
  pending: document.getElementById('pending'),
  approved: document.getElementById('approved'),
  hidden: document.getElementById('hidden-list'),
};
const counters = {
  pending: document.getElementById('pending-count'),
  approved: document.getElementById('approved-count'),
  hidden: document.getElementById('hidden-count'),
};

/* The token lives in sessionStorage, so closing the tab forgets it. */
function readToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeToken(value) {
  try {
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to do -- the in-memory token still works for this page load */
  }
}

let token = readToken();

function say(content, bad = false) {
  message.textContent = content;
  message.classList.toggle('bad', bad);
  message.classList.toggle('hidden', !content);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token, ...(options.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data;
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function actionButton(label, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function row(statement, kind) {
  const wrapper = document.createElement('div');
  wrapper.className = 'row';

  const body = document.createElement('p');
  body.textContent = statement.text;
  wrapper.append(body);

  if (statement.source_note) {
    const note = document.createElement('p');
    note.className = 'meta';
    note.textContent = `Source: ${statement.source_note}`;
    wrapper.append(note);
  }

  const meta = document.createElement('p');
  meta.className = 'meta';
  if (kind === 'pending') {
    meta.textContent = `#${statement.id} · submitted ${statement.created_at}`;
  } else {
    const { total, trumpPct, toddlerPct } = computeSplit(statement);
    meta.textContent =
      total === 0
        ? `#${statement.id} · no votes yet`
        : `#${statement.id} · ${total} vote${total === 1 ? '' : 's'} · Trump ${trumpPct}% / Toddler ${toddlerPct}%`;
  }
  wrapper.append(meta);

  const actions = document.createElement('div');
  actions.className = 'actions';

  if (kind === 'pending') {
    actions.append(actionButton('Approve', () => act({ id: statement.id, action: 'approve' })));
    actions.append(actionButton('Edit then approve', () => openEditor(wrapper, statement)));
    actions.append(actionButton('Reject', () => confirmReject(statement)));
  } else if (kind === 'approved') {
    actions.append(actionButton('Edit', () => openEditor(wrapper, statement, 'update')));
    actions.append(actionButton('Hide', () => act({ id: statement.id, action: 'hide' })));
  } else {
    actions.append(actionButton('Show again', () => act({ id: statement.id, action: 'unhide' })));
    actions.append(actionButton('Delete', () => confirmReject(statement)));
  }

  wrapper.append(actions);
  return wrapper;
}

function openEditor(wrapper, statement, action = 'approve') {
  if (wrapper.querySelector('.edit')) return;

  const box = document.createElement('div');
  box.className = 'edit';

  const text = document.createElement('input');
  text.type = 'text';
  text.maxLength = 120;
  text.value = statement.text;

  const note = document.createElement('input');
  note.type = 'text';
  note.maxLength = 200;
  note.placeholder = 'Source note (optional)';
  note.value = statement.source_note ?? '';

  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(
    actionButton(action === 'update' ? 'Save' : 'Save and approve', () =>
      act({ id: statement.id, action, text: text.value, sourceNote: note.value }),
    ),
  );
  actions.append(actionButton('Cancel', () => box.remove()));

  box.append(text, note, actions);
  wrapper.append(box);
  text.focus();
}

function confirmReject(statement) {
  const ok = window.confirm(`Delete this statement for good?\n\n"${statement.text}"`);
  if (ok) act({ id: statement.id, action: 'reject' });
}

async function act(payload) {
  try {
    await api('/api/admin/action', { method: 'POST', body: JSON.stringify(payload) });
    say('');
    await refresh();
  } catch (err) {
    say(err.message, true);
  }
}

function fill(container, statements, kind, emptyText) {
  container.replaceChildren();
  if (statements.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'meta';
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }
  for (const statement of statements) container.append(row(statement, kind));
}

async function refresh() {
  const data = await api('/api/admin/statements');

  counters.pending.textContent = String(data.pending.length);
  counters.approved.textContent = String(data.approved.length);
  counters.hidden.textContent = String(data.hidden.length);

  const votes = data.approved.reduce((sum, s) => sum + s.trump_votes + s.toddler_votes, 0);
  summary.textContent = `${data.approved.length} statements live, ${votes} votes cast.`;

  fill(lists.pending, data.pending, 'pending', 'Nothing waiting. ');
  fill(lists.approved, data.approved, 'approved', 'No approved statements yet — import the seed file.');
  fill(lists.hidden, data.hidden, 'hidden', 'Nothing hidden.');
}

/* ------------------------------------------------------------------ *
 * Sign in / out
 * ------------------------------------------------------------------ */

async function open(candidate) {
  token = candidate;
  try {
    await refresh();
    writeToken(candidate);
    login.classList.add('hidden');
    panel.classList.remove('hidden');
    say('');
  } catch (err) {
    token = '';
    writeToken('');
    login.classList.remove('hidden');
    panel.classList.add('hidden');
    say(err.message, true);
  }
}

login.addEventListener('submit', (event) => {
  event.preventDefault();
  open(tokenInput.value.trim());
});

document.getElementById('signout').addEventListener('click', () => {
  token = '';
  writeToken('');
  panel.classList.add('hidden');
  login.classList.remove('hidden');
  tokenInput.value = '';
});

if (token) open(token);
