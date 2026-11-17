import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import ts from "typescript";

const repo = resolve(process.cwd(), "../..");
const pages = ["index.html", "admin.html", "stream.html"];

for (const pathname of pages) {
  test(`${pathname}: system theme is applied before first animation frame`, async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("gaspar.theme");
      (window as any).__themeAtFirstFrame = "not-set";
      requestAnimationFrame(() => {
        (window as any).__themeAtFirstFrame = document.documentElement.dataset.theme || "not-set";
      });
    });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(`${baseURL}/web/${pathname}`);
    await page.waitForFunction(() => (window as any).__themeAtFirstFrame !== "not-set");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => (window as any).__themeAtFirstFrame)).toBe("light");
    expect(await page.evaluate(() => document.documentElement.dataset.themePref)).toBe("system");
  });

  test(`${pathname}: persisted dark and light preferences survive reload`, async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("qa-theme-seeded")) {
        localStorage.setItem("gaspar.theme", "dark");
        sessionStorage.setItem("qa-theme-seeded", "yes");
      }
    });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(`${baseURL}/web/${pathname}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.evaluate(() => localStorage.setItem("gaspar.theme", "light"));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => localStorage.getItem("gaspar.theme"))).toBe("light");
  });
}

test("T-UI-01 token source has expected surface colors and no pure black or blue backgrounds", async () => {
  const tokens = await readFile(resolve(repo, "web/styles/tokens.css"), "utf8");
  expect(tokens).toContain("--gs-bg:");
  expect(tokens).toMatch(/--gs-gray-950:\s*#161615/i);
  expect(tokens).toMatch(/--gs-gray-0:\s*#FFFFFF/i);
  expect(tokens).toMatch(/--gs-bg:\s*var\(--gs-gray-950\)/i);
  expect(tokens).toMatch(/\[data-theme="light"\][\s\S]*?--gs-bg:\s*var\(--gs-gray-0\)/i);
  for (const [, value] of tokens.matchAll(/--gs-[\w-]*(?:bg|surface)[\w-]*:\s*([^;]+);/gi)) {
    const color = value.trim().match(/#[\da-f]{3,8}/i)?.[0]?.toUpperCase();
    if (!color) continue;
    expect(["#000", "#000000"]).not.toContain(color);
    if (color.length === 7) {
      const r = parseInt(color.slice(1, 3), 16) / 255;
      const g = parseInt(color.slice(3, 5), 16) / 255;
      const b = parseInt(color.slice(5, 7), 16) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
      const saturation = max === 0 ? 0 : delta / max;
      let hue = 0;
      if (delta) {
        if (max === r) hue = 60 * (((g - b) / delta) % 6);
        else if (max === g) hue = 60 * ((b - r) / delta + 2);
        else hue = 60 * ((r - g) / delta + 4);
        if (hue < 0) hue += 360;
      }
      expect(hue >= 180 && hue <= 260 && saturation > 0.06, `${color} is a saturated blue background`).toBe(false);
    }
  }
});

test("computed --gs-bg follows dark/light tokens", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/web/index.html`);
  await page.addStyleTag({ url: `${baseURL}/web/styles/tokens.css` });
  await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--gs-bg").trim())).toBe("#161615");
  await page.evaluate(() => document.documentElement.dataset.theme = "light");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--gs-bg").trim())).toBe("#FFFFFF");
});

test("theme module applies manual preferences, system changes, and storage events", async ({ page, baseURL }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${baseURL}/web/index.html`);
  const source = await readFile(resolve(repo, "web/styles/theme.ts"), "utf8");
  const compiled = ts.transpileModule(`${source}\n(window as any).__qaTheme = { getThemePreference, setThemePreference };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText;
  await page.addScriptTag({ type: "module", content: compiled });
  await page.waitForFunction(() => Boolean((window as any).__qaTheme));

  await page.evaluate(() => (window as any).__qaTheme.setThemePreference("light"));
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => localStorage.getItem("gaspar.theme"))).toBe("light");
  await page.evaluate(() => (window as any).__qaTheme.setThemePreference("system"));
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.evaluate(() => {
    localStorage.setItem("gaspar.theme", "dark");
    window.dispatchEvent(new StorageEvent("storage", { key: "gaspar.theme", newValue: "dark", storageArea: localStorage }));
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.locator("html").getAttribute("data-theme-pref")).toBe("dark");
});

test("theme module exposes persisted system/light/dark preference and cross-tab sync", async () => {
  const theme = await readFile(resolve(repo, "web/styles/theme.ts"), "utf8");
  expect(theme).toContain('"system" | "light" | "dark"');
  expect(theme).toContain('localStorage.setItem(storageKey, value)');
  expect(theme).toContain('lightScheme.addEventListener("change"');
  expect(theme).toContain('window.addEventListener("storage"');
  expect(theme).toContain('new CustomEvent("gs-themechange"');
});

test("theme tokens produce no axe violations on the source page shell", async ({ page, baseURL }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${baseURL}/web/index.html`);
  await page.addStyleTag({ url: `${baseURL}/web/styles/tokens.css` });
  const dark = await new AxeBuilder({ page }).withRules(["color-contrast", "button-name"]).analyze();
  expect(dark.violations).toEqual([]);
  await page.evaluate(() => document.documentElement.dataset.theme = "light");
  const light = await new AxeBuilder({ page }).withRules(["color-contrast", "button-name"]).analyze();
  expect(light.violations).toEqual([]);
});
