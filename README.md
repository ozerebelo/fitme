# FitMe

Training, nutrition and money in one app, with a coach on each side that reads
your actual data rather than handing you population averages.

Works on phone and desktop from one codebase — it is an installable PWA, so it
adds to your home screen and the workout logger keeps working in a gym with no
signal.

---

## What it does

**Nutrition**
- Food diary with a curated database, custom foods, and calorie-only quick adds
- **Describe a meal in words** — "two eggs, toast with butter and a coffee" —
  parsed into entries, with follow-up corrections ("make that two")
- **Memory** — teach it once that "milk" means your specific carton at your usual
  250 ml, and every future mention resolves to that exact food
- **Photo meal logging** — photograph a plate, Claude identifies the components
  and estimates portions
- **Barcode scanning**, backed by Open Food Facts, plus branded-product search
- Calorie and macro targets derived from your body metrics, goal and activity
- Water tracking against a bodyweight- and training-derived target

**Training**
- In-gym set logger: previous session's numbers inline on every row, big tap
  targets, auto rest timer, plate calculator, RPE, PR detection
- **Progressive overload tracking** — set your rep range (6–10 by default for
  main lifts) and the app tells you, per lift, when you have earned the next
  jump, prefills it, and shows the working
- Programme generator: picks a split from your training frequency, fills it from
  the equipment you actually have, and fits it to your session length
- **Routines rebuilt from your history** — import from Strong and the app hands
  back the routines you were already running, same exercises and set counts
- Bodyweight log with a trend line, editable entry by entry

**Money**
- Accounts of every kind — current, savings, cash, cards, brokers, a mortgage,
  a flat — with balances, net worth and its history
- **Daily spending in one line** — `almoço 12,50 no continente` is parsed on the
  device, in Portuguese or English, into an amount, a date, a payee and a category
- **Receipt photos** — photograph the till receipt and Claude reads the merchant,
  the date, the total and every line item; the shopping is itemised, not one total
- **Bank statement import** — any CSV, with the columns, the date order and the
  decimal comma worked out from the file; re-importing the same statement adds
  nothing the second time
- **Rules that learn** — a shipped list of Portuguese merchants categorises most
  of a statement on import, and filing something yourself teaches the rule that
  files the next one
- **Budgets with pace**, not just totals: what is left, what that is per day, and
  where the month finishes at the current rate — with rollover for the irregular
  envelopes
- **Savings goals** that say what it takes a month and when they actually land
- **Investments** — FIFO cost basis, realised and unrealised gains, dividends,
  and the money-weighted return (XIRR) that accounts for *when* you bought
- Standing payments, a 30-day cash-flow forecast and the day the account is
  thinnest
- Multi-currency, with rates you enter and can see the age of

**The coach**
- **Adaptive TDEE** — back-calculates your real maintenance calories from what
  you ate and what your weight did, and replaces the formula estimate with it
- Nutritionist findings: protein shortfalls, weekend blowouts, stalls, rates of
  loss that are too fast, when a diet break is due
- Trainer findings: weekly sets per muscle against volume landmarks, stalled
  lifts, RPE creep, push/pull imbalance
- Ask-anything Q&A grounded in your own logged numbers

**The money side's findings** — the same engine, the same rules: a payment that
will not clear, a category running over, spending well above its own recent
normal, the savings rate, months of cover, card utilisation, standing payments
you had forgotten, a goal that will not make its date, a concentrated position,
prices that have gone stale.

Everything is stored locally on the device. Nothing is uploaded except a
downscaled meal photo when you use photo logging, and your question when you ask
the coach something.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

The app is fully usable with no configuration. Four features call the Anthropic
API and need a key:

```bash
# apps/web/.env.local
ANTHROPIC_API_KEY=sk-ant-...
```

Without it, photo logging, receipt reading and coach Q&A show a clear message and
everything else — including every insight on both sides, which are computed
locally — carries on working.

### What actually costs money

Most of the app never touches a model. Only four routes do, and only one of them
is on a path you use every day:

| Feature | Runs where | Needs a key |
| --- | --- | --- |
| Search, barcode scan, manual entry | Device | No |
| Typed meals — *"dois ovos com torrada e café"* | Device | No |
| Typed spending — *"almoço 12,50 no continente"* | Device | No |
| Coaching insights, adaptive TDEE, progressive overload | Device | No |
| Balances, budgets, portfolio returns, money findings | Device | No |
| Statement import and auto-categorisation | Device | No |
| Strong import, routines, charts, sync | Device | No |
| Typed meals the on-device parser cannot resolve | `api/chat/log` | Yes |
| Photo logging | `api/vision/meal` | Yes |
| Receipt photos | `api/vision/receipt` | Yes |
| Coach Q&A | `api/coach` | Yes |

Typed logging is the interesting one. `parse.ts` in `@fitme/core` reads a
sentence — in English or Portuguese — into quantities, measures and food names,
and grounds them against the catalog on the device. It only falls through to the
model for what it could not resolve, so an ordinary day of logging costs
nothing, works on the Tube, and returns instantly. The money side's `quickadd.ts`
does the same job for spending and never falls through at all: an amount, a
date, a payee and a category out of one typed line, entirely on the device.

Photo logging, receipt reading and coach Q&A cannot be made free the same way.
Reading a plate off a photograph, transcribing a crumpled thermal print and
answering a question about four years of training history are all jobs for a
hosted model; there is no on-device substitute worth shipping. If you do not set
a key, each says so plainly and the rest of the app is unaffected — a purchase
can still be typed, itemised by hand, or imported from the statement.

Each route reads its model from an environment variable, so you can trade cost
against quality per feature without touching code:

```bash
FITME_VISION_MODEL=claude-opus-5      # photo logging
FITME_RECEIPT_MODEL=claude-opus-5     # receipt photos (falls back to the above)
FITME_PARSE_MODEL=claude-opus-5       # typed meals the device could not parse
FITME_COACH_MODEL=claude-opus-5       # coach Q&A
FITME_PARSE_EFFORT=low                # low | medium | high
```

Photo logging is the one worth paying for; the parse route sees only the
sentences the device gave up on, and a smaller model handles most of them.

### Portuguese

Meals can be described in either language, and the two can be mixed in one
sentence. This is not a UI translation — the interface stays in English — it is
the *input* that is bilingual, which is the part that has to keep up with how
fast you type.

The on-device parser reads Portuguese numbers (`dois`, `meia`), measures
(`colher de sopa`, `fatia`, `chávena`, `punhado`, `medida`), the ways a sentence
opens (`hoje ao almoço comi…`, `o pequeno-almoço foi…`) and the ways people
teach it something (`sempre que eu disser leite é o Mimosa magro`, `não como
porco`). Accents are optional throughout. The seed catalog carries Portuguese
names for every food in it, including the Brazilian variants where they differ,
so `bacalhau`, `grão`, `esparguete` and `abacaxi` all resolve locally.

Where two foods could claim the same word, the plain word goes to the one people
mean by it: `frango` is a chicken breast and `coxa de frango` is a thigh;
`chocolate` is milk chocolate and `chocolate negro` is dark. All of the
vocabulary lives in `packages/core/src/pt.ts`, in one reviewable list.

The money side is bilingual on input in the same way. Every category carries a
Portuguese name as well as an English one, so `supermercado` and `restaurantes`
resolve locally; the quick-add line reads `almoço 12,50 no continente`, `ontem`
and `anteontem`; the statement importer knows what `Data valor`, `Descrição`,
`Débito` and `Crédito` mean, and the shipped merchant list is a Portuguese one —
Continente, Pingo Doce, EDP, MEO, Galp, Via Verde, CP, farmácias, portagens.

The model-backed routes are told to answer in whichever language you wrote in.

```bash
npm run check        # typecheck + tests + production build
npm test             # domain test suite
npm run build && npm start
```

---

## Layout

```
packages/core        @fitme/core — the domain layer, pure TypeScript, no deps
  energy.ts          BMR, TDEE, goal adjustment with safety floors, adaptive TDEE
  macros.ts          protein/fat/carb targets, floors and compression
  strength.ts        e1RM, RPE tables, volume landmarks, progression, plate maths
  programs.ts        split selection and programme generation
  analytics.ts       trend weight, adherence, rollups
  memory.ts          user-taught facts and how they are matched
  grounding.ts       resolving model output against real nutrition data
  openfoodfacts.ts   normalising crowd-sourced branded products
  coach/             the nutritionist and trainer rule engines
  importers/strong   Strong CSV import
  data/              seed food and exercise catalogs

packages/money       @fitme/money — the money domain, pure TypeScript
  money.ts           minor-unit arithmetic, parsing, formatting, conversion
  period.ts          months, and the budgeting period that may not be one
  accounts.ts        balances, net worth and its history
  transactions.ts    the ledger, transfers, filters and totals
  budget.ts          envelopes, rollover, pace, projection, first-budget maths
  goals.ts           savings goals, runway, compound projection
  invest.ts          FIFO lots, valuation, XIRR, portfolio series
  recurring.ts       schedules, forecasting, subscription detection
  rules.ts           payee → category matching and learning
  quickadd.ts        one typed line into a transaction, EN and PT
  insights.ts        the money rule engine
  importers/csv      bank statement import
  data/              seed categories and merchant patterns

apps/web             Next.js App Router PWA
  src/lib/store.ts   local-first persistence
  src/lib/money.tsx  the money side's view of that state
  src/components/    UI, charts, logger, food sheets, money sheets
  src/app/money/     accounts, spending, budget, invest, plan
  src/app/api/       Claude vision and coach endpoints
```

`@fitme/core` and `@fitme/money` are consumed as TypeScript source
(`transpilePackages`), so there is no build step to keep in sync. Neither has a
dependency on React or the browser, which keeps the science and the arithmetic
testable in isolation and leaves the door open for a native client later.

The two halves share one state document, one IndexedDB write, one journal and
one sync — which is what lets the money side inherit offline support, backup and
cross-device sync without inventing a second mechanism. They do not share a
navigation bar: each section has its own five tabs and a door into the other,
because six tabs on a phone is how you mis-tap.

---

## Notes on the design

**Targets are measured, not assumed.** Every calorie calculator starts from a
regression on a population. FitMe starts there too, but once you have ~14 logged
days and a couple of weeks of weigh-ins it computes

```
TDEE ≈ mean daily intake − (Δ trend weight × 7700 / days)
```

and switches to that. This is what makes targets keep working after the point
where textbook numbers stop — it captures your own NEAT adaptation. Weight is
smoothed before the comparison, because raw scale readings swing ±1.5 kg on water
and gut contents alone and would swamp the signal.

**Language models identify; databases quantify.** A model is genuinely good at
reading a sentence or a photograph and working out what was eaten and roughly
how much. It should never be the source of truth for how much protein is in
100 g of chicken. So both the photo and the chat route return *raw* items, and a
single grounding step resolves each one against, in order: a fact you taught it,
your own foods, the seed catalog, and only then the model's own estimate. Every
row in the review step says which tier it came from.

That grounding runs on the device, not in the API route — your custom foods and
your memory never leave it, so the client is the only place where all four tiers
actually exist.

**Progressive overload, made explicit.** Double progression — climb the rep
range at a fixed load, then add weight and reset — is the model that keeps
working after linear progression stops. The hard part is not the rule, it is
noticing you satisfied it: clearing 3×10 and then loading the same 80 kg next
week is how a good programme quietly becomes maintenance. So the app answers
that question for every lift, from the history alone, and puts the answer where
the decision is made — above the set rows, with the weight already filled in.

Two details do most of the work. The effort ceiling means hitting the reps at
RPE 9.5 does *not* earn a jump, because adding load on top of a grinder is how
stalls start. And load steps come from the equipment: a 12 kg dumbbell goes to
14, not to 13.75, because 13.75 kg dumbbells do not exist.

**Memory is inspectable.** A memory you cannot audit is a liability: one wrong
fact silently distorts every future entry with no way to find out why. So
everything the app has learned is listed in Settings in plain language, editable
and deletable, with a note on which facts are linked to a real food and which
are still estimates.

**Insights show their working.** Every finding carries the numbers it came from,
behind a "show the numbers" toggle. A coach you cannot interrogate is a horoscope.

**Money is an integer.** Every amount in `@fitme/money` is a whole number of
minor units — cents, pence — and the only decimal in the system lives in
`parseAmount` and `formatMoney` at the edges. `0.1 + 0.2` is the oldest bug in
finance software, and a budget that is a cent out every month is a budget nobody
trusts. Parsing is per-string rather than per-locale, because `12,50` and
`1,234.56` both turn up in the same imported file and the digits themselves say
which convention is in play.

**A balance is what you hold.** One sign convention runs through the whole
package: positive is yours, negative is owed. A card you owe €400 on is −400 and
a mortgage is minus the principal, so net worth is a sum rather than a case
analysis — and assets and liabilities are split on the sign of the balance, not
on the kind of account, because a current account €200 overdrawn is a liability
that week and an overpaid mortgage is an asset.

**Budgets need pace, not totals.** "€180 of €400 spent" is a fact and not a
decision: on the 5th it is a problem and on the 25th it is fine. So every
envelope carries where even spending would have you today, where the month
finishes at the current rate, and what is left per remaining day — which is the
number you can act on at the till. Rollover is per envelope, because carrying
what you did not spend is right for clothes and the car and wrong for rent,
where the limit is the bill.

**Importing is detection plus a preview.** Portuguese banks export a preamble of
account details above the header, dates as `12-03-2026`, amounts as `1.234,56`,
and split the amount into separate debit and credit columns as often as not, so
a per-bank adapter list would rot within a year. Instead the columns are found
from the header row, the day-first-or-month-first question is settled from the
column as a whole rather than from any one date, and the result is shown before
anything is saved. Every row is keyed by a hash of the account, date, amount and
payee, so **importing an overlapping statement twice adds nothing** — with an
occurrence counter, so two identical €1.20 coffees on the same day both survive.

**The rules are one list.** The shipped merchant patterns, the rules learned when
you recategorise something, and the rules you write by hand are the same
mechanism and the same editable list — a categoriser you cannot audit files your
rent as groceries and gives you no way to find out why. Only the ones you taught
are stored; the seeds stay in code, so the merchant list improves with the app
instead of being frozen into every document ever created.

**Returns are money-weighted.** A fund up 20% helps very little if you only
bought in December, so the portfolio's headline return is XIRR across the actual
cash flows, solved by bisection rather than Newton because irregular personal
flows produce curves that send Newton to infinity. Cost basis is FIFO, which is
the rule Portuguese capital-gains reporting uses and the only one that gives a
defensible realised gain on a partial sale. And prices are *marks you enter*,
carrying the date they were entered — there is no feed, because an app that has
to work on a plane cannot have one, and a quote of unknown age dressed up as
live is worse than an honest "last marked on the 3rd".

**Persistence is belt-and-braces.** The document lives in IndexedDB, written on a
short debounce. Because that write is asynchronous, a page torn down mid-write —
locking your phone right after ticking a set — could lose it. So on `pagehide`
and `visibilitychange` a synchronous localStorage journal is written too, and the
newer of the two wins on load.

---

## Deploying

The app is local-first, so there is no database to provision. Vercel plus one
environment variable is the whole deployment.

1. Import the repo on Vercel, then — **before the first deploy** — open
   **Settings → Build and Deployment → Root Directory** and set it to
   `apps/web`. This is a monorepo, so with the root left at the repository root
   Vercel finds no framework, falls back to a static build, and fails with
   *"No Output Directory named public found after the Build completed."* That
   error means this setting, nothing else. With it set, Next.js is detected,
   the npm workspace is installed from the repository root, and `@fitme/core`
   is compiled as part of the app build.
2. Set `ANTHROPIC_API_KEY`, and `DATABASE_URL` if you want accounts and your
   data on more than one device (see below). `apps/web/.env.example` lists the
   rest.
3. Deploy. Open it on your phone and use *Add to Home Screen* — it installs as a
   standalone app and the workout logger keeps working offline.

### If a page is `404: NOT_FOUND`

Two things produce that page, and neither is a build failure.

**A URL from a deployment that failed.** A build that errored has no output
behind its URL, so opening it serves Vercel's generic 404 — often long after the
underlying problem was fixed. Check the deployment's status in the dashboard
before debugging anything: if it is red, the 404 is a symptom, and the build log
is where the real error is.

**A Production Branch that does not match the branch you push.** Vercel defaults
it to `main`. If you push anything else, every build succeeds as a *Preview* and
the production domain either serves nothing or stays pinned to whatever was last
promoted. The giveaway is the Deployments list: green "Ready" rows all labelled
Preview, with the Production badge sitting on an older commit. Fix it under
**Settings → Git → Production Branch**, and promote the current deployment
(**⋯ → Promote to Production**) to catch up immediately.

Two notes worth knowing:

- The photo route can take 20–40 seconds. Its `maxDuration` is set to 60 s; if
  your plan caps function duration below that, set `FITME_PARSE_EFFORT=low` and
  lower the effort in `api/vision/meal/route.ts` to match.
- Open Food Facts asks callers to identify themselves — set
  `OPENFOODFACTS_USER_AGENT` to something naming your deployment.

### Accounts (optional)

Not needed to ship — the app is fully usable signed out, and nothing about it is
degraded. An account is what makes the data *yours* rather than this browser's:
the same history on your phone and your laptop, and a way back if you lose the
device.

One environment variable turns it on:

```
DATABASE_URL=postgresql://…-pooler.…neon.tech/neondb?sslmode=require
```

The tables are created on first use, so there is no migration step. Sign-in is
offered on the setup screen as well as in Settings — installing on a second
device should not mean answering the setup questions again, and it does not: the
account's copy comes down profile and all.

**How it works.** Email and password. Passwords are stored as `scrypt` digests
(N=32768, r=8, p=1) with a per-password salt and the parameters recorded inline,
so the cost can be raised later without invalidating existing hashes. A session
is a 256-bit random token in an HttpOnly, SameSite=Lax, Secure cookie; the
database holds only its SHA-256, so a leaked database yields neither passwords
nor usable sessions. An unknown address and a wrong password give byte-identical
answers, so the login form is not a membership oracle. Sign-up and sign-in are
rate limited per address and per account.

The stored value is the same state document the client already keeps, with the
same `updatedAt` stamp the local journal uses — which makes reconciliation one
comparison rather than a merge algorithm. It pulls on load, adopts the account's
copy only if it is genuinely newer, and pushes when the page is hidden.

**Three things to be clear about.**

The write is last-write-wins by timestamp — correct for one person on two
devices, wrong for a team, so a genuinely concurrent edit on another device
loses. The server refuses an older push rather than silently clobbering it, and
hands the newer document back, so that case is visible rather than quiet.
Per-entity rows with a change log are the upgrade path.

Signing in for the first time on a device that already has data cannot merge the
two. It asks which copy to keep, showing what each holds, rather than guessing.

**There is no password reset.** Adding one means an email provider, a domain to
verify and a token flow, and none of that is built. Losing the password means
losing the account's copy — the device keeps its own, and Settings → Your data
exports a backup.

---

## Importing from Strong

Strong has no public API — no OAuth, no webhooks — so this is a file import
rather than a live connection. In Strong: **Settings → Export Data → Export
Workout Data**, then open the CSV in FitMe's settings.

The importer handles both comma and semicolon delimited exports and the known
header variants, filters rest-timer rows, marks warm-ups, converts pounds, and
matches Strong's `Movement (Equipment)` naming against the exercise catalog
(unrecognised names are kept under their original name with muscle groups
inferred, so no history is lost).

Each workout is keyed by its source timestamp, so **running the import twice is a
no-op** — re-importing a full export only adds what is genuinely new.

Name matching is containment-based rather than exact, which is what real exports
need: `Triceps Pushdown (Cable - Straight Bar)` resolves to the catalog's triceps
pushdown, while `Incline Bench Press (Barbell)` still resolves to the incline
entry rather than collapsing into flat bench, because it covers more of the
query. Verified against a four-year export of ~3,200 rows: 96 sessions, 1,906
sets, zero unmatched exercises.

Afterwards the app offers to rebuild the routines you have been running, taken
from the most recent session under each workout name — same exercises, same
order, same set counts, with rep targets from your own range settings.

---

## Not built yet

- Open banking. There is no PSD2 connection, so bank data arrives as a CSV
  import. A live connection means a licensed aggregator, a per-account consent
  flow and a recurring bill, and none of that is built
- A price feed for the portfolio. Marks are entered by hand and carry their date
- Multi-currency uses rates you type in. There is no rate feed and no historical
  rate, so a converted total is priced at today's rate throughout
- A native wrapper for Apple Health / Health Connect
- Barcode scanning uses the browser's `BarcodeDetector`, which Safari does not
  implement; on iOS the barcode is typed instead. Bundling a WASM decoder would
  close that gap
- ESLint is not configured; `tsc --noEmit` and the test suite are the gates

---

FitMe gives general fitness and nutrition guidance. It is not medical advice.
