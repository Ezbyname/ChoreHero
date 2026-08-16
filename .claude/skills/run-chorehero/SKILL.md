---
name: run-chorehero
description: Build, run, and drive ChoreHero (Expo/React Native family chore app). Use when asked to start ChoreHero, run its tests, build it, take a screenshot of its UI, or interact with the running app.
---

ChoreHero is an Expo (SDK 56) React Native app that also targets web via
react-native-web. Drive it by starting the Expo web dev server with no
Supabase env vars set (which puts the app in its built-in mock-data mode,
bypassing auth entirely) and driving headless Chromium against it via
`.claude/skills/run-chorehero/driver.mjs` — a small chromium-cli-alike
REPL, written because this container doesn't have `chromium-cli` itself.

All paths below are relative to the repo root (`ChoreHero/`).

## Prerequisites

Node 22 and the project's own `node_modules` (already installed here via
`npm install`). Chromium comes from `@playwright/test`, already a
devDependency — no separate browser install needed; see Gotchas for why
you must NOT run `npx playwright install`.

## Setup

```bash
npm install
```

No `.env` is required. Do **not** create one from `.env.example` for the
purposes of this skill — the absence of `EXPO_PUBLIC_SUPABASE_URL` /
`EXPO_PUBLIC_SUPABASE_ANON_KEY` is what puts the app into mock-data mode
(see Gotchas). If a real `.env` is present in your checkout, the app will
instead try to hit a real Supabase project and show the login screen —
move it aside first if you want the mock-mode path below.

## Build

No separate build step for the dev-server path below. (`npm run build:web`
exists for a static export if you ever need one — not required to drive
the app.)

## Run (agent path)

Start the web dev server in the background, without any Supabase env vars,
and wait for it to actually serve:

```bash
CI=1 nohup npx expo start --web --port 8081 > /tmp/expo-web.log 2>&1 &
timeout 60 bash -c 'until curl -sf http://localhost:8081 >/dev/null; do sleep 2; done'
```

(`CI=1` stops Metro from opening an interactive watch/QR prompt that hangs
in a headless container.)

Then pipe commands to the driver, one per line on stdin:

```bash
node .claude/skills/run-chorehero/driver.mjs <<'EOF'
nav http://localhost:8081
wait-for text=Today
screenshot 01-today
click text=Rewards
wait-for text=Family points
screenshot 02-rewards
console --errors
quit
EOF
```

Screenshots land in `.claude/skills/run-chorehero/screenshots/<name>.png`.

Stop the server when done:

```bash
lsof -ti:8081 -sTCP:LISTEN | xargs -r kill
```

| command | what it does |
|---|---|
| `nav <url>` | navigate |
| `wait-for text=<substring>` or `wait-for placeholder=<substring>` or `wait-for <css selector>` | wait for visible |
| `click <same selector forms>` | click — `.first()` of the match; if a selector matches more than one thing (e.g. two "Approve" buttons on the same screen — a claim's and a task's), it clicks whichever is currently first in DOM order, which shifts as earlier matches disappear. Clear/approve items one at a time and re-check what's left rather than assuming a fixed click count. |
| `fill <selector> -- <text>` | fill an input. Selector and text are split on `' -- '` (not the first space), so both can contain spaces — use `placeholder=<full placeholder text>` for React Native Web `TextInput`s, since plain CSS attribute selectors like `input[placeholder="..."]` don't parse through this driver's naive selector passthrough. |
| `press <key>` | keyboard press (e.g. `Enter`) |
| `screenshot [name]` | full-page screenshot |
| `console [--errors]` | dump captured console/page errors |
| `eval <js>` | `page.evaluate` |
| `sleep <ms>` | fixed wait — avoid; prefer `wait-for` |
| `quit` | close the browser and exit |

## Run (human path)

`npm run web` opens the same Metro/web dev server and prints a URL to open
in a real browser. Useless headless — Ctrl-C to stop. `npm start` is the
same but offers native (iOS/Android) targets too via the Expo Dev Tools
menu, not applicable in this container.

## Test

```bash
npm run test:unit
```

**Gotcha:** this only picks up 9 of the 50 actual tests — `package.json`'s
`test:unit` script relies on `src/**/__tests__/*.test.ts` recursive
globbing, which needs bash's `globstar` option, and npm's script shell in
this container doesn't have it on by default. Run the underlying command
directly instead to get all 50:

```bash
shopt -s globstar
NODE_NO_WARNINGS=1 node --experimental-strip-types --import ./scripts/test/register.mjs --test src/**/__tests__/*.test.ts
```

50 tests pass as of this writing (node's built-in test runner — no
separate test framework install needed).

```bash
npx tsc --noEmit
```

Typecheck, no separate build step.

The Playwright suite under `e2e/` is a **different thing** — real-backend
QA against a deployed Vercel URL with a seeded Supabase project
(`E2E_BASE_URL` env var required, throws if unset). It is not runnable
standalone in this container and is not what this skill's driver uses;
see Gotchas.

---

## Gotchas

- **`npm run test:unit` silently under-runs.** It only executes 9 of 50
  tests here — the script's `src/**/__tests__/*.test.ts` glob needs
  bash's `globstar`, which this container's `npm` script shell doesn't
  enable. Run the node command directly with `shopt -s globstar` first
  (see Test section) to get the real count.
- **No `.env` = mock mode, not a broken app.** `src/lib/supabaseConfig.ts`
  reports `'missing'` when `EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY` are
  unset. `AuthGate.tsx` treats `'missing'` (and `'partial'`) as
  `isMockDevMode` and renders `RootNavigator` directly — no login screen,
  no Supabase calls. `AppBootstrap.tsx` hydrates the store from
  `src/mock/` instead. This is the intended, documented way to run the
  app without a real backend — lean into it rather than fabricating
  Supabase credentials.
- **Chromium build mismatch.** This project's `@playwright/test` is
  pinned to `^1.48.0`, but the container's preinstalled browser at
  `/opt/pw-browsers` is for a newer Playwright release — `chromium.launch()`
  with default options fails looking for
  `chromium_headless_shell-1228/.../chrome-headless-shell`, which isn't
  there. Fix: pass `executablePath:
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'` explicitly (the
  driver already does this). Do **not** run `npx playwright install` —
  no network access for a browser download in this container, and it's
  unnecessary once you pin the path.
- **The `e2e/` Playwright suite needs a real deployment.**
  `playwright.config.ts` throws immediately if `E2E_BASE_URL` isn't set,
  and its `globalSetup` resets/reseeds a real Supabase project via
  `scripts/seed-qa-data.mjs`. It's QA infrastructure for a deployed
  environment, not a local smoke-test harness — don't try to point it at
  the local dev server started above; it assumes a real backend and real
  seeded users (`e2e/helpers.ts`'s `QA_USERS`).
- **(Fixed) Mock-mode data used to get wiped moments after loading.**
  Earlier versions of this app cleared `user`/`household`/`tasks`/etc
  right after mock hydration, so screens gated on that data (Assigned
  tab's "Create a task" form, Settings' invite section, My Tasks) always
  rendered empty regardless of role/permissions — see
  `AppDataBootstrap.tsx`'s `isSupabaseConfigured` guard. Fixed; if you
  see this symptom again, it's a regression of that guard, not a driver
  or selector problem.
- **Multiple identically-labeled action buttons on one screen.** The
  Today screen can show several "Approve" buttons at once (contribution
  claims and needs_attention tasks both use the same label) — `click
  text=Approve` always hits whichever is first in current DOM order.
  Clear items one at a time and re-check screenshots between clicks
  rather than assuming which one a given click landed on.

## Troubleshooting

- **`browserType.launch: Executable doesn't exist at
  .../chrome-headless-shell`**: see the chromium build-mismatch Gotcha
  above — pass `executablePath` pointing at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- **`curl` against `localhost:8081` never succeeds**: check
  `/tmp/expo-web.log` — Metro takes a few seconds to bind the port after
  printing "Starting Metro Bundler"; the poll loop in Run (agent path)
  handles this, a fixed `sleep` may not.
- **Port already in use on a second run**: `npm run web`/`expo start`
  doesn't forward signals to the underlying Metro process reliably when
  backgrounded with `&`; kill by port, not by PID:
  `lsof -ti:8081 -sTCP:LISTEN | xargs -r kill`.
