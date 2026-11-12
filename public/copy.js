const form = document.getElementById('form');
const email = document.getElementById('email');
const website = document.getElementById('website');
const consent = document.getElementById('consent');
const button = document.getElementById('submit');
const remove = document.getElementById('remove');
const message = document.getElementById('message');

// Sent with the form: people take a moment, bots do not.
const openedAt = Date.now();

function say(content, bad = false) {
  message.textContent = content;
  message.classList.toggle('bad', bad);
  message.classList.remove('hidden');
}

async function send(payload) {
  const response = await fetch('/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email.value,
      website: website.value,
      elapsedMs: Date.now() - openedAt,
      ...payload,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'That did not go through. Try again in a moment.');
  return data;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!email.value.trim()) return say('Please enter your email address.', true);
  if (!consent.checked) return say('Please tick the box so we are allowed to email you.', true);

  button.disabled = true;
  try {
    await send({ consent: true });
    say("You're on the list. We'll email you once, when the deck can be ordered.");
    form.reset();
  } catch (err) {
    say(err.message, true);
  } finally {
    button.disabled = false;
  }
});

remove.addEventListener('click', async () => {
  if (!email.value.trim()) {
    email.focus();
    return say('Type the address you signed up with above, then tap "Take me off the list" again.', true);
  }
  remove.disabled = true;
  try {
    await send({ remove: true });
    say('Done. If that address was on the list, it is not any more.');
    form.reset();
  } catch (err) {
    say(err.message, true);
  } finally {
    remove.disabled = false;
  }
});
