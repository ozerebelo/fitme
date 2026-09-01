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
- **Photo meal logging** — photograph a plate, Claude identifies the components
  and estimates portions, then each item is matched against the food database so
  the macros come from real composition data rather than a guess
- Calorie and macro targets derived from your body metrics, goal and activity

**Training**
- In-gym set logger: previous session's numbers inline on every row, big tap
  targets, auto rest timer, plate calculator, RPE, PR detection
- Programme generator: picks a split from your training frequency, fills it from
  the equipment you actually have, and fits it to your session length
- Progression engine that tells you what weight to use next and why
- One-time import of your history from the Strong app

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

**Photo logging splits the problem.** A vision model is genuinely good at
identifying food and judging portion size from a picture; it should not be the
source of truth for how much protein is in 100 g of chicken. So the model
returns items and gram estimates, and each one is matched against the food
database — matched items get real composition data scaled to the portion, and
only unmatched items fall back to the model's own estimate. The UI labels which
is which, and portions stay adjustable.

**Insights show their working.** Every finding carries the numbers it came from,
behind a "show the numbers" toggle. A coach you cannot interrogate is a horoscope.

**Persistence is belt-and-braces.** The document lives in IndexedDB, written on a
short debounce. Because that write is asynchronous, a page torn down mid-write —
locking your phone right after ticking a set — could lose it. So on `pagehide`
and `visibilitychange` a synchronous localStorage journal is written too, and the
newer of the two wins on load.

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

---

## Not built yet

- Barcode scanning, and a branded-food database (Open Food Facts) behind the
  existing food-search interface
- Accounts and cross-device sync — the storage layer is behind a small interface,
  so a server driver slots in without touching the screens
- A native wrapper for Apple Health / Health Connect
- ESLint is not configured; `tsc --noEmit` and the test suite are the gates

---

FitMe gives general fitness and nutrition guidance. It is not medical advice.
