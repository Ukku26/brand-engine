# Brand Engine

A small multi-brand workspace app: each brand gets its own point-of-view
profile, its own reference material, and its own generation history -
all kept separate from every other brand.

This is the "fast path" version: one app, one local database file,
no servers to manage. It's meant to prove the concept with a few real
brands before deciding if you ever need something heavier.

---

## 1. One-time setup (do this once)

### Install Node.js
If you don't already have it: go to **https://nodejs.org**, download
the "LTS" version, and run the installer. This gives you both `node`
and `npm`, which is everything else below needs.

To check it worked, open a terminal (Mac: Terminal app, Windows:
Command Prompt) and type:
```
node --version
```
You should see something like `v22.x.x`. If you see an error instead,
the install didn't complete - try again or search "install node.js
[your OS]".

### Get an Anthropic API key
Go to **https://console.anthropic.com**, sign in, and create an API
key. Keep this private - it's tied to your billing.

### Get the project running
1. Unzip this project folder somewhere on your computer.
2. Open a terminal and navigate into the folder:
   ```
   cd path/to/brand-engine
   ```
   (Drag the folder into the terminal window after typing `cd ` - most
   terminals will fill in the path for you.)
3. Install the project's dependencies (only needed once, or after I
   give you new code that adds a dependency):
   ```
   npm install
   ```
   This downloads a few packages into a `node_modules` folder. It's
   normal for this to take a minute and print a lot of text.
4. Create your personal config file:
   ```
   cp .env.example .env
   ```
   Then open `.env` in any text editor and paste your real API key in
   place of `your-key-here`.
5. Start the app:
   ```
   npm start
   ```
   You should see `Brand Engine running at http://localhost:3000`.
6. Open that address in your browser: **http://localhost:3000**

To stop the app, go back to the terminal and press `Ctrl+C`. To start
it again later, you just repeat step 5 (no need to redo `npm install`
unless dependencies changed).

---

## 2. Using it

- **Create a brand** from the home screen - this gives it its own
  workspace, completely separate database rows from every other brand.
- **Point of view tab**: fill in insights, values, beliefs, taste,
  judgement, a POV statement, and voice rules. This is what makes
  generations sound like *this* brand instead of a generic AI answer.
  You don't need to fill in everything at once - the more specific you
  are, the better the output gets.
- **Reference material tab**: paste in brand guidelines, past
  campaigns, product descriptions - anything you want the generator to
  draw on.
- **Generate tab**: type what you want (e.g. "Write 5 taglines for our
  spring launch") and it'll generate using that brand's POV + reference
  material only. Approve or reject the result.
- **History tab**: every generation for this brand, with its status.
  Approved generations get fed back in as examples for future
  generations of the same brand - this is how the system slowly gets
  better at sounding like each brand, without any retraining.

Switching brands in the sidebar switches the entire workspace - POV,
assets, generate, and history are all scoped to whichever brand is
selected. There's no login system right now since it's just the two
of you; if that ever changes, see "When to upgrade" below.

---

## 3. How the project is organized

```
brand-engine/
  server.js              - starts the app, wires everything together
  db.js                  - database setup (this is the schema - read
                           the comments at the top, they explain the
                           single most important rule in the app)
  lib/
    anthropic.js         - talks to the Claude API
    buildSystemPrompt.js - turns a brand's POV + assets into the
                           instructions sent to Claude
  routes/
    brands.js            - brand / POV / reference-material endpoints
    generate.js          - generation + history endpoints
  public/                - the actual web pages (no build step -
                           just HTML, CSS, and JS you can open and read)
    index.html           - brand picker / creation
    brand.html           - the workspace (tabs)
    style.css
    app.js
  data.db                - created automatically the first time you
                           run the app. This file IS your database -
                           back it up if you care about the data.
```

Every file has comments explaining what it does and why. If something
doesn't make sense, paste the file into a conversation with Claude and
ask - that's the intended workflow here.

---

## 4. Making changes

Since it's the two of you: the normal loop is "describe what you want
changed, paste in the relevant file(s) if Claude doesn't already have
them, get the updated code back, save it, restart the app with
`npm start`." A few things worth knowing as the non-engineer half of
the team:

- **You don't need to understand every line** - you do need to be able
  to find the right file, paste code in, save it, and restart the app.
- **Restart after any backend change** (anything in `server.js`,
  `db.js`, `lib/`, or `routes/`). Press `Ctrl+C` then `npm start` again.
- **No restart needed for frontend changes** (anything in `public/`) -
  just refresh the browser.
- **If something breaks**, copy the error text from the terminal into
  a conversation with Claude along with which file you changed.

---

## 5. When to upgrade past this version

This fast-path version intentionally skips a few things. Here's the
signal for when each one is worth adding - don't add them before you
actually hit the problem:

| Symptom | What to add |
|---|---|
| More than one person needs different permissions per brand | A real login system + roles (admin/editor/viewer) |
| A brand's reference material gets too large to "stuff" into one prompt, or generations start ignoring older material | Real retrieval: embeddings + a vector search step instead of including everything |
| You need to prove to a client that their data is physically isolated (contracts, compliance) | Per-brand database schemas/databases instead of a shared one filtered by `brand_id` |
| You want automatic quality scoring instead of manual approve/reject | An evaluation pipeline that scores brand-fit automatically |
| You want to bill clients by usage | Per-brand usage tracking and reporting |

If you hit any of these, bring it back to a conversation with Claude -
the data model here was deliberately kept simple so migrating later
isn't a rewrite, just an addition.
