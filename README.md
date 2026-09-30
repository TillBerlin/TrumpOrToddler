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

_Cannot install anything? Skip this — see [Deploying from a browser](#deploying-from-a-browser-nothing-installed)._

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

If you set the site up from a browser, regenerate the paste-ready SQL too:

```bash
npm run build:setup-sql   # rewrites setup.sql from schema.sql + seed/statements.json
```

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

## Deploying from a browser (nothing installed)

This is the whole setup with no terminal, no Node.js and no admin rights — a
browser and a free [Cloudflare account](https://dash.cloudflare.com/sign-up) is
all it takes. No credit card; this app sits comfortably inside the free tier.
When Cloudflare offers to add a domain or pick a paid plan during signup, skip
both.

**1. Create the database**

In the Cloudflare dashboard: **Storage & Databases → D1 SQL Database → Create
Database**. Name it exactly `trump_or_toddler` and select **Create**.

On the database's page, copy the **Database ID** (a long string of letters,
numbers and dashes).

**2. Put that id into `wrangler.toml`**

On GitHub, open `wrangler.toml`, select the pencil icon to edit it, and replace
`REPLACE_WITH_YOUR_DATABASE_ID` with the id you just copied. Commit the change.

The database id is not a secret, so it is fine in the repository. This has to
happen before step 4, because the build reads this file to find the database.

**3. Create the tables and load the statements**

Still on the database's page, open the **Console** tab. Copy the entire contents
of [`setup.sql`](setup.sql) from this repository, paste it in, and select
**Execute**.

That creates the tables and imports all the starting statements in one go.
Running it a second time is harmless — statements already there keep their
votes.

`setup.sql` contains no `--` comments on purpose. The console is a single-line
input, so a pasted file arrives with its newlines flattened; a `--` would then
comment out everything after it and the request would reach the server with no
query in it at all. For the same reason, every line in the file is one complete
statement — so if a paste is ever rejected for length, you can split it at any
line break and paste it in a few goes.

**4. Publish the site**

Go to **Workers & Pages → Create application → Pages → Connect to Git**. Sign in
to GitHub, authorise Cloudflare for this repository, pick `TrumpOrToddler`, and
select **Begin setup**.

On the build settings screen:

| Field | Value |
| --- | --- |
| Framework preset | None |
| Build command | *leave empty* |
| Build output directory | `public` |

Select **Save and Deploy**. After a minute you get a URL like
`https://trump-or-toddler.pages.dev` — the game is live and playable.

You do not need to add the D1 binding by hand: `wrangler.toml` declares it, and
for a Git-connected project that file is the source of truth for bindings.

**5. Set your admin password**

In the new project: **Settings → Variables and Secrets → Add**. Choose type
**Secret**, name it `ADMIN_TOKEN`, and set a long random value — this is the
password for `/admin`, so make it a real one. Add a second secret called
`RATE_SALT` with a different random value.

Then go to **Deployments** and redeploy the latest one, so the new secrets are
picked up. `/admin` works from then on.

**Until `ADMIN_TOKEN` is set, `/admin` refuses every request** — it does not
fall back to an empty or default password.

**Afterwards**

Every push to `main` redeploys automatically. Editing files through GitHub's web
editor is enough to change the site — still no terminal needed.

Put your live URL at the top of this README and in the repository's **About**
field, so the link is the first thing anyone sees.

---

## Deploying from the command line

If you do have a machine where you can install things, this is fewer steps.
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
