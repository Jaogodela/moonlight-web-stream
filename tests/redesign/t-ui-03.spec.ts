import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import ts from "typescript";

const repo = resolve(process.cwd(), "../..");

test("T-UI-03 focus ring and popover stacking resolve from the design tokens", async ({ page, baseURL }) => {
  const css = await readFile(resolve(repo, "web/styles/gaspar.css"), "utf8");
  const tokens = await readFile(resolve(repo, "web/styles/tokens.css"), "utf8");
  expect(css).not.toMatch(/\*\s*\{[^}]*transition\s*:/s);
  expect(tokens).toMatch(/--gs-z-popover:\s*500/);
  expect(tokens).toMatch(/--gs-z-topbar:\s*100/);

  await page.goto(`${baseURL}/web/index.html`);
  await page.setContent(`<button id="focus-target">Focus</button><div class="context-menu-background" id="menu"></div><div id="bar" style="position:fixed;z-index:var(--gs-z-topbar)"></div>`);
  await page.addStyleTag({ url: `${baseURL}/web/styles/tokens.css` });
  await page.addStyleTag({ url: `${baseURL}/web/styles/gaspar.css` });
  await page.locator("#focus-target").focus();
  const styles = await page.evaluate(() => ({
    focusWidth: getComputedStyle(document.querySelector("button")!).outlineWidth,
    focusStyle: getComputedStyle(document.querySelector("button")!).outlineStyle,
    popoverZ: getComputedStyle(document.querySelector("#menu")!).zIndex,
    topbarZ: getComputedStyle(document.querySelector("#bar")!).zIndex,
  }));
  expect(styles).toEqual({ focusWidth: "2px", focusStyle: "solid", popoverZ: "500", topbarZ: "100" });
});

test("T-UI-03 dialog receives focus, traps Tab, and restores trigger focus", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/web/index.html`);
  await page.addStyleTag({ url: `${baseURL}/web/styles/tokens.css` });
  await page.addStyleTag({ url: `${baseURL}/web/styles/gaspar.css` });
  const source = await readFile(resolve(repo, "web/component/modal/index.ts"), "utf8");
  const modalLogic = source.slice(0, source.indexOf("/// --- Helper Modals"))
    .replace(/^import .*$/gm, "")
    + `\nconst showNotification = () => {};\nconst getCurrentLanguage = () => "en";\nconst getTranslations = () => ({ common: { missingModalParent: "", missingModalOverlay: "" }, modal: { ok: "OK" } });\n(window as any).__showModal = showModal;`;
  const script = ts.transpileModule(modalLogic, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  await page.addScriptTag({ type: "module", content: script });
  await page.evaluate(() => {
    const trigger = document.createElement("button");
    trigger.id = "dialog-trigger";
    trigger.textContent = "Open";
    document.body.append(trigger);
    trigger.focus();
    const modal = {
      mount(parent: Element) { parent.innerHTML = "<h2>Settings</h2><input id='first'><button id='last'>Close</button>"; },
      unmount(parent: Element) { parent.replaceChildren(); },
      onFinish(signal: AbortSignal) { return new Promise(resolve => signal.addEventListener("abort", () => resolve(null), { once: true })); },
    };
    (window as any).__dialogPromise = (window as any).__showModal(modal);
  });
  await expect(page.locator("#modal-parent")).toHaveAttribute("role", "dialog");
  await expect(page.locator("#modal-parent")).toHaveAttribute("aria-modal", "true");
  await expect(page.locator("#modal-parent")).toHaveAttribute("aria-labelledby", "gs-dialog-title");
  await expect(page.locator("#first")).toBeFocused();
  await page.locator("#last").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#first")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#last")).toBeFocused();
  await page.locator("#dialog-trigger").focus();
  await expect(page.locator("#first")).toBeFocused();
  await page.evaluate(() => (window as any).__showModal(null));
  await expect(page.locator("#dialog-trigger")).toBeFocused();
  await expect(page.locator("#modal-overlay")).toHaveClass(/modal-disabled/);
});
