# Trump or Toddler

A small web game. You get one statement — *"Insists on pressing the elevator
button themselves."* — and two buttons. Trump, or toddler? Once you commit, you
see how everyone else voted.

Anyone can suggest new statements. They only go live once you approve them.

**Live site:** _add the URL here after your first deploy — see [Deploying](#deploying)._

---

## How it fits together

Everything runs on Cloudflare's free tier, in one project:

| Part | What it does |
| --- | --- |
| **Cloudflare Pages** | serves the three pages in `public/` |
| **Pages Functions** (`functions/`) | the `/api/...` endpoints — voting, submissions, moderation |
| **D1** | an SQLite database holding statements and votes |

No build step, no framework, no dependencies in the browser. The pages are
plain HTML, CSS and ES modules.

```
public/            what the browser gets
  index.html         the game
  submit.html        "add a statement" form
  admin.html         moderation queue
  lib/game.js        vote maths + which statement comes next (shared with tests)
functions/api/     the server endpoints
src/lib/           server-side helpers (sanitising, rate limiting, auth)
seed/statements.json   the starting statements
scripts/import-seed.mjs  loads that file into the database
schema.sql         database tables
tests/             the test suite
```

Which statement you get next is decided **in your browser**, because that is
the only side that knows what you have already seen — and that list never
leaves your device. The rules live in `public/lib/game.js`:

- statements you already voted on or skipped are never shown again;
- otherwise the most evenly split statement wins, because a 50/50 statement is
  a better one than a 95/5;
- about one time in four, a statement with fewer than 20 votes jumps the queue,
  so newly approved submissions get a chance to find their split.

---

## Running it locally

You need [Node.js](https://nodejs.org/) 22 or newer — the tests use Node's
built-in SQLite. Everything below works the same in Windows PowerShell, Command
Prompt, macOS and Linux.

```bash
npm install
```

Create your local secrets file by copying `.dev.vars.example` to `.dev.vars`:

```bash
# PowerShell / Command Prompt
copy .dev.vars.example .dev.vars

# macOS / Linux
cp .dev.vars.example .dev.vars
```

Open `.dev.vars` and set `ADMIN_TOKEN` to whatever you like — locally it is
only a password for your own machine. This file is git-ignored, so it never
leaves your computer.

Create the local database and fill it with the starting statements:

```bash
npm run db:init     # creates the tables
npm run seed        # imports seed/statements.json as approved statements
```

Start it up:

```bash
npm run dev
```

Then open <http://localhost:8788>. The admin page is at
<http://localhost:8788/admin> — it asks for the `ADMIN_TOKEN` you just set.

The local database is a file under `.wrangler/` and is git-ignored. Delete that
folder any time you want to start over, then re-run `npm run db:init` and
`npm run seed`.

---

## The statements

`seed/statements.json` holds the starting set. Edit it freely:

```json
{
  "statements": [
    { "text": "Wears diapers.", "source_note": null },
    { "text": "Would like a parade.", "source_note": "Context, or a link." }
  ]
}
```

- `text` — required, 120 characters or fewer.
- `source_note` — optional. Shown under the result, for statements based on
  something real. Use `null` when it is just a joke.

Then re-run the importer:

```bash
npm run seed            # into the local database
npm run seed:remote     # into the live database
```

Re-running is safe. Duplicates are skipped (ignoring case and spacing), and
statements already in the database keep the votes they have collected. Use
`node scripts/import-seed.mjs --dry-run` to check a file without importing it.

Deleting a line from `seed/statements.json` does **not** remove it from a
database it was already imported into — use **Hide** on the admin page for that.

---

## Moderating

Go to `/admin` and enter your `ADMIN_TOKEN`. There are no accounts; the token
is the only thing standing between the internet and your moderation queue, so
make the live one long and random.

- **Waiting for review** — every new submission lands here and is invisible to
  players. *Approve* puts it into play, *Edit then approve* lets you fix the
  wording first, *Reject* deletes it for good.
- **Live** — everything currently in play, with its vote count and split. *Edit*
  changes the wording without touching the votes; *Hide* takes it out of play
  but keeps it (and its votes) so you can bring it back.
- **Hidden** — statements you took down. *Show again* returns them to play.

The token is kept in `sessionStorage`, so closing the tab forgets it.

---

## Deploying

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up). No
credit card, and this app sits comfortably inside the free tier.

**1. Sign in**

```bash
npx wrangler login
```

**2. Create the database**

```bash
npx wrangler d1 create trump_or_toddler
```

It prints a block ending in `database_id = "..."`. Copy that id into
`wrangler.toml`, replacing `REPLACE_WITH_YOUR_DATABASE_ID`.

**3. Create the tables and import the statements**

```bash
npm run db:init:remote
npm run seed:remote
```

**4. Deploy**

```bash
npm run deploy
```

The first run asks you to create a Pages project — accept the suggested name
(`trump-or-toddler`) and it publishes to `https://trump-or-toddler.pages.dev`.
Put that URL at the top of this README and in the repository's **About** field,
so the link is the first thing anyone sees.

**5. Set the admin token on the live site**

```bash
npx wrangler pages secret put ADMIN_TOKEN
npx wrangler pages secret put RATE_SALT
```

Each command asks you to paste a value. Use a long random string for both.
`ADMIN_TOKEN` is your admin password; `RATE_SALT` is only used to hash IP
addresses for rate limiting. **Until `ADMIN_TOKEN` is set, `/admin` refuses
every request** — it does not fall back to an empty or default password.

To deploy later changes, just `npm run deploy` again.

### A custom domain

In the Cloudflare dashboard: **Workers & Pages → trump-or-toddler → Custom
domains**. Free, and it works with domains registered elsewhere.

---

## What gets stored

- **Statements** and their vote totals.
- **Votes**, as `(statement id, anonymous player id, which side)`. The player
  id is a random string generated in the browser and kept in `localStorage`. It
  is not tied to anything about the person.
- **Rate limiting**, as salted SHA-256 hashes of IP addresses with a timestamp.
  Raw addresses are never written down, and rows outside the current hour are
  deleted on every check.

No accounts, no analytics, no cookies, no third-party requests.

### How solid is the vote protection?

Deliberately light. One vote per `(statement, player)` is enforced by a database
constraint, and votes are capped at 200 per hour per IP address. Someone who
clears their browser storage gets a fresh player id — that is fine. The point is
to stop casual double-voting and scripted flooding, not to be unfalsifiable.

---

## Tests

```bash
npm test          # once
npm run test:watch
```

The suite covers the two pieces of logic most likely to break quietly:

- **Vote counting** — that a vote lands on the right side, that one player
  cannot vote twice on the same statement (including by changing their mind),
  that pending and hidden statements refuse votes, and that rate limiting works
  per address and expires.
- **Next-statement selection** — that seen statements never come back, that the
  most evenly split one wins, that new statements get their share, and that a
  player walks through every statement exactly once before the end screen.

The vote tests run against a real SQLite database using the same `schema.sql`
the live site uses, so the `UNIQUE` constraints are genuinely exercised rather
than mocked.
