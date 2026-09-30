// Local-only browser driver for checking UI changes against the dev server.
// Setup once: npm run browser:install   Docs: docs/browser-testing.md
//
// CLI (one screenshot per width, plus console errors and horizontal overflow):
//   npm run browser -- /library
//   npm run browser -- /users/CozyCritic --as AgentTester --width 1280 --width 320 --full
//   npm run browser -- /search --guest
//
// Script (write it outside the repository, for example in your scratch directory):
//   import { openBrowser } from "<repo>/tools/browser/browser.mjs";
//   const b = await openBrowser({ as: "AgentTester", width: 1280 });
//   await b.goto("/library");
//   await b.page.getByRole("button", { name: /Completed/ }).first().click();
//   await b.shot("library-after");
//   await b.close();
import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { baseUrl, cookieName, mintSession } from "../../scripts/local-dev.mjs";

export const shotsDir = process.env.RGBONER_SHOTS || path.join(os.tmpdir(), "rgboner-browser");

// Prefer an explicit path, then a preinstalled Playwright browser (cloud sandboxes), then local Chrome.
function launchOptions() {
  if (process.env.CHROME_PATH) return { executablePath: process.env.CHROME_PATH };
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(process.env.PLAYWRIGHT_BROWSERS_PATH)) return {};
  return { channel: "chrome" };
}

// as: a verified local display name (default AgentTester), or null for a signed-out guest.
export async function openBrowser({ as = "AgentTester", width = 1280, height = 900, reducedMotion = "no-preference" } = {}) {
  const session = as ? mintSession(as) : null;
  const browser = await chromium.launch({ headless: true, ...launchOptions() });
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
  if (session) await context.addCookies([{ name: cookieName, value: session.token, url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  mkdirSync(shotsDir, { recursive: true });
  return {
    browser, context, page, session, errors,
    // Waits for network quiet, since pages load their data client-side after hydration.
    async goto(pathname) {
      await page.goto(`${baseUrl}${pathname}`, { waitUntil: "networkidle" });
      if (session && new URL(page.url()).pathname === "/login") throw new Error(`Signed out: ${pathname} redirected to /login.`);
    },
    async shot(name, { full = false } = {}) {
      const file = path.join(shotsDir, `${name}.png`);
      await page.screenshot({ path: file, fullPage: full });
      return file;
    },
    async setViewport(nextWidth, nextHeight = height) { await page.setViewportSize({ width: nextWidth, height: nextHeight }); },
    // True when the page scrolls sideways, which the style guide forbids at 320px.
    overflows: () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
    close: () => browser.close(),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const widths = [];
  let pathname = "/", as = "AgentTester", full = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--as") as = args[++i];
    else if (args[i] === "--guest") as = null;
    else if (args[i] === "--width") widths.push(Number(args[++i]));
    else if (args[i] === "--full") full = true;
    else pathname = args[i];
  }
  const b = await openBrowser({ as, width: widths[0] || 1280 });
  try {
    for (const width of widths.length ? widths : [1280, 320]) {
      await b.setViewport(width);
      await b.goto(pathname);
      const name = `${pathname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home"}-${width}`;
      console.log(`${width}px  ${await b.shot(name, { full })}${await b.overflows() ? "  HORIZONTAL OVERFLOW" : ""}`);
    }
    console.log(b.errors.length ? `Console errors:\n${b.errors.join("\n")}` : "No console errors.");
  } finally { await b.close(); }
}
