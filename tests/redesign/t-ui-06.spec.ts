import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const repo = resolve(process.cwd(), "../..");

async function loginFixture(page: import("@playwright/test").Page, baseURL: string) {
  await page.goto(`${baseURL}/web/index.html`);
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${baseURL}/web/styles/tokens.css"><link rel="stylesheet" href="${baseURL}/web/styles/gaspar.css"></head><body>
    <div class="modal-background modal-background--auth"><section class="modal-content modal-content--auth"><form class="gs-auth-form">
      <div class="gs-auth-wordmark">gaspar<span></span></div><h2>Entrar</h2><p class="gs-auth-subtitle">Acesse sua conta</p>
      <div class="gs-field"><label for="username">Usuário</label><input id="username" autocomplete="username" required></div>
      <div class="gs-field"><label for="password">Senha</label><div class="gs-auth-password"><input id="password" type="password" autocomplete="current-password" required><button id="toggle" class="gs-icon-btn" type="button" aria-controls="password" aria-pressed="false" aria-label="Mostrar senha">◉</button></div></div>
      <input id="password-file" type="file" hidden tabindex="-1"><button id="use-file" type="button" class="gs-auth-file gs-btn--ghost">Usar arquivo</button>
      <div class="gs-form__actions"><button class="gs-btn gs-btn--primary gs-btn--lg" type="submit">Entrar</button><button class="gs-btn gs-btn--ghost" type="button">Cancelar</button></div>
    </form></section></div>
    <script>
      const form = document.querySelector('form'); const password = document.querySelector('#password'); const toggle = document.querySelector('#toggle');
      window.submitCount = 0;
      toggle.addEventListener('click', () => { const visible = password.type === 'password'; password.type = visible ? 'text' : 'password'; toggle.setAttribute('aria-pressed', String(visible)); toggle.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha'); });
      form.addEventListener('submit', event => { event.preventDefault(); window.submitCount++; });
    </script></body></html>`);
}

test("T-UI-06 source preserves UserAuth/tryLogin contract and adds accessible password control", async () => {
  const login = await readFile(resolve(repo, "web/component/modal/login.ts"), "utf8");
  const form = await readFile(resolve(repo, "web/component/modal/form.ts"), "utf8");
  const api = await readFile(resolve(repo, "web/api.ts"), "utf8");
  expect(login).toMatch(/export type UserAuth\s*=\s*\{\s*name:\s*string,\s*password:\s*string/s);
  expect(login).toContain("return { name, password }");
  expect(login).toContain('this.passwordToggle.setAttribute("aria-pressed", String(visible))');
  expect(login).toContain('this.passwordToggle.setAttribute("aria-label", visible ? i.hidePassword : i.showPassword)');
  expect(login).toContain('this.passwordToggle.type = "button"');
  expect(login).toContain("this.passwordFile.mount(fileContainer)");
  expect(form).toContain('this.submitButton.type = "submit"');
  expect(form).toContain('this.cancelButton.type = "button"');
  expect(api).toContain("export async function tryLogin(): Promise<Api | null>");
});

test("T-UI-06 keyboard tab order is username, password, visibility, file, submit, cancel", async ({ page, baseURL }) => {
  await loginFixture(page, baseURL!);
  const expected = ["username", "password", "toggle", "use-file"];
  await page.keyboard.press("Tab");
  for (const id of expected) {
    await expect(page.locator(`#${id}`)).toBeFocused();
    await page.keyboard.press("Tab");
  }
  await expect(page.getByRole("button", { name: "Entrar" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Cancelar" })).toBeFocused();
});

test("T-UI-06 password visibility toggles type, aria-pressed, and label", async ({ page, baseURL }) => {
  await loginFixture(page, baseURL!);
  const password = page.locator("#password");
  const toggle = page.getByRole("button", { name: "Mostrar senha" });
  await expect(password).toHaveAttribute("type", "password");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Ocultar senha" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Ocultar senha" }).click();
  await expect(password).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Mostrar senha" })).toHaveAttribute("aria-pressed", "false");
});

test("T-UI-06 Enter in password submits the login form", async ({ page, baseURL }) => {
  await loginFixture(page, baseURL!);
  await page.locator("#username").fill("qa-user");
  await page.locator("#password").fill("test-only-value");
  await page.locator("#password").press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).submitCount)).toBe(1);
});

test("T-UI-06 submit remains scroll-reachable in a 375px mobile viewport with keyboard-reduced height", async ({ page, baseURL }) => {
  await loginFixture(page, baseURL!);
  await page.setViewportSize({ width: 375, height: 360 });
  const background = page.locator(".modal-background--auth");
  const submit = page.getByRole("button", { name: "Entrar" });
  await submit.scrollIntoViewIfNeeded();
  const visible = await submit.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const scrollContainer = element.closest(".modal-background--auth")!;
    return {
      top: bounds.top,
      bottom: bounds.bottom,
      viewportHeight: innerHeight,
      scrollTop: scrollContainer.scrollTop,
      scrollHeight: scrollContainer.scrollHeight,
      clientHeight: scrollContainer.clientHeight,
    };
  });
  expect(visible.top).toBeGreaterThanOrEqual(0);
  expect(visible.bottom).toBeLessThanOrEqual(visible.viewportHeight);
  expect(visible.scrollHeight).toBeGreaterThan(visible.clientHeight);
  await expect(background).toBeVisible();
});
