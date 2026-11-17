import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const repo = resolve(process.cwd(), "../..");
const file = (...parts: string[]) => resolve(repo, ...parts);

async function read(relative: string) {
  return readFile(file(relative), "utf8");
}

test("T-UI-02 fonts and icon wrapper meet asset and accessible SVG contracts", async () => {
  test.skip(!existsSync(file("web/styles/fonts.css")), "T-UI-02 implementation has not landed");
  const fonts = await read("web/styles/fonts.css");
  const icon = await read("web/component/icon.ts");
  const names = await readdir(file("web/resources/fonts"));
  const fontFiles = names.filter(name => name.endsWith(".woff2"));
  const totalBytes = (await Promise.all(fontFiles.map(name => stat(file("web/resources/fonts", name))))).reduce((n, s) => n + s.size, 0);
  expect(fonts).toContain("Geist");
  expect(fontFiles.length).toBeGreaterThan(0);
  expect(totalBytes).toBeLessThanOrEqual(230 * 1024);
  expect(icon).toMatch(/aria-label/);
  expect(icon).toMatch(/aria-hidden/);
  expect(icon).toMatch(/currentColor/);
});

test("T-UI-03 primitives provide focus rings, dialog semantics, and no global transitions", async () => {
  test.skip(!existsSync(file("web/styles/gaspar.css")), "T-UI-03 implementation has not landed");
  const css = await read("web/styles/gaspar.css");
  const modal = await read("web/component/modal/index.ts");
  expect(css).not.toMatch(/\*\s*\{[^}]*transition\s*:/s);
  expect(css).toMatch(/:focus-visible[\s\S]{0,240}outline[^;]*2px/i);
  expect(css).toContain("--gs-focus-ring");
  expect(modal).toContain('role", "dialog"');
  expect(modal).toContain('aria-modal", "true"');
  expect(css).toMatch(/--gs-z-popover:\s*500/);
  expect(css).toMatch(/--gs-z-topbar:\s*100/);
});

test("T-UI-04 stream video uses contain, themed stage, and no size transition", async ({ page, baseURL }) => {
  const cssPath = file("web/styles/gaspar.css");
  test.skip(!existsSync(cssPath), "T-UI-04 stream styles have not landed");
  const css = await read("web/styles/gaspar.css");
  test.skip(!css.includes("stream-stage"), "T-UI-04 stream stage styles have not landed");
  expect(css).toMatch(/\.video-stream[\s\S]{0,500}object-fit:\s*contain/i);
  expect(css).toContain("--gs-stage-bg");
  expect(css).not.toMatch(/\.stream-stage[^}]*transition\s*:/s);
  expect(css).not.toMatch(/\.video-stream[^}]*transition\s*:/s);

  await page.goto(`${baseURL}/web/stream.html`);
  await page.addStyleTag({ content: css });
  for (const viewport of [
    { width: 1920, height: 1080 }, { width: 1280, height: 1024 },
    { width: 800, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => {
      const stage = document.createElement("div");
      stage.className = "stream-stage";
      const frame = document.createElement("img");
      frame.className = "video-stream";
      frame.width = 1024;
      frame.height = 768;
      frame.src = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><rect width="1024" height="768" fill="#222"/><path stroke="#ff00ff" stroke-width="4" d="M2 2h1020v764H2z"/><path fill="#ff00ff" d="M0 0h24v24H0zm1000 0h24v24h-24zM0 744h24v24H0zm1000 744h24v24h-24z"/></svg>');
      stage.append(frame);
      document.body.append(stage);
      const s = stage.getBoundingClientRect(), f = frame.getBoundingClientRect();
      const result = { stage: { width: s.width, height: s.height }, frame: { width: f.width, height: f.height }, fit: getComputedStyle(frame).objectFit };
      stage.remove();
      return result;
    });
    expect(geometry.fit).toBe("contain");
    expect(geometry.frame.width).toBeLessThanOrEqual(geometry.stage.width + 1);
    expect(geometry.frame.height).toBeLessThanOrEqual(geometry.stage.height + 1);
  }
});

test("T-UI-05 game cards are named buttons with 3:4 covers, keyboard activation, fallback and empty retry", async () => {
  test.skip(!existsSync(file("web/styles/gaspar.css")), "T-UI-05 implementation has not landed");
  const game = await read("web/component/game/index.ts");
  const list = await read("web/component/game/list.ts");
  const css = await read("web/styles/gaspar.css");
  expect(game).toMatch(/aria-label/i);
  expect(game).toMatch(/createElement\("button"\)|document\.createElement\("button"\)/);
  expect(game).toMatch(/keydown|keyup|click/i);
  expect(css).toMatch(/aspect-ratio:\s*3\s*\/\s*4/);
  expect(css).toMatch(/prefers-reduced-motion/);
  expect(list).toMatch(/Reload|reload|forceFetch/);
});

test("T-UI-06 login exposes the required accessible password toggle and submit order", async () => {
  test.skip(!existsSync(file("web/styles/gaspar.css")), "T-UI-06 implementation has not landed");
  const login = await read("web/component/modal/login.ts");
  const form = await read("web/component/modal/form.ts");
  expect(login).toMatch(/aria-pressed/i);
  expect(login).toMatch(/aria-label/i);
  expect(login).toMatch(/type\s*=\s*["']password["']/i);
  expect(form).toMatch(/addEventListener\(["']keydown|type=["']submit|requestSubmit/i);
  expect(login).toMatch(/passwordFile|file/i);
});

test("T-UI-07 chrome has named theme control, mobile navigation, and accessible page language", async () => {
  test.skip(!existsSync(file("web/styles/gaspar.css")), "T-UI-07 implementation has not landed");
  const css = await read("web/styles/gaspar.css");
  const index = await read("web/index.ts");
  const admin = await read("web/admin.ts");
  expect(index).toMatch(/aria-label/i);
  expect(index).toMatch(/theme/i);
  expect(css).toMatch(/bottomnav|bottom-nav/i);
  expect(css).toMatch(/max-width:\s*767px|767px/);
  expect(admin).toMatch(/theme|topbar/i);
  for (const page of ["index.html", "admin.html", "stream.html"]) {
    const html = await read(`web/${page}`);
    expect(html).toContain('lang="');
    expect(html).toContain("gaspar.theme");
  }
});
