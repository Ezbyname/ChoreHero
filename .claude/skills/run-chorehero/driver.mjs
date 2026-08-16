#!/usr/bin/env node
// Minimal chromium-cli-alike REPL driver for ChoreHero's web build.
//
// Built because this container doesn't have the `chromium-cli` tool that
// the standard "browser-driven web app" pattern expects. This is a
// stand-in with the same command vocabulary (nav / wait-for / click /
// fill / press / screenshot / console / eval / quit), driven via
// Playwright's `chromium` launcher directly (NOT `_electron` — this is a
// plain web app, not Electron).
//
// Usage:
//   node .claude/skills/run-chorehero/driver.mjs [--headed]
// then pipe commands on stdin, one per line, e.g.:
//   nav http://localhost:8081
//   wait-for text=Today
//   screenshot today
//   click text=Assigned
//   wait-for text=Assigned
//   screenshot assigned
//   console --errors
//   quit
//
// Screenshots land in .claude/skills/run-chorehero/screenshots/<name>.png

import { chromium } from '@playwright/test';
import { createInterface } from 'node:readline';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR  = join(SKILL_DIR, 'screenshots');
mkdirSync(SHOT_DIR, { recursive: true });

const headed = process.argv.includes('--headed');
// This project's @playwright/test (^1.48.0) doesn't match the browser build
// preinstalled in this container for the default headless shell, so pin
// the executable explicitly instead of letting Playwright try to download
// one (no network access for that here) — see SKILL.md Gotchas.
const browser = await chromium.launch({
  headless:       !headed,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:           ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 420, height: 844 } }); // phone-ish, this is a mobile-first app
const page = await context.newPage();

const consoleLog = [];
page.on('console', (msg) => consoleLog.push({ type: msg.type(), text: msg.text() }));
page.on('pageerror', (err) => consoleLog.push({ type: 'pageerror', text: String(err) }));

function locatorFor(sel) {
  if (sel.startsWith('text=')) return page.getByText(sel.slice(5), { exact: false });
  if (sel.startsWith('placeholder=')) return page.getByPlaceholder(sel.slice(12), { exact: false });
  return page.locator(sel);
}

async function run(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return true;
  const [cmd, ...rest] = trimmed.split(' ');
  const arg = rest.join(' ');

  try {
    switch (cmd) {
      case 'nav': {
        await page.goto(arg, { waitUntil: 'domcontentloaded' });
        console.log(`[ok] nav ${arg}`);
        break;
      }
      case 'wait-for': {
        await locatorFor(arg).first().waitFor({ state: 'visible', timeout: 15000 });
        console.log(`[ok] wait-for ${arg}`);
        break;
      }
      case 'click': {
        await locatorFor(arg).first().click();
        console.log(`[ok] click ${arg}`);
        break;
      }
      case 'fill': {
        // Split on ' -- ' (not the first space) so both the selector and
        // the value can contain spaces — needed for placeholder= selectors
        // and multi-word values alike.
        const sp = arg.indexOf(' -- ');
        const sel = sp === -1 ? arg : arg.slice(0, sp);
        const text = sp === -1 ? '' : arg.slice(sp + 4);
        await locatorFor(sel).first().fill(text);
        console.log(`[ok] fill ${sel} = ${text}`);
        break;
      }
      case 'press': {
        await page.keyboard.press(arg);
        console.log(`[ok] press ${arg}`);
        break;
      }
      case 'screenshot': {
        const name = arg || `shot-${Date.now()}`;
        const path = join(SHOT_DIR, `${name}.png`);
        await page.screenshot({ path });
        console.log(`[ok] screenshot -> ${path}`);
        break;
      }
      case 'console': {
        const errorsOnly = arg.includes('--errors');
        const entries = errorsOnly
          ? consoleLog.filter((e) => e.type === 'error' || e.type === 'pageerror')
          : consoleLog;
        console.log(JSON.stringify(entries, null, 2));
        break;
      }
      case 'eval': {
        const result = await page.evaluate(new Function('return (' + arg + ')'));
        console.log(`[ok] eval -> ${JSON.stringify(result)}`);
        break;
      }
      case 'sleep': {
        await page.waitForTimeout(Number(arg) || 1000);
        console.log(`[ok] sleep ${arg}`);
        break;
      }
      case 'quit': {
        await browser.close();
        console.log('[ok] quit');
        return false;
      }
      default:
        console.log(`[error] unknown command: ${cmd}`);
    }
  } catch (err) {
    console.log(`[error] ${cmd} ${arg}: ${err.message.split('\n')[0]}`);
  }
  return true;
}

const rl = createInterface({ input: process.stdin });
for await (const line of rl) {
  const keepGoing = await run(line);
  if (!keepGoing) break;
}
await browser.close().catch(() => {});
