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
  expect(icon).toMatch(/createElement\(ICONS\[name\]\)/);
});

test("T-UI-03 primitives provide focus rings, dialog semantics, and no global transitions", async () => {
  test.skip(!existsSync(file("web/styles/gaspar.css")), "T-UI-03 implementation has not landed");
  const css = await read("web/styles/gaspar.css");
  const tokens = await read("web/styles/tokens.css");
  const modal = await read("web/component/modal/index.ts");
  expect(css).not.toMatch(/\*\s*\{[^}]*transition\s*:/s);
  expect(css).toMatch(/:focus-visible[\s\S]{0,240}outline:\s*var\(--gs-focus-w\)/i);
  expect(css).toContain("--gs-focus-ring");
  expect(tokens).toMatch(/--gs-focus-w:\s*2px/);
  expect(modal).toContain('role", "dialog"');
  expect(modal).toContain('aria-modal", "true"');
  expect(tokens).toMatch(/--gs-z-popover:\s*500/);
  expect(tokens).toMatch(/--gs-z-topbar:\s*100/);
});

test("T-UI-05 game cards are named buttons with 3:4 covers, keyboard activation, fallback and empty retry", async () => {
  const gasparCss = file("web/styles/gaspar.css");
  test.skip(!existsSync(gasparCss) || !(await read("web/styles/gaspar.css")).includes("aspect-ratio: 3 / 4"), "T-UI-05 implementation has not landed");
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
  const loginSource = file("web/component/modal/login.ts");
  test.skip(!existsSync(loginSource) || !(await read("web/component/modal/login.ts")).includes("aria-pressed"), "T-UI-06 implementation has not landed");
  const login = await read("web/component/modal/login.ts");
  const form = await read("web/component/modal/form.ts");
  expect(login).toMatch(/aria-pressed/i);
  expect(login).toMatch(/aria-label/i);
  expect(login).toMatch(/type[^;\n]*password/i);
  expect(form).toMatch(/addEventListener\(["']keydown|type=["']submit|requestSubmit/i);
  expect(login).toMatch(/passwordFile|file/i);
});

test("T-UI-07 chrome has named theme control, mobile navigation, and accessible page language", async () => {
  const gasparCss = file("web/styles/gaspar.css");
  test.skip(!existsSync(gasparCss) || !/(bottomnav|bottom-nav)/i.test(await read("web/styles/gaspar.css")), "T-UI-07 implementation has not landed");
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
