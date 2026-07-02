# Brand Engine

A multi-brand generative workspace. Each brand gets its own point-of-view profile, brand book, campaign briefs, and generation history — completely isolated from every other brand.

This is the "fast path" version: one app, one local database file, no servers to manage. It's meant to prove the concept with a few real brands before deciding if you ever need something heavier.

Generation is structured around campaign **briefs** so approved outputs within a brief train the system's taste for that specific campaign type — a Diwali campaign learns from Diwali approvals, a performance campaign learns from performance approvals.

Live on Railway: see your Railway project dashboard for the URL.

---

## Table of Contents

1. [One-time setup](#1-one-time-setup)
2. [Using it](#2-using-it)
3. [Site structure](#3-site-structure)
4. [How the project is organised](#4-how-the-project-is-organised)
5. [Making changes](#5-making-changes)
6. [Data schema](#6-data-schema)
7. [Ingestion & data flow](#7-ingestion--data-flow)
8. [Prompt architecture](#8-prompt-architecture)
9. [Token optimisation strategy](#9-token-optimisation-strategy)
10. [Campaign briefs & objectives](#10-campaign-briefs--objectives)
11. [API routes](#11-api-routes)
12. [Deployment (Railway)](#12-deployment-railway)
13. [When to upgrade](#13-when-to-upgrade)

---

## 1. One-time setup

### Install Node.js
If you don't already have it: go to **https://nodejs.org**, download the "LTS" version, and run the installer. This gives you both `node` and `npm`.

To check it worked, open a terminal and type:
```
node --version
```
You should see something like `v22.x.x`.

### Get an Anthropic API key
Go to **https://console.anthropic.com**, sign in, and create an API key. Keep this private — it's tied to your billing.

### Get the project running
1. Clone or unzip this project folder somewhere on your computer.
2. Open a terminal and navigate into the folder:
   ```
   cd path/to/brand-engine
   ```
3. Install dependencies (only needed once):
   ```
   npm install
   ```
4. Create your config file:
   ```
   cp .env.example .env
   ```
   Open `.env` in any text editor and paste your real API key in place of `your-key-here`.
5. Start the app:
   ```
   npm start
   ```
   You should see `Brand Engine running at http://localhost:3000`.
6. Open **http://localhost:3000** in your browser.

To stop: `Ctrl+C`. To start again later: just `npm start`.

---

## 2. Using it

**Brand workspace** (`/brand.html?id=X`):

- **Point of view tab**: fill in insights, values, beliefs, taste, judgement, a POV statement, voice rules, and optionally a full Brand Book. This is the judgement layer — what makes generations sound like *this* brand instead of a generic AI answer. Fill in what you have; you can refine it later. More specific = better output.
- **Brand Assets tab**: paste in brand-level reference material — guidelines, past campaigns, product descriptions. Available across all campaigns for this brand.
- **Briefs tab**: each brief is a campaign or project (e.g. "Diwali 2026", "Social Calendar Q3", "Brand Film"). Click through to the brief workspace to generate within that campaign context.
- **History tab**: every generation across all briefs for this brand.

**Brief workspace** (`/brief.html?brand=X&brief=Y`):

- **Brief tab**: name, status (active / completed / archived), default campaign objective, and a context field — write the campaign brief here. This context is prepended to every generation prompt automatically.
- **Campaign Assets tab**: reference material specific to this campaign (mood board notes, competitor ads, event brief). Retrieved alongside brand assets.
- **Generate tab**: pick Format → Platform → Placement → Size (drives Claude's format constraints), then set Objective (or inherit from brief default), then write what you need.
- **History tab**: every generation for this brief. Approve or reject — approved outputs are fed back as examples for *future generations within this same brief*, so the system slowly learns what good looks like for this specific campaign.

Switching between briefs in the sidebar keeps you within the same brand. Going back to the brand workspace and picking a different brief changes campaign context entirely.

---

## 3. Site structure

```
/                               index.html  — brand picker & creation
/brand.html?id=X                brand.html  — brand workspace (4 tabs)
/brief.html?brand=X&brief=Y     brief.html  — campaign brief workspace (4 tabs)
```

| Page | Tabs |
|------|------|
| Brand workspace | Point of view · Brand Assets · Briefs · History |
| Brief workspace | Brief · Campaign Assets · Generate · History |

---

## 4. How the project is organised

```
brand-engine/
  server.js              starts the app, wires everything together
  db.js                  database setup (schema, migrations, seed data —
                         read the comment at the top: it explains the
                         single most important rule in the whole app)
  lib/
    anthropic.js         talks to the Claude API; handles prompt caching
                         and async POV compilation
    buildSystemPrompt.js assembles the full system prompt from all layers
                         (POV, brand book, assets, brief assets, examples,
                         objective, content spec)
    tfidf.js             local RAG: build TF-IDF embeddings, cosine
                         similarity retrieval — no external embedding API
    maxTokens.js         infers the right token budget from the spec or prompt
  routes/
    brands.js            brand CRUD, POV, brand assets
    briefs.js            brief CRUD, brief assets, generation within brief
    generate.js          brand-level generation, history, approve/reject
  public/                plain HTML/CSS/JS — no build step, open and read
    index.html           brand picker
    brand.html           brand workspace
    brief.html           brief workspace
    style.css
    app.js               shared helpers (api(), escapeHtml(), colorForName())
  data.db                created automatically on first run.
                         This file IS your database — back it up.
```

Every file has comments explaining what it does and why. If something doesn't make sense, paste the file into a conversation with Claude and ask — that's the intended workflow.

---

## 5. Making changes

The normal loop: describe what you want changed → get updated code → save → restart app.

- **Restart required** after any backend change (`server.js`, `db.js`, `lib/`, `routes/`): `Ctrl+C` then `npm start`.
- **No restart needed** for frontend changes (`public/`): just refresh the browser.
- **If something breaks**: copy the error text from the terminal into a conversation with Claude along with which file you changed.

---

## 6. Data schema

All brand-scoped tables have a `brand_id` column. Every query filters by it. This is the single mechanism that prevents Brand A's data ever touching Brand B's. New tables should always get a `brand_id` column.

### `brands`
```sql
id          INTEGER PRIMARY KEY AUTOINCREMENT
name        TEXT NOT NULL
created_at  TEXT DEFAULT (datetime('now'))
```

### `brand_pov`
One row per brand. The judgement layer.
```sql
brand_id        INTEGER PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE
insights        TEXT    -- what we know about the audience others miss
core_values     TEXT    -- what this brand stands for
beliefs         TEXT    -- what this brand believes to be true
taste           TEXT    -- aesthetic preferences
judgement       TEXT    -- rules for deciding if something is good enough to ship
pov_statement   TEXT    -- one or two sentence stake in the ground
voice_rules     TEXT    -- tone do's and don'ts
brand_book      TEXT    -- full brand guidelines / identity doc (8k char cap in prompt)
pov_compiled    TEXT    -- async Claude-compressed dense paragraph of the 7 POV fields
```

### `brand_assets`
Brand-level reference material. Available across all campaigns.
```sql
id          INTEGER PRIMARY KEY AUTOINCREMENT
brand_id    INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE
title       TEXT NOT NULL
content     TEXT NOT NULL
embedding   TEXT    -- JSON TF-IDF vector for RAG retrieval
created_at  TEXT DEFAULT (datetime('now'))
```

### `briefs`
Named containers for a campaign or project.
```sql
id          INTEGER PRIMARY KEY AUTOINCREMENT
brand_id    INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE
name        TEXT NOT NULL
context     TEXT    -- campaign brief (prepended to every generation prompt)
objective   TEXT    -- default: reach | awareness | mental-availability |
                    --          engagement | lead-gen | conversion | retention
status      TEXT    -- active | completed | archived
created_at  TEXT DEFAULT (datetime('now'))
```

### `brief_assets`
Campaign-specific reference material.
```sql
id          INTEGER PRIMARY KEY AUTOINCREMENT
brief_id    INTEGER NOT NULL REFERENCES briefs(id) ON DELETE CASCADE
brand_id    INTEGER NOT NULL
title       TEXT NOT NULL
content     TEXT NOT NULL
embedding   TEXT    -- JSON TF-IDF vector for RAG retrieval
created_at  TEXT DEFAULT (datetime('now'))
```

### `generations`
Every generation request + result.
```sql
id           INTEGER PRIMARY KEY AUTOINCREMENT
brand_id     INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE
brief_id     INTEGER REFERENCES briefs(id)   -- NULL = brand-level generation
prompt       TEXT NOT NULL
output       TEXT
status       TEXT DEFAULT 'pending'           -- pending | approved | rejected
format       TEXT                             -- video | audio | image | text | gif
platform     TEXT                             -- instagram | facebook | youtube | …
placement    TEXT                             -- reels | feed | stories | sponsored | …
size         TEXT                             -- 15s | 30s | 1080x1080 | 2200chars | …
content_type TEXT                             -- script | voiceover | caption | ad copy | …
objective    TEXT                             -- per-generation override (or brief default)
created_at   TEXT DEFAULT (datetime('now'))
```

### `platform_specs`
102 rows seeded at startup. Drives cascading dropdowns and injects hard format constraints into the system prompt.
```sql
id           INTEGER PRIMARY KEY AUTOINCREMENT
format       TEXT    -- video | audio | image | text | gif
platform     TEXT
placement    TEXT
size         TEXT
size_label   TEXT    -- human label (e.g. "30 seconds", "2,200 chars")
dimensions   TEXT    -- pixel dimensions or "—" for text
content_type TEXT    -- maps to a specific system-prompt instruction block
UNIQUE(format, platform, placement, size)
```

---

## 7. Ingestion & data flow

### Brand setup
```
User fills POV fields → PUT /api/brands/:id/pov
  ├── Saves all 7 fields + brand_book to brand_pov
  ├── Clears pov_compiled (now stale)
  └── Async: compilePov() → Claude compresses 7 fields to dense paragraph
              → saved to brand_pov.pov_compiled for next generation
```

### Asset ingestion (brand or brief)
```
User pastes title + content → POST /api/brands/:id/assets
                              POST /api/brands/:id/briefs/:briefId/assets
  ├── buildEmbedding(title + content) → TF-IDF JSON vector
  └── Saved with embedding column populated
```

### Generation flow
```
User submits prompt + spec + objective
→ POST /api/brands/:id/briefs/:briefId/generate
  │
  ├── 1. Resolve spec row from platform_specs (format+platform+placement+size)
  ├── 2. Effective objective = body.objective || brief.objective || null
  ├── 3. Approved examples = generations WHERE brief_id=? AND status='approved' LIMIT 3
  ├── 4. Brand assets RAG  → topAssets(prompt, allBrandAssets, top=2)
  ├── 5. Brief assets RAG  → topAssets(prompt, allBriefAssets, top=2)
  ├── 6. maxTokens = inferMaxTokensFromSpec(spec) || inferMaxTokens(prompt)
  ├── 7. systemPrompt = buildSystemPrompt(pov, brandAssets, examples, spec, { briefAssets, objective })
  ├── 8. userPrompt = "CAMPAIGN BRIEF CONTEXT:\n{brief.context}\n\n---\n\n{prompt}"
  └── 9. generate(systemPrompt, userPrompt, maxTokens) → Claude API
        └── INSERT into generations with all spec + objective columns
```

---

## 8. Prompt architecture

The system prompt is assembled in 9 layers, in this order:

```
1. BASE INSTRUCTION
   "Stay within this brand's POV. No generic safe choices."

2. BRAND POV
   pov_compiled (if ready) or structured fields + Voice Rules

3. BRAND BOOK & GUIDELINES   (if populated, max 8,000 chars)
   Full brand identity doc — constant across all campaigns

4. BRAND ASSETS              (top-2 by TF-IDF cosine similarity)
   Brand-level reference material

5. CAMPAIGN REFERENCE MATERIAL  (top-2 brief assets by TF-IDF)
   Campaign-specific material

6. APPROVED EXAMPLES         (up to 3, from THIS brief only)
   Few-shot prompt → approved output pairs

7. OBJECTIVE INSTRUCTIONS    (if objective is set)
   One of 7 instruction blocks — see section 10

8. CONTENT SPECIFICATION     (if format+platform+placement+size resolved)
   Hard constraints: word budget, dimensions, structure, CTA guidance

9. CLOSING RULE
   "Output only the creative. No preamble."
```

The entire system prompt is sent with `cache_control: { type: "ephemeral" }`. This activates Anthropic's **prompt caching** — once Claude has processed a prompt block, repeat calls with the same prefix cost ~10% of the normal input token rate.

The user prompt (brief context + user's ask) is not cached because it changes per generation.

---

## 9. Token optimisation strategy

### P1 — Prompt caching (~90% cost reduction on repeat calls)
```js
// lib/anthropic.js
{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }
```
The brand's system prompt is identical across generations for the same brand + brief. After the first call, it's served from cache at ~1/10th the input token cost.

### P2 — RAG retrieval (keeps context tight as asset libraries grow)
```js
// lib/tfidf.js
topAssets(promptText, assets, topN = 2)
```
TF-IDF cosine similarity between the prompt and each asset's pre-computed embedding. Only the top-2 most relevant brand assets and top-2 brief assets are injected — not everything. Embeddings are computed at ingestion time and stored in the `embedding` column; retrieval is pure in-process arithmetic with no external API call.

### P3 — Compiled POV (shrinks the brand identity block ~30%)
```js
// lib/anthropic.js — compilePov()
```
After every POV save, Claude asynchronously compresses the 7 structured fields into a single dense paragraph. Stored in `pov_compiled`. Used in place of the labelled structured format on all subsequent calls. Falls back to raw fields if compilation hasn't run yet.

### P4 — Dynamic max_tokens (right-sized output budget per asset type)
```js
// lib/maxTokens.js
inferMaxTokens(prompt)         // keyword heuristic from the prompt
inferMaxTokensFromSpec(spec)   // duration/char-count derived from platform spec
```
A 15s script needs ~50 tokens. A 2,200-char caption needs ~440. A short copy brief gets 200–400. Rather than a fixed 2,048 ceiling that wastes cost on short outputs or a 400 ceiling that truncates long-form, we infer the right budget from the spec or the prompt.

---

## 10. Campaign briefs & objectives

### Brief isolation
Approved generations are scoped to the brief they were created in. A Diwali brief's few-shot examples never pollute a performance brief's generations — even within the same brand. This lets the system learn what "good" looks like for each campaign type independently.

```
Brand: Acme Co.
 ├── Brief: Diwali 2026   (objective: retention)
 │     ├── approved: [warm festive reel script, Instagram caption]
 │     └── future generations in this brief learn from these
 └── Brief: Performance Q3  (objective: conversion)
       ├── approved: [direct response headline, paid social body copy]
       └── these never bleed into Diwali brief generations
```

### Objective resolution
```
1. Per-generation override  →  user changes objective in Generate dropdown
2. Brief default            →  set in the Brief tab
3. None                     →  no objective block injected into prompt
```

| Objective | What Claude is told to do |
|-----------|--------------------------|
| `reach` | Broadest audience, one idea, stopping power over information density |
| `awareness` | Emotion and storytelling, build memory structures, no hard sell |
| `mental-availability` | Own a category entry point, be present at the moment of need |
| `engagement` | Scroll-stop first frame, invite reaction and sharing, feed-native feel |
| `lead-gen` | Single compelling benefit, one CTA, urgency only if truthful |
| `conversion` | Offer-first, price/deadline prominent, performance copy measured by the click |
| `retention` | Write to existing customers, warm/community tone, no acquisition mode |

---

## 11. API routes

All routes live under `/api/brands/:brandId` for isolation.

```
GET    /api/brands                                              list brands
POST   /api/brands                                              create brand
DELETE /api/brands/:brandId                                     delete brand

GET    /api/brands/:brandId/pov                                 get POV + brand_book
PUT    /api/brands/:brandId/pov                                 save POV (triggers async compile)

GET    /api/brands/:brandId/assets                              list brand assets
POST   /api/brands/:brandId/assets                              add asset (builds embedding)
DELETE /api/brands/:brandId/assets/:assetId

GET    /api/specs                                               platform specs (102 rows)

GET    /api/brands/:brandId/briefs                              list briefs (active first)
POST   /api/brands/:brandId/briefs                              create brief
GET    /api/brands/:brandId/briefs/:briefId
PUT    /api/brands/:brandId/briefs/:briefId                     update (name/status/objective/context)
DELETE /api/brands/:brandId/briefs/:briefId

GET    /api/brands/:brandId/briefs/:briefId/assets              list brief assets
POST   /api/brands/:brandId/briefs/:briefId/assets              add (builds embedding)
DELETE /api/brands/:brandId/briefs/:briefId/assets/:assetId

POST   /api/brands/:brandId/briefs/:briefId/generate            generate within brief
GET    /api/brands/:brandId/briefs/:briefId/generations         brief generation history
PUT    /api/brands/:brandId/briefs/:briefId/generations/:genId  approve | reject | pending

POST   /api/brands/:brandId/generate                            brand-level generate
GET    /api/brands/:brandId/generations                         all brand generations
PUT    /api/brands/:brandId/generations/:genId                  approve | reject | pending
```

---

## 12. Deployment (Railway)

The app runs on Railway with a persistent volume for the SQLite file.

**Key config:**
- `railway.json` sets `startCommand: "node server.js"`
- `RAILWAY_VOLUME_MOUNT_PATH` env var tells `db.js` where to write `data.db`
- `ANTHROPIC_API_KEY` must be set as a Railway service variable

**Redeploy after changes:**
```bash
railway up --detach
```

**Set the API key (one-time):**
```bash
railway variables --set "ANTHROPIC_API_KEY=sk-ant-..."
```

---

## 13. When to upgrade

This version intentionally skips several things. Add them only when you actually hit the problem:

| Symptom | What to add |
|---------|-------------|
| Multiple users need different permissions per brand | Login system + roles (admin / editor / viewer) |
| Brand asset library grows large (50+ docs), older material gets ignored | Real vector search: replace TF-IDF with embeddings + pgvector or Pinecone |
| Need to prove data physical isolation to a client (contracts, compliance) | Per-brand database schemas instead of shared table filtered by `brand_id` |
| Want automatic quality scoring beyond manual approve/reject | LLM-as-judge evaluation pipeline |
| Need to bill clients by usage | Per-brand token tracking and reporting |
| SQLite becomes a bottleneck under concurrent users | Migrate to Postgres (schema stays the same, swap `better-sqlite3` for `pg`) |

If you hit any of these, the data model here was deliberately kept simple so migrating is an addition, not a rewrite.
