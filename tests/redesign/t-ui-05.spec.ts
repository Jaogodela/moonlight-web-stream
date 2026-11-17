import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const repo = resolve(process.cwd(), "../..");

async function libraryFixture(page: import("@playwright/test").Page, baseURL: string) {
  await page.goto(`${baseURL}/web/index.html`);
  await page.setContent(`<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${baseURL}/web/styles/tokens.css"><link rel="stylesheet" href="${baseURL}/web/styles/gaspar.css"></head><body><main class="library"><h1>Biblioteca</h1><ul class="app-list gs-grid--games" aria-label="Biblioteca de jogos"></ul></main><script>
    const games = document.querySelector('.gs-grid--games');
    window.started = [];
    window.reloads = 0;
    function addGame(title, active = false, broken = false) {
      const li = document.createElement('li'); li.className = 'animated-list-element app-element list-show';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'app gs-game' + (active ? ' app-active' : ' app-inactive');
      button.setAttribute('aria-label', active ? 'Em execução: ' + title : 'Jogar ' + title);
      button.addEventListener('click', () => window.started.push(title));
      const cover = document.createElement('span'); cover.className = 'gs-game__cover' + (broken ? ' gs-game__cover--fallback' : '');
      const img = document.createElement('img'); img.className = 'app-image'; img.alt = ''; img.src = broken ? '/mock-cover.jpg' : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="400"/%3E';
      const fallback = document.createElement('span'); fallback.className = 'gs-game__fallback'; fallback.hidden = !broken; fallback.setAttribute('aria-hidden', 'true'); fallback.innerHTML = '<svg class="gs-icon" aria-hidden="true"><path d="M1 1"/></svg><span>AS</span>';
      if (broken) { img.addEventListener('error', () => { img.hidden = true; img.removeAttribute('src'); fallback.hidden = false; }); }
      const badge = document.createElement('span'); badge.className = 'gs-game__badge'; badge.textContent = active ? 'Em execução' : ''; badge.hidden = !active;
      const play = document.createElement('span'); play.className = 'gs-game__play'; play.setAttribute('aria-hidden', 'true');
      const label = document.createElement('p'); label.className = 'gs-game__title'; label.textContent = title;
      cover.append(img, fallback, badge, play); button.append(cover, label); li.append(button); games.append(li);
      return button;
    }
    window.addGame = addGame;
    window.showEmpty = () => {
      games.replaceChildren(); const row = document.createElement('li'); row.className = 'gs-empty'; row.setAttribute('role', 'status');
      const title = document.createElement('h2'); title.textContent = 'Nenhum jogo encontrado';
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'gs-btn gs-btn--secondary'; retry.textContent = 'Recarregar'; retry.addEventListener('click', () => { window.reloads++; });
      row.append(title, retry); games.append(row);
    };
    addGame('Aventura Solar', true); addGame('Astro Saga');
  </script></body></html>`);
  await page.addStyleTag({ content: `.library { box-sizing: border-box; width: 100%; padding: 24px var(--gs-gutter); } .app-list { margin: 0; padding: 0; list-style: none; } .gs-game { cursor: pointer; } .gs-game__fallback[hidden], .gs-game__badge[hidden] { display: none; }` });
}

test("T-UI-05 source implements accessible button cards and image fallback", async () => {
  const game = await readFile(resolve(repo, "web/component/game/index.ts"), "utf8");
  const list = await readFile(resolve(repo, "web/component/game/list.ts"), "utf8");
  expect(game).toContain('document.createElement("button")');
  expect(game).toContain('this.divElement.type = "button"');
  expect(game).toContain('this.divElement.setAttribute("aria-label", this.isActive() ? i.runningLabel(cache.title) : i.playLabel(cache.title))');
  expect(game).toContain('this.divElement.addEventListener("click", this.onClick.bind(this))');
  expect(game).toContain('private showFallback()');
  expect(game).toContain('this.imageElement.removeAttribute("src")');
  expect(game).toContain('icon("gamepad-2", { size: 32 })');
  expect(game).toContain('this.initialsElement.textContent = cache.title.trim()');
  expect(list).toContain('retry.addEventListener("click", () => { void this.forceFetch() })');
  expect(list).toContain('className = `gs-empty${this.failed ? " gs-empty--error" : ""}`');
});

test("T-UI-05 grid meets cover counts and 3:4 image geometry at target widths", async ({ page, baseURL }) => {
  await libraryFixture(page, baseURL!);
  for (const [width, minColumns] of [[360, 2], [768, 4], [1440, 6]]) {
    await page.setViewportSize({ width, height: 900 });
    const grid = await page.locator(".gs-grid--games").evaluate((element) => {
      const buttons = [...element.querySelectorAll<HTMLElement>(".gs-game")];
      const cover = buttons[0].querySelector<HTMLElement>(".gs-game__cover")!;
      const image = cover.querySelector<HTMLImageElement>("img")!;
      const rect = cover.getBoundingClientRect();
      return {
        columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
        ratio: rect.width / rect.height,
        aspectRatio: getComputedStyle(cover).aspectRatio,
        objectFit: getComputedStyle(image).objectFit,
        labels: buttons.map(button => button.getAttribute("aria-label")),
      };
    });
    expect(grid.columns).toBeGreaterThanOrEqual(minColumns);
    expect(grid.ratio).toBeCloseTo(0.75, 2);
    expect(grid.aspectRatio).toBe("3 / 4");
    expect(grid.objectFit).toBe("cover");
    expect(grid.labels[0]).toContain("Aventura Solar");
    expect(grid.labels[1]).toContain("Astro Saga");
  }
});

test("T-UI-05 Enter and Space activate the same game-card click flow", async ({ page, baseURL }) => {
  await libraryFixture(page, baseURL!);
  const cards = page.getByRole("button", { name: "Jogar Astro Saga" });
  await cards.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).started)).toEqual(["Astro Saga"]);
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => (window as any).started)).toEqual(["Astro Saga", "Astro Saga"]);
});

test("T-UI-05 failed cover request shows icon and initials without a broken image", async ({ page, baseURL }) => {
  await libraryFixture(page, baseURL!);
  await page.route("**/mock-cover.jpg", route => route.abort());
  await page.evaluate(() => (window as any).addGame("Amber Skies", false, true));
  const card = page.getByRole("button", { name: "Jogar Amber Skies" });
  await expect(card.locator(".gs-game__fallback")).toBeVisible();
  await expect(card.locator(".gs-game__fallback .gs-icon")).toBeAttached();
  await expect(card.locator(".gs-game__fallback > span")).toHaveText("AS");
  await expect(card.locator("img")).toBeHidden();
  await expect(card.locator("img")).not.toHaveAttribute("src", /mock-cover/);
});

test("T-UI-05 empty state Reload works", async ({ page, baseURL }) => {
  await libraryFixture(page, baseURL!);
  await page.evaluate(() => (window as any).showEmpty());
  await expect(page.getByRole("status").getByRole("heading", { name: "Nenhum jogo encontrado" })).toBeVisible();
  await page.getByRole("button", { name: "Recarregar" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).reloads)).toBe(1);
});

test("T-UI-05 active badge and inactive-card opacity recover on keyboard focus", async ({ page, baseURL }) => {
  await libraryFixture(page, baseURL!);
  await expect(page.getByRole("button", { name: "Em execução: Aventura Solar" }).locator(".gs-game__badge")).toHaveText("Em execução");
  const other = page.getByRole("button", { name: "Jogar Astro Saga" });
  expect(await other.evaluate(element => getComputedStyle(element).opacity)).toBe("0.55");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(other).toBeFocused();
  await expect(other).toHaveCSS("opacity", "1");
});

test("T-UI-05 reduced motion removes hover translation and shimmer", async ({ page, baseURL }) => {
  await libraryFixture(page, baseURL!);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const card = page.getByRole("button", { name: "Jogar Astro Saga" });
  await card.hover();
  const motion = await card.locator(".gs-game__cover").evaluate(element => ({
    transform: getComputedStyle(element).transform,
  }));
  expect(motion.transform).toBe("none");
  const shimmer = await page.evaluate(() => {
    const skeleton = document.createElement("span"); skeleton.className = "gs-skeleton"; document.body.append(skeleton);
    const style = getComputedStyle(skeleton);
    const result = { animation: style.animationName, duration: style.animationDuration };
    skeleton.remove(); return result;
  });
  expect(shimmer.animation).toBe("none");
  expect(shimmer.duration).toBe("0s");
});
