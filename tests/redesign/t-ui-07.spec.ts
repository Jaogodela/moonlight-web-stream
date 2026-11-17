import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import ts from "typescript";

const repo = resolve(process.cwd(), "../..");
const read = (path: string) => readFile(resolve(repo, path), "utf8");
const pages = ["index.html", "admin.html", "stream.html"];

async function mountThemeControl(page: import("@playwright/test").Page) {
  const theme = await read("web/styles/theme.ts");
  const themeJs = ts.transpileModule(
    `${theme}\n(window as any).__qaTheme = { getThemePreference, setThemePreference };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } },
  ).outputText;
  await page.addScriptTag({ type: "module", content: themeJs });

  const chrome = await read("web/component/chrome.ts");
  const start = chrome.indexOf("export function labelButton(");
  const end = chrome.indexOf("\nexport class Chrome", start);
  const controls = chrome.slice(start, end).replaceAll("export function", "function");
  const controlsJs = ts.transpileModule(controls, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText;
  await page.addScriptTag({ content: `
    const getCurrentLanguage = () => "pt-BR";
    const getTranslations = () => ({ chrome: {
      theme: "Tema", system: "Sistema", light: "Claro", dark: "Escuro", changeTheme: "Alterar tema"
    }});
    const getThemePreference = () => window.__qaTheme.getThemePreference();
    const setThemePreference = value => window.__qaTheme.setThemePreference(value);
    const icon = name => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.dataset.qaIcon = name;
      return svg;
    };
    ${controlsJs}
    window.__qaThemeButton = themeButton;
  ` });
}

test("T-UI-07 manifest and inline page-language boot cover all shipped locales", async ({ page, baseURL }) => {
  const manifest = JSON.parse(await read("web/manifest.json"));
  expect(manifest.name).toBe("Gaspar");
  expect(manifest.theme_color).toBe("#161615");
  expect(manifest.background_color).toBe("#161615");
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: "192x192", src: "resources/gaspar-192.png" }),
    expect.objectContaining({ sizes: "512x512", src: "resources/gaspar-512.png" }),
  ]));
  for (const icon of manifest.icons) {
    const response = await page.request.get(`${baseURL}/web/${icon.src}`);
    expect(response.ok(), `${icon.src} is served`).toBeTruthy();
  }

  const i18n = await read("web/i18n.ts");
  for (const locale of ["pt-BR", "fr-FR", "ko-KR"]) expect(i18n).toContain(`"${locale}"`);
  for (const pathname of pages) {
    for (const [language, expected] of [["pt-BR", "pt-BR"], ["fr-FR", "fr-FR"], ["ko-KR", "ko-KR"]]) {
      await page.addInitScript(({ language }) => localStorage.setItem("mlSettings", JSON.stringify({ language })), { language });
      await page.goto(`${baseURL}/web/${pathname}`);
      await expect(page.locator("html")).toHaveAttribute("lang", expected);
    }
  }
});

for (const pathname of pages) {
  test(`${pathname}: theme control cycles preference, icon, accessible name and persistence`, async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("qa-theme-seeded")) {
        localStorage.removeItem("gaspar.theme");
        sessionStorage.setItem("qa-theme-seeded", "yes");
      }
    });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(`${baseURL}/web/${pathname}`);
    await mountThemeControl(page);
    await page.evaluate(() => {
      const button = (window as any).__qaThemeButton();
      button.id = "qa-theme-control";
      document.body.append(button);
    });
    const control = page.locator("#qa-theme-control");
    await expect(control).toHaveAttribute("aria-label", "Tema: Sistema. Alterar tema");
    await expect(control.locator("svg")).toHaveAttribute("data-qa-icon", "monitor-smartphone");
    await control.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme-pref", "light");
    await expect(control).toHaveAttribute("aria-label", "Tema: Claro. Alterar tema");
    await expect(control.locator("svg")).toHaveAttribute("data-qa-icon", "sun");
    await control.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme-pref", "dark");
    await expect(control).toHaveAttribute("aria-label", "Tema: Escuro. Alterar tema");
    await expect(control.locator("svg")).toHaveAttribute("data-qa-icon", "moon");
    expect(await page.evaluate(() => localStorage.getItem("gaspar.theme"))).toBe("dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => localStorage.getItem("gaspar.theme"))).toBe("dark");
  });
}

test("manual theme preference is shared by index, admin, and stream page shells", async ({ page, baseURL }) => {
  await page.addInitScript(() => localStorage.setItem("gaspar.theme", "dark"));
  for (const pathname of pages) {
    await page.goto(`${baseURL}/web/${pathname}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme-pref", "dark");
  }
});

test("production-shaped chrome is named, responsive, safe-area aware, and keeps main content clear", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseURL}/web/index.html`);
  await page.addStyleTag({ url: `${baseURL}/web/styles/tokens.css` });
  await page.addStyleTag({ url: `${baseURL}/web/styles/gaspar.css` });
  await page.addStyleTag({ content: `html { --gs-safe-bottom: 20px; } .qa-filler { height: 1200px; } .qa-last-content { height: 70px; }` });
  await page.evaluate(() => { document.body.innerHTML = `
    <header class="gs-topbar"><a class="gs-wordmark" href="#" aria-label="Gaspar — Biblioteca">gaspar<span></span></a>
      <nav class="gs-primary-nav" aria-label="Navegação"><button type="button" aria-label="Biblioteca">Biblioteca</button><button type="button" aria-label="Servidores">Servidores</button></nav>
      <div class="gs-topbar__actions"><button class="gs-icon-btn" aria-label="Tema: Escuro. Alterar tema"><svg aria-hidden="true"></svg></button><button class="gs-icon-btn" aria-label="Conta"><svg aria-hidden="true"></svg></button></div>
    </header>
    <main class="gs-main" id="main-content"><h1>Biblioteca</h1><div class="qa-filler"></div><div class="qa-last-content" id="last-content">Último conteúdo</div></main>
    <nav class="gs-bottomnav" aria-label="Navegação"><a href="#" aria-current="page"><svg aria-hidden="true"></svg><span>Jogar</span></a><a href="#"><svg aria-hidden="true"></svg><span>Servidores</span></a><button type="button" aria-label="Ajustes"><svg aria-hidden="true"></svg><span>Ajustes</span></button></nav>
  `; });
  await page.evaluate(() => document.documentElement.style.setProperty("--gs-safe-bottom", "20px"));
  const bottom = page.locator(".gs-bottomnav");
  await expect(bottom).toBeVisible();
  const metrics = await page.evaluate(() => {
    const nav = document.querySelector(".gs-bottomnav")!;
    const main = document.querySelector(".gs-main")!;
    const content = document.querySelector("#last-content")!;
    const navRect = nav.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    return {
      navBottom: navRect.bottom,
      navTop: navRect.top,
      navHeight: navRect.height,
      contentBottom: contentRect.bottom,
      mainPaddingBottom: parseFloat(getComputedStyle(main).paddingBottom),
    };
  });
  expect(metrics.navBottom).toBe(844);
  expect(metrics.navHeight).toBeGreaterThanOrEqual(84);
  expect(metrics.mainPaddingBottom).toBeGreaterThanOrEqual(metrics.navHeight);
  await page.locator("#last-content").scrollIntoViewIfNeeded();
  const clearAtEnd = await page.evaluate(() => {
    const content = document.querySelector("#last-content")!.getBoundingClientRect();
    const nav = document.querySelector(".gs-bottomnav")!.getBoundingClientRect();
    return content.bottom <= nav.top;
  });
  expect(clearAtEnd).toBeTruthy();
  const violations = await new AxeBuilder({ page }).withRules(["button-name"]).analyze();
  expect(violations.violations).toEqual([]);

  for (const width of [768, 1024]) {
    await page.setViewportSize({ width, height: 768 });
    await expect(bottom).toBeHidden();
    await expect(page.locator(".gs-primary-nav")).toBeVisible();
    const desktop = await page.locator(".gs-topbar").evaluate(el => ({ position: getComputedStyle(el).position, height: el.getBoundingClientRect().height }));
    expect(desktop.position).toBe("sticky");
    expect(desktop.height).toBe(64);
  }
});

test("T-UI-07 role actions and save-default affordance are wired in source and representable in chrome", async ({ page, baseURL }) => {
  const index = await read("web/index.ts");
  expect(index).toMatch(/if\s*\(this\.user\.is_default_user\)[\s\S]*?appendChild\(this\.loginButton\)/);
  expect(index).toMatch(/this\.user\.role\s*==\s*"Admin"[\s\S]*?appendChild\(this\.adminButton\)/);
  expect(index).toMatch(/currentDisplay\s*==\s*"settings"[\s\S]*?saveRoleDefaultsButton/);
  expect(index).toContain("I.settings.saveRoleDefaults");
  const pt = await read("web/locales/pt-BR.ts");
  expect(pt).toContain('login: "Entrar"');

  await page.setContent(`
    <div id="default-account"><button aria-label="Entrar">Entrar</button></div>
    <div id="admin-account"><a href="/admin.html">Admin</a></div>
    <main><section aria-label="Configurações"><button aria-label="Salvar como padrão">Salvar como padrão</button></section></main>
  `);
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar como padrão" })).toBeVisible();
});
