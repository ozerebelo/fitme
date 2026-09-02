# FitMe

Training and nutrition in one app, with a coach that reads your actual data
rather than handing you population averages.

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

**The coach**
- **Adaptive TDEE** — back-calculates your real maintenance calories from what
  you ate and what your weight did, and replaces the formula estimate with it
- Nutritionist findings: protein shortfalls, weekend blowouts, stalls, rates of
  loss that are too fast, when a diet break is due
- Trainer findings: weekly sets per muscle against volume landmarks, stalled
  lifts, RPE creep, push/pull imbalance
- Ask-anything Q&A grounded in your own logged numbers

Everything is stored locally on the device. Nothing is uploaded except a
downscaled meal photo when you use photo logging, and your question when you ask
the coach something.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

The app is fully usable with no configuration. Two features call the Anthropic
API and need a key:

```bash
# apps/web/.env.local
ANTHROPIC_API_KEY=sk-ant-...
```

Without it, photo logging and coach Q&A show a clear message and everything
else — including all the coaching insights, which are computed locally — carries
on working.

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

apps/web             Next.js App Router PWA
  src/lib/store.ts   local-first persistence
  src/components/    UI, charts, logger, food sheets
  src/app/api/       Claude vision and coach endpoints
```

`@fitme/core` is consumed as TypeScript source (`transpilePackages`), so there is
no build step to keep in sync. It has no dependency on React or the browser,
which keeps the science testable in isolation and leaves the door open for a
native client later.

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
2. Set `ANTHROPIC_API_KEY` (see `apps/web/.env.example` for the optional ones).
3. Deploy. Open it on your phone and use *Add to Home Screen* — it installs as a
   standalone app and the workout logger keeps working offline.

Two notes worth knowing:

- The photo route can take 20–40 seconds. Its `maxDuration` is set to 60 s; if
  your plan caps function duration below that, set `FITME_PARSE_EFFORT=low` and
  lower the effort in `api/vision/meal/route.ts` to match.
- Open Food Facts asks callers to identify themselves — set
  `OPENFOODFACTS_USER_AGENT` to something naming your deployment.

### Do you need a database?

Not to ship. You need one when you want any of: the same data on your phone *and*
your laptop, history that survives clearing site data or losing the device, or
more than one user.

When that time comes, Neon is a good fit and the shape is already set up for it.
The store sits behind a small interface (`lib/store.ts`) and the whole app state
is one JSON document with an `updatedAt` stamp, so the first useful version of
sync is deliberately unambitious:

- Neon Postgres, one row per user: `(user_id, document jsonb, updated_at)`
- Push on the same hook the local journal already uses (`visibilitychange`),
  pull on load, newer `updatedAt` wins
- Auth via a magic link — for a single user, even a shared secret is defensible

That is last-write-wins, which is correct for one person on two devices and
wrong for a team. Splitting into per-entity rows with a change log is the upgrade
path if it ever needs to be more than that; nothing above forecloses it.

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

- Accounts and cross-device sync — see "Do you need a database?" above
- A native wrapper for Apple Health / Health Connect
- Barcode scanning uses the browser's `BarcodeDetector`, which Safari does not
  implement; on iOS the barcode is typed instead. Bundling a WASM decoder would
  close that gap
- ESLint is not configured; `tsc --noEmit` and the test suite are the gates

---

FitMe gives general fitness and nutrition guidance. It is not medical advice.
