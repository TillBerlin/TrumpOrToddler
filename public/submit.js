const form = document.getElementById('form');
const text = document.getElementById('text');
const sourceNote = document.getElementById('sourceNote');
const count = document.getElementById('count');
const button = document.getElementById('submit');
const message = document.getElementById('message');

function say(content, bad = false) {
  message.textContent = content;
  message.classList.toggle('bad', bad);
  message.classList.remove('hidden');
}

text.addEventListener('input', () => {
  count.textContent = String(text.value.length);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!text.value.trim()) {
    say('Please write a statement first.', true);
    return;
  }

  button.disabled = true;
  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.value, sourceNote: sourceNote.value }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      say(data.error ?? 'That did not go through. Try again in a moment.', true);
      return;
    }

    say('Thanks! Your statement will appear after review.');
    form.reset();
    count.textContent = '0';
  } catch {
    say('That did not go through. Check your connection and try again.', true);
  } finally {
    button.disabled = false;
  }
});
